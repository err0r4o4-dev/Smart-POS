package pos_test

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/transport"
)

type prepaidReadiness struct{}

func (prepaidReadiness) Ready(context.Context) error { return nil }

func TestPrepaidSettlementRequiresSession(test *testing.T) {
	router := transport.RouterWithSandbox(prepaidReadiness{}, slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)), nil, identity.Handler{Service: &identity.Service{}})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/organizations/11111111-1111-4111-8111-111111111111/online-orders/22222222-2222-4222-8222-222222222222/settle-prepaid", strings.NewReader(`{"revision":1}`))
	request.Header.Set("Content-Type", "application/json")
	writer := httptest.NewRecorder()
	router.ServeHTTP(writer, request)
	if writer.Code != http.StatusUnauthorized {
		test.Fatalf("guest settlement status %d, want 401", writer.Code)
	}
}
