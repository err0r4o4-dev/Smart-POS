package identity

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgproto3"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestVerificationHandlersUseSeparateRecoveryQuotas(t *testing.T) {
	queries := make(chan string, 8)
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
				msg, err := backend.Receive()
				if err != nil {
					return
				}
				q, ok := msg.(*pgproto3.Query)
				if !ok {
					return
				}
				sql := strings.ToUpper(q.String)
				if strings.Contains(sql, "INSERT INTO AUTH_RATE_LIMITS") {
					queries <- sql
					backend.Send(&pgproto3.RowDescription{Fields: []pgproto3.FieldDescription{{Name: []byte("attempts"), DataTypeOID: 23, DataTypeSize: 4, TypeModifier: -1}}})
					backend.Send(&pgproto3.DataRow{Values: [][]byte{[]byte("1")}})
				}
				if strings.HasPrefix(sql, "BEGIN") {
					status = 'T'
				}
				if strings.HasPrefix(sql, "ROLLBACK") || strings.HasPrefix(sql, "COMMIT") {
					status = 'I'
				}
				backend.Send(&pgproto3.CommandComplete{CommandTag: []byte("SELECT 0")})
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
	handler := Handler{Service: &Service{Pool: pool, verificationRequests: make(chan string, 1)}, Origins: []string{"https://example.test"}}
	token, _, err := RandomToken()
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range []struct{ name, field, value, scope string }{{"verify", "token", token, "EMAIL_VERIFY"}, {"resend", "email", "person@example.test", "EMAIL_RESEND"}} {
		t.Run(item.name, func(t *testing.T) {
			body, _ := json.Marshal(map[string]string{item.field: item.value})
			req := httptest.NewRequest("POST", "/", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Origin", "https://example.test")
			rec := httptest.NewRecorder()
			if item.name == "verify" {
				handler.verifyEmail(rec, req)
			} else {
				handler.resendEmail(rec, req)
			}
			for i := 0; i < 2; i++ {
				query := <-queries
				if !strings.Contains(query, "'"+item.scope+"'") {
					t.Errorf("quota uses wrong scope, want %s", item.scope)
				}
			}
		})
	}
}
