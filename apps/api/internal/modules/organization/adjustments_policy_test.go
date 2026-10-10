package organization

import "testing"

func TestAdjustmentPermissions(t *testing.T) {
	for _, role := range Roles {
		for _, permission := range AdjustmentPermissions {
			want := role == "OWNER" || role == "MANAGER" || role == "CASHIER" && contains(CashierAdjustmentPermissions, permission)
			if hasPermission(role, permission) != want {
				t.Fatalf("%s %s", role, permission)
			}
		}
	}
}
