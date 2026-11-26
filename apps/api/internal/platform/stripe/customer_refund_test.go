package stripe

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

var refundCharge = CustomerRefundCharge{OrganizationID: customerCharge.OrganizationID, OrderID: customerCharge.OrderID, RefundID: "ac111111-1111-4111-8111-111111111111", PaymentIntent: "pi_customerRefund", AmountMinor: 4000}

func customerRefundFixture() CustomerRefund {
	return CustomerRefund{ID: "re_customerRefund", Object: "refund", Status: "succeeded", AmountMinor: refundCharge.AmountMinor, Currency: "thb", PaymentIntent: refundCharge.PaymentIntent, Metadata: map[string]string{"smartpos_purpose": "online_order_test_refund", "organization_id": refundCharge.OrganizationID, "order_id": refundCharge.OrderID, "refund_id": refundCharge.RefundID}}
}

func TestCustomerRefundDispatchAndRecovery(test *testing.T) {
	gateway, err := NewSandbox("sk_test_syntheticRefundWire", "http://localhost:8088")
	if err != nil {
		test.Fatal(err)
	}
	client, err := NewCustomerClient(gateway, customerWebhookSecret, true)
	if err != nil {
		test.Fatal(err)
	}
	fingerprint, err := client.CustomerRefundFingerprint(refundCharge)
	if err != nil || len(fingerprint) != 64 {
		test.Fatalf("refund identity: %v", err)
	}
	created, retrieved := 0, 0
	gateway.http.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method == http.MethodPost {
			created++
			body, problem := io.ReadAll(request.Body)
			if problem != nil {
				return nil, problem
			}
			form, problem := url.ParseQuery(string(body))
			if problem != nil {
				return nil, problem
			}
			if request.URL.Path != "/v1/refunds" || form.Get("amount") != "4000" || form.Get("payment_intent") != refundCharge.PaymentIntent || form.Get("metadata[refund_id]") != refundCharge.RefundID || strings.Contains(string(body), "address") {
				test.Error("refund dispatch parameters changed")
			}
			mac := hmac.New(sha256.New, []byte("sk_test_syntheticRefundWire"))
			mac.Write([]byte(request.Method + " " + request.URL.String() + "\n" + request.Header.Get("Stripe-Version") + "\n" + request.Header.Get("Idempotency-Key") + "\n" + string(body)))
			if fingerprint != hex.EncodeToString(mac.Sum(nil)) || request.Header.Get("Idempotency-Key") == "" {
				test.Error("fingerprint does not match actual refund dispatch")
			}
		} else {
			retrieved++
			if request.Method != http.MethodGet || request.URL.Path != "/v1/refunds/re_customerRefund" || request.URL.RawQuery != "" {
				test.Error("recovery must retrieve known refund, not search")
			}
		}
		body, problem := json.Marshal(customerRefundFixture())
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(string(body))), Header: http.Header{}}, problem
	})
	if _, err = client.CreateCustomerRefund(context.Background(), refundCharge); err != nil {
		test.Fatal(err)
	}
	client.enabled = false
	if _, err = client.RetrieveCustomerRefund(context.Background(), refundCharge, "re_customerRefund"); err != nil {
		test.Fatal(err)
	}
	if created != 1 || retrieved != 1 {
		test.Fatal("unexpected refund calls")
	}
	changed := refundCharge
	changed.AmountMinor--
	other, err := client.CustomerRefundFingerprint(changed)
	if err != nil || other == fingerprint {
		test.Fatal("changed amount retained refund identity")
	}
	gateway.secret = "sk_test_syntheticRefundDrift"
	other, err = client.CustomerRefundFingerprint(refundCharge)
	if err != nil || other == fingerprint {
		test.Fatal("credential drift retained refund identity")
	}
}

func TestCustomerRefundRejectsMismatchedEvidence(test *testing.T) {
	valid := customerRefundFixture()
	if err := valid.Validate(refundCharge, valid.ID); err != nil {
		test.Fatal(err)
	}
	for _, status := range []string{"pending", "requires_action", "succeeded", "failed", "canceled"} {
		value := customerRefundFixture()
		value.Status = status
		if err := value.Validate(refundCharge, value.ID); err != nil {
			test.Fatalf("status %s: %v", status, err)
		}
	}
	for _, change := range []func(*CustomerRefund){
		func(value *CustomerRefund) { value.AmountMinor-- },
		func(value *CustomerRefund) { value.Currency = "usd" },
		func(value *CustomerRefund) { value.PaymentIntent = "pi_another" },
		func(value *CustomerRefund) { value.ID = "re_other" },
		func(value *CustomerRefund) { value.Object = "payment_intent" },
		func(value *CustomerRefund) { value.Status = "unknown" },
		func(value *CustomerRefund) { value.Metadata["order_id"] = refundCharge.RefundID },
		func(value *CustomerRefund) { value.Metadata["refund_id"] = refundCharge.OrderID },
		func(value *CustomerRefund) { value.Metadata["smartpos_purpose"] = "sandbox_connection_test" },
	} {
		value := customerRefundFixture()
		change(&value)
		if err := value.Validate(refundCharge, valid.ID); err == nil {
			test.Fatal("mismatched refund evidence accepted")
		}
	}
	charge := refundCharge
	charge.AmountMinor = 0
	if err := valid.Validate(charge, valid.ID); !errors.Is(err, ErrInput) {
		test.Fatalf("invalid refund amount: %v", err)
	}
}
