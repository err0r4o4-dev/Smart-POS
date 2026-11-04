package restaurant

import (
	"context"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/pricing"
)

func ingredientQuantityValid(kind, value string) bool {
	amount, err := pricing.Decimal(value, 3)
	return err == nil && amount > 0 && ((kind == "WEIGHT" || kind == "VOLUME") || (kind == "COUNT" || kind == "PACKAGING") && amount%1000 == 0)
}

func validateRecipeVariants(ctx context.Context, tx pgx.Tx, org, id string, input RecipeInput) error {
	var menuUnit string
	err := tx.QueryRow(ctx, `SELECT unit.unit_type FROM product_variants variant JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id JOIN units unit ON unit.organization_id=variant.organization_id AND unit.id=variant.unit_id WHERE variant.organization_id=$1 AND variant.id=$2 AND variant.status='ACTIVE' AND product.status='ACTIVE' AND unit.status='ACTIVE'`, org, input.MenuVariantID).Scan(&menuUnit)
	if err != nil {
		return dbError(err)
	}
	if menuUnit != "COUNT" && menuUnit != "PACKAGING" {
		return ErrInput
	}
	var nested bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM restaurant_recipe_items item JOIN restaurant_recipes recipe ON recipe.organization_id=item.organization_id AND recipe.id=item.recipe_id WHERE item.organization_id=$1 AND recipe.branch_id=$2 AND item.ingredient_variant_id=$3 AND recipe.id<>nullif($4,'')::uuid)`, org, input.BranchID, input.MenuVariantID, id).Scan(&nested)
	if err != nil {
		return dbError(err)
	}
	if nested {
		return ErrConflict
	}
	for _, item := range input.Items {
		var kind string
		err = tx.QueryRow(ctx, `SELECT unit.unit_type FROM product_variants variant JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id JOIN units unit ON unit.organization_id=variant.organization_id AND unit.id=variant.unit_id WHERE variant.organization_id=$1 AND variant.id=$2 AND variant.status='ACTIVE' AND product.status='ACTIVE' AND unit.status='ACTIVE'`, org, item.IngredientVariantID).Scan(&kind)
		if err != nil {
			return dbError(err)
		}
		if !ingredientQuantityValid(kind, item.Quantity) {
			return ErrInput
		}
		err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM restaurant_recipes WHERE organization_id=$1 AND branch_id=$2 AND menu_variant_id=$3)`, org, input.BranchID, item.IngredientVariantID).Scan(&nested)
		if err != nil {
			return dbError(err)
		}
		if nested {
			return ErrConflict
		}
	}
	return nil
}
