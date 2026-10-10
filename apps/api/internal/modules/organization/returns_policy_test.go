package organization

import "testing"

func TestReturnsPermissions(t *testing.T) {
	for _, role := range Roles {
		for _, permission := range ReturnsPermissions {
			want := role == "OWNER" || role == "MANAGER" || role == "CASHIER" && contains(CashierReturnsPermissions, permission)
			if hasPermission(role, permission) != want {
				t.Errorf("%s %s", role, permission)
			}
		}
	}
}
