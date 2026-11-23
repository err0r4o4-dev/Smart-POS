package pos

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
)

func TestPOSRespondErrorMapping(t *testing.T) {
	for _, tc := range []struct {
		name     string
		err      error
		wantCode int
		wantSlug string
	}{
		{"InvalidToken", identity.ErrInvalidToken, http.StatusUnauthorized, "UNAUTHENTICATED"},
		{"MFARequired", identity.ErrMFARequired, http.StatusForbidden, "MFA_REQUIRED"},
		{"ErrDenied", organization.ErrDenied, http.StatusForbidden, "FORBIDDEN"},
		{"ErrInput", ErrInput, http.StatusBadRequest, "INVALID_INPUT"},
		{"ErrNotFound", ErrNotFound, http.StatusNotFound, "NOT_FOUND"},
		{"ErrConflict", ErrConflict, http.StatusConflict, "CONFLICT"},
		{"ErrCustomer", ErrCustomer, http.StatusConflict, "CUSTOMER_UNAVAILABLE"},
		{"ErrPrice", ErrPrice, http.StatusConflict, "PRICE_CHANGED"},
		{"ErrStock", ErrStock, http.StatusConflict, "INSUFFICIENT_STOCK"},
		{"ErrPending", ErrPending, http.StatusConflict, "PAYMENT_PENDING"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			writer := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/test", nil)
			respond(writer, request, nil, tc.err, http.StatusOK)

			if writer.Code != tc.wantCode {
				t.Fatalf("status got %d, want %d", writer.Code, tc.wantCode)
			}
			var envelope struct {
				Error struct {
					Code    string `json:"code"`
					Message string `json:"message"`
				} `json:"error"`
			}
			if err := json.Unmarshal(writer.Body.Bytes(), &envelope); err != nil {
				t.Fatalf("unmarshal error response: %v", err)
			}
			if envelope.Error.Code != tc.wantSlug {
				t.Fatalf("code slug got %q, want %q", envelope.Error.Code, tc.wantSlug)
			}
		})
	}
}

func TestSelectCustomerEndpointRejectsNonJSON(t *testing.T) {
	handler := Handler{Service: &Service{}}
	router := chi.NewRouter()
	handler.TenantRoutes(router)

	request := httptest.NewRequest(http.MethodPatch, "/pos/carts/00000000-0000-4000-8000-000000000001/customer", bytes.NewBufferString("not-json"))
	request.Header.Set("Content-Type", "text/plain")
	writer := httptest.NewRecorder()
	router.ServeHTTP(writer, request)

	if writer.Code != http.StatusBadRequest {
		t.Fatalf("got status %d, want 400", writer.Code)
	}
	var envelope struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(writer.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if envelope.Error.Code != "INVALID_INPUT" {
		t.Fatalf("got code %q, want INVALID_INPUT", envelope.Error.Code)
	}
}
