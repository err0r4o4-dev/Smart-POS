package storefront_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/storefront"
)

func reservationAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings) {
	test.Helper()
	tx, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		test.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var unit, product, variant, operation string
	if err = tx.QueryRow(ctx, `INSERT INTO units(organization_id,code,name,unit_type) VALUES($1,'RESERVE','Synthetic units','COUNT') RETURNING id::text`, org).Scan(&unit); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO products(organization_id,name,created_by,updated_by) VALUES($1,'Synthetic reservation product',$2,$2) RETURNING id::text`, org, owner).Scan(&product); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency) VALUES($1,$2,'RESERVE','Synthetic variant',$3,1,10,'THB') RETURNING id::text`, org, product, unit).Scan(&variant); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'reservation.fixture',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("0", 64)).Scan(&operation); err != nil {
		test.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'OPENING_BALANCE',3,$5,'SYNTHETIC_FIXTURE',$6)`, org, shop.BranchID, shop.LocationID, variant, operation, owner); err != nil {
		test.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `UPDATE inventory_operations SET result='{}' WHERE organization_id=$1 AND id=$2`, org, operation); err != nil {
		test.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO storefront_products(organization_id,variant_id,published) VALUES($1,$2,true)`, org, variant); err != nil {
		test.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		test.Fatal(err)
	}
	service := &storefront.Service{Organization: organizations}
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "2.000"}}
	quote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		test.Fatal(err)
	}
	input := storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("a", 64)}
	key := "a1111111-1111-4111-8111-111111111111"
	order, err := service.CreateOrder(ctx, shop.Slug, key, input)
	if err != nil {
		test.Fatal(err)
	}
	test.Run("committed order excludes held stock and exact retry holds only once", func(test *testing.T) {
		replay, problem := service.CreateOrder(ctx, shop.Slug, key, input)
		if problem != nil || replay.ID != order.ID {
			test.Fatalf("reservation replay: %v", problem)
		}
		products, problem := service.Products(ctx, "", "", shop.Slug, "", 1)
		if problem != nil || len(products.Items) != 1 || products.Items[0].Available != "1.000" {
			test.Fatalf("expected one unreserved unit, got %+v, error %v", products.Items, problem)
		}
	})
	test.Run("another order cannot spend held stock", func(test *testing.T) {
		_, problem := service.CreateOrder(ctx, shop.Slug, "a2222222-2222-4222-8222-222222222222", input)
		if !errors.Is(problem, storefront.ErrStock) {
			test.Fatalf("competing order must reject reserved stock, got %v", problem)
		}
	})
	test.Run("inventory read model reports actual held and free quantities", func(test *testing.T) {
		result, problem := (&inventory.Service{Organization: organizations}).List(ctx, owner, org, "balances", inventory.Filter{BranchID: shop.BranchID, LocationID: shop.LocationID, VariantID: variant, Page: 1, PageSize: 20})
		if problem != nil {
			test.Fatal(problem)
		}
		page, valid := result.(inventory.Page)
		if !valid || len(page.Items) != 1 {
			test.Fatalf("inventory page: %+v", result)
		}
		var stock struct {
			Quantity  string `json:"quantity"`
			Reserved  string `json:"reserved"`
			Available string `json:"available"`
		}
		if problem = json.Unmarshal(page.Items[0], &stock); problem != nil || stock.Quantity != "3.000" || stock.Reserved != "2.000" || stock.Available != "1.000" {
			test.Fatalf("inventory reservation projection: %+v error %v", stock, problem)
		}
	})
	test.Run("central ledger rejects spending another orders reservation and rolls back balances", func(test *testing.T) {
		write, _, problem := organizations.Authorized(ctx, owner, org, "inventory.adjustment.create")
		if problem != nil {
			test.Fatal(problem)
		}
		defer write.Rollback(ctx)
		var operation string
		if problem = write.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'reservation.writer',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("1", 64)).Scan(&operation); problem != nil {
			test.Fatal(problem)
		}
		_, problem = write.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'ADJUSTMENT_OUT',-2,$5,'SYNTHETIC_COMPETITOR',$6)`, org, shop.BranchID, shop.LocationID, variant, operation, owner)
		var databaseError *pgconn.PgError
		if !errors.As(problem, &databaseError) || databaseError.Code != "23514" || databaseError.Message != "stock is reserved for online orders" {
			test.Fatalf("ledger must reject reserved stock, got %v", problem)
		}
	})
	test.Run("database constraint refuses an overcommitted order even without quote validation", func(test *testing.T) {
		write, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer write.Rollback(ctx)
		nextID := "c1111111-1111-4111-8111-111111111111"
		_, problem = write.Exec(ctx, `INSERT INTO online_orders(id,organization_id,branch_id,terminal_id,stock_location_id,customer_name,contact_phone,store_name,store_phone,estimated_total,access_hash,request_fingerprint) SELECT $3,organization_id,branch_id,terminal_id,stock_location_id,customer_name,contact_phone,store_name,store_phone,estimated_total,access_hash,request_fingerprint FROM online_orders WHERE organization_id=$1 AND id=$2`, org, order.ID, nextID)
		if problem != nil {
			test.Fatal(problem)
		}
		_, problem = write.Exec(ctx, `INSERT INTO online_order_items(organization_id,order_id,variant_id,product_name,variant_name,sku,unit,quantity,unit_price,line_total) SELECT organization_id,$3,variant_id,product_name,variant_name,sku,unit,quantity,unit_price,line_total FROM online_order_items WHERE organization_id=$1 AND order_id=$2`, org, order.ID, nextID)
		if problem != nil {
			test.Fatal(problem)
		}
		problem = write.Commit(ctx)
		var databaseError *pgconn.PgError
		if !errors.As(problem, &databaseError) || databaseError.Code != "23514" || databaseError.Message != "insufficient stock for reservation" {
			test.Fatalf("overcommitted transaction: %v", problem)
		}
	})
	test.Run("reservation functions remain tenant scoped and source specific", func(test *testing.T) {
		var held, safe string
		problem := organizations.Pool.QueryRow(ctx, `SELECT storefront_reserved_quantity($1,$2,$3)::text,storefront_sellable_quantity($1,$2,$3)::text`, org, shop.LocationID, variant).Scan(&held, &safe)
		if problem != nil || held != "0.000" || safe != "0.000" {
			test.Fatalf("unscoped runtime must not expose balances: held %s safe %s error %v", held, safe, problem)
		}
		read, _, problem := organizations.Authorized(ctx, owner, org, "inventory.read")
		if problem != nil {
			test.Fatal(problem)
		}
		defer read.Rollback(ctx)
		problem = read.QueryRow(ctx, `SELECT storefront_reserved_quantity($1,'00000000-0000-4000-8000-000000000000',$2)::text`, org, variant).Scan(&held)
		if problem != nil || held != "0.000" {
			test.Fatalf("another location cannot inherit a hold: %s error %v", held, problem)
		}
		_, problem = read.Exec(ctx, `UPDATE online_orders SET stock_reserved=false,revision=revision+1 WHERE organization_id=$1 AND id=$2`, org, order.ID)
		var databaseError *pgconn.PgError
		if !errors.As(problem, &databaseError) || databaseError.Code != "23514" || databaseError.Message != "reservation mode is immutable" {
			test.Fatalf("a hold cannot be disabled in place: %v", problem)
		}
	})
	test.Run("cancellation releases availability without a stock movement", func(test *testing.T) {
		cancelled, problem := service.Transition(ctx, owner, org, order.ID, storefront.TransitionInput{Revision: order.Revision, Status: "CANCELLED", Message: "Synthetic cancellation"})
		if problem != nil || cancelled.Status != "CANCELLED" {
			test.Fatalf("cancel reservation: %v", problem)
		}
		products, problem := service.Products(ctx, "", "", shop.Slug, "", 1)
		if problem != nil || len(products.Items) != 1 || products.Items[0].Available != "3.000" {
			test.Fatalf("released availability: %+v, error %v", products.Items, problem)
		}
		read, _, problem := organizations.Authorized(ctx, owner, org, "inventory.read")
		if problem != nil {
			test.Fatal(problem)
		}
		defer read.Rollback(ctx)
		var balance, quality string
		var movements int
		problem = read.QueryRow(ctx, `SELECT quantity::text,(SELECT sum(quantity)::text FROM quality_stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3),(SELECT count(*) FROM stock_movements WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3) FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3`, org, shop.LocationID, variant).Scan(&balance, &quality, &movements)
		if problem != nil || balance != "3.000" || quality != "3.000" || movements != 1 {
			test.Fatalf("reservation must not post physical stock: balance %s quality %s movements %d error %v", balance, quality, movements, problem)
		}
	})
	test.Run("concurrent requests cannot overreserve and a changed retry conflicts", func(test *testing.T) {
		type outcome struct {
			order storefront.Order
			err   error
		}
		results := make(chan outcome, 2)
		start := make(chan struct{})
		for _, nextKey := range []string{"a3333333-3333-4333-8333-333333333333", "a4444444-4444-4444-8444-444444444444"} {
			go func(key string) {
				request := input
				request.Items = append([]storefront.ItemInput(nil), input.Items...)
				<-start
				next, problem := service.CreateOrder(ctx, shop.Slug, key, request)
				results <- outcome{next, problem}
			}(nextKey)
		}
		close(start)
		var accepted storefront.Order
		successes := 0
		for range 2 {
			result := <-results
			if result.err == nil {
				successes++
				accepted = result.order
			} else if !errors.Is(result.err, storefront.ErrStock) {
				test.Fatalf("unexpected concurrent failure: %v", result.err)
			}
		}
		if successes != 1 {
			test.Fatalf("expected exactly one reservation, got %d", successes)
		}
		changed := input
		changed.CustomerNote = "Changed request"
		if _, problem := service.CreateOrder(ctx, shop.Slug, accepted.ID, changed); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("changed retry: %v", problem)
		}
		if _, problem := service.Transition(ctx, owner, org, accepted.ID, storefront.TransitionInput{Revision: accepted.Revision, Status: "CANCELLED", Message: "Synthetic cleanup"}); problem != nil {
			test.Fatal(problem)
		}
	})
	test.Run("expired unlinked orders do not hold stock or reacquire on retry", func(test *testing.T) {
		write, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer write.Rollback(ctx)
		expiredID := "a5555555-5555-4555-8555-555555555555"
		_, problem = write.Exec(ctx, `INSERT INTO online_orders(id,organization_id,branch_id,terminal_id,stock_location_id,customer_name,contact_phone,store_name,store_phone,estimated_total,access_hash,request_fingerprint,expires_at) SELECT $3,organization_id,branch_id,terminal_id,stock_location_id,customer_name,contact_phone,store_name,store_phone,estimated_total,access_hash,request_fingerprint,statement_timestamp()-interval '1 second' FROM online_orders WHERE organization_id=$1 AND id=$2`, org, order.ID, expiredID)
		if problem != nil {
			test.Fatal(problem)
		}
		_, problem = write.Exec(ctx, `INSERT INTO online_order_items(organization_id,order_id,variant_id,product_name,variant_name,sku,unit,quantity,unit_price,line_total) SELECT organization_id,$3,variant_id,product_name,variant_name,sku,unit,quantity,unit_price,line_total FROM online_order_items WHERE organization_id=$1 AND order_id=$2`, org, order.ID, expiredID)
		if problem != nil {
			test.Fatal(problem)
		}
		if problem = write.Commit(ctx); problem != nil {
			test.Fatal(problem)
		}
		replay, problem := service.CreateOrder(ctx, shop.Slug, expiredID, input)
		if problem != nil || replay.Status != "EXPIRED" {
			test.Fatalf("expired replay: %s error %v", replay.Status, problem)
		}
		products, problem := service.Products(ctx, "", "", shop.Slug, "", 1)
		if problem != nil || len(products.Items) != 1 || products.Items[0].Available != "3.000" {
			test.Fatalf("expired availability: %+v error %v", products.Items, problem)
		}
	})
	test.Run("linked POS can consume its own reservation exactly once", func(test *testing.T) {
		next, problem := service.CreateOrder(ctx, shop.Slug, "a6666666-6666-4666-8666-666666666666", input)
		if problem != nil {
			test.Fatal(problem)
		}
		for _, status := range []string{"PREPARING", "READY"} {
			next, problem = service.Transition(ctx, owner, org, next.ID, storefront.TransitionInput{Revision: next.Revision, Status: status})
			if problem != nil {
				test.Fatalf("transition with own reservation: %v", problem)
			}
		}
		point := &pos.Service{Organization: organizations}
		if _, problem = point.OpenShift(ctx, owner, org, "b1111111-1111-4111-8111-111111111111", pos.ShiftInput{TerminalID: shop.TerminalID, OpeningCash: "0.00"}); problem != nil {
			test.Fatal(problem)
		}
		cart, problem := point.ImportOnlineOrder(ctx, owner, org, next.ID, pos.OnlineOrderInput{Revision: next.Revision})
		if problem != nil || cart.ReviewRequired || len(cart.Items) != 1 || cart.Items[0].Available != "3.000" {
			test.Fatalf("linked cart availability: %+v error %v", cart.Items, problem)
		}
		checkout, problem := point.PrepareCheckout(ctx, owner, org, "b2222222-2222-4222-8222-222222222222", pos.CheckoutInput{CartID: cart.ID, Revision: cart.Revision, Method: "CASH", ExpectedTotal: cart.Total, Received: cart.Total, PricingRevision: cart.Pricing.Revision})
		if problem != nil {
			test.Fatal(problem)
		}
		checkout, problem = point.ConfirmPayment(ctx, owner, org, checkout.ID, "b3333333-3333-4333-8333-333333333333", pos.ConfirmationInput{Acknowledged: true})
		if problem != nil {
			test.Fatal(problem)
		}
		checkout, problem = point.CompleteCheckout(ctx, owner, org, checkout.ID)
		if problem != nil || checkout.Status != "COMPLETED" {
			test.Fatalf("reserved settlement: %s error %v", checkout.Status, problem)
		}
		if _, problem = point.CompleteCheckout(ctx, owner, org, checkout.ID); problem != nil {
			test.Fatalf("settlement replay: %v", problem)
		}
		tracked, problem := service.Track(ctx, shop.Slug, storefront.TrackingInput{OrderID: next.ID, AccessToken: input.AccessToken})
		if problem != nil || tracked.Status != "COMPLETED" || tracked.PaymentStatus != "PAID_AT_STORE" {
			test.Fatalf("completed reserved order: %+v error %v", tracked, problem)
		}
		products, problem := service.Products(ctx, "", "", shop.Slug, "", 1)
		if problem != nil || len(products.Items) != 1 || products.Items[0].Available != "1.000" {
			test.Fatalf("settled availability: %+v error %v", products.Items, problem)
		}
	})
	test.Run("linked expired order remains held until its cart is reconciled", func(test *testing.T) {
		point := &pos.Service{Organization: organizations}
		cart, problem := point.CreateCart(ctx, owner, org, "c2222222-2222-4222-8222-222222222222", pos.CartInput{TerminalID: shop.TerminalID})
		if problem != nil {
			test.Fatal(problem)
		}
		write, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer write.Rollback(ctx)
		nextID := "c3333333-3333-4333-8333-333333333333"
		_, problem = write.Exec(ctx, `INSERT INTO online_orders(id,organization_id,branch_id,terminal_id,stock_location_id,status,cart_id,customer_name,contact_phone,store_name,store_phone,estimated_total,access_hash,request_fingerprint,expires_at) SELECT $3,organization_id,branch_id,terminal_id,stock_location_id,'READY',$4,customer_name,contact_phone,store_name,store_phone,10,access_hash,request_fingerprint,statement_timestamp()-interval '1 second' FROM online_orders WHERE organization_id=$1 AND id=$2`, org, order.ID, nextID, cart.ID)
		if problem != nil {
			test.Fatal(problem)
		}
		_, problem = write.Exec(ctx, `INSERT INTO online_order_items(organization_id,order_id,variant_id,product_name,variant_name,sku,unit,quantity,unit_price,line_total) SELECT organization_id,$3,variant_id,product_name,variant_name,sku,unit,1,unit_price,10 FROM online_order_items WHERE organization_id=$1 AND order_id=$2`, org, order.ID, nextID)
		if problem != nil {
			test.Fatal(problem)
		}
		if problem = write.Commit(ctx); problem != nil {
			test.Fatal(problem)
		}
		products, problem := service.Products(ctx, "", "", shop.Slug, "", 1)
		if problem != nil || len(products.Items) != 1 || products.Items[0].Available != "0.000" {
			test.Fatalf("linked expiry must retain hold: %+v error %v", products.Items, problem)
		}
		if _, problem = point.UpdateCart(ctx, owner, org, cart.ID, "cancel", pos.CartInput{Revision: cart.Revision}); problem != nil {
			test.Fatal(problem)
		}
		products, problem = service.Products(ctx, "", "", shop.Slug, "", 1)
		if problem != nil || len(products.Items) != 1 || products.Items[0].Available != "1.000" {
			test.Fatalf("reconciled expiry must release hold: %+v error %v", products.Items, problem)
		}
	})
	test.Run("recall overrides a reservation without blocking disposal of unsafe stock", func(test *testing.T) {
		request := input
		request.Items = []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
		quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: request.Items})
		if problem != nil {
			test.Fatal(problem)
		}
		request.QuoteID = quote.ID
		next, problem := service.CreateOrder(ctx, shop.Slug, "c4444444-4444-4444-8444-444444444444", request)
		if problem != nil {
			test.Fatal(problem)
		}
		write, _, problem := organizations.Authorized(ctx, owner, org, "quality.read")
		if problem != nil {
			test.Fatal(problem)
		}
		defer write.Rollback(ctx)
		if _, problem = write.Exec(ctx, `INSERT INTO quality_recalls(organization_id,variant_id,reason,created_by) VALUES($1,$2,'Synthetic recall',$3)`, org, variant, owner); problem != nil {
			test.Fatal(problem)
		}
		var operation string
		if problem = write.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'reservation.disposal',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("2", 64)).Scan(&operation); problem != nil {
			test.Fatal(problem)
		}
		if _, problem = write.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'ADJUSTMENT_OUT',-1,$5,'SYNTHETIC_RECALL_DISPOSAL',$6)`, org, shop.BranchID, shop.LocationID, variant, operation, owner); problem != nil {
			test.Fatalf("reservation must not prevent unsafe stock disposal: %v", problem)
		}
		if _, problem = write.Exec(ctx, `UPDATE inventory_operations SET result='{}' WHERE organization_id=$1 AND id=$2`, org, operation); problem != nil {
			test.Fatal(problem)
		}
		if problem = write.Commit(ctx); problem != nil {
			test.Fatal(problem)
		}
		if _, problem = service.Transition(ctx, owner, org, next.ID, storefront.TransitionInput{Revision: next.Revision, Status: "PREPARING"}); !errors.Is(problem, storefront.ErrStock) {
			test.Fatalf("recalled reservation is not fulfillment authority: %v", problem)
		}
		if _, problem = service.Transition(ctx, owner, org, next.ID, storefront.TransitionInput{Revision: next.Revision, Status: "CANCELLED", Message: "Synthetic recall cancellation"}); problem != nil {
			test.Fatal(problem)
		}
	})
}
