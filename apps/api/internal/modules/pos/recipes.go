package pos

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"sort"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/inventory"
)

type saleRecipeItem struct {
	IngredientVariantID string
	Quantity            string
}

type saleRecipe struct {
	Items []saleRecipeItem
}

type saleMovementAccumulator struct {
	amount    *big.Int
	batchID   *string
	hasDirect bool
	hasRecipe bool
}

func readActiveSaleRecipe(ctx context.Context, tx pgx.Tx, org, branch, menuVariant string) (saleRecipe, bool, error) {
	var recipeID string
	err := tx.QueryRow(ctx, `SELECT id::text FROM restaurant_recipes WHERE organization_id=$1 AND branch_id=$2 AND menu_variant_id=$3 AND status='ACTIVE' FOR SHARE`, org, branch, menuVariant).Scan(&recipeID)
	if errors.Is(err, pgx.ErrNoRows) {
		return saleRecipe{}, false, nil
	}
	if err != nil {
		return saleRecipe{}, false, dbError(err)
	}
	rows, err := tx.Query(ctx, `SELECT ingredient_variant_id::text,quantity::text FROM restaurant_recipe_items WHERE organization_id=$1 AND recipe_id=$2 ORDER BY ingredient_variant_id`, org, recipeID)
	if err != nil {
		return saleRecipe{}, false, dbError(err)
	}
	defer rows.Close()

	recipe := saleRecipe{Items: []saleRecipeItem{}}
	for rows.Next() {
		var item saleRecipeItem
		if err := rows.Scan(&item.IngredientVariantID, &item.Quantity); err != nil {
			return saleRecipe{}, false, dbError(err)
		}
		recipe.Items = append(recipe.Items, item)
	}
	if err := rows.Err(); err != nil {
		return saleRecipe{}, false, dbError(err)
	}
	if len(recipe.Items) == 0 {
		return saleRecipe{}, false, ErrConflict
	}
	return recipe, true, nil
}

func multiplyScaledQuantities(left, right string) (string, error) {
	leftAmount, err := scaled(left, 3)
	if err != nil {
		return "", ErrInput
	}
	rightAmount, err := scaled(right, 3)
	if err != nil {
		return "", ErrInput
	}
	product := new(big.Int).Mul(big.NewInt(leftAmount), big.NewInt(rightAmount))
	product.Add(product, big.NewInt(500))
	product.Quo(product, big.NewInt(1000))
	if !product.IsInt64() || product.Sign() <= 0 || product.Int64() > maxDecimal {
		return "", ErrInput
	}
	return formatScaled(product.Int64()), nil
}

func formatScaled(amount int64) string {
	return fmt.Sprintf("%d.%03d", amount/1000, amount%1000)
}

func recipeCapacity(ctx context.Context, tx pgx.Tx, org, location, cart, quantity string, recipe saleRecipe) (string, bool, error) {
	capacity := new(big.Int).SetInt64(maxDecimal)
	for _, ingredient := range recipe.Items {
		perDish, err := scaled(ingredient.Quantity, 3)
		if err != nil || perDish <= 0 {
			return "0.000", false, ErrInput
		}
		var ingredientActive bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM product_variants variant JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id JOIN units unit ON unit.organization_id=variant.organization_id AND unit.id=variant.unit_id WHERE variant.organization_id=$1 AND variant.id=$2 AND variant.status='ACTIVE' AND product.status='ACTIVE' AND unit.status='ACTIVE')`, org, ingredient.IngredientVariantID).Scan(&ingredientActive); err != nil {
			return "0.000", false, dbError(err)
		}
		if !ingredientActive {
			return "0.000", false, nil
		}
		availableText := "0.000"
		saleable := true
		if err := inventory.QualityAvailabilityForCart(ctx, tx, org, location, ingredient.IngredientVariantID, nil, cart, &availableText, &saleable); err != nil {
			return "0.000", false, dbError(err)
		}
		if !saleable {
			return "0.000", false, nil
		}
		available, err := scaled(availableText, 3)
		if err != nil {
			return "0.000", false, ErrInput
		}
		possible := new(big.Int).Mul(big.NewInt(available), big.NewInt(1000))
		possible.Quo(possible, big.NewInt(perDish))
		if possible.Cmp(capacity) < 0 {
			capacity = possible
		}
	}
	if capacity.Sign() < 0 {
		capacity.SetInt64(0)
	}
	if !capacity.IsInt64() || capacity.Int64() > maxDecimal {
		capacity.SetInt64(maxDecimal)
	}
	requested, err := scaled(quantity, 3)
	if err != nil {
		return "0.000", false, ErrInput
	}
	return formatScaled(capacity.Int64()), capacity.Cmp(big.NewInt(requested)) >= 0, nil
}

func effectiveSaleMovements(ctx context.Context, tx pgx.Tx, org, branch string, items []CartItem) ([]inventory.Item, error) {
	accumulated := map[string]*saleMovementAccumulator{}
	for _, item := range items {
		recipe, hasRecipe, err := readActiveSaleRecipe(ctx, tx, org, branch, item.VariantID)
		if err != nil {
			return nil, err
		}
		if !hasRecipe {
			amount, err := scaled(item.Quantity, 3)
			if err != nil || amount <= 0 {
				return nil, ErrInput
			}
			entry := accumulated[item.VariantID]
			if entry == nil {
				entry = &saleMovementAccumulator{amount: new(big.Int)}
				accumulated[item.VariantID] = entry
			}
			if entry.hasRecipe && item.BatchID != nil {
				return nil, ErrConflict
			}
			if entry.batchID != nil && (item.BatchID == nil || *entry.batchID != *item.BatchID) {
				return nil, ErrConflict
			}
			if item.BatchID != nil {
				batch := *item.BatchID
				entry.batchID = &batch
			}
			entry.amount.Add(entry.amount, big.NewInt(amount))
			entry.hasDirect = true
			continue
		}
		for _, ingredient := range recipe.Items {
			amount, err := multiplyScaledQuantities(ingredient.Quantity, item.Quantity)
			if err != nil {
				return nil, err
			}
			ingredientAmount, _ := scaled(amount, 3)
			entry := accumulated[ingredient.IngredientVariantID]
			if entry == nil {
				entry = &saleMovementAccumulator{amount: new(big.Int)}
				accumulated[ingredient.IngredientVariantID] = entry
			}
			if entry.batchID != nil {
				return nil, ErrConflict
			}
			entry.amount.Add(entry.amount, big.NewInt(ingredientAmount))
			entry.hasRecipe = true
		}
	}

	variantIDs := make([]string, 0, len(accumulated))
	for variantID, entry := range accumulated {
		if entry.amount.Sign() <= 0 {
			return nil, ErrInput
		}
		variantIDs = append(variantIDs, variantID)
	}
	sort.Strings(variantIDs)
	result := make([]inventory.Item, 0, len(variantIDs))
	for _, variantID := range variantIDs {
		entry := accumulated[variantID]
		if !entry.amount.IsInt64() || entry.amount.Int64() > maxDecimal {
			return nil, ErrInput
		}
		result = append(result, inventory.Item{VariantID: variantID, Quantity: formatScaled(entry.amount.Int64()), BatchID: entry.batchID})
	}
	return result, nil
}
func RecipeAvailability(ctx context.Context, tx pgx.Tx, org, branch, location, cart, variant, quantity string) (string, bool, bool, error) {
	recipe, hasRecipe, err := readActiveSaleRecipe(ctx, tx, org, branch, variant)
	if err != nil {
		return "", false, false, err
	}
	if !hasRecipe {
		return "", false, true, nil
	}
	available, saleable, err := recipeCapacity(ctx, tx, org, location, cart, quantity, recipe)
	return available, true, saleable, err
}