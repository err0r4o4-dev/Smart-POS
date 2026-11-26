package customers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"smartpos/api/internal/modules/identity"
)

func TestEndpointAssuranceErrorsDiscardPrivateResult(t *testing.T) {
	for _, item := range []struct {
		err    error
		status int
		code   string
	}{{identity.ErrInvalidToken, 401, "UNAUTHENTICATED"}, {identity.ErrMFARequired, 403, "MFA_REQUIRED"}} {
		t.Run(item.code, func(t *testing.T) {
			handler := endpoint(func(context.Context, string, string, *http.Request) (any, error) {
				return map[string]string{"phone": "0812345678"}, fmt.Errorf("private dependency: %w", item.err)
			})
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/customers", nil))
			var body struct {
				Data  json.RawMessage
				Error struct{ Code string }
			}
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || response.Code != item.status || body.Error.Code != item.code || len(body.Data) != 0 || response.Header().Get("Cache-Control") != "no-store" || strings.Contains(response.Body.String(), "private dependency") || strings.Contains(response.Body.String(), "0812345678") {
				t.Fatalf("assurance error leaked result or classification: status=%d code=%s error=%v", response.Code, body.Error.Code, err)
			}
		})
	}
}

func TestGroupInputRejectsServerFields(t *testing.T) {
	for _, field := range []string{`"id":"00000000-0000-4000-8000-000000000001"`, `"status":"ACTIVE"`, `"member_count":99`} {
		request := httptest.NewRequest("POST", "/customers/groups", strings.NewReader(`{"code":"GROUP","name":"Group",`+field+`}`))
		request.Header.Set("Content-Type", "application/json")
		var input GroupInput
		if decode(request, &input) != ErrInput {
			t.Fatalf("accepted server-managed field %s", field)
		}
	}
}
