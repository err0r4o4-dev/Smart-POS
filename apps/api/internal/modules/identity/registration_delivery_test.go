package identity

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgproto3"
	"github.com/jackc/pgx/v5/pgxpool"
)

type failingVerificationMailer struct{}

type acceptingVerificationMailer struct{}

func (acceptingVerificationMailer) SendReset(context.Context, string, string) error { return nil }
func (acceptingVerificationMailer) SendEmailVerification(context.Context, string, string) error {
	return nil
}

func (failingVerificationMailer) SendReset(context.Context, string, string) error { return nil }
func (failingVerificationMailer) SendEmailVerification(context.Context, string, string) error {
	return errors.New("mail unavailable")
}

// The PostgreSQL protocol stub exercises service orchestration; it does not validate SQL semantics.
func TestRegisterReturnsCreatedProfileWhenDeliveryFails(t *testing.T) {
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
				case strings.HasPrefix(sql, "COMMIT"), strings.HasPrefix(sql, "ROLLBACK"):
					status = 'I'
					backend.Send(&pgproto3.CommandComplete{CommandTag: []byte("COMMIT")})
				case strings.HasPrefix(sql, "INSERT INTO USERS"):
					backend.Send(&pgproto3.RowDescription{Fields: []pgproto3.FieldDescription{{Name: []byte("id"), DataTypeOID: 25, DataTypeSize: -1, TypeModifier: -1}}})
					backend.Send(&pgproto3.DataRow{Values: [][]byte{[]byte("user-id")}})
					backend.Send(&pgproto3.CommandComplete{CommandTag: []byte("INSERT 0 1")})
				default:
					backend.Send(&pgproto3.CommandComplete{CommandTag: []byte("INSERT 0 1")})
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
	for _, scenario := range []struct {
		name   string
		mailer Mailer
		sent   bool
	}{
		{"delivery unavailable", failingVerificationMailer{}, false},
		{"SMTP accepted", acceptingVerificationMailer{}, true},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			service := &Service{Pool: pool, Mailer: scenario.mailer}
			profile, err := service.Register(context.Background(), "person@example.test", "A-long-password-123!", "Person")
			if err != nil {
				t.Fatalf("committed registration returned error: %v", err)
			}
			if profile.ID != "user-id" || profile.EmailVerified {
				t.Fatalf("unexpected created profile: %+v", profile)
			}
			body, err := json.Marshal(profile)
			if err != nil {
				t.Fatal(err)
			}
			var result map[string]any
			if err := json.Unmarshal(body, &result); err != nil {
				t.Fatal(err)
			}
			if sent, ok := result["verification_email_sent"].(bool); !ok || sent != scenario.sent {
				t.Fatalf("delivery status = %v, want %v", result["verification_email_sent"], scenario.sent)
			}
		})
	}
}
