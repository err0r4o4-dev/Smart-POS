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

func privateReconciliationPreflightMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string, shop storefront.Settings) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User.ID
	service := &storefront.Service{Organization: organizations}
	variant := seedSourceProduct(t, ctx, organizations, user, org, shop.BranchID, shop.LocationID, shop.LocationID)
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	quote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		t.Fatal(err)
	}
	order, err := service.CreateOrder(ctx, shop.Slug, "d9000000-0000-4000-8000-000000000002", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Private reconciliation buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("4", 64)})
	if err != nil {
		t.Fatal(err)
	}
	payReservationFixture(t, ctx, service, shop.Slug, strings.Repeat("4", 64), order)
	calls := 0
	gateway := &checkoutGatewayFixture{CustomerClient: service.CustomerPayments.(*stripe.CustomerClient)}
	gateway.retrieve = func(context.Context, stripe.CustomerCharge, string) (stripe.CustomerSession, error) {
		calls++
		return stripe.CustomerSession{}, stripe.ErrUnavailable
	}
	service.CustomerPayments = gateway
	input := storefront.PaymentReconciliationInput{OrderID: order.ID, SessionID: "cs_test_reservation"}
	current, err := service.CustomerPaymentReview(owner.Context, user, org, order.ID)
	if err != nil || current.Attempt.SessionID == nil {
		t.Fatal("reconciliation preflight fixture lacks bound payment")
	}
	input.SessionID = *current.Attempt.SessionID
	value, err := service.ReconcileCustomerPayment(context.Background(), user, org, "d9000000-0000-4000-8000-000000000003", input)
	if !errors.Is(err, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() || calls != 0 {
		t.Fatalf("unassured preflight reached provider or disclosed data: %v calls=%d", err, calls)
	}
	key := "d9000000-0000-4000-8000-000000000003"
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
		value, problem := service.ReconcileCustomerPayment(denial.request, denial.actor, org, key, input)
		if !errors.Is(problem, denial.want) || !reflect.ValueOf(value).IsZero() || calls != 0 {
			t.Fatalf("reconciliation preflight session/tenant denial: %v calls=%d", problem, calls)
		}
	}
	for _, status := range []string{"ACTIVE", "SUSPENDED"} {
		privateReadMembership(t, ctx, organizations, user, org, foreign, status)
		want := organization.ErrDenied
		if status == "SUSPENDED" {
			want = storefront.ErrNotFound
		}
		value, problem := service.ReconcileCustomerPayment(guest.Context, foreign, org, key, input)
		if !errors.Is(problem, want) || !reflect.ValueOf(value).IsZero() || calls != 0 {
			t.Fatalf("reconciliation preflight non-Owner denial: %v calls=%d", problem, calls)
		}
	}
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	pinned := &storefront.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}, CustomerPayments: gateway}
	if value, problem := pinned.ReconcileCustomerPayment(owner.Context, user, org, key, input); !errors.Is(problem, storefront.ErrNotFound) || !reflect.ValueOf(value).IsZero() || calls != 0 {
		t.Fatalf("reconciliation preflight crossed pinned organization: %v", problem)
	}
	before := privatePreflightSnapshot(t, ctx, organizations, user, org)
	proof := privateQuoteProof(t, ctx, pool, user)
	for _, expired := range []bool{true, false} {
		verifyPrivateReadWait(t, ctx, pool, owner, "online_orders", expired, func(request context.Context) (any, error) {
			return service.ReconcileCustomerPayment(request, user, org, key, input)
		})
		for _, prefix := range []string{"SELECT id::text,request_fingerprint FROM online_payment_reconciliations", "SELECT request_fingerprint FROM online_payment_dispatches"} {
			verifyPrivateReconciliationPreflightStage(t, ctx, pool, owner, org, key, input, gateway, prefix, expired)
		}
	}
	changed := input
	changed.SessionID = "cs_test_otherPreflightSession"
	if value, problem := service.ReconcileCustomerPayment(owner.Context, user, org, key, changed); !errors.Is(problem, storefront.ErrConflict) || !reflect.ValueOf(value).IsZero() || calls != 0 {
		t.Fatalf("mismatched checkout session reached provider: %v calls=%d", problem, calls)
	}
	if privatePreflightSnapshot(t, ctx, organizations, user, org) != before || privateQuoteProof(t, ctx, pool, user) != proof || calls != 0 {
		t.Fatal("denied preflight changed business/MFA state or called provider")
	}
	gateway.retrieve = func(network context.Context, charge stripe.CustomerCharge, session string) (stripe.CustomerSession, error) {
		calls++
		if !reflect.DeepEqual(charge, current.Attempt.Charge()) || session != input.SessionID {
			return stripe.CustomerSession{}, errors.New("preflight dispatched a different payment tuple")
		}
		deadline, bounded := network.Deadline()
		if !bounded || time.Until(deadline) > 11*time.Second {
			return stripe.CustomerSession{}, errors.New("unbounded reconciliation dispatch")
		}
		probe, cancel := context.WithTimeout(network, 2*time.Second)
		defer cancel()
		tx, _, problem := organizations.Authorized(probe, user, org, "storefront.manage")
		if problem != nil {
			return stripe.CustomerSession{}, problem
		}
		defer tx.Rollback(probe)
		if _, problem = tx.Exec(probe, "SELECT id FROM auth_sessions WHERE id=$1 FOR UPDATE NOWAIT", identity.SessionFromContext(owner.Context).ID); problem != nil {
			return stripe.CustomerSession{}, problem
		}
		return stripe.CustomerSession{}, stripe.ErrUnavailable
	}
	value, err = service.ReconcileCustomerPayment(owner.Context, user, org, key, input)
	if !errors.Is(err, stripe.ErrUnavailable) || !reflect.ValueOf(value).IsZero() || calls != 1 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("assured absent-dispatch preflight failed or retained locks/effects: %v calls=%d", err, calls)
	}
	gateway.retrieve = func(_ context.Context, charge stripe.CustomerCharge, session string) (stripe.CustomerSession, error) {
		calls++
		return paymentFixtureSession(current.Attempt, session, "complete", "paid"), nil
	}
	value, err = service.ReconcileCustomerPayment(owner.Context, user, org, key, input)
	if err != nil || value.ReconciliationID == "" || value.Attempt.AmountMinor != 1000 || calls != 2 {
		t.Fatalf("assured preflight reconciliation fixture: %v calls=%d", err, calls)
	}
	reconciliation := value.ReconciliationID
	before = privatePreflightSnapshot(t, ctx, organizations, user, org)
	for _, expired := range []bool{true, false} {
		verifyPrivateReconciliationPreflightStage(t, ctx, pool, owner, org, key, input, gateway, "SELECT doc.status,attempt.stock_hold_released", expired)
	}
	if value, problem := service.ReconcileCustomerPayment(primary, user, org, key, input); !errors.Is(problem, identity.ErrMFARequired) || !reflect.ValueOf(value).IsZero() || calls != 2 {
		t.Fatalf("primary-only preflight replay: %v calls=%d", problem, calls)
	}
	value, err = service.ReconcileCustomerPayment(owner.Context, user, org, key, input)
	if err != nil || value.ReconciliationID != reconciliation || calls != 2 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before || privateQuoteProof(t, ctx, pool, user) != proof {
		t.Fatalf("assured preflight replay changed identity/state or dispatched: %v calls=%d", err, calls)
	}
	privatePreflightDispatchAcceptance(t, ctx, organizations, owner, org, shop, items, gateway.CustomerClient)
}

func privatePreflightDispatchAcceptance(t *testing.T, ctx context.Context, organizations *organization.Service, owner testsupport.MFASession, org string, shop storefront.Settings, items []storefront.ItemInput, client *stripe.CustomerClient) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User.ID
	calls := 0
	gateway := &checkoutGatewayFixture{CustomerClient: client}
	gateway.create = func(context.Context, stripe.CustomerCharge) (stripe.CustomerSession, error) {
		return stripe.CustomerSession{}, stripe.ErrUnavailable
	}
	gateway.retrieve = func(context.Context, stripe.CustomerCharge, string) (stripe.CustomerSession, error) {
		calls++
		return stripe.CustomerSession{}, stripe.ErrUnavailable
	}
	service := &storefront.Service{Organization: organizations, CustomerPayments: gateway}
	quote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		t.Fatal(err)
	}
	order, err := service.CreateOrder(ctx, shop.Slug, "d9000000-0000-4000-8000-000000000004", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Dispatch preflight buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("5", 64)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.CreateCustomerCheckout(ctx, shop.Slug, storefront.TrackingInput{OrderID: order.ID, AccessToken: strings.Repeat("5", 64)}); !errors.Is(err, stripe.ErrUnavailable) {
		t.Fatalf("preflight dispatch fixture: %v", err)
	}
	input := storefront.PaymentReconciliationInput{OrderID: order.ID, SessionID: "cs_test_preflightDiscovered"}
	key := "d9000000-0000-4000-8000-000000000005"
	before := privatePreflightSnapshot(t, ctx, organizations, user, org)
	base, err := stripe.NewSandbox("sk_test_syntheticDifferentPreflight", "http://localhost:8088")
	if err != nil {
		t.Fatal(err)
	}
	other, err := stripe.NewCustomerClient(base, persistenceSigningSecret, true)
	if err != nil {
		t.Fatal(err)
	}
	for _, fixture := range []struct {
		client *stripe.CustomerClient
		want   error
	}{{nil, stripe.ErrUnavailable}, {other, storefront.ErrConflict}} {
		gateway.CustomerClient = fixture.client
		value, problem := service.ReconcileCustomerPayment(owner.Context, user, org, key, input)
		if !errors.Is(problem, fixture.want) || !reflect.ValueOf(value).IsZero() || calls != 0 {
			t.Fatalf("invalid dispatch fingerprint reached provider: %v calls=%d", problem, calls)
		}
	}
	gateway.CustomerClient = client
	request, cancel := context.WithCancel(owner.Context)
	cancel()
	if value, problem := service.ReconcileCustomerPayment(request, user, org, key, input); !errors.Is(problem, context.Canceled) || !reflect.ValueOf(value).IsZero() || calls != 0 {
		t.Fatalf("canceled preflight dispatched: %v calls=%d", problem, calls)
	}
	value, err := service.ReconcileCustomerPayment(owner.Context, user, org, key, input)
	if !errors.Is(err, stripe.ErrUnavailable) || !reflect.ValueOf(value).IsZero() || calls != 1 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("matching dispatch fingerprint failed or changed state: %v calls=%d", err, calls)
	}
}

func privatePreflightSnapshot(t *testing.T, ctx context.Context, organizations *organization.Service, user, org string) string {
	t.Helper()
	result := privateCatalogSnapshot(t, ctx, organizations, user, org)
	tx, _, err := organizations.Authorized(ctx, user, org, "storefront.manage")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	for _, table := range []string{"online_payment_dispatches", "online_payment_observations"} {
		var digest string
		if err = tx.QueryRow(ctx, "SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM "+table+" t WHERE organization_id=$1", org).Scan(&digest); err != nil {
			t.Fatal(err)
		}
		result += digest
	}
	return result
}

func verifyPrivateReconciliationPreflightStage(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner testsupport.MFASession, org, key string, input storefront.PaymentReconciliationInput, gateway *checkoutGatewayFixture, prefix string, expired bool) {
	t.Helper()
	trace := &privateReadTrace{prefix: prefix, remaining: 1, arrived: make(chan struct{}), release: make(chan struct{})}
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
			result <- errors.New("interrupted reconciliation preflight disclosed private data")
			return
		}
		result <- failure
	}()
	select {
	case <-trace.arrived:
	case <-time.After(5 * time.Second):
		stop()
		t.Fatal("reconciliation preflight did not reach expected query stage")
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
		t.Fatalf("interrupted reconciliation preflight stage: %v", err)
	}
}
