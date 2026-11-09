package identity

import (
	"context"
	"errors"
	"net"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgproto3"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestLoginRevalidatesCredentialsBeforeCreatingSession(t *testing.T) {
	password := "A-long-test-password-123!"
	passwordHash, err := HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	for _, scenario := range []struct {
		name              string
		credentialsChange bool
	}{
		{name: "unchanged credentials"},
		{name: "password reset after initial lookup", credentialsChange: true},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			var credentialsLocked atomic.Bool
			var sessionInserted atomic.Bool
			var committed atomic.Bool
			config, err := pgxpool.ParseConfig("postgres://localhost/test?sslmode=disable")
			if err != nil {
				t.Fatal(err)
			}
			config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
			config.ConnConfig.DialFunc = func(context.Context, string, string) (net.Conn, error) {
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
						switch {
						case strings.HasPrefix(sql, "BEGIN"):
							status = 'T'
							backend.Send(&pgproto3.CommandComplete{CommandTag: []byte("BEGIN")})
						case strings.HasPrefix(sql, "SELECT ID,EMAIL,DISPLAY_NAME,STATUS,PASSWORD_HASH"):
							fields := []pgproto3.FieldDescription{}
							for _, name := range []string{"id", "email", "display_name", "status", "password_hash"} {
								fields = append(fields, pgproto3.FieldDescription{Name: []byte(name), DataTypeOID: 25, DataTypeSize: -1, TypeModifier: -1})
							}
							fields = append(fields, pgproto3.FieldDescription{Name: []byte("email_verified"), DataTypeOID: 16, DataTypeSize: 1, TypeModifier: -1})
							backend.Send(&pgproto3.RowDescription{Fields: fields})
							backend.Send(&pgproto3.DataRow{Values: [][]byte{[]byte("test-user"), []byte("person@example.test"), []byte("Person"), []byte("ACTIVE"), []byte(passwordHash), []byte("t")}})
							backend.Send(&pgproto3.CommandComplete{CommandTag: []byte("SELECT 1")})
						case strings.HasPrefix(sql, "SELECT ID FROM USERS"):
							validLock := status == 'T' && strings.Contains(sql, "FOR UPDATE") && strings.Contains(sql, "PASSWORD_HASH=") && strings.Contains(query.String, passwordHash) && strings.Contains(sql, "STATUS='ACTIVE'")
							credentialsLocked.Store(validLock)
							backend.Send(&pgproto3.RowDescription{Fields: []pgproto3.FieldDescription{{Name: []byte("id"), DataTypeOID: 25, DataTypeSize: -1, TypeModifier: -1}}})
							if !scenario.credentialsChange && validLock {
								backend.Send(&pgproto3.DataRow{Values: [][]byte{[]byte("test-user")}})
								backend.Send(&pgproto3.CommandComplete{CommandTag: []byte("SELECT 1")})
							} else {
								backend.Send(&pgproto3.CommandComplete{CommandTag: []byte("SELECT 0")})
							}
						case strings.HasPrefix(sql, "INSERT INTO AUTH_SESSIONS"):
							sessionInserted.Store(true)
							backend.Send(&pgproto3.CommandComplete{CommandTag: []byte("INSERT 0 1")})
						case strings.HasPrefix(sql, "INSERT INTO AUTH_AUDIT_EVENTS"):
							backend.Send(&pgproto3.CommandComplete{CommandTag: []byte("INSERT 0 1")})
						case strings.HasPrefix(sql, "COMMIT"):
							committed.Store(true)
							status = 'I'
							backend.Send(&pgproto3.CommandComplete{CommandTag: []byte("COMMIT")})
						case strings.HasPrefix(sql, "ROLLBACK"):
							status = 'I'
							backend.Send(&pgproto3.CommandComplete{CommandTag: []byte("ROLLBACK")})
						default:
							backend.Send(&pgproto3.ErrorResponse{Severity: "ERROR", Code: "XX000", Message: "unexpected login test query"})
						}
						backend.Send(&pgproto3.ReadyForQuery{TxStatus: status})
						if backend.Flush() != nil {
							return
						}
					}
				}()
				return client, nil
			}
			pool, err := pgxpool.NewWithConfig(context.Background(), config)
			if err != nil {
				t.Fatal(err)
			}
			defer pool.Close()
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			service := &Service{Pool: pool, SessionTTL: time.Hour}
			_, token, csrf, err := service.Login(ctx, "person@example.test", password)
			if scenario.credentialsChange {
				if !errors.Is(err, ErrInvalidCredentials) || token != "" || csrf != "" || sessionInserted.Load() || committed.Load() {
					t.Fatal("changed credentials must not create or commit a session")
				}
			} else if err != nil || token == "" || csrf == "" || !sessionInserted.Load() || !committed.Load() {
				t.Fatalf("unchanged credentials must create a session: %v", err)
			}
			if !credentialsLocked.Load() {
				t.Fatal("session creation must revalidate active credentials under a transaction user-row lock")
			}
		})
	}
}
