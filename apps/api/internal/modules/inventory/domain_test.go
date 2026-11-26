package inventory

import (
	"strings"
	"testing"
)

func TestQuantity(t *testing.T) {
	for input, expected := range map[string]string{"0": "0.000", "1.2": "1.200", "-3.125": "-3.125", "999999999999999.999": "999999999999999.999"} {
		amount, err := quantity(input)
		if err != nil || decimal(amount) != expected {
			t.Fatalf("%s: %v", input, err)
		}
	}
	for _, input := range []string{"1e3", "NaN", "1.0001", "+1", " 1", "1000000000000000", ""} {
		if _, err := quantity(input); err == nil {
			t.Fatalf("accepted %s", input)
		}
	}
}
func TestTransitions(t *testing.T) {
	for _, kind := range []string{"ADJUSTMENT", "COUNT", "TRANSFER"} {
		if _, err := transition(kind, "POSTED", "post"); err == nil {
			t.Fatal("duplicate posting allowed")
		}
		if _, err := transition(kind, "CANCELLED", "approve"); err == nil {
			t.Fatal("cancelled approval allowed")
		}
	}
	if state, err := transition("COUNT", "SUBMITTED", "approve"); err != nil || state != "APPROVED" {
		t.Fatal("count approval")
	}
	if _, err := transition("TRANSFER", "DISPATCHED", "cancel"); err == nil {
		t.Fatal("transit cancellation")
	}
}

func TestWarehouseStockQueries(t *testing.T) {
	if !strings.Contains(stockJSON, "location.type IN ('WAREHOUSE','SALES_FLOOR','SHELF')") {
		t.Fatalf("expected WAREHOUSE to compute sellable available quantity in stockJSON: %s", stockJSON)
	}
	if strings.Contains(stockJSON, "WHEN location.type='WAREHOUSE' THEN 'WAREHOUSE'") {
		t.Fatalf("expected active WAREHOUSE balance to be POS_ELIGIBLE rather than non-sellable WAREHOUSE: %s", stockJSON)
	}
	if strings.Contains(stockWhere, "SALES_FLOOR") || strings.Contains(stockWhere, "SHELF") || !strings.Contains(stockWhere, "place.type='WAREHOUSE'") {
		t.Fatalf("expected low-stock evaluation in stockWhere to count WAREHOUSE only: %s", stockWhere)
	}
}
