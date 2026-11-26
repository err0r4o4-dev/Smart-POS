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

func privateReconciliationMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, organizations *organization.Service, owner testsupport.MFASession, org string, shop storefront.Settings) {
	t.Helper()
	user, sessionID := identity.SessionFromContext(owner.Context).User.ID, identity.SessionFromContext(owner.Context).ID
	base, err := stripe.NewSandbox("sk_test_syntheticReconciliationMFA", "http://localhost:8088")
	if err != nil {
		t.Fatal(err)
	}
	client, err := stripe.NewCustomerClient(base, persistenceSigningSecret, true)
	if err != nil {
		t.Fatal(err)
	}
	gateway := &checkoutGatewayFixture{CustomerClient: client}
	service := &storefront.Service{Organization: organizations, CustomerPayments: gateway}
	variant := seedSourceProduct(t, ctx, organizations, user, org, shop.BranchID, shop.LocationID, shop.LocationID)
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	quote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		t.Fatal(err)
	}
	order, err := service.CreateOrder(ctx, shop.Slug, "da000000-0000-4000-8000-000000000002", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Reconciliation MFA buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("6", 64)})
	if err != nil {
		t.Fatal(err)
	}
	attempt, err := service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: order.ID, AccessToken: strings.Repeat("6", 64)})
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, problem := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", sessionID); problem != nil {
			t.Error(problem)
		}
	}()
	gateway.retrieve = func(context.Context, stripe.CustomerCharge, string) (stripe.CustomerSession, error) {
		if _, problem := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", sessionID); problem != nil {
			return stripe.CustomerSession{}, problem
		}
		return paymentFixtureSession(attempt, "cs_test_postProviderMFA", "complete", "paid"), nil
	}
	before := privatePreflightSnapshot(t, ctx, organizations, user, org)
	value, err := service.ReconcileCustomerPayment(owner.Context, user, org, "da000000-0000-4000-8000-000000000003", storefront.PaymentReconciliationInput{OrderID: order.ID, SessionID: "cs_test_postProviderMFA"})
	if !errors.Is(err, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("expired provider-time session committed reconciliation or returned private data: %v", err)
	}
	if _, err = pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", sessionID); err != nil {
		t.Fatal(err)
	}
	input := storefront.PaymentReconciliationInput{OrderID: order.ID, SessionID: "cs_test_postProviderMFA"}
	key := "da000000-0000-4000-8000-000000000003"
	var factor string
	var verified time.Time
	if err = pool.QueryRow(ctx, "SELECT mfa_factor_id::text,mfa_verified_at FROM auth_sessions WHERE id=$1", sessionID).Scan(&factor, &verified); err != nil {
		t.Fatal(err)
	}
	for _, failure := range []struct {
		kind string
		want error
	}{{"revoked", identity.ErrInvalidToken}, {"primary", identity.ErrMFARequired}, {"canceled", context.Canceled}} {
		request, cancel := context.WithCancel(owner.Context)
		gateway.retrieve = func(context.Context, stripe.CustomerCharge, string) (stripe.CustomerSession, error) {
			var problem error
			switch failure.kind {
			case "revoked":
				_, problem = pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1", sessionID)
			case "primary":
				_, problem = pool.Exec(ctx, "UPDATE auth_sessions SET mfa_factor_id=NULL,mfa_verified_at=NULL WHERE id=$1", sessionID)
			case "canceled":
				cancel()
			}
			return paymentFixtureSession(attempt, input.SessionID, "complete", "paid"), problem
		}
		value, problem := service.ReconcileCustomerPayment(request, user, org, key, input)
		cancel()
		if _, err = pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=NULL,mfa_factor_id=$2,mfa_verified_at=$3 WHERE id=$1", sessionID, factor, verified); err != nil {
			t.Fatal(err)
		}
		if !errors.Is(problem, failure.want) || !reflect.ValueOf(value).IsZero() || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("provider-time %s retained effects or data: %v", failure.kind, problem)
		}
	}
	gateway.retrieve = func(context.Context, stripe.CustomerCharge, string) (stripe.CustomerSession, error) {
		return paymentFixtureSession(attempt, input.SessionID, "complete", "paid"), nil
	}
	proof := privateQuoteProof(t, ctx, pool, user)
	for _, stage := range []struct {
		prefix string
		count  int
	}{
		{"SELECT branch_id::text FROM online_orders", 2},
		{"SELECT id::text,request_fingerprint FROM online_payment_reconciliations", 2},
		{"SELECT request_fingerprint FROM online_payment_dispatches", 2},
		{"UPDATE online_payment_attempts", 1},
		{"INSERT INTO online_payment_observations", 1},
		{"SELECT id::text FROM online_payment_observations", 1},
		{"UPDATE online_payment_attempts", 2},
		{"INSERT INTO online_payment_reconciliations", 1},
		{"INSERT INTO organization_audit_events", 1},
		{"SELECT doc.status,attempt.stock_hold_released", 1},
		{"SELECT (SELECT state FROM online_refund_intents", 1},
	} {
		for _, expired := range []bool{true, false} {
			verifyPrivateReconciliationStage(t, ctx, pool, owner, org, key, input, gateway, stage.prefix, stage.count, expired)
			if privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatal("interrupted reconciliation retained observation, payment or audit effects")
			}
		}
	}
	if privateQuoteProof(t, ctx, pool, user) != proof {
		t.Fatal("reconciliation consumed MFA proof")
	}
	paid := privateConcurrentReconciliations(t, ctx, service, organizations, owner, org, attempt, input, gateway, []string{key, key}, true)
	before = privatePreflightSnapshot(t, ctx, organizations, user, org)
	for _, expired := range []bool{true, false} {
		verifyPrivateReconciliationStage(t, ctx, pool, owner, org, "da000000-0000-4000-8000-000000000004", input, gateway, "SELECT id::text FROM online_payment_observations", 1, expired)
		if privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatal("denied deduplicated observation changed prior history")
		}
	}
	privateConcurrentReconciliations(t, ctx, service, organizations, owner, org, attempt, input, gateway, []string{"da000000-0000-4000-8000-000000000005", "da000000-0000-4000-8000-000000000006"}, false)
	gateway.retrieve = func(context.Context, stripe.CustomerCharge, string) (stripe.CustomerSession, error) {
		return paymentFixtureSession(attempt, input.SessionID, "open", "unpaid"), nil
	}
	value, err = service.ReconcileCustomerPayment(owner.Context, user, org, "da000000-0000-4000-8000-000000000007", input)
	if err != nil || value.Attempt.State != "PAID" || value.Status != "PAID_HELD" || !reflect.DeepEqual(value.Attempt, paid.Attempt) || value.StockHoldReleased {
		t.Fatalf("stale provider observation regressed paid state: %v", err)
	}
	assertPrivateReconciliationCounts(t, ctx, organizations, user, org, order.ID, 2, 4, 4)
	if privateQuoteProof(t, ctx, pool, user) != proof {
		t.Fatal("successful reconciliation consumed MFA proof")
	}
}

func privateConcurrentReconciliations(t *testing.T, ctx context.Context, service *storefront.Service, organizations *organization.Service, owner testsupport.MFASession, org string, attempt storefront.PaymentAttempt, input storefront.PaymentReconciliationInput, gateway *checkoutGatewayFixture, keys []string, same bool) storefront.PaymentReview {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User.ID
	arrived, release := make(chan struct{}, len(keys)), make(chan struct{})
	finish := sync.OnceFunc(func() { close(release) })
	defer finish()
	request, cancel := context.WithTimeout(owner.Context, 5*time.Second)
	defer cancel()
	gateway.retrieve = func(network context.Context, _ stripe.CustomerCharge, _ string) (stripe.CustomerSession, error) {
		arrived <- struct{}{}
		select {
		case <-release:
		case <-network.Done():
			return stripe.CustomerSession{}, network.Err()
		}
		return paymentFixtureSession(attempt, input.SessionID, "complete", "paid"), nil
	}
	type outcome struct {
		value storefront.PaymentReview
		err   error
	}
	results := make(chan outcome, len(keys))
	for _, key := range keys {
		go func() {
			value, err := service.ReconcileCustomerPayment(request, user, org, key, input)
			results <- outcome{value, err}
		}()
	}
	for range keys {
		select {
		case <-arrived:
		case <-request.Done():
			t.Fatal("concurrent reconciliation did not release preflight locks before dispatch")
		}
	}
	finish()
	var first storefront.PaymentReview
	for range keys {
		result := <-results
		if result.err != nil || result.value.Status != "PAID_HELD" || result.value.Attempt.AmountMinor != 1000 || result.value.StockHoldReleased || result.value.ReconciliationID == "" {
			t.Fatalf("concurrent reconciliation failed: %v", result.err)
		}
		if first.ReconciliationID != "" && (first.ReconciliationID == result.value.ReconciliationID) != same {
			t.Fatal("concurrent reconciliation changed command identity")
		}
		first = result.value
	}
	if same {
		assertPrivateReconciliationCounts(t, ctx, organizations, user, org, input.OrderID, 1, 1, 1)
	} else {
		assertPrivateReconciliationCounts(t, ctx, organizations, user, org, input.OrderID, 1, 3, 3)
	}
	return first
}

func assertPrivateReconciliationCounts(t *testing.T, ctx context.Context, organizations *organization.Service, user, org, order string, observations, reconciliations, audits int) {
	t.Helper()
	tx, _, err := organizations.Authorized(ctx, user, org, "storefront.manage")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var observed, reconciled, audited int
	err = tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM online_payment_observations WHERE organization_id=$1 AND order_id=$2),(SELECT count(*) FROM online_payment_reconciliations WHERE organization_id=$1 AND order_id=$2),(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='online_payment.reconciled')`, org, order).Scan(&observed, &reconciled, &audited)
	if err != nil || observed != observations || reconciled != reconciliations || audited != audits {
		t.Fatalf("reconciliation duplicated or lost effects: %d/%d/%d: %v", observed, reconciled, audited, err)
	}
}

func verifyPrivateReconciliationStage(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner testsupport.MFASession, org, key string, input storefront.PaymentReconciliationInput, gateway *checkoutGatewayFixture, prefix string, count int, expired bool) {
	t.Helper()
	trace := &privateReadTrace{prefix: prefix, remaining: count, arrived: make(chan struct{}), release: make(chan struct{})}
	configuration := pool.Config()
	configuration.ConnConfig.Tracer = trace
	tracedPool, err := pgxpool.NewWithConfig(ctx, configuration)
	if err != nil {
		t.Fatal(err)
	}
	defer tracedPool.Close()
	service := &storefront.Service{Organization: &organization.Service{Pool: tracedPool}, CustomerPayments: gateway}
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
		value, failure := service.ReconcileCustomerPayment(request, user, org, key, input)
		if !reflect.ValueOf(value).IsZero() {
			result <- errors.New("interrupted reconciliation result disclosed private data")
			return
		}
		result <- failure
	}()
	select {
	case <-trace.arrived:
	case <-time.After(5 * time.Second):
		stop()
		t.Fatal("reconciliation result did not reach expected query stage")
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
		t.Fatalf("interrupted reconciliation result stage: %v", err)
	}
}
