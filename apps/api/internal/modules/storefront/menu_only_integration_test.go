package storefront_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"

	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/restaurant"
	"smartpos/api/internal/modules/returns"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/stripe"
)

func menuOnlyAcceptance(t *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, foreignOrg, unauthorized string) {
	t.Helper()
	tx, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var unit, product, variant, ingredient, recipe string
	if err = tx.QueryRow(ctx, `INSERT INTO units(organization_id,code,name,unit_type) VALUES($1,'MENU_ONLY','Menu dish','COUNT') RETURNING id::text`, org).Scan(&unit); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO products(organization_id,name,created_by,updated_by) VALUES($1,'Zero stock dish',$2,$2) RETURNING id::text`, org, owner).Scan(&product); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency) VALUES($1,$2,'ZERO_MENU','Zero dish',$3,1,10,'THB') RETURNING id::text`, org, product, unit).Scan(&variant); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO storefront_products(organization_id,variant_id,published) VALUES($1,$2,true)`, org, variant); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency) VALUES($1,$2,'LEGACY_INGREDIENT','Ingredient',$3,1,10,'THB') RETURNING id::text`, org, product, unit).Scan(&ingredient); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO restaurant_recipes(organization_id,branch_id,menu_variant_id,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING id::text`, org, shop.BranchID, variant, owner).Scan(&recipe); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO restaurant_recipe_items(organization_id,recipe_id,ingredient_variant_id,quantity,unit_id) VALUES($1,$2,$3,1,$4)`, org, recipe, ingredient, unit); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	service := &storefront.Service{Organization: organizations}
	point := &pos.Service{Organization: organizations}
	products, err := service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 1, Availability: "available"})
	if err != nil || len(products.Items) != 1 || products.Items[0].Available != nil || products.Items[0].StockPolicy != "MENU_ONLY" || !products.Items[0].Saleable {
		t.Fatalf("zero stock browse: %+v %v", products, err)
	}
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "2.000"}}
	quote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil || quote.Total != "20.00" {
		t.Fatalf("zero stock quote: %+v %v", quote, err)
	}
	input := storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("f", 64)}
	order, err := service.CreateOrder(ctx, shop.Slug, "bf222222-2222-4222-8222-222222222222", input)
	if err != nil || order.StockPolicy != "MENU_ONLY" {
		t.Fatalf("zero stock order: %+v %v", order, err)
	}
	if _, err = service.Transition(ctx, owner, org, order.ID, storefront.TransitionInput{Revision: order.Revision, Status: "PREPARING"}); !errors.Is(err, storefront.ErrConflict) {
		t.Fatalf("unpaid preparation: %v", err)
	}
	if _, err = service.Order(ctx, unauthorized, org, order.ID); err == nil {
		t.Fatal("unauthorized order read")
	}
	if _, err = service.Order(ctx, owner, foreignOrg, order.ID); err == nil {
		t.Fatal("foreign order read")
	}
	payReservationFixture(t, ctx, service, shop.Slug, input.AccessToken, order)
	for _, status := range []string{"PREPARING", "READY"} {
		order, err = service.Transition(ctx, owner, org, order.ID, storefront.TransitionInput{Revision: order.Revision, Status: status})
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, err = point.OpenShift(ctx, owner, org, "bf333333-3333-4333-8333-333333333333", pos.ShiftInput{TerminalID: shop.TerminalID, OpeningCash: "0.00"}); err != nil {
		t.Fatal(err)
	}
	settled, err := point.SettlePrepaidOnlineOrder(ctx, owner, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision})
	if err != nil || settled.Status != "COMPLETED" || settled.SaleID == "" {
		t.Fatalf("prepaid settlement: %+v %v", settled, err)
	}
	returnable, err := (&returns.Service{Organization: organizations}).Get(ctx, owner, org, "sale", settled.SaleID)
	if err != nil {
		t.Fatal(err)
	}
	var returnableSale struct {
		StockPolicy string `json:"stock_policy"`
	}
	if err = json.Unmarshal(returnable, &returnableSale); err != nil || returnableSale.StockPolicy != "MENU_ONLY" {
		t.Fatalf("returnable menu policy: %s %v", returnable, err)
	}
	replay, err := point.SettlePrepaidOnlineOrder(ctx, owner, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision})
	if err != nil || replay.SaleID != settled.SaleID {
		t.Fatalf("settlement replay: %+v %v", replay, err)
	}
	read, _, err := organizations.Authorized(ctx, owner, org, "pos.checkout")
	if err != nil {
		t.Fatal(err)
	}
	defer read.Rollback(ctx)
	var snapshots, movements int
	var policy string
	if err = read.QueryRow(ctx, `SELECT (SELECT count(*) FROM online_order_stock_items WHERE organization_id=$1 AND order_id=$2),(SELECT count(*) FROM stock_movements WHERE organization_id=$1 AND sale_id=$3),(SELECT stock_policy FROM sales WHERE organization_id=$1 AND id=$3)`, org, order.ID, settled.SaleID).Scan(&snapshots, &movements, &policy); err != nil || snapshots != 0 || movements != 0 || policy != "MENU_ONLY" {
		t.Fatalf("settlement stock effects: %d %d %s %v", snapshots, movements, policy, err)
	}
	read.Rollback(ctx)
	cart, err := point.CreateCart(ctx, owner, org, "bf444444-4444-4444-8444-444444444444", pos.CartInput{TerminalID: shop.TerminalID})
	if err != nil || cart.StockPolicy != "MENU_ONLY" {
		t.Fatalf("new cart: %+v %v", cart, err)
	}
	cart, err = point.UpdateCart(ctx, owner, org, cart.ID, "update", pos.CartInput{Revision: cart.Revision, Items: []pos.ItemInput{{VariantID: variant, Quantity: "1.000"}}})
	if err != nil || len(cart.Items) != 1 || cart.Items[0].Available != nil || cart.ReviewRequired {
		t.Fatalf("zero stock cart: %+v %v", cart, err)
	}
	batch := "bf555555-5555-4555-8555-555555555555"
	if _, err = point.UpdateCart(ctx, owner, org, cart.ID, "update", pos.CartInput{Revision: cart.Revision, Items: []pos.ItemInput{{VariantID: variant, Quantity: "1.000", BatchID: &batch, BatchVerified: true}}}); !errors.Is(err, pos.ErrInput) {
		t.Fatalf("menu batch accepted: %v", err)
	}
	checkout, err := point.PrepareCheckout(ctx, owner, org, "bf666666-6666-4666-8666-666666666666", pos.CheckoutInput{CartID: cart.ID, Revision: cart.Revision, Method: "CASH", ExpectedTotal: cart.Total, Received: cart.Total, PricingRevision: cart.Pricing.Revision})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = point.ConfirmPayment(ctx, owner, org, checkout.ID, "bf777777-7777-4777-8777-777777777777", pos.ConfirmationInput{Acknowledged: true}); err != nil {
		t.Fatal(err)
	}
	checkout, err = point.CompleteCheckout(ctx, owner, org, checkout.ID)
	if err != nil || checkout.Status != "COMPLETED" {
		t.Fatalf("cash checkout: %+v %v", checkout, err)
	}
	t.Run("financial-only returns and exchanges", func(test *testing.T) {
		menuOnlyReturnsAcceptance(test, ctx, organizations, owner, org, shop, checkout.SaleID, variant)
	})
	linkedOrder, err := service.CreateOrder(ctx, shop.Slug, "bfdddddd-dddd-4ddd-8ddd-dddddddddddd", input)
	if err != nil {
		t.Fatal(err)
	}
	payReservationFixture(t, ctx, service, shop.Slug, input.AccessToken, linkedOrder)
	for _, status := range []string{"PREPARING", "READY"} {
		linkedOrder, err = service.Transition(ctx, owner, org, linkedOrder.ID, storefront.TransitionInput{Revision: linkedOrder.Revision, Status: status})
		if err != nil {
			t.Fatalf("linked order readiness: %v", err)
		}
	}
	linkTx, _, err := organizations.Authorized(ctx, owner, org, "pos.cart.manage")
	if err != nil {
		t.Fatal(err)
	}
	var linkedCart string
	err = linkTx.QueryRow(ctx, `INSERT INTO pos_carts(organization_id,branch_id,terminal_id,cashier_id,create_key,stock_policy) VALUES($1,$2,$3,$4,gen_random_uuid(),'TRACKED') RETURNING id::text`, org, shop.BranchID, shop.TerminalID, owner).Scan(&linkedCart)
	if err != nil {
		linkTx.Rollback(ctx)
		t.Fatal(err)
	}
	if _, err = linkTx.Exec(ctx, `UPDATE online_orders SET cart_id=$3,revision=revision+1 WHERE organization_id=$1 AND id=$2`, org, linkedOrder.ID, linkedCart); err != nil {
		linkTx.Rollback(ctx)
		t.Fatal(err)
	}
	err = linkTx.Commit(ctx)
	var constraintError *pgconn.PgError
	if !errors.As(err, &constraintError) || constraintError.Code != "23514" || constraintError.Message != "payment-backed cart requires atomic prepaid settlement" {
		t.Fatalf("non-atomic prepaid link must be rejected: %v", err)
	}
	if _, err = point.Cart(ctx, owner, org, linkedCart); !errors.Is(err, pos.ErrNotFound) {
		t.Fatalf("rejected prepaid link must roll back its cart: %v", err)
	}
	linkedSale, err := point.SettlePrepaidOnlineOrder(ctx, owner, org, linkedOrder.ID, pos.OnlineOrderInput{Revision: linkedOrder.Revision})
	if err != nil || linkedSale.Status != "COMPLETED" {
		t.Fatalf("atomic prepaid settlement: %+v %v", linkedSale, err)
	}
	linkedCart = linkedSale.CartID
	detail, err := point.Cart(ctx, owner, org, linkedCart)
	if err != nil || detail.StockPolicy != "MENU_ONLY" {
		t.Fatalf("linked cart detail policy: %+v %v", detail, err)
	}
	page, err := point.List(ctx, owner, org, "carts", pos.Filter{Page: 1, PageSize: 100})
	if err != nil {
		t.Fatal(err)
	}
	entries, ok := page.Items.([]json.RawMessage)
	if !ok {
		t.Fatalf("unexpected cart list: %T", page.Items)
	}
	found := false
	for _, entry := range entries {
		var listed struct {
			ID          string `json:"id"`
			StockPolicy string `json:"stock_policy"`
		}
		if err = json.Unmarshal(entry, &listed); err != nil {
			t.Fatal(err)
		}
		if listed.ID == linkedCart {
			found = true
			if listed.StockPolicy != detail.StockPolicy {
				t.Fatalf("linked cart list policy: %s; detail: %s", listed.StockPolicy, detail.StockPolicy)
			}
		}
	}
	if !found {
		t.Fatal("linked cart missing from list")
	}
	cancelled, err := service.CreateOrder(ctx, shop.Slug, "bf888888-8888-4888-8888-888888888888", input)
	if err != nil {
		t.Fatal(err)
	}
	cancelled, err = service.Transition(ctx, owner, org, cancelled.ID, storefront.TransitionInput{Revision: cancelled.Revision, Status: "CANCELLED", Message: "Synthetic cancellation"})
	if err != nil || cancelled.Status != "CANCELLED" {
		t.Fatalf("unpaid cancellation: %+v %v", cancelled, err)
	}
	refundable, err := service.CreateOrder(ctx, shop.Slug, "bf999999-9999-4999-8999-999999999999", input)
	if err != nil {
		t.Fatal(err)
	}
	payReservationFixture(t, ctx, service, shop.Slug, input.AccessToken, refundable)
	client := service.CustomerPayments.(*stripe.CustomerClient)
	service.CustomerPayments = &refundGatewayFixture{CustomerClient: client, createRefund: func(_ context.Context, charge stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
		return stripe.CustomerRefund{ID: "re_menuOnly", Object: "refund", Status: "succeeded", AmountMinor: charge.AmountMinor, Currency: "thb", PaymentIntent: charge.PaymentIntent, Metadata: map[string]string{"smartpos_purpose": stripe.CustomerRefundPurpose, "organization_id": org, "order_id": refundable.ID, "refund_id": charge.RefundID}}, nil
	}}
	refund, err := service.CancelPaidCustomerOrder(ctx, owner, org, refundable.ID, "bfaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
	if err != nil || refund.State != "SUCCEEDED" {
		t.Fatalf("paid cancellation refund: %+v %v", refund, err)
	}
	read, _, err = organizations.Authorized(ctx, owner, org, "pos.checkout")
	if err != nil {
		t.Fatal(err)
	}
	defer read.Rollback(ctx)
	if err = read.QueryRow(ctx, `SELECT (SELECT count(*) FROM online_order_stock_items WHERE organization_id=$1),(SELECT count(*) FROM stock_movements WHERE organization_id=$1)`, org).Scan(&snapshots, &movements); err != nil || snapshots != 0 || movements != 0 {
		t.Fatalf("cancel/refund stock effects: %d %d %v", snapshots, movements, err)
	}
	read.Rollback(ctx)
	// Simulate a pre-migration order by inserting with the legacy TRACKED default.
	legacy, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		t.Fatal(err)
	}
	defer legacy.Rollback(ctx)
	var operation, legacyOrder, frozen string
	if err = legacy.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'legacy.fixture',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("0", 64)).Scan(&operation); err != nil {
		t.Fatal(err)
	}
	if _, err = legacy.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'OPENING_BALANCE',3,$5,'LEGACY_FIXTURE',$6)`, org, shop.BranchID, shop.LocationID, ingredient, operation, owner); err != nil {
		t.Fatal(err)
	}
	if _, err = legacy.Exec(ctx, `UPDATE inventory_operations SET result='{}' WHERE organization_id=$1 AND id=$2`, org, operation); err != nil {
		t.Fatal(err)
	}
	legacyHash := sha256.Sum256([]byte(input.AccessToken))
	if err = legacy.QueryRow(ctx, `INSERT INTO online_orders(id,organization_id,branch_id,terminal_id,stock_location_id,customer_name,contact_phone,store_name,estimated_total,access_hash,request_fingerprint) VALUES(gen_random_uuid(),$1,$2,$3,$4,'Legacy buyer','0800000000','Legacy',10,$5,$6) RETURNING id::text`, org, shop.BranchID, shop.TerminalID, shop.LocationID, hex.EncodeToString(legacyHash[:]), strings.Repeat("0", 64)).Scan(&legacyOrder); err != nil {
		t.Fatal(err)
	}
	if _, err = legacy.Exec(ctx, `INSERT INTO online_order_items(organization_id,order_id,variant_id,product_name,variant_name,sku,unit,quantity,unit_price,line_total) VALUES($1,$2,$3,'Legacy','Legacy','ZERO_MENU','dish',1,10,10)`, org, legacyOrder, variant); err != nil {
		t.Fatal(err)
	}
	if _, err = legacy.Exec(ctx, `INSERT INTO online_order_events(organization_id,order_id,status) VALUES($1,$2,'PENDING')`, org, legacyOrder); err != nil {
		t.Fatal(err)
	}
	if _, err = legacy.Exec(ctx, `SET CONSTRAINTS ALL IMMEDIATE`); err != nil {
		t.Fatal(err)
	}
	if err = legacy.QueryRow(ctx, `SELECT doc.stock_policy,snapshot.stock_variant_id::text FROM online_orders doc JOIN online_order_stock_items snapshot ON snapshot.organization_id=doc.organization_id AND snapshot.order_id=doc.id WHERE doc.organization_id=$1 AND doc.id=$2`, org, legacyOrder).Scan(&policy, &frozen); err != nil || policy != "TRACKED" || frozen != ingredient {
		t.Fatalf("legacy frozen snapshot: %s %s %v", policy, frozen, err)
	}
	if err = legacy.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	_, err = (&restaurant.Service{Organization: organizations}).SaveRecipe(ctx, owner, org, recipe, "", restaurant.RecipeInput{BranchID: shop.BranchID, MenuVariantID: variant, Revision: 1, Status: "ACTIVE", Items: []restaurant.RecipeIngredientInput{{IngredientVariantID: ingredient, Quantity: "2.000"}}})
	if err != nil {
		t.Fatal(err)
	}
	legacyDoc, err := service.Order(ctx, owner, org, legacyOrder)
	if err != nil {
		t.Fatal(err)
	}
	payReservationFixture(t, ctx, service, shop.Slug, input.AccessToken, legacyDoc)
	for _, status := range []string{"PREPARING", "READY"} {
		legacyDoc, err = service.Transition(ctx, owner, org, legacyDoc.ID, storefront.TransitionInput{Revision: legacyDoc.Revision, Status: status})
		if err != nil {
			t.Fatal(err)
		}
	}
	legacySale, err := point.SettlePrepaidOnlineOrder(ctx, owner, org, legacyDoc.ID, pos.OnlineOrderInput{Revision: legacyDoc.Revision})
	if err != nil || legacySale.Status != "COMPLETED" {
		t.Fatalf("legacy settlement: %+v %v", legacySale, err)
	}
	returnable, err = (&returns.Service{Organization: organizations}).Get(ctx, owner, org, "sale", legacySale.SaleID)
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(returnable, &returnableSale); err != nil || returnableSale.StockPolicy != "TRACKED" {
		t.Fatalf("returnable tracked policy: %s %v", returnable, err)
	}
	legacyReplay, err := point.SettlePrepaidOnlineOrder(ctx, owner, org, legacyDoc.ID, pos.OnlineOrderInput{Revision: legacyDoc.Revision})
	if err != nil || legacyReplay.SaleID != legacySale.SaleID {
		t.Fatalf("legacy replay: %+v %v", legacyReplay, err)
	}
	verify, _, err := organizations.Authorized(ctx, owner, org, "pos.checkout")
	if err != nil {
		t.Fatal(err)
	}
	defer verify.Rollback(ctx)
	var quantity string
	if err = verify.QueryRow(ctx, `SELECT COALESCE(sum(-quantity_delta),0)::text FROM stock_movements WHERE organization_id=$1 AND sale_id=$2 AND variant_id=$3`, org, legacySale.SaleID, ingredient).Scan(&quantity); err != nil || quantity != "1.000" {
		t.Fatalf("legacy frozen ingredient movement: %s %v", quantity, err)
	}
	verify.Rollback(ctx)
	if _, err = (&inventory.Service{Organization: organizations}).CreateRecall(ctx, owner, org, "bfbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", inventory.RecallInput{VariantID: variant, Reason: "Synthetic menu recall"}); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items}); !errors.Is(err, storefront.ErrStock) {
		t.Fatalf("recalled menu was quoted: %v", err)
	}
}
