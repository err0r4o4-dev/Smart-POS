package organization

import "testing"

func TestStorefrontPermissionBoundaries(t *testing.T) {
	for _, role := range []string{"OWNER", "MANAGER"} {
		for _, permission := range StorefrontPermissions {
			if !hasPermission(role, permission) {
				t.Fatalf("%s missing %s", role, permission)
			}
		}
	}
	if hasPermission("CASHIER", "storefront.manage") || !hasPermission("CASHIER", "online_orders.manage") {
		t.Fatal("cashier storefront boundary invalid")
	}
	for _, role := range []string{"INVENTORY_STAFF", "PURCHASING_STAFF"} {
		if hasPermission(role, "online_orders.read") {
			t.Fatalf("unrelated role %s sees customer orders", role)
		}
	}
}
