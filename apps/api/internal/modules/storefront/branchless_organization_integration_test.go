package storefront_test

import (
	"context"
	"errors"
	"testing"

	"smartpos/api/internal/modules/organization"
)

func verifyBranchlessOrganization(t *testing.T, ctx, guestCtx context.Context, service *organization.Service, ownerID, guestID string) organization.Context {
	t.Helper()
	input := organization.OrganizationInput{Name: "Branchless restaurant", BusinessType: "RESTAURANT"}
	key := "81711111-1111-4111-8111-111111111111"
	type outcome struct {
		state organization.Context
		err   error
	}
	results := make(chan outcome, 4)
	for attempt := 0; attempt < cap(results); attempt++ {
		go func() {
			state, err := service.CreateRestaurant(ctx, ownerID, key, input)
			results <- outcome{state, err}
		}()
	}
	var created organization.Context
	for attempt := 0; attempt < cap(results); attempt++ {
		result := <-results
		if result.err != nil {
			t.Fatal(result.err)
		}
		if attempt > 0 && result.state.Organization.ID != created.Organization.ID {
			t.Fatal("concurrent creation produced multiple organizations")
		}
		created = result.state
	}
	if len(created.Branches) != 0 || created.Membership.Role != "OWNER" || created.Organization.BusinessType != "RESTAURANT" {
		t.Fatalf("unexpected branchless restaurant context: %+v", created)
	}
	tx, _, err := service.Authorized(ctx, ownerID, created.Organization.ID, "organization.read")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var branches, locations, terminals, auditEvents, auditBranches int
	err = tx.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM branches WHERE organization_id=$1),
		(SELECT count(*) FROM stock_locations WHERE organization_id=$1),
		(SELECT count(*) FROM pos_terminals WHERE organization_id=$1),
		(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='ORGANIZATION_CREATED'),
		(SELECT coalesce(sum(cardinality(branch_ids)),0) FROM organization_audit_events WHERE organization_id=$1 AND event_type='ORGANIZATION_CREATED')`, created.Organization.ID).Scan(&branches, &locations, &terminals, &auditEvents, &auditBranches)
	if err != nil {
		t.Fatal(err)
	}
	if branches != 0 || locations != 0 || terminals != 0 || auditEvents != 1 || auditBranches != 0 {
		t.Fatalf("unexpected infrastructure/audit counts: %d/%d/%d/%d/%d", branches, locations, terminals, auditEvents, auditBranches)
	}
	tx.Rollback(ctx)
	replayed, err := service.CreateRestaurant(ctx, ownerID, key, input)
	if err != nil || replayed.Organization.ID != created.Organization.ID || len(replayed.Branches) != 0 {
		t.Fatalf("branchless replay failed: %v", err)
	}
	input.Name = "Changed restaurant"
	if _, err = service.CreateRestaurant(ctx, ownerID, key, input); !errors.Is(err, organization.ErrConflict) {
		t.Fatalf("changed replay must conflict: %v", err)
	}
	if _, err = service.Context(guestCtx, guestID, created.Organization.ID); !errors.Is(err, organization.ErrNotFound) && !errors.Is(err, organization.ErrDenied) {
		t.Fatalf("foreign user read restaurant: %v", err)
	}
	legacyInput := input
	legacyInput.Name = "Branchless restaurant"
	if _, err = service.Create(ctx, ownerID, key, organization.CreateInput{OrganizationInput: legacyInput}); !errors.Is(err, organization.ErrConflict) {
		t.Fatalf("legacy creation reused restaurant key: %v", err)
	}
	pinned := &organization.Service{Pool: service.Pool, SingleStoreOrganizationID: created.Organization.ID}
	if _, err = pinned.CreateRestaurant(ctx, ownerID, "82711111-1111-4111-8111-111111111111", input); !errors.Is(err, organization.ErrDenied) {
		t.Fatalf("single-store creation allowed: %v", err)
	}
	verifyBranchlessSetup(t, ctx, guestCtx, service, ownerID, guestID, created.Organization.ID)
	return created
}
