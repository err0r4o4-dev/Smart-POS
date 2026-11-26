package organization

import "testing"

func TestPurchasingRoleBoundaries(t *testing.T) {
	for _, role := range policyTestRoles {
		for _, permission := range PurchasingPermissions {
			if got, want := hasPermission(role, permission), role == "OWNER"; got != want {
				t.Errorf("%s %s: got %t, want %t", role, permission, got, want)
			}
		}
	}
}
