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

func paymentHoldAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, foreignOrg string) {
	test.Helper()
	gateway, err := stripe.NewSandbox("sk_test_synthetic", "http://localhost:8088")
	if err != nil {
		test.Fatal(err)
	}
	client, err := stripe.NewCustomerClient(gateway, persistenceSigningSecret, true)
	if err != nil {
		test.Fatal(err)
	}
	service := &storefront.Service{Organization: organizations, CustomerPayments: client}
	variant := seedSourceProduct(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, shop.LocationID)
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	var attempts []storefront.PaymentAttempt
	var orders []storefront.Order
	for _, key := range []string{"9a222222-2222-4222-8222-222222222222", "9a333333-3333-4333-8333-333333333333", "9a444444-4444-4444-8444-444444444444"} {
		quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
		if problem != nil {
			test.Fatal(problem)
		}
		input := storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic hold buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("d", 64)}
		order, problem := service.CreateOrder(ctx, shop.Slug, key, input)
		if problem != nil {
			test.Fatal(problem)
		}
		attempt, problem := service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: order.ID, AccessToken: input.AccessToken})
		if problem != nil {
			test.Fatal(problem)
		}
		attempts = append(attempts, attempt)
		orders = append(orders, order)
	}
	assertLive := func(test *testing.T, index int, want bool) {
		test.Helper()
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var live bool
		problem = tx.QueryRow(ctx, "SELECT storefront_order_live($1,$2,$3)", org, orders[index].ID, orders[index].ExpiresAt.Add(time.Hour)).Scan(&live)
		if problem != nil || live != want {
			test.Fatalf("liveness beyond frozen order deadline: got %v want %v: %v", live, want, problem)
		}
	}
	accept := func(index int, sessionID, eventID, state, paid string) {
		test.Helper()
		session := paymentFixtureSession(attempts[index], sessionID, state, paid)
		eventType := "checkout.session.completed"
		if state == "expired" {
			eventType = "checkout.session.expired"
		}
		body := paymentFixtureEvent(test, eventID, eventType, session)
		now := time.Now()
		if _, problem := service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); problem != nil {
			test.Fatal(problem)
		}
	}
	test.Run("requested attempt blocks direct cancellation", func(test *testing.T) {
		rejectSourceWrite(test, ctx, organizations, owner, org, "UPDATE online_orders SET status='CANCELLED',revision=revision+1 WHERE organization_id=$1 AND id=$2", org, orders[0].ID)
	})
	test.Run("unknown provider outcome holds past the original deadline", func(test *testing.T) {
		assertLive(test, 0, true)
	})
	test.Run("runtime cannot release an unresolved payment hold", func(test *testing.T) {
		rejectSourceWrite(test, ctx, organizations, owner, org, "UPDATE online_payment_attempts SET stock_hold_released=true,revision=revision+1 WHERE organization_id=$1 AND order_id=$2", org, orders[0].ID)
	})
	test.Run("requested attempt blocks staff cancellation without changing history", func(test *testing.T) {
		_, problem := service.Transition(ctx, owner, org, orders[0].ID, storefront.TransitionInput{Status: "CANCELLED", Message: "Synthetic cancellation", Revision: orders[0].Revision})
		if !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("unsafe cancellation: %v", problem)
		}
	})
	test.Run("open and processing attempts retain unresolved holds", func(test *testing.T) {
		for _, state := range []string{"open", "complete"} {
			session := paymentFixtureSession(attempts[1], "cs_test_holdExpiredFirst", state, "unpaid")
			if _, problem := service.BindCustomerPayment(ctx, org, orders[1].ID, session); problem != nil {
				test.Fatal(problem)
			}
			assertLive(test, 1, true)
		}
	})
	test.Run("payment-backed stock cannot be spent by a competing ledger writer", func(test *testing.T) {
		tx, _, problem := organizations.Authorized(ctx, owner, org, "inventory.adjustment.create")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var operation string
		if problem = tx.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'payment.hold.writer',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("2", 64)).Scan(&operation); problem != nil {
			test.Fatal(problem)
		}
		_, problem = tx.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'ADJUSTMENT_OUT',-1,$5,'SYNTHETIC_COMPETITOR',$6)`, org, shop.BranchID, shop.LocationID, variant, operation, owner)
		var databaseError *pgconn.PgError
		if !errors.As(problem, &databaseError) || databaseError.Code != "23514" || databaseError.Message != "stock is reserved for online orders" {
			test.Fatalf("payment stock was spendable: %v", problem)
		}
	})
	test.Run("concurrent paid evidence and cancellation cannot release paid stock", func(test *testing.T) {
		body := paymentFixtureEvent(test, "evt_holdPaidRace", "checkout.session.completed", paymentFixtureSession(attempts[0], "cs_test_holdPaidFirst", "complete", "paid"))
		now := time.Now()
		start := make(chan struct{})
		paymentResult := make(chan error, 1)
		cancelResult := make(chan error, 1)
		go func() {
			<-start
			_, problem := service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now)
			paymentResult <- problem
		}()
		go func() {
			<-start
			_, problem := service.Transition(ctx, owner, org, orders[0].ID, storefront.TransitionInput{Status: "CANCELLED", Message: "Synthetic concurrent cancellation", Revision: orders[0].Revision})
			cancelResult <- problem
		}()
		close(start)
		paymentProblem, cancelProblem := <-paymentResult, <-cancelResult
		if paymentProblem != nil || !errors.Is(cancelProblem, storefront.ErrConflict) {
			test.Fatalf("payment/cancellation serialization: %v %v", paymentProblem, cancelProblem)
		}
		assertLive(test, 0, true)
	})
	accept(0, "cs_test_holdPaidFirst", "evt_holdPaidFirst", "complete", "paid")
	accept(0, "cs_test_holdPaidFirst", "evt_holdExpiredStale", "expired", "unpaid")
	test.Run("paid then stale expiry cannot release the hold", func(test *testing.T) {
		assertLive(test, 0, true)
	})
	accept(1, "cs_test_holdExpiredFirst", "evt_holdExpiredFirst", "expired", "unpaid")
	test.Run("confirmed expiry releases only the payment extension", func(test *testing.T) {
		assertLive(test, 1, false)
		assertSourceStock(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, variant, "3.000", "3.000", "0.000")
	})
	accept(1, "cs_test_holdExpiredFirst", "evt_holdLatePaid", "complete", "paid")
	test.Run("late paid records money without resurrecting the released extension", func(test *testing.T) {
		assertLive(test, 1, false)
		rejectSourceWrite(test, ctx, organizations, owner, org, "UPDATE online_payment_attempts SET stock_hold_released=false,revision=revision+1 WHERE organization_id=$1 AND order_id=$2", org, orders[1].ID)
	})
	accept(2, "cs_test_holdCancelled", "evt_holdCancelExpiry", "expired", "unpaid")
	test.Run("confirmed unpaid expiry allows cancellation", func(test *testing.T) {
		result, problem := service.Transition(ctx, owner, org, orders[2].ID, storefront.TransitionInput{Status: "CANCELLED", Message: "Synthetic expired session", Revision: orders[2].Revision})
		if problem != nil || result.Status != "CANCELLED" {
			test.Fatalf("expired attempt cancellation: %+v %v", result, problem)
		}
	})
	accept(2, "cs_test_holdCancelled", "evt_holdCancelledLatePaid", "complete", "paid")
	test.Run("late paid cannot revive a cancelled order or its stock", func(test *testing.T) {
		assertLive(test, 2, false)
		assertSourceStock(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, variant, "3.000", "2.000", "1.000")
	})
	test.Run("paid order cannot be rejected or cancelled without reconciliation", func(test *testing.T) {
		for _, status := range []string{"REJECTED", "CANCELLED"} {
			rejectSourceWrite(test, ctx, organizations, owner, org, "UPDATE online_orders SET status=$3,revision=revision+1 WHERE organization_id=$1 AND id=$2", org, orders[0].ID, status)
		}
	})
	test.Run("legacy POS cannot import a payment-backed order", func(test *testing.T) {
		current, problem := service.Order(ctx, owner, org, orders[0].ID)
		if problem != nil {
			test.Fatal(problem)
		}
		for _, status := range []string{"PREPARING", "READY"} {
			current, problem = service.Transition(ctx, owner, org, current.ID, storefront.TransitionInput{Status: status, Revision: current.Revision})
			if problem != nil {
				test.Fatal(problem)
			}
		}
		cashier := &pos.Service{Organization: organizations}
		_, problem = cashier.OpenShift(ctx, owner, org, "d5555555-5555-4555-8555-555555555555", pos.ShiftInput{TerminalID: shop.TerminalID, OpeningCash: "0.00"})
		if problem != nil {
			test.Fatal(problem)
		}
		if _, problem = cashier.ImportOnlineOrder(ctx, owner, org, current.ID, pos.OnlineOrderInput{Revision: current.Revision}); !errors.Is(problem, pos.ErrConflict) {
			test.Fatalf("legacy POS imported prepaid order: %v", problem)
		}
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var carts, sales int
		if problem = tx.QueryRow(ctx, "SELECT (SELECT count(*) FROM pos_carts WHERE organization_id=$1),(SELECT count(*) FROM sales WHERE organization_id=$1)", org).Scan(&carts, &sales); problem != nil || carts != 0 || sales != 0 {
			test.Fatalf("denied import changed settlement: %d %d %v", carts, sales, problem)
		}
	})
	test.Run("foreign tenant cannot observe payment liveness", func(test *testing.T) {
		tx, _, problem := organizations.Authorized(ctx, owner, foreignOrg, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var live bool
		if problem = tx.QueryRow(ctx, "SELECT storefront_order_live($1,$2)", org, orders[0].ID).Scan(&live); problem != nil || live {
			test.Fatalf("foreign payment hold leaked: %v %v", live, problem)
		}
	})
	test.Run("unscoped runtime cannot observe payment liveness", func(test *testing.T) {
		var live bool
		if problem := organizations.Pool.QueryRow(ctx, "SELECT storefront_order_live($1,$2)", org, orders[0].ID).Scan(&live); problem != nil || live {
			test.Fatalf("unscoped payment hold leaked: %v %v", live, problem)
		}
	})
}
