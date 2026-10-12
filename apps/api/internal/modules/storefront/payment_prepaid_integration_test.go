package storefront_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/stripe"
)

func paymentPrepaidAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, foreignOrg, unauthorizedUser string) {
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
	point := &pos.Service{Organization: organizations}
	variant := seedSourceProduct(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, shop.LocationID)
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	quote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		test.Fatal(err)
	}
	order, err := service.CreateOrder(ctx, shop.Slug, "7a222222-2222-4222-8222-222222222222", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic prepaid buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("7", 64)})
	if err != nil {
		test.Fatal(err)
	}
	attempt, err := service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: order.ID, AccessToken: strings.Repeat("7", 64)})
	if err != nil {
		test.Fatal(err)
	}
	for _, status := range []string{"PREPARING", "READY"} {
		order, err = service.Transition(ctx, owner, org, order.ID, storefront.TransitionInput{Revision: order.Revision, Status: status})
		if err != nil {
			test.Fatal(err)
		}
	}
	assertUnsettled := func(test *testing.T) {
		test.Helper()
		tx, _, problem := organizations.Authorized(ctx, owner, org, "pos.checkout")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var carts, checkouts, sales, movements int
		var status string
		var released bool
		problem = tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM pos_carts WHERE organization_id=$1),(SELECT count(*) FROM pos_checkouts WHERE organization_id=$1),(SELECT count(*) FROM sales WHERE organization_id=$1),(SELECT count(*) FROM stock_movements WHERE organization_id=$1 AND movement_type='SALE'),doc.status,attempt.stock_hold_released FROM online_orders doc JOIN online_payment_attempts attempt ON attempt.organization_id=doc.organization_id AND attempt.order_id=doc.id WHERE doc.organization_id=$1 AND doc.id=$2`, org, order.ID).Scan(&carts, &checkouts, &sales, &movements, &status, &released)
		if problem != nil || carts != 0 || checkouts != 0 || sales != 0 || movements != 0 || status != "READY" || released {
			test.Fatalf("failed prepaid request changed fulfillment: %d %d %d %d %s %v error %v", carts, checkouts, sales, movements, status, released, problem)
		}
	}
	test.Run("unresolved provider evidence is not payment authority", func(test *testing.T) {
		_, problem := point.SettlePrepaidOnlineOrder(ctx, owner, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision})
		if !errors.Is(problem, pos.ErrConflict) {
			test.Fatalf("unresolved evidence: %v", problem)
		}
		assertUnsettled(test)
	})
	body := paymentFixtureEvent(test, "evt_prepaidPaid", "checkout.session.completed", paymentFixtureSession(attempt, "cs_test_prepaidPaid", "complete", "paid"))
	now := time.Now()
	if _, err = service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); err != nil {
		test.Fatal(err)
	}
	test.Run("paid evidence does not bypass an own open shift", func(test *testing.T) {
		if _, problem := point.SettlePrepaidOnlineOrder(ctx, owner, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision}); !errors.Is(problem, pos.ErrConflict) {
			test.Fatalf("missing own shift: %v", problem)
		}
		assertUnsettled(test)
	})
	if _, err = point.OpenShift(ctx, owner, org, "7a333333-3333-4333-8333-333333333333", pos.ShiftInput{TerminalID: shop.TerminalID, OpeningCash: "0.00"}); err != nil {
		test.Fatal(err)
	}
	test.Run("tenant member and revision checks precede fulfillment", func(test *testing.T) {
		if _, problem := point.SettlePrepaidOnlineOrder(ctx, unauthorizedUser, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision}); !errors.Is(problem, pos.ErrNotFound) {
			test.Fatalf("unauthorized member: %v", problem)
		}
		if _, problem := point.SettlePrepaidOnlineOrder(ctx, owner, foreignOrg, order.ID, pos.OnlineOrderInput{Revision: order.Revision}); !errors.Is(problem, pos.ErrNotFound) {
			test.Fatalf("foreign order: %v", problem)
		}
		if _, problem := point.SettlePrepaidOnlineOrder(ctx, owner, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision + 1}); !errors.Is(problem, pos.ErrConflict) {
			test.Fatalf("stale revision: %v", problem)
		}
		assertUnsettled(test)
	})
	test.Run("price drift rolls back cart and retains paid stock", func(test *testing.T) {
		write, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer write.Rollback(ctx)
		if _, problem = write.Exec(ctx, "UPDATE product_variants SET selling_price=11 WHERE organization_id=$1 AND id=$2", org, variant); problem != nil {
			test.Fatal(problem)
		}
		if problem = write.Commit(ctx); problem != nil {
			test.Fatal(problem)
		}
		_, problem = point.SettlePrepaidOnlineOrder(ctx, owner, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision})
		if !errors.Is(problem, pos.ErrPrice) {
			test.Fatalf("paid price drift: %v", problem)
		}
		assertUnsettled(test)
		restore, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer restore.Rollback(ctx)
		if _, problem = restore.Exec(ctx, "UPDATE product_variants SET selling_price=10 WHERE organization_id=$1 AND id=$2", org, variant); problem != nil {
			test.Fatal(problem)
		}
		if problem = restore.Commit(ctx); problem != nil {
			test.Fatal(problem)
		}
	})
	for _, scenario := range []string{"bare", "manual", "fake-completed"} {
		name := "database rejects a bare payment-backed cart link"
		if scenario == "manual" {
			name = "database rejects manual collection for a paid linked order"
		}
		if scenario == "fake-completed" {
			name = "database rejects a completed prepaid checkout without sale posting"
		}
		test.Run(name, func(test *testing.T) {
			tx, _, problem := organizations.Authorized(ctx, owner, org, "pos.checkout")
			if problem != nil {
				test.Fatal(problem)
			}
			defer tx.Rollback(ctx)
			var cart string
			problem = tx.QueryRow(ctx, "INSERT INTO pos_carts(organization_id,branch_id,terminal_id,cashier_id,create_key) VALUES($1,$2,$3,$4,gen_random_uuid()) RETURNING id::text", org, shop.BranchID, shop.TerminalID, owner).Scan(&cart)
			if problem != nil {
				test.Fatal(problem)
			}
			if _, problem = tx.Exec(ctx, "UPDATE online_orders SET cart_id=$3,revision=revision+1 WHERE organization_id=$1 AND id=$2", org, order.ID, cart); problem != nil {
				test.Fatal(problem)
			}
			if scenario == "manual" {
				_, problem = tx.Exec(ctx, `INSERT INTO pos_checkouts(organization_id,branch_id,terminal_id,shift_id,cart_id,cashier_id,cart_revision,idempotency_key,fingerprint,status,method,currency,total,received,change,items) SELECT $1,$2,$3,id,$4,$5,1,gen_random_uuid(),$6,'AWAITING_PAYMENT','CASH','THB',10,10,0,'[{}]' FROM register_shifts WHERE organization_id=$1 AND status='OPEN'`, org, shop.BranchID, shop.TerminalID, cart, owner, strings.Repeat("0", 64))
			} else {
				if scenario == "fake-completed" {
					_, problem = tx.Exec(ctx, `INSERT INTO pos_checkouts(organization_id,branch_id,terminal_id,shift_id,cart_id,cashier_id,cart_revision,idempotency_key,fingerprint,status,method,currency,total,received,change,items,pricing_snapshot,confirmation_key,confirmed_by,confirmed_at,reference,prepaid_order_id,prepaid_order_revision) SELECT $1,$2,$3,id,$4,$5,1,$7,$6,'CONFIRMED','ONLINE_STRIPE','THB',10,10,0,jsonb_build_array(jsonb_build_object('variant_id',$8::text,'quantity','1.000','unit_price','10.00','line_total','10.00','discount_total','0.00')),'{"discount":"0.00","subtotal":"10.00","total":"10.00"}',$7,$5,now(),'pi_prepaidPaid',$7,$9 FROM register_shifts WHERE organization_id=$1 AND status='OPEN'`, org, shop.BranchID, shop.TerminalID, cart, owner, strings.Repeat("0", 64), order.ID, variant, order.Revision)
					if problem != nil {
						test.Fatal(problem)
					}
					if _, problem = tx.Exec(ctx, "UPDATE pos_checkouts SET status='COMPLETED' WHERE organization_id=$1 AND prepaid_order_id=$2", org, order.ID); problem != nil {
						test.Fatal(problem)
					}
				}
				_, problem = tx.Exec(ctx, "SET CONSTRAINTS online_prepaid_order_consistent IMMEDIATE")
			}
			var databaseError *pgconn.PgError
			if !errors.As(problem, &databaseError) || databaseError.Code != "23514" {
				test.Fatalf("unsafe payment-backed cart: %v", problem)
			}
		})
	}
	test.Run("paid evidence settles one immutable sale without collecting again", func(test *testing.T) {
		start := make(chan struct{})
		results := make(chan pos.Checkout, 2)
		problems := make(chan error, 2)
		for range 2 {
			go func() {
				<-start
				result, problem := point.SettlePrepaidOnlineOrder(ctx, owner, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision})
				results <- result
				problems <- problem
			}()
		}
		close(start)
		result, problem := <-results, <-problems
		if problem != nil || result.Status != "COMPLETED" || result.Method != "ONLINE_STRIPE" || result.SaleID == "" || result.Total != order.EstimatedTotal || result.Change != "0.00" {
			test.Fatalf("prepaid settlement: %+v error %v", result, problem)
		}
		replay, problem := <-results, <-problems
		if problem != nil || replay.ID != result.ID || replay.SaleID != result.SaleID {
			test.Fatalf("prepaid replay: %+v error %v", replay, problem)
		}
		tx, _, problem := organizations.Authorized(ctx, owner, org, "pos.checkout")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var sales, payments, receipts, movements int
		var cash, expected, status string
		problem = tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM sales WHERE organization_id=$1),(SELECT count(*) FROM sale_payments WHERE organization_id=$1),(SELECT count(*) FROM receipts WHERE organization_id=$1),(SELECT count(*) FROM stock_movements WHERE organization_id=$1 AND movement_type='SALE'),cash_sales::text,expected_cash::text,(SELECT status FROM online_orders WHERE organization_id=$1 AND id=$2) FROM register_shifts WHERE organization_id=$1 AND status='OPEN'`, org, order.ID).Scan(&sales, &payments, &receipts, &movements, &cash, &expected, &status)
		if problem != nil || sales != 1 || payments != 1 || receipts != 1 || movements != 1 || cash != "0.00" || expected != "0.00" || status != "COMPLETED" {
			test.Fatalf("prepaid atomic effects: %d %d %d %d %s %s %s error %v", sales, payments, receipts, movements, cash, expected, status, problem)
		}
	})
	test.Run("completed replay rejects changed revision and preserves immutable evidence", func(test *testing.T) {
		if _, problem := point.SettlePrepaidOnlineOrder(ctx, owner, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision + 1}); !errors.Is(problem, pos.ErrConflict) {
			test.Fatalf("changed prepaid replay: %v", problem)
		}
		tx, _, problem := organizations.Authorized(ctx, owner, org, "pos.checkout")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		_, problem = tx.Exec(ctx, "UPDATE pos_checkouts SET prepaid_order_revision=prepaid_order_revision+1 WHERE organization_id=$1 AND prepaid_order_id=$2", org, order.ID)
		var databaseError *pgconn.PgError
		if !errors.As(problem, &databaseError) || databaseError.Code != "42501" {
			test.Fatalf("prepaid evidence mutation: %v", problem)
		}
	})
	newPaymentOrder := func(key string) (storefront.Order, storefront.PaymentAttempt) {
		test.Helper()
		quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
		if problem != nil {
			test.Fatal(problem)
		}
		next, problem := service.CreateOrder(ctx, shop.Slug, key, storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic prepaid buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("7", 64)})
		if problem != nil {
			test.Fatal(problem)
		}
		payment, problem := service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: next.ID, AccessToken: strings.Repeat("7", 64)})
		if problem != nil {
			test.Fatal(problem)
		}
		return next, payment
	}
	ready := func(next storefront.Order) storefront.Order {
		test.Helper()
		for _, status := range []string{"PREPARING", "READY"} {
			var problem error
			next, problem = service.Transition(ctx, owner, org, next.ID, storefront.TransitionInput{Revision: next.Revision, Status: status})
			if problem != nil {
				test.Fatal(problem)
			}
		}
		return next
	}
	accept := func(payment storefront.PaymentAttempt, session, event, state, paid string) {
		test.Helper()
		eventType := "checkout.session.completed"
		if state == "expired" {
			eventType = "checkout.session.expired"
		}
		body := paymentFixtureEvent(test, event, eventType, paymentFixtureSession(payment, session, state, paid))
		now := time.Now()
		if _, problem := service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); problem != nil {
			test.Fatal(problem)
		}
	}
	assertNoAdditionalSale := func(test *testing.T, next storefront.Order, released bool) {
		test.Helper()
		tx, _, problem := organizations.Authorized(ctx, owner, org, "pos.checkout")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var untouched, held bool
		var sales, carts, movements int
		var quantity, ledger string
		problem = tx.QueryRow(ctx, `SELECT doc.cart_id IS NULL AND doc.sale_id IS NULL,attempt.stock_hold_released,(SELECT count(*) FROM sales WHERE organization_id=$1),(SELECT count(*) FROM pos_carts WHERE organization_id=$1),(SELECT count(*) FROM stock_movements WHERE organization_id=$1 AND movement_type='SALE'),(SELECT quantity::text FROM stock_balances WHERE organization_id=$1 AND location_id=$3 AND variant_id=$4),(SELECT sum(quantity_delta)::text FROM stock_movements WHERE organization_id=$1 AND location_id=$3 AND variant_id=$4) FROM online_orders doc JOIN online_payment_attempts attempt ON attempt.organization_id=doc.organization_id AND attempt.order_id=doc.id WHERE doc.organization_id=$1 AND doc.id=$2`, org, next.ID, shop.LocationID, variant).Scan(&untouched, &held, &sales, &carts, &movements, &quantity, &ledger)
		if problem != nil || !untouched || held != released || sales != 1 || carts != 1 || movements != 1 || quantity != "2.000" || ledger != quantity {
			test.Fatalf("failed fulfillment posted or lost stock: %v %v %d %d %d %s %s error %v", untouched, held, sales, carts, movements, quantity, ledger, problem)
		}
	}
	test.Run("expired then late paid cannot spend a released hold", func(test *testing.T) {
		next, payment := newPaymentOrder("7a444444-4444-4444-8444-444444444444")
		next = ready(next)
		accept(payment, "cs_test_prepaidLate", "evt_prepaidExpired", "expired", "unpaid")
		accept(payment, "cs_test_prepaidLate", "evt_prepaidLatePaid", "complete", "paid")
		if _, problem := point.SettlePrepaidOnlineOrder(ctx, owner, org, next.ID, pos.OnlineOrderInput{Revision: next.Revision}); !errors.Is(problem, pos.ErrConflict) {
			test.Fatalf("late paid resurrected stock: %v", problem)
		}
		assertNoAdditionalSale(test, next, true)
	})
	test.Run("paid does not bypass fulfillment readiness or product recall", func(test *testing.T) {
		next, payment := newPaymentOrder("7a555555-5555-4555-8555-555555555555")
		accept(payment, "cs_test_prepaidRecall", "evt_prepaidRecallPaid", "complete", "paid")
		if _, problem := point.SettlePrepaidOnlineOrder(ctx, owner, org, next.ID, pos.OnlineOrderInput{Revision: next.Revision}); !errors.Is(problem, pos.ErrConflict) {
			test.Fatalf("pending fulfillment was settled: %v", problem)
		}
		next = ready(next)
		if _, problem := (&inventory.Service{Organization: organizations}).CreateRecall(ctx, owner, org, "7a666666-6666-4666-8666-666666666666", inventory.RecallInput{VariantID: variant, Reason: "Synthetic prepaid recall"}); problem != nil {
			test.Fatal(problem)
		}
		if _, problem := point.SettlePrepaidOnlineOrder(ctx, owner, org, next.ID, pos.OnlineOrderInput{Revision: next.Revision}); !errors.Is(problem, pos.ErrConflict) {
			test.Fatalf("recalled product was fulfillable: %v", problem)
		}
		assertNoAdditionalSale(test, next, false)
	})
}
