package storefront

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/platform/stripe"
)

type sandboxTestGateway struct {
	configured bool
	called     bool
}

func (gateway *sandboxTestGateway) Configured() bool { return gateway.configured }
func (gateway *sandboxTestGateway) CreateCheckout(context.Context, stripe.Scope, string) (stripe.Checkout, error) {
	gateway.called = true
	return stripe.Checkout{}, stripe.ErrUnavailable
}
func (gateway *sandboxTestGateway) RetrieveCheckout(context.Context, stripe.Scope, string) (stripe.Checkout, error) {
	gateway.called = true
	return stripe.Checkout{}, stripe.ErrNotFound
}
func (gateway *sandboxTestGateway) RefundCheckout(context.Context, stripe.Scope, string) (stripe.Refund, error) {
	gateway.called = true
	return stripe.Refund{}, stripe.ErrConflict
}

func TestSandboxRequiresSessionEvenWhenDisabled(t *testing.T) {
	for _, methodPath := range []struct{ method, path string }{
		{"GET", ""}, {"POST", "/checkouts"}, {"GET", "/checkouts/cs_test_other"}, {"POST", "/checkouts/cs_test_other/refund"},
	} {
		t.Run(methodPath.method+methodPath.path, func(t *testing.T) {
			gateway := &sandboxTestGateway{}
			router := chi.NewRouter()
			SandboxHandler{Gateway: gateway}.Routes(router)
			request := httptest.NewRequest(methodPath.method, "/storefront/payment-sandbox"+methodPath.path, strings.NewReader(`{}`))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != 401 || gateway.called {
				t.Fatalf("unsafe permission handling: %d", response.Code)
			}
		})
	}
}
func TestSandboxSanitizesErrors(t *testing.T) {
	for _, candidate := range []struct {
		err    error
		status int
		code   string
	}{
		{identity.ErrInvalidToken, 401, "UNAUTHENTICATED"},
		{identity.ErrMFARequired, 403, "MFA_REQUIRED"},
		{organization.ErrDenied, 403, "FORBIDDEN"},
		{stripe.ErrInput, 400, "INVALID_INPUT"},
		{stripe.ErrNotFound, 404, "NOT_FOUND"},
		{stripe.ErrConflict, 409, "CONFLICT"},
		{errors.New("sk_test_private"), 503, "GATEWAY_UNAVAILABLE"},
	} {
		response := httptest.NewRecorder()
		sandboxRespond(response, httptest.NewRequest("GET", "/", nil), map[string]string{"private": "value"}, candidate.err, 200)
		if response.Code != candidate.status || !strings.Contains(response.Body.String(), candidate.code) || strings.Contains(response.Body.String(), "private") || strings.Contains(response.Body.String(), `"data"`) || response.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("unsafe error response for %s: status=%d", candidate.code, response.Code)
		}
	}
}
