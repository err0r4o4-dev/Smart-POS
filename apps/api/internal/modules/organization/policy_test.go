package organization

import (
	"encoding/json"
	"testing"
)

func TestInventoryPolicy(t *testing.T) {
	for _, role := range Roles {
		for _, permission := range InventoryPermissions {
			if got, want := hasPermission(role, permission), role == "OWNER"; got != want {
				t.Errorf("%s %s: got %t, want %t", role, permission, got, want)
			}
		}
	}
}

func TestCreateDefaultsAndStrictUpdates(testContext *testing.T) {
	input := CreateInput{OrganizationInput: OrganizationInput{Name: "Cafe", BusinessType: "RESTAURANT"}}
	if err := input.validateCreate(); err != nil {
		testContext.Fatalf("minimal creation rejected: %v", err)
	}
	if input.Code != "" || input.Branch.Name != "สาขาหลัก" || input.Branch.Code != "MAIN" || input.Branch.Status != "ACTIVE" {
		testContext.Fatalf("unexpected creation defaults: %+v", input)
	}
	first, _ := json.Marshal(input)
	again := CreateInput{OrganizationInput: OrganizationInput{Name: "Cafe", BusinessType: "RESTAURANT"}}
	if err := again.validateCreate(); err != nil {
		testContext.Fatal(err)
	}
	second, _ := json.Marshal(again)
	if string(first) != string(second) {
		testContext.Fatal("creation fingerprint input changed across retries")
	}
	if input.OrganizationInput.validate() == nil {
		testContext.Fatal("normal update accepted missing code")
	}
	branch := BranchInput{}
	if branch.validate() == nil {
		testContext.Fatal("normal branch update accepted missing fields")
	}
	legacy := CreateInput{OrganizationInput: OrganizationInput{Name: "Cafe", Code: "custom", BusinessType: "RESTAURANT"}, Branch: BranchInput{Name: "Original", Code: "old"}}
	if err := legacy.validateCreate(); err != nil || legacy.Code != "CUSTOM" || legacy.Branch.Name != "Original" || legacy.Branch.Code != "OLD" {
		testContext.Fatalf("legacy input changed: %+v, %v", legacy, err)
	}
}

func TestRolePolicy(t *testing.T) {
	for _, role := range append(append([]string{}, Roles...), "ADMIN") {
		if got, want := hasPermission(role, "organization.read"), role == "OWNER"; got != want {
			t.Errorf("%s organization.read: got %t, want %t", role, got, want)
		}
	}
}

func TestRestaurantCreationHasNoImplicitBranch(t *testing.T) {
	input := CreateInput{OrganizationInput: OrganizationInput{Name: " Cafe ", BusinessType: "RESTAURANT"}}
	if err := input.validateRestaurantCreate(); err != nil {
		t.Fatal(err)
	}
	if input.Name != "Cafe" || input.Code != "" || input.Branch != (BranchInput{}) {
		t.Fatalf("unexpected restaurant defaults: %+v", input)
	}
	first, _ := json.Marshal(input)
	if err := input.validateRestaurantCreate(); err != nil {
		t.Fatal(err)
	}
	second, _ := json.Marshal(input)
	if string(first) != string(second) {
		t.Fatal("restaurant fingerprint changes across validation")
	}
	for _, invalid := range []CreateInput{
		{OrganizationInput: OrganizationInput{Name: "Shop", BusinessType: "RETAIL"}},
		{OrganizationInput: OrganizationInput{Name: "", BusinessType: "RESTAURANT"}},
		{OrganizationInput: input.OrganizationInput, Branch: BranchInput{Name: "Hidden branch"}},
	} {
		if err := invalid.validateRestaurantCreate(); err != ErrInput {
			t.Fatalf("invalid restaurant accepted: %+v, %v", invalid, err)
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
