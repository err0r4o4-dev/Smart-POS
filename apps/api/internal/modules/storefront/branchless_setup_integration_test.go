package storefront_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
)

func verifyBranchlessSetup(t *testing.T, ctx, guestCtx context.Context, organizations *organization.Service, owner, guest, org string) {
	t.Helper()
	service := &restaurant.Service{Organization: organizations}
	state, err := service.Setup(ctx, owner, org, "")
	if err != nil || state.BranchID != "" || state.Ready || state.Completed {
		t.Fatalf("initial branchless setup: ready=%v completed=%v error=%v", state.Ready, state.Completed, err)
	}
	if _, err = service.Setup(guestCtx, guest, org, ""); !errors.Is(err, organization.ErrNotFound) && !errors.Is(err, organization.ErrDenied) {
		t.Fatalf("foreign setup read allowed: %v", err)
	}
	if _, err = service.SavePayments(guestCtx, guest, org, "95711111-1111-4111-8111-111111111111", restaurant.SetupPaymentsInput{Cash: true}); !errors.Is(err, organization.ErrNotFound) && !errors.Is(err, organization.ErrDenied) {
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
	editedTables := tables
	editedTables.GenerateQR = false
	editedTables.QREnabled = true
	editedTables.Tables = []restaurant.SetupTableInput{{Code: "T1", Name: "Renamed table", Seats: 4, ZoneCode: "MAIN"}}
	edited, err := service.SaveTables(ctx, owner, org, "87811111-1111-4111-8111-111111111111", editedTables)
	if err != nil || len(edited.IssuedTableQRTokens) != 0 {
		t.Fatalf("editing an enabled table reissued its QR: %v", err)
	}
	originalQR := issued
	t.Run("native_qr_save_issues_only_for_new_table", func(t *testing.T) {
		withNewTable := editedTables
		withNewTable.Tables = append([]restaurant.SetupTableInput{}, editedTables.Tables...)
		withNewTable.Tables = append(withNewTable.Tables, restaurant.SetupTableInput{Code: "T2", Name: "Table two", Seats: 2, ZoneCode: "MAIN"})
		saved, err := service.SaveTables(ctx, owner, org, "87911111-1111-4111-8111-111111111111", withNewTable)
		if err != nil || len(saved.IssuedTableQRTokens) != 1 || saved.IssuedTableQRTokens[0].Code != "T2" {
			t.Fatalf("adding a table did not issue QR only for the new table: %v", err)
		}
		tx, _, err := organizations.Authorized(ctx, owner, org, "organization.read")
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		for _, qr := range []restaurant.IssuedTableQRToken{originalQR, saved.IssuedTableQRTokens[0]} {
			got, err := restaurant.ResolveNativeTableQR(ctx, tx, org, qr.QRToken)
			if err != nil || got.TableID != qr.TableID || got.Code != qr.Code {
				t.Fatalf("QR did not identify its table after adding a table: %v", err)
			}
		}
	})
	rotation := editedTables
	rotation.GenerateQR = true
	rotated, err := service.SaveTables(ctx, owner, org, "88011111-1111-4111-8111-111111111111", rotation)
	if err != nil || len(rotated.IssuedTableQRTokens) != 1 {
		t.Fatalf("explicit QR rotation failed: %v", err)
	}
	issued = rotated.IssuedTableQRTokens[0]
	if issued.TableID != originalQR.TableID || issued.Code != originalQR.Code || issued.QRToken == originalQR.QRToken {
		t.Fatal("explicit QR rotation did not replace the token on the same table")
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
	verifyBranchlessMenu(t, ctx, guestCtx, organizations, owner, guest, org)
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
	if branches != 0 || stock != 0 || terminals != 0 || inventoryCommands != 0 || commands != 11 || profileAudits != 1 || auditBranches != 0 || activeTables != 1 || vat != "7.00" || charge != "10.00" || !trialStarted {
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
	t.Run("native_qr_identifies_only_active_table", func(t *testing.T) {
		check := func(scoped pgx.Tx, restaurantID, qr string, want bool) {
			t.Helper()
			got, err := restaurant.ResolveNativeTableQR(ctx, scoped, restaurantID, qr)
			if want {
				if err != nil || got.TableID != issued.TableID || got.Code != issued.Code || got.Name != "Renamed table" {
					t.Fatalf("issued QR did not identify the native table: %v", err)
				}
				public, err := json.Marshal(got)
				if err != nil || string(public) != `{"code":"T1","name":"Renamed table"}` {
					t.Fatal("native table context contains more than its public code and name")
				}
				return
			}
			if !errors.Is(err, restaurant.ErrNotFound) || got != (restaurant.NativeTableQRContext{}) {
				t.Fatalf("invalid table context returned data or unexpected error: %v", err)
			}
		}
		check(tx, org, issued.QRToken, true)
		check(tx, org, originalQR.QRToken, false)
		check(tx, org, "", false)
		check(tx, org, strings.Repeat("0", 64), false)
		check(tx, "11111111-1111-4111-8111-111111111111", issued.QRToken, false)
		for _, statement := range []string{
			"UPDATE restaurant_profiles SET table_qr_enabled=false WHERE organization_id=$1",
			"UPDATE restaurant_dining_tables SET status='INACTIVE' WHERE organization_id=$1",
		} {
			fixture, err := tx.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer fixture.Rollback(ctx)
			if _, err = fixture.Exec(ctx, statement, org); err != nil {
				t.Fatal(err)
			}
			check(fixture, org, issued.QRToken, false)
			if err = fixture.Rollback(ctx); err != nil {
				t.Fatal(err)
			}
		}
		check(tx, org, issued.QRToken, true)
	})
	if _, err = tx.Exec(ctx, "INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'MANAGER','ACTIVE')", org, guest); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Setup(guestCtx, guest, org, ""); !errors.Is(err, organization.ErrDenied) {
		t.Fatalf("non-owner gained branchless configuration access: %v", err)
	}
	if _, err = service.SavePayments(guestCtx, guest, org, "95711111-1111-4111-8111-111111111111", restaurant.SetupPaymentsInput{Cash: true}); !errors.Is(err, organization.ErrDenied) {
		t.Fatalf("non-owner gained branchless configuration write: %v", err)
	}
	if _, err = service.SaveMenu(guestCtx, guest, org, "96711111-1111-4111-8111-111111111111", restaurant.SetupMenuInput{Categories: []restaurant.SetupCategoryInput{{Name: "Meals"}}, Items: []restaurant.SetupMenuItemInput{{Category: "Meals", Name: "Soup", Price: "45.25"}}}); !errors.Is(err, organization.ErrDenied) {
		t.Fatalf("non-owner gained branchless menu write: %v", err)
	}
	other := verifyBranchlessSetupIsolation(t, ctx, organizations, owner, org, zoneID)
	t.Run("native_qr_stays_scoped_with_same_table_code", func(t *testing.T) {
		otherTables := tables
		otherTables.Tables = []restaurant.SetupTableInput{{Code: issued.Code, Name: "Other restaurant table", Seats: 2, ZoneCode: "MAIN"}}
		state, err := service.SaveTables(ctx, owner, other, "95711111-1111-4111-8111-111111111112", otherTables)
		if err != nil || len(state.IssuedTableQRTokens) != 1 {
			t.Fatalf("could not issue the other restaurant's QR: %v", err)
		}
		foreign := state.IssuedTableQRTokens[0]
		if foreign.TableID == issued.TableID || foreign.QRToken == issued.QRToken {
			t.Fatal("different restaurants shared table identity or QR")
		}
		for _, tc := range []struct {
			org, otherOrg string
			own, otherQR  restaurant.IssuedTableQRToken
		}{
			{org, other, issued, foreign},
			{other, org, foreign, issued},
		} {
			scoped, _, err := organizations.Authorized(ctx, owner, tc.org, "organization.read")
			if err != nil {
				t.Fatal(err)
			}
			defer scoped.Rollback(ctx)
			got, err := restaurant.ResolveNativeTableQR(ctx, scoped, tc.org, tc.own.QRToken)
			if err != nil || got.TableID != tc.own.TableID || got.Code != tc.own.Code {
				t.Fatalf("valid QR did not resolve in its own transaction: %v", err)
			}
			for _, restaurantID := range []string{tc.org, tc.otherOrg} {
				got, err := restaurant.ResolveNativeTableQR(ctx, scoped, restaurantID, tc.otherQR.QRToken)
				if !errors.Is(err, restaurant.ErrNotFound) || got != (restaurant.NativeTableQRContext{}) {
					t.Fatalf("foreign QR resolved in a transaction for another restaurant: %v", err)
				}
			}
		}
	})
	verifyBranchlessSettings(t, ctx, guestCtx, organizations, owner, guest, org)
	t.Run("availability_settings", func(t *testing.T) {
		verifyAvailabilitySettings(t, ctx, guestCtx, service, owner, guest, org)
	})
	t.Run("availability_runtime_rls", func(t *testing.T) {
		verifyAvailabilityRLS(t, ctx, organizations.Pool, owner, org, other)
	})
	verifyBranchlessPickup(t, ctx, guestCtx, organizations, owner, guest)
}

func verifyBranchlessSetupIsolation(t *testing.T, ctx context.Context, organizations *organization.Service, owner, original, foreignZone string) string {
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
	return other.Organization.ID
}
