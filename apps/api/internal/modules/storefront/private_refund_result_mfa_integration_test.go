package storefront_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/stripe"
	"smartpos/api/internal/testsupport"
)

func privateRefundResultMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, organizations *organization.Service, owner testsupport.MFASession, org string, shop storefront.Settings) {
	t.Helper()
	user, session := identity.SessionFromContext(owner.Context).User.ID, identity.SessionFromContext(owner.Context).ID
	service := &storefront.Service{Organization: organizations}
	variant := seedSourceProduct(t, ctx, organizations, user, org, shop.BranchID, shop.LocationID, shop.LocationID)
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	quote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		t.Fatal(err)
	}
	order, err := service.CreateOrder(ctx, shop.Slug, "dd000000-0000-4000-8000-000000000002", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Refund result buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("9", 64)})
	if err != nil {
		t.Fatal(err)
	}
	payReservationFixture(t, ctx, service, shop.Slug, strings.Repeat("9", 64), order)
	gateway := &refundGatewayFixture{CustomerClient: service.CustomerPayments.(*stripe.CustomerClient)}
	gateway.createRefund = func(context.Context, stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
		return stripe.CustomerRefund{}, stripe.ErrUnavailable
	}
	service.CustomerPayments = gateway
	key := "dd000000-0000-4000-8000-000000000003"
	if _, err = service.CancelPaidCustomerOrder(owner.Context, user, org, order.ID, key); !errors.Is(err, stripe.ErrUnavailable) {
		t.Fatalf("refund result fixture did not preserve intent: %v", err)
	}
	before := privatePreflightSnapshot(t, ctx, organizations, user, org)
	defer func() {
		if _, problem := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", session); problem != nil {
			t.Error(problem)
		}
	}()
	gateway.createRefund = func(_ context.Context, charge stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
		if _, problem := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", session); problem != nil {
			return stripe.CustomerRefund{}, problem
		}
		return stripe.CustomerRefund{ID: "re_privateRefundResult", Object: "refund", Status: "succeeded", AmountMinor: charge.AmountMinor, Currency: "thb", PaymentIntent: charge.PaymentIntent, Metadata: map[string]string{"smartpos_purpose": stripe.CustomerRefundPurpose, "organization_id": org, "order_id": order.ID, "refund_id": key}}, nil
	}
	value, err := service.CancelPaidCustomerOrder(owner.Context, user, org, order.ID, key)
	if !errors.Is(err, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("expired provider-time session committed refund or returned private data: %v", err)
	}
	if _, err = pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", session); err != nil {
		t.Fatal(err)
	}
	var factor string
	var verified time.Time
	if err = pool.QueryRow(ctx, "SELECT mfa_factor_id::text,mfa_verified_at FROM auth_sessions WHERE id=$1", session).Scan(&factor, &verified); err != nil {
		t.Fatal(err)
	}
	response := func(charge stripe.CustomerRefundCharge, id, status string) stripe.CustomerRefund {
		return stripe.CustomerRefund{ID: id, Object: "refund", Status: status, AmountMinor: charge.AmountMinor, Currency: "thb", PaymentIntent: charge.PaymentIntent, Metadata: map[string]string{"smartpos_purpose": stripe.CustomerRefundPurpose, "organization_id": org, "order_id": order.ID, "refund_id": key}}
	}
	for _, discovered := range []bool{false, true} {
		for _, failure := range []struct {
			kind string
			want error
		}{{"expired", identity.ErrInvalidToken}, {"revoked", identity.ErrInvalidToken}, {"primary", identity.ErrMFARequired}, {"canceled", context.Canceled}} {
			request, cancel := context.WithCancel(owner.Context)
			provide := func(_ context.Context, charge stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
				var problem error
				switch failure.kind {
				case "expired":
					_, problem = pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", session)
				case "revoked":
					_, problem = pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1", session)
				case "primary":
					_, problem = pool.Exec(ctx, "UPDATE auth_sessions SET mfa_factor_id=NULL,mfa_verified_at=NULL WHERE id=$1", session)
				case "canceled":
					cancel()
				}
				return response(charge, "re_privateRefundResult", "succeeded"), problem
			}
			gateway.createRefund = provide
			gateway.getRefund = func(network context.Context, charge stripe.CustomerRefundCharge, _ string) (stripe.CustomerRefund, error) {
				return provide(network, charge)
			}
			if discovered {
				value, err = service.ReconcileCustomerRefund(request, user, org, order.ID, key, "re_privateRefundResult")
			} else {
				value, err = service.CancelPaidCustomerOrder(request, user, org, order.ID, key)
			}
			cancel()
			if _, problem := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour',revoked_at=NULL,mfa_factor_id=$2,mfa_verified_at=$3 WHERE id=$1", session, factor, verified); problem != nil {
				t.Fatal(problem)
			}
			if !errors.Is(err, failure.want) || !reflect.ValueOf(value).IsZero() || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("provider-time refund %s discovered=%t retained effects or data: %v", failure.kind, discovered, err)
			}
		}
	}
	gateway.createRefund = func(_ context.Context, charge stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
		return response(charge, "re_privateRefundResult", "succeeded"), nil
	}
	proof := privateQuoteProof(t, ctx, pool, user)
	for _, stage := range []struct {
		prefix string
		count  int
	}{
		{"SELECT branch_id::text FROM online_orders", 2},
		{"SELECT id::text,order_id::text,amount_minor,state,provider_id", 2},
		{"INSERT INTO online_refund_observations", 1},
		{"UPDATE online_refund_intents", 1},
		{"SELECT id::text,order_id::text,amount_minor,state,provider_id", 3},
		{"UPDATE online_payment_attempts", 1},
		{"SELECT status FROM online_orders", 1},
		{"UPDATE online_orders", 1},
		{"INSERT INTO online_order_events", 1},
		{"INSERT INTO organization_audit_events", 1},
	} {
		for _, expired := range []bool{true, false} {
			verifyPrivateRefundPreparationStage(t, ctx, pool, owner, org, order.ID, key, gateway, stage.prefix, stage.count, expired)
			if privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("interrupted refund result retained effects at %q/%d", stage.prefix, stage.count)
			}
		}
	}
	workerGateway := &refundGatewayFixture{CustomerClient: gateway.CustomerClient}
	workerGateway.getRefund = func(_ context.Context, charge stripe.CustomerRefundCharge, _ string) (stripe.CustomerRefund, error) {
		return response(charge, "re_privateRefundResult", "pending"), nil
	}
	worker := &storefront.Service{Organization: organizations, CustomerPayments: workerGateway}
	var advanced string
	gateway.createRefund = func(network context.Context, charge stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
		current, problem := worker.ReconcileCustomerRefund(network, user, org, order.ID, key, "re_privateRefundResult")
		if problem != nil || current.State != "PENDING" {
			return stripe.CustomerRefund{}, errors.New("network-gap worker could not bind current refund")
		}
		advanced = privatePreflightSnapshot(t, ctx, organizations, user, org)
		return response(charge, "re_otherRefundResult", "succeeded"), nil
	}
	value, err = service.CancelPaidCustomerOrder(owner.Context, user, org, order.ID, key)
	if !errors.Is(err, storefront.ErrConflict) || !reflect.ValueOf(value).IsZero() || advanced == "" || privatePreflightSnapshot(t, ctx, organizations, user, org) != advanced {
		t.Fatalf("refund result ignored current provider binding or retained mismatched observation: %v", err)
	}
	gateway.getRefund = workerGateway.getRefund
	before = privatePreflightSnapshot(t, ctx, organizations, user, org)
	for _, expired := range []bool{true, false} {
		verifyPrivateRefundPreparationStage(t, ctx, pool, owner, org, order.ID, key, gateway, "UPDATE online_refund_intents", 1, expired)
		if privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatal("interrupted deduplicated refund observation deleted existing evidence")
		}
	}
	privateConcurrentRefundResults(t, ctx, service, organizations, owner, org, order.ID, key, gateway, response)
	if privateQuoteProof(t, ctx, pool, user) != proof {
		t.Fatal("refund result consumed MFA factor or recovery proof")
	}
}

func privateConcurrentRefundResults(t *testing.T, ctx context.Context, service *storefront.Service, organizations *organization.Service, owner testsupport.MFASession, org, order, key string, gateway *refundGatewayFixture, response func(stripe.CustomerRefundCharge, string, string) stripe.CustomerRefund) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User.ID
	current, err := service.CustomerPaymentReview(owner.Context, user, org, order)
	if err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int32
	arrived, successes, stale := make(chan struct{}, 4), make(chan struct{}), make(chan struct{})
	finishSuccess := sync.OnceFunc(func() { close(successes) })
	finishStale := sync.OnceFunc(func() { close(stale) })
	defer finishSuccess()
	defer finishStale()
	gateway.getRefund = func(network context.Context, charge stripe.CustomerRefundCharge, id string) (stripe.CustomerRefund, error) {
		index := calls.Add(1)
		if id != "re_privateRefundResult" || charge.OrganizationID != org || charge.OrderID != order || charge.RefundID != key || charge.AmountMinor != 1000 || current.Attempt.PaymentIntent == nil || charge.PaymentIntent != *current.Attempt.PaymentIntent {
			return stripe.CustomerRefund{}, errors.New("concurrent refund changed frozen identity")
		}
		status, release := "succeeded", successes
		if index == 3 {
			status, release = "pending", stale
		} else if index == 4 {
			status, release = "failed", stale
		}
		arrived <- struct{}{}
		select {
		case <-release:
		case <-network.Done():
			return stripe.CustomerRefund{}, network.Err()
		}
		return response(charge, id, status), nil
	}
	request, cancel := context.WithTimeout(owner.Context, 5*time.Second)
	defer cancel()
	type result struct {
		intent storefront.RefundIntent
		err    error
	}
	results := make(chan result, 4)
	for range 4 {
		go func() {
			intent, problem := service.CancelPaidCustomerOrder(request, user, org, order, key)
			results <- result{intent, problem}
		}()
	}
	for range 4 {
		select {
		case <-arrived:
		case <-request.Done():
			t.Fatal("refund result network dispatch retained database locks")
		}
	}
	finishSuccess()
	var completed storefront.RefundIntent
	for range 2 {
		result := <-results
		if result.err != nil || result.intent.State != "SUCCEEDED" || result.intent.ID != key || result.intent.AmountMinor != 1000 {
			t.Fatalf("concurrent refund success failed: %v", result.err)
		}
		if completed.ID != "" && !reflect.DeepEqual(completed, result.intent) {
			t.Fatal("concurrent refund success returned different durable identities")
		}
		completed = result.intent
	}
	before := privatePreflightSnapshot(t, ctx, organizations, user, org)
	finishStale()
	accepted, conflicts := 0, 0
	for range 2 {
		staleResult := <-results
		switch {
		case staleResult.err == nil && reflect.DeepEqual(staleResult.intent, completed):
			accepted++
		case errors.Is(staleResult.err, storefront.ErrConflict) && reflect.ValueOf(staleResult.intent).IsZero():
			conflicts++
		default:
			t.Fatalf("stale or contradictory evidence returned incorrect result: %v", staleResult.err)
		}
	}
	if accepted != 1 || conflicts != 1 || calls.Load() != 4 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatal("stale or contradictory evidence changed completed refund history")
	}
	review, err := service.CustomerPaymentReview(owner.Context, user, org, order)
	if err != nil || review.Status != "REFUNDED" || !review.StockHoldReleased || review.Attempt.Revision != current.Attempt.Revision+1 {
		t.Fatalf("concurrent refund did not release exact paid hold once: %v", err)
	}
	tx, _, err := organizations.Authorized(ctx, user, org, "storefront.manage")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var observations, events, audits int
	if err = tx.QueryRow(ctx, `SELECT
	 (SELECT count(*) FROM online_refund_observations WHERE organization_id=$1 AND order_id=$2),
	 (SELECT count(*) FROM online_order_events WHERE organization_id=$1 AND order_id=$2 AND status='CANCELLED'),
	 (SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='online_refund.succeeded')`, org, order).Scan(&observations, &events, &audits); err != nil || observations != 2 || events != 1 || audits != 1 {
		t.Fatalf("concurrent refund duplicated journals: observations=%d events=%d audits=%d err=%v", observations, events, audits, err)
	}
	tx.Rollback(ctx)
	if replay, problem := service.CancelPaidCustomerOrder(owner.Context, user, org, order, key); problem != nil || !reflect.DeepEqual(replay, completed) || calls.Load() != 4 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("completed refund replay repeated effects: %v", problem)
	}
}
