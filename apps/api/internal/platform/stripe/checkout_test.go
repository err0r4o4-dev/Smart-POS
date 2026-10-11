package stripe

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (run roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return run(request)
}

var testScope = Scope{OrganizationID: "11111111-1111-4111-8111-111111111111", UserID: "22222222-2222-4222-8222-222222222222"}

const testKey = "33333333-3333-4333-8333-333333333333"
const testSessionID = "cs_test_synthetic"

func sandboxClient(t *testing.T, run roundTripFunc) *Client {
	t.Helper()
	client, err := NewSandbox("sk_test_synthetic", "http://localhost:8088")
	if err != nil {
		t.Fatal(err)
	}
	client.http.Transport = run
	return client
}
func stripeResponse(value any) *http.Response {
	body, _ := json.Marshal(value)
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(body)))}
}
func sessionObject() map[string]any {
	return map[string]any{
		"id": testSessionID, "object": "checkout.session", "livemode": false,
		"mode": "payment", "amount_total": 2000, "currency": "thb", "status": "open", "payment_status": "unpaid",
		"url":      "https://checkout.stripe.com/c/pay/" + testSessionID,
		"metadata": map[string]string{"smartpos_purpose": "sandbox_connection_check", "organization_id": testScope.OrganizationID, "actor_id": testScope.UserID},
	}
}
func TestCreateCheckoutUsesFixedTestAmountAndScopedIdempotency(t *testing.T) {
	var keys []string
	client := sandboxClient(t, func(request *http.Request) (*http.Response, error) {
		if request.URL.String() != "https://api.stripe.com/v1/checkout/sessions" || request.Method != "POST" {
			t.Fatal("unexpected destination")
		}
		if request.Header.Get("Stripe-Version") != "2024-06-20" {
			t.Fatal("missing pinned version")
		}
		username, password, ok := request.BasicAuth()
		if !ok || username != "sk_test_synthetic" || password != "" {
			t.Fatal("incorrect auth")
		}
		if err := request.ParseForm(); err != nil {
			t.Fatal(err)
		}
		for field, expected := range map[string]string{
			"mode": "payment", "line_items[0][price_data][currency]": "thb", "line_items[0][price_data][unit_amount]": "2000",
			"line_items[0][quantity]": "1", "payment_method_types[0]": "card", "payment_method_types[1]": "promptpay",
			"metadata[smartpos_purpose]": "sandbox_connection_check", "metadata[organization_id]": testScope.OrganizationID,
			"metadata[actor_id]": testScope.UserID,
		} {
			if request.Form.Get(field) != expected {
				t.Fatalf("incorrect field %s", field)
			}
		}
		if !strings.HasPrefix(request.Form.Get("success_url"), "http://localhost:8088/manage/settings/storefront/payments?session_id={CHECKOUT_SESSION_ID}") {
			t.Fatal("unsafe return URL")
		}
		keys = append(keys, request.Header.Get("Idempotency-Key"))
		return stripeResponse(sessionObject()), nil
	})
	for range 2 {
		checkout, err := client.CreateCheckout(context.Background(), testScope, testKey)
		if err != nil || checkout.ID != testSessionID || checkout.AmountMinor != 2000 {
			t.Fatalf("unexpected result: %v", err)
		}
	}
	if len(keys) != 2 || keys[0] == "" || keys[0] != keys[1] || strings.Contains(keys[0], testScope.UserID) {
		t.Fatal("unstable or unscoped idempotency")
	}
}
func TestRejectUntrustedCheckoutResponses(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(map[string]any)
	}{
		{"live", func(value map[string]any) { value["livemode"] = true }},
		{"missing mode flag", func(value map[string]any) { delete(value, "livemode") }},
		{"foreign tenant", func(value map[string]any) { value["metadata"] = map[string]string{"organization_id": "foreign"} }},
		{"foreign actor", func(value map[string]any) { value["metadata"].(map[string]string)["actor_id"] = "foreign" }},
		{"foreign purpose", func(value map[string]any) {
			value["metadata"].(map[string]string)["smartpos_purpose"] = "customer_order"
		}},
		{"wrong amount", func(value map[string]any) { value["amount_total"] = 1 }},
		{"wrong currency", func(value map[string]any) { value["currency"] = "usd" }},
		{"wrong session", func(value map[string]any) { value["id"] = "cs_test_other" }},
		{"wrong object", func(value map[string]any) { value["object"] = "payment_intent" }},
		{"unknown state", func(value map[string]any) { value["status"] = "mystery" }},
		{"unsafe redirect", func(value map[string]any) { value["url"] = "https://checkout.stripe.com.evil.test/steal" }},
		{"redirect credentials", func(value map[string]any) {
			value["url"] = "https://user:pass@checkout.stripe.com/c/pay/" + testSessionID
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			client := sandboxClient(t, func(*http.Request) (*http.Response, error) {
				value := sessionObject()
				test.change(value)
				return stripeResponse(value), nil
			})
			if _, err := client.RetrieveCheckout(context.Background(), testScope, testSessionID); err == nil {
				t.Fatal("untrusted session accepted")
			}
		})
	}
}
func TestInvalidInputAndDisabledClientNeverCallStripe(t *testing.T) {
	client := sandboxClient(t, func(*http.Request) (*http.Response, error) { t.Fatal("unexpected network request"); return nil, nil })
	for _, id := range []string{"cs_live_synthetic", "../other", "cs_test_a?expand[]=customer", ""} {
		if _, err := client.RetrieveCheckout(context.Background(), testScope, id); !errors.Is(err, ErrInput) {
			t.Fatalf("invalid id: %v", err)
		}
	}
	if _, err := client.CreateCheckout(context.Background(), testScope, "invalid"); !errors.Is(err, ErrInput) {
		t.Fatalf("invalid key: %v", err)
	}
	if _, err := client.CreateCheckout(context.Background(), Scope{}, testKey); !errors.Is(err, ErrInput) {
		t.Fatalf("invalid scope: %v", err)
	}
	client.secret = ""
	if _, err := client.CreateCheckout(context.Background(), testScope, testKey); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("disabled: %v", err)
	}
}
func TestStripeErrorsAreSanitizedAndNotRetried(t *testing.T) {
	calls := 0
	client := sandboxClient(t, func(*http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 500, Body: io.NopCloser(strings.NewReader(`{"error":{"message":"sk_test_private customer@example.test"}}`))}, nil
	})
	_, err := client.CreateCheckout(context.Background(), testScope, testKey)
	if !errors.Is(err, ErrUnavailable) || strings.Contains(err.Error(), "private") || strings.Contains(err.Error(), "@") || calls != 1 {
		t.Fatal("unsafe upstream handling")
	}
}

func TestSandboxNeverFollowsRedirects(t *testing.T) {
	calls := 0
	client := sandboxClient(t, func(request *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 302, Header: http.Header{"Location": {"https://evil.example.test"}}, Body: io.NopCloser(strings.NewReader("")), Request: request}, nil
	})
	if _, err := client.CreateCheckout(context.Background(), testScope, testKey); !errors.Is(err, ErrUnavailable) || calls != 1 {
		t.Fatal("followed provider redirect")
	}
}

func TestExistingRefundIsReturnedWithoutAnotherWrite(t *testing.T) {
	client := sandboxClient(t, func(request *http.Request) (*http.Response, error) {
		if request.Method != "GET" {
			t.Fatal("duplicate refund write")
		}
		if strings.Contains(request.URL.Path, "checkout/sessions") {
			value := sessionObject()
			value["status"] = "complete"
			value["payment_status"] = "paid"
			value["payment_intent"] = "pi_synthetic"
			value["url"] = nil
			return stripeResponse(value), nil
		}
		return stripeResponse(map[string]any{"object": "list", "data": []any{map[string]any{"object": "refund", "id": "re_synthetic", "status": "succeeded", "amount": 2000, "currency": "thb", "payment_intent": "pi_synthetic", "metadata": sessionObject()["metadata"]}}, "has_more": false}), nil
	})
	refund, err := client.RefundCheckout(context.Background(), testScope, testSessionID)
	if err != nil || refund.Status != "succeeded" {
		t.Fatalf("existing refund: %v", err)
	}
	checkout, err := client.RetrieveCheckout(context.Background(), testScope, testSessionID)
	if err != nil || checkout.Refund == nil || checkout.Refund.Status != "succeeded" {
		t.Fatalf("retrieved refund: %v", err)
	}
}

func TestScopeKeysDoNotCollideAndNilClientFailsClosed(t *testing.T) {
	other := testScope
	other.OrganizationID = "44444444-4444-4444-8444-444444444444"
	if testScope.key("checkout", testKey) == other.key("checkout", testKey) || testScope.key("checkout", testKey) == testScope.key("refund", testKey) {
		t.Fatal("idempotency collision")
	}
	var client *Client
	if _, err := client.CreateCheckout(context.Background(), testScope, testKey); !errors.Is(err, ErrUnavailable) {
		t.Fatal("nil client did not fail closed")
	}
}

func TestMalformedOversizedAndTransportErrorsAreRejected(t *testing.T) {
	for _, body := range []string{`{}`, `null`, `{"id":"cs_test_synthetic"} {}`, `{"padding":"` + strings.Repeat("x", 1<<20) + `"}`} {
		client := sandboxClient(t, func(*http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
		})
		if _, err := client.RetrieveCheckout(context.Background(), testScope, testSessionID); err == nil {
			t.Fatal("malformed response accepted")
		}
	}
	client := sandboxClient(t, func(*http.Request) (*http.Response, error) { return nil, errors.New("sk_test_private network failure") })
	_, err := client.CreateCheckout(context.Background(), testScope, testKey)
	if !errors.Is(err, ErrUnavailable) || strings.Contains(err.Error(), "private") {
		t.Fatal("transport leaked credentials")
	}
}
func TestRefundRequiresAuthoritativePaidSessionAndIsIdempotent(t *testing.T) {
	var refundKeys []string
	client := sandboxClient(t, func(request *http.Request) (*http.Response, error) {
		switch request.URL.Path {
		case "/v1/checkout/sessions/" + testSessionID:
			value := sessionObject()
			value["status"] = "complete"
			value["payment_status"] = "paid"
			value["payment_intent"] = "pi_synthetic"
			value["url"] = nil
			return stripeResponse(value), nil
		case "/v1/refunds":
			if request.Method == "GET" {
				return stripeResponse(map[string]any{"object": "list", "data": []any{}, "has_more": false}), nil
			}
			if err := request.ParseForm(); err != nil {
				t.Fatal(err)
			}
			if request.Form.Get("payment_intent") != "pi_synthetic" || request.Form.Get("amount") != "2000" {
				t.Fatal("unbound refund")
			}
			refundKeys = append(refundKeys, request.Header.Get("Idempotency-Key"))
			return stripeResponse(map[string]any{"object": "refund", "id": "re_synthetic", "amount": 2000, "currency": "thb", "payment_intent": "pi_synthetic", "status": "pending", "metadata": sessionObject()["metadata"]}), nil
		default:
			t.Fatal("unexpected endpoint")
			return nil, nil
		}
	})
	for range 2 {
		refund, err := client.RefundCheckout(context.Background(), testScope, testSessionID)
		if err != nil || refund.Status != "pending" {
			t.Fatalf("unexpected refund: %v", err)
		}
	}
	if len(refundKeys) != 2 || refundKeys[0] == "" || refundKeys[0] != refundKeys[1] {
		t.Fatal("refund retry created a new identity")
	}
	unpaid := sandboxClient(t, func(request *http.Request) (*http.Response, error) {
		if request.Method != "GET" || strings.Contains(request.URL.Path, "refunds") {
			t.Fatal("refunded unpaid session")
		}
		return stripeResponse(sessionObject()), nil
	})
	if _, err := unpaid.RefundCheckout(context.Background(), testScope, testSessionID); !errors.Is(err, ErrConflict) {
		t.Fatalf("unpaid accepted: %v", err)
	}
}
