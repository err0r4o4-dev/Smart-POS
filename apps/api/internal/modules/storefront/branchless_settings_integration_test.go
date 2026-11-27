package storefront_test

import (
	"bytes"
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
	"smartpos/api/internal/modules/storefront"
)

func verifyBranchlessSettings(testContext *testing.T, ctx, guestCtx context.Context, organizations *organization.Service, owner, guest, org string) {
	testContext.Helper()
	service := &storefront.Service{Organization: organizations}
	day := 0 // Sunday must survive the API and SQL round trip.
	hours := &storefront.OpeningHours{Opens: "07:30", Closes: "15:00", ClosedWeekday: &day, Timezone: "Asia/Bangkok"}
	input := storefront.SettingsInput{Name: "Restaurant draft", ShippingFee: "12.35", DeliveryEnabled: true, CategoryCodes: []string{"noodles", "seafood"}, OpeningHours: hours}
	type outcome struct {
		settings storefront.Settings
		err      error
	}
	results := make(chan outcome, 4)
	for attempt := 0; attempt < cap(results); attempt++ {
		go func() {
			settings, err := service.SaveSettings(ctx, owner, org, input)
			results <- outcome{settings, err}
		}()
	}
	var saved storefront.Settings
	var successes, conflicts int
	for attempt := 0; attempt < cap(results); attempt++ {
		result := <-results
		if result.err == nil {
			saved = result.settings
			successes++
		} else if errors.Is(result.err, storefront.ErrConflict) {
			conflicts++
		} else {
			testContext.Fatalf("draft save failed: %v", result.err)
		}
	}
	if successes != 1 || conflicts != 3 || saved.Revision != 1 || saved.ShippingFee != "12.35" || saved.TerminalID != "" || saved.OnlineTerminalID != "" || saved.BranchID != "" || saved.LocationID != "" || saved.Published || saved.AcceptingOrders {
		testContext.Fatalf("draft identity/revision/price/concurrency mismatch: successes=%d conflicts=%d settings=%+v", successes, conflicts, saved)
	}
	read, err := service.Settings(ctx, owner, org)
	if err != nil || read == nil || !reflect.DeepEqual(*read, saved) {
		testContext.Fatalf("draft read mismatch: %v", err)
	}
	if _, err = service.PublicSettings(ctx, saved.Slug); !errors.Is(err, storefront.ErrNotFound) {
		testContext.Fatalf("unpublished draft exposed publicly: %v", err)
	}
	verifyOrganizationQuote(testContext, ctx, guestCtx, organizations, owner, guest, org, saved.Slug)
	verifyBranchlessCatalog(testContext, ctx, guestCtx, organizations, owner, guest, org, saved.Slug)
	if _, err = service.Publish(ctx, owner, org, "11111111-1111-4111-8111-111111111111", storefront.PublishInput{Revision: saved.Revision, Published: true}); !errors.Is(err, storefront.ErrConflict) {
		testContext.Fatalf("draft used legacy product publishing: %v", err)
	}
	directory, err := service.Directory(ctx)
	if err != nil || bytes.Contains(directory, []byte(saved.Slug)) {
		testContext.Fatalf("draft leaked into directory: %v", err)
	}
	pinned := &storefront.Service{Organization: &organization.Service{Pool: organizations.Pool, SingleStoreOrganizationID: org}}
	directory, err = pinned.Directory(ctx)
	if err != nil || bytes.Contains(directory, []byte(saved.Slug)) {
		testContext.Fatalf("draft leaked into pinned directory: %v", err)
	}
	if _, err = service.SaveSettings(ctx, owner, org, input); !errors.Is(err, storefront.ErrConflict) {
		testContext.Fatalf("stale draft revision accepted: %v", err)
	}
	input.Revision, input.ShippingFee, input.CategoryCodes = saved.Revision, "13.37", nil
	input.OpeningHours = nil
	updated, err := service.SaveSettings(ctx, owner, org, input)
	if err != nil || updated.Revision != 2 || updated.Slug != saved.Slug || updated.ShippingFee != "13.37" || !reflect.DeepEqual(updated.CategoryCodes, []string{"noodles", "seafood"}) || !reflect.DeepEqual(updated.OpeningHours, hours) {
		testContext.Fatalf("draft revision update failed: %v", err)
	}
	if _, err = service.Settings(guestCtx, guest, org); !errors.Is(err, organization.ErrDenied) && !errors.Is(err, organization.ErrNotFound) {
		testContext.Fatalf("non-owner read draft: %v", err)
	}
	input.Revision, input.CategoryCodes = updated.Revision, []string{"desserts"}
	if _, err = service.SaveSettings(guestCtx, guest, org, input); !errors.Is(err, organization.ErrDenied) && !errors.Is(err, organization.ErrNotFound) {
		testContext.Fatalf("non-owner changed draft: %v", err)
	}
	other, err := organizations.CreateRestaurant(ctx, owner, "a9711111-1111-4111-8111-111111111111", organization.OrganizationInput{Name: "No profile draft", BusinessType: "RESTAURANT"})
	if err != nil {
		testContext.Fatal(err)
	}
	if _, err = service.Settings(ctx, owner, other.Organization.ID); err != nil {
		testContext.Fatal(err)
	}
	input.Revision = 0
	if _, err = service.SaveSettings(ctx, owner, other.Organization.ID, input); !errors.Is(err, storefront.ErrConflict) {
		testContext.Fatalf("missing restaurant profile accepted: %v", err)
	}
	if _, err = pinned.Settings(ctx, owner, other.Organization.ID); !errors.Is(err, storefront.ErrNotFound) {
		testContext.Fatalf("pinned deployment crossed organizations: %v", err)
	}
	tx, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		testContext.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var branches, stock, terminals, audits int
	var kind, reference string
	err = tx.QueryRow(ctx, `SELECT source_kind,restaurant_organization_id::text,
	 (SELECT count(*) FROM branches WHERE organization_id=$1),
	 (SELECT count(*) FROM stock_locations WHERE organization_id=$1),
	 (SELECT count(*) FROM pos_terminals WHERE organization_id=$1),
	 (SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='storefront.updated')
	 FROM storefronts WHERE organization_id=$1`, org).Scan(&kind, &reference, &branches, &stock, &terminals, &audits)
	if err != nil || kind != "RESTAURANT" || reference != org || branches != 0 || stock != 0 || terminals != 0 || audits != 2 {
		testContext.Fatalf("draft persistence/audit/infrastructure invariant failed: %v", err)
	}
	var storedCodes []string
	if err = tx.QueryRow(ctx, "SELECT category_codes FROM storefronts WHERE organization_id=$1", org).Scan(&storedCodes); err != nil || !reflect.DeepEqual(storedCodes, []string{"noodles", "seafood"}) {
		testContext.Fatalf("denied category update changed the storefront: %v", err)
	}
	for name, statement := range map[string]string{
		"publish":           "UPDATE storefronts SET published=true WHERE organization_id=$1",
		"accept orders":     "UPDATE storefronts SET accepting_orders=true WHERE organization_id=$1",
		"source conversion": "UPDATE storefronts SET source_kind='LEGACY_POS' WHERE organization_id=$1",
		"terminal source":   "UPDATE storefronts SET terminal_id='11111111-1111-4111-8111-111111111111' WHERE organization_id=$1",
	} {
		testContext.Run(name, func(testContext *testing.T) {
			if _, err = tx.Exec(ctx, "SAVEPOINT rejected_draft"); err != nil {
				testContext.Fatal(err)
			}
			_, problem := tx.Exec(ctx, statement, org)
			var sqlError *pgconn.PgError
			if !errors.As(problem, &sqlError) || sqlError.Code != "23514" {
				testContext.Fatalf("draft SQL guard failed: %v", problem)
			}
			if _, err = tx.Exec(ctx, "ROLLBACK TO SAVEPOINT rejected_draft"); err != nil {
				testContext.Fatal(err)
			}
		})
	}
	var visible int
	if _, err = tx.Exec(ctx, "SELECT set_config('app.organization_id',$1,true)", other.Organization.ID); err != nil {
		testContext.Fatal(err)
	}
	if err = tx.QueryRow(ctx, "SELECT count(*) FROM storefronts WHERE organization_id=$1", org).Scan(&visible); err != nil || visible != 0 {
		testContext.Fatalf("draft RLS scope failed: visible=%d error=%v", visible, err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO storefronts(organization_id,source_kind,slug,name) VALUES($1,'RESTAURANT','missing-profile-draft','Invalid draft')`, other.Organization.ID)
	var sqlError *pgconn.PgError
	if !errors.As(err, &sqlError) || sqlError.Code != "23503" {
		testContext.Fatalf("draft profile FK failed: %v", err)
	}
	if err = tx.Rollback(ctx); err != nil {
		testContext.Fatal(err)
	}
	if _, err = (&restaurant.Service{Organization: organizations}).SaveProfile(ctx, owner, other.Organization.ID, "aa711111-1111-4111-8111-111111111111", restaurant.SetupProfileInput{Name: "Conflicting storefront", BusinessType: "RESTAURANT"}); err != nil {
		testContext.Fatal(err)
	}
	input.Slug = saved.Slug
	if _, err = service.SaveSettings(ctx, owner, other.Organization.ID, input); !errors.Is(err, storefront.ErrConflict) {
		testContext.Fatalf("duplicate storefront slug accepted: %v", err)
	}
	if read, err = service.Settings(ctx, owner, other.Organization.ID); err != nil || read != nil {
		testContext.Fatalf("failed slug collision retained a draft: %v", err)
	}
	otherTx, _, err := organizations.Authorized(ctx, owner, other.Organization.ID, "storefront.manage")
	if err != nil {
		testContext.Fatal(err)
	}
	defer otherTx.Rollback(ctx)
	if err = otherTx.QueryRow(ctx, "SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='storefront.updated'", other.Organization.ID).Scan(&audits); err != nil || audits != 0 {
		testContext.Fatalf("failed slug collision retained an audit: count=%d error=%v", audits, err)
	}
}
