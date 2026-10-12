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

func sourceAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, foreignTerminal, unauthorizedUser string) {
	test.Helper()
	tx, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		test.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var backLocation, backTerminal, sharedTerminal, otherBranch, otherLocation, otherTerminal string
	if err = tx.QueryRow(ctx, `INSERT INTO stock_locations(organization_id,branch_id,code,name,type,created_by,updated_by) VALUES($1,$2,'BACK','Synthetic back stock','WAREHOUSE',$3,$3) RETURNING id::text`, org, shop.BranchID, owner).Scan(&backLocation); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO pos_terminals(organization_id,branch_id,code,name,stock_location_id) VALUES($1,$2,'ONLINE','Synthetic online terminal',$3) RETURNING id::text`, org, shop.BranchID, backLocation).Scan(&backTerminal); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO pos_terminals(organization_id,branch_id,code,name,stock_location_id) VALUES($1,$2,'SHARED','Synthetic shared source',$3) RETURNING id::text`, org, shop.BranchID, shop.LocationID).Scan(&sharedTerminal); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO branches(organization_id,code,name) VALUES($1,'OTHER','Synthetic other branch') RETURNING id::text`, org).Scan(&otherBranch); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO stock_locations(organization_id,branch_id,code,name,type,created_by,updated_by) VALUES($1,$2,'OTHER','Synthetic other warehouse','WAREHOUSE',$3,$3) RETURNING id::text`, org, otherBranch, owner).Scan(&otherLocation); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO pos_terminals(organization_id,branch_id,code,name,stock_location_id) VALUES($1,$2,'OTHER','Synthetic other terminal',$3) RETURNING id::text`, org, otherBranch, otherLocation).Scan(&otherTerminal); err != nil {
		test.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		test.Fatal(err)
	}
	service := &storefront.Service{Organization: &organization.Service{Pool: organizations.Pool, SingleStoreOrganizationID: org}}
	variant := seedSourceProduct(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, backLocation)
	input := storefront.SettingsInput{Slug: shop.Slug, Name: shop.Name, TerminalID: shop.TerminalID, OnlineTerminalID: backTerminal, Published: true, AcceptingOrders: true, Revision: shop.Revision}
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "2.000"}}
	frontQuote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		test.Fatal(err)
	}
	request := storefront.OrderInput{Items: items, QuoteID: frontQuote.ID, CustomerName: "Synthetic source buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("d", 64)}
	legacy, err := service.CreateOrder(ctx, shop.Slug, "d2222222-2222-4222-8222-222222222222", request)
	if err != nil {
		test.Fatal(err)
	}
	test.Run("source cannot change while a default-source order is live", func(test *testing.T) {
		if _, problem := service.SaveSettings(ctx, owner, org, input); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("live source switch: %v", problem)
		}
	})
	if _, err = service.Transition(ctx, owner, org, legacy.ID, storefront.TransitionInput{Revision: legacy.Revision, Status: "CANCELLED", Message: "Synthetic source test"}); err != nil {
		test.Fatal(err)
	}
	configured, err := service.SaveSettings(ctx, owner, org, input)
	if err != nil {
		test.Fatal(err)
	}
	if configured.TerminalID != shop.TerminalID || configured.LocationID != backLocation || configured.BranchID != shop.BranchID {
		test.Fatalf("online source must use back warehouse without changing the front terminal: %+v", configured)
	}
	input.Revision = configured.Revision
	test.Run("inactive online source closes quotes instead of using front stock", func(test *testing.T) {
		setSourceTerminalStatus(test, ctx, organizations, owner, org, backTerminal, "INACTIVE")
		_, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
		setSourceTerminalStatus(test, ctx, organizations, owner, org, backTerminal, "ACTIVE")
		if !errors.Is(problem, storefront.ErrClosed) {
			test.Fatalf("inactive online source did not close quotes: %v", problem)
		}
	})
	test.Run("public settings do not disclose either terminal or the stock source", func(test *testing.T) {
		public, problem := service.PublicSettings(ctx, shop.Slug)
		encoded, encodeError := json.Marshal(public)
		if problem != nil || encodeError != nil || strings.Contains(string(encoded), "terminal_id") || strings.Contains(string(encoded), "stock_location_id") || strings.Contains(string(encoded), "branch_id") {
			test.Fatalf("public source projection: %s error %v", encoded, problem)
		}
	})
	test.Run("invalid same-location cross-branch foreign and unauthorized sources are rejected", func(test *testing.T) {
		for candidate, expected := range map[string]error{shop.TerminalID: storefront.ErrInput, sharedTerminal: storefront.ErrConflict, otherTerminal: storefront.ErrConflict, foreignTerminal: storefront.ErrNotFound} {
			invalid := input
			invalid.OnlineTerminalID = candidate
			if _, problem := service.SaveSettings(ctx, owner, org, invalid); !errors.Is(problem, expected) {
				test.Fatalf("invalid source classification: %v, expected %v", problem, expected)
			}
		}
		if _, problem := service.SaveSettings(ctx, unauthorizedUser, org, input); problem == nil {
			test.Fatal("nonmember configured a stock source")
		}
	})
	test.Run("database rejects incompatible sources and configured-terminal drift", func(test *testing.T) {
		for _, candidate := range []string{shop.TerminalID, sharedTerminal, otherTerminal, foreignTerminal} {
			rejectSourceWrite(test, ctx, organizations, owner, org, `UPDATE storefronts SET online_terminal_id=$2 WHERE organization_id=$1`, org, candidate)
		}
		rejectSourceWrite(test, ctx, organizations, owner, org, `UPDATE pos_terminals SET stock_location_id=$3 WHERE organization_id=$1 AND id=$2`, org, backTerminal, shop.LocationID)
		rejectSourceWrite(test, ctx, organizations, owner, org, `UPDATE pos_terminals SET stock_location_id=$3 WHERE organization_id=$1 AND id=$2`, org, shop.TerminalID, backLocation)
	})
	test.Run("switch invalidates an old quote without moving legacy order snapshots", func(test *testing.T) {
		if _, problem := service.CreateOrder(ctx, shop.Slug, "d3333333-3333-4333-8333-333333333333", request); !errors.Is(problem, storefront.ErrQuote) {
			test.Fatalf("old quote accepted after source change: %v", problem)
		}
		previous, problem := service.Order(ctx, owner, org, legacy.ID)
		if problem != nil || previous.TerminalID != shop.TerminalID || previous.Status != "CANCELLED" {
			test.Fatalf("legacy source changed: %+v error %v", previous, problem)
		}
	})
	quote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		test.Fatal(err)
	}
	request.QuoteID = quote.ID
	order, err := service.CreateOrder(ctx, shop.Slug, "d4444444-4444-4444-8444-444444444444", request)
	if err != nil {
		test.Fatal(err)
	}
	test.Run("online reservation affects only the back source and replay holds once", func(test *testing.T) {
		replay, problem := service.CreateOrder(ctx, shop.Slug, order.ID, request)
		if problem != nil || replay.ID != order.ID {
			test.Fatalf("source order retry: %v", problem)
		}
		assertSourceStock(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, variant, "7.000", "0.000", "7.000")
		assertSourceStock(test, ctx, organizations, owner, org, shop.BranchID, backLocation, variant, "3.000", "2.000", "0.000")
		products, problem := service.Products(ctx, "", "", shop.Slug, "", 1)
		if problem != nil || len(products.Items) != 1 || products.Items[0].Available != "1.000" {
			test.Fatalf("online warehouse availability: %+v error %v", products.Items, problem)
		}
		internal, problem := service.Order(ctx, owner, org, order.ID)
		if problem != nil || internal.TerminalID != backTerminal || internal.BranchID != shop.BranchID {
			test.Fatalf("new order did not snapshot the online terminal: %+v error %v", internal, problem)
		}
	})
	test.Run("backroom shortage never falls back to front stock and live switch is denied", func(test *testing.T) {
		if _, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items}); !errors.Is(problem, storefront.ErrStock) {
			test.Fatalf("front stock was used as fallback: %v", problem)
		}
		changed := input
		changed.OnlineTerminalID = ""
		if _, problem := service.SaveSettings(ctx, owner, org, changed); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("live online switch: %v", problem)
		}
		rejectSourceWrite(test, ctx, organizations, owner, org, `UPDATE storefronts SET online_terminal_id=NULL WHERE organization_id=$1`, org)
	})
	test.Run("cancelling a back-source order releases only its reservation", func(test *testing.T) {
		if _, problem := service.Transition(ctx, owner, org, order.ID, storefront.TransitionInput{Revision: order.Revision, Status: "CANCELLED", Message: "Synthetic cancellation"}); problem != nil {
			test.Fatal(problem)
		}
		assertSourceStock(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, variant, "7.000", "0.000", "7.000")
		assertSourceStock(test, ctx, organizations, owner, org, shop.BranchID, backLocation, variant, "3.000", "0.000", "0.000")
	})
	order, err = service.CreateOrder(ctx, shop.Slug, "d8888888-8888-4888-8888-888888888888", request)
	if err != nil {
		test.Fatal(err)
	}
	settleBackSource(test, ctx, organizations, owner, org, service, shop, backTerminal, backLocation, variant, order)
	test.Run("completed source remains frozen after returning to shared stock", func(test *testing.T) {
		input.OnlineTerminalID = ""
		shared, problem := service.SaveSettings(ctx, owner, org, input)
		if problem != nil || shared.LocationID != shop.LocationID || shared.OnlineTerminalID != "" {
			test.Fatalf("shared-source compatibility: %+v error %v", shared, problem)
		}
		completed, problem := service.Order(ctx, owner, org, order.ID)
		if problem != nil || completed.Status != "COMPLETED" || completed.TerminalID != backTerminal {
			test.Fatalf("completed source moved: %+v error %v", completed, problem)
		}
	})
}

func setSourceTerminalStatus(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org, terminal, status string) {
	test.Helper()
	tx, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		test.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `UPDATE pos_terminals SET status=$3 WHERE organization_id=$1 AND id=$2`, org, terminal, status); err != nil {
		test.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		test.Fatal(err)
	}
}

func seedSourceProduct(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org, branch, front, back string) string {
	test.Helper()
	tx, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		test.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var unit, product, variant, operation string
	if err = tx.QueryRow(ctx, `INSERT INTO units(organization_id,code,name,unit_type) VALUES($1,'SOURCE','Synthetic units','COUNT') RETURNING id::text`, org).Scan(&unit); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO products(organization_id,name,created_by,updated_by) VALUES($1,'Synthetic source product',$2,$2) RETURNING id::text`, org, owner).Scan(&product); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency) VALUES($1,$2,'SOURCE','Synthetic variant',$3,1,10,'THB') RETURNING id::text`, org, product, unit).Scan(&variant); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'source.fixture',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("0", 64)).Scan(&operation); err != nil {
		test.Fatal(err)
	}
	for location, quantity := range map[string]string{front: "7.000", back: "3.000"} {
		if _, err = tx.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'OPENING_BALANCE',$5,$6,'SYNTHETIC_SOURCE',$7)`, org, branch, location, variant, quantity, operation, owner); err != nil {
			test.Fatal(err)
		}
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
	return variant
}

func rejectSourceWrite(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org, statement string, arguments ...any) {
	test.Helper()
	tx, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		test.Fatal(err)
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, statement, arguments...)
	var problem *pgconn.PgError
	if !errors.As(err, &problem) || problem.Code != "23514" {
		test.Fatalf("database source guard did not reject write: %v", err)
	}
}

func assertSourceStock(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org, branch, location, variant, quantity, reserved, available string) {
	test.Helper()
	result, err := (&inventory.Service{Organization: organizations}).List(ctx, owner, org, "balances", inventory.Filter{BranchID: branch, LocationID: location, VariantID: variant, Page: 1, PageSize: 20})
	if err != nil {
		test.Fatal(err)
	}
	page, valid := result.(inventory.Page)
	if !valid || len(page.Items) != 1 {
		test.Fatalf("stock source page: %+v", result)
	}
	var stock struct {
		Quantity  string `json:"quantity"`
		Reserved  string `json:"reserved"`
		Available string `json:"available"`
	}
	if err = json.Unmarshal(page.Items[0], &stock); err != nil || stock.Quantity != quantity || stock.Reserved != reserved || stock.Available != available {
		test.Fatalf("stock source projection: %+v error %v", stock, err)
	}
}

func settleBackSource(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, service *storefront.Service, shop storefront.Settings, terminal, location, variant string, order storefront.Order) {
	test.Helper()
	test.Run("linked POS deducts only the snapshotted warehouse exactly once", func(test *testing.T) {
		var err error
		for _, status := range []string{"PREPARING", "READY"} {
			order, err = service.Transition(ctx, owner, org, order.ID, storefront.TransitionInput{Revision: order.Revision, Status: status})
			if err != nil {
				test.Fatal(err)
			}
		}
		point := &pos.Service{Organization: organizations}
		if _, err = point.OpenShift(ctx, owner, org, "d5555555-5555-4555-8555-555555555555", pos.ShiftInput{TerminalID: terminal, OpeningCash: "0.00"}); err != nil {
			test.Fatal(err)
		}
		cart, err := point.ImportOnlineOrder(ctx, owner, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision})
		if err != nil || cart.ReviewRequired || len(cart.Items) != 1 || cart.Items[0].Available != "3.000" {
			test.Fatalf("warehouse linked cart: %+v error %v", cart, err)
		}
		checkout, err := point.PrepareCheckout(ctx, owner, org, "d6666666-6666-4666-8666-666666666666", pos.CheckoutInput{CartID: cart.ID, Revision: cart.Revision, Method: "CASH", ExpectedTotal: cart.Total, Received: cart.Total, PricingRevision: cart.Pricing.Revision})
		if err != nil {
			test.Fatal(err)
		}
		checkout, err = point.ConfirmPayment(ctx, owner, org, checkout.ID, "d7777777-7777-4777-8777-777777777777", pos.ConfirmationInput{Acknowledged: true})
		if err != nil {
			test.Fatal(err)
		}
		checkout, err = point.CompleteCheckout(ctx, owner, org, checkout.ID)
		if err != nil || checkout.Status != "COMPLETED" {
			test.Fatalf("warehouse settlement: %+v error %v", checkout, err)
		}
		if _, err = point.CompleteCheckout(ctx, owner, org, checkout.ID); err != nil {
			test.Fatalf("warehouse settlement replay: %v", err)
		}
		assertSourceStock(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, variant, "7.000", "0.000", "7.000")
		assertSourceStock(test, ctx, organizations, owner, org, shop.BranchID, location, variant, "1.000", "0.000", "0.000")
	})
}
