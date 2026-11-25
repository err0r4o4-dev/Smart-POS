package storefront

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/restaurant"
)

func TestNativeMenuConfirmationRevalidatesCurrentQuote(t *testing.T) {
	const org = "11111111-1111-4111-8111-111111111111"
	const variant = "22222222-2222-4222-8222-222222222222"
	group, groupLabel, min, max := "protein", "Protein", 1, 1
	option, label, extra, available := "tofu", "Tofu", "12.35", true
	input := []nativeMenuLineInput{{VariantID: variant, Quantity: "2", Choices: []restaurant.MenuModifierChoice{
		{GroupID: group, OptionIDs: []string{option}},
	}}}
	txFor := func(base, category, unit string, revision int64, saleable bool) *nativeMenuQuoteTx {
		return &nativeMenuQuoteTx{
			sourceTx: &sourceTx{test: t, rows: []sourceRow{
				{values: []any{variant, "Dish", "Regular", "DISH", unit, "COUNT", base, category, saleable}},
				{values: []any{revision}},
			}},
			org: org, variant: variant,
			options: []sourceRow{{values: []any{&group, &groupLabel, &min, &max, &option, &label, &extra, &available}}},
		}
	}
	ctx := context.Background()
	original, err := quoteNativeMenu(ctx, txFor("50.00", "Meals", "Plate", 8, true), org, input)
	if err != nil || original.ConfirmationID == "" {
		t.Fatalf("initial quote: %+v, %v", original, err)
	}
	for _, tc := range []struct {
		name, price, category, unit string
		saleable                    bool
		want                        error
	}{
		{"unrelated revision", "50.00", "Meals", "Plate", true, nil},
		{"new price", "51.00", "Meals", "Plate", true, ErrQuote},
		{"new category", "50.00", "Specials", "Plate", true, ErrQuote},
		{"new unit label", "50.00", "Meals", "Bowl", true, ErrQuote},
		{"recalled or unavailable", "50.00", "Meals", "Plate", false, ErrQuote},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := revalidateNativeMenuConfirmation(ctx, txFor(tc.price, tc.category, tc.unit, 9, tc.saleable), org, input, original.ConfirmationID)
			if !errors.Is(err, tc.want) {
				t.Fatalf("confirmation: %+v, %v; want %v", got, err, tc.want)
			}
			if tc.want != nil && (got.ConfirmationID != "" || len(got.Items) != 0) {
				t.Fatalf("failed confirmation returned a payable projection: %+v", got)
			}
			if tc.want == nil && (got.Revision != 9 || got.Subtotal != "124.70" || got.ConfirmationID != original.ConfirmationID) {
				t.Fatalf("unchanged selection should keep confirmation at the current revision: %+v", got)
			}
		})
	}
	extra = "12.36"
	if got, err := revalidateNativeMenuConfirmation(ctx, txFor("50.00", "Meals", "Plate", 9, true), org, input, original.ConfirmationID); !errors.Is(err, ErrQuote) || len(got.Items) != 0 {
		t.Fatalf("changed option price: %+v, %v", got, err)
	}
	extra = "12.35"
	available = false
	if got, err := revalidateNativeMenuConfirmation(ctx, txFor("50.00", "Meals", "Plate", 9, true), org, input, original.ConfirmationID); !errors.Is(err, ErrQuote) || len(got.Items) != 0 {
		t.Fatalf("disabled option: %+v, %v", got, err)
	}
	available = true
	input[0].Quantity = "3"
	if got, err := revalidateNativeMenuConfirmation(ctx, txFor("50.00", "Meals", "Plate", 8, true), org, input, original.ConfirmationID); !errors.Is(err, ErrQuote) || len(got.Items) != 0 {
		t.Fatalf("changed quantity at the same revision: %+v, %v", got, err)
	}
}

func TestNativeMenuQuoteKeepsDifferentSelectionsForSameItem(t *testing.T) {
	product := Product{VariantID: "item", UnitPrice: "50.00", UnitType: "COUNT", Saleable: true}
	first := restaurant.MenuModifierPricing{ExtraMinor: 1235, Options: []restaurant.PricedMenuModifier{{GroupID: "protein", OptionID: "tofu", ExtraPrice: "12.35"}}}
	second := restaurant.MenuModifierPricing{ExtraMinor: 25, Options: []restaurant.PricedMenuModifier{{GroupID: "protein", OptionID: "egg", ExtraPrice: "0.25"}}}
	a, err := priceNativeMenuLine(product, "2", first)
	if err != nil || a.LineTotal != "124.70" || a.UnitPrice != "62.35" {
		t.Fatalf("first line: %+v, %v", a, err)
	}
	b, err := priceNativeMenuLine(product, "1.000", second)
	if err != nil || b.LineTotal != "50.25" || a.VariantID != b.VariantID ||
		len(a.Options) != 1 || len(b.Options) != 1 || a.Options[0].OptionID == b.Options[0].OptionID {
		t.Fatalf("second line: %+v, %v", b, err)
	}
	if _, err = priceNativeMenuLine(product, "1.250", first); err != ErrInput {
		t.Fatalf("fractional count: %v", err)
	}
}

type nativeMenuQuoteTx struct {
	*sourceTx
	org, variant string
	options      []sourceRow
}

func (tx *nativeMenuQuoteTx) Query(_ context.Context, _ string, args ...any) (pgx.Rows, error) {
	tx.test.Helper()
	if len(args) != 2 || args[0] != tx.org || args[1] != tx.variant {
		tx.test.Fatal("modifier query was not scoped to the requested restaurant and item")
	}
	return &organizationQuoteRows{values: tx.options}, nil
}

func TestNativeMenuQuoteTotalsAndRevision(t *testing.T) {
	const org = "11111111-1111-4111-8111-111111111111"
	const variant = "22222222-2222-4222-8222-222222222222"
	group, label, minChoices, maxChoices := "protein", "Protein", 1, 1
	tofu, tofuLabel, tofuPrice := "tofu", "Tofu", "12.35"
	egg, eggLabel, eggPrice := "egg", "Egg", "0.25"
	saleable := true
	product := sourceRow{values: []any{variant, "Dish", "Regular", "DISH", "Plate", "COUNT", "50.00", "Meals", true}}
	tx := &nativeMenuQuoteTx{
		sourceTx: &sourceTx{test: t, rows: []sourceRow{product, product, {values: []any{int64(8)}}}},
		org:      org, variant: variant,
		options: []sourceRow{
			{values: []any{&group, &label, &minChoices, &maxChoices, &tofu, &tofuLabel, &tofuPrice, &saleable}},
			{values: []any{&group, &label, &minChoices, &maxChoices, &egg, &eggLabel, &eggPrice, &saleable}},
		},
	}
	quote, err := quoteNativeMenu(context.Background(), tx, org, []nativeMenuLineInput{
		{VariantID: variant, Quantity: "2", Choices: []restaurant.MenuModifierChoice{{GroupID: group, OptionIDs: []string{tofu}}}},
		{VariantID: variant, Quantity: "1", Choices: []restaurant.MenuModifierChoice{{GroupID: group, OptionIDs: []string{egg}}}},
	})
	if err != nil || quote.Revision != 8 || quote.Subtotal != "174.95" || len(quote.Items) != 2 {
		t.Fatalf("quote = %+v, %v", quote, err)
	}
	if quote.Items[0].LineTotal != "124.70" || quote.Items[1].LineTotal != "50.25" ||
		quote.Items[0].Options[0].OptionID != tofu || quote.Items[1].Options[0].OptionID != egg {
		t.Fatalf("wrong line prices or choices: %+v", quote.Items)
	}
	for i, args := range tx.arguments {
		if len(args) == 0 || args[0] != org || (i < 2 && (len(args) != 2 || args[1] != variant)) {
			t.Fatalf("read %d had the wrong scope: %v", i, args)
		}
	}
}
