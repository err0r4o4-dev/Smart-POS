package storefront

import (
	"testing"

	"smartpos/api/internal/modules/organization"
)

func TestResolvedPublicAndTrackingScopeRejectsForeignStore(t *testing.T) {
	pinned := "11111111-1111-4111-8111-111111111111"
	foreign := "22222222-2222-4222-8222-222222222222"
	malformed := "unknown"
	for _, item := range []struct {
		configured string
		resolved   *string
		allowed    bool
	}{
		{pinned, &pinned, true},
		{pinned, &foreign, false},
		{pinned, nil, false},
		{pinned, &malformed, false},
		{"", &foreign, true},
		{"", nil, false},
	} {
		service := &Service{Organization: &organization.Service{SingleStoreOrganizationID: item.configured}}
		if service.resolvedOrganizationAllowed(item.resolved) != item.allowed {
			t.Fatalf("incorrect resolved scope for configured store %q", item.configured)
		}
	}
}
