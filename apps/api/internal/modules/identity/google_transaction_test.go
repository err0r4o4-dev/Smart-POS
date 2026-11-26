package identity

import (
	"context"
	"errors"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgproto3"
	"github.com/jackc/pgx/v5/pgxpool"
)

func googleTestPool(test *testing.T, passwordHash string, failSession bool, expired bool, existingEmail bool, attempts ...string) (*pgxpool.Pool, chan string) {
	test.Helper()
	configuration, err := pgxpool.ParseConfig("postgres://localhost/test?sslmode=disable")
	if err != nil {
		test.Fatal(err)
	}
	configuration.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	queries := make(chan string, 32)
	configuration.ConnConfig.DialFunc = func(context.Context, string, string) (net.Conn, error) {
		client, server := net.Pipe()
		go func() {
			defer server.Close()
			backend := pgproto3.NewBackend(server, server)
			if _, err := backend.ReceiveStartupMessage(); err != nil {
				return
			}
			backend.Send(&pgproto3.AuthenticationOk{})
			backend.Send(&pgproto3.ParameterStatus{Name: "standard_conforming_strings", Value: "on"})
			backend.Send(&pgproto3.ParameterStatus{Name: "client_encoding", Value: "UTF8"})
			backend.Send(&pgproto3.ReadyForQuery{TxStatus: 'I'})
			if backend.Flush() != nil {
				return
			}
			status := byte('I')
			consumed := false
			for {
				message, err := backend.Receive()
				if err != nil {
					return
				}
				query, ok := message.(*pgproto3.Query)
				if !ok {
					return
				}
				sql := strings.ToUpper(query.String)
				queries <- sql
				if strings.HasPrefix(sql, "BEGIN") {
					status = 'T'
				}
				if strings.HasPrefix(sql, "COMMIT") || strings.HasPrefix(sql, "ROLLBACK") {
					status = 'I'
				}
				var columns []pgproto3.FieldDescription
				var values [][]byte
				if strings.HasPrefix(sql, "INSERT INTO AUTH_RATE_LIMITS") {
					columns = []pgproto3.FieldDescription{{Name: []byte("attempts"), DataTypeOID: 23, DataTypeSize: 4}}
					count := "1"
					if len(attempts) > 0 {
						count = attempts[0]
					}
					values = [][]byte{[]byte(count)}
				} else if strings.HasPrefix(sql, "UPDATE AUTH_GOOGLE_FLOWS SET CONSUMED_AT") {
					columns = []pgproto3.FieldDescription{{Name: []byte("pkce_verifier"), DataTypeOID: 25, DataTypeSize: -1}, {Name: []byte("nonce_hash"), DataTypeOID: 17, DataTypeSize: -1}, {Name: []byte("return_to"), DataTypeOID: 25, DataTypeSize: -1}}
					if !consumed && !expired {
						values = [][]byte{[]byte(strings.Repeat("a", 43)), []byte(`\x` + strings.Repeat("00", 32)), []byte("/setup")}
						consumed = true
					}
				} else if strings.HasPrefix(sql, "SELECT TRUE FROM AUTH_GOOGLE_FLOWS") {
					columns = []pgproto3.FieldDescription{{Name: []byte("valid"), DataTypeOID: 16, DataTypeSize: 1}}
					if !expired {
						values = [][]byte{[]byte("t")}
					}
				} else if strings.HasPrefix(sql, "SELECT U.ID,U.EMAIL") {
					for _, name := range []string{"id", "email", "display_name", "status"} {
						columns = append(columns, pgproto3.FieldDescription{Name: []byte(name), DataTypeOID: 25, DataTypeSize: -1})
					}
					columns = append(columns, pgproto3.FieldDescription{Name: []byte("verified"), DataTypeOID: 16, DataTypeSize: 1})
				} else if strings.HasPrefix(sql, "SELECT ID FROM USERS") {
					columns = []pgproto3.FieldDescription{{Name: []byte("id"), DataTypeOID: 25, DataTypeSize: -1}}
					if existingEmail {
						values = [][]byte{[]byte("00000000-0000-4000-8000-000000000001")}
					}
				} else if strings.HasPrefix(sql, "INSERT INTO USERS(") {
					for _, name := range []string{"id", "email", "display_name", "status"} {
						columns = append(columns, pgproto3.FieldDescription{Name: []byte(name), DataTypeOID: 25, DataTypeSize: -1})
					}
					columns = append(columns, pgproto3.FieldDescription{Name: []byte("verified"), DataTypeOID: 16, DataTypeSize: 1})
					values = [][]byte{[]byte("00000000-0000-4000-8000-000000000001"), []byte("person@example.test"), []byte("person"), []byte("ACTIVE"), []byte("t")}
				} else if strings.HasPrefix(sql, "SELECT PENDING_SUBJECT") {
					columns = []pgproto3.FieldDescription{{Name: []byte("pending_subject"), DataTypeOID: 25, DataTypeSize: -1}, {Name: []byte("pending_email"), DataTypeOID: 25, DataTypeSize: -1}}
					if !expired {
						values = [][]byte{[]byte("subject-123"), []byte("person@example.test")}
					}
				} else if strings.HasPrefix(sql, "SELECT ID,EMAIL,DISPLAY_NAME,STATUS,PASSWORD_HASH") {
					for _, name := range []string{"id", "email", "display_name", "status", "password_hash"} {
						columns = append(columns, pgproto3.FieldDescription{Name: []byte(name), DataTypeOID: 25, DataTypeSize: -1})
					}
					columns = append(columns, pgproto3.FieldDescription{Name: []byte("verified"), DataTypeOID: 16, DataTypeSize: 1})
					values = [][]byte{[]byte("00000000-0000-4000-8000-000000000001"), []byte("person@example.test"), []byte("Person"), []byte("ACTIVE"), []byte(passwordHash), []byte("t")}
				}
				if len(columns) > 0 {
					backend.Send(&pgproto3.RowDescription{Fields: columns})
					if values != nil {
						backend.Send(&pgproto3.DataRow{Values: values})
					}
				}
				if failSession && strings.HasPrefix(sql, "INSERT INTO AUTH_SESSIONS") {
					status = 'E'
					backend.Send(&pgproto3.ErrorResponse{Severity: "ERROR", Code: "23514", Message: "synthetic failure"})
				} else {
					backend.Send(&pgproto3.CommandComplete{CommandTag: []byte("SELECT 1")})
				}
				backend.Send(&pgproto3.ReadyForQuery{TxStatus: status})
				if backend.Flush() != nil {
					return
				}
			}
		}()
		return client, nil
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), configuration)
	if err != nil {
		test.Fatal(err)
	}
	return pool, queries
}

func TestGoogleLinkTransaction(test *testing.T) {
	hash, err := HashPassword("correct-password-123")
	if err != nil {
		test.Fatal(err)
	}
	for _, scenario := range []struct {
		name, password                                string
		expired, failSession, wantSuccess, wantCommit bool
	}{
		{"successful link", "correct-password-123", false, false, true, true},
		{"bad password", "incorrect-password", false, false, false, true},
		{"expired proof", "correct-password-123", true, false, false, false},
		{"session failure rolls back link", "correct-password-123", false, true, false, false},
	} {
		test.Run(scenario.name, func(test *testing.T) {
			pool, queries := googleTestPool(test, hash, scenario.failSession, scenario.expired, false)
			defer pool.Close()
			google := &GoogleAuth{service: &Service{Pool: pool, SessionTTL: time.Hour, DummyHash: hash}}
			cookie, _, err := RandomToken()
			if err != nil {
				test.Fatal(err)
			}
			profile, token, csrf, err := google.link(context.Background(), cookie, "person@example.test", scenario.password)
			if (err == nil) != scenario.wantSuccess {
				test.Fatalf("success=%v err=%v", scenario.wantSuccess, err)
			}
			if scenario.wantSuccess && (profile.Email != "person@example.test" || token == "" || csrf == "") {
				test.Fatal("missing login result")
			}
			if scenario.expired && !errors.Is(err, ErrInvalidToken) {
				test.Fatalf("expired proof: %v", err)
			}
			var observed []string
			for len(queries) > 0 {
				observed = append(observed, <-queries)
			}
			joined := strings.Join(observed, "\n")
			if strings.Contains(joined, "COMMIT") != scenario.wantCommit {
				test.Fatalf("unexpected commit: %v", observed)
			}
			if scenario.password != "correct-password-123" && strings.Contains(joined, "INSERT INTO AUTH_EXTERNAL_IDENTITIES") {
				test.Fatal("linked without valid password")
			}
			if scenario.failSession && (!strings.Contains(joined, "INSERT INTO AUTH_EXTERNAL_IDENTITIES") || !strings.Contains(joined, "ROLLBACK")) {
				test.Fatalf("link failure did not roll back: %v", observed)
			}
		})
	}
}

func TestGoogleFlowCanBeConsumedOnlyOnce(test *testing.T) {
	pool, queries := googleTestPool(test, "", false, false, false)
	defer pool.Close()
	google := &GoogleAuth{service: &Service{Pool: pool}}
	cookie, _, err := RandomToken()
	if err != nil {
		test.Fatal(err)
	}
	state, _, err := RandomToken()
	if err != nil {
		test.Fatal(err)
	}
	flow, err := google.consume(context.Background(), cookie, state)
	if err != nil || flow.returnTo != "/setup" || len(flow.nonceHash) != 32 {
		test.Fatalf("first consume failed: %v", err)
	}
	if _, err = google.consume(context.Background(), cookie, state); !errors.Is(err, ErrInvalidToken) {
		test.Fatalf("replayed flow accepted: %v", err)
	}
	query := <-queries
	if !strings.Contains(query, "CONSUMED_AT IS NULL") || !strings.Contains(query, "EXPIRES_AT>NOW()") || !strings.Contains(query, "STATE_HASH=") {
		test.Fatal("consume query lacks state, replay, or expiry guard")
	}
}

func TestGoogleSignupDoesNotLinkExistingEmail(test *testing.T) {
	for _, scenario := range []struct {
		name                   string
		existingEmail, pending bool
	}{{"new account", false, false}, {"existing email", true, true}} {
		test.Run(scenario.name, func(test *testing.T) {
			pool, queries := googleTestPool(test, "", false, false, scenario.existingEmail)
			defer pool.Close()
			google := &GoogleAuth{service: &Service{Pool: pool, SessionTTL: time.Hour}}
			cookie, _, err := RandomToken()
			if err != nil {
				test.Fatal(err)
			}
			token, pending, err := google.complete(context.Background(), cookie, googleIdentity{subject: "subject-123", email: "person@example.test"})
			if err != nil || pending != scenario.pending || (token != "") == scenario.pending {
				test.Fatalf("pending=%v token present=%v err=%v", pending, token != "", err)
			}
			var observed []string
			for len(queries) > 0 {
				observed = append(observed, <-queries)
			}
			joined := strings.Join(observed, "\n")
			if scenario.existingEmail && (strings.Contains(joined, "INSERT INTO AUTH_EXTERNAL_IDENTITIES") || strings.Contains(joined, "INSERT INTO AUTH_SESSIONS") || !strings.Contains(joined, "SET PENDING_SUBJECT")) {
				test.Fatalf("existing email was linked or signed in: %v", observed)
			}
			if !scenario.existingEmail && (!strings.Contains(joined, "INSERT INTO AUTH_EXTERNAL_IDENTITIES") || !strings.Contains(joined, "INSERT INTO AUTH_SESSIONS") || !strings.Contains(joined, "'REGISTER'") || !strings.Contains(joined, "COMMIT")) {
				test.Fatalf("signup transaction incomplete: %v", observed)
			}
		})
	}
}
