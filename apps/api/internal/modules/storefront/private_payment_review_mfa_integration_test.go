package storefront_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/stripe"
	"smartpos/api/internal/testsupport"
)

func privatePaymentReviewMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string, shop storefront.Settings, foreignOrg string) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User.ID
	service := &storefront.Service{Organization: organizations}
	variant := seedSourceProduct(t, ctx, organizations, user, org, shop.BranchID, shop.LocationID, shop.LocationID)
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	quote, err := service.Quote(context.Background(), shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		t.Fatal(err)
	}
	order, err := service.CreateOrder(context.Background(), shop.Slug, "d7000000-0000-4000-8000-000000000002", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Private payment review buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("5", 64)})
	if err != nil {
		t.Fatal(err)
	}
	payReservationFixture(t, ctx, service, shop.Slug, strings.Repeat("5", 64), order)
	value, err := service.CustomerPaymentReview(context.Background(), user, org, order.ID)
	if !errors.Is(err, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() {
		t.Fatalf("unassured payment review returned private data: %v", err)
	}
	foreign := identity.SessionFromContext(guest.Context).User.ID
	_, primaryToken, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	for _, denial := range []struct {
		request context.Context
		actor   string
		want    error
	}{
		{primary, user, identity.ErrMFARequired}, {guest.Context, user, identity.ErrInvalidToken},
		{guest.Context, foreign, storefront.ErrNotFound},
	} {
		value, problem := service.CustomerPaymentReview(denial.request, denial.actor, org, order.ID)
		if !errors.Is(problem, denial.want) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("private payment review authentication/tenant denial: %v", problem)
		}
	}
	for _, status := range []string{"ACTIVE", "SUSPENDED"} {
		privateReadMembership(t, ctx, organizations, user, org, foreign, status)
		want := organization.ErrDenied
		if status == "SUSPENDED" {
			want = storefront.ErrNotFound
		}
		value, problem := service.CustomerPaymentReview(guest.Context, foreign, org, order.ID)
		if !errors.Is(problem, want) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("private payment review non-Owner denial: %v", problem)
		}
	}
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	unpaid, err := service.CreateOrder(context.Background(), shop.Slug, "d7000000-0000-4000-8000-000000000003", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "No payment attempt buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("4", 64)})
	if err != nil {
		t.Fatal(err)
	}
	for _, candidate := range []struct{ org, order string }{
		{org, unpaid.ID}, {foreignOrg, order.ID}, {org, "invalid"},
		{org, "11111111-1111-4111-8111-111111111111"},
	} {
		value, problem := service.CustomerPaymentReview(owner.Context, user, candidate.org, candidate.order)
		if !errors.Is(problem, storefront.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("missing or foreign payment review returned data: %v", problem)
		}
	}
	pinned := &storefront.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
	if value, problem := pinned.CustomerPaymentReview(owner.Context, user, org, order.ID); !errors.Is(problem, storefront.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
		t.Fatalf("payment review crossed pinned organization: %v", problem)
	}
	before := privateCatalogSnapshot(t, ctx, organizations, user, org)
	proof := privateQuoteProof(t, ctx, pool, user)
	for _, expired := range []bool{true, false} {
		verifyPrivateReadWait(t, ctx, pool, owner, "online_orders", expired, func(request context.Context) (any, error) {
			return service.CustomerPaymentReview(request, user, org, order.ID)
		})
	}
	for _, prefix := range []string{
		"SELECT organization_id::text,order_id::text,slug,amount_minor",
		"SELECT doc.status,attempt.stock_hold_released",
		"SELECT (SELECT state FROM online_refund_intents",
	} {
		for _, expired := range []bool{true, false} {
			verifyPrivatePaymentReviewStage(t, ctx, pool, owner, org, order.ID, prefix, expired)
		}
	}
	value, err = service.CustomerPaymentReview(owner.Context, user, org, order.ID)
	if err != nil || value.Status != "PAID_HELD" || value.Attempt.OrganizationID != org || value.Attempt.OrderID != order.ID || value.Attempt.State != "PAID" || value.Attempt.AmountMinor != 1000 || value.Attempt.Currency != "thb" || value.StockHoldReleased || value.ReconciliationID != "" {
		t.Fatalf("private payment projection changed: %v", err)
	}
	if privateCatalogSnapshot(t, ctx, organizations, user, org) != before || privateQuoteProof(t, ctx, pool, user) != proof {
		t.Fatal("private payment review changed business state or consumed MFA proof")
	}
	privatePaymentReviewDuringWrite(t, ctx, pool, organizations, owner, org, order.ID, "PAID_HELD", "REFUND_REVIEW_REQUIRED", func(request context.Context) error {
		_, problem := service.FlagCustomerPaymentFulfillment(request, user, org, order.ID, "d7000000-0000-4000-8000-000000000004", "QUALITY_BLOCKED")
		return problem
	})
	gateway := &refundGatewayFixture{CustomerClient: service.CustomerPayments.(*stripe.CustomerClient)}
	gateway.createRefund = func(_ context.Context, charge stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
		return stripe.CustomerRefund{ID: "re_privatePaymentReview", Object: "refund", Status: "succeeded", AmountMinor: charge.AmountMinor, Currency: "thb", PaymentIntent: charge.PaymentIntent, Metadata: map[string]string{"smartpos_purpose": stripe.CustomerRefundPurpose, "organization_id": org, "order_id": order.ID, "refund_id": charge.RefundID}}, nil
	}
	service.CustomerPayments = gateway
	privatePaymentReviewDuringWrite(t, ctx, pool, organizations, owner, org, order.ID, "REFUND_REVIEW_REQUIRED", "REFUNDED", func(request context.Context) error {
		_, problem := service.CancelPaidCustomerOrder(request, user, org, order.ID, "d7000000-0000-4000-8000-000000000005")
		return problem
	})
}

func verifyPrivatePaymentReviewStage(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner testsupport.MFASession, org, order, prefix string, expired bool) {
	t.Helper()
	trace := &privateReadTrace{prefix: prefix, remaining: 1, arrived: make(chan struct{}), release: make(chan struct{})}
	configuration := pool.Config()
	configuration.ConnConfig.Tracer = trace
	tracedPool, err := pgxpool.NewWithConfig(ctx, configuration)
	if err != nil {
		t.Fatal(err)
	}
	defer tracedPool.Close()
	service := &storefront.Service{Organization: &organization.Service{Pool: tracedPool}}
	user, session := identity.SessionFromContext(owner.Context).User.ID, identity.SessionFromContext(owner.Context).ID
	var cutoff time.Time
	if expired {
		if err = pool.QueryRow(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at", session).Scan(&cutoff); err != nil {
			t.Fatal(err)
		}
		defer func() {
			if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", session); failure != nil {
				t.Error(failure)
			}
		}()
	}
	request, stop := context.WithCancel(owner.Context)
	defer stop()
	release := sync.OnceFunc(func() { close(trace.release) })
	defer release()
	result := make(chan error, 1)
	go func() {
		value, failure := service.CustomerPaymentReview(request, user, org, order)
		if !reflect.ValueOf(value).IsZero() {
			result <- errors.New("interrupted payment review disclosed private data")
			return
		}
		result <- failure
	}()
	select {
	case <-trace.arrived:
	case <-time.After(5 * time.Second):
		stop()
		t.Fatal("payment review did not reach expected query stage")
	}
	if expired {
		for {
			var elapsed bool
			if err = pool.QueryRow(ctx, "SELECT clock_timestamp()>=$1", cutoff).Scan(&elapsed); err != nil {
				stop()
				t.Fatal(err)
			}
			if elapsed {
				break
			}
			time.Sleep(10 * time.Millisecond)
		}
	} else {
		stop()
	}
	release()
	err = <-result
	want := identity.ErrInvalidToken
	if !expired {
		want = context.Canceled
	}
	if !errors.Is(err, want) {
		t.Fatalf("interrupted payment review stage: %v", err)
	}
}

func privatePaymentReviewDuringWrite(t *testing.T, ctx context.Context, pool *pgxpool.Pool, organizations *organization.Service, owner testsupport.MFASession, org, order, before, after string, write func(context.Context) error) {
	t.Helper()
	trace := &privateReadTrace{prefix: "SELECT (SELECT state FROM online_refund_intents", remaining: 1, arrived: make(chan struct{}), release: make(chan struct{})}
	configuration := pool.Config()
	configuration.ConnConfig.Tracer = trace
	configuration.ConnConfig.RuntimeParams["application_name"] = "private-payment-review-serialization"
	tracedPool, err := pgxpool.NewWithConfig(ctx, configuration)
	if err != nil {
		t.Fatal(err)
	}
	defer tracedPool.Close()
	request, stop := context.WithTimeout(owner.Context, 5*time.Second)
	defer stop()
	release := sync.OnceFunc(func() { close(trace.release) })
	defer release()
	user := identity.SessionFromContext(owner.Context).User.ID
	read := make(chan error, 1)
	go func() {
		service := &storefront.Service{Organization: &organization.Service{Pool: tracedPool}}
		value, problem := service.CustomerPaymentReview(request, user, org, order)
		if problem == nil && value.Status != before {
			problem = errors.New("concurrent payment review mixed states")
		}
		read <- problem
	}()
	select {
	case <-trace.arrived:
	case <-request.Done():
		t.Fatal("concurrent payment review did not reach projection")
	}
	var reader int32
	if err = pool.QueryRow(ctx, "SELECT pid FROM pg_stat_activity WHERE application_name='private-payment-review-serialization' AND state='idle in transaction'").Scan(&reader); err != nil {
		t.Fatal(err)
	}
	written := make(chan error, 1)
	go func() { written <- write(request) }()
	for {
		var blocked bool
		if err = pool.QueryRow(request, "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)))", reader).Scan(&blocked); err != nil {
			t.Fatal(err)
		}
		if blocked {
			break
		}
		select {
		case problem := <-written:
			t.Fatalf("financial writer did not serialize after review: %v", problem)
		default:
		}
		time.Sleep(10 * time.Millisecond)
	}
	release()
	if err = <-read; err != nil {
		t.Fatal(err)
	}
	if err = <-written; err != nil {
		t.Fatal(err)
	}
	service := &storefront.Service{Organization: organizations}
	value, err := service.CustomerPaymentReview(owner.Context, user, org, order)
	if err != nil || value.Status != after {
		t.Fatalf("payment review did not observe committed writer: %v", err)
	}
}
