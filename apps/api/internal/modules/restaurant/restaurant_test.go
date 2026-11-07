package restaurant

import (
	"errors"
	"testing"
	"time"

	"smartpos/api/internal/modules/organization"
)

func TestBusinessPeriodUsesClosingTime(t *testing.T) {
	settings := Settings{ClosingTime: "22:00", Timezone: "Asia/Bangkok"}
	for _, test := range []struct{ name, now, start, end string }{
		{"before close", "2026-11-03T21:59:59+07:00", "2026-11-02T22:00:00+07:00", "2026-11-03T22:00:00+07:00"},
		{"at close", "2026-11-03T22:00:00+07:00", "2026-11-03T22:00:00+07:00", "2026-11-04T22:00:00+07:00"},
		{"midnight does not close", "2026-11-04T00:00:00+07:00", "2026-11-03T22:00:00+07:00", "2026-11-04T22:00:00+07:00"},
	} {
		t.Run(test.name, func(t *testing.T) {
			now, _ := time.Parse(time.RFC3339, test.now)
			period, err := businessPeriod(now, settings)
			if err != nil || period.Start.Format(time.RFC3339) != test.start || period.End.Format(time.RFC3339) != test.end {
				t.Fatalf("unexpected period: %+v, %v", period, err)
			}
		})
	}
}

func TestBusinessPeriodOvernightAndDST(t *testing.T) {
	for _, test := range []struct{ now, close, zone, start, end string }{
		{"2026-11-04T01:00:00+07:00", "02:00", "Asia/Bangkok", "2026-11-03T02:00:00+07:00", "2026-11-04T02:00:00+07:00"},
		{"2026-11-01T12:00:00-05:00", "22:00", "America/New_York", "2026-10-31T22:00:00-04:00", "2026-11-01T22:00:00-05:00"},
	} {
		now, _ := time.Parse(time.RFC3339, test.now)
		period, err := businessPeriod(now, Settings{ClosingTime: test.close, Timezone: test.zone})
		if err != nil || period.Start.Format(time.RFC3339) != test.start || period.End.Format(time.RFC3339) != test.end {
			t.Fatalf("unexpected period: %+v, %v", period, err)
		}
	}
}

func TestSettingsInputValidation(t *testing.T) {
	input := SettingsInput{
		BranchID:    "11111111-1111-1111-1111-111111111111",
		ClosingTime: "23:30",
		Timezone:    "Asia/Bangkok",
		Revision:    1,
	}
	if err := input.normalize(); err != nil {
		t.Fatalf("expected valid settings, got: %v", err)
	}

	invalidTime := input
	invalidTime.ClosingTime = "25:00"
	if err := invalidTime.normalize(); err == nil {
		t.Fatal("expected error for invalid closing time")
	}
}

func TestRejectInvalidRecipeQuantities(t *testing.T) {
	for _, value := range []string{"0", "-0.150", "0.0001", "NaN", "Infinity", "1e3", "1000000000000000", "abc"} {
		t.Run(value, func(t *testing.T) {
			input := RecipeInput{BranchID: "11111111-1111-1111-1111-111111111111", MenuVariantID: "22222222-2222-2222-2222-222222222222", Items: []RecipeIngredientInput{{IngredientVariantID: "33333333-3333-3333-3333-333333333333", Quantity: value}}}
			if err := input.normalize(); !errors.Is(err, ErrInput) {
				t.Fatalf("quantity %q must fail input validation: %v", value, err)
			}
		})
	}
}

func TestRejectRecipeSelfReference(t *testing.T) {
	input := RecipeInput{BranchID: "11111111-1111-1111-1111-111111111111", MenuVariantID: "22222222-2222-2222-2222-222222222222", Items: []RecipeIngredientInput{{IngredientVariantID: "22222222-2222-2222-2222-222222222222", Quantity: "1"}}}
	if !errors.Is(input.normalize(), ErrInput) {
		t.Fatal("menu cannot consume itself")
	}
}

func TestIngredientUnitPrecision(t *testing.T) {
	for _, test := range []struct {
		kind, amount string
		valid        bool
	}{
		{"COUNT", "0.500", false}, {"PACKAGING", "1.500", false},
		{"COUNT", "2.000", true}, {"WEIGHT", "0.150", true}, {"VOLUME", "0.025", true},
	} {
		if actual := ingredientQuantityValid(test.kind, test.amount); actual != test.valid {
			t.Fatalf("%s %s: got %v", test.kind, test.amount, actual)
		}
	}
}

func TestRejectUnknownTimezone(t *testing.T) {
	input := SettingsInput{BranchID: "11111111-1111-1111-1111-111111111111", ClosingTime: "22:00", Timezone: "Asia/Unknown"}
	if !errors.Is(input.normalize(), ErrInput) {
		t.Fatal("unknown timezone must not be persisted")
	}
}

func TestBranchScopeDenied(t *testing.T) {
	actor := organization.Member{Role: "MANAGER", BranchIDs: []string{"11111111-1111-1111-1111-111111111111"}}
	if !errors.Is(branchScope(actor, "22222222-2222-2222-2222-222222222222"), organization.ErrDenied) {
		t.Fatal("manager must not access another branch")
	}
	if err := branchScope(actor, actor.BranchIDs[0]); err != nil {
		t.Fatal(err)
	}
}

func TestRecipeInputValidation(t *testing.T) {
	input := RecipeInput{
		BranchID:      "11111111-1111-1111-1111-111111111111",
		MenuVariantID: "22222222-2222-2222-2222-222222222222",
		Status:        "ACTIVE",
		Revision:      0,
		Items: []RecipeIngredientInput{
			{
				IngredientVariantID: "33333333-3333-3333-3333-333333333333",
				Quantity:            "0.150",
			},
		},
	}
	if err := input.normalize(); err != nil {
		t.Fatalf("expected valid recipe, got: %v", err)
	}

	duplicateItems := input
	duplicateItems.Items = append(duplicateItems.Items, RecipeIngredientInput{
		IngredientVariantID: "33333333-3333-3333-3333-333333333333",
		Quantity:            "0.050",
	})
	if err := duplicateItems.normalize(); err == nil {
		t.Fatal("expected error for duplicate ingredient variant")
	}
}

func TestTableInputValidation(t *testing.T) {
	input := TableInput{
		BranchID: "11111111-1111-1111-1111-111111111111",
		Code:     "T-01",
		Name:     "Table 1 Window",
		Seats:    4,
		Status:   "ACTIVE",
		Revision: 0,
	}
	if err := input.normalize(); err != nil {
		t.Fatalf("expected valid table, got: %v", err)
	}

	invalidSeats := input
	invalidSeats.Seats = 0
	if err := invalidSeats.normalize(); err == nil {
		t.Fatal("expected error for zero seats")
	}
}
