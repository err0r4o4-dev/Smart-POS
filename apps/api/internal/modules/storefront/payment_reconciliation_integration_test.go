package storefront_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/stripe"
)

func paymentReconciliationAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, foreignOrg, unauthorizedUser string) {
	test.Helper()
	base, err := stripe.NewSandbox("sk_test_syntheticReconciliation", "http://localhost:8088")
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
	quote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		test.Fatal(err)
	}
	order, err := service.CreateOrder(ctx, shop.Slug, "6a222222-2222-4222-8222-222222222222", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic reconciliation buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("6", 64)})
	if err != nil {
		test.Fatal(err)
	}
	tracking := storefront.TrackingInput{OrderID: order.ID, AccessToken: strings.Repeat("6", 64)}
	creates, retrieves := 0, 0
	gateway.create = func(context.Context, stripe.CustomerCharge) (stripe.CustomerSession, error) {
		creates++
		return stripe.CustomerSession{}, stripe.ErrUnavailable
	}
	if _, err = service.CreateCustomerCheckout(ctx, shop.Slug, tracking); !errors.Is(err, stripe.ErrUnavailable) || creates != 1 {
		test.Fatalf("unknown create fixture: %v calls %d", err, creates)
	}
	gateway.retrieve = func(network context.Context, charge stripe.CustomerCharge, sessionID string) (stripe.CustomerSession, error) {
		retrieves++
		deadline, bounded := network.Deadline()
		if !bounded || time.Until(deadline) > 11*time.Second {
			return stripe.CustomerSession{}, errors.New("staff retrieval lacks bounded deadline")
		}
		probe, cancel := context.WithTimeout(network, 2*time.Second)
		defer cancel()
		tx, _, problem := organizations.Authorized(probe, owner, org, "storefront.manage")
		if problem != nil {
			return stripe.CustomerSession{}, errors.New("staff retrieval holds an organization transaction")
		}
		tx.Rollback(probe)
		return paymentFixtureSession(storefront.PaymentAttempt{OrganizationID: org, OrderID: charge.OrderID, Slug: charge.Slug, AmountMinor: charge.AmountMinor, ExpiresAt: charge.ExpiresAt}, sessionID, "complete", "paid"), nil
	}
	test.Run("verified discovered session resolves unknown payment without creating or settling", func(test *testing.T) {
		input := storefront.PaymentReconciliationInput{OrderID: order.ID, SessionID: "cs_test_staffRecovered"}
		key := "6a333333-3333-4333-8333-333333333333"
		result, problem := service.ReconcileCustomerPayment(ctx, owner, org, key, input)
		if problem != nil || result.Attempt.State != "PAID" || result.Attempt.SessionID == nil || *result.Attempt.SessionID != input.SessionID || result.Status != "PAID_HELD" || result.StockHoldReleased || result.ReconciliationID == "" || creates != 1 || retrieves != 1 {
			test.Fatalf("staff verified recovery: %+v error %v calls %d/%d", result, problem, creates, retrieves)
		}
		replay, problem := service.ReconcileCustomerPayment(ctx, owner, org, key, input)
		if problem != nil || replay.ReconciliationID != result.ReconciliationID || retrieves != 1 {
			test.Fatalf("durable staff replay: %+v error %v calls %d", replay, problem, retrieves)
		}
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var inbox, observations, reconciliations, sales, movements, audits int
		problem = tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM online_payment_inbox WHERE organization_id=$1),(SELECT count(*) FROM online_payment_observations WHERE organization_id=$1),(SELECT count(*) FROM online_payment_reconciliations WHERE organization_id=$1),(SELECT count(*) FROM sales WHERE organization_id=$1),(SELECT count(*) FROM stock_movements WHERE organization_id=$1 AND movement_type='SALE'),(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='online_payment.reconciled')`, org).Scan(&inbox, &observations, &reconciliations, &sales, &movements, &audits)
		if problem != nil || inbox != 0 || observations != 1 || reconciliations != 1 || sales != 0 || movements != 0 || audits != 1 {
			test.Fatalf("reconciliation effects: %d %d %d %d %d %d error %v", inbox, observations, reconciliations, sales, movements, audits, problem)
		}
	})
	test.Run("staff authority and replay identity are rechecked without provider calls", func(test *testing.T) {
		input := storefront.PaymentReconciliationInput{OrderID: order.ID, SessionID: "cs_test_staffRecovered"}
		key := "6a333333-3333-4333-8333-333333333333"
		if _, problem := service.ReconcileCustomerPayment(ctx, unauthorizedUser, org, key, input); !errors.Is(problem, storefront.ErrNotFound) {
			test.Fatalf("unauthorized replay: %v", problem)
		}
		if _, problem := service.ReconcileCustomerPayment(ctx, owner, foreignOrg, key, input); !errors.Is(problem, storefront.ErrNotFound) {
			test.Fatalf("foreign replay: %v", problem)
		}
		input.SessionID = "cs_test_otherSession"
		if _, problem := service.ReconcileCustomerPayment(ctx, owner, org, key, input); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("changed replay payload: %v", problem)
		}
		if _, problem := service.ReconcileCustomerPayment(ctx, owner, org, "6a444444-4444-4444-8444-444444444444", input); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("second Session binding: %v", problem)
		}
		if retrieves != 1 {
			test.Fatalf("denied request contacted provider: %d", retrieves)
		}
	})
	test.Run("paid unfulfillable review is durable but never claims a refund or releases stock", func(test *testing.T) {
		key := "6a555555-5555-4555-8555-555555555555"
		result, problem := service.FlagCustomerPaymentFulfillment(ctx, owner, org, order.ID, key, "QUALITY_BLOCKED")
		if problem != nil || result.Status != "REFUND_REVIEW_REQUIRED" || result.Attempt.State != "PAID" || result.StockHoldReleased || result.ReconciliationID == "" {
			test.Fatalf("paid fulfillment review: %+v error %v", result, problem)
		}
		replay, problem := service.FlagCustomerPaymentFulfillment(ctx, owner, org, order.ID, key, "QUALITY_BLOCKED")
		if problem != nil || replay.ReconciliationID != result.ReconciliationID {
			test.Fatalf("fulfillment review replay: %+v error %v", replay, problem)
		}
		if _, problem = service.FlagCustomerPaymentFulfillment(ctx, owner, org, order.ID, key, "PRICE_CHANGED"); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("changed review reason: %v", problem)
		}
		if _, problem = service.FlagCustomerPaymentFulfillment(ctx, owner, org, order.ID, "6a666666-6666-4666-8666-666666666666", "secret or free text"); !errors.Is(problem, storefront.ErrInput) {
			test.Fatalf("unbounded review reason: %v", problem)
		}
		current, problem := service.CustomerPaymentReview(ctx, owner, org, order.ID)
		if problem != nil || current.Status != "REFUND_REVIEW_REQUIRED" || retrieves != 1 {
			test.Fatalf("current review: %+v error %v calls %d", current, problem, retrieves)
		}
		for _, status := range []string{"PREPARING", "READY"} {
			order, problem = service.Transition(ctx, owner, org, order.ID, storefront.TransitionInput{Revision: order.Revision, Status: status})
			if problem != nil {
				test.Fatal(problem)
			}
		}
		point := &pos.Service{Organization: organizations}
		if _, problem = point.OpenShift(ctx, owner, org, "6a777777-7777-4777-8777-777777777777", pos.ShiftInput{TerminalID: shop.TerminalID, OpeningCash: "0.00"}); problem != nil {
			test.Fatal(problem)
		}
		if _, problem = point.SettlePrepaidOnlineOrder(ctx, owner, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision}); !errors.Is(problem, pos.ErrConflict) {
			test.Fatalf("reviewed payment was fulfilled: %v", problem)
		}
	})
	test.Run("mismatched paid retrieval cannot overwrite evidence or append a review", func(test *testing.T) {
		original := gateway.retrieve
		defer func() { gateway.retrieve = original }()
		for _, mismatch := range []string{"amount", "scope", "intent", "session"} {
			gateway.retrieve = func(network context.Context, charge stripe.CustomerCharge, id string) (stripe.CustomerSession, error) {
				session, problem := original(network, charge, id)
				switch mismatch {
				case "amount":
					session.AmountMinor++
				case "scope":
					session.Metadata["organization_id"] = foreignOrg
				case "intent":
					session.PaymentIntent = "pi_otherIntent"
				case "session":
					session.ID = "cs_test_otherReturned"
				}
				return session, problem
			}
			_, problem := service.ReconcileCustomerPayment(ctx, owner, org, "6a888888-8888-4888-8888-888888888888", storefront.PaymentReconciliationInput{OrderID: order.ID, SessionID: "cs_test_staffRecovered"})
			if problem == nil {
				test.Fatalf("accepted mismatched retrieval %s", mismatch)
			}
		}
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var observations, reviews int
		problem = tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM online_payment_observations WHERE organization_id=$1),(SELECT count(*) FROM online_payment_reconciliations WHERE organization_id=$1)`, org).Scan(&observations, &reviews)
		if problem != nil || observations != 1 || reviews != 2 {
			test.Fatalf("mismatch leaked evidence: %d %d %v", observations, reviews, problem)
		}
	})
	test.Run("journal denies mutation deletion and foreign or unscoped reads", func(test *testing.T) {
		for _, statement := range []string{"UPDATE online_payment_reconciliations SET reason_code='PRICE_CHANGED' WHERE organization_id=$1", "DELETE FROM online_payment_reconciliations WHERE organization_id=$1"} {
			tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
			if problem != nil {
				test.Fatal(problem)
			}
			_, problem = tx.Exec(ctx, statement, org)
			tx.Rollback(ctx)
			var databaseError *pgconn.PgError
			if !errors.As(problem, &databaseError) || databaseError.Code != "42501" {
				test.Fatalf("journal mutation permitted: %v", problem)
			}
		}
		tx, _, problem := organizations.Authorized(ctx, owner, foreignOrg, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var count int
		if problem = tx.QueryRow(ctx, "SELECT count(*) FROM online_payment_reconciliations WHERE organization_id=$1", org).Scan(&count); problem != nil || count != 0 {
			test.Fatalf("foreign review leak: %d %v", count, problem)
		}
		if problem = organizations.Pool.QueryRow(ctx, "SELECT count(*) FROM online_payment_reconciliations WHERE organization_id=$1", org).Scan(&count); problem != nil || count != 0 {
			test.Fatalf("unscoped review leak: %d %v", count, problem)
		}
	})
	test.Run("disabled Checkout recovers discovered expiry and late paid remains refund review", func(test *testing.T) {
		quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
		if problem != nil {
			test.Fatal(problem)
		}
		next, problem := service.CreateOrder(ctx, shop.Slug, "6a999999-9999-4999-8999-999999999999", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic expired buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("6", 64)})
		if problem != nil {
			test.Fatal(problem)
		}
		if _, problem = service.CreateCustomerCheckout(ctx, shop.Slug, storefront.TrackingInput{OrderID: next.ID, AccessToken: strings.Repeat("6", 64)}); !errors.Is(problem, stripe.ErrUnavailable) {
			test.Fatalf("second unknown dispatch: %v", problem)
		}
		current, problem := service.CustomerPaymentReview(ctx, owner, org, next.ID)
		if problem != nil || current.Status != "SESSION_REQUIRED" {
			test.Fatalf("unknown queue classification: %+v %v", current, problem)
		}
		disabled, problem := stripe.NewCustomerClient(base, persistenceSigningSecret, false)
		if problem != nil {
			test.Fatal(problem)
		}
		gateway.CustomerClient = disabled
		original := gateway.retrieve
		defer func() { gateway.CustomerClient = client; gateway.retrieve = original }()
		gateway.retrieve = func(network context.Context, charge stripe.CustomerCharge, id string) (stripe.CustomerSession, error) {
			_, problem := original(network, charge, id)
			return paymentFixtureSession(storefront.PaymentAttempt{OrganizationID: org, OrderID: charge.OrderID, Slug: charge.Slug, AmountMinor: charge.AmountMinor, ExpiresAt: charge.ExpiresAt}, id, "expired", "unpaid"), problem
		}
		input := storefront.PaymentReconciliationInput{OrderID: next.ID, SessionID: "cs_test_staffExpired"}
		expired, problem := service.ReconcileCustomerPayment(ctx, owner, org, "6abbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", input)
		if problem != nil || expired.Attempt.State != "EXPIRED" || expired.Status != "PROVIDER_EXPIRED" || !expired.StockHoldReleased || creates != 2 {
			test.Fatalf("disabled expiry recovery: %+v %v calls %d", expired, problem, creates)
		}
		gateway.retrieve = original
		paid, problem := service.ReconcileCustomerPayment(ctx, owner, org, "6acccccc-cccc-4ccc-8ccc-cccccccccccc", input)
		if problem != nil || paid.Attempt.State != "PAID" || paid.Status != "REFUND_REVIEW_REQUIRED" || !paid.StockHoldReleased {
			test.Fatalf("late paid recovery revived hold: %+v %v", paid, problem)
		}
	})
	test.Run("dispatch credential drift fails before network but durable replay remains available", func(test *testing.T) {
		rotatedBase, problem := stripe.NewSandbox("sk_test_otherReconciliation", "http://localhost:8088")
		if problem != nil {
			test.Fatal(problem)
		}
		rotated, problem := stripe.NewCustomerClient(rotatedBase, persistenceSigningSecret, false)
		if problem != nil {
			test.Fatal(problem)
		}
		gateway.CustomerClient = rotated
		defer func() { gateway.CustomerClient = client }()
		before := retrieves
		input := storefront.PaymentReconciliationInput{OrderID: order.ID, SessionID: "cs_test_staffRecovered"}
		if _, problem = service.ReconcileCustomerPayment(ctx, owner, org, "6affffff-ffff-4fff-8fff-ffffffffffff", input); !errors.Is(problem, storefront.ErrConflict) || retrieves != before {
			test.Fatalf("credential drift dispatched: %v %d/%d", problem, retrieves, before)
		}
		service.CustomerPayments = nil
		defer func() { service.CustomerPayments = gateway }()
		result, problem := service.ReconcileCustomerPayment(ctx, owner, org, "6a333333-3333-4333-8333-333333333333", input)
		if problem != nil || result.Attempt.State != "PAID" || result.ReconciliationID == "" || retrieves != before {
			test.Fatalf("offline durable replay: %+v %v", result, problem)
		}
	})
	test.Run("authority revoked during GET rolls back verified evidence and keeps unknown hold", func(test *testing.T) {
		quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
		if problem != nil {
			test.Fatal(problem)
		}
		next, problem := service.CreateOrder(ctx, shop.Slug, "6adddddd-dddd-4ddd-8ddd-dddddddddddd", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic revoke buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("6", 64)})
		if problem != nil {
			test.Fatal(problem)
		}
		if _, problem = service.CreateCustomerCheckout(ctx, shop.Slug, storefront.TrackingInput{OrderID: next.ID, AccessToken: strings.Repeat("6", 64)}); !errors.Is(problem, stripe.ErrUnavailable) {
			test.Fatalf("unknown revocation fixture: %v", problem)
		}
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var membership string
		problem = tx.QueryRow(ctx, "INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'MANAGER') RETURNING id::text", org, unauthorizedUser).Scan(&membership)
		if problem != nil {
			test.Fatal(problem)
		}
		if _, problem = tx.Exec(ctx, "INSERT INTO branch_memberships(organization_id,membership_id,branch_id) VALUES($1,$2,$3)", org, membership, shop.BranchID); problem != nil {
			test.Fatal(problem)
		}
		if problem = tx.Commit(ctx); problem != nil {
			test.Fatal(problem)
		}
		original := gateway.retrieve
		defer func() { gateway.retrieve = original }()
		gateway.retrieve = func(network context.Context, charge stripe.CustomerCharge, id string) (stripe.CustomerSession, error) {
			session, problem := original(network, charge, id)
			if problem != nil {
				return stripe.CustomerSession{}, problem
			}
			write, _, problem := organizations.Authorized(network, owner, org, "storefront.manage")
			if problem != nil {
				return stripe.CustomerSession{}, problem
			}
			defer write.Rollback(network)
			if _, problem = write.Exec(network, "UPDATE organization_memberships SET status='SUSPENDED' WHERE organization_id=$1 AND id=$2", org, membership); problem != nil {
				return stripe.CustomerSession{}, problem
			}
			return session, write.Commit(network)
		}
		input := storefront.PaymentReconciliationInput{OrderID: next.ID, SessionID: "cs_test_staffRevoked"}
		if _, problem = service.ReconcileCustomerPayment(ctx, unauthorizedUser, org, "6aeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", input); !errors.Is(problem, storefront.ErrNotFound) {
			test.Fatalf("revoked authority committed GET: %v", problem)
		}
		current, problem := service.CustomerPaymentReview(ctx, owner, org, next.ID)
		if problem != nil || current.Attempt.State != "REQUESTED" || current.Attempt.SessionID != nil || current.StockHoldReleased || current.Status != "SESSION_REQUIRED" {
			test.Fatalf("revoked GET changed state: %+v %v", current, problem)
		}
		probe, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer probe.Rollback(ctx)
		var count int
		if problem = probe.QueryRow(ctx, "SELECT (SELECT count(*) FROM online_payment_observations WHERE organization_id=$1 AND order_id=$2)+(SELECT count(*) FROM online_payment_reconciliations WHERE organization_id=$1 AND order_id=$2)", org, next.ID).Scan(&count); problem != nil || count != 0 {
			test.Fatalf("revoked GET leaked journal: %d %v", count, problem)
		}
	})
}
