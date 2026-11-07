package identity

import (
	"context"
	"net"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgproto3"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestVerifyLocksUserBeforeConsumingToken(t *testing.T) {
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
			locked := false
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
				row := [][]byte(nil)
				switch {
				case strings.HasPrefix(sql, "BEGIN"):
					status = 'T'
				case strings.HasPrefix(sql, "COMMIT"), strings.HasPrefix(sql, "ROLLBACK"):
					status = 'I'
				case strings.Contains(sql, "FROM USERS") && strings.Contains(sql, "FOR UPDATE"):
					locked = true
					row = [][]byte{[]byte("user-id")}
				case strings.HasPrefix(sql, "UPDATE EMAIL_VERIFICATION_TOKENS") && !locked:
					backend.Send(&pgproto3.ErrorResponse{Severity: "ERROR", Code: "XX000", Message: "token changed before user lock"})
					backend.Send(&pgproto3.ReadyForQuery{TxStatus: 'E'})
					if backend.Flush() != nil {
						return
					}
					continue
				case strings.Contains(sql, "EMAIL_VERIFICATION_TOKENS"):
					row = [][]byte{[]byte("user-id")}
				case strings.HasPrefix(sql, "UPDATE USERS"):
					row = [][]byte{[]byte("user-id"), []byte("person@example.test"), []byte("Person"), []byte("ACTIVE"), []byte("t")}
				}
				if row != nil {
					fields := make([]pgproto3.FieldDescription, len(row))
					for i := range fields {
						fields[i] = pgproto3.FieldDescription{Name: []byte("column"), DataTypeOID: 25, DataTypeSize: -1, TypeModifier: -1}
					}
					if len(fields) == 5 {
						fields[4].DataTypeOID = 16
					}
					backend.Send(&pgproto3.RowDescription{Fields: fields})
					backend.Send(&pgproto3.DataRow{Values: row})
				}
				backend.Send(&pgproto3.CommandComplete{CommandTag: []byte("UPDATE 1")})
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
	token, _, err := RandomToken()
	if err != nil {
		t.Fatal(err)
	}
	result, err := (&Service{Pool: pool}).VerifyEmail(context.Background(), token)
	if err != nil {
		t.Fatalf("verification must lock user before consuming token: %v", err)
	}
	if !result.Verified {
		t.Fatal("verification did not complete")
	}
}
