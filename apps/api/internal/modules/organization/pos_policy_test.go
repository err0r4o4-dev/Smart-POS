package organization

import "testing"

func TestPOSPermissions(t *testing.T) {
	for _, role := range []string{"OWNER", "MANAGER"} {
		for _, permission := range POSPermissions {
			if !hasPermission(role, permission) {
				t.Fatalf("missing %s for %s", permission, role)
			}
		}
	}
	for _, permission := range CashierPOSPermissions {
		if !hasPermission("CASHIER", permission) {
			t.Fatalf("missing cashier %s", permission)
		}
	}
	for _, permission := range []string{"pos.terminal.manage", "pos.register.close.other", "pos.payment.reconcile"} {
		if hasPermission("CASHIER", permission) {
			t.Fatalf("cashier escalation %s", permission)
		}
	}
	for _, role := range []string{"INVENTORY_STAFF", "PURCHASING_STAFF"} {
		for _, permission := range POSPermissions {
			if hasPermission(role, permission) {
				t.Fatalf("POS grant %s %s", role, permission)
			}
		}
	}
}
