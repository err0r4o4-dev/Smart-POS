package storefront_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"os"
	"reflect"
	"testing"
	"time"

	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/database"
	"smartpos/api/internal/testsupport"
)

func TestPublicMetadataDisposable(t *testing.T) {
	if os.Getenv("SMARTPOS_META55_SOCKET_TEST") != "explicit-disposable" {
		t.Skip("requires the isolated disposable Unix socket target")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	pool, err := database.Open(ctx, "host=/var/run/postgresql dbname=smartpos_meta55_disposable user=postgres sslmode=disable")
	if err != nil {
		t.Fatal("disposable database unavailable")
	}
	defer pool.Close()
	var marker string
	if err := pool.QueryRow(ctx, "SELECT value FROM meta55_test_marker").Scan(&marker); err != nil || marker != "disposable-storefront-meta55-v1" || (database.Checker{Pool: pool}).Ready(ctx) != nil {
		t.Fatal("isolated test marker or schema missing")
	}
	mailbox := &singleStoreMailbox{verificationTokens: map[string]string{}}
	accounts, err := identity.NewService(ctx, pool, mailbox, slog.New(slog.NewTextHandler(io.Discard, nil)), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	mfa, err := identity.NewMFAService(pool, "meta55-test", bytes.Repeat([]byte{0x55}, 32))
	if err != nil {
		t.Fatal(err)
	}
	auth := identity.Handler{Service: accounts, MFA: mfa, Origins: []string{testsupport.MFAOrigin}}
	const password = "Synthetic-metadata-owner-test-55"
	makeAccount := func(email string) (string, context.Context) {
		t.Helper()
		u, err := accounts.Register(ctx, email, password, "Synthetic metadata operator")
		if err != nil {
			t.Fatal(err)
		}
		verified, err := accounts.VerifyEmail(ctx, mailbox.verificationTokens[email])
		if err != nil || !verified.Verified {
			t.Fatal("synthetic verification failed")
		}
		return u.ID, testsupport.EnrollMFA(t, ctx, auth, email, password).Context
	}
	owner, ownerCtx := makeAccount("owner-meta-suite@example.test")
	foreign, foreignCtx := makeAccount("foreign-meta-suite@example.test")
	orgs := &organization.Service{Pool: pool}
	shops := &storefront.Service{Organization: orgs}
	created, err := orgs.Create(ownerCtx, owner, "b8880000-0000-4000-8000-000000000001", organization.CreateInput{
		OrganizationInput: organization.OrganizationInput{Name: "Synthetic legacy market", Code: "META55-LEGACY", BusinessType: "RESTAURANT"},
		Branch:            organization.BranchInput{Name: "Main", Code: "MAIN", Status: "ACTIVE"},
	})
	if err != nil || len(created.Branches) != 1 {
		t.Fatalf("setup legacy: %v", err)
	}
	org, branch := created.Organization.ID, created.Branches[0].ID
	tx, _, err := orgs.Authorized(ownerCtx, owner, org, "storefront.manage")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var location, terminal string
	if err := tx.QueryRow(ownerCtx, `INSERT INTO stock_locations(organization_id,branch_id,code,name,type,created_by,updated_by) VALUES($1,$2,'META','Synthetic','SALES_FLOOR',$3,$3) RETURNING id::text`, org, branch, owner).Scan(&location); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ownerCtx, `INSERT INTO pos_terminals(organization_id,branch_id,code,name,stock_location_id) VALUES($1,$2,'META','Synthetic',$3) RETURNING id::text`, org, branch, location).Scan(&terminal); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(ownerCtx); err != nil {
		t.Fatal(err)
	}
	input := storefront.SettingsInput{Slug: "meta55-legacy", Name: "Synthetic legacy market", TerminalID: terminal, Published: true}
	before, err := shops.SaveSettings(ownerCtx, owner, org, input)
	if err != nil || before.OpeningHours != nil || before.AcceptingOrders || !before.Published {
		t.Fatalf("legacy compatibility: %v", err)
	}
	weekday := 0
	hours := &storefront.OpeningHours{Opens: "07:30", Closes: "15:00", ClosedWeekday: &weekday, Timezone: "Asia/Bangkok"}
	input.OpeningHours, input.CategoryCodes, input.Revision = hours, []string{"seafood"}, before.Revision
	if _, err := shops.SaveSettings(foreignCtx, foreign, org, input); !errors.Is(err, organization.ErrDenied) && !errors.Is(err, organization.ErrNotFound) && !errors.Is(err, storefront.ErrNotFound) {
		t.Fatalf("foreign owner write: %v", err)
	}
	saved, err := shops.SaveSettings(ownerCtx, owner, org, input)
	if err != nil || saved.Revision != before.Revision+1 || !reflect.DeepEqual(saved.OpeningHours, hours) {
		t.Fatalf("legacy metadata save: %v", err)
	}
	if _, err := shops.SaveSettings(ownerCtx, owner, org, input); !errors.Is(err, storefront.ErrConflict) {
		t.Fatalf("stale revision: %v", err)
	}
	input.OpeningHours, input.CategoryCodes, input.Revision = nil, nil, saved.Revision
	saved, err = shops.SaveSettings(ownerCtx, owner, org, input)
	if err != nil || !reflect.DeepEqual(saved.OpeningHours, hours) || !reflect.DeepEqual(saved.CategoryCodes, []string{"seafood"}) || !saved.Published || saved.AcceptingOrders {
		t.Fatalf("legacy client must preserve metadata and state: %v", err)
	}
	public, err := shops.PublicSettings(ctx, input.Slug)
	if err != nil || !reflect.DeepEqual(public.OpeningHours, hours) || public.TerminalID != "" || public.BranchID != "" || public.LocationID != "" || public.AcceptingOrders {
		t.Fatalf("public hours or private field handling: %v", err)
	}
	directory, err := shops.Directory(ctx)
	var entries []struct {
		Slug          string
		CategoryCodes []string `json:"category_codes"`
	}
	if err != nil || json.Unmarshal(directory, &entries) != nil || len(entries) != 1 || entries[0].Slug != input.Slug || !reflect.DeepEqual(entries[0].CategoryCodes, []string{"seafood"}) {
		t.Fatalf("public category: %v", err)
	}
	t.Log("Legacy storefront metadata saved and read publicly; owner scope, stale revision, legacy omission and closed ordering verified")
}
