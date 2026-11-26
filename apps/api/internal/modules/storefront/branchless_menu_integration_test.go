package storefront_test

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
)

func verifyBranchlessMenu(testContext *testing.T, ctx, guestCtx context.Context, organizations *organization.Service, owner, guest, org string) {
	testContext.Helper()
	service := &restaurant.Service{Organization: organizations}
	input := restaurant.SetupMenuInput{Categories: []restaurant.SetupCategoryInput{{Name: "Meals"}}, Items: []restaurant.SetupMenuItemInput{{Category: "Meals", Name: "Soup", SKU: "SOUP", Price: "45.25"}}}
	key := "96711111-1111-4111-8111-111111111111"
	var requests sync.WaitGroup
	results := make(chan error, 4)
	for attempt := 0; attempt < 4; attempt++ {
		requests.Add(1)
		go func() {
			defer requests.Done()
			request := input
			request.Categories = append([]restaurant.SetupCategoryInput(nil), input.Categories...)
			request.Items = append([]restaurant.SetupMenuItemInput(nil), input.Items...)
			state, err := service.SaveMenu(ctx, owner, org, key, request)
			if err == nil && (state.BranchID != "" || state.Menu == nil || len(state.IssuedTableQRTokens) != 0) {
				err = errors.New("menu result scope or token boundary failed")
			}
			results <- err
		}()
	}
	requests.Wait()
	close(results)
	for err := range results {
		if err != nil {
			testContext.Fatalf("branchless concurrent menu: %v", err)
		}
	}
	if _, err := service.SaveMenu(guestCtx, guest, org, key, input); !errors.Is(err, organization.ErrDenied) && !errors.Is(err, organization.ErrNotFound) {
		testContext.Fatalf("foreign menu write accepted: %v", err)
	}
	changed := input
	changed.Items = []restaurant.SetupMenuItemInput{{Category: "Meals", Name: "Soup", SKU: "SOUP", Price: "46.25"}}
	if _, err := service.SaveMenu(ctx, owner, org, key, changed); !errors.Is(err, restaurant.ErrConflict) {
		testContext.Fatalf("changed menu replay accepted: %v", err)
	}
	tx, _, err := organizations.Authorized(ctx, owner, org, "organization.read")
	if err != nil {
		testContext.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var price string
	var items, audits int
	err = tx.QueryRow(ctx, `SELECT selling_price::text,
	 (SELECT count(*) FROM product_variants WHERE organization_id=$1),
	 (SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='RESTAURANT_SETUP_MENU')
	 FROM product_variants variant JOIN restaurant_menu_items menu ON menu.organization_id=variant.organization_id AND menu.variant_id=variant.id
	 WHERE variant.organization_id=$1 AND variant.sku='SOUP'`, org).Scan(&price, &items, &audits)
	if err != nil || price != "45.25" || items != 1 || audits != 1 {
		testContext.Fatalf("menu registry/price/replay invariant: price=%s items=%d audits=%d err=%v", price, items, audits, err)
	}
	var category, variant, product, legacyCategory, legacyProduct, legacyVariant string
	if err = tx.QueryRow(ctx, "SELECT category_id::text,product.id::text,variant.id::text FROM products product JOIN product_variants variant ON variant.organization_id=product.organization_id AND variant.product_id=product.id WHERE product.organization_id=$1 AND variant.sku='SOUP'", org).Scan(&category, &product, &variant); err != nil {
		testContext.Fatal(err)
	}
	if err = tx.QueryRow(ctx, "INSERT INTO categories(organization_id,name) VALUES($1,'Retail') RETURNING id::text", org).Scan(&legacyCategory); err != nil {
		testContext.Fatal(err)
	}
	if err = tx.QueryRow(ctx, "INSERT INTO products(organization_id,name,category_id,created_by,updated_by) VALUES($1,'Legacy product',$2,$3,$3) RETURNING id::text", org, legacyCategory, owner).Scan(&legacyProduct); err != nil {
		testContext.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency)
	 SELECT $1,$2,'LEGACY','Legacy variant',unit_id,0,99.99,currency FROM product_variants WHERE organization_id=$1 AND id=$3 RETURNING id::text`, org, legacyProduct, variant).Scan(&legacyVariant); err != nil {
		testContext.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		testContext.Fatal(err)
	}
	updated := restaurant.SetupMenuInput{Categories: []restaurant.SetupCategoryInput{{ID: category, Name: "Meals"}}, Items: []restaurant.SetupMenuItemInput{{ProductID: product, VariantID: variant, CategoryID: category, Category: "Meals", Name: "Soup updated", Price: "55.35"}}}
	if _, err = service.SaveMenu(ctx, owner, org, "97711111-1111-4111-8111-111111111111", updated); err != nil {
		testContext.Fatalf("registered menu update failed: %v", err)
	}
	cases := []struct {
		name  string
		input restaurant.SetupMenuInput
		want  error
	}{
		{"legacy variant", restaurant.SetupMenuInput{Categories: input.Categories, Items: []restaurant.SetupMenuItemInput{{VariantID: legacyVariant, Category: "Meals", Name: "Changed legacy", Price: "1.00"}}}, restaurant.ErrInput},
		{"legacy SKU", restaurant.SetupMenuInput{Categories: input.Categories, Items: []restaurant.SetupMenuItemInput{{SKU: "LEGACY", Category: "Meals", Name: "Changed legacy", Price: "1.00"}}}, restaurant.ErrConflict},
		{"legacy category", restaurant.SetupMenuInput{Categories: []restaurant.SetupCategoryInput{{ID: legacyCategory, Name: "Retail changed"}}, Items: []restaurant.SetupMenuItemInput{{Category: "Retail changed", Name: "New item", Price: "1.00"}}}, restaurant.ErrInput},
		{"legacy category name collision", restaurant.SetupMenuInput{Categories: []restaurant.SetupCategoryInput{{Name: "Retail"}}, Items: []restaurant.SetupMenuItemInput{{Category: "Retail", Name: "New item", Price: "1.00"}}}, restaurant.ErrConflict},
		{"mismatched category", restaurant.SetupMenuInput{Categories: input.Categories, Items: []restaurant.SetupMenuItemInput{{VariantID: variant, CategoryID: legacyCategory, Category: "Meals", Name: "Changed menu", Price: "1.00"}}}, restaurant.ErrInput},
		{"duplicate variant rollback", restaurant.SetupMenuInput{Categories: input.Categories, Items: []restaurant.SetupMenuItemInput{{VariantID: variant, Category: "Meals", Name: "Changed menu", Price: "1.00"}, {VariantID: variant, Category: "Meals", Name: "Changed again", Price: "2.00"}}}, restaurant.ErrInput},
		{"constraint rollback", restaurant.SetupMenuInput{Categories: input.Categories, Items: []restaurant.SetupMenuItemInput{{VariantID: variant, Category: "Meals", Name: "Changed menu", Price: "1.00"}, {SKU: "ROLLBACK", Category: "Meals", Name: strings.Repeat("x", 201), Price: "2.00"}}}, restaurant.ErrConflict},
	}
	for _, testCase := range cases {
		testContext.Run(testCase.name, func(testContext *testing.T) {
			if _, err := service.SaveMenu(ctx, owner, org, "98711111-1111-4111-8111-111111111111", testCase.input); !errors.Is(err, testCase.want) {
				testContext.Fatalf("expected rejected isolated menu mutation: %v", err)
			}
		})
	}
	state, err := service.Setup(ctx, owner, org, "")
	if err != nil {
		testContext.Fatal(err)
	}
	menu := state.Menu.(map[string]any)
	menuItems := menu["items"].([]map[string]any)
	if len(menuItems) != 1 || menuItems[0]["name"] != "Soup updated" || menuItems[0]["price"] != "55.35" || len(menu["categories"].([]map[string]any)) != 1 {
		testContext.Fatal("menu projection included legacy items or failed mutations were retained")
	}
	verification, _, err := organizations.Authorized(ctx, owner, org, "organization.read")
	if err != nil {
		testContext.Fatal(err)
	}
	defer verification.Rollback(ctx)
	var commands int
	if err = verification.QueryRow(ctx, "SELECT selling_price::text,(SELECT count(*) FROM restaurant_setup_commands WHERE organization_id=$1 AND operation='menu') FROM product_variants WHERE organization_id=$1 AND id=$2", org, legacyVariant).Scan(&price, &commands); err != nil || price != "99.99" || commands != 2 {
		testContext.Fatalf("legacy price or command rollback failed: price=%s commands=%d err=%v", price, commands, err)
	}
}
