package organization

import "testing"

func TestRolePolicy(t *testing.T) {
	for _, role := range Roles {
		if !hasPermission(role, "organization.read") {
			t.Errorf("missing read for %s", role)
		}
	}
	if len(Permissions("ADMIN")) != 0 || hasPermission("MANAGER", "organization.update") || hasPermission("CASHIER", "employee.read") {
		t.Fatal("policy does not deny by default")
	}
}
func TestManagerScope(t *testing.T) {
	actor := Member{ID: "manager", Role: "MANAGER", Status: "ACTIVE", BranchIDs: []string{"a"}}
	target := Member{ID: "cashier", Role: "CASHIER", Status: "ACTIVE", BranchIDs: []string{"a"}}
	if !canManage(actor, target, "INVENTORY_STAFF", []string{"a"}) {
		t.Fatal("authorized subordinate denied")
	}
	for _, role := range []string{"OWNER", "MANAGER", "ADMIN"} {
		if canManage(actor, target, role, []string{"a"}) {
			t.Fatal("escalation allowed")
		}
	}
	if canManage(actor, target, "CASHIER", []string{"b"}) {
		t.Fatal("branch escalation")
	}
	target.BranchIDs = []string{"a", "b"}
	if canManage(actor, target, "CASHIER", []string{"a"}) {
		t.Fatal("partial overlap must not authorize")
	}
	actor.Status = "SUSPENDED"
	if canManage(actor, target, "CASHIER", []string{"a"}) {
		t.Fatal("suspended actor allowed")
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
