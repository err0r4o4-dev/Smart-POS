package organization

import (
	"context"
	"errors"
	"testing"
)

const singleStoreID = "11111111-1111-4111-8111-111111111111"

func TestSingleStoreRejectsForeignScopeBeforeDatabaseAccess(t *testing.T) {
	service := &Service{SingleStoreOrganizationID: singleStoreID}
	_, _, err := service.Authorized(context.Background(), "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "organization.read")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign store access: %v", err)
	}
}

func TestSingleStoreDeniesCreationBeforeAnyDatabaseWrite(t *testing.T) {
	service := &Service{SingleStoreOrganizationID: singleStoreID}
	_, err := service.Create(context.Background(), "22222222-2222-4222-8222-222222222222", "44444444-4444-4444-8444-444444444444", CreateInput{})
	if !errors.Is(err, ErrDenied) {
		t.Fatalf("single-store creation must be denied: %v", err)
	}
}

func TestSingleStorePolicyPreservesDefaultAndUUIDCase(t *testing.T) {
	for _, item := range []struct {
		configured, requested, mode string
		allowed                     bool
	}{
		{"", singleStoreID, "multi", true},
		{singleStoreID, singleStoreID, "single", true},
		{"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", "single", true},
		{singleStoreID, "33333333-3333-4333-8333-333333333333", "single", false},
		{singleStoreID, "", "single", false},
	} {
		service := &Service{SingleStoreOrganizationID: item.configured}
		if service.StoreMode() != item.mode || service.AllowsOrganization(item.requested) != item.allowed {
			t.Fatalf("incorrect store policy for %q", item.requested)
		}
	}
}
