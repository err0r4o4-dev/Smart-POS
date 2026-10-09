package inventory

import "testing"

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
