package storefront_test

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
)

func verifyBranchlessPickup(t *testing.T, ctx, guestCtx context.Context, organizations *organization.Service, owner, guest string) {
	t.Helper()
	created, err := organizations.CreateRestaurant(ctx, owner, "a0811111-1111-4111-8111-111111111111", organization.OrganizationInput{Name: "Pickup configuration", BusinessType: "RESTAURANT"})
	if err != nil {
		t.Fatal(err)
	}
	org := created.Organization.ID
	service := &restaurant.Service{Organization: organizations}
	state, err := service.Setup(ctx, owner, org, "")
	if err != nil || state.Services.Pickup == nil || *state.Services.Pickup {
		t.Fatalf("new Pickup default: %+v %v", state.Services, err)
	}
	on, off := true, false
	oldKey := "a0801111-1111-4111-8111-111111111111"
	oldInput := restaurant.SetupServicesInput{ServiceModes: restaurant.ServiceModes{Takeaway: true}}
	if _, err = service.SaveServices(ctx, owner, org, oldKey, oldInput); err != nil {
		t.Fatal(err)
	}
	fixture, _, err := organizations.Authorized(ctx, owner, org, "organization.update")
	if err != nil {
		t.Fatal(err)
	}
	defer fixture.Rollback(ctx)
	// Reproduce a schema39 command result without altering its input fingerprint.
	if _, err = fixture.Exec(ctx, `UPDATE restaurant_setup_commands SET result=result #- '{services,pickup}' #- '{profile,service_modes,pickup}' WHERE organization_id=$1 AND actor_id=$2 AND operation='services' AND idempotency_key=$3`, org, owner, oldKey); err != nil {
		t.Fatal(err)
	}
	if err = fixture.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	key := "a0821111-1111-4111-8111-111111111111"
	pickup := restaurant.SetupServicesInput{ServiceModes: restaurant.ServiceModes{Pickup: &on}}
	type outcome struct {
		state restaurant.SetupState
		err   error
	}
	results := make(chan outcome, 4)
	for attempt := 0; attempt < cap(results); attempt++ {
		go func() {
			saved, problem := service.SaveServices(ctx, owner, org, key, pickup)
			results <- outcome{saved, problem}
		}()
	}
	for attempt := 0; attempt < cap(results); attempt++ {
		result := <-results
		state, err = result.state, result.err
		if err != nil || state.Services.Pickup == nil || !*state.Services.Pickup || state.Services.Takeaway || state.Services.DineIn || state.Services.Delivery {
			t.Fatalf("concurrent independent Pickup persistence: %+v %v", state.Services, err)
		}
	}
	t.Run("mode_revision_is_recorded_once", func(t *testing.T) {
		tx, _, err := organizations.Authorized(ctx, owner, org, "organization.read")
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var entries int
		err = tx.QueryRow(ctx, `SELECT count(*) FROM restaurant_menu_revisions
			WHERE organization_id=$1 AND actor_id=$2
			AND before_state='{"service_modes":{"dine_in":false,"takeaway":true,"delivery":false,"pickup":false}}'::jsonb
			AND after_state='{"service_modes":{"dine_in":false,"takeaway":false,"delivery":false,"pickup":true}}'::jsonb`, org, owner).Scan(&entries)
		if err != nil || entries != 1 {
			t.Fatalf("expected one menu revision for Pickup enable and its replays: entries=%d err=%v", entries, err)
		}
	})
	oldReplay, err := service.SaveServices(ctx, owner, org, oldKey, oldInput)
	if err != nil || oldReplay.Services.Pickup != nil || !oldReplay.Services.Takeaway {
		t.Fatalf("historical replay changed with current Pickup: %+v %v", oldReplay.Services, err)
	}
	profile := restaurant.SetupProfileInput{Name: "Pickup configuration", BusinessType: "RESTAURANT", Address: "Synthetic Pickup address", Location: &restaurant.SetupLocationInput{Latitude: 13.7, Longitude: 100.5, Address: "Synthetic Pickup address", Confirmed: true}}
	state, err = service.SaveProfile(ctx, owner, org, "a0831111-1111-4111-8111-111111111111", profile)
	if err != nil || state.Services.Pickup == nil || !*state.Services.Pickup {
		t.Fatalf("profile omission erased Pickup: %v", err)
	}
	legacyKey := "a0841111-1111-4111-8111-111111111111"
	legacy := restaurant.SetupServicesInput{}
	state, err = service.SaveServices(ctx, owner, org, legacyKey, legacy)
	if err != nil || state.Services.Pickup == nil || !*state.Services.Pickup {
		t.Fatalf("legacy services must preserve effective Pickup: %v", err)
	}
	t.Run("profile_mode_history_rolls_back_with_audit", func(t *testing.T) {
		countHistory := func() int {
			t.Helper()
			tx, _, err := organizations.Authorized(ctx, owner, org, "organization.read")
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			var entries int
			err = tx.QueryRow(ctx, `SELECT count(*) FROM restaurant_menu_revisions
				WHERE organization_id=$1 AND actor_id=$2
				AND before_state='{"service_modes":{"dine_in":false,"takeaway":false,"delivery":false,"pickup":true}}'::jsonb
				AND after_state='{"service_modes":{"dine_in":true,"takeaway":false,"delivery":false,"pickup":true}}'::jsonb`, org, owner).Scan(&entries)
			if err != nil {
				t.Fatal(err)
			}
			return entries
		}
		update := profile
		update.ServiceModes = restaurant.ServiceModes{DineIn: true}
		const profileKey = "a0971111-1111-4111-8111-111111111111"
		// Only the audit insert receives the deliberately invalid text.
		if _, err := service.SaveProfile(organization.WithRequestID(ctx, "fixture\x00audit"), owner, org, profileKey, update); err == nil {
			t.Fatal("invalid audit insert did not fail the profile save")
		}
		current, err := service.Setup(ctx, owner, org, "")
		if err != nil || current.Services.DineIn || current.Services.Pickup == nil || !*current.Services.Pickup || countHistory() != 0 {
			t.Fatalf("audit failure changed service modes or history: %v", err)
		}
		saved, err := service.SaveProfile(ctx, owner, org, profileKey, update)
		if err != nil || !saved.Services.DineIn || saved.Services.Pickup == nil || !*saved.Services.Pickup || countHistory() != 1 {
			t.Fatalf("profile retry did not preserve Pickup and record one revision: %v", err)
		}
	})
	disabled := restaurant.SetupServicesInput{ServiceModes: restaurant.ServiceModes{Takeaway: true, Pickup: &off}}
	if _, err = service.SaveServices(ctx, owner, org, key, disabled); !errors.Is(err, restaurant.ErrConflict) {
		t.Fatalf("changed Pickup replay: %v", err)
	}
	state, err = service.SaveServices(ctx, owner, org, "a0851111-1111-4111-8111-111111111111", disabled)
	if err != nil || state.Services.Pickup == nil || *state.Services.Pickup || !state.Services.Takeaway {
		t.Fatalf("explicit disable: %+v %v", state.Services, err)
	}
	replay, err := service.SaveServices(ctx, owner, org, key, pickup)
	if err != nil || replay.Services.Pickup == nil || !*replay.Services.Pickup || replay.Services.Takeaway {
		t.Fatalf("replay must retain historical Pickup: %+v %v", replay.Services, err)
	}
	if _, err = service.SaveServices(ctx, owner, org, "a0861111-1111-4111-8111-111111111111", restaurant.SetupServicesInput{ServiceModes: restaurant.ServiceModes{Pickup: &off}}); !errors.Is(err, restaurant.ErrInput) {
		t.Fatalf("all disabled accepted: %v", err)
	}
	invalidProfile := profile
	invalidProfile.Name = "Must roll back"
	invalidProfile.ServiceModes = restaurant.ServiceModes{Pickup: &off}
	if _, err = service.SaveProfile(ctx, owner, org, "a0961111-1111-4111-8111-111111111111", invalidProfile); !errors.Is(err, restaurant.ErrInput) {
		t.Fatalf("invalid profile services accepted: %v", err)
	}
	state, err = service.Setup(ctx, owner, org, "")
	if err != nil || state.Profile.(map[string]any)["organization"].(map[string]any)["name"] != profile.Name || !state.Services.Takeaway || state.Services.Pickup == nil || *state.Services.Pickup {
		t.Fatalf("invalid services did not roll back profile: %v", err)
	}
	for _, value := range []*bool{&on, &off} {
		if _, err = service.SaveServices(ctx, owner, org, "a0871111-1111-4111-8111-111111111111", restaurant.SetupServicesInput{BranchID: "11111111-1111-4111-8111-111111111111", ServiceModes: restaurant.ServiceModes{Takeaway: true, Pickup: value}}); !errors.Is(err, restaurant.ErrInput) {
			t.Fatalf("legacy branch accepted Pickup: %v", err)
		}
		branchProfile := profile
		branchProfile.BranchID = "11111111-1111-4111-8111-111111111111"
		branchProfile.ServiceModes = restaurant.ServiceModes{Takeaway: true, Pickup: value}
		if _, err = service.SaveProfile(ctx, owner, org, "a0881111-1111-4111-8111-111111111111", branchProfile); !errors.Is(err, restaurant.ErrInput) {
			t.Fatalf("legacy branch profile accepted Pickup: %v", err)
		}
	}
	if _, err = service.SaveServices(guestCtx, guest, org, key, pickup); !errors.Is(err, organization.ErrDenied) && !errors.Is(err, organization.ErrNotFound) {
		t.Fatalf("foreign Pickup write/replay: %v", err)
	}
	state, err = service.SaveServices(ctx, owner, org, "a0891111-1111-4111-8111-111111111111", pickup)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.SaveTables(ctx, owner, org, "a0901111-1111-4111-8111-111111111111", restaurant.SetupTablesInput{}); err != nil {
		t.Fatal(err)
	}
	if _, err = service.SaveMenu(ctx, owner, org, "a0911111-1111-4111-8111-111111111111", restaurant.SetupMenuInput{Categories: []restaurant.SetupCategoryInput{{Name: "Meals"}}, Items: []restaurant.SetupMenuItemInput{{Category: "Meals", Name: "Pickup meal", Price: "45.25"}}}); err != nil {
		t.Fatal(err)
	}
	if _, err = service.SavePayments(ctx, owner, org, "a0921111-1111-4111-8111-111111111111", restaurant.SetupPaymentsInput{Cash: true}); err != nil {
		t.Fatal(err)
	}
	state, err = service.SaveOrders(ctx, owner, org, "a0931111-1111-4111-8111-111111111111", restaurant.SetupOrdersInput{VATRate: "0.00", ServiceChargeRate: "0.00"})
	if err != nil || !state.Ready {
		t.Fatalf("Pickup-only readiness: %v", err)
	}
	state, err = service.Complete(ctx, owner, org, "", "a0941111-1111-4111-8111-111111111111")
	if err != nil || !state.Completed || !state.Ready {
		t.Fatalf("Pickup-only completion: %v", err)
	}
	if _, err = service.SaveServices(ctx, owner, org, "a0951111-1111-4111-8111-111111111111", disabled); !errors.Is(err, restaurant.ErrConflict) {
		t.Fatalf("completed Pickup mutated: %v", err)
	}
	state, err = service.Setup(ctx, owner, org, "")
	if err != nil || state.Services.Pickup == nil || !*state.Services.Pickup || state.Services.Takeaway {
		t.Fatalf("durable Pickup after completion: %v", err)
	}
	fixture, _, err = organizations.Authorized(ctx, owner, org, "organization.update")
	if err != nil {
		t.Fatal(err)
	}
	defer fixture.Rollback(ctx)
	var commands, audits int
	if err = fixture.QueryRow(ctx, `SELECT (SELECT count(*) FROM restaurant_setup_commands WHERE organization_id=$1 AND operation='services' AND idempotency_key=$2), (SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='RESTAURANT_SETUP_SERVICES')`, org, key).Scan(&commands, &audits); err != nil || commands != 1 || audits != 5 {
		t.Fatalf("concurrent/replay commands or audits duplicated: %d/%d %v", commands, audits, err)
	}
	if _, err = fixture.Exec(ctx, "UPDATE users SET email_verified_at=NULL WHERE id=$1", owner); err != nil {
		t.Fatal(err)
	}
	if err = fixture.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if state, err = service.SaveServices(ctx, owner, org, key, pickup); !errors.Is(err, identity.ErrInvalidToken) || !reflect.DeepEqual(state, restaurant.SetupState{}) {
		t.Fatalf("unverified Owner replay returned Pickup snapshot: %v", err)
	}
	fixture, _, err = organizations.Authorized(ctx, owner, org, "organization.update")
	if err != nil {
		t.Fatal(err)
	}
	defer fixture.Rollback(ctx)
	if _, err = fixture.Exec(ctx, "UPDATE users SET email_verified_at=now() WHERE id=$1", owner); err != nil {
		t.Fatal(err)
	}
	if _, err = fixture.Exec(ctx, "INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'OWNER','ACTIVE')", org, guest); err != nil {
		t.Fatal(err)
	}
	if _, err = fixture.Exec(ctx, "UPDATE organization_memberships SET role='MANAGER' WHERE organization_id=$1 AND user_id=$2", org, owner); err != nil {
		t.Fatal(err)
	}
	if err = fixture.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = service.SaveServices(ctx, owner, org, key, pickup); !errors.Is(err, organization.ErrDenied) {
		t.Fatalf("revoked Owner replay returned Pickup snapshot: %v", err)
	}
}
