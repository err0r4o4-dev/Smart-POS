package inventory

import (
	"errors"
	"testing"
)

func TestQuickStockValidation(t *testing.T) {
	version := int64(0)
	valid := QuickStockInput{BranchID: "11111111-1111-1111-1111-111111111111", LocationID: "22222222-2222-2222-2222-222222222222", VariantID: "33333333-3333-3333-3333-333333333333", Action: "INCREASE", Quantity: "5.000", Reason: "RESTOCK"}
	for _, action := range []string{"INCREASE", "DECREASE", "CORRECTION"} {
		input := valid
		input.Action = action
		input.BalanceVersion = &version
		if err := input.normalize(); err != nil {
			t.Fatalf("%s: %v", action, err)
		}
	}
	for _, value := range []string{"-1", "0", "0.0001", "NaN", "1e3", "1000000000000000"} {
		input := valid
		input.Quantity = value
		if !errors.Is(input.normalize(), ErrInput) {
			t.Fatalf("accepted invalid amount %q", value)
		}
	}
	input := valid
	input.Action = "CORRECTION"
	if !errors.Is(input.normalize(), ErrInput) {
		t.Fatal("absolute count requires balance version")
	}
	input.BalanceVersion = &version
	input.Quantity = "0"
	if err := input.normalize(); err != nil {
		t.Fatalf("count may be zero: %v", err)
	}
	input = valid
	input.Reason = ""
	if !errors.Is(input.normalize(), ErrInput) {
		t.Fatal("reason is mandatory")
	}
}
