package pricing

import (
	"testing"
)

func TestPromotionKinds(t *testing.T) {
	tests := []struct {
		name            string
		rule            Rule
		quantity, total string
	}{
		{"percentage", Rule{Type: "PERCENTAGE", Policy: "STACKABLE", BasisPoints: 2500}, "2", "15.00"},
		{"fixed cap", Rule{Type: "FIXED", Policy: "EXCLUSIVE", Amount: "50.00"}, "2", "0.00"},
		{"buy one get one", Rule{Type: "BOGO", Policy: "EXCLUSIVE", Buy: 1, Get: 1}, "3", "20.00"},
		{"minimum spend", Rule{Type: "MINIMUM_SPEND", Policy: "EXCLUSIVE", Amount: "3.00", MinimumSpend: "20.00"}, "2", "17.00"},
		{"minimum not met", Rule{Type: "MINIMUM_SPEND", Policy: "EXCLUSIVE", Amount: "3.00", MinimumSpend: "20.01"}, "2", "20.00"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := test.rule.Validate(); err != nil {
				t.Fatal(err)
			}
			quote, err := Evaluate([]Line{{VariantID: "a", Quantity: test.quantity, UnitPrice: "10.00"}}, []Definition{{ID: "p", Revision: 1, Rule: &test.rule}})
			if err != nil || quote.Total != test.total {
				t.Fatalf("quote=%+v err=%v", quote, err)
			}
		})
	}
}
func TestAllocationRemainders(t *testing.T) {
	rule := Rule{Type: "FIXED", Policy: "STACKABLE", Amount: "0.02", MinimumSpend: "0.00"}
	quote, err := Evaluate([]Line{{VariantID: "c", Quantity: "1", UnitPrice: "0.01"}, {VariantID: "b", Quantity: "1", UnitPrice: "0.01"}, {VariantID: "a", Quantity: "1", UnitPrice: "0.01"}}, []Definition{{ID: "p", Rule: &rule}})
	if err != nil || quote.Discount != "0.02" || quote.Total != "0.01" || quote.Lines[0].Discount != "0.01" || quote.Lines[2].Discount != "0.00" {
		t.Fatalf("%+v %v", quote, err)
	}
	manual, err := Manual(quote, "approval", 1)
	if err != nil || manual.Total != "0.00" || manual.Discount != "0.03" || manual.Revision == quote.Revision {
		t.Fatalf("%+v %v", manual, err)
	}
	if _, err = Manual(quote, "approval", 2); err == nil {
		t.Fatal("excess manual discount")
	}
}
func TestPoliciesAndEligibility(t *testing.T) {
	percent := Rule{Type: "PERCENTAGE", Policy: "STACKABLE", BasisPoints: 1000, MinimumSpend: "0.00", Amount: "0.00"}
	fixed := Rule{Type: "FIXED", Policy: "STACKABLE", Amount: "10.00", MinimumSpend: "0.00"}
	best := Rule{Type: "FIXED", Policy: "BEST_DISCOUNT_ONLY", Amount: "15.00", MinimumSpend: "0.00"}
	lines := []Line{{VariantID: "a", CategoryID: "category", Quantity: "1", UnitPrice: "100.00"}}
	quote, err := Evaluate(lines, []Definition{{ID: "percent", Priority: 2, Rule: &percent}, {ID: "fixed", Rule: &fixed}, {ID: "best", Rule: &best}})
	if err != nil || quote.Total != "80.00" || len(quote.Promotions) != 2 {
		t.Fatalf("%+v %v", quote, err)
	}
	best.Amount = "25.00"
	quote, err = Evaluate(lines, []Definition{{ID: "percent", Rule: &percent}, {ID: "best", Rule: &best}})
	if err != nil || quote.Total != "75.00" || len(quote.Promotions) != 1 {
		t.Fatalf("%+v %v", quote, err)
	}
	best.CategoryIDs = []string{"other"}
	quote, err = Evaluate(lines, []Definition{{ID: "best", Rule: &best}})
	if err != nil || quote.Discount != "0.00" {
		t.Fatal(quote, err)
	}
}
func TestExactLargeMoneyAndOverflow(t *testing.T) {
	quote, err := Evaluate([]Line{{VariantID: "a", Quantity: "1", UnitPrice: "9999999999999999.99"}}, nil)
	if err != nil || quote.Total != "9999999999999999.99" {
		t.Fatal(quote, err)
	}
	if _, err = Evaluate([]Line{{VariantID: "a", Quantity: "2", UnitPrice: "9999999999999999.99"}}, nil); err == nil {
		t.Fatal("overflow accepted")
	}
	for _, value := range []string{"1e2", "-1", "NaN", "0.001", "+1"} {
		if _, err = Decimal(value, 2); err == nil {
			t.Fatal(value)
		}
	}
}
func TestBOGOCheapestWholeItems(t *testing.T) {
	rule := Rule{Type: "BOGO", Policy: "EXCLUSIVE", Buy: 1, Get: 1, Amount: "0.00", MinimumSpend: "0.00"}
	quote, err := Evaluate([]Line{{VariantID: "a", Quantity: "1", UnitPrice: "10.00"}, {VariantID: "b", Quantity: "1", UnitPrice: "4.00"}, {VariantID: "c", Quantity: "0.500", UnitPrice: "1.00"}}, []Definition{{ID: "p", Rule: &rule}})
	if err != nil || quote.Total != "10.50" || quote.Lines[1].Discount != "4.00" {
		t.Fatal(quote, err)
	}
}
func TestRuleValidation(t *testing.T) {
	for _, rule := range []Rule{{Type: "eval", Policy: "STACKABLE"}, {Type: "PERCENTAGE", Policy: "STACKABLE", BasisPoints: 10001}, {Type: "FIXED", Policy: "UNKNOWN", Amount: "1"}, {Type: "BOGO", Policy: "EXCLUSIVE", Buy: 0, Get: 1}, {Type: "MINIMUM_SPEND", Policy: "EXCLUSIVE", Amount: "1", MinimumSpend: "0"}} {
		if err := rule.Validate(); err == nil {
			t.Fatal(rule)
		}
	}
}
func TestQuoteRevisionMaterialChanges(t *testing.T) {
	lines := []Line{{VariantID: "a", Quantity: "1", UnitPrice: "10.00", PriceListID: "list", PriceRevision: 1}}
	first, _ := Evaluate(lines, nil)
	lines[0].PriceRevision++
	second, _ := Evaluate(lines, nil)
	if first.Revision == second.Revision {
		t.Fatal("definition revision not bound")
	}
	lines[0].Quantity = "2"
	third, _ := Evaluate(lines, nil)
	if second.Revision == third.Revision {
		t.Fatal("quantity not bound")
	}
}
