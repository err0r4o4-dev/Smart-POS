package storefront_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/restaurant"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/stripe"
)

func ingredientReservationAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, foreignOrg, unauthorizedUser string) {
	test.Helper()
	begin := func(scope string) pgx.Tx {
		test.Helper()
		tx, problem := organizations.Pool.Begin(ctx)
		if problem != nil {
			test.Fatal(problem)
		}
		if _, problem = tx.Exec(ctx, `SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true)`, scope, owner); problem != nil {
			tx.Rollback(ctx)
			test.Fatal(problem)
		}
		return tx
	}
	tx, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		test.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var countUnit, weightUnit, product, ingredient, operation string
	if err = tx.QueryRow(ctx, `INSERT INTO units(organization_id,code,name,unit_type) VALUES($1,'DISH','Dish','COUNT') RETURNING id::text`, org).Scan(&countUnit); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO units(organization_id,code,name,unit_type) VALUES($1,'KG','Ingredient kilograms','WEIGHT') RETURNING id::text`, org).Scan(&weightUnit); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO products(organization_id,name,created_by,updated_by) VALUES($1,'Synthetic recipe fixture',$2,$2) RETURNING id::text`, org, owner).Scan(&product); err != nil {
		test.Fatal(err)
	}
	createVariant := func(sku, unit string) string {
		test.Helper()
		var id string
		if problem := tx.QueryRow(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency) VALUES($1,$2,$3,$3,$4,1,10,'THB') RETURNING id::text`, org, product, sku, unit).Scan(&id); problem != nil {
			test.Fatal(problem)
		}
		if _, problem := tx.Exec(ctx, `INSERT INTO storefront_products(organization_id,variant_id,published) VALUES($1,$2,true)`, org, id); problem != nil {
			test.Fatal(problem)
		}
		return id
	}
	ingredient = createVariant("INGREDIENT", weightUnit)
	menus := []string{createVariant("DISH_A", countUnit), createVariant("DISH_B", countUnit)}
	if err = tx.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'ingredient.fixture',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("0", 64)).Scan(&operation); err != nil {
		test.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'OPENING_BALANCE',1.000,$5,'SYNTHETIC_INGREDIENT',$6)`, org, shop.BranchID, shop.LocationID, ingredient, operation, owner); err != nil {
		test.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `UPDATE inventory_operations SET result='{}' WHERE organization_id=$1 AND id=$2`, org, operation); err != nil {
		test.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		test.Fatal(err)
	}
	restaurantService := &restaurant.Service{Organization: organizations}
	recipes := make([]restaurant.Recipe, 0, 2)
	for index, menu := range menus {
		recipe, problem := restaurantService.SaveRecipe(ctx, owner, org, "", fmt.Sprintf("ae111111-1111-4111-8111-%012d", index+1), restaurant.RecipeInput{BranchID: shop.BranchID, MenuVariantID: menu, Status: "ACTIVE", Items: []restaurant.RecipeIngredientInput{{IngredientVariantID: ingredient, Quantity: "0.600"}}})
		if problem != nil {
			test.Fatal(problem)
		}
		recipes = append(recipes, recipe)
	}
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
	shop, err = service.SaveSettings(ctx, owner, org, storefront.SettingsInput{Slug: shop.Slug, Name: shop.Name, Description: shop.Description, ContactPhone: shop.ContactPhone, PickupInstructions: shop.PickupInstructions, TerminalID: shop.TerminalID, OnlineTerminalID: shop.OnlineTerminalID, Published: true, AcceptingOrders: true, DeliveryEnabled: true, ShippingFee: "0.00", Revision: shop.Revision})
	if err != nil {
		test.Fatal(err)
	}
	assertStock := func(current *testing.T, onHand, reserved string) {
		current.Helper()
		read := begin(org)
		defer read.Rollback(ctx)
		var actual, held, ledger string
		problem := read.QueryRow(ctx, `SELECT quantity::text,storefront_reserved_quantity($1,$2,$3)::text,(SELECT sum(quantity_delta)::text FROM stock_movements WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3) FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3`, org, shop.LocationID, ingredient).Scan(&actual, &held, &ledger)
		if problem != nil || actual != onHand || held != reserved || ledger != actual {
			current.Fatalf("ingredient stock=%s held=%s ledger=%s error=%v; want %s/%s", actual, held, ledger, problem, onHand, reserved)
		}
	}
	request := func(items []storefront.ItemInput, mode, token string) storefront.OrderInput {
		test.Helper()
		quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items, Fulfillment: mode, TableToken: token})
		if problem != nil {
			test.Fatal(problem)
		}
		input := storefront.OrderInput{Items: items, QuoteID: quote.ID, Fulfillment: mode, TableToken: token, CustomerName: "Synthetic recipe buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("a", 64)}
		if mode == "DELIVERY" {
			input.DeliveryAddress = "Synthetic delivery address"
		}
		return input
	}
	test.Run("shared ingredient shortage rolls back the whole order", func(current *testing.T) {
		input := request([]storefront.ItemInput{{VariantID: menus[0], Quantity: "1.000"}, {VariantID: menus[1], Quantity: "1.000"}}, "PICKUP", "")
		if _, problem := service.CreateOrder(ctx, shop.Slug, "ae222222-2222-4222-8222-222222222222", input); !errors.Is(problem, storefront.ErrConflict) {
			current.Fatalf("shared ingredient overcommit: %v", problem)
		}
		read := begin(org)
		defer read.Rollback(ctx)
		var orders, snapshots int
		if problem := read.QueryRow(ctx, `SELECT (SELECT count(*) FROM online_orders WHERE organization_id=$1),(SELECT count(*) FROM online_order_stock_items WHERE organization_id=$1)`, org).Scan(&orders, &snapshots); problem != nil || orders != 0 || snapshots != 0 {
			current.Fatalf("partial reservation persisted: %d/%d %v", orders, snapshots, problem)
		}
		read.Rollback(ctx)
		assertStock(current, "1.000", "0.000")
	})
	test.Run("competing menus cannot reserve the same last ingredient", func(current *testing.T) {
		inputs := []storefront.OrderInput{request([]storefront.ItemInput{{VariantID: menus[0], Quantity: "1.000"}}, "PICKUP", ""), request([]storefront.ItemInput{{VariantID: menus[1], Quantity: "1.000"}}, "PICKUP", "")}
		type outcome struct {
			order   storefront.Order
			problem error
		}
		start := make(chan struct{})
		results := make(chan outcome, 2)
		for index, input := range inputs {
			go func(index int, input storefront.OrderInput) {
				<-start
				order, problem := service.CreateOrder(ctx, shop.Slug, fmt.Sprintf("ae333333-3333-4333-8333-%012d", index+1), input)
				results <- outcome{order, problem}
			}(index, input)
		}
		close(start)
		var winner storefront.Order
		succeeded := 0
		for range 2 {
			result := <-results
			if result.problem == nil {
				succeeded++
				winner = result.order
			} else if !errors.Is(result.problem, storefront.ErrStock) && !errors.Is(result.problem, storefront.ErrConflict) {
				current.Fatal(result.problem)
			}
		}
		if succeeded != 1 {
			current.Fatalf("expected one successful reservation, got %d", succeeded)
		}
		assertStock(current, "1.000", "0.600")
		if _, problem := service.Transition(ctx, owner, org, winner.ID, storefront.TransitionInput{Revision: winner.Revision, Status: "CANCELLED", Message: "Synthetic release"}); problem != nil {
			current.Fatal(problem)
		}
		assertStock(current, "1.000", "0.000")
	})
	test.Run("delivery rejection releases ingredients without stock movements", func(current *testing.T) {
		input := request([]storefront.ItemInput{{VariantID: menus[0], Quantity: "1.000"}}, "DELIVERY", "")
		order, problem := service.CreateOrder(ctx, shop.Slug, "ae888888-8888-4888-8888-888888888888", input)
		if problem != nil {
			current.Fatal(problem)
		}
		if _, problem = service.Transition(ctx, owner, org, order.ID, storefront.TransitionInput{Revision: order.Revision, Status: "PREPARING"}); !errors.Is(problem, storefront.ErrConflict) {
			current.Fatalf("delivery without payment entered preparation: %v", problem)
		}
		assertStock(current, "1.000", "0.600")
		if _, problem = service.Transition(ctx, owner, org, order.ID, storefront.TransitionInput{Revision: order.Revision, Status: "REJECTED", Message: "Synthetic delivery rejection"}); problem != nil {
			current.Fatal(problem)
		}
		assertStock(current, "1.000", "0.000")
	})
	table, err := restaurantService.SaveTable(ctx, owner, org, "", "ae444444-4444-4444-8444-444444444444", restaurant.TableInput{BranchID: shop.BranchID, Code: "T01", Name: "Ingredient fixture table", Seats: 2, Status: "ACTIVE"})
	if err != nil {
		test.Fatal(err)
	}
	input := request([]storefront.ItemInput{{VariantID: menus[0], Quantity: "1.000"}}, "PICKUP", table.QRToken)
	order, err := service.CreateOrder(ctx, shop.Slug, "ae555555-5555-4555-8555-555555555555", input)
	if err != nil {
		test.Fatal(err)
	}
	if _, err = service.Transition(ctx, owner, org, order.ID, storefront.TransitionInput{Revision: order.Revision, Status: "PREPARING"}); !errors.Is(err, storefront.ErrConflict) {
		test.Fatalf("dine-in order without payment entered preparation: %v", err)
	}
	test.Run("dine in retry holds only once and snapshots are tenant protected", func(current *testing.T) {
		replay, problem := service.CreateOrder(ctx, shop.Slug, order.ID, input)
		if problem != nil || replay.ID != order.ID {
			current.Fatalf("replay: %+v %v", replay, problem)
		}
		assertStock(current, "1.000", "0.600")
		check := begin(org)
		var futureLive bool
		if problem = check.QueryRow(ctx, `SELECT storefront_order_live(organization_id,id,expires_at+interval '1 second') FROM online_orders WHERE organization_id=$1 AND id=$2`, org, order.ID).Scan(&futureLive); problem != nil || futureLive {
			current.Fatalf("unpaid unlinked hold must expire: %v %v", futureLive, problem)
		}
		check.Rollback(ctx)
		write := begin(org)
		var operation string
		if problem = write.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'ingredient.protection',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("0", 64)).Scan(&operation); problem != nil {
			current.Fatal(problem)
		}
		_, problem = write.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'ADJUSTMENT_OUT',-0.500,$5,'SYNTHETIC_HOLD_PROTECTION',$6)`, org, shop.BranchID, shop.LocationID, ingredient, operation, owner)
		var databaseProblem *pgconn.PgError
		if !errors.As(problem, &databaseProblem) || databaseProblem.Code != "23514" {
			current.Fatalf("ingredient movement protection: %v", problem)
		}
		write.Rollback(ctx)
		read := begin(foreignOrg)
		defer read.Rollback(ctx)
		var count int
		if problem = read.QueryRow(ctx, `SELECT count(*) FROM online_order_stock_items WHERE order_id=$1`, order.ID).Scan(&count); problem != nil || count != 0 {
			current.Fatalf("foreign snapshots visible: %d %v", count, problem)
		}
		read.Rollback(ctx)
		for _, statement := range []string{`UPDATE online_order_stock_items SET quantity=0.001 WHERE order_id=$1`, `DELETE FROM online_order_stock_items WHERE order_id=$1`, `INSERT INTO online_order_stock_items SELECT * FROM online_order_stock_items WHERE order_id=$1`} {
			write := begin(org)
			_, problem = write.Exec(ctx, statement, order.ID)
			if !errors.As(problem, &databaseProblem) || databaseProblem.Code != "42501" {
				current.Fatalf("runtime snapshot write protection: %v", problem)
			}
			write.Rollback(ctx)
		}
	})
	revisedRecipe, err := restaurantService.SaveRecipe(ctx, owner, org, recipes[0].ID, "", restaurant.RecipeInput{BranchID: shop.BranchID, MenuVariantID: menus[0], Revision: recipes[0].Revision, Status: "ACTIVE", Items: []restaurant.RecipeIngredientInput{{IngredientVariantID: ingredient, Quantity: "0.900"}}})
	if err != nil {
		test.Fatal(err)
	}
	assertStock(test, "1.000", "0.600")
	otherInput := request([]storefront.ItemInput{{VariantID: ingredient, Quantity: "0.400"}}, "PICKUP", "")
	other, err := service.CreateOrder(ctx, shop.Slug, "ae666666-6666-4666-8666-666666666666", otherInput)
	if err != nil {
		test.Fatal(err)
	}
	assertStock(test, "1.000", "1.000")
	test.Run("order ID is never treated as another cart exclusion", func(current *testing.T) {
		read := begin(org)
		defer read.Rollback(ctx)
		var cartHeld, orderHeld string
		if problem := read.QueryRow(ctx, `SELECT storefront_reserved_quantity($1,$2,$3,$4)::text,storefront_reserved_quantity_for_order($1,$2,$3,$4)::text`, org, shop.LocationID, ingredient, order.ID).Scan(&cartHeld, &orderHeld); problem != nil || cartHeld != "1.000" || orderHeld != "0.400" {
			current.Fatalf("separate identifier namespaces: cart=%s order=%s error=%v", cartHeld, orderHeld, problem)
		}
		available, hasRecipe, saleable, problem := pos.RecipeAvailability(ctx, read, org, shop.BranchID, shop.LocationID, order.ID, menus[0], "1.000")
		if problem != nil || !hasRecipe || saleable || available != "0.000" {
			current.Fatalf("unlinked cart must not adopt an order snapshot/hold: %s %v %v %v", available, hasRecipe, saleable, problem)
		}
		available, hasRecipe, saleable, problem = pos.RecipeAvailabilityForOrder(ctx, read, org, shop.BranchID, shop.LocationID, order.ID, menus[0], "1.000")
		if problem != nil || !hasRecipe || !saleable || available != "1.000" {
			current.Fatalf("order must use its own frozen recipe and hold: %s %v %v %v", available, hasRecipe, saleable, problem)
		}
	})
	if _, err = restaurantService.SaveRecipe(ctx, owner, org, revisedRecipe.ID, "", restaurant.RecipeInput{BranchID: shop.BranchID, MenuVariantID: menus[0], Revision: revisedRecipe.Revision, Status: "INACTIVE", Items: []restaurant.RecipeIngredientInput{{IngredientVariantID: ingredient, Quantity: "0.900"}}}); err != nil {
		test.Fatal(err)
	}
	attempt, err := service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: order.ID, AccessToken: input.AccessToken})
	if err != nil {
		test.Fatal(err)
	}
	body := paymentFixtureEvent(test, "evt_ingredientPaid", "checkout.session.completed", paymentFixtureSession(attempt, "cs_test_ingredientPaid", "complete", "paid"))
	now := time.Now()
	if _, err = service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); err != nil {
		test.Fatal(err)
	}
	for _, status := range []string{"PREPARING", "READY"} {
		order, err = service.Transition(ctx, owner, org, order.ID, storefront.TransitionInput{Revision: order.Revision, Status: status})
		if err != nil {
			test.Fatal(err)
		}
	}
	test.Run("denied and failed settlement retains every hold", func(current *testing.T) {
		if _, problem := point.SettlePrepaidOnlineOrder(ctx, unauthorizedUser, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision}); !errors.Is(problem, pos.ErrNotFound) {
			current.Fatalf("unauthorized settlement: %v", problem)
		}
		if _, problem := point.SettlePrepaidOnlineOrder(ctx, owner, foreignOrg, order.ID, pos.OnlineOrderInput{Revision: order.Revision}); !errors.Is(problem, pos.ErrNotFound) {
			current.Fatalf("foreign settlement: %v", problem)
		}
		if _, problem := point.SettlePrepaidOnlineOrder(ctx, owner, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision}); problem == nil {
			current.Fatal("settled without an open shift")
		}
		assertStock(current, "1.000", "1.000")
	})
	if _, err = point.OpenShift(ctx, owner, org, "ae777777-7777-4777-8777-777777777777", pos.ShiftInput{TerminalID: shop.TerminalID, OpeningCash: "0.00"}); err != nil {
		test.Fatal(err)
	}
	test.Run("completion consumes frozen ingredients once and protects another order", func(current *testing.T) {
		type outcome struct {
			checkout pos.Checkout
			problem  error
		}
		start := make(chan struct{})
		results := make(chan outcome, 2)
		for range 2 {
			go func() {
				<-start
				checkout, problem := point.SettlePrepaidOnlineOrder(ctx, owner, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision})
				results <- outcome{checkout, problem}
			}()
		}
		close(start)
		first, second := <-results, <-results
		if first.problem != nil || second.problem != nil || first.checkout.Status != "COMPLETED" || first.checkout.SaleID == "" || second.checkout.SaleID != first.checkout.SaleID {
			current.Fatalf("settlement/retry: %+v %+v", first, second)
		}
		assertStock(current, "0.400", "0.400")
		read := begin(org)
		defer read.Rollback(ctx)
		var count int
		var amount, status string
		if problem := read.QueryRow(ctx, `SELECT count(*),sum(-quantity_delta)::text,(SELECT status FROM online_orders WHERE organization_id=$1 AND id=$2) FROM stock_movements WHERE organization_id=$1 AND sale_id=$3 AND variant_id=$4 AND movement_type='SALE'`, org, order.ID, first.checkout.SaleID, ingredient).Scan(&count, &amount, &status); problem != nil || count != 1 || amount != "0.600" || status != "COMPLETED" {
			current.Fatalf("frozen deduction: count=%d amount=%s state=%s error=%v", count, amount, status, problem)
		}
		read.Rollback(ctx)
		current.Run("SALE cannot use a different inventory operation", func(current *testing.T) {
			write := begin(org)
			defer write.Rollback(ctx)
			var cart, checkout, sale, correctOperation, wrongOperation string
			if problem := write.QueryRow(ctx, `INSERT INTO pos_carts(organization_id,branch_id,terminal_id,cashier_id,create_key) VALUES($1,$2,$3,$4,gen_random_uuid()) RETURNING id::text`, org, shop.BranchID, shop.TerminalID, owner).Scan(&cart); problem != nil {
				current.Fatal(problem)
			}
			if problem := write.QueryRow(ctx, `INSERT INTO pos_checkouts SELECT (jsonb_populate_record(NULL::pos_checkouts,to_jsonb(source)||jsonb_build_object('id',gen_random_uuid(),'cart_id',$3::uuid,'idempotency_key',gen_random_uuid(),'status','CONFIRMED','method','CASH','prepaid_order_id',NULL,'prepaid_order_revision',NULL))).* FROM pos_checkouts source WHERE organization_id=$1 AND id=$2 RETURNING id::text`, org, first.checkout.ID, cart).Scan(&checkout); problem != nil {
				current.Fatal(problem)
			}
			for _, operation := range []*string{&correctOperation, &wrongOperation} {
				if problem := write.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'ingredient.operation-guard',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("0", 64)).Scan(operation); problem != nil {
					current.Fatal(problem)
				}
			}
			if problem := write.QueryRow(ctx, `INSERT INTO sales SELECT (jsonb_populate_record(NULL::sales,to_jsonb(source)||jsonb_build_object('id',gen_random_uuid(),'cart_id',$3::uuid,'checkout_id',$4::uuid,'inventory_operation_id',$5::uuid,'sale_number',gen_random_uuid()::text))).* FROM sales source WHERE organization_id=$1 AND id=$2 RETURNING id::text`, org, first.checkout.SaleID, cart, checkout, correctOperation).Scan(&sale); problem != nil {
				current.Fatal(problem)
			}
			_, problem := write.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,sale_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'SALE',-0.001,$5,$6,'SYNTHETIC_OPERATION_MISMATCH',$7)`, org, shop.BranchID, shop.LocationID, ingredient, wrongOperation, sale, owner)
			var databaseProblem *pgconn.PgError
			if !errors.As(problem, &databaseProblem) || databaseProblem.Code != "23514" || databaseProblem.Message != "sale inventory operation mismatch" {
				current.Fatalf("wrong-operation SALE must be rejected before hold exemption: %v", problem)
			}
		})
		assertStock(current, "0.400", "0.400")
	})
	if _, err = service.Transition(ctx, owner, org, other.ID, storefront.TransitionInput{Revision: other.Revision, Status: "CANCELLED", Message: "Synthetic cleanup release"}); err != nil {
		test.Fatal(err)
	}
	assertStock(test, "0.400", "0.000")
	settle := func(current *testing.T, key string, input storefront.OrderInput) pos.Checkout {
		current.Helper()
		next, problem := service.CreateOrder(ctx, shop.Slug, key, input)
		if problem != nil {
			current.Fatal(problem)
		}
		attempt, problem := service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: next.ID, AccessToken: input.AccessToken})
		if problem != nil {
			current.Fatal(problem)
		}
		providerKey := strings.ReplaceAll(key, "-", "")
		body := paymentFixtureEvent(current, "evt_"+providerKey, "checkout.session.completed", paymentFixtureSession(attempt, "cs_test_"+providerKey, "complete", "paid"))
		now := time.Now()
		if _, problem = service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); problem != nil {
			current.Fatal(problem)
		}
		for _, status := range []string{"PREPARING", "READY"} {
			next, problem = service.Transition(ctx, owner, org, next.ID, storefront.TransitionInput{Revision: next.Revision, Status: status})
			if problem != nil {
				current.Fatal(problem)
			}
		}
		checkout, problem := point.SettlePrepaidOnlineOrder(ctx, owner, org, next.ID, pos.OnlineOrderInput{Revision: next.Revision})
		if problem != nil || checkout.Status != "COMPLETED" || checkout.SaleID == "" {
			current.Fatalf("settlement: %+v %v", checkout, problem)
		}
		return checkout
	}
	test.Run("pickup menu and direct ingredient share one settlement movement", func(current *testing.T) {
		if _, problem := restaurantService.SaveRecipe(ctx, owner, org, recipes[1].ID, "", restaurant.RecipeInput{BranchID: shop.BranchID, MenuVariantID: menus[1], Revision: recipes[1].Revision, Status: "ACTIVE", Items: []restaurant.RecipeIngredientInput{{IngredientVariantID: ingredient, Quantity: "0.200"}}}); problem != nil {
			current.Fatal(problem)
		}
		input := request([]storefront.ItemInput{{VariantID: menus[1], Quantity: "1.000"}, {VariantID: ingredient, Quantity: "0.100"}}, "PICKUP", "")
		checkout := settle(current, "ae999999-9999-4999-8999-999999999999", input)
		assertStock(current, "0.100", "0.000")
		read := begin(org)
		defer read.Rollback(ctx)
		var count int
		var quantity string
		if problem := read.QueryRow(ctx, `SELECT count(*),sum(-quantity_delta)::text FROM stock_movements WHERE organization_id=$1 AND sale_id=$2 AND variant_id=$3`, org, checkout.SaleID, ingredient).Scan(&count, &quantity); problem != nil || count != 1 || quantity != "0.300" {
			current.Fatalf("mixed settlement must aggregate frozen/direct quantities: %d %s %v", count, quantity, problem)
		}
	})
	test.Run("direct item does not gain ingredients from a later recipe", func(current *testing.T) {
		write := begin(org)
		defer write.Rollback(ctx)
		var direct, operation string
		if problem := write.QueryRow(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency) VALUES($1,$2,'DIRECT_DISH','Direct dish',$3,1,10,'THB') RETURNING id::text`, org, product, countUnit).Scan(&direct); problem != nil {
			current.Fatal(problem)
		}
		if _, problem := write.Exec(ctx, `INSERT INTO storefront_products(organization_id,variant_id,published) VALUES($1,$2,true)`, org, direct); problem != nil {
			current.Fatal(problem)
		}
		if problem := write.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'ingredient.direct-fixture',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("0", 64)).Scan(&operation); problem != nil {
			current.Fatal(problem)
		}
		if _, problem := write.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'OPENING_BALANCE',1.000,$5,'SYNTHETIC_DIRECT_DISH',$6)`, org, shop.BranchID, shop.LocationID, direct, operation, owner); problem != nil {
			current.Fatal(problem)
		}
		if _, problem := write.Exec(ctx, `UPDATE inventory_operations SET result='{}' WHERE organization_id=$1 AND id=$2`, org, operation); problem != nil {
			current.Fatal(problem)
		}
		if problem := write.Commit(ctx); problem != nil {
			current.Fatal(problem)
		}
		input := request([]storefront.ItemInput{{VariantID: direct, Quantity: "1.000"}}, "PICKUP", "")
		key := "aebbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
		if _, problem := service.CreateOrder(ctx, shop.Slug, key, input); problem != nil {
			current.Fatal(problem)
		}
		if _, problem := restaurantService.SaveRecipe(ctx, owner, org, "", "aeaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", restaurant.RecipeInput{BranchID: shop.BranchID, MenuVariantID: direct, Status: "ACTIVE", Items: []restaurant.RecipeIngredientInput{{IngredientVariantID: ingredient, Quantity: "0.100"}}}); problem != nil {
			current.Fatal(problem)
		}
		checkout := settle(current, key, input)
		assertStock(current, "0.100", "0.000")
		read := begin(org)
		defer read.Rollback(ctx)
		var count int
		var quantity, balance string
		if problem := read.QueryRow(ctx, `SELECT count(*),sum(-quantity_delta)::text,(SELECT quantity::text FROM stock_balances WHERE organization_id=$1 AND location_id=$3 AND variant_id=$4) FROM stock_movements WHERE organization_id=$1 AND sale_id=$2 AND variant_id=$4`, org, checkout.SaleID, shop.LocationID, direct).Scan(&count, &quantity, &balance); problem != nil || count != 1 || quantity != "1.000" || balance != "0.000" {
			current.Fatalf("direct snapshot settlement: %d %s %s %v", count, quantity, balance, problem)
		}
	})
	test.Run("delivery settlement requires shipment and retains paid hold", func(current *testing.T) {
		write := begin(org)
		defer write.Rollback(ctx)
		var operation string
		if problem := write.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'ingredient.delivery-guard',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("0", 64)).Scan(&operation); problem != nil {
			current.Fatal(problem)
		}
		if _, problem := write.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'ADJUSTMENT_IN',0.200,$5,'SYNTHETIC_DELIVERY_GUARD',$6)`, org, shop.BranchID, shop.LocationID, ingredient, operation, owner); problem != nil {
			current.Fatal(problem)
		}
		if _, problem := write.Exec(ctx, `UPDATE inventory_operations SET result='{}' WHERE organization_id=$1 AND id=$2`, org, operation); problem != nil {
			current.Fatal(problem)
		}
		if problem := write.Commit(ctx); problem != nil {
			current.Fatal(problem)
		}
		items := []storefront.ItemInput{{VariantID: menus[1], Quantity: "1.000"}, {VariantID: ingredient, Quantity: "0.100"}}
		quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items, Fulfillment: "DELIVERY"})
		if problem != nil {
			current.Fatal(problem)
		}
		input := storefront.OrderInput{Items: items, QuoteID: quote.ID, Fulfillment: "DELIVERY", DeliveryAddress: "Synthetic delivery address", CustomerName: "Synthetic recipe buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("a", 64)}
		next, problem := service.CreateOrder(ctx, shop.Slug, "aecccccc-cccc-4ccc-8ccc-cccccccccccc", input)
		if problem != nil {
			current.Fatal(problem)
		}
		attempt, problem := service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: next.ID, AccessToken: input.AccessToken})
		if problem != nil {
			current.Fatal(problem)
		}
		body := paymentFixtureEvent(current, "evt_ingredientDeliveryGuard", "checkout.session.completed", paymentFixtureSession(attempt, "cs_test_ingredientDeliveryGuard", "complete", "paid"))
		now := time.Now()
		if _, problem = service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); problem != nil {
			current.Fatal(problem)
		}
		for _, status := range []string{"PREPARING", "READY"} {
			next, problem = service.Transition(ctx, owner, org, next.ID, storefront.TransitionInput{Revision: next.Revision, Status: status})
			if problem != nil {
				current.Fatal(problem)
			}
		}
		assertStock(current, "0.300", "0.300")
		type effects struct{ carts, checkouts, sales, movements int }
		readEffects := func() effects {
			current.Helper()
			read := begin(org)
			defer read.Rollback(ctx)
			var result effects
			if problem := read.QueryRow(ctx, `SELECT (SELECT count(*) FROM pos_carts WHERE organization_id=$1),(SELECT count(*) FROM pos_checkouts WHERE organization_id=$1),(SELECT count(*) FROM sales WHERE organization_id=$1),(SELECT count(*) FROM stock_movements WHERE organization_id=$1)`, org).Scan(&result.carts, &result.checkouts, &result.sales, &result.movements); problem != nil {
				current.Fatal(problem)
			}
			return result
		}
		before := readEffects()
		if _, problem = point.SettlePrepaidOnlineOrder(ctx, owner, org, next.ID, pos.OnlineOrderInput{Revision: next.Revision}); !errors.Is(problem, pos.ErrConflict) {
			current.Fatalf("delivery bypassed shipment guard: %v", problem)
		}
		if after := readEffects(); after != before {
			current.Fatalf("delivery failure changed transaction effects: before=%+v after=%+v", before, after)
		}
		read := begin(org)
		defer read.Rollback(ctx)
		var status, paymentState string
		var released, unlinked bool
		if problem = read.QueryRow(ctx, `SELECT doc.status,attempt.state,attempt.stock_hold_released,doc.cart_id IS NULL AND doc.sale_id IS NULL FROM online_orders doc JOIN online_payment_attempts attempt ON attempt.organization_id=doc.organization_id AND attempt.order_id=doc.id WHERE doc.organization_id=$1 AND doc.id=$2`, org, next.ID).Scan(&status, &paymentState, &released, &unlinked); problem != nil || status != "READY" || paymentState != "PAID" || released || !unlinked {
			current.Fatalf("delivery hold changed: status=%s payment=%s released=%v unlinked=%v error=%v", status, paymentState, released, unlinked, problem)
		}
		read.Rollback(ctx)
		assertStock(current, "0.300", "0.300")
	})
}
