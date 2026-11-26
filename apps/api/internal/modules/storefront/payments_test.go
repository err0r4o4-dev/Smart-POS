package storefront

import (
	"context"
	"errors"
	"testing"
	"time"

	"smartpos/api/internal/platform/stripe"
)

func TestPaymentStateIsMonotonic(test *testing.T) {
	for _, item := range []struct{ current, observed, expected string }{
		{"REQUESTED", "OPEN", "OPEN"},
		{"REQUESTED", "PAID", "PAID"},
		{"OPEN", "PROCESSING", "PROCESSING"},
		{"OPEN", "EXPIRED", "EXPIRED"},
		{"PROCESSING", "OPEN", "PROCESSING"},
		{"PROCESSING", "EXPIRED", "EXPIRED"},
		{"EXPIRED", "OPEN", "EXPIRED"},
		{"EXPIRED", "PROCESSING", "EXPIRED"},
		{"EXPIRED", "PAID", "PAID"},
		{"PAID", "OPEN", "PAID"},
		{"PAID", "EXPIRED", "PAID"},
		{"PAID", "PAID", "PAID"},
	} {
		test.Run(item.current+"/"+item.observed, func(test *testing.T) {
			state, err := nextPaymentState(item.current, item.observed)
			if err != nil || state != item.expected {
				test.Fatalf("expected %s, got %s: %v", item.expected, state, err)
			}
		})
	}
	for _, item := range [][2]string{{"UNKNOWN", "PAID"}, {"OPEN", "UNKNOWN"}, {"", "PAID"}} {
		if _, err := nextPaymentState(item[0], item[1]); !errors.Is(err, ErrInput) {
			test.Fatal("unknown payment states must fail closed")
		}
	}
}

func TestPaymentBoundaryFailsClosedWithoutDatabaseAccess(test *testing.T) {
	service := &Service{}
	if _, err := service.BeginCustomerPayment(context.Background(), "test-shop", TrackingInput{}); !errors.Is(err, stripe.ErrUnavailable) {
		test.Fatal("unconfigured checkout must remain unavailable")
	}
	if _, err := service.AcceptCustomerWebhook(context.Background(), []byte("{}"), "", time.Now()); !errors.Is(err, stripe.ErrUnavailable) {
		test.Fatal("missing signing secret must fail before any database resolution")
	}
	client, err := stripe.NewCustomerClient(nil, "whsec_synthetic_boundary_test_only", false)
	if err != nil {
		test.Fatal(err)
	}
	service.CustomerPayments = client
	if _, err := service.AcceptCustomerWebhook(context.Background(), []byte("{}"), "t=1,v1=00", time.Now()); !errors.Is(err, ErrInput) {
		test.Fatal("invalid signatures must fail before database access")
	}
	if _, err := service.CustomerPayment(context.Background(), "bad/slug", TrackingInput{}); !errors.Is(err, ErrNotFound) {
		test.Fatal("invalid private locators must fail before database access")
	}
}
