package storefront_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
)

func verifyBranchlessSetup(t *testing.T, ctx context.Context, organizations *organization.Service, owner, guest, org string) {
	t.Helper()
	service := &restaurant.Service{Organization: organizations}
	state, err := service.Setup(ctx, owner, org, "")
	if err != nil || state.BranchID != "" || state.Ready || state.Completed {
		t.Fatalf("initial branchless setup: ready=%v completed=%v error=%v", state.Ready, state.Completed, err)
	}
	if _, err = service.Setup(ctx, guest, org, ""); !errors.Is(err, organization.ErrNotFound) && !errors.Is(err, organization.ErrDenied) {
		t.Fatalf("foreign setup read allowed: %v", err)
	}
	if _, err = service.SavePayments(ctx, guest, org, "95711111-1111-4111-8111-111111111111", restaurant.SetupPaymentsInput{Cash: true}); !errors.Is(err, organization.ErrNotFound) && !errors.Is(err, organization.ErrDenied) {
		t.Fatalf("foreign setup write allowed: %v", err)
	}
	if _, err = service.Complete(ctx, owner, org, "", "84711111-1111-4111-8111-111111111111"); !errors.Is(err, restaurant.ErrConflict) {
		t.Fatalf("incomplete setup completed: %v", err)
	}
	profile := restaurant.SetupProfileInput{
		Name: "Restaurant without branches", BusinessType: "RESTAURANT", Address: "Synthetic restaurant address",
		Location: &restaurant.SetupLocationInput{Latitude: 13.7, Longitude: 100.5, Address: "Synthetic restaurant address", Confirmed: true},
	}
	key := "85711111-1111-4111-8111-111111111111"
	type outcome struct{ err error }
	results := make(chan outcome, 4)
	for attempt := 0; attempt < cap(results); attempt++ {
		go func() {
			_, problem := service.SaveProfile(ctx, owner, org, key, profile)
			results <- outcome{problem}
		}()
	}
	for attempt := 0; attempt < cap(results); attempt++ {
		if result := <-results; result.err != nil {
			t.Fatalf("concurrent branchless profile: %v", result.err)
		}
	}
	changed := profile
	changed.Name = "Conflicting replay"
	if _, err = service.SaveProfile(ctx, owner, org, key, changed); !errors.Is(err, restaurant.ErrConflict) {
		t.Fatalf("changed profile replay allowed: %v", err)
	}
	state, err = service.SaveServices(ctx, owner, org, "86711111-1111-4111-8111-111111111111", restaurant.SetupServicesInput{ServiceModes: restaurant.ServiceModes{DineIn: true, Takeaway: true}})
	if err != nil || state.Ready {
		t.Fatalf("services before tables/payments ready: %v", err)
	}
	tables := restaurant.SetupTablesInput{GenerateQR: true,
		Zones:  []restaurant.SetupZoneInput{{Code: "MAIN", Name: "Dining room"}},
		Tables: []restaurant.SetupTableInput{{Code: "T1", Name: "Table one", Seats: 4, ZoneCode: "MAIN"}},
	}
	state, err = service.SaveTables(ctx, owner, org, "87711111-1111-4111-8111-111111111111", tables)
	if err != nil || len(state.IssuedTableQRTokens) != 1 {
		t.Fatalf("branchless table setup: %v", err)
	}
	issued := state.IssuedTableQRTokens[0]
	replay, err := service.SaveTables(ctx, owner, org, "87711111-1111-4111-8111-111111111111", tables)
	if err != nil || len(replay.IssuedTableQRTokens) != 1 || replay.IssuedTableQRTokens[0] != issued {
		t.Fatalf("table token replay changed: %v", err)
	}
	if _, err = service.SavePayments(ctx, owner, org, "88711111-1111-4111-8111-111111111111", restaurant.SetupPaymentsInput{Cash: true}); err != nil {
		t.Fatal(err)
	}
	state, err = service.SaveOrders(ctx, owner, org, "89711111-1111-4111-8111-111111111111", restaurant.SetupOrdersInput{VATRate: "7.00", ServiceChargeRate: "10.00", KitchenQueue: true})
	if err != nil || !state.Ready || state.Completed || state.BranchID != "" || state.Location == nil || state.Location.Address != profile.Address {
		t.Fatalf("branchless readiness/location failed: ready=%v completed=%v error=%v", state.Ready, state.Completed, err)
	}
	if len(state.IssuedTableQRTokens) != 0 {
		t.Fatal("unrelated mutation exposed table tokens")
	}
	invalidTables := tables
	invalidTables.Tables = []restaurant.SetupTableInput{{Code: "TOO_LONG_NAME", Name: strings.Repeat("x", 101), Seats: 2, ZoneCode: "MAIN"}}
	if _, err = service.SaveTables(ctx, owner, org, "90711111-1111-4111-8111-111111111111", invalidTables); err == nil {
		t.Fatal("invalid replacement tables did not roll back")
	}
	verifyBranchlessMenu(t, ctx, organizations, owner, guest, org)
	state, err = service.Complete(ctx, owner, org, "", "91711111-1111-4111-8111-111111111111")
	if err != nil || !state.Completed || !state.Ready {
		t.Fatalf("branchless completion failed: %v", err)
	}
	if _, err = service.Complete(ctx, owner, org, "", "91711111-1111-4111-8111-111111111111"); err != nil {
		t.Fatalf("completion replay failed: %v", err)
	}
	if _, err = service.SavePayments(ctx, owner, org, "92711111-1111-4111-8111-111111111111", restaurant.SetupPaymentsInput{Cash: true}); !errors.Is(err, restaurant.ErrConflict) {
		t.Fatalf("completed setup was mutated: %v", err)
	}
	tx, _, err := organizations.Authorized(ctx, owner, org, "organization.read")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var branches, stock, terminals, inventoryCommands, commands, profileAudits, auditBranches, activeTables int
	var vat, charge, tokenHash string
	var trialStarted bool
	err = tx.QueryRow(ctx, `SELECT
	 (SELECT count(*) FROM branches WHERE organization_id=$1),
	 (SELECT count(*) FROM stock_locations WHERE organization_id=$1),
	 (SELECT count(*) FROM pos_terminals WHERE organization_id=$1),
	 (SELECT count(*) FROM inventory_operations WHERE organization_id=$1),
	 (SELECT count(*) FROM restaurant_setup_commands WHERE organization_id=$1),
	 (SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='RESTAURANT_SETUP_PROFILE'),
	 (SELECT coalesce(sum(cardinality(branch_ids)),0) FROM organization_audit_events WHERE organization_id=$1),
	 (SELECT count(*) FROM restaurant_dining_tables WHERE organization_id=$1 AND status='ACTIVE'),
	 vat_rate::text,service_charge_rate::text,trial_ends_at>completed_at
	 FROM restaurant_profiles WHERE organization_id=$1`, org).Scan(&branches, &stock, &terminals, &inventoryCommands, &commands, &profileAudits, &auditBranches, &activeTables, &vat, &charge, &trialStarted)
	if err != nil {
		t.Fatal(err)
	}
	if branches != 0 || stock != 0 || terminals != 0 || inventoryCommands != 0 || commands != 8 || profileAudits != 1 || auditBranches != 0 || activeTables != 1 || vat != "7.00" || charge != "10.00" || !trialStarted {
		t.Fatal("branchless setup infrastructure, exact charges, rollback, replay or trial invariant failed")
	}
	if err = tx.QueryRow(ctx, "SELECT qr_token_hash FROM restaurant_dining_tables WHERE organization_id=$1 AND id=$2", org, issued.TableID).Scan(&tokenHash); err != nil {
		t.Fatal(err)
	}
	var zoneID string
	if err = tx.QueryRow(ctx, "SELECT zone_id::text FROM restaurant_dining_tables WHERE organization_id=$1 AND id=$2", org, issued.TableID).Scan(&zoneID); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256([]byte(issued.QRToken))
	if tokenHash != hex.EncodeToString(digest[:]) {
		t.Fatal("QR hash changed during failed replacement")
	}
	if _, err = tx.Exec(ctx, "INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'MANAGER','ACTIVE')", org, guest); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Setup(ctx, guest, org, ""); !errors.Is(err, organization.ErrDenied) {
		t.Fatalf("non-owner gained branchless configuration access: %v", err)
	}
	if _, err = service.SavePayments(ctx, guest, org, "95711111-1111-4111-8111-111111111111", restaurant.SetupPaymentsInput{Cash: true}); !errors.Is(err, organization.ErrDenied) {
		t.Fatalf("non-owner gained branchless configuration write: %v", err)
	}
	if _, err = service.SaveMenu(ctx, guest, org, "96711111-1111-4111-8111-111111111111", restaurant.SetupMenuInput{Categories: []restaurant.SetupCategoryInput{{Name: "Meals"}}, Items: []restaurant.SetupMenuItemInput{{Category: "Meals", Name: "Soup", Price: "45.25"}}}); !errors.Is(err, organization.ErrDenied) {
		t.Fatalf("non-owner gained branchless menu write: %v", err)
	}
	verifyBranchlessSetupIsolation(t, ctx, organizations, owner, org, zoneID)
	verifyBranchlessSettings(t, ctx, organizations, owner, guest, org)
}

func verifyBranchlessSetupIsolation(t *testing.T, ctx context.Context, organizations *organization.Service, owner, original, foreignZone string) {
	t.Helper()
	other, err := organizations.CreateRestaurant(ctx, owner, "93711111-1111-4111-8111-111111111111", organization.OrganizationInput{Name: "Other branchless restaurant", BusinessType: "RESTAURANT"})
	if err != nil {
		t.Fatal(err)
	}
	service := &restaurant.Service{Organization: organizations}
	if _, err = service.SaveProfile(ctx, owner, other.Organization.ID, "94711111-1111-4111-8111-111111111111", restaurant.SetupProfileInput{Name: "Other restaurant", BusinessType: "RESTAURANT"}); err != nil {
		t.Fatal(err)
	}
	originalState, err := service.Setup(ctx, owner, original, "")
	if err != nil {
		t.Fatal(err)
	}
	originalItem := originalState.Menu.(map[string]any)["items"].([]map[string]any)[0]
	foreignMenu := restaurant.SetupMenuInput{Categories: []restaurant.SetupCategoryInput{{Name: "Meals"}}, Items: []restaurant.SetupMenuItemInput{{VariantID: originalItem["variant_id"].(string), Category: "Meals", Name: "Foreign menu", Price: "1.00"}}}
	if _, err = service.SaveMenu(ctx, owner, other.Organization.ID, "99711111-1111-4111-8111-111111111111", foreignMenu); !errors.Is(err, restaurant.ErrInput) {
		t.Fatalf("cross-organization menu variant accepted: %v", err)
	}
	foreignMenu.Categories[0].ID = originalItem["category_id"].(string)
	if _, err = service.SaveMenu(ctx, owner, other.Organization.ID, "99711111-1111-4111-8111-111111111111", foreignMenu); !errors.Is(err, restaurant.ErrInput) {
		t.Fatalf("cross-organization menu category accepted: %v", err)
	}
	tx, _, err := organizations.Authorized(ctx, owner, other.Organization.ID, "organization.read")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var visible int
	if err = tx.QueryRow(ctx, "SELECT count(*) FROM restaurant_profiles WHERE organization_id=$1", original).Scan(&visible); err != nil || visible != 0 {
		t.Fatalf("foreign restaurant profile visible through RLS: %v", err)
	}
	if err = tx.QueryRow(ctx, "SELECT (SELECT count(*) FROM restaurant_menu_categories WHERE organization_id=$1)+(SELECT count(*) FROM restaurant_menu_items WHERE organization_id=$1)", original).Scan(&visible); err != nil || visible != 0 {
		t.Fatalf("foreign restaurant menu registry visible through RLS: %v", err)
	}
	if _, err = tx.Exec(ctx, "SAVEPOINT foreign_menu"); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, "INSERT INTO restaurant_menu_items(organization_id,product_id,variant_id) VALUES($1,$2,$3)", other.Organization.ID, originalItem["product_id"], originalItem["variant_id"]); err == nil {
		t.Fatal("cross-organization menu registry accepted")
	} else {
		var problem *pgconn.PgError
		if !errors.As(err, &problem) || problem.Code != "23503" {
			t.Fatalf("expected organization-menu FK violation: %v", err)
		}
	}
	if _, err = tx.Exec(ctx, "ROLLBACK TO SAVEPOINT foreign_menu"); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO restaurant_dining_tables(organization_id,zone_id,code,name,seats,qr_token_hash,created_by,updated_by)
	 VALUES($1,$3,'T1','Foreign zone',2,repeat('a',64),$2,$2)`, other.Organization.ID, owner, foreignZone); err == nil {
		t.Fatal("nonexistent/cross-organization zone accepted")
	} else {
		var problem *pgconn.PgError
		if !errors.As(err, &problem) || problem.Code != "23503" {
			t.Fatalf("expected organization-zone FK violation: %v", err)
		}
	}
}
