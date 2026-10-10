package organization

import "testing"

func TestPurchasingRoleBoundaries(t *testing.T) {
	for _, permission := range PurchasingPermissions {
		if hasPermission("CASHIER", permission) {
			t.Fatalf("cashier has %s", permission)
		}
		if !hasPermission("OWNER", permission) || !hasPermission("MANAGER", permission) {
			t.Fatalf("missing privileged permission %s", permission)
		}
	}
	for _, permission := range []string{"purchasing.order.approve", "purchasing.receive.review", "purchasing.return.approve"} {
		if hasPermission("INVENTORY_STAFF", permission) || hasPermission("PURCHASING_STAFF", permission) {
			t.Fatalf("staff can approve %s", permission)
		}
	}
	if !hasPermission("INVENTORY_STAFF", "purchasing.receive.post") || hasPermission("PURCHASING_STAFF", "purchasing.receive.post") {
		t.Fatal("receiving post policy")
	}
}
