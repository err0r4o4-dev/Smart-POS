package storefront_test

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/stripe"
)

type checkoutGatewayFixture struct {
	*stripe.CustomerClient
	create   func(context.Context, stripe.CustomerCharge) (stripe.CustomerSession, error)
	retrieve func(context.Context, stripe.CustomerCharge, string) (stripe.CustomerSession, error)
}

func (gateway *checkoutGatewayFixture) CreateCustomerCheckout(ctx context.Context, charge stripe.CustomerCharge) (stripe.CustomerSession, error) {
	return gateway.create(ctx, charge)
}

func (gateway *checkoutGatewayFixture) RetrieveCustomerCheckout(ctx context.Context, charge stripe.CustomerCharge, id string) (stripe.CustomerSession, error) {
	return gateway.retrieve(ctx, charge, id)
}

func paymentCheckoutAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, foreignOrg string) {
	test.Helper()
	base, err := stripe.NewSandbox("sk_test_syntheticCheckout", "http://localhost:8088")
	if err != nil {
		test.Fatal(err)
	}
	client, err := stripe.NewCustomerClient(base, persistenceSigningSecret, true)
	if err != nil {
		test.Fatal(err)
	}
	gateway := &checkoutGatewayFixture{CustomerClient: client}
	service := &storefront.Service{Organization: organizations, CustomerPayments: gateway}
	variant := seedSourceProduct(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, shop.LocationID)
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	var inputs []storefront.TrackingInput
	for _, key := range []string{"8a222222-2222-4222-8222-222222222222", "8a333333-3333-4333-8333-333333333333", "8a444444-4444-4444-8444-444444444444"} {
		quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
		if problem != nil {
			test.Fatal(problem)
		}
		input := storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic checkout buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("8", 64)}
		order, problem := service.CreateOrder(ctx, shop.Slug, key, input)
		if problem != nil {
			test.Fatal(problem)
		}
		inputs = append(inputs, storefront.TrackingInput{OrderID: order.ID, AccessToken: input.AccessToken})
	}
	checkExternalBoundary := func(network context.Context, order string) error {
		deadline, valid := network.Deadline()
		if !valid || time.Until(deadline) > 11*time.Second {
			return errors.New("provider call lacks a bounded deadline")
		}
		probe, cancel := context.WithTimeout(network, 2*time.Second)
		defer cancel()
		tx, _, problem := organizations.Authorized(probe, owner, org, "storefront.manage")
		if problem != nil {
			return errors.New("provider call held organization transaction open")
		}
		defer tx.Rollback(probe)
		var dispatched bool
		problem = tx.QueryRow(probe, "SELECT EXISTS(SELECT 1 FROM online_payment_dispatches WHERE organization_id=$1 AND order_id=$2)", org, order).Scan(&dispatched)
		if problem != nil || !dispatched {
			return errors.New("provider call preceded durable dispatch")
		}
		return nil
	}
	var firstCharge stripe.CustomerCharge
	calls := 0
	getCalls := 0
	gateway.retrieve = func(context.Context, stripe.CustomerCharge, string) (stripe.CustomerSession, error) {
		getCalls++
		return stripe.CustomerSession{}, stripe.ErrUnavailable
	}
	gateway.create = func(network context.Context, charge stripe.CustomerCharge) (stripe.CustomerSession, error) {
		calls++
		if problem := checkExternalBoundary(network, charge.OrderID); problem != nil {
			return stripe.CustomerSession{}, problem
		}
		if calls == 1 {
			firstCharge = charge
			return stripe.CustomerSession{}, stripe.ErrUnavailable
		}
		if charge != firstCharge {
			return stripe.CustomerSession{}, errors.New("unknown outcome changed frozen charge")
		}
		return paymentFixtureSession(storefront.PaymentAttempt{OrganizationID: org, OrderID: charge.OrderID, Slug: charge.Slug, AmountMinor: charge.AmountMinor, ExpiresAt: charge.ExpiresAt}, "cs_test_checkoutA", "open", "unpaid"), nil
	}
	test.Run("unknown create commits dispatch and retains frozen attempt and hold", func(test *testing.T) {
		if _, problem := service.CreateCustomerCheckout(ctx, shop.Slug, inputs[0]); !errors.Is(problem, stripe.ErrUnavailable) || calls != 1 {
			test.Fatalf("unknown create dispatch: calls=%d error=%v", calls, problem)
		}
		attempt, problem := service.CustomerPayment(ctx, shop.Slug, inputs[0])
		if problem != nil || attempt.State != "REQUESTED" || attempt.SessionID != nil {
			test.Fatalf("unknown outcome changed payment state: %+v %v", attempt, problem)
		}
		assertSourceStock(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, variant, "3.000", "3.000", "0.000")
	})
	test.Run("unknown session recovery never guesses a provider session", func(test *testing.T) {
		if _, problem := service.RecoverCustomerCheckout(ctx, shop.Slug, inputs[0]); !errors.Is(problem, storefront.ErrConflict) || getCalls != 0 {
			test.Fatalf("unknown session retrieval: calls=%d %v", getCalls, problem)
		}
	})
	test.Run("configuration drift blocks an unknown-outcome create replay", func(test *testing.T) {
		changed, problem := stripe.NewSandbox("sk_test_changedCredential", "http://localhost:8089")
		if problem != nil {
			test.Fatal(problem)
		}
		other, problem := stripe.NewCustomerClient(changed, persistenceSigningSecret, true)
		if problem != nil {
			test.Fatal(problem)
		}
		gateway.CustomerClient = other
		defer func() { gateway.CustomerClient = client }()
		if _, problem = service.CreateCustomerCheckout(ctx, shop.Slug, inputs[0]); !errors.Is(problem, storefront.ErrConflict) || calls != 1 {
			test.Fatalf("changed request dispatched: calls=%d %v", calls, problem)
		}
	})
	var checkout storefront.CustomerCheckout
	test.Run("paused storefront blocks unknown create replay without releasing stock", func(test *testing.T) {
		paused, problem := service.SaveSettings(ctx, owner, org, storefront.SettingsInput{Slug: shop.Slug, Name: shop.Name, TerminalID: shop.TerminalID, Published: true, AcceptingOrders: false, Revision: shop.Revision})
		if problem != nil {
			test.Fatal(problem)
		}
		_, replayProblem := service.CreateCustomerCheckout(ctx, shop.Slug, inputs[0])
		restored, problem := service.SaveSettings(ctx, owner, org, storefront.SettingsInput{Slug: shop.Slug, Name: shop.Name, TerminalID: shop.TerminalID, Published: true, AcceptingOrders: true, Revision: paused.Revision})
		if problem != nil {
			test.Fatal(problem)
		}
		shop.Revision = restored.Revision
		if !errors.Is(replayProblem, storefront.ErrConflict) || calls != 1 {
			test.Fatalf("paused storefront created checkout: calls=%d %v", calls, replayProblem)
		}
	})
	if !test.Run("unchanged retry binds the same payment identity outside a transaction", func(test *testing.T) {
		var problem error
		checkout, problem = service.CreateCustomerCheckout(ctx, shop.Slug, inputs[0])
		if problem != nil || checkout.Attempt.State != "OPEN" || checkout.URL == "" || calls != 2 {
			test.Fatalf("safe create retry: %+v calls=%d %v", checkout, calls, problem)
		}
	}) {
		return
	}
	gateway.retrieve = func(network context.Context, charge stripe.CustomerCharge, id string) (stripe.CustomerSession, error) {
		getCalls++
		if problem := checkExternalBoundary(network, charge.OrderID); problem != nil {
			return stripe.CustomerSession{}, problem
		}
		return paymentFixtureSession(checkout.Attempt, id, "complete", "paid"), nil
	}
	test.Run("known-session retry retrieves and journals paid without a fake webhook", func(test *testing.T) {
		result, problem := service.CreateCustomerCheckout(ctx, shop.Slug, inputs[0])
		if problem != nil || result.Attempt.State != "PAID" || result.URL != "" || calls != 2 {
			test.Fatalf("retrieval recovery: %+v %v", result, problem)
		}
		replay, problem := service.RecoverCustomerCheckout(ctx, shop.Slug, inputs[0])
		if problem != nil || replay.Attempt.Revision != result.Attempt.Revision {
			test.Fatalf("retrieval replay changed state: %+v %v", replay, problem)
		}
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var events, observations int
		if problem = tx.QueryRow(ctx, "SELECT (SELECT count(*) FROM online_payment_inbox WHERE organization_id=$1),(SELECT count(*) FROM online_payment_observations WHERE organization_id=$1 AND order_id=$2)", org, inputs[0].OrderID).Scan(&events, &observations); problem != nil || events != 0 || observations != 2 {
			test.Fatalf("observation journal: events=%d observations=%d %v", events, observations, problem)
		}
	})
	test.Run("private tracking denial and cancellation precede provider calls", func(test *testing.T) {
		before := getCalls
		wrong := inputs[0]
		wrong.AccessToken = strings.Repeat("9", 64)
		if _, problem := service.RecoverCustomerCheckout(ctx, shop.Slug, wrong); !errors.Is(problem, storefront.ErrNotFound) {
			test.Fatalf("wrong tracking credential: %v", problem)
		}
		foreign := &storefront.Service{Organization: &organization.Service{Pool: organizations.Pool, SingleStoreOrganizationID: foreignOrg}, CustomerPayments: gateway}
		if _, problem := foreign.RecoverCustomerCheckout(ctx, shop.Slug, inputs[0]); !errors.Is(problem, storefront.ErrNotFound) {
			test.Fatalf("foreign single-store scope: %v", problem)
		}
		cancelled, cancel := context.WithCancel(ctx)
		cancel()
		if _, problem := service.RecoverCustomerCheckout(cancelled, shop.Slug, inputs[0]); !errors.Is(problem, context.Canceled) {
			test.Fatalf("cancelled recovery: %v", problem)
		}
		if getCalls != before {
			test.Fatal("denied/cancelled request reached provider")
		}
	})
	test.Run("default-off checkout retains authoritative known-session recovery", func(test *testing.T) {
		disabled, problem := stripe.NewCustomerClient(base, persistenceSigningSecret, false)
		if problem != nil {
			test.Fatal(problem)
		}
		gateway.CustomerClient = disabled
		defer func() { gateway.CustomerClient = client }()
		if _, problem = service.CreateCustomerCheckout(ctx, shop.Slug, inputs[0]); !errors.Is(problem, stripe.ErrUnavailable) {
			test.Fatalf("disabled create: %v", problem)
		}
		result, problem := service.RecoverCustomerCheckout(ctx, shop.Slug, inputs[0])
		if problem != nil || result.Attempt.State != "PAID" {
			test.Fatalf("disabled recovery: %+v %v", result, problem)
		}
	})
	test.Run("retrieval mismatch rolls back observations and preserves paid intent", func(test *testing.T) {
		original := gateway.retrieve
		defer func() { gateway.retrieve = original }()
		gateway.retrieve = func(_ context.Context, charge stripe.CustomerCharge, id string) (stripe.CustomerSession, error) {
			session := paymentFixtureSession(checkout.Attempt, id, "complete", "paid")
			session.PaymentIntent = "pi_conflictingIntent"
			return session, nil
		}
		if _, problem := service.RecoverCustomerCheckout(ctx, shop.Slug, inputs[0]); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("changed intent accepted: %v", problem)
		}
		gateway.retrieve = func(_ context.Context, charge stripe.CustomerCharge, id string) (stripe.CustomerSession, error) {
			session := paymentFixtureSession(checkout.Attempt, id, "complete", "paid")
			session.AmountMinor++
			return session, nil
		}
		if _, problem := service.RecoverCustomerCheckout(ctx, shop.Slug, inputs[0]); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("changed charge accepted: %v", problem)
		}
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var count int
		if problem = tx.QueryRow(ctx, "SELECT count(*) FROM online_payment_observations WHERE organization_id=$1 AND order_id=$2", org, inputs[0].OrderID).Scan(&count); problem != nil || count != 2 {
			test.Fatalf("failed retrieval leaked observation: %d %v", count, problem)
		}
	})
	test.Run("stale expired retrieval cannot downgrade paid or release stock", func(test *testing.T) {
		original := gateway.retrieve
		defer func() { gateway.retrieve = original }()
		gateway.retrieve = func(_ context.Context, charge stripe.CustomerCharge, id string) (stripe.CustomerSession, error) {
			return paymentFixtureSession(checkout.Attempt, id, "expired", "unpaid"), nil
		}
		result, problem := service.RecoverCustomerCheckout(ctx, shop.Slug, inputs[0])
		if problem != nil || result.Attempt.State != "PAID" || result.URL != "" {
			test.Fatalf("stale retrieval downgraded paid: %+v %v", result, problem)
		}
	})
	fromCharge := func(charge stripe.CustomerCharge) storefront.PaymentAttempt {
		return storefront.PaymentAttempt{OrganizationID: charge.OrganizationID, OrderID: charge.OrderID, Slug: charge.Slug, AmountMinor: charge.AmountMinor, ExpiresAt: charge.ExpiresAt}
	}
	var paidResponse storefront.CustomerCheckout
	test.Run("create response alone never grants terminal paid evidence", func(test *testing.T) {
		gateway.create = func(network context.Context, charge stripe.CustomerCharge) (stripe.CustomerSession, error) {
			if problem := checkExternalBoundary(network, charge.OrderID); problem != nil {
				return stripe.CustomerSession{}, problem
			}
			return paymentFixtureSession(fromCharge(charge), "cs_test_checkoutB", "complete", "paid"), nil
		}
		var problem error
		paidResponse, problem = service.CreateCustomerCheckout(ctx, shop.Slug, inputs[1])
		if problem != nil || paidResponse.Attempt.State != "PROCESSING" || paidResponse.Attempt.PaymentIntent != nil || paidResponse.URL != "" {
			test.Fatalf("create response granted paid: %+v %v", paidResponse, problem)
		}
		rejectSourceWrite(test, ctx, organizations, owner, org, "UPDATE online_payment_attempts SET state='PAID',payment_intent='pi_checkoutB',revision=revision+1 WHERE organization_id=$1 AND order_id=$2", org, inputs[1].OrderID)
	})
	test.Run("paid create hint prevents contradictory expiry from releasing a hold", func(test *testing.T) {
		gateway.retrieve = func(_ context.Context, charge stripe.CustomerCharge, id string) (stripe.CustomerSession, error) {
			return paymentFixtureSession(fromCharge(charge), id, "expired", "unpaid"), nil
		}
		if _, problem := service.RecoverCustomerCheckout(ctx, shop.Slug, inputs[1]); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("contradictory expiry released paid hint: %v", problem)
		}
		session := paymentFixtureSession(paidResponse.Attempt, "cs_test_checkoutB", "expired", "unpaid")
		body := paymentFixtureEvent(test, "evt_checkoutContradiction", "checkout.session.expired", session)
		now := time.Now()
		if _, problem := service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("contradictory webhook released paid hint: %v", problem)
		}
		gateway.retrieve = func(_ context.Context, charge stripe.CustomerCharge, id string) (stripe.CustomerSession, error) {
			return paymentFixtureSession(fromCharge(charge), id, "complete", "paid"), nil
		}
		result, problem := service.RecoverCustomerCheckout(ctx, shop.Slug, inputs[1])
		if problem != nil || result.Attempt.State != "PAID" {
			test.Fatalf("paid hint could not reconcile: %+v %v", result, problem)
		}
	})
	test.Run("invalid create response exposes no session or committed observation", func(test *testing.T) {
		gateway.create = func(network context.Context, charge stripe.CustomerCharge) (stripe.CustomerSession, error) {
			if problem := checkExternalBoundary(network, charge.OrderID); problem != nil {
				return stripe.CustomerSession{}, problem
			}
			session := paymentFixtureSession(fromCharge(charge), "cs_test_checkoutC", "open", "unpaid")
			session.AmountMinor++
			return session, nil
		}
		result, problem := service.CreateCustomerCheckout(ctx, shop.Slug, inputs[2])
		if !errors.Is(problem, storefront.ErrConflict) || result.URL != "" || result.Attempt.SessionID != nil {
			test.Fatalf("invalid response escaped validation: %+v %v", result, problem)
		}
	})
	test.Run("lost response commit keeps dispatch and replays the exact create", func(test *testing.T) {
		request, cancel := context.WithCancel(ctx)
		defer cancel()
		var originalCharge stripe.CustomerCharge
		createCalls := 0
		gateway.create = func(network context.Context, charge stripe.CustomerCharge) (stripe.CustomerSession, error) {
			createCalls++
			if problem := checkExternalBoundary(network, charge.OrderID); problem != nil {
				return stripe.CustomerSession{}, problem
			}
			if createCalls == 1 {
				originalCharge = charge
				cancel()
			} else if originalCharge != charge {
				return stripe.CustomerSession{}, errors.New("lost response retry changed charge")
			}
			return paymentFixtureSession(fromCharge(charge), "cs_test_checkoutC", "complete", "unpaid"), nil
		}
		if _, problem := service.CreateCustomerCheckout(request, shop.Slug, inputs[2]); !errors.Is(problem, context.Canceled) {
			test.Fatalf("response commit was not cancelled: %v", problem)
		}
		attempt, problem := service.CustomerPayment(ctx, shop.Slug, inputs[2])
		if problem != nil || attempt.State != "REQUESTED" || attempt.SessionID != nil {
			test.Fatalf("cancelled commit partially bound: %+v %v", attempt, problem)
		}
		result, problem := service.CreateCustomerCheckout(ctx, shop.Slug, inputs[2])
		if problem != nil || result.Attempt.State != "PROCESSING" || createCalls != 2 {
			test.Fatalf("lost response recovery: %+v calls=%d %v", result, createCalls, problem)
		}
	})
	test.Run("retrieved expiry releases safely and late paid cannot revive cancelled stock", func(test *testing.T) {
		gateway.retrieve = func(_ context.Context, charge stripe.CustomerCharge, id string) (stripe.CustomerSession, error) {
			return paymentFixtureSession(fromCharge(charge), id, "expired", "unpaid"), nil
		}
		result, problem := service.RecoverCustomerCheckout(ctx, shop.Slug, inputs[2])
		if problem != nil || result.Attempt.State != "EXPIRED" {
			test.Fatalf("retrieved expiry: %+v %v", result, problem)
		}
		order, problem := service.Order(ctx, owner, org, inputs[2].OrderID)
		if problem != nil {
			test.Fatal(problem)
		}
		if _, problem = service.Transition(ctx, owner, org, order.ID, storefront.TransitionInput{Status: "CANCELLED", Message: "Synthetic retrieved expiry", Revision: order.Revision}); problem != nil {
			test.Fatal(problem)
		}
		gateway.retrieve = func(_ context.Context, charge stripe.CustomerCharge, id string) (stripe.CustomerSession, error) {
			return paymentFixtureSession(fromCharge(charge), id, "complete", "paid"), nil
		}
		result, problem = service.RecoverCustomerCheckout(ctx, shop.Slug, inputs[2])
		if problem != nil || result.Attempt.State != "PAID" {
			test.Fatalf("late retrieval paid: %+v %v", result, problem)
		}
		assertSourceStock(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, variant, "3.000", "2.000", "1.000")
	})
	makeOrder := func(test *testing.T, key string) storefront.TrackingInput {
		test.Helper()
		quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
		if problem != nil {
			test.Fatal(problem)
		}
		input := storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic recovery buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("8", 64)}
		order, problem := service.CreateOrder(ctx, shop.Slug, key, input)
		if problem != nil {
			test.Fatal(problem)
		}
		return storefront.TrackingInput{OrderID: order.ID, AccessToken: input.AccessToken}
	}
	releaseFixture := func(test *testing.T, input storefront.TrackingInput, sessionID, eventID string) {
		test.Helper()
		attempt, problem := service.CustomerPayment(ctx, shop.Slug, input)
		if problem != nil {
			test.Fatal(problem)
		}
		body := paymentFixtureEvent(test, eventID, "checkout.session.expired", paymentFixtureSession(attempt, sessionID, "expired", "unpaid"))
		now := time.Now()
		if _, problem = service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); problem != nil {
			test.Fatal(problem)
		}
		order, problem := service.Order(ctx, owner, org, input.OrderID)
		if problem != nil {
			test.Fatal(problem)
		}
		if _, problem = service.Transition(ctx, owner, org, order.ID, storefront.TransitionInput{Status: "CANCELLED", Message: "Synthetic resolved fixture", Revision: order.Revision}); problem != nil {
			test.Fatal(problem)
		}
	}
	test.Run("unsupported create window blocks dispatch without resetting expiry", func(test *testing.T) {
		input := makeOrder(test, "8a555555-5555-4555-8555-555555555555")
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		_, problem = tx.Exec(ctx, `INSERT INTO online_payment_attempts(organization_id,order_id,slug,amount_minor,expires_at) VALUES($1,$2,$3,1000,date_trunc('second',now()+interval '30 minutes 30 seconds'))`, org, input.OrderID, shop.Slug)
		if problem != nil {
			test.Fatal(problem)
		}
		if problem = tx.Commit(ctx); problem != nil {
			test.Fatal(problem)
		}
		unexpected := 0
		gateway.create = func(context.Context, stripe.CustomerCharge) (stripe.CustomerSession, error) {
			unexpected++
			return stripe.CustomerSession{}, stripe.ErrUnavailable
		}
		if _, problem = service.CreateCustomerCheckout(ctx, shop.Slug, input); !errors.Is(problem, storefront.ErrConflict) || unexpected != 0 {
			test.Fatalf("unsupported expiry dispatched: %d %v", unexpected, problem)
		}
		releaseFixture(test, input, "cs_test_checkoutShort", "evt_checkoutShortExpired")
		test.Run("bound webhook session recovers without a create-dispatch row", func(test *testing.T) {
			result, problem := service.RecoverCustomerCheckout(ctx, shop.Slug, input)
			if problem != nil || result.Attempt.State != "PAID" || result.URL != "" {
				test.Fatalf("webhook-only session recovery: %+v %v", result, problem)
			}
		})
	})
	test.Run("aged unknown dispatch cannot be replayed after retention safety bound", func(test *testing.T) {
		input := makeOrder(test, "8a666666-6666-4666-8666-666666666666")
		attempt, problem := service.BeginCustomerPayment(ctx, shop.Slug, input)
		if problem != nil {
			test.Fatal(problem)
		}
		fingerprint, problem := client.CustomerRequestFingerprint(attempt.Charge())
		if problem != nil {
			test.Fatal(problem)
		}
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		if _, problem = tx.Exec(ctx, "INSERT INTO online_payment_dispatches(organization_id,order_id,request_fingerprint,created_at) VALUES($1,$2,$3,now()-interval '24 hours')", org, input.OrderID, fingerprint); problem != nil {
			test.Fatal(problem)
		}
		if problem = tx.Commit(ctx); problem != nil {
			test.Fatal(problem)
		}
		if _, problem = service.CreateCustomerCheckout(ctx, shop.Slug, input); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("aged unknown create was retried: %v", problem)
		}
		releaseFixture(test, input, "cs_test_checkoutAged", "evt_checkoutAgedExpired")
	})
	test.Run("concurrent identical creates accept early webhook without redirect or double binding", func(test *testing.T) {
		input := makeOrder(test, "8a777777-7777-4777-8777-777777777777")
		attempt, problem := service.BeginCustomerPayment(ctx, shop.Slug, input)
		if problem != nil {
			test.Fatal(problem)
		}
		body := paymentFixtureEvent(test, "evt_checkoutConcurrentPaid", "checkout.session.completed", paymentFixtureSession(attempt, "cs_test_checkoutConcurrent", "complete", "paid"))
		now := time.Now()
		entered := make(chan struct{}, 2)
		release := make(chan struct{})
		var releaseOnce, webhookOnce sync.Once
		var webhookError error
		var creates atomic.Int32
		defer releaseOnce.Do(func() { close(release) })
		gateway.create = func(network context.Context, charge stripe.CustomerCharge) (stripe.CustomerSession, error) {
			creates.Add(1)
			if problem := checkExternalBoundary(network, charge.OrderID); problem != nil {
				return stripe.CustomerSession{}, problem
			}
			if charge != attempt.Charge() {
				return stripe.CustomerSession{}, errors.New("concurrent create changed frozen identity")
			}
			entered <- struct{}{}
			select {
			case <-release:
			case <-network.Done():
				return stripe.CustomerSession{}, network.Err()
			}
			webhookOnce.Do(func() {
				_, webhookError = service.AcceptCustomerWebhook(network, body, paymentSignature(body, now), now)
			})
			if webhookError != nil {
				return stripe.CustomerSession{}, webhookError
			}
			return paymentFixtureSession(attempt, "cs_test_checkoutConcurrent", "open", "unpaid"), nil
		}
		type result struct {
			checkout storefront.CustomerCheckout
			err      error
		}
		results := make(chan result, 2)
		request, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		for index := 0; index < 2; index++ {
			go func() {
				checkout, problem := service.CreateCustomerCheckout(request, shop.Slug, input)
				results <- result{checkout, problem}
			}()
		}
		for index := 0; index < 2; index++ {
			select {
			case <-entered:
			case <-request.Done():
				test.Fatal("concurrent creates did not reach the provider outside transactions")
			}
		}
		releaseOnce.Do(func() { close(release) })
		for index := 0; index < 2; index++ {
			select {
			case result := <-results:
				if result.err != nil || result.checkout.Attempt.State != "PAID" || result.checkout.URL != "" {
					test.Fatalf("early webhook/create race: %+v %v", result.checkout, result.err)
				}
			case <-request.Done():
				test.Fatal("concurrent create responses did not complete")
			}
		}
		if creates.Load() != 2 {
			test.Fatalf("unexpected create count: %d", creates.Load())
		}
	})
	test.Run("runtime RLS and append-only grants protect recovery journals", func(test *testing.T) {
		var unscoped, forced int
		problem := organizations.Pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM online_payment_dispatches)+(SELECT count(*) FROM online_payment_observations),
 (SELECT count(*) FROM pg_class WHERE relname IN ('online_payment_dispatches','online_payment_observations') AND relrowsecurity AND relforcerowsecurity)`).Scan(&unscoped, &forced)
		if problem != nil || unscoped != 0 || forced != 2 {
			test.Fatalf("unscoped recovery journals: %d %d %v", unscoped, forced, problem)
		}
		tx, _, problem := organizations.Authorized(ctx, owner, foreignOrg, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var foreign int
		if problem = tx.QueryRow(ctx, "SELECT (SELECT count(*) FROM online_payment_dispatches)+(SELECT count(*) FROM online_payment_observations)").Scan(&foreign); problem != nil || foreign != 0 {
			test.Fatalf("foreign recovery journals: %d %v", foreign, problem)
		}
		if problem = tx.Rollback(ctx); problem != nil {
			test.Fatal(problem)
		}
		for _, statement := range []string{"UPDATE online_payment_dispatches SET request_fingerprint=repeat('0',64)", "DELETE FROM online_payment_dispatches", "UPDATE online_payment_observations SET outcome='PAID'", "DELETE FROM online_payment_observations"} {
			write, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
			if problem != nil {
				test.Fatal(problem)
			}
			_, problem = write.Exec(ctx, statement)
			write.Rollback(ctx)
			var databaseError *pgconn.PgError
			if !errors.As(problem, &databaseError) || databaseError.Code != "42501" {
				test.Fatalf("recovery history was writable: %v", problem)
			}
		}
		rejectSourceWrite(test, ctx, organizations, owner, org, `INSERT INTO online_payment_observations(organization_id,order_id,source,session_id,provider_status,provider_payment_status,outcome,payment_intent,amount_minor,currency,expires_at,fingerprint)
 SELECT organization_id,order_id,'RETRIEVE',session_id,'complete','paid','PAID',payment_intent,amount_minor+1,currency,expires_at,repeat('0',64) FROM online_payment_attempts WHERE organization_id=$1 AND order_id=$2`, org, inputs[0].OrderID)
	})
	test.Run("orchestration creates no sale cash or stock posting effects", func(test *testing.T) {
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var sales, carts, shifts, movements, racedObservations int
		problem = tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM sales WHERE organization_id=$1),(SELECT count(*) FROM pos_carts WHERE organization_id=$1),
 (SELECT count(*) FROM register_shifts WHERE organization_id=$1),(SELECT count(*) FROM stock_movements WHERE organization_id=$1 AND movement_type<>'OPENING_BALANCE'),
 (SELECT count(*) FROM online_payment_observations WHERE organization_id=$1 AND order_id='8a777777-7777-4777-8777-777777777777')`, org).Scan(&sales, &carts, &shifts, &movements, &racedObservations)
		if problem != nil || sales+carts+shifts+movements != 0 || racedObservations != 1 {
			test.Fatalf("unexpected settlement/replay effects: %d %d %d %d observations=%d %v", sales, carts, shifts, movements, racedObservations, problem)
		}
	})
}
