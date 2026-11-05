package pos

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

type frozenIngredient struct {
	variant, quantity string
	recipe            bool
}

type frozenRecipeRows struct {
	pgx.Rows
	items   []frozenIngredient
	index   int
	problem error
}

func (rows *frozenRecipeRows) Next() bool { rows.index++; return rows.index <= len(rows.items) }
func (rows *frozenRecipeRows) Close()     {}
func (rows *frozenRecipeRows) Err() error { return rows.problem }
func (rows *frozenRecipeRows) Scan(destinations ...any) error {
	item := rows.items[rows.index-1]
	*destinations[0].(*string) = item.variant
	*destinations[1].(*string) = item.quantity
	*destinations[2].(*bool) = item.recipe
	return nil
}

type frozenRecipeTx struct {
	pgx.Tx
	items   map[string][]frozenIngredient
	problem error
}

func (tx frozenRecipeTx) Query(_ context.Context, _ string, arguments ...any) (pgx.Rows, error) {
	return &frozenRecipeRows{items: tx.items[arguments[3].(string)], problem: tx.problem}, nil
}

func TestOrderRecipeUsesFrozenIngredients(test *testing.T) {
	tx := frozenRecipeTx{items: map[string][]frozenIngredient{
		"menu": {{variant: "ingredient", quantity: "0.150", recipe: true}},
	}}
	recipe, exists, err := readSaleRecipe(context.Background(), tx, "org", "branch", "cart", "menu")
	if err != nil || !exists || len(recipe.Items) != 1 || recipe.Items[0].IngredientVariantID != "ingredient" || recipe.Items[0].Quantity != "0.150" {
		test.Fatalf("frozen recipe: %+v, exists=%v, err=%v", recipe, exists, err)
	}
}

type scopedRecipeTx struct {
	frozenRecipeTx
	query string
}

func (tx *scopedRecipeTx) Query(ctx context.Context, query string, arguments ...any) (pgx.Rows, error) {
	tx.query = query
	return tx.frozenRecipeTx.Query(ctx, query, arguments...)
}

func TestCartRecipeLookupDoesNotMatchOrderID(test *testing.T) {
	tx := &scopedRecipeTx{frozenRecipeTx: frozenRecipeTx{items: map[string][]frozenIngredient{
		"menu": {{variant: "ingredient", quantity: "0.150", recipe: true}},
	}}}
	if _, _, err := readSaleRecipe(context.Background(), tx, "org", "branch", "cart", "menu"); err != nil {
		test.Fatal(err)
	}
	if !strings.Contains(tx.query, "doc.cart_id=$3::uuid") || strings.Contains(tx.query, "doc.id=$3::uuid") {
		test.Fatalf("cart lookup must never match a client-chosen order ID: %s", tx.query)
	}
}

func TestOrderRecipeLookupDoesNotMatchCartID(test *testing.T) {
	tx := &scopedRecipeTx{frozenRecipeTx: frozenRecipeTx{items: map[string][]frozenIngredient{
		"menu": {{variant: "ingredient", quantity: "0.150", recipe: true}},
	}}}
	if _, _, err := readOrderRecipe(context.Background(), tx, "org", "branch", "order", "menu"); err != nil {
		test.Fatal(err)
	}
	if !strings.Contains(tx.query, "doc.id=$3::uuid") || strings.Contains(tx.query, "doc.cart_id=$3::uuid") {
		test.Fatalf("order lookup must never match a different order's cart ID: %s", tx.query)
	}
}

func TestOrderDirectStockDoesNotAdoptLaterRecipe(test *testing.T) {
	tx := frozenRecipeTx{items: map[string][]frozenIngredient{
		"menu": {{variant: "menu", quantity: "1.000"}},
	}}
	_, exists, err := readSaleRecipe(context.Background(), tx, "org", "branch", "cart", "menu")
	if err != nil || exists {
		test.Fatalf("direct snapshot must remain direct: exists=%v, err=%v", exists, err)
	}
}

func TestOrderRecipeReadFailureDoesNotFallBack(test *testing.T) {
	want := errors.New("snapshot read failed")
	tx := frozenRecipeTx{problem: want}
	_, _, err := readSaleRecipe(context.Background(), tx, "org", "branch", "cart", "menu")
	if !errors.Is(err, want) {
		test.Fatalf("snapshot failure: %v", err)
	}
}

func TestOrderMovementsAggregateSharedFrozenIngredients(test *testing.T) {
	tx := frozenRecipeTx{items: map[string][]frozenIngredient{
		"menu-a": {{variant: "shared", quantity: "0.150", recipe: true}},
		"menu-b": {{variant: "shared", quantity: "0.200", recipe: true}},
		"shared": {{variant: "shared", quantity: "1.000"}},
	}}
	items := []CartItem{{Quantity: "2.000"}, {Quantity: "3.000"}, {Quantity: "1.000"}}
	items[0].VariantID, items[1].VariantID, items[2].VariantID = "menu-a", "menu-b", "shared"
	movements, err := effectiveSaleMovements(context.Background(), tx, "org", "branch", "cart", items)
	if err != nil || len(movements) != 1 || movements[0].VariantID != "shared" || movements[0].Quantity != "1.900" {
		test.Fatalf("shared ingredient movements: %+v, err=%v", movements, err)
	}
}

func TestOrderMovementsRejectOverflowAndMixedBatch(test *testing.T) {
	tx := frozenRecipeTx{items: map[string][]frozenIngredient{
		"menu-a": {{variant: "shared", quantity: "1.000", recipe: true}},
		"menu-b": {{variant: "shared", quantity: "1.000", recipe: true}},
		"shared": {{variant: "shared", quantity: "1.000"}},
	}}
	test.Run("shared ingredient accumulation overflow", func(test *testing.T) {
		items := []CartItem{{Quantity: "999999999999999.999"}, {Quantity: "0.001"}}
		items[0].VariantID, items[1].VariantID = "menu-a", "menu-b"
		if _, err := effectiveSaleMovements(context.Background(), tx, "org", "branch", "cart", items); !errors.Is(err, ErrInput) {
			test.Fatalf("accumulation overflow: %v", err)
		}
	})
	test.Run("recipe ingredient cannot adopt a direct stock batch", func(test *testing.T) {
		batch := "batch"
		items := []CartItem{{Quantity: "1.000"}, {Quantity: "1.000", BatchID: &batch}}
		items[0].VariantID, items[1].VariantID = "menu-a", "shared"
		if _, err := effectiveSaleMovements(context.Background(), tx, "org", "branch", "cart", items); !errors.Is(err, ErrConflict) {
			test.Fatalf("mixed recipe batch: %v", err)
		}
	})
}
