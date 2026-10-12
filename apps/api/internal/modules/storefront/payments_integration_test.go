package storefront_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/stripe"
)

const persistenceSigningSecret = "whsec_synthetic_persistence_test_only"

func paymentSignature(body []byte, now time.Time) string {
	timestamp := strconv.FormatInt(now.Unix(), 10)
	mac := hmac.New(sha256.New, []byte(persistenceSigningSecret))
	mac.Write([]byte(timestamp + "."))
	mac.Write(body)
	return "t=" + timestamp + ",v1=" + hex.EncodeToString(mac.Sum(nil))
}

func paymentFixtureSession(attempt storefront.PaymentAttempt, id, state, paid string) stripe.CustomerSession {
	session := stripe.CustomerSession{ID: id, Object: "checkout.session", LiveMode: new(bool), Mode: "payment", Status: state,
		PaymentStatus: paid, AmountMinor: attempt.AmountMinor, Currency: "thb", ExpiresAt: attempt.ExpiresAt.Unix(),
		Metadata: map[string]string{"smartpos_purpose": stripe.CustomerPurpose, "organization_id": attempt.OrganizationID, "order_id": attempt.OrderID}}
	if state == "open" {
		session.URL = "https://checkout.stripe.com/c/pay/" + id + "#synthetic"
	}
	if paid == "paid" {
		session.PaymentIntent = "pi_" + strings.TrimPrefix(id, "cs_test_")
	}
	return session
}

func paymentFixtureEvent(test *testing.T, id, eventType string, session stripe.CustomerSession) []byte {
	test.Helper()
	event := stripe.CustomerEvent{ID: id, Object: "event", Type: eventType, LiveMode: new(bool), Created: time.Now().Unix()}
	event.Data.Object = session
	body, err := json.Marshal(event)
	if err != nil {
		test.Fatal(err)
	}
	return body
}

func paymentPersistenceAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, foreignOrg string) {
	test.Helper()
	tx, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		test.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var ready bool
	if err = tx.QueryRow(ctx, `SELECT to_regclass('public.online_payment_attempts') IS NOT NULL AND to_regclass('public.online_payment_inbox') IS NOT NULL`).Scan(&ready); err != nil {
		test.Fatal(err)
	}
	if !ready {
		test.Fatal("durable customer payment attempts and webhook inbox are missing")
	}
	if err = tx.Rollback(ctx); err != nil {
		test.Fatal(err)
	}
	gateway, err := stripe.NewSandbox("sk_test_synthetic", "http://localhost:8088")
	if err != nil {
		test.Fatal(err)
	}
	payments, err := stripe.NewCustomerClient(gateway, persistenceSigningSecret, true)
	if err != nil {
		test.Fatal(err)
	}
	service := &storefront.Service{Organization: &organization.Service{Pool: organizations.Pool, SingleStoreOrganizationID: org}, CustomerPayments: payments}
	variant := seedSourceProduct(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, shop.LocationID)
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	var attempts []storefront.PaymentAttempt
	var inputs []storefront.TrackingInput
	for _, key := range []string{"f2222222-2222-4222-8222-222222222222", "f3333333-3333-4333-8333-333333333333", "f4444444-4444-4444-8444-444444444444"} {
		quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
		if problem != nil {
			test.Fatal(problem)
		}
		input := storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic payment buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("f", 64)}
		order, problem := service.CreateOrder(ctx, shop.Slug, key, input)
		if problem != nil {
			test.Fatal(problem)
		}
		tracking := storefront.TrackingInput{OrderID: order.ID, AccessToken: input.AccessToken}
		if key == "f4444444-4444-4444-8444-444444444444" {
			test.Run("attempt expiry must retain exact provider-second precision", func(test *testing.T) {
				rejectSourceWrite(test, ctx, organizations, owner, org, `INSERT INTO online_payment_attempts(organization_id,order_id,slug,amount_minor,expires_at)
 VALUES($1,$2,$3,1000,date_trunc('second',now()+interval '1 hour')+interval '1 microsecond')`, org, tracking.OrderID, shop.Slug)
			})
		}
		attempt, problem := service.BeginCustomerPayment(ctx, shop.Slug, tracking)
		if problem != nil {
			test.Fatal(problem)
		}
		attempts = append(attempts, attempt)
		inputs = append(inputs, tracking)
	}
	accept := func(body []byte) (storefront.PaymentAcceptance, error) {
		now := time.Now()
		return service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now)
	}
	countEvent := func(id string) int {
		test.Helper()
		transaction, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer transaction.Rollback(ctx)
		var count int
		if problem = transaction.QueryRow(ctx, "SELECT count(*) FROM online_payment_inbox WHERE organization_id=$1 AND event_id=$2", org, id).Scan(&count); problem != nil {
			test.Fatal(problem)
		}
		return count
	}
	test.Run("attempt retry preserves exact frozen charge and private ownership", func(test *testing.T) {
		again, problem := service.BeginCustomerPayment(ctx, shop.Slug, inputs[0])
		if problem != nil || again.State != "REQUESTED" || again.SessionID != nil || again.AmountMinor != 1000 || again.Revision != 1 || !again.ExpiresAt.Equal(attempts[0].ExpiresAt) {
			test.Fatalf("unstable frozen attempt: %+v %v", again, problem)
		}
		wrong := inputs[0]
		wrong.AccessToken = strings.Repeat("a", 64)
		if _, problem = service.BeginCustomerPayment(ctx, shop.Slug, wrong); !errors.Is(problem, storefront.ErrNotFound) {
			test.Fatalf("wrong private tracking owner: %v", problem)
		}
		assertSourceStock(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, variant, "3.000", "3.000", "0.000")
	})
	paid := paymentFixtureSession(attempts[0], "cs_test_paymentA", "complete", "paid")
	paidBody := paymentFixtureEvent(test, "evt_paidA", "checkout.session.completed", paid)
	var paidRevision int64
	test.Run("event before session response atomically binds and records paid evidence", func(test *testing.T) {
		result, problem := accept(paidBody)
		if problem != nil || result.Duplicate || result.Attempt.State != "PAID" || result.Attempt.SessionID == nil || *result.Attempt.SessionID != paid.ID || result.Attempt.PaymentIntent == nil || *result.Attempt.PaymentIntent != paid.PaymentIntent || countEvent("evt_paidA") != 1 {
			test.Fatalf("early webhook failed: %+v %v", result, problem)
		}
		paidRevision = result.Attempt.Revision
		read, problem := service.CustomerPayment(ctx, shop.Slug, inputs[0])
		if problem != nil || read.State != "PAID" || read.Revision != paidRevision {
			test.Fatal("paid evidence did not survive a new transaction")
		}
	})
	test.Run("replays including different JSON whitespace cannot post twice", func(test *testing.T) {
		var decoded any
		if problem := json.Unmarshal(paidBody, &decoded); problem != nil {
			test.Fatal(problem)
		}
		formatted, problem := json.MarshalIndent(decoded, "", "  ")
		if problem != nil {
			test.Fatal(problem)
		}
		result, problem := accept(formatted)
		if problem != nil || !result.Duplicate || result.Attempt.Revision != paidRevision || countEvent("evt_paidA") != 1 {
			test.Fatalf("replay changed evidence: %+v %v", result, problem)
		}
	})
	test.Run("changed replay and wrong signed amount are rejected without evidence", func(test *testing.T) {
		expired := paymentFixtureSession(attempts[0], paid.ID, "expired", "unpaid")
		if _, problem := accept(paymentFixtureEvent(test, "evt_paidA", "checkout.session.expired", expired)); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("changed event replay: %v", problem)
		}
		wrong := paid
		wrong.AmountMinor++
		if _, problem := accept(paymentFixtureEvent(test, "evt_wrongAmount", "checkout.session.completed", wrong)); !errors.Is(problem, storefront.ErrConflict) || countEvent("evt_wrongAmount") != 0 {
			test.Fatalf("wrong frozen amount: %v", problem)
		}
	})
	test.Run("signed scope currency expiry and state mismatches cannot enter inbox", func(test *testing.T) {
		for _, item := range []struct {
			name   string
			change func(*stripe.CustomerSession)
		}{
			{"purpose", func(session *stripe.CustomerSession) {
				session.Metadata["smartpos_purpose"] = "sandbox_connection_check"
			}},
			{"tenant", func(session *stripe.CustomerSession) { session.Metadata["organization_id"] = foreignOrg }},
			{"order", func(session *stripe.CustomerSession) {
				session.Metadata["order_id"] = "ffffffff-ffff-4fff-8fff-ffffffffffff"
			}},
			{"currency", func(session *stripe.CustomerSession) { session.Currency = "usd" }},
			{"expiry", func(session *stripe.CustomerSession) { session.ExpiresAt++ }},
			{"mode", func(session *stripe.CustomerSession) { session.Mode = "subscription" }},
			{"state", func(session *stripe.CustomerSession) {
				session.Status = "expired"
				session.PaymentStatus = "unpaid"
				session.PaymentIntent = ""
			}},
		} {
			session := paymentFixtureSession(attempts[0], paid.ID, "complete", "paid")
			item.change(&session)
			id := "evt_mismatch" + item.name
			if _, problem := accept(paymentFixtureEvent(test, id, "checkout.session.completed", session)); problem == nil || countEvent(id) != 0 {
				test.Fatalf("signed %s mismatch was durably accepted: %v", item.name, problem)
			}
		}
	})
	test.Run("failure after inbox insert rolls back the event and preserves intent", func(test *testing.T) {
		wrong := paid
		wrong.PaymentIntent = "pi_other"
		if _, problem := accept(paymentFixtureEvent(test, "evt_wrongIntent", "checkout.session.completed", wrong)); !errors.Is(problem, storefront.ErrConflict) || countEvent("evt_wrongIntent") != 0 {
			test.Fatalf("inbox/state rollback: %v", problem)
		}
		read, problem := service.CustomerPayment(ctx, shop.Slug, inputs[0])
		if problem != nil || read.PaymentIntent == nil || *read.PaymentIntent != paid.PaymentIntent || read.Revision != paidRevision {
			test.Fatal("failed evidence changed paid identity")
		}
	})
	test.Run("concurrent stale expiry deliveries are durable once and never downgrade paid", func(test *testing.T) {
		body := paymentFixtureEvent(test, "evt_lateExpiryA", "checkout.session.expired", paymentFixtureSession(attempts[0], paid.ID, "expired", "unpaid"))
		var workers sync.WaitGroup
		results := make(chan storefront.PaymentAcceptance, 8)
		failures := make(chan error, 8)
		for range 8 {
			workers.Add(1)
			go func() {
				defer workers.Done()
				result, problem := accept(body)
				results <- result
				failures <- problem
			}()
		}
		workers.Wait()
		close(results)
		close(failures)
		for problem := range failures {
			if problem != nil {
				test.Fatal(problem)
			}
		}
		fresh := 0
		for result := range results {
			if !result.Duplicate {
				fresh++
			}
			if result.Attempt.State != "PAID" || result.Attempt.Revision != paidRevision {
				test.Fatal("late expiry downgraded paid evidence")
			}
		}
		if fresh != 1 || countEvent("evt_lateExpiryA") != 1 {
			test.Fatal("concurrent event deliveries were not deduplicated")
		}
	})
	test.Run("same-session paid evidence wins even if expiry was received first", func(test *testing.T) {
		expired := paymentFixtureSession(attempts[1], "cs_test_paymentB", "expired", "unpaid")
		result, problem := accept(paymentFixtureEvent(test, "evt_expiryB", "checkout.session.expired", expired))
		if problem != nil || result.Attempt.State != "EXPIRED" {
			test.Fatalf("authoritative expiry: %v", problem)
		}
		paidLater := paymentFixtureSession(attempts[1], expired.ID, "complete", "paid")
		result, problem = accept(paymentFixtureEvent(test, "evt_paidB", "checkout.session.completed", paidLater))
		if problem != nil || result.Attempt.State != "PAID" {
			test.Fatalf("paid evidence lost to event order: %v", problem)
		}
	})
	test.Run("bound session cannot be replaced and response alone does not grant paid", func(test *testing.T) {
		opened := paymentFixtureSession(attempts[2], "cs_test_paymentC", "open", "unpaid")
		bound, problem := service.BindCustomerPayment(ctx, org, inputs[2].OrderID, opened)
		if problem != nil || bound.State != "OPEN" {
			test.Fatalf("session binding: %v", problem)
		}
		wrong := paymentFixtureSession(attempts[2], "cs_test_otherC", "complete", "paid")
		if _, problem = accept(paymentFixtureEvent(test, "evt_wrongSessionC", "checkout.session.completed", wrong)); !errors.Is(problem, storefront.ErrConflict) || countEvent("evt_wrongSessionC") != 0 {
			test.Fatalf("bound session replaced: %v", problem)
		}
		response := paymentFixtureSession(attempts[2], opened.ID, "complete", "paid")
		bound, problem = service.BindCustomerPayment(ctx, org, inputs[2].OrderID, response)
		if problem != nil || bound.State != "PROCESSING" || bound.PaymentIntent != nil {
			test.Fatal("a response without committed terminal inbox evidence granted paid")
		}
	})
	test.Run("database rejects frozen-charge changes and unbacked terminal status", func(test *testing.T) {
		rejectSourceWrite(test, ctx, organizations, owner, org, `UPDATE online_payment_attempts SET amount_minor=amount_minor+1,revision=revision+1 WHERE organization_id=$1 AND order_id=$2`, org, inputs[2].OrderID)
		rejectSourceWrite(test, ctx, organizations, owner, org, `UPDATE online_payment_attempts SET state='PAID',payment_intent='pi_fake',revision=revision+1 WHERE organization_id=$1 AND order_id=$2`, org, inputs[2].OrderID)
		rejectSourceWrite(test, ctx, organizations, owner, org, `UPDATE online_payment_attempts SET state='OPEN',payment_intent=NULL,revision=revision+1 WHERE organization_id=$1 AND order_id=$2`, org, inputs[0].OrderID)
	})
	test.Run("bad signature and foreign single-store scope cannot accept payment", func(test *testing.T) {
		now := time.Now()
		if _, problem := service.AcceptCustomerWebhook(ctx, paidBody, "t=1,v1=00", now); !errors.Is(problem, storefront.ErrInput) {
			test.Fatalf("bad signature: %v", problem)
		}
		foreign := &storefront.Service{Organization: &organization.Service{Pool: organizations.Pool, SingleStoreOrganizationID: foreignOrg}, CustomerPayments: payments}
		if _, problem := foreign.AcceptCustomerWebhook(ctx, paidBody, paymentSignature(paidBody, now), now); !errors.Is(problem, storefront.ErrNotFound) {
			test.Fatalf("foreign configured scope: %v", problem)
		}
	})
	test.Run("turning off new checkout retains private reads and webhook recovery", func(test *testing.T) {
		disabled, problem := stripe.NewCustomerClient(gateway, persistenceSigningSecret, false)
		if problem != nil {
			test.Fatal(problem)
		}
		paused := &storefront.Service{Organization: service.Organization, CustomerPayments: disabled}
		if _, problem = paused.BeginCustomerPayment(ctx, shop.Slug, inputs[2]); !errors.Is(problem, stripe.ErrUnavailable) {
			test.Fatal("disabled checkout allowed new preparation")
		}
		if read, problem := paused.CustomerPayment(ctx, shop.Slug, inputs[0]); problem != nil || read.State != "PAID" {
			test.Fatal("feature toggle hid existing payment evidence")
		}
		body := paymentFixtureEvent(test, "evt_pausedRecovery", "checkout.session.expired", paymentFixtureSession(attempts[0], paid.ID, "expired", "unpaid"))
		now := time.Now()
		result, problem := paused.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now)
		if problem != nil || result.Attempt.State != "PAID" {
			test.Fatalf("toggle prevented signed recovery: %v", problem)
		}
	})
	test.Run("runtime scope and append-only grants protect inbox and attempts", func(test *testing.T) {
		unscoped, problem := organizations.Pool.Begin(ctx)
		if problem != nil {
			test.Fatal(problem)
		}
		var visible, forced int
		problem = unscoped.QueryRow(ctx, `SELECT (SELECT count(*) FROM online_payment_attempts)+(SELECT count(*) FROM online_payment_inbox),
 (SELECT count(*) FROM pg_class WHERE relname IN ('online_payment_attempts','online_payment_inbox') AND relrowsecurity AND relforcerowsecurity)`).Scan(&visible, &forced)
		unscoped.Rollback(ctx)
		if problem != nil || visible != 0 || forced != 2 {
			test.Fatal("payment tables require explicit scope and FORCE RLS")
		}
		transaction, _, problem := organizations.Authorized(ctx, owner, foreignOrg, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		var count int
		problem = transaction.QueryRow(ctx, `SELECT (SELECT count(*) FROM online_payment_attempts)+(SELECT count(*) FROM online_payment_inbox)`).Scan(&count)
		transaction.Rollback(ctx)
		if problem != nil || count != 0 {
			test.Fatal("foreign runtime scope exposed payment rows")
		}
		transaction, _, problem = organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer transaction.Rollback(ctx)
		_, problem = transaction.Exec(ctx, "UPDATE online_payment_inbox SET fingerprint=$1 WHERE event_id='evt_paidA'", strings.Repeat("0", 64))
		var databaseProblem *pgconn.PgError
		if !errors.As(problem, &databaseProblem) || databaseProblem.Code != "42501" {
			test.Fatalf("runtime inbox rewrite was permitted: %v", problem)
		}
	})
	test.Run("payment evidence cannot post sale stock or change the public order snapshot", func(test *testing.T) {
		order, problem := service.Track(ctx, shop.Slug, inputs[0])
		if problem != nil || order.Status != "PENDING" || order.CartID != nil || order.SaleID != nil {
			test.Fatal("payment evidence mutated fulfillment")
		}
		assertSourceStock(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, variant, "3.000", "3.000", "0.000")
		transaction, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer transaction.Rollback(ctx)
		var sales, attemptsCount int
		if problem = transaction.QueryRow(ctx, `SELECT (SELECT count(*) FROM sales WHERE organization_id=$1),(SELECT count(*) FROM online_payment_attempts WHERE organization_id=$1)`, org).Scan(&sales, &attemptsCount); problem != nil || sales != 0 || attemptsCount != 3 {
			test.Fatal("duplicate attempts or premature sale posting")
		}
	})
}
