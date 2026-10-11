package storefront

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/platform/stripe"
)

type sandboxTestTx struct {
	pgx.Tx
	rolledBack bool
}

func (tx *sandboxTestTx) Rollback(context.Context) error { tx.rolledBack = true; return nil }

type sandboxTestAccess struct {
	permission string
	err        error
	tx         sandboxTestTx
}

func (access *sandboxTestAccess) Authorized(_ context.Context, _, _, permission string) (pgx.Tx, organization.Member, error) {
	access.permission = permission
	if access.err != nil {
		return nil, organization.Member{}, access.err
	}
	return &access.tx, organization.Member{}, nil
}

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

func TestSandboxRequiresPermissionEvenWhenDisabled(t *testing.T) {
	for _, methodPath := range []struct{ method, path string }{
		{"GET", ""}, {"POST", "/checkouts"}, {"GET", "/checkouts/cs_test_other"}, {"POST", "/checkouts/cs_test_other/refund"},
	} {
		t.Run(methodPath.method+methodPath.path, func(t *testing.T) {
			access := &sandboxTestAccess{err: organization.ErrDenied}
			gateway := &sandboxTestGateway{}
			router := chi.NewRouter()
			SandboxHandler{Organization: access, Gateway: gateway}.Routes(router)
			request := httptest.NewRequest(methodPath.method, "/storefront/payment-sandbox"+methodPath.path, strings.NewReader(`{}`))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != 403 || access.permission != "storefront.manage" || gateway.called {
				t.Fatalf("unsafe permission handling: %d", response.Code)
			}
		})
	}
}
func TestSandboxDisabledStatusAndCommands(t *testing.T) {
	access := &sandboxTestAccess{}
	gateway := &sandboxTestGateway{}
	router := chi.NewRouter()
	SandboxHandler{Organization: access, Gateway: gateway}.Routes(router)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/storefront/payment-sandbox", nil))
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"configured":false`) || !strings.Contains(response.Body.String(), `"customer_checkout_enabled":false`) || !access.tx.rolledBack {
		t.Fatal("incorrect disabled status")
	}
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("POST", "/storefront/payment-sandbox/checkouts", strings.NewReader(`{}`)))
	if response.Code != 503 || gateway.called {
		t.Fatal("disabled checkout allowed")
	}
}
func TestSandboxRejectsUnknownBodyFieldsAndSanitizesErrors(t *testing.T) {
	access := &sandboxTestAccess{}
	gateway := &sandboxTestGateway{configured: true}
	router := chi.NewRouter()
	SandboxHandler{Organization: access, Gateway: gateway}.Routes(router)
	for _, body := range []string{`{"amount":1}`, `{} {}`, `null`, `[]`, `{"secret":"private"}`} {
		request := httptest.NewRequest("POST", "/storefront/payment-sandbox/checkouts", strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != 400 || gateway.called {
			t.Fatalf("unsafe body accepted: %d", response.Code)
		}
	}
	response := httptest.NewRecorder()
	sandboxRespond(response, httptest.NewRequest("GET", "/", nil), nil, errors.New("sk_test_private"), 200)
	if response.Code != 503 || strings.Contains(response.Body.String(), "private") {
		t.Fatal("unsafe error response")
	}
}
