package storefront_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/storefront"
)

func catalogAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings) {
	test.Helper()
	tx, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		test.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var drink, food, unit, operation string
	for _, entry := range []struct {
		name   string
		target *string
	}{{"Synthetic drinks", &drink}, {"Synthetic food", &food}} {
		if err = tx.QueryRow(ctx, `INSERT INTO categories(organization_id,name) VALUES($1,$2) RETURNING id::text`, org, entry.name).Scan(entry.target); err != nil {
			test.Fatal(err)
		}
	}
	if err = tx.QueryRow(ctx, `INSERT INTO units(organization_id,code,name,unit_type) VALUES($1,'CATALOG','Synthetic pieces','COUNT') RETURNING id::text`, org).Scan(&unit); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'catalog.fixture',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("0", 64)).Scan(&operation); err != nil {
		test.Fatal(err)
	}
	var first string
	for index := 0; index < 28; index++ {
		category := drink
		if index >= 25 {
			category = food
		}
		if index == 27 {
			category = ""
		}
		var product, variant string
		if err = tx.QueryRow(ctx, `INSERT INTO products(organization_id,name,category_id,created_by,updated_by) VALUES($1,$2,nullif($3,'')::uuid,$4,$4) RETURNING id::text`, org, fmt.Sprintf("Synthetic catalog %02d", index), category, owner).Scan(&product); err != nil {
			test.Fatal(err)
		}
		attributes := `{}`
		if index == 0 {
			attributes = `{"storefront_image_url":"/assets/synthetic-product.png"}`
		}
		if index == 1 {
			attributes = `{"storefront_image_url":"javascript:alert(1)"}`
		}
		if err = tx.QueryRow(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency,attributes) VALUES($1,$2,$3,'Default',$4,1,$5::numeric,'THB',$6::jsonb) RETURNING id::text`, org, product, fmt.Sprintf("CAT-%02d", index), unit, fmt.Sprintf("%d.00", index+1), attributes).Scan(&variant); err != nil {
			test.Fatal(err)
		}
		if index == 0 {
			first = variant
		}
		if _, err = tx.Exec(ctx, `INSERT INTO storefront_products(organization_id,variant_id,published) VALUES($1,$2,$3)`, org, variant, index != 26); err != nil {
			test.Fatal(err)
		}
	}
	if _, err = tx.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'OPENING_BALANCE',3,$5,'SYNTHETIC_FIXTURE',$6)`, org, shop.BranchID, shop.LocationID, first, operation, owner); err != nil {
		test.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `UPDATE inventory_operations SET result='{}' WHERE organization_id=$1 AND id=$2`, org, operation); err != nil {
		test.Fatal(err)
	}
	for _, branch := range []string{"", shop.BranchID} {
		amount := "88.88"
		if branch != "" {
			amount = "99.99"
		}
		items, problem := json.Marshal([]map[string]string{{"variant_id": first, "unit_price": amount}})
		if problem != nil {
			test.Fatal(problem)
		}
		if _, err = tx.Exec(ctx, `INSERT INTO price_lists(organization_id,name,branch_id,status,items,priority,created_by,approved_by,approved_at) VALUES($1,$2,nullif($3,'')::uuid,'ACTIVE',$4::jsonb,1,$5,$5,statement_timestamp())`, org, "Synthetic catalog price "+amount, branch, items, owner); err != nil {
			test.Fatal(err)
		}
	}
	if err = tx.Commit(ctx); err != nil {
		test.Fatal(err)
	}
	service := &storefront.Service{Organization: &organization.Service{Pool: organizations.Pool, SingleStoreOrganizationID: org}}
	test.Run("category facets include all pages and exclude unpublished products", func(test *testing.T) {
		result, problem := service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 1})
		if problem != nil || result.Total != 27 || len(result.Items) != 24 || len(result.Categories) != 3 {
			test.Fatalf("catalog page: %+v, %v", result, problem)
		}
		counts := map[string]int{}
		for _, category := range result.Categories {
			counts[category.ID] = category.Count
		}
		if counts[drink] != 25 || counts[food] != 1 || counts["uncategorized"] != 1 {
			test.Fatalf("global facet counts: %+v", counts)
		}
		if result.Items[0].ImageURL != "/assets/synthetic-product.png" || result.Items[1].ImageURL != "" {
			test.Fatal("public image sanitization mismatch")
		}
		second, problem := service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 2, CategoryID: drink})
		if problem != nil || second.Total != 25 || len(second.Items) != 1 || second.Items[0].CategoryID != drink {
			test.Fatalf("category pagination: %+v, %v", second, problem)
		}
	})
	test.Run("numeric ordering and price filters use the effective branch price", func(test *testing.T) {
		result, problem := service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 1, Sort: "price_desc"})
		if problem != nil || len(result.Items) == 0 || result.Items[0].VariantID != first || result.Items[0].UnitPrice != "99.99" {
			test.Fatalf("effective descending price: %+v, %v", result, problem)
		}
		result, problem = service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 1, Sort: "price_asc", MinPrice: "2", MaxPrice: "10"})
		if problem != nil || result.Total != 9 || result.Items[0].UnitPrice != "2.00" || result.Items[8].UnitPrice != "10.00" {
			test.Fatalf("numeric price range: %+v, %v", result, problem)
		}
	})
	test.Run("availability search uncategorized and foreign scope preserve boundaries", func(test *testing.T) {
		result, problem := service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 1, Availability: "available"})
		if problem != nil || result.Total != 1 || result.Items[0].VariantID != first || result.Items[0].Available != "3.000" {
			test.Fatalf("availability: %+v, %v", result, problem)
		}
		result, problem = service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 1, Availability: "unavailable"})
		if problem != nil || result.Total != 26 {
			test.Fatalf("unavailable: %+v, %v", result, problem)
		}
		result, problem = service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 1, CategoryID: "uncategorized", Search: "CAT-27"})
		if problem != nil || result.Total != 1 || result.Items[0].CategoryID != "uncategorized" {
			test.Fatalf("uncategorized search: %+v, %v", result, problem)
		}
		result, problem = service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 1, CategoryID: "ffffffff-ffff-4fff-8fff-ffffffffffff"})
		if problem != nil || result.Total != 0 || len(result.Categories) != 3 {
			test.Fatalf("foreign category must not expose data: %+v, %v", result, problem)
		}
		if _, problem = service.BrowseProducts(ctx, "second-fixture", storefront.CatalogQuery{Page: 1}); !errors.Is(problem, storefront.ErrNotFound) {
			test.Fatalf("foreign shop: %v", problem)
		}
	})
}
