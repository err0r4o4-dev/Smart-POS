package storefront_test

import (
	"context"
	"errors"
	"testing"

	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
)

func verifyModifierOwnerRead(t *testing.T, ownerCtx, primaryCtx, foreignCtx context.Context, orgs *organization.Service, owner, foreignUser, org string) {
	t.Helper()
	service := &restaurant.Service{Organization: orgs}
	state, err := service.Setup(ownerCtx, owner, org, "")
	if err != nil {
		t.Fatalf("modifier read fixture requires a registered menu item: %v", err)
	}
	items := state.Menu.(map[string]any)["items"].([]map[string]any)
	if len(items) == 0 {
		t.Fatal("modifier read fixture is missing a menu item")
	}
	variant := items[0]["variant_id"].(string)
	for _, tc := range []struct {
		name  string
		ctx   context.Context
		actor string
		want  error
	}{
		{"missing session", context.Background(), owner, identity.ErrInvalidToken},
		{"primary session", primaryCtx, owner, identity.ErrMFARequired},
		{"foreign account", foreignCtx, foreignUser, organization.ErrDenied},
		{"mismatched session", foreignCtx, owner, identity.ErrInvalidToken},
	} {
		t.Run(tc.name, func(t *testing.T) {
			groups, err := service.MenuModifierGroups(tc.ctx, tc.actor, org, variant)
			if !errors.Is(err, tc.want) || groups != nil {
				t.Fatalf("unexpected access result: %v", err)
			}
		})
	}
	groups, err := service.MenuModifierGroups(ownerCtx, owner, org, variant)
	if err != nil || groups == nil || len(groups) != 0 {
		t.Fatalf("registered menu item without modifiers: groups=%d error=%v", len(groups), err)
	}
	if groups, err = service.MenuModifierGroups(ownerCtx, owner, org, "11111111-1111-4111-8111-111111111111"); !errors.Is(err, restaurant.ErrNotFound) || groups != nil {
		t.Fatalf("unexpected unknown-item result: %v", err)
	}
}
