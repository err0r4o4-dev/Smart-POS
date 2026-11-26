package stripe

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

const customerWebhookSecret = "whsec_synthetic_customer_test_only"

var customerCharge = CustomerCharge{
	OrganizationID: testScope.OrganizationID,
	OrderID:        testKey,
	Slug:           "test-shop",
	AmountMinor:    2000,
	ExpiresAt:      time.Unix(1800003600, 0),
}

func TestCustomerCheckoutProviderFailuresAreBoundedSanitizedAndNotRetried(test *testing.T) {
	valid, err := json.Marshal(customerSessionObject())
	if err != nil {
		test.Fatal(err)
	}
	for _, item := range []struct {
		name   string
		status int
		body   string
		want   error
	}{
		{"upstream failure", 503, `{"error":{"message":"sk_test_private customer@example.test"}}`, ErrUnavailable},
		{"missing session", 404, `{}`, ErrNotFound},
		{"idempotency conflict", 409, `{}`, ErrConflict},
		{"provider validation", 400, `{}`, ErrUnavailable},
		{"malformed JSON", 200, `{`, ErrUnavailable},
		{"trailing JSON", 200, string(valid) + `{}`, ErrUnavailable},
		{"oversized trailing payload", 200, string(valid) + strings.Repeat(" ", 1<<20) + `{}`, ErrUnavailable},
	} {
		test.Run(item.name, func(test *testing.T) {
			calls := 0
			client := customerClient(test, func(*http.Request) (*http.Response, error) {
				calls++
				return &http.Response{StatusCode: item.status, Body: io.NopCloser(strings.NewReader(item.body))}, nil
			}, true)
			session, err := client.CreateCustomerCheckout(context.Background(), customerCharge)
			if !errors.Is(err, item.want) || calls != 1 || session.ID != "" {
				test.Fatalf("unsafe provider failure/retry behavior: %v calls=%d", err, calls)
			}
			if strings.Contains(err.Error(), "private") || strings.Contains(err.Error(), "@") {
				test.Fatal("upstream error exposed customer data or a credential")
			}
		})
	}
}

func customerClient(test *testing.T, transport roundTripFunc, enabled bool) *CustomerClient {
	test.Helper()
	client, err := NewCustomerClient(sandboxClient(test, transport), customerWebhookSecret, enabled)
	if err != nil {
		test.Fatal(err)
	}
	return client
}

func customerSessionObject() map[string]any {
	return map[string]any{
		"id": testSessionID, "object": "checkout.session", "livemode": false,
		"mode": "payment", "amount_total": customerCharge.AmountMinor, "currency": "thb",
		"status": "open", "payment_status": "unpaid", "expires_at": customerCharge.ExpiresAt.Unix(),
		"url": "https://checkout.stripe.com/c/pay/" + testSessionID + "#provider-fragment",
		"metadata": map[string]string{
			"smartpos_purpose": CustomerPurpose, "organization_id": customerCharge.OrganizationID,
			"order_id": customerCharge.OrderID,
		},
	}
}

func TestCustomerCheckoutAcceptsProviderURLFragment(test *testing.T) {
	client := customerClient(test, func(*http.Request) (*http.Response, error) {
		return stripeResponse(customerSessionObject()), nil
	}, true)
	if _, err := client.CreateCustomerCheckout(context.Background(), customerCharge); err != nil {
		test.Fatalf("test Checkout on the exact provider host must accept its fragment: %v", err)
	}
}

func TestCustomerCheckoutRejectsMalformedChargeBeforeNetwork(test *testing.T) {
	client := customerClient(test, func(*http.Request) (*http.Response, error) {
		test.Fatal("invalid charge reached Stripe")
		return nil, nil
	}, true)
	for _, change := range []func(*CustomerCharge){
		func(charge *CustomerCharge) { charge.Slug = "test--shop" },
		func(charge *CustomerCharge) { charge.Slug = "test-shop-" },
		func(charge *CustomerCharge) { charge.ExpiresAt = time.Unix(-1, 0) },
	} {
		charge := customerCharge
		change(&charge)
		if _, err := client.CreateCustomerCheckout(context.Background(), charge); !errors.Is(err, ErrInput) {
			test.Fatalf("malformed charge: %v", err)
		}
	}
}

func TestCustomerCheckoutFrozenTotalsScopedReplayAndPrivateReturn(test *testing.T) {
	var keys []string
	client := customerClient(test, func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodPost || request.URL.String() != "https://api.stripe.com/v1/checkout/sessions" {
			test.Fatal("unexpected provider endpoint")
		}
		if request.Header.Get("Stripe-Version") != "2024-06-20" {
			test.Fatal("customer Checkout must preserve the API pin")
		}
		username, password, ok := request.BasicAuth()
		if !ok || username != "sk_test_synthetic" || password != "" {
			test.Fatal("incorrect test-only authorization")
		}
		if err := request.ParseForm(); err != nil {
			test.Fatal(err)
		}
		for field, expected := range map[string]string{
			"mode": "payment", "payment_method_types[0]": "card",
			"line_items[0][price_data][currency]": "thb", "line_items[0][price_data][unit_amount]": "2000",
			"line_items[0][quantity]": "1", "expires_at": "1800003600",
			"metadata[smartpos_purpose]": CustomerPurpose, "metadata[organization_id]": customerCharge.OrganizationID,
			"metadata[order_id]":                              customerCharge.OrderID,
			"payment_intent_data[metadata][smartpos_purpose]": CustomerPurpose,
			"payment_intent_data[metadata][organization_id]":  customerCharge.OrganizationID,
			"payment_intent_data[metadata][order_id]":         customerCharge.OrderID,
		} {
			if request.Form.Get(field) != expected {
				test.Fatalf("incorrect customer Checkout field %s", field)
			}
		}
		for _, field := range []string{"success_url", "cancel_url"} {
			parsed, err := url.Parse(request.Form.Get(field))
			if err != nil || parsed.String() != "http://localhost:8088/shop/test-shop/track/"+customerCharge.OrderID+"?payment_return=1" {
				test.Fatal("customer return URL must contain only the public order locator and neutral return flag")
			}
		}
		for field := range request.Form {
			if strings.Contains(field, "access") || strings.Contains(field, "customer") || field == "payment_method_types[1]" {
				test.Fatal("private tracking data, customer contact or an asynchronous method reached Stripe")
			}
		}
		keys = append(keys, request.Header.Get("Idempotency-Key"))
		return stripeResponse(customerSessionObject()), nil
	}, true)
	for range 2 {
		if _, err := client.CreateCustomerCheckout(context.Background(), customerCharge); err != nil {
			test.Fatal(err)
		}
	}
	if len(keys) != 2 || keys[0] == "" || keys[0] != keys[1] || strings.Contains(keys[0], customerCharge.OrderID) || strings.Contains(keys[0], customerCharge.OrganizationID) {
		test.Fatal("customer replay key must be stable and scoped without exposing raw identifiers")
	}
	other := customerCharge
	other.OrganizationID = testScope.UserID
	first := Scope{OrganizationID: customerCharge.OrganizationID, UserID: customerCharge.OrderID}.key("customer-checkout", customerCharge.OrderID)
	second := Scope{OrganizationID: other.OrganizationID, UserID: other.OrderID}.key("customer-checkout", other.OrderID)
	if first == second || first == testScope.key("checkout", customerCharge.OrderID) {
		test.Fatal("customer operation aliases another tenant or sandbox diagnostic")
	}
}

func TestCustomerCheckoutRejectsUntrustedSession(test *testing.T) {
	for _, item := range []struct {
		name   string
		change func(map[string]any)
	}{
		{"foreign purpose", func(value map[string]any) {
			value["metadata"].(map[string]string)["smartpos_purpose"] = "sandbox_connection_check"
		}},
		{"foreign tenant", func(value map[string]any) {
			value["metadata"].(map[string]string)["organization_id"] = testScope.UserID
		}},
		{"foreign order", func(value map[string]any) { value["metadata"].(map[string]string)["order_id"] = testScope.UserID }},
		{"missing metadata", func(value map[string]any) { delete(value, "metadata") }},
		{"live flag", func(value map[string]any) { value["livemode"] = true }},
		{"missing live flag", func(value map[string]any) { delete(value, "livemode") }},
		{"live session", func(value map[string]any) { value["id"] = "cs_live_synthetic" }},
		{"foreign session", func(value map[string]any) { value["id"] = "cs_test_other" }},
		{"wrong object", func(value map[string]any) { value["object"] = "payment_intent" }},
		{"wrong mode", func(value map[string]any) { value["mode"] = "subscription" }},
		{"wrong amount", func(value map[string]any) { value["amount_total"] = 1 }},
		{"wrong currency", func(value map[string]any) { value["currency"] = "usd" }},
		{"wrong expiry", func(value map[string]any) { value["expires_at"] = customerCharge.ExpiresAt.Unix() + 1 }},
		{"unknown status", func(value map[string]any) { value["status"] = "unknown" }},
		{"unknown payment status", func(value map[string]any) { value["payment_status"] = "no_payment_required" }},
		{"paid open", func(value map[string]any) { value["payment_status"] = "paid"; value["payment_intent"] = "pi_synthetic" }},
		{"paid missing intent", func(value map[string]any) { value["payment_status"] = "paid"; value["status"] = "complete" }},
		{"malformed unpaid intent", func(value map[string]any) { value["payment_intent"] = "../intent" }},
		{"lookalike URL", func(value map[string]any) {
			value["url"] = "https://checkout.stripe.com.evil.test/c/pay/" + testSessionID
		}},
		{"non HTTPS URL", func(value map[string]any) { value["url"] = "http://checkout.stripe.com/c/pay/" + testSessionID }},
		{"credential URL", func(value map[string]any) {
			value["url"] = "https://user:pass@checkout.stripe.com/c/pay/" + testSessionID
		}},
		{"foreign URL session", func(value map[string]any) { value["url"] = "https://checkout.stripe.com/c/pay/cs_test_other" }},
		{"URL port", func(value map[string]any) { value["url"] = "https://checkout.stripe.com:443/c/pay/" + testSessionID }},
		{"missing open URL", func(value map[string]any) { delete(value, "url") }},
	} {
		test.Run(item.name, func(test *testing.T) {
			client := customerClient(test, func(*http.Request) (*http.Response, error) {
				value := customerSessionObject()
				item.change(value)
				return stripeResponse(value), nil
			}, true)
			session, err := client.RetrieveCustomerCheckout(context.Background(), customerCharge, testSessionID)
			if err == nil || session.ID != "" || session.URL != "" || session.Metadata != nil {
				test.Fatal("untrusted provider data must not escape as a usable session")
			}
		})
	}
}

func TestCustomerCheckoutRecoveryWhenNewPaymentsDisabled(test *testing.T) {
	client := customerClient(test, func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodGet || request.URL.Path != "/v1/checkout/sessions/"+testSessionID || request.Header.Get("Idempotency-Key") != "" {
			test.Fatal("reconciliation must only retrieve the exact session")
		}
		value := customerSessionObject()
		value["status"], value["payment_status"], value["payment_intent"], value["url"] = "complete", "paid", "pi_synthetic", nil
		return stripeResponse(value), nil
	}, false)
	if _, err := client.CreateCustomerCheckout(context.Background(), customerCharge); !errors.Is(err, ErrUnavailable) {
		test.Fatal("disabled customer client created a new payment")
	}
	session, err := client.RetrieveCustomerCheckout(context.Background(), customerCharge, testSessionID)
	if err != nil || session.PaymentStatus != "paid" || session.PaymentIntent != "pi_synthetic" {
		test.Fatalf("existing payment must remain reconcilable: %v", err)
	}
}

func TestCustomerCheckoutInvalidInputNeverCallsProvider(test *testing.T) {
	client := customerClient(test, func(*http.Request) (*http.Response, error) {
		test.Fatal("invalid input reached provider")
		return nil, nil
	}, true)
	for _, id := range []string{"", "cs_live_synthetic", "../sessions", "cs_test_other?expand[]=payment_intent"} {
		if _, err := client.RetrieveCustomerCheckout(context.Background(), customerCharge, id); !errors.Is(err, ErrInput) {
			test.Fatalf("invalid session ID: %v", err)
		}
	}
	for _, change := range []func(*CustomerCharge){
		func(charge *CustomerCharge) { charge.OrganizationID = "foreign" },
		func(charge *CustomerCharge) { charge.OrderID = "foreign" },
		func(charge *CustomerCharge) { charge.Slug = "test/shop" },
		func(charge *CustomerCharge) { charge.AmountMinor = 999 },
		func(charge *CustomerCharge) { charge.AmountMinor = 100000000 },
		func(charge *CustomerCharge) { charge.ExpiresAt = time.Time{} },
	} {
		charge := customerCharge
		change(&charge)
		if _, err := client.CreateCustomerCheckout(context.Background(), charge); !errors.Is(err, ErrInput) {
			test.Fatalf("invalid create charge: %v", err)
		}
		if _, err := client.RetrieveCustomerCheckout(context.Background(), charge, testSessionID); !errors.Is(err, ErrInput) {
			test.Fatalf("invalid reconciliation charge: %v", err)
		}
	}
	var unavailable *CustomerClient
	if unavailable.Enabled() {
		test.Fatal("nil client enabled")
	}
	if _, err := unavailable.CreateCustomerCheckout(context.Background(), customerCharge); !errors.Is(err, ErrUnavailable) {
		test.Fatal("nil client must not create a payment")
	}
}
