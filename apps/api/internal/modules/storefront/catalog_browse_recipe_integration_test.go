package storefront_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/storefront"
)

func catalogBrowseAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, foreignOrg, unauthorizedUser string) {
	test.Helper()
	service := &storefront.Service{Organization: organizations}
	test.Run("recipe menu is available from ingredient stock before filtering", func(test *testing.T) {
		write, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer write.Rollback(ctx)
		var ingredientUnit, unit, food, product, ingredient, menu, recipe, stockOperation string
		if problem = write.QueryRow(ctx, `INSERT INTO categories(organization_id,name) VALUES($1,'Recipe browse category') RETURNING id::text`, org).Scan(&food); problem != nil {
			test.Fatal(problem)
		}
		if problem = write.QueryRow(ctx, `INSERT INTO units(organization_id,code,name,unit_type) VALUES($1,'BROWSEDISH','Browse dishes','COUNT') RETURNING id::text`, org).Scan(&unit); problem != nil {
			test.Fatal(problem)
		}
		if problem = write.QueryRow(ctx, `INSERT INTO units(organization_id,code,name,unit_type) VALUES($1,'BROWSEKG','Browse kilograms','WEIGHT') RETURNING id::text`, org).Scan(&ingredientUnit); problem != nil {
			test.Fatal(problem)
		}
		if problem = write.QueryRow(ctx, `INSERT INTO products(organization_id,name,category_id,created_by,updated_by) VALUES($1,'Recipe browse fixture',$2,$3,$3) RETURNING id::text`, org, food, owner).Scan(&product); problem != nil {
			test.Fatal(problem)
		}
		for _, entry := range []struct {
			sku, unit string
			id        *string
		}{{"BROWSE-INGREDIENT", ingredientUnit, &ingredient}, {"BROWSE-MENU", unit, &menu}} {
			if problem = write.QueryRow(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency) VALUES($1,$2,$3,$3,$4,1,10,'THB') RETURNING id::text`, org, product, entry.sku, entry.unit).Scan(entry.id); problem != nil {
				test.Fatal(problem)
			}
		}
		if _, problem = write.Exec(ctx, `INSERT INTO storefront_products(organization_id,variant_id,published) VALUES($1,$2,true)`, org, menu); problem != nil {
			test.Fatal(problem)
		}
		if problem = write.QueryRow(ctx, `INSERT INTO restaurant_recipes(organization_id,branch_id,menu_variant_id,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING id::text`, org, shop.BranchID, menu, owner).Scan(&recipe); problem != nil {
			test.Fatal(problem)
		}
		if _, problem = write.Exec(ctx, `INSERT INTO restaurant_recipe_items(organization_id,recipe_id,ingredient_variant_id,quantity,unit_id) VALUES($1,$2,$3,0.600,$4)`, org, recipe, ingredient, ingredientUnit); problem != nil {
			test.Fatal(problem)
		}
		if problem = write.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'catalog.recipe.fixture',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("0", 64)).Scan(&stockOperation); problem != nil {
			test.Fatal(problem)
		}
		if _, problem = write.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'OPENING_BALANCE',1.000,$5,'SYNTHETIC_RECIPE',$6)`, org, shop.BranchID, shop.LocationID, ingredient, stockOperation, owner); problem != nil {
			test.Fatal(problem)
		}
		if _, problem = write.Exec(ctx, `UPDATE inventory_operations SET result='{}' WHERE organization_id=$1 AND id=$2`, org, stockOperation); problem != nil {
			test.Fatal(problem)
		}
		if problem = write.Commit(ctx); problem != nil {
			test.Fatal(problem)
		}
		result, problem := service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 1, Search: "BROWSE-MENU", Availability: "available"})
		if problem != nil || result.Total != 1 || len(result.Items) != 1 || result.Items[0].VariantID != menu || result.Items[0].Available != "1.666" || !result.Items[0].Saleable || len(result.Categories) != 1 || result.Categories[0].ID != food || result.Categories[0].Count != 1 {
			test.Fatalf("recipe availability and facet: %+v, %v", result, problem)
		}
		test.Run("pagination facets and shared ingredient holds", func(test *testing.T) {
			write, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
			if problem != nil {
				test.Fatal(problem)
			}
			defer write.Rollback(ctx)
			for index := 0; index < 25; index++ {
				var variant, recipeID string
				if problem = write.QueryRow(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency) VALUES($1,$2,$3,$3,$4,1,10,'THB') RETURNING id::text`, org, product, fmt.Sprintf("BROWSE-MENU-%02d", index), unit).Scan(&variant); problem != nil {
					test.Fatal(problem)
				}
				if _, problem = write.Exec(ctx, `INSERT INTO storefront_products(organization_id,variant_id,published) VALUES($1,$2,true)`, org, variant); problem != nil {
					test.Fatal(problem)
				}
				if problem = write.QueryRow(ctx, `INSERT INTO restaurant_recipes(organization_id,branch_id,menu_variant_id,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING id::text`, org, shop.BranchID, variant, owner).Scan(&recipeID); problem != nil {
					test.Fatal(problem)
				}
				if _, problem = write.Exec(ctx, `INSERT INTO restaurant_recipe_items(organization_id,recipe_id,ingredient_variant_id,quantity,unit_id) VALUES($1,$2,$3,0.600,$4)`, org, recipeID, ingredient, ingredientUnit); problem != nil {
					test.Fatal(problem)
				}
			}
			if problem = write.Commit(ctx); problem != nil {
				test.Fatal(problem)
			}
			page, problem := service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 2, Search: "BROWSE-MENU", Availability: "available"})
			if problem != nil || page.Total != 26 || len(page.Items) != 2 || len(page.Categories) != 1 || page.Categories[0].Count != 26 {
				test.Fatalf("recipe pagination and facet: %+v, %v", page, problem)
			}
			items := []storefront.ItemInput{{VariantID: menu, Quantity: "1.000"}}
			quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
			if problem != nil {
				test.Fatal(problem)
			}
			_, problem = service.CreateOrder(ctx, shop.Slug, "fa111111-1111-4111-8111-111111111111", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("a", 64)})
			if problem != nil {
				test.Fatal(problem)
			}
			page, problem = service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 2, Search: "BROWSE-MENU", Availability: "unavailable"})
			if problem != nil || page.Total != 26 || len(page.Items) != 2 || len(page.Categories) != 1 || page.Categories[0].Count != 26 {
				test.Fatalf("held ingredient filtering: %+v, %v", page, problem)
			}
			for _, item := range page.Items {
				if item.Available != "0.666" || item.Saleable {
					test.Fatalf("held shared ingredient: %+v", item)
				}
			}
		})
		test.Run("empty recipe and inactive recipe preserve safe direct stock", func(test *testing.T) {
			otherBranch, problem := organizations.SaveBranch(ctx, owner, org, "", organization.BranchInput{Name: "Recipe other branch", Code: "RECIPE_OTHER", Status: "ACTIVE"})
			if problem != nil {
				test.Fatal(problem)
			}
			write, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
			if problem != nil {
				test.Fatal(problem)
			}
			defer write.Rollback(ctx)
			var direct, empty, inactiveRecipe, op string
			for _, entry := range []struct {
				sku string
				id  *string
			}{{"BROWSE-DIRECT", &direct}, {"BROWSE-EMPTY", &empty}} {
				if problem = write.QueryRow(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency) VALUES($1,$2,$3,$3,$4,1,10,'THB') RETURNING id::text`, org, product, entry.sku, unit).Scan(entry.id); problem != nil {
					test.Fatal(problem)
				}
				if _, problem = write.Exec(ctx, `INSERT INTO storefront_products(organization_id,variant_id,published) VALUES($1,$2,true)`, org, *entry.id); problem != nil {
					test.Fatal(problem)
				}
			}
			if problem = write.QueryRow(ctx, `INSERT INTO restaurant_recipes(organization_id,branch_id,menu_variant_id,status,created_by,updated_by) VALUES($1,$2,$3,'INACTIVE',$4,$4) RETURNING id::text`, org, shop.BranchID, direct, owner).Scan(&inactiveRecipe); problem != nil {
				test.Fatal(problem)
			}
			if _, problem = write.Exec(ctx, `INSERT INTO restaurant_recipes(organization_id,branch_id,menu_variant_id,created_by,updated_by) VALUES($1,$2,$3,$4,$4)`, org, otherBranch.ID, direct, owner); problem != nil {
				test.Fatal(problem)
			}
			if _, problem = write.Exec(ctx, `INSERT INTO restaurant_recipes(organization_id,branch_id,menu_variant_id,created_by,updated_by) VALUES($1,$2,$3,$4,$4)`, org, shop.BranchID, empty, owner); problem != nil {
				test.Fatal(problem)
			}
			if problem = write.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'catalog.direct.fixture',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("0", 64)).Scan(&op); problem != nil {
				test.Fatal(problem)
			}
			if _, problem = write.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'OPENING_BALANCE',2,$5,'SYNTHETIC_DIRECT',$6)`, org, shop.BranchID, shop.LocationID, direct, op, owner); problem != nil {
				test.Fatal(problem)
			}
			if _, problem = write.Exec(ctx, `UPDATE inventory_operations SET result='{}' WHERE organization_id=$1 AND id=$2`, org, op); problem != nil {
				test.Fatal(problem)
			}
			if problem = write.Commit(ctx); problem != nil {
				test.Fatal(problem)
			}
			page, problem := service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 1, Search: "BROWSE-DIRECT", Availability: "available"})
			if problem != nil || page.Total != 1 || len(page.Items) != 1 || page.Items[0].Available != "2.000" || !page.Items[0].Saleable {
				test.Fatalf("inactive recipe direct stock: %+v, %v", page, problem)
			}
			page, problem = service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 1, Search: "BROWSE-EMPTY", Availability: "unavailable"})
			if problem != nil || page.Total != 1 || len(page.Items) != 1 || page.Items[0].Available != "0.000" || page.Items[0].Saleable {
				test.Fatalf("empty recipe: %+v, %v", page, problem)
			}
		})
		test.Run("inactive ingredient and recalled ingredient are unavailable", func(test *testing.T) {
			for _, query := range []string{`UPDATE product_variants SET status='INACTIVE' WHERE organization_id=$1 AND id=$2`, `UPDATE product_variants SET status='ACTIVE' WHERE organization_id=$1 AND id=$2`} {
				write, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
				if problem != nil {
					test.Fatal(problem)
				}
				if _, problem = write.Exec(ctx, query, org, ingredient); problem != nil {
					write.Rollback(ctx)
					test.Fatal(problem)
				}
				if problem = write.Commit(ctx); problem != nil {
					test.Fatal(problem)
				}
				if strings.Contains(query, "'INACTIVE'") {
					page, err := service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 1, Search: "BROWSE-MENU", Availability: "unavailable"})
					if err != nil || page.Total != 26 || len(page.Items) != 24 || page.Items[0].Available != "0.000" || page.Items[0].Saleable {
						test.Fatalf("inactive ingredient: %+v, %v", page, err)
					}
				}
			}
			write, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
			if problem != nil {
				test.Fatal(problem)
			}
			defer write.Rollback(ctx)
			if _, problem = write.Exec(ctx, `INSERT INTO quality_recalls(organization_id,variant_id,reason,created_by) VALUES($1,$2,'Synthetic recall',$3)`, org, ingredient, owner); problem != nil {
				test.Fatal(problem)
			}
			if problem = write.Commit(ctx); problem != nil {
				test.Fatal(problem)
			}
			page, problem := service.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 1, Search: "BROWSE-MENU", Availability: "unavailable"})
			if problem != nil || page.Total != 26 || len(page.Items) != 24 || page.Items[0].Available != "0.000" || page.Items[0].Saleable {
				test.Fatalf("recalled ingredient: %+v, %v", page, problem)
			}
		})
		test.Run("foreign storefront remains isolated", func(test *testing.T) {
			scoped := &storefront.Service{Organization: &organization.Service{Pool: organizations.Pool, SingleStoreOrganizationID: foreignOrg}}
			if _, problem := scoped.BrowseProducts(ctx, shop.Slug, storefront.CatalogQuery{Page: 1}); !errors.Is(problem, storefront.ErrNotFound) {
				test.Fatalf("foreign storefront: %v", problem)
			}
		})
	})
}
