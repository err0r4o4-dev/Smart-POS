package storefront_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
	"smartpos/api/internal/modules/storefront"
)

func verifyBranchlessCatalog(testContext *testing.T, ctx, guestCtx context.Context, organizations *organization.Service, owner, guest, org, slug string) {
	testContext.Helper()
	service := &storefront.Service{Organization: organizations}
	page, err := service.Products(ctx, owner, org, "", "", 1)
	if err != nil || page.Total != 1 || len(page.Items) != 1 || page.Page != 1 || page.PageSize != 24 {
		testContext.Fatalf("private registry catalog failed: total=%d items=%d error=%v", page.Total, len(page.Items), err)
	}
	item := page.Items[0]
	if item.ProductName != "Soup updated" || item.UnitPrice != "55.35" || item.StockPolicy != "MENU_ONLY" || item.Available != nil || !item.Saleable || item.Published || item.IsSoldOut {
		testContext.Fatalf("private menu identity/price/availability mismatch: %+v", item)
	}
	encoded, err := json.Marshal(item)
	if err != nil {
		testContext.Fatal(err)
	}
	var payload map[string]any
	if err = json.Unmarshal(encoded, &payload); err != nil {
		testContext.Fatal(err)
	}
	available, present := payload["available"]
	if !present || available != nil || payload["published"] != false || payload["is_sold_out"] != false || payload["unit_price"] != "55.35" || payload["stock_policy"] != "MENU_ONLY" {
		testContext.Fatalf("private product JSON contract changed: %s", encoded)
	}
	other, err := organizations.CreateRestaurant(ctx, owner, "ab711111-1111-4111-8111-111111111111", organization.OrganizationInput{Name: "Private catalog other", BusinessType: "RESTAURANT"})
	if err != nil {
		testContext.Fatal(err)
	}
	setup := &restaurant.Service{Organization: organizations}
	if _, err = setup.SaveProfile(ctx, owner, other.Organization.ID, "ac711111-1111-4111-8111-111111111111", restaurant.SetupProfileInput{Name: "Private catalog other", BusinessType: "RESTAURANT"}); err != nil {
		testContext.Fatal(err)
	}
	otherItems := make([]restaurant.SetupMenuItemInput, 25)
	for index := range otherItems {
		otherItems[index] = restaurant.SetupMenuItemInput{SKU: fmt.Sprintf("FOREIGN%02d", index), Category: "Other category", Name: fmt.Sprintf("Other menu %02d", index), Price: "93.17"}
	}
	if _, err = setup.SaveMenu(ctx, owner, other.Organization.ID, "ad711111-1111-4111-8111-111111111111", restaurant.SetupMenuInput{
		Categories: []restaurant.SetupCategoryInput{{Name: "Other category"}},
		Items:      otherItems,
	}); err != nil {
		testContext.Fatal(err)
	}
	if _, err = service.SaveSettings(ctx, owner, other.Organization.ID, storefront.SettingsInput{Name: "Private catalog other"}); err != nil {
		testContext.Fatal(err)
	}
	otherPage, err := service.Products(ctx, owner, other.Organization.ID, "", "", 1)
	if err != nil || otherPage.Total != 25 || len(otherPage.Items) != 24 || otherPage.Items[0].ProductName != "Other menu 00" || otherPage.Items[23].ProductName != "Other menu 23" || otherPage.Items[0].UnitPrice != "93.17" || otherPage.Items[0].VariantID == item.VariantID {
		testContext.Fatalf("organization switch reused another catalog: %v", err)
	}
	otherPage, err = service.Products(ctx, owner, other.Organization.ID, "", "", 2)
	if err != nil || otherPage.Total != 25 || len(otherPage.Items) != 1 || otherPage.Items[0].ProductName != "Other menu 24" {
		testContext.Fatalf("catalog page boundary/order failed: %v", err)
	}
	if _, problem := service.QuoteOrganization(ctx, owner, org, storefront.QuoteInput{Items: []storefront.ItemInput{{VariantID: otherPage.Items[0].VariantID, Quantity: "1.000"}}}); !errors.Is(problem, storefront.ErrNotFound) {
		testContext.Fatalf("quote accepted a foreign registered menu: %v", problem)
	}
	if result, problem := service.Products(ctx, owner, org, "", "FOREIGN", 1); problem != nil || result.Total != 0 || len(result.Items) != 0 {
		testContext.Fatalf("foreign registry leaked into catalog: %v", problem)
	}
	for _, search := range []string{" LEGACY ", "missing-menu"} {
		result, problem := service.Products(ctx, owner, org, "", search, 1)
		if problem != nil || result.Total != 0 || len(result.Items) != 0 || result.Items == nil {
			testContext.Fatalf("unregistered or missing item exposed: search=%q error=%v", search, problem)
		}
	}
	for _, search := range []string{" Soup ", "sOuP", "SOUP"} {
		result, problem := service.Products(ctx, owner, org, "", search, 1)
		if problem != nil || result.Total != 1 || len(result.Items) != 1 || result.Items[0].VariantID != item.VariantID {
			testContext.Fatalf("registered search failed: search=%q error=%v", search, problem)
		}
	}
	if result, problem := service.Products(ctx, owner, org, "", "", 2); problem != nil || result.Total != 1 || len(result.Items) != 0 || result.Items == nil {
		testContext.Fatalf("private catalog pagination failed: %v", problem)
	}
	for _, invalid := range []struct {
		search string
		page   int
	}{{"", 0}, {"", 10001}, {strings.Repeat("x", 101), 1}} {
		if _, problem := service.Products(ctx, owner, org, "", invalid.search, invalid.page); !errors.Is(problem, storefront.ErrInput) {
			testContext.Fatalf("invalid catalog query accepted: %v", problem)
		}
	}
	if _, problem := service.Products(guestCtx, guest, org, "", "", 1); !errors.Is(problem, organization.ErrDenied) {
		testContext.Fatalf("manager read owner catalog: %v", problem)
	}
	if _, problem := service.Products(ctx, "11111111-1111-4111-8111-111111111111", org, "", "", 1); !errors.Is(problem, identity.ErrInvalidToken) {
		testContext.Fatalf("foreign user read catalog: %v", problem)
	}
	pinned := &storefront.Service{Organization: &organization.Service{Pool: organizations.Pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
	if _, problem := pinned.Products(ctx, owner, org, "", "", 1); !errors.Is(problem, storefront.ErrNotFound) {
		testContext.Fatalf("pinned catalog crossed organization: %v", problem)
	}
	if _, problem := service.Products(ctx, "", "", slug, "", 1); !errors.Is(problem, storefront.ErrNotFound) {
		testContext.Fatalf("private catalog leaked to public: %v", problem)
	}
	tx, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		testContext.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `INSERT INTO price_lists(organization_id,name,priority,status,items,created_by,approved_by,approved_at)
	 VALUES($1,'Legacy organization price',1,'ACTIVE',jsonb_build_array(jsonb_build_object('variant_id',$2::text,'unit_price','1.00')),$3,$3,now())`, org, item.VariantID, owner); err != nil {
		testContext.Fatal(err)
	}
	if _, err = tx.Exec(ctx, "UPDATE product_variants SET status='INACTIVE' WHERE organization_id=$1 AND id=$2", org, item.VariantID); err != nil {
		testContext.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		testContext.Fatal(err)
	}
	page, err = service.Products(ctx, owner, org, "", "", 1)
	if err != nil || len(page.Items) != 1 || page.Items[0].Saleable || page.Items[0].UnitPrice != "55.35" {
		testContext.Fatalf("inactive menu marked saleable: %v", err)
	}
	restore, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		testContext.Fatal(err)
	}
	defer restore.Rollback(ctx)
	if _, err = restore.Exec(ctx, "UPDATE product_variants SET status='ACTIVE' WHERE organization_id=$1 AND id=$2", org, item.VariantID); err != nil {
		testContext.Fatal(err)
	}
	if err = restore.Commit(ctx); err != nil {
		testContext.Fatal(err)
	}
	page, err = service.Products(ctx, owner, org, "", "", 1)
	if err != nil || len(page.Items) != 1 || page.Items[0].UnitPrice != "55.35" || !page.Items[0].Saleable {
		testContext.Fatalf("legacy pricing changed registered menu price: %v", err)
	}
	quoteInput := storefront.QuoteInput{Items: []storefront.ItemInput{{VariantID: item.VariantID, Quantity: "1.000"}}}
	if value, problem := service.QuoteOrganization(ctx, owner, org, quoteInput); problem != nil || value.Total != "55.35" || value.Items[0].UnitPrice != "55.35" {
		testContext.Fatalf("legacy price list changed organization quote: %+v error=%v", value, problem)
	}
	verifyBranchlessCatalogSaleability(testContext, ctx, organizations, owner, org, item.VariantID)
	if _, problem := service.QuoteOrganization(ctx, owner, org, quoteInput); !errors.Is(problem, storefront.ErrStock) {
		testContext.Fatalf("quote accepted recalled menu: %v", problem)
	}
}

func verifyBranchlessCatalogSaleability(testContext *testing.T, ctx context.Context, organizations *organization.Service, owner, org, variant string) {
	testContext.Helper()
	service := &storefront.Service{Organization: organizations}
	mutate := func(t *testing.T, statement string) {
		t.Helper()
		tx, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		if _, err = tx.Exec(ctx, statement, org, variant); err != nil {
			t.Fatal(err)
		}
		if err = tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
	}
	assertCannotQuote := func(t *testing.T) {
		t.Helper()
		quote, err := service.QuoteOrganization(ctx, owner, org, storefront.QuoteInput{
			Items: []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}},
		})
		if !errors.Is(err, storefront.ErrStock) || quote.ID != "" || quote.Total != "" || len(quote.Items) != 0 {
			t.Fatalf("unavailable item produced a quote or wrong error: %v", err)
		}
	}
	for _, candidate := range []struct{ name, update, restore string }{
		{"product", "UPDATE products SET status='INACTIVE' WHERE organization_id=$1 AND id=(SELECT product_id FROM product_variants WHERE organization_id=$1 AND id=$2)", "UPDATE products SET status='ACTIVE' WHERE organization_id=$1 AND id=(SELECT product_id FROM product_variants WHERE organization_id=$1 AND id=$2)"},
		{"category", "UPDATE categories SET status='INACTIVE' WHERE organization_id=$1 AND id=(SELECT category_id FROM products WHERE organization_id=$1 AND id=(SELECT product_id FROM product_variants WHERE organization_id=$1 AND id=$2))", "UPDATE categories SET status='ACTIVE' WHERE organization_id=$1 AND id=(SELECT category_id FROM products WHERE organization_id=$1 AND id=(SELECT product_id FROM product_variants WHERE organization_id=$1 AND id=$2))"},
		{"unit", "UPDATE units SET status='INACTIVE' WHERE organization_id=$1 AND id=(SELECT unit_id FROM product_variants WHERE organization_id=$1 AND id=$2)", "UPDATE units SET status='ACTIVE' WHERE organization_id=$1 AND id=(SELECT unit_id FROM product_variants WHERE organization_id=$1 AND id=$2)"},
		{"currency", "UPDATE product_variants SET currency='USD' WHERE organization_id=$1 AND id=$2", "UPDATE product_variants SET currency='THB' WHERE organization_id=$1 AND id=$2"},
	} {
		testContext.Run("catalog blocks inactive "+candidate.name, func(testContext *testing.T) {
			mutate(testContext, candidate.update)
			defer mutate(testContext, candidate.restore)
			page, err := service.Products(ctx, owner, org, "", "", 1)
			if err != nil || len(page.Items) != 1 || page.Items[0].Saleable {
				testContext.Fatalf("unsafe menu marked saleable: %v", err)
			}
			assertCannotQuote(testContext)
		})
	}
	mutate(testContext, `INSERT INTO quality_recalls(organization_id,variant_id,reason,created_by)
	 SELECT variant.organization_id,variant.id,'Synthetic private catalog recall',product.created_by FROM product_variants variant
	 JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id WHERE variant.organization_id=$1 AND variant.id=$2`)
	page, err := service.Products(ctx, owner, org, "", "", 1)
	if err != nil || len(page.Items) != 1 || page.Items[0].Saleable {
		testContext.Fatalf("recalled menu marked saleable: %v", err)
	}
	assertCannotQuote(testContext)
}
