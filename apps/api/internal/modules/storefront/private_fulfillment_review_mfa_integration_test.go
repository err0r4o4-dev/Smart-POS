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
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/stripe"
	"smartpos/api/internal/testsupport"
)

func privateFulfillmentReviewMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string, shop storefront.Settings) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User.ID
	service := &storefront.Service{Organization: organizations}
	variant := seedSourceProduct(t, ctx, organizations, user, org, shop.BranchID, shop.LocationID, shop.LocationID)
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	quote, err := service.Quote(context.Background(), shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		t.Fatal(err)
	}
	order, err := service.CreateOrder(context.Background(), shop.Slug, "d8000000-0000-4000-8000-000000000002", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Private fulfillment review buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("3", 64)})
	if err != nil {
		t.Fatal(err)
	}
	payReservationFixture(t, ctx, service, shop.Slug, strings.Repeat("3", 64), order)
	value, err := service.FlagCustomerPaymentFulfillment(context.Background(), user, org, order.ID, "d8000000-0000-4000-8000-000000000003", "QUALITY_BLOCKED")
	if !errors.Is(err, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() {
		t.Fatalf("unassured fulfillment review wrote or returned private data: %v", err)
	}
	key := "d8000000-0000-4000-8000-000000000003"
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
		value, problem := service.FlagCustomerPaymentFulfillment(denial.request, denial.actor, org, order.ID, key, "QUALITY_BLOCKED")
		if !errors.Is(problem, denial.want) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("private fulfillment review authentication/tenant denial: %v", problem)
		}
	}
	for _, status := range []string{"ACTIVE", "SUSPENDED"} {
		privateReadMembership(t, ctx, organizations, user, org, foreign, status)
		want := organization.ErrDenied
		if status == "SUSPENDED" {
			want = storefront.ErrNotFound
		}
		value, problem := service.FlagCustomerPaymentFulfillment(guest.Context, foreign, org, order.ID, key, "QUALITY_BLOCKED")
		if !errors.Is(problem, want) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("private fulfillment review non-Owner denial: %v", problem)
		}
	}
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	pinned := &storefront.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
	if value, problem := pinned.FlagCustomerPaymentFulfillment(owner.Context, user, org, order.ID, key, "QUALITY_BLOCKED"); !errors.Is(problem, storefront.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
		t.Fatalf("fulfillment review crossed pinned organization: %v", problem)
	}
	unpaid, err := service.CreateOrder(context.Background(), shop.Slug, "d8000000-0000-4000-8000-000000000004", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Unpaid fulfillment review buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("2", 64)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: unpaid.ID, AccessToken: strings.Repeat("2", 64)}); err != nil {
		t.Fatal(err)
	}
	before := privateCatalogSnapshot(t, ctx, organizations, user, org)
	proof := privateQuoteProof(t, ctx, pool, user)
	if value, problem := service.FlagCustomerPaymentFulfillment(owner.Context, user, org, unpaid.ID, key, "QUALITY_BLOCKED"); !errors.Is(problem, storefront.ErrConflict) || !reflect.ValueOf(value).IsZero() {
		t.Fatalf("unpaid fulfillment review was accepted: %v", problem)
	}
	for _, expired := range []bool{true, false} {
		verifyPrivateReadWait(t, ctx, pool, owner, "online_orders", expired, func(request context.Context) (any, error) {
			return service.FlagCustomerPaymentFulfillment(request, user, org, order.ID, key, "QUALITY_BLOCKED")
		})
		verifyPrivateWriteAuditWait(t, ctx, pool, owner, expired, func(traced *storefront.Service, request context.Context) (any, error) {
			return traced.FlagCustomerPaymentFulfillment(request, user, org, order.ID, key, "QUALITY_BLOCKED")
		})
	}
	for _, stage := range []struct {
		prefix string
		count  int
	}{
		{"SELECT id::text,request_fingerprint FROM online_payment_reconciliations", 1},
		{"SELECT doc.status,attempt.stock_hold_released", 1},
		{"INSERT INTO online_payment_reconciliations", 1},
		{"SELECT doc.status,attempt.stock_hold_released", 2},
		{"SELECT (SELECT state FROM online_refund_intents", 2},
	} {
		for _, expired := range []bool{true, false} {
			verifyPrivateFulfillmentReviewStage(t, ctx, pool, owner, org, order.ID, key, stage.prefix, stage.count, expired)
			if privateCatalogSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatal("interrupted fulfillment review retained reconciliation or audit effects")
			}
		}
	}
	if privateCatalogSnapshot(t, ctx, organizations, user, org) != before || privateQuoteProof(t, ctx, pool, user) != proof {
		t.Fatal("denied fulfillment review changed business state or consumed MFA proof")
	}
	audits := privateWriteAudits(t, ctx, organizations, user, org)
	type outcome struct {
		value storefront.PaymentReview
		err   error
	}
	results := make(chan outcome, 2)
	var workers sync.WaitGroup
	for i := 0; i < 2; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			value, problem := service.FlagCustomerPaymentFulfillment(owner.Context, user, org, order.ID, key, "QUALITY_BLOCKED")
			results <- outcome{value, problem}
		}()
	}
	workers.Wait()
	close(results)
	var reconciliation string
	for result := range results {
		if result.err != nil || result.value.Status != "REFUND_REVIEW_REQUIRED" || result.value.Attempt.State != "PAID" || result.value.Attempt.AmountMinor != 1000 || result.value.StockHoldReleased || result.value.ReconciliationID == "" || reconciliation != "" && reconciliation != result.value.ReconciliationID {
			t.Fatalf("concurrent fulfillment review did not replay one result: %v", result.err)
		}
		reconciliation = result.value.ReconciliationID
	}
	if privateWriteAudits(t, ctx, organizations, user, org) != audits+1 {
		t.Fatal("concurrent fulfillment review duplicated audit effects")
	}
	before = privateCatalogSnapshot(t, ctx, organizations, user, org)
	for _, candidate := range []struct{ order, reason string }{{order.ID, "PRICE_CHANGED"}, {unpaid.ID, "QUALITY_BLOCKED"}} {
		value, problem := service.FlagCustomerPaymentFulfillment(owner.Context, user, org, candidate.order, key, candidate.reason)
		if !errors.Is(problem, storefront.ErrConflict) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("fulfillment review accepted changed replay identity: %v", problem)
		}
	}
	if value, problem := service.FlagCustomerPaymentFulfillment(primary, user, org, order.ID, key, "QUALITY_BLOCKED"); !errors.Is(problem, identity.ErrMFARequired) || !reflect.ValueOf(value).IsZero() {
		t.Fatalf("primary-only session read fulfillment replay: %v", problem)
	}
	for _, expired := range []bool{true, false} {
		verifyPrivateFulfillmentReviewStage(t, ctx, pool, owner, org, order.ID, key, "SELECT doc.status,attempt.stock_hold_released", 1, expired)
	}
	if privateCatalogSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatal("denied or interrupted fulfillment replay changed state")
	}
	gateway := &refundGatewayFixture{CustomerClient: service.CustomerPayments.(*stripe.CustomerClient)}
	gateway.createRefund = func(_ context.Context, charge stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
		return stripe.CustomerRefund{ID: "re_privateFulfillmentReview", Object: "refund", Status: "succeeded", AmountMinor: charge.AmountMinor, Currency: "thb", PaymentIntent: charge.PaymentIntent, Metadata: map[string]string{"smartpos_purpose": stripe.CustomerRefundPurpose, "organization_id": org, "order_id": order.ID, "refund_id": charge.RefundID}}, nil
	}
	service.CustomerPayments = gateway
	if _, err = service.CancelPaidCustomerOrder(owner.Context, user, org, order.ID, "d8000000-0000-4000-8000-000000000005"); err != nil {
		t.Fatal(err)
	}
	before = privateCatalogSnapshot(t, ctx, organizations, user, org)
	value, err = service.FlagCustomerPaymentFulfillment(owner.Context, user, org, order.ID, key, "QUALITY_BLOCKED")
	if err != nil || value.ReconciliationID != reconciliation || value.Status != "REFUNDED" || !value.StockHoldReleased || privateCatalogSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("fulfillment replay lost identity or current refund projection: %v", err)
	}
	payReservationFixture(t, ctx, service, shop.Slug, strings.Repeat("2", 64), unpaid)
	for _, status := range []string{"PREPARING", "READY"} {
		unpaid, err = service.Transition(owner.Context, user, org, unpaid.ID, storefront.TransitionInput{Revision: unpaid.Revision, Status: status})
		if err != nil {
			t.Fatal(err)
		}
	}
	point := &pos.Service{Organization: organizations}
	if _, err = point.OpenShift(owner.Context, user, org, "d8000000-0000-4000-8000-000000000006", pos.ShiftInput{TerminalID: shop.TerminalID, OpeningCash: "0.00"}); err != nil {
		t.Fatal(err)
	}
	if _, err = point.SettlePrepaidOnlineOrder(owner.Context, user, org, unpaid.ID, pos.OnlineOrderInput{Revision: unpaid.Revision}); err != nil {
		t.Fatal(err)
	}
	before = privateCatalogSnapshot(t, ctx, organizations, user, org)
	if value, problem := service.FlagCustomerPaymentFulfillment(owner.Context, user, org, unpaid.ID, "d8000000-0000-4000-8000-000000000007", "QUALITY_BLOCKED"); !errors.Is(problem, storefront.ErrConflict) || !reflect.ValueOf(value).IsZero() || privateCatalogSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("settled order accepted fulfillment review: %v", problem)
	}
}

func verifyPrivateFulfillmentReviewStage(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner testsupport.MFASession, org, order, key, prefix string, count int, expired bool) {
	t.Helper()
	trace := &privateReadTrace{prefix: prefix, remaining: count, arrived: make(chan struct{}), release: make(chan struct{})}
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
		value, failure := service.FlagCustomerPaymentFulfillment(request, user, org, order, key, "QUALITY_BLOCKED")
		if !reflect.ValueOf(value).IsZero() {
			result <- errors.New("interrupted fulfillment review disclosed private data")
			return
		}
		result <- failure
	}()
	select {
	case <-trace.arrived:
	case <-time.After(5 * time.Second):
		stop()
		t.Fatal("fulfillment review did not reach expected query stage")
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
		t.Fatalf("interrupted fulfillment review stage: %v", err)
	}
}
