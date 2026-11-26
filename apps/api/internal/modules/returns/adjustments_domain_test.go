package returns

import "testing"

func TestExchangeDifference(t *testing.T) {
	for _, entry := range []struct{ total, credit, want string }{{"100.00", "100.00", "0.00"}, {"160.00", "125.00", "35.00"}, {"100.00", "150.00", "-50.00"}, {"0.00", "0.01", "-0.01"}, {"999999999999999.99", "999999999999999.98", "0.01"}} {
		got, err := difference(entry.total, entry.credit)
		if err != nil || got != entry.want {
			t.Fatalf("difference %s %s = %s (%v)", entry.total, entry.credit, got, err)
		}
	}
	for _, invalid := range []string{"-1", "NaN", "0.001", "1e2"} {
		if _, err := difference(invalid, "1.00"); err == nil {
			t.Fatalf("accepted %s", invalid)
		}
	}
}
func TestAdjustmentPermissionBoundary(t *testing.T) {
	if permissionFor("REVERSAL", "complete") != "sales.void.complete" || permissionFor("EXCHANGE", "approve") != "exchange.approve" || permissionFor("REVERSAL", "confirm-settlement") != "sales.void.complete" {
		t.Fatal("incorrect financial authority")
	}
}
