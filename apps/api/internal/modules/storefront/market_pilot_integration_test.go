package storefront_test

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/database"
	"smartpos/api/internal/testsupport"
)

type marketShop struct {
	Slug, Code, Name, Zone, Description, Pickup string
	Items                                       []struct {
		SKU, Category, Name, Unit, Status, Description string
		PriceMinor                                     int
	}
}

const marketOwner = "market-pilot-owner@example.test"

func TestMarketPilotIsolatedCatalog(t *testing.T) {
	dsn := os.Getenv("SMARTPOS_MARKET_PILOT_TEST_DSN")
	if dsn == "" {
		t.Skip("requires separately provisioned market pilot database")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil || cfg.ConnConfig.Host != "127.0.0.1" || cfg.ConnConfig.Port != 15642 ||
		cfg.ConnConfig.Database != "smartpos_market_pilot" || len(cfg.ConnConfig.Fallbacks) != 0 {
		t.Fatal("refusing database outside the designated local market pilot")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatal("could not open the designated database")
	}
	defer pool.Close()
	var marker string
	if err := pool.QueryRow(ctx, "SELECT value FROM market_pilot_marker").Scan(&marker); err != nil ||
		marker != "smartpos-market-pilot-v1" || (database.Checker{Pool: pool}).Ready(ctx) != nil {
		t.Fatal("market pilot marker or current clean schema missing")
	}

	raw, err := os.ReadFile(os.Getenv("SMARTPOS_MARKET_PILOT_CATALOG"))
	if err != nil {
		t.Fatal("market pilot catalog file missing")
	}
	var fixture struct {
		ID    string
		Shops []marketShop
	}
	if json.Unmarshal(raw, &fixture) != nil || fixture.ID != "market-pilot-v1" || len(fixture.Shops) != 12 {
		t.Fatal("expected the validated v1 market pilot catalog")
	}
	slugPattern := regexp.MustCompile("^market-[a-z0-9-]{1,42}$")
	seenSlugs, seenSKU := map[string]bool{}, map[string]bool{}
	for _, shop := range fixture.Shops {
		if !slugPattern.MatchString(shop.Slug) || seenSlugs[shop.Slug] || len(shop.Items) < 12 || len(shop.Items) > 18 {
			t.Fatal("invalid or duplicate market store")
		}
		seenSlugs[shop.Slug] = true
		for _, item := range shop.Items {
			if item.SKU == "" || seenSKU[item.SKU] || item.PriceMinor <= 0 || item.PriceMinor > 999999 ||
				(item.Status != "available" && item.Status != "sold-out") {
				t.Fatal("invalid or duplicate market menu item")
			}
			seenSKU[item.SKU] = true
		}
	}
	if len(seenSKU) != 180 {
		t.Fatal("expected 180 distinct catalog items")
	}

	orgs := &organization.Service{Pool: pool}
	shops := &storefront.Service{Organization: orgs}
	var userCount int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM users").Scan(&userCount); err != nil {
		t.Fatal("could not evaluate market pilot fixture ownership")
	}
	if userCount == 0 && os.Getenv("SMARTPOS_MARKET_PILOT_SEED") == "1" {
		box := &singleStoreMailbox{verificationTokens: map[string]string{}}
		accounts, err := identity.NewService(ctx, pool, box, slog.New(slog.NewTextHandler(io.Discard, nil)), time.Hour)
		if err != nil {
			t.Fatal("could not initialize local identity service")
		}
		key := sha256.Sum256([]byte(rand.Text()))
		mfa, err := identity.NewMFAService(pool, "market-fixture", key[:])
		if err != nil {
			t.Fatal("could not initialize local verification service")
		}
		auth := identity.Handler{Service: accounts, MFA: mfa, Origins: []string{testsupport.MFAOrigin}}
		makeOwner := func(email string) (string, context.Context) {
			t.Helper()
			pass := rand.Text() + "-Aa7!"
			record, err := accounts.Register(ctx, email, pass, "Market pilot")
			if err != nil {
				t.Fatal("local fixture account registration failed")
			}
			verified, err := accounts.VerifyEmail(ctx, box.verificationTokens[email])
			if err != nil || !verified.Verified {
				t.Fatal("local fixture verification failed")
			}
			return record.ID, testsupport.EnrollMFA(t, ctx, auth, email, pass).Context
		}
		owner, ownerCtx := makeOwner(marketOwner)
		foreign, foreignCtx := makeOwner("market-pilot-foreign@example.test")
		for _, shop := range fixture.Shops {
			orgID := provisionMarketShop(t, ownerCtx, orgs, shops, owner, shop)
			if _, err := shops.Settings(foreignCtx, foreign, orgID); !errors.Is(err, organization.ErrDenied) &&
				!errors.Is(err, organization.ErrNotFound) && !errors.Is(err, storefront.ErrNotFound) {
				t.Fatalf("private storefront readable to foreign account: %s", shop.Slug)
			}
		}
	} else if userCount != 0 && userCount != 2 {
		t.Fatal("unexpected users in pilot database, refusing to write")
	}

	directory, err := shops.Directory(ctx)
	var found []struct{ Slug string }
	if err != nil || json.Unmarshal(directory, &found) != nil || len(found) != 12 {
		t.Fatalf("directory has %d entries, expected 12", len(found))
	}
	for _, entry := range found {
		if !seenSlugs[entry.Slug] {
			t.Fatalf("unexpected public shop: %s", entry.Slug)
		}
	}
	total := 0
	for _, want := range fixture.Shops {
		page, err := shops.BrowseProducts(ctx, want.Slug, storefront.CatalogQuery{Page: 1})
		if err != nil || page.Total != len(want.Items) || len(page.Items) != len(want.Items) {
			t.Fatalf("%s: catalog count got %d/%d, want %d; %v", want.Slug, len(page.Items), page.Total, len(want.Items), err)
		}
		got := make(map[string]storefront.CatalogProduct, len(page.Items))
		for _, item := range page.Items {
			got[item.SKU] = item
		}
		for _, item := range want.Items {
			value := got[item.SKU]
			if value.ProductName != item.Name || value.UnitPrice != marketMoney(item.PriceMinor) || value.Unit != item.Unit ||
				value.IsSoldOut != (item.Status == "sold-out") || value.CategoryName != item.Category {
				t.Fatalf("%s: publication data differs for SKU %s", want.Slug, item.SKU)
			}
		}
		total += page.Total
	}
	t.Logf("public directory: %d stores, %d published menu items", len(found), total)
}

func marketMoney(minor int) string { return fmt.Sprintf("%d.%02d", minor/100, minor%100) }

func marketKey(parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	sum[6] = sum[6]&0x0f | 0x40
	sum[8] = sum[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", sum[:4], sum[4:6], sum[6:8], sum[8:10], sum[10:16])
}

func provisionMarketShop(t *testing.T, ctx context.Context, orgs *organization.Service, shops *storefront.Service, owner string, shop marketShop) string {
	t.Helper()
	state, err := orgs.Create(ctx, owner, marketKey(shop.Slug, "store"), organization.CreateInput{
		OrganizationInput: organization.OrganizationInput{Name: shop.Name, Code: "MKT-" + shop.Code, BusinessType: "RESTAURANT", Address: shop.Zone},
		Branch:            organization.BranchInput{Name: shop.Zone, Code: "MAIN", Status: "ACTIVE"},
	})
	if err != nil || len(state.Branches) != 1 {
		t.Fatalf("%s: creating shop: %v", shop.Slug, err)
	}
	org, branch := state.Organization.ID, state.Branches[0].ID
	input := restaurant.SetupMenuInput{BranchID: branch}
	categories := map[string]bool{}
	for _, item := range shop.Items {
		if !categories[item.Category] {
			input.Categories = append(input.Categories, restaurant.SetupCategoryInput{Name: item.Category})
			categories[item.Category] = true
		}
		input.Items = append(input.Items, restaurant.SetupMenuItemInput{SKU: item.SKU, Category: item.Category, Name: item.Name, Price: marketMoney(item.PriceMinor)})
	}
	if _, err := (&restaurant.Service{Organization: orgs}).SaveMenu(ctx, owner, org, marketKey(shop.Slug, "menu"), input); err != nil {
		t.Fatalf("%s: saving restaurant menu: %v", shop.Slug, err)
	}
	tx, _, err := orgs.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		t.Fatalf("%s: authorizing market-only stock setup: %v", shop.Slug, err)
	}
	defer tx.Rollback(ctx)
	var location, terminal string
	if err := tx.QueryRow(ctx, "INSERT INTO stock_locations(organization_id,branch_id,code,name,type,created_by,updated_by) VALUES($1,$2,'FRONT','Demo pickup','SALES_FLOOR',$3,$3) RETURNING id::text", org, branch, owner).Scan(&location); err != nil {
		t.Fatalf("%s: creating location: %v", shop.Slug, err)
	}
	if err := tx.QueryRow(ctx, "INSERT INTO pos_terminals(organization_id,branch_id,code,name,stock_location_id) VALUES($1,$2,'MAIN','Market POS',$3) RETURNING id::text", org, branch, location).Scan(&terminal); err != nil {
		t.Fatalf("%s: creating terminal: %v", shop.Slug, err)
	}
	variants := make([]string, len(shop.Items))
	unitIDs := map[string]string{}
	for i, item := range shop.Items {
		unit := unitIDs[item.Unit]
		if unit == "" {
			err := tx.QueryRow(ctx, "SELECT id::text FROM units WHERE organization_id=$1 AND lower(btrim(name))=lower($2) AND unit_type='COUNT' AND status='ACTIVE'",
				org, item.Unit).Scan(&unit)
			if errors.Is(err, pgx.ErrNoRows) {
				err = tx.QueryRow(ctx, "INSERT INTO units(organization_id,code,name,unit_type) VALUES($1,$2,$3,'COUNT') RETURNING id::text",
					org, fmt.Sprintf("MKT-UNIT-%02d", len(unitIDs)+1), item.Unit).Scan(&unit)
			}
			if err != nil {
				t.Fatalf("%s: creating unit: %v", shop.Slug, err)
			}
			unitIDs[item.Unit] = unit
		}
		if err := tx.QueryRow(ctx, "UPDATE product_variants SET unit_id=$3,attributes=attributes||jsonb_build_object('description',$4::text) WHERE organization_id=$1 AND sku=$2 RETURNING id::text",
			org, item.SKU, unit, item.Description).Scan(&variants[i]); err != nil {
			t.Fatalf("%s: setting unit/description: %v", shop.Slug, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("%s: commit draft setup: %v", shop.Slug, err)
	}

	settings, err := shops.SaveSettings(ctx, owner, org, storefront.SettingsInput{
		Slug: shop.Slug, Name: shop.Name, Description: shop.Description, PickupInstructions: shop.Pickup,
		TerminalID: terminal, Published: true, AcceptingOrders: false,
	})
	if err != nil {
		t.Fatalf("%s: publishing storefront: %v", shop.Slug, err)
	}
	for i, item := range shop.Items {
		_, err := shops.Publish(ctx, owner, org, variants[i], storefront.PublishInput{
			Published: true, IsSoldOut: item.Status == "sold-out", Revision: settings.Revision + int64(i),
		})
		if err != nil {
			t.Fatalf("%s: publishing %s: %v", shop.Slug, item.SKU, err)
		}
	}
	return org
}
