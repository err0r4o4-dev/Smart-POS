package storefront

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/platform/database"
	"smartpos/api/internal/platform/stripe"
)

type paymentHTTPFixture struct {
	attempt   PaymentAttempt
	url       string
	err       error
	called    string
	body      string
	signature string
	deadline  bool
}

// This exercises the actual public middleware and database constraint on an
// explicitly provisioned acceptance database. Malformed JSON confirms each
// request reached the endpoint without invoking a payment provider.
func TestCustomerPaymentRateLimitScopesIsolatedDatabase(test *testing.T) {
	dsn := os.Getenv("SMARTPOS_SINGLE_STORE_TEST_DSN")
	if dsn == "" {
		test.Skip("requires explicitly provisioned ephemeral single-store database")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil || config.ConnConfig.Host != "127.0.0.1" || config.ConnConfig.Port != 15514 || config.ConnConfig.Database != "smartpos_single_store_acceptance" {
		test.Fatal("refusing an unconfirmed isolated database target")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		test.Fatal("isolated database unavailable")
	}
	defer pool.Close()
	var marker string
	if err := pool.QueryRow(ctx, "SELECT marker FROM single_store_acceptance_marker").Scan(&marker); err != nil || marker != "ephemeral-single-store" {
		test.Fatal("isolated database marker missing")
	}
	router := chi.NewRouter()
	Handler{Service: &Service{}, Authentication: identity.Handler{Service: &identity.Service{Pool: pool}, Origins: []string{"http://localhost:8088"}}}.PublicRoutes(router)
	for _, operation := range []string{"checkout", "recover", "status"} {
		test.Run(operation, func(test *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/storefronts/shop/payment/"+operation, strings.NewReader("{"))
			request.Header.Set("Origin", "http://localhost:8088")
			request.Header.Set("Content-Type", "application/json")
			writer := httptest.NewRecorder()
			router.ServeHTTP(writer, request)
			if writer.Code != http.StatusBadRequest {
				test.Fatalf("malformed body status = %d, want 400 after rate limiting", writer.Code)
			}
		})
	}
}

func (fixture *paymentHTTPFixture) CreateCustomerCheckout(ctx context.Context, slug string, input TrackingInput) (CustomerCheckout, error) {
	fixture.called = "checkout:" + slug + ":" + input.AccessToken
	_, fixture.deadline = ctx.Deadline()
	return CustomerCheckout{Attempt: fixture.attempt, URL: fixture.url}, fixture.err
}
func (fixture *paymentHTTPFixture) RecoverCustomerCheckout(ctx context.Context, slug string, input TrackingInput) (CustomerCheckout, error) {
	fixture.called = "recover:" + slug + ":" + input.AccessToken
	_, fixture.deadline = ctx.Deadline()
	return CustomerCheckout{Attempt: fixture.attempt, URL: fixture.url}, fixture.err
}
func (fixture *paymentHTTPFixture) CustomerPayment(ctx context.Context, slug string, input TrackingInput) (PaymentAttempt, error) {
	fixture.called = "status:" + slug + ":" + input.AccessToken
	_, fixture.deadline = ctx.Deadline()
	return fixture.attempt, fixture.err
}
func (fixture *paymentHTTPFixture) AcceptCustomerWebhook(ctx context.Context, body []byte, signature string, _ time.Time) (PaymentAcceptance, error) {
	fixture.called, fixture.body, fixture.signature = "webhook", string(body), signature
	_, fixture.deadline = ctx.Deadline()
	return PaymentAcceptance{Attempt: fixture.attempt}, fixture.err
}

func paymentTestRouter(service customerPaymentService) http.Handler {
	router := chi.NewRouter()
	router.Post("/storefronts/{slug}/payment/checkout", customerCheckoutEndpoint(service, false))
	router.Post("/storefronts/{slug}/payment/recover", customerCheckoutEndpoint(service, true))
	router.Post("/storefronts/{slug}/payment/status", customerPaymentStatusEndpoint(service))
	router.Post("/storefront-payments/stripe/webhook", customerPaymentWebhookEndpoint(service))
	return router
}

func TestCustomerPaymentHTTPPublicResponseAndDispatch(test *testing.T) {
	private := "private-provider-reference"
	fixture := &paymentHTTPFixture{attempt: PaymentAttempt{OrganizationID: private, OrderID: private, SessionID: &private, PaymentIntent: &private, State: "OPEN", AmountMinor: 1234, Currency: "THB"}, url: "https://checkout.example.test/session"}
	for _, operation := range []string{"checkout", "recover", "status"} {
		test.Run(operation, func(test *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/storefronts/example/payment/"+operation, strings.NewReader(`{"order_id":"order","access_token":"token"}`))
			request.Header.Set("Content-Type", "application/json")
			writer := httptest.NewRecorder()
			paymentTestRouter(fixture).ServeHTTP(writer, request)
			if writer.Code != 200 || fixture.called != operation+":example:token" || !fixture.deadline || strings.Contains(writer.Body.String(), private) {
				test.Fatalf("status %d dispatch %q deadline %v body %s", writer.Code, fixture.called, fixture.deadline, writer.Body.String())
			}
			var envelope map[string]json.RawMessage
			if err := json.Unmarshal(writer.Body.Bytes(), &envelope); err != nil {
				test.Fatal(err)
			}
			want := `{"state":"OPEN","amount_minor":1234,"currency":"THB"}`
			if operation != "status" {
				want = `{"attempt":` + want + `,"url":"https://checkout.example.test/session"}`
			}
			if string(envelope["data"]) != want {
				test.Fatalf("data = %s, want %s", envelope["data"], want)
			}
		})
	}
	fixture.url = ""
	request := httptest.NewRequest(http.MethodPost, "/storefronts/example/payment/recover", strings.NewReader(`{"order_id":"order","access_token":"token"}`))
	request.Header.Set("Content-Type", "application/json")
	writer := httptest.NewRecorder()
	paymentTestRouter(fixture).ServeHTTP(writer, request)
	if writer.Code != 200 || strings.Contains(writer.Body.String(), `"url"`) {
		test.Fatalf("empty URL must be omitted: %d %s", writer.Code, writer.Body.String())
	}
}

func TestCustomerPaymentHTTPRejectsInvalidBodiesAndErrors(test *testing.T) {
	fixture := &paymentHTTPFixture{}
	for name, body := range map[string]string{"malformed": `{`, "unknown": `{"order_id":"x","access_token":"x","amount":1}`, "multiple": `{} {}`, "oversized": `{"access_token":"` + strings.Repeat("a", 65536) + `"}`} {
		test.Run(name, func(test *testing.T) {
			fixture.called = ""
			request := httptest.NewRequest(http.MethodPost, "/storefronts/example/payment/status", strings.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			writer := httptest.NewRecorder()
			paymentTestRouter(fixture).ServeHTTP(writer, request)
			if writer.Code != 400 || fixture.called != "" {
				test.Fatalf("status %d called %q", writer.Code, fixture.called)
			}
		})
	}
	fixture.err = ErrNotFound
	request := httptest.NewRequest(http.MethodPost, "/storefronts/example/payment/status", strings.NewReader(`{"order_id":"x","access_token":"wrong"}`))
	request.Header.Set("Content-Type", "application/json")
	writer := httptest.NewRecorder()
	paymentTestRouter(fixture).ServeHTTP(writer, request)
	if writer.Code != 404 {
		test.Fatalf("wrong token error status %d", writer.Code)
	}
	request = httptest.NewRequest(http.MethodPost, "/storefronts/example/payment/status", strings.NewReader(`{"order_id":"11111111-1111-4111-8111-111111111111","access_token":"wrong"}`))
	request.Header.Set("Content-Type", "application/json")
	writer = httptest.NewRecorder()
	paymentTestRouter(&Service{}).ServeHTTP(writer, request)
	if writer.Code != 404 {
		test.Fatalf("invalid tracking token status %d", writer.Code)
	}
	request = httptest.NewRequest(http.MethodPost, "/storefronts/example/payment/checkout", strings.NewReader(`{}`))
	request.Header.Set("Content-Type", "application/json")
	writer = httptest.NewRecorder()
	paymentTestRouter(&Service{}).ServeHTTP(writer, request)
	if writer.Code != 503 {
		test.Fatalf("disabled provider status %d", writer.Code)
	}
}

func TestCustomerWebhookHTTPBoundedAndSignatureVerified(test *testing.T) {
	client, err := stripe.NewCustomerClient(nil, "whsec_synthetic_boundary_test_only", false)
	if err != nil {
		test.Fatal(err)
	}
	for name, service := range map[string]customerPaymentService{"invalid signature": &Service{CustomerPayments: client}, "unavailable": &Service{}} {
		test.Run(name, func(test *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/storefront-payments/stripe/webhook", strings.NewReader(`{}`))
			request.Header.Set("Stripe-Signature", "t=1,v1=00")
			writer := httptest.NewRecorder()
			paymentTestRouter(service).ServeHTTP(writer, request)
			want := 400
			if name == "unavailable" {
				want = 503
			}
			if writer.Code != want {
				test.Fatalf("status %d, want %d", writer.Code, want)
			}
		})
	}
	fixture := &paymentHTTPFixture{attempt: PaymentAttempt{OrganizationID: "private"}}
	request := httptest.NewRequest(http.MethodPost, "/storefront-payments/stripe/webhook", strings.NewReader("raw event"))
	request.Header.Set("Stripe-Signature", "signed")
	writer := httptest.NewRecorder()
	paymentTestRouter(fixture).ServeHTTP(writer, request)
	if writer.Code != 200 || fixture.body != "raw event" || fixture.signature != "signed" || !fixture.deadline || strings.TrimSpace(writer.Body.String()) != `{"data":{"received":true}}` {
		test.Fatalf("webhook response %d %s", writer.Code, writer.Body.String())
	}
	fixture.called = ""
	request = httptest.NewRequest(http.MethodPost, "/storefront-payments/stripe/webhook", strings.NewReader(strings.Repeat("x", 65537)))
	writer = httptest.NewRecorder()
	paymentTestRouter(fixture).ServeHTTP(writer, request)
	if writer.Code != 400 || fixture.called != "" {
		test.Fatalf("oversized webhook status %d called %q", writer.Code, fixture.called)
	}
	fixture.err = errors.New("private internal error")
	request = httptest.NewRequest(http.MethodPost, "/storefront-payments/stripe/webhook", strings.NewReader("x"))
	writer = httptest.NewRecorder()
	paymentTestRouter(fixture).ServeHTTP(writer, request)
	if writer.Code != 503 || strings.Contains(writer.Body.String(), "private") {
		test.Fatalf("error leaked: %d %s", writer.Code, writer.Body.String())
	}
}

func TestCustomerPaymentRoutesRejectForeignOrigin(test *testing.T) {
	router := chi.NewRouter()
	Handler{Service: &Service{}, Authentication: identity.Handler{Origins: []string{"http://localhost:8088"}}}.PublicRoutes(router)
	for _, path := range []string{"/storefronts/shop/payment/checkout", "/storefronts/shop/payment/recover", "/storefronts/shop/payment/status"} {
		test.Run(path, func(test *testing.T) {
			request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{}`))
			request.Header.Set("Origin", "https://foreign.invalid")
			request.Header.Set("Content-Type", "application/json")
			writer := httptest.NewRecorder()
			router.ServeHTTP(writer, request)
			if writer.Code != http.StatusForbidden || writer.Header().Get("Cache-Control") != "no-store" {
				test.Fatalf("foreign origin status = %d, want 403", writer.Code)
			}
		})
	}
}

func TestCustomerWebhookFailsClosedWithoutVerifier(test *testing.T) {
	router := chi.NewRouter()
	Handler{Service: &Service{}}.PublicRoutes(router)
	request := httptest.NewRequest(http.MethodPost, "/storefront-payments/stripe/webhook", strings.NewReader(`{}`))
	writer := httptest.NewRecorder()
	router.ServeHTTP(writer, request)
	if writer.Code != http.StatusServiceUnavailable {
		test.Fatalf("missing verifier status = %d, want 503", writer.Code)
	}
}
