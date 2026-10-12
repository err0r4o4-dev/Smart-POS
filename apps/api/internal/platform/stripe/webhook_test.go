package stripe

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"
)

var webhookNow = time.Unix(1800000000, 0)

func signedCustomerBody(body []byte, timestamp time.Time, secret string) string {
	seconds := strconv.FormatInt(timestamp.Unix(), 10)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(seconds + "."))
	mac.Write(body)
	return "t=" + seconds + ",v1=" + hex.EncodeToString(mac.Sum(nil))
}

func customerEventObject() map[string]any {
	session := customerSessionObject()
	session["status"], session["payment_status"], session["payment_intent"], session["url"] = "complete", "paid", "pi_synthetic", nil
	return map[string]any{
		"id": "evt_synthetic", "object": "event", "type": "checkout.session.completed", "livemode": false,
		"created": webhookNow.Unix(), "data": map[string]any{"object": session},
	}
}

func TestCustomerWebhookRawSignatureAndRotation(test *testing.T) {
	client := customerClient(test, func(*http.Request) (*http.Response, error) {
		test.Fatal("signature verification must not call provider")
		return nil, nil
	}, false)
	body, err := json.Marshal(customerEventObject())
	if err != nil {
		test.Fatal(err)
	}
	body = append([]byte(" \n"), body...)
	valid := signedCustomerBody(body, webhookNow, customerWebhookSecret)
	wrong := strings.Repeat("0", sha256.Size*2)
	for _, signature := range []string{valid, valid + ",v1=" + wrong, "v1=" + wrong + "," + valid + ",v0=legacy"} {
		event, err := client.VerifyCustomerEvent(body, signature, webhookNow)
		if err != nil || event.ID != "evt_synthetic" || event.Data.Object.PaymentStatus != "paid" {
			test.Fatalf("valid raw signature/rotation while new Checkout disabled: %v", err)
		}
		if err := event.Data.Object.Validate(customerCharge, testSessionID); err != nil {
			test.Fatalf("authenticated event still needs frozen-order validation: %v", err)
		}
	}
}

func TestCustomerWebhookRejectsUntrustedSignature(test *testing.T) {
	client, err := NewCustomerClient(nil, customerWebhookSecret, false)
	if err != nil {
		test.Fatal(err)
	}
	body, err := json.Marshal(customerEventObject())
	if err != nil {
		test.Fatal(err)
	}
	valid := signedCustomerBody(body, webhookNow, customerWebhookSecret)
	for _, item := range []struct {
		name, signature string
		body            []byte
	}{
		{"missing header", "", body},
		{"tampered raw bytes", valid, append(append([]byte{}, body...), ' ')},
		{"wrong secret", signedCustomerBody(body, webhookNow, "whsec_other_synthetic_test_only"), body},
		{"stale delivery", signedCustomerBody(body, webhookNow.Add(-301*time.Second), customerWebhookSecret), body},
		{"future delivery", signedCustomerBody(body, webhookNow.Add(301*time.Second), customerWebhookSecret), body},
		{"duplicate timestamp", "t=1800000000," + valid, body},
		{"duplicate empty timestamp", "t=," + valid, body},
		{"missing timestamp", "v1=" + strings.Repeat("0", 64), body},
		{"malformed part", valid + ",unknown", body},
		{"malformed hex", valid + ",v1=nothex", body},
		{"short signature", valid + ",v1=00", body},
		{"header limit", valid + ",v0=" + strings.Repeat("x", 2048), body},
		{"empty body", signedCustomerBody(nil, webhookNow, customerWebhookSecret), nil},
		{"body limit", valid, []byte(strings.Repeat("x", (256<<10)+1))},
	} {
		test.Run(item.name, func(test *testing.T) {
			event, err := client.VerifyCustomerEvent(item.body, item.signature, webhookNow)
			if !errors.Is(err, ErrInput) || event.ID != "" {
				test.Fatalf("untrusted signature/body was accepted: %v", err)
			}
		})
	}
}

func TestCustomerWebhookToleranceBoundaries(test *testing.T) {
	client, err := NewCustomerClient(nil, customerWebhookSecret, false)
	if err != nil {
		test.Fatal(err)
	}
	body, err := json.Marshal(customerEventObject())
	if err != nil {
		test.Fatal(err)
	}
	for _, seconds := range []int64{-300, 0, 300} {
		timestamp := webhookNow.Add(time.Duration(seconds) * time.Second)
		if _, err := client.VerifyCustomerEvent(body, signedCustomerBody(body, timestamp, customerWebhookSecret), webhookNow); err != nil {
			test.Fatalf("five-minute signature tolerance boundary: %v", err)
		}
	}
}

func TestCustomerWebhookSignedPayloadMustBeUsableTestEnvelope(test *testing.T) {
	client, err := NewCustomerClient(nil, customerWebhookSecret, false)
	if err != nil {
		test.Fatal(err)
	}
	for _, item := range []struct {
		name   string
		change func(map[string]any)
	}{
		{"live envelope", func(event map[string]any) { event["livemode"] = true }},
		{"missing envelope live flag", func(event map[string]any) { delete(event, "livemode") }},
		{"invalid event ID", func(event map[string]any) { event["id"] = "../event" }},
		{"wrong envelope object", func(event map[string]any) { event["object"] = "checkout.session" }},
		{"missing creation time", func(event map[string]any) { delete(event, "created") }},
		{"live nested session", func(event map[string]any) {
			event["data"].(map[string]any)["object"].(map[string]any)["livemode"] = true
		}},
		{"missing nested live flag", func(event map[string]any) {
			delete(event["data"].(map[string]any)["object"].(map[string]any), "livemode")
		}},
		{"live nested ID", func(event map[string]any) {
			event["data"].(map[string]any)["object"].(map[string]any)["id"] = "cs_live_synthetic"
		}},
	} {
		test.Run(item.name, func(test *testing.T) {
			event := customerEventObject()
			item.change(event)
			body, err := json.Marshal(event)
			if err != nil {
				test.Fatal(err)
			}
			if _, err := client.VerifyCustomerEvent(body, signedCustomerBody(body, webhookNow, customerWebhookSecret), webhookNow); !errors.Is(err, ErrInput) {
				test.Fatalf("unusable signed envelope: %v", err)
			}
		})
	}
	for _, body := range [][]byte{[]byte("{} {}"), []byte("null"), []byte("[]"), []byte("{"), []byte(`{"id":"evt_synthetic"} `)} {
		if _, err := client.VerifyCustomerEvent(body, signedCustomerBody(body, webhookNow, customerWebhookSecret), webhookNow); !errors.Is(err, ErrInput) {
			test.Fatalf("invalid signed JSON: %v", err)
		}
	}
}

func TestCustomerWebhookIgnoresAuthenticatedUnrelatedEvents(test *testing.T) {
	client, err := NewCustomerClient(nil, customerWebhookSecret, false)
	if err != nil {
		test.Fatal(err)
	}
	event := customerEventObject()
	event["type"] = "invoice.paid"
	event["data"] = map[string]any{"object": map[string]any{"object": "invoice", "payment_intent": map[string]string{"id": "pi_other"}}}
	body, err := json.Marshal(event)
	if err != nil {
		test.Fatal(err)
	}
	if _, err := client.VerifyCustomerEvent(body, signedCustomerBody(body, webhookNow, customerWebhookSecret), webhookNow); !errors.Is(err, ErrNotFound) {
		test.Fatalf("unrelated signed event must not parse a customer session: %v", err)
	}
	if _, err := client.VerifyCustomerEvent(body, signedCustomerBody(body, webhookNow, "whsec_other_synthetic_test_only"), webhookNow); !errors.Is(err, ErrInput) {
		test.Fatal("unknown events must still authenticate before they can be ignored")
	}
}

func TestCustomerWebhookRejectsIncompleteSignedEnvelope(test *testing.T) {
	client, err := NewCustomerClient(nil, customerWebhookSecret, false)
	if err != nil {
		test.Fatal(err)
	}
	for _, item := range []struct {
		name   string
		change func(map[string]any)
	}{
		{"missing type", func(event map[string]any) { delete(event, "type") }},
		{"missing session", func(event map[string]any) { delete(event, "data") }},
		{"wrong session object", func(event map[string]any) {
			event["data"].(map[string]any)["object"].(map[string]any)["object"] = "payment_intent"
		}},
	} {
		test.Run(item.name, func(test *testing.T) {
			event := customerEventObject()
			item.change(event)
			body, err := json.Marshal(event)
			if err != nil {
				test.Fatal(err)
			}
			if _, err := client.VerifyCustomerEvent(body, signedCustomerBody(body, webhookNow, customerWebhookSecret), webhookNow); !errors.Is(err, ErrInput) {
				test.Fatalf("incomplete signed event: %v", err)
			}
		})
	}
}

func TestCustomerWebhookSignatureAloneDoesNotValidateFrozenOrder(test *testing.T) {
	client, err := NewCustomerClient(nil, customerWebhookSecret, false)
	if err != nil {
		test.Fatal(err)
	}
	for _, item := range []struct {
		name   string
		change func(map[string]any)
	}{
		{"foreign purpose", func(session map[string]any) {
			session["metadata"].(map[string]string)["smartpos_purpose"] = "sandbox_connection_check"
		}},
		{"foreign tenant", func(session map[string]any) {
			session["metadata"].(map[string]string)["organization_id"] = testScope.UserID
		}},
		{"foreign order", func(session map[string]any) { session["metadata"].(map[string]string)["order_id"] = testScope.UserID }},
		{"wrong amount", func(session map[string]any) { session["amount_total"] = 1000 }},
		{"wrong currency", func(session map[string]any) { session["currency"] = "usd" }},
		{"wrong session", func(session map[string]any) { session["id"] = "cs_test_other" }},
		{"wrong expiry", func(session map[string]any) { session["expires_at"] = customerCharge.ExpiresAt.Unix() + 1 }},
	} {
		test.Run(item.name, func(test *testing.T) {
			object := customerEventObject()
			item.change(object["data"].(map[string]any)["object"].(map[string]any))
			body, err := json.Marshal(object)
			if err != nil {
				test.Fatal(err)
			}
			event, err := client.VerifyCustomerEvent(body, signedCustomerBody(body, webhookNow, customerWebhookSecret), webhookNow)
			if err != nil {
				test.Fatalf("test envelope signature should authenticate before order checks: %v", err)
			}
			if err := event.Data.Object.Validate(customerCharge, testSessionID); err == nil {
				test.Fatal("authenticated but mismatched payment must not validate the stored order")
			}
		})
	}
}

func TestCustomerWebhookOldEventRedeliveryAndExpiredSession(test *testing.T) {
	client, err := NewCustomerClient(nil, customerWebhookSecret, false)
	if err != nil {
		test.Fatal(err)
	}
	object := customerEventObject()
	object["created"] = webhookNow.Add(-24 * time.Hour).Unix()
	object["type"] = "checkout.session.expired"
	session := object["data"].(map[string]any)["object"].(map[string]any)
	session["status"], session["payment_status"], session["payment_intent"] = "expired", "unpaid", nil
	body, err := json.Marshal(object)
	if err != nil {
		test.Fatal(err)
	}
	for range 2 {
		event, err := client.VerifyCustomerEvent(body, signedCustomerBody(body, webhookNow, customerWebhookSecret), webhookNow)
		if err != nil || event.Type != "checkout.session.expired" {
			test.Fatalf("delivery signature timestamp, not creation time, defines tolerance: %v", err)
		}
		if err := event.Data.Object.Validate(customerCharge, testSessionID); err != nil {
			test.Fatalf("expired session can be reconciled without enabling new Checkout: %v", err)
		}
	}
}

func TestCustomerWebhookUnavailableWithoutSigningSecret(test *testing.T) {
	for _, client := range []*CustomerClient{nil, {}} {
		if _, err := client.VerifyCustomerEvent([]byte("{}"), "", webhookNow); !errors.Is(err, ErrUnavailable) {
			test.Fatal("webhook verifier without a signing secret must stay unavailable")
		}
	}
}
