package organization

import "testing"

func TestInventoryPolicy(t *testing.T) {
	for _, role := range Roles {
		for _, permission := range InventoryPermissions {
			if got, want := hasPermission(role, permission), role == "OWNER"; got != want {
				t.Errorf("%s %s: got %t, want %t", role, permission, got, want)
			}
		}
	}
}

func TestRolePolicy(t *testing.T) {
	for _, role := range append(append([]string{}, Roles...), "ADMIN") {
		if got, want := hasPermission(role, "organization.read"), role == "OWNER"; got != want {
			t.Errorf("%s organization.read: got %t, want %t", role, got, want)
		}
	}
}
func TestValidation(t *testing.T) {
	org := OrganizationInput{Name: "ร้านทดสอบ", Code: "thai_01", BusinessType: "RETAIL"}
	if org.validate() != nil || org.Code != "THAI_01" {
		t.Fatal("Thai organization rejected")
	}
	org.Name = " "
	if org.validate() == nil {
		t.Fatal("empty name allowed")
	}
	branch := BranchInput{Name: "สาขาหลัก", Code: "MAIN"}
	if branch.validate() != nil || branch.Status != "ACTIVE" {
		t.Fatal("branch defaults invalid")
	}
	branch.Email = "bad\r\nheader"
	if branch.validate() == nil {
		t.Fatal("email injection allowed")
	}
}
