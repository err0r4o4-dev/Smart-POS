package stripe

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestCustomerRequestFingerprintFreezesParametersAndCredential(test *testing.T) {
	client, err := NewSandbox("sk_test_syntheticA", "http://localhost:8088")
	if err != nil {
		test.Fatal(err)
	}
	customer, err := NewCustomerClient(client, customerWebhookSecret, true)
	if err != nil {
		test.Fatal(err)
	}
	first, err := customer.CustomerRequestFingerprint(customerCharge)
	if err != nil || len(first) != 64 || strings.Contains(first, "synthetic") {
		test.Fatalf("missing safe request fingerprint: %q %v", first, err)
	}
	again, err := customer.CustomerRequestFingerprint(customerCharge)
	if err != nil || again != first {
		test.Fatal("unchanged provider parameters changed identity")
	}
	changed := customerCharge
	changed.AmountMinor++
	other, err := customer.CustomerRequestFingerprint(changed)
	if err != nil || other == first {
		test.Fatal("changed frozen charge retained request identity")
	}
	for _, configuration := range []struct{ secret, origin string }{{"sk_test_syntheticB", "http://localhost:8088"}, {"sk_test_syntheticA", "http://localhost:8089"}} {
		gateway, problem := NewSandbox(configuration.secret, configuration.origin)
		if problem != nil {
			test.Fatal(problem)
		}
		customer, problem := NewCustomerClient(gateway, customerWebhookSecret, false)
		if problem != nil {
			test.Fatal(problem)
		}
		fingerprint, problem := customer.CustomerRequestFingerprint(customerCharge)
		if problem != nil || fingerprint == first {
			test.Fatal("configuration drift did not change request fingerprint")
		}
	}
}

func TestCustomerRequestFingerprintMatchesActualDispatch(test *testing.T) {
	gateway, err := NewSandbox("sk_test_dispatchfixture", "http://localhost:8088")
	if err != nil {
		test.Fatal(err)
	}
	customer, err := NewCustomerClient(gateway, customerWebhookSecret, true)
	if err != nil {
		test.Fatal(err)
	}
	fingerprint, err := customer.CustomerRequestFingerprint(customerCharge)
	if err != nil {
		test.Fatal(err)
	}
	body, err := json.Marshal(customerSessionObject())
	if err != nil {
		test.Fatal(err)
	}
	gateway.http.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		form, problem := io.ReadAll(request.Body)
		if problem != nil {
			return nil, problem
		}
		mac := hmac.New(sha256.New, []byte("sk_test_dispatchfixture"))
		mac.Write([]byte(request.Method + " " + request.URL.String() + "\n" + request.Header.Get("Stripe-Version") + "\n" + request.Header.Get("Idempotency-Key") + "\n" + string(form)))
		if fingerprint != hex.EncodeToString(mac.Sum(nil)) {
			test.Error("persisted fingerprint does not cover actual dispatch identity and parameters")
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(string(body))), Header: http.Header{}}, nil
	})
	if _, err = customer.CreateCustomerCheckout(context.Background(), customerCharge); err != nil {
		test.Fatal(err)
	}
}
