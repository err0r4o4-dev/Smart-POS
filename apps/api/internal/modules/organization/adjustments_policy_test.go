package organization

import "testing"

func TestAdjustmentPermissions(t *testing.T) {
	for _, role := range Roles {
		for _, permission := range AdjustmentPermissions {
			if got, want := hasPermission(role, permission), role == "OWNER"; got != want {
				t.Errorf("%s %s: got %t, want %t", role, permission, got, want)
			}
		}
	}
}
