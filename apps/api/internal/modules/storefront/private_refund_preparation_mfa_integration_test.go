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

func privateRefundPreparationMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string, shop storefront.Settings) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User.ID
	service := &storefront.Service{Organization: organizations}
	variant := seedSourceProduct(t, ctx, organizations, user, org, shop.BranchID, shop.LocationID, shop.LocationID)
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	quote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		t.Fatal(err)
	}
	order, err := service.CreateOrder(ctx, shop.Slug, "db000000-0000-4000-8000-000000000002", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Refund preparation buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("7", 64)})
	if err != nil {
		t.Fatal(err)
	}
	payReservationFixture(t, ctx, service, shop.Slug, strings.Repeat("7", 64), order)
	var calls atomic.Int32
	gateway := &refundGatewayFixture{CustomerClient: service.CustomerPayments.(*stripe.CustomerClient)}
	gateway.createRefund = func(context.Context, stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
		calls.Add(1)
		return stripe.CustomerRefund{}, stripe.ErrUnavailable
	}
	service.CustomerPayments = gateway
	before := privatePreflightSnapshot(t, ctx, organizations, user, org)
	value, err := service.CancelPaidCustomerOrder(context.Background(), user, org, order.ID, "db000000-0000-4000-8000-000000000003")
	if !errors.Is(err, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() || calls.Load() != 0 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("unassured refund preparation retained effects or called provider: %v calls=%d", err, calls.Load())
	}
	key := "db000000-0000-4000-8000-000000000003"
	_, token, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, token)
	foreign := identity.SessionFromContext(guest.Context).User.ID
	for _, denial := range []struct {
		request context.Context
		actor   string
		want    error
	}{{primary, user, identity.ErrMFARequired}, {guest.Context, user, identity.ErrInvalidToken}, {guest.Context, foreign, storefront.ErrNotFound}} {
		value, problem := service.CancelPaidCustomerOrder(denial.request, denial.actor, org, order.ID, key)
		if !errors.Is(problem, denial.want) || !reflect.ValueOf(value).IsZero() || calls.Load() != 0 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("refund preparation session/tenant denial: %v", problem)
		}
	}
	for _, status := range []string{"ACTIVE", "SUSPENDED"} {
		privateReadMembership(t, ctx, organizations, user, org, foreign, status)
		want := organization.ErrDenied
		if status == "SUSPENDED" {
			want = storefront.ErrNotFound
		}
		membershipState := privatePreflightSnapshot(t, ctx, organizations, user, org)
		value, problem := service.CancelPaidCustomerOrder(guest.Context, foreign, org, order.ID, key)
		if !errors.Is(problem, want) || !reflect.ValueOf(value).IsZero() || calls.Load() != 0 || privatePreflightSnapshot(t, ctx, organizations, user, org) != membershipState {
			t.Fatalf("refund preparation non-Owner denial: %v", problem)
		}
	}
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	before = privatePreflightSnapshot(t, ctx, organizations, user, org)
	pinned := &storefront.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}, CustomerPayments: gateway}
	if value, problem := pinned.CancelPaidCustomerOrder(owner.Context, user, org, order.ID, key); !errors.Is(problem, storefront.ErrNotFound) || !reflect.ValueOf(value).IsZero() || calls.Load() != 0 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("refund preparation crossed pinned organization: %v", problem)
	}
	proof := privateQuoteProof(t, ctx, pool, user)
	for _, stage := range []struct {
		prefix string
		count  int
	}{
		{"SELECT branch_id::text FROM online_orders", 1},
		{"SELECT id::text,order_id::text,amount_minor,state,provider_id", 1},
		{"SELECT status,cart_id::text FROM online_orders", 1},
		{"INSERT INTO online_refund_intents", 1},
		{"INSERT INTO organization_audit_events", 1},
		{"SELECT id::text,order_id::text,amount_minor,state,provider_id", 2},
	} {
		for _, expired := range []bool{true, false} {
			verifyPrivateRefundPreparationStage(t, ctx, pool, owner, org, order.ID, key, gateway, stage.prefix, stage.count, expired)
			if calls.Load() != 0 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("interrupted refund preparation stage=%q/%d expired=%t retained effects or dispatched, calls=%d", stage.prefix, stage.count, expired, calls.Load())
			}
		}
	}
	review, err := service.CustomerPaymentReview(owner.Context, user, org, order.ID)
	if err != nil || review.Attempt.PaymentIntent == nil {
		t.Fatal("refund preparation fixture lacks confirmed payment")
	}
	charge := stripe.CustomerRefundCharge{OrganizationID: org, OrderID: order.ID, RefundID: key, PaymentIntent: *review.Attempt.PaymentIntent, AmountMinor: 1000}
	fingerprint, err := gateway.CustomerRefundFingerprint(charge)
	if err != nil {
		t.Fatal(err)
	}
	arrived, release := make(chan struct{}, 2), make(chan struct{})
	finish := sync.OnceFunc(func() { close(release) })
	defer finish()
	gateway.createRefund = func(network context.Context, got stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
		calls.Add(1)
		if got != charge {
			return stripe.CustomerRefund{}, errors.New("refund preparation changed frozen amount or identity")
		}
		deadline, bounded := network.Deadline()
		if !bounded || time.Until(deadline) > 11*time.Second {
			return stripe.CustomerRefund{}, errors.New("refund dispatch lacks bounded context")
		}
		tx, _, problem := organizations.Authorized(network, user, org, "storefront.manage")
		if problem != nil {
			return stripe.CustomerRefund{}, problem
		}
		defer tx.Rollback(network)
		var durable bool
		problem = tx.QueryRow(network, `SELECT EXISTS(SELECT 1 FROM online_refund_intents WHERE organization_id=$1 AND order_id=$2 AND id=$3 AND actor_id=$4 AND purpose='CANCEL_BEFORE_SHIPMENT' AND amount_minor=1000 AND payment_intent=$5 AND request_fingerprint=$6 AND state='REQUESTED' AND provider_id IS NULL) AND (SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='online_refund.requested')=1`, org, order.ID, key, user, charge.PaymentIntent, fingerprint).Scan(&durable)
		tx.Rollback(network)
		if problem != nil || !durable {
			return stripe.CustomerRefund{}, errors.New("refund dispatched before exact intent and audit committed")
		}
		arrived <- struct{}{}
		select {
		case <-release:
		case <-network.Done():
			return stripe.CustomerRefund{}, network.Err()
		}
		return stripe.CustomerRefund{}, stripe.ErrUnavailable
	}
	request, cancel := context.WithTimeout(owner.Context, 5*time.Second)
	defer cancel()
	results := make(chan error, 2)
	for range 2 {
		go func() {
			value, failure := service.CancelPaidCustomerOrder(request, user, org, order.ID, key)
			if !reflect.ValueOf(value).IsZero() {
				results <- errors.New("unknown refund dispatch returned a private partial result")
				return
			}
			results <- failure
		}()
	}
	for range 2 {
		select {
		case <-arrived:
		case <-request.Done():
			t.Fatal("refund preparation held locks across dispatch")
		}
	}
	finish()
	for range 2 {
		if problem := <-results; !errors.Is(problem, stripe.ErrUnavailable) {
			t.Fatalf("concurrent refund preparation: %v", problem)
		}
	}
	if calls.Load() != 2 {
		t.Fatal("concurrent refund preparation did not dispatch both immutable retries")
	}
	before = privatePreflightSnapshot(t, ctx, organizations, user, org)
	gateway.createRefund = func(_ context.Context, got stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
		calls.Add(1)
		if got != charge {
			return stripe.CustomerRefund{}, errors.New("refund recovery changed original charge")
		}
		return stripe.CustomerRefund{}, stripe.ErrUnavailable
	}
	if value, problem := service.CancelPaidCustomerOrder(owner.Context, user, org, order.ID, key); !errors.Is(problem, stripe.ErrUnavailable) || !reflect.ValueOf(value).IsZero() || calls.Load() != 3 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("refund recovery changed its durable request: %v", problem)
	}
	if value, problem := service.CancelPaidCustomerOrder(owner.Context, user, org, order.ID, "db000000-0000-4000-8000-000000000004"); !errors.Is(problem, storefront.ErrConflict) || !reflect.ValueOf(value).IsZero() || calls.Load() != 3 {
		t.Fatalf("refund preparation accepted a competing key: %v", problem)
	}
	for _, expired := range []bool{true, false} {
		verifyPrivateRefundPreparationStage(t, ctx, pool, owner, org, order.ID, key, gateway, "SELECT id::text,order_id::text,amount_minor,state,provider_id", 1, expired)
		if calls.Load() != 3 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatal("interrupted refund replay changed history or dispatched")
		}
	}
	interrupted, stop := context.WithCancel(owner.Context)
	service.CustomerPayments = &refundPreparationCancelGateway{refundGatewayFixture: gateway, cancel: stop}
	value, err = service.CancelPaidCustomerOrder(interrupted, user, org, order.ID, key)
	stop()
	if !errors.Is(err, context.Canceled) || !reflect.ValueOf(value).IsZero() || calls.Load() != 3 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("canceled refund preparation reached dispatch or lost durable identity: %v calls=%d", err, calls.Load())
	}
	service.CustomerPayments = gateway
	gateway.createRefund = func(_ context.Context, got stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
		calls.Add(1)
		if got != charge {
			return stripe.CustomerRefund{}, errors.New("refund completion changed original charge")
		}
		return stripe.CustomerRefund{ID: "re_privateRefundPreparation", Object: "refund", Status: "succeeded", AmountMinor: got.AmountMinor, Currency: "thb", PaymentIntent: got.PaymentIntent, Metadata: map[string]string{"smartpos_purpose": stripe.CustomerRefundPurpose, "organization_id": org, "order_id": order.ID, "refund_id": key}}, nil
	}
	value, err = service.CancelPaidCustomerOrder(owner.Context, user, org, order.ID, key)
	if err != nil || value.State != "SUCCEEDED" || value.ID != key || value.AmountMinor != 1000 || value.RequestFingerprint != fingerprint || calls.Load() != 4 {
		t.Fatalf("refund preparation lost completion identity: %v", err)
	}
	before = privatePreflightSnapshot(t, ctx, organizations, user, org)
	if replay, problem := service.CancelPaidCustomerOrder(owner.Context, user, org, order.ID, key); problem != nil || !reflect.DeepEqual(replay, value) || calls.Load() != 4 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("terminal refund replay changed intent or dispatched again: %v", problem)
	}
	if privateQuoteProof(t, ctx, pool, user) != proof {
		t.Fatal("refund preparation consumed MFA proof")
	}
}

type refundPreparationCancelGateway struct {
	*refundGatewayFixture
	cancel context.CancelFunc
}

func (gateway *refundPreparationCancelGateway) CustomerRefundFingerprint(charge stripe.CustomerRefundCharge) (string, error) {
	fingerprint, err := gateway.CustomerClient.CustomerRefundFingerprint(charge)
	gateway.cancel()
	return fingerprint, err
}

func verifyPrivateRefundPreparationStage(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner testsupport.MFASession, org, order, key string, gateway *refundGatewayFixture, prefix string, count int, expired bool) {
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
		value, failure := service.CancelPaidCustomerOrder(request, user, org, order, key)
		if !reflect.ValueOf(value).IsZero() {
			result <- errors.New("interrupted refund preparation disclosed partial data")
			return
		}
		result <- failure
	}()
	select {
	case <-trace.arrived:
	case <-time.After(5 * time.Second):
		stop()
		t.Fatal("refund preparation did not reach expected query stage")
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
		t.Fatalf("interrupted refund preparation stage: %v", err)
	}
}
