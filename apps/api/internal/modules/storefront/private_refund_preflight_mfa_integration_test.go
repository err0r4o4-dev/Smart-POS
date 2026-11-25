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

func privateRefundPreflightMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string, shop storefront.Settings) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User.ID
	service := &storefront.Service{Organization: organizations}
	variant := seedSourceProduct(t, ctx, organizations, user, org, shop.BranchID, shop.LocationID, shop.LocationID)
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	quote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		t.Fatal(err)
	}
	order, err := service.CreateOrder(ctx, shop.Slug, "dc000000-0000-4000-8000-000000000002", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Refund recovery buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("8", 64)})
	if err != nil {
		t.Fatal(err)
	}
	payReservationFixture(t, ctx, service, shop.Slug, strings.Repeat("8", 64), order)
	creates, retrieves := 0, 0
	gateway := &refundGatewayFixture{CustomerClient: service.CustomerPayments.(*stripe.CustomerClient)}
	gateway.createRefund = func(context.Context, stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
		creates++
		return stripe.CustomerRefund{}, stripe.ErrUnavailable
	}
	gateway.getRefund = func(context.Context, stripe.CustomerRefundCharge, string) (stripe.CustomerRefund, error) {
		retrieves++
		return stripe.CustomerRefund{}, stripe.ErrUnavailable
	}
	service.CustomerPayments = gateway
	key := "dc000000-0000-4000-8000-000000000003"
	if _, err = service.CancelPaidCustomerOrder(owner.Context, user, org, order.ID, key); !errors.Is(err, stripe.ErrUnavailable) || creates != 1 {
		t.Fatalf("refund preflight fixture did not retain unknown intent: %v", err)
	}
	before := privatePreflightSnapshot(t, ctx, organizations, user, org)
	value, err := service.ReconcileCustomerRefund(context.Background(), user, org, order.ID, key, "re_privateRefundPreflight")
	if !errors.Is(err, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() || retrieves != 0 || creates != 1 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("unassured discovered refund reached provider or returned private data: %v creates=%d retrieves=%d", err, creates, retrieves)
	}
	_, token, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, token)
	foreign := identity.SessionFromContext(guest.Context).User.ID
	deny := func(request context.Context, actor, organizationID, orderID, requestKey, providerID string, want error) {
		t.Helper()
		snapshot := privatePreflightSnapshot(t, ctx, organizations, user, org)
		value, problem := service.ReconcileCustomerRefund(request, actor, organizationID, orderID, requestKey, providerID)
		if !errors.Is(problem, want) || !reflect.ValueOf(value).IsZero() || retrieves != 0 || creates != 1 || privatePreflightSnapshot(t, ctx, organizations, user, org) != snapshot {
			t.Fatalf("discovered refund denial returned data, dispatched or changed history: %v", problem)
		}
	}
	deny(primary, user, org, order.ID, key, "re_privateRefundPreflight", identity.ErrMFARequired)
	deny(guest.Context, user, org, order.ID, key, "re_privateRefundPreflight", identity.ErrInvalidToken)
	deny(guest.Context, foreign, org, order.ID, key, "re_privateRefundPreflight", storefront.ErrNotFound)
	for _, status := range []string{"ACTIVE", "SUSPENDED"} {
		privateReadMembership(t, ctx, organizations, user, org, foreign, status)
		want := organization.ErrDenied
		if status == "SUSPENDED" {
			want = storefront.ErrNotFound
		}
		deny(guest.Context, foreign, org, order.ID, key, "re_privateRefundPreflight", want)
	}
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	deny(owner.Context, user, org, order.ID, "dc000000-0000-4000-8000-000000000004", "re_privateRefundPreflight", storefront.ErrConflict)
	deny(owner.Context, user, org, "dc000000-0000-4000-8000-000000000005", key, "re_privateRefundPreflight", storefront.ErrNotFound)
	before = privatePreflightSnapshot(t, ctx, organizations, user, org)
	proof := privateQuoteProof(t, ctx, pool, user)
	pinned := &storefront.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}, CustomerPayments: gateway}
	if value, problem := pinned.ReconcileCustomerRefund(owner.Context, user, org, order.ID, key, "re_privateRefundPreflight"); !errors.Is(problem, storefront.ErrNotFound) || !reflect.ValueOf(value).IsZero() || retrieves != 0 || creates != 1 {
		t.Fatalf("discovered refund crossed pinned organization: %v", problem)
	}
	for _, expired := range []bool{true, false} {
		verifyPrivateReadWait(t, ctx, pool, owner, "online_orders", expired, func(request context.Context) (any, error) {
			return service.ReconcileCustomerRefund(request, user, org, order.ID, key, "re_privateRefundPreflight")
		})
		verifyPrivateRefundPreflightStage(t, ctx, pool, owner, org, order.ID, key, gateway, expired)
	}
	if privatePreflightSnapshot(t, ctx, organizations, user, org) != before || retrieves != 0 || creates != 1 {
		t.Fatal("interrupted discovered preflight dispatched or changed history")
	}
	review, err := service.CustomerPaymentReview(owner.Context, user, org, order.ID)
	if err != nil || review.Attempt.PaymentIntent == nil {
		t.Fatal("discovered refund fixture lacks confirmed payment")
	}
	charge := stripe.CustomerRefundCharge{OrganizationID: org, OrderID: order.ID, RefundID: key, PaymentIntent: *review.Attempt.PaymentIntent, AmountMinor: 1000}
	gateway.getRefund = func(network context.Context, got stripe.CustomerRefundCharge, id string) (stripe.CustomerRefund, error) {
		retrieves++
		if got != charge || id != "re_privateRefundPreflight" {
			return stripe.CustomerRefund{}, errors.New("discovered refund changed immutable charge or provider identity")
		}
		deadline, bounded := network.Deadline()
		if !bounded || time.Until(deadline) > 11*time.Second {
			return stripe.CustomerRefund{}, errors.New("discovered refund lacks bounded context")
		}
		probe, cancel := context.WithTimeout(network, 2*time.Second)
		defer cancel()
		tx, _, problem := organizations.Authorized(probe, user, org, "storefront.manage")
		if problem != nil {
			return stripe.CustomerRefund{}, problem
		}
		defer tx.Rollback(probe)
		if _, problem = tx.Exec(probe, "SELECT id FROM auth_sessions WHERE id=$1 FOR UPDATE NOWAIT", identity.SessionFromContext(owner.Context).ID); problem != nil {
			return stripe.CustomerRefund{}, problem
		}
		return stripe.CustomerRefund{}, stripe.ErrUnavailable
	}
	value, err = service.ReconcileCustomerRefund(owner.Context, user, org, order.ID, key, "re_privateRefundPreflight")
	if !errors.Is(err, stripe.ErrUnavailable) || !reflect.ValueOf(value).IsZero() || retrieves != 1 || creates != 1 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("assured discovered recovery changed intent, dispatched Create or retained locks: %v", err)
	}
	interrupted, stop := context.WithCancel(owner.Context)
	service.CustomerPayments = &refundPreparationCancelGateway{refundGatewayFixture: gateway, cancel: stop}
	value, err = service.ReconcileCustomerRefund(interrupted, user, org, order.ID, key, "re_privateRefundPreflight")
	stop()
	if !errors.Is(err, context.Canceled) || !reflect.ValueOf(value).IsZero() || retrieves != 1 || creates != 1 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("canceled discovered refund reached provider or changed history: %v", err)
	}
	service.CustomerPayments = gateway
	status := "pending"
	gateway.getRefund = func(_ context.Context, got stripe.CustomerRefundCharge, id string) (stripe.CustomerRefund, error) {
		retrieves++
		if got != charge || id != "re_privateRefundPreflight" {
			return stripe.CustomerRefund{}, errors.New("discovered recovery rebound charge or provider")
		}
		return stripe.CustomerRefund{ID: id, Object: "refund", Status: status, AmountMinor: 1000, Currency: "thb", PaymentIntent: charge.PaymentIntent, Metadata: map[string]string{"smartpos_purpose": stripe.CustomerRefundPurpose, "organization_id": org, "order_id": order.ID, "refund_id": key}}, nil
	}
	value, err = service.ReconcileCustomerRefund(owner.Context, user, org, order.ID, key, "re_privateRefundPreflight")
	if err != nil || value.State != "PENDING" || value.ID != key || value.ProviderID == nil || *value.ProviderID != "re_privateRefundPreflight" || retrieves != 2 || creates != 1 {
		t.Fatalf("discovered refund did not bind verified evidence: %v", err)
	}
	before = privatePreflightSnapshot(t, ctx, organizations, user, org)
	if value, problem := service.ReconcileCustomerRefund(owner.Context, user, org, order.ID, key, "re_otherPreflightRefund"); !errors.Is(problem, storefront.ErrConflict) || !reflect.ValueOf(value).IsZero() || retrieves != 2 || creates != 1 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("discovered refund accepted replacement provider identity: %v", problem)
	}
	status = "succeeded"
	value, err = service.ReconcileCustomerRefund(owner.Context, user, org, order.ID, key, "re_privateRefundPreflight")
	if err != nil || value.State != "SUCCEEDED" || retrieves != 3 || creates != 1 {
		t.Fatalf("discovered refund completion fixture failed: %v", err)
	}
	before = privatePreflightSnapshot(t, ctx, organizations, user, org)
	for _, request := range []context.Context{context.Background(), primary} {
		want := identity.ErrInvalidToken
		if request == primary {
			want = identity.ErrMFARequired
		}
		if replay, problem := service.ReconcileCustomerRefund(request, user, org, order.ID, key, "re_privateRefundPreflight"); !errors.Is(problem, want) || !reflect.ValueOf(replay).IsZero() || retrieves != 3 || creates != 1 {
			t.Fatalf("unassured discovered terminal replay disclosed data: %v", problem)
		}
	}
	for _, expired := range []bool{true, false} {
		verifyPrivateRefundPreflightStage(t, ctx, pool, owner, org, order.ID, key, gateway, expired)
	}
	if replay, problem := service.ReconcileCustomerRefund(owner.Context, user, org, order.ID, key, "re_privateRefundPreflight"); problem != nil || !reflect.DeepEqual(replay, value) || retrieves != 3 || creates != 1 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before || privateQuoteProof(t, ctx, pool, user) != proof {
		t.Fatalf("assured discovered terminal replay changed history or dispatched: %v", problem)
	}
}

func verifyPrivateRefundPreflightStage(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner testsupport.MFASession, org, order, key string, gateway *refundGatewayFixture, expired bool) {
	t.Helper()
	trace := &privateReadTrace{prefix: "SELECT id::text,order_id::text,amount_minor,state,provider_id", remaining: 1, arrived: make(chan struct{}), release: make(chan struct{})}
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
		value, failure := service.ReconcileCustomerRefund(request, user, org, order, key, "re_privateRefundPreflight")
		if !reflect.ValueOf(value).IsZero() {
			result <- errors.New("interrupted discovered refund disclosed private intent")
			return
		}
		result <- failure
	}()
	select {
	case <-trace.arrived:
	case <-time.After(5 * time.Second):
		stop()
		t.Fatal("discovered refund did not reach intent query")
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
		t.Fatalf("interrupted discovered refund intent: %v", err)
	}
}
