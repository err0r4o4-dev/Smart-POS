package restaurant

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/testsupport"
)

func TestOwnerModifierReadPopulatedAndExpiredIsolated(t *testing.T) {
	dsn, adminDSN := os.Getenv("SMARTPOS_MODIFIER_TEST_DSN"), os.Getenv("SMARTPOS_MODIFIER_ADMIN_DSN")
	if dsn == "" || adminDSN == "" {
		t.Skip("requires the task-owned populated modifier fixture")
	}
	for _, connection := range []string{dsn, adminDSN} {
		cfg, err := pgx.ParseConfig(connection)
		if err != nil || cfg.Host != "127.0.0.1" || cfg.Port != 15514 || cfg.Database != "smartpos_single_store_acceptance" {
			t.Fatal("refusing an unconfirmed modifier fixture target")
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	admin, err := pgx.Connect(ctx, adminDSN)
	if err != nil {
		t.Fatal("connect to modifier fixture admin failed")
	}
	defer admin.Close(ctx)
	var marker string
	if err = admin.QueryRow(ctx, "SELECT marker FROM modifier_acceptance_marker").Scan(&marker); err != nil || marker != "ephemeral-modifier" {
		t.Fatal("modifier fixture marker missing")
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal("configure modifier runtime pool failed")
	}
	defer pool.Close()
	const email, password = "fixture@example.test", "Synthetic-modifier-only-fixture-2026"
	hash, err := identity.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	var user string
	if err = admin.QueryRow(ctx, "UPDATE users SET password_hash=$1,email_verified_at=clock_timestamp() WHERE email_normalized=$2 RETURNING id", hash, email).Scan(&user); err != nil {
		t.Fatal("prepare synthetic Owner failed")
	}
	accounts, err := identity.NewService(ctx, pool, nil, slog.New(slog.NewTextHandler(io.Discard, nil)), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	mfa, err := identity.NewMFAService(pool, "synthetic-modifier-key", bytes.Repeat([]byte{0x42}, 32))
	if err != nil {
		t.Fatal(err)
	}
	proof := testsupport.EnrollMFA(t, ctx, identity.Handler{Service: accounts, MFA: mfa, Origins: []string{testsupport.MFAOrigin}}, email, password)
	org, variant := os.Getenv("SMARTPOS_MODIFIER_ORG"), os.Getenv("SMARTPOS_MODIFIER_ITEM")
	service := &Service{Organization: &organization.Service{Pool: pool}}
	groups, err := service.MenuModifierGroups(proof.Context, user, org, variant)
	if err != nil || len(groups) != 1 || len(groups[0].Options) != 2 {
		t.Fatalf("populated read: %v, %v", groups, err)
	}
	want := map[string]MenuModifierOption{
		"Tofu":        {ExtraPrice: "12.35", Saleable: true},
		"Unavailable": {ExtraPrice: "0.00"},
	}
	for _, option := range groups[0].Options {
		expected, exists := want[option.Label]
		if !exists || option.ExtraPrice != expected.ExtraPrice || option.Saleable != expected.Saleable {
			t.Fatalf("unexpected Owner option: %+v", option)
		}
		delete(want, option.Label)
	}
	t.Run("prices only scoped saleable choices", func(t *testing.T) {
		auth, err := service.beginOrganizationSetup(proof.Context, user, org)
		if err != nil {
			t.Fatal(err)
		}
		defer auth.Tx.Rollback(ctx)
		for _, option := range groups[0].Options {
			result, err := PriceMenuModifierSelection(ctx, auth.Tx, org, variant, []MenuModifierChoice{{
				GroupID: groups[0].ID, OptionIDs: []string{option.ID},
			}})
			if option.Saleable {
				if err != nil || result.ExtraMinor != 1235 || len(result.Options) != 1 || result.Options[0].OptionID != option.ID {
					t.Fatalf("saleable choice: %+v, %v", result, err)
				}
			} else if !errors.Is(err, ErrConflict) || !reflect.DeepEqual(result, MenuModifierPricing{}) {
				t.Fatalf("disabled choice: %+v, %v", result, err)
			}
		}
	})
	if os.Getenv("SMARTPOS_MODIFIER_WRITE") == "1" {
		const firstKey = "44444444-4444-4444-8444-444444444444"
		first := []MenuModifierGroup{{Label: "Spice", MaxChoices: 1,
			Options: []MenuModifierOption{{Label: "Hot", ExtraPrice: "2.5", Saleable: true}}}}
		var original MenuModifierRevision
		assertCounts := func(t *testing.T, want int) {
			t.Helper()
			var revisions, audits int
			err := admin.QueryRow(ctx, `SELECT (SELECT count(*) FROM restaurant_menu_revisions WHERE organization_id=$1),
			 (SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='restaurant.menu.modifiers_saved')`, org).Scan(&revisions, &audits)
			if err != nil || revisions != want || audits != want {
				t.Fatalf("revision/audit count=%d/%d, want %d/%d: %v", revisions, audits, want, want, err)
			}
		}
		if !t.Run("owner write and replay", func(t *testing.T) {
			saved, err := service.SaveMenuModifierGroups(proof.Context, user, org, variant, firstKey, 0, first)
			if err != nil || saved.Revision != 1 || len(saved.Groups) != 2 {
				t.Fatalf("save: %v, %v", saved, err)
			}
			original = saved
			replay, err := service.SaveMenuModifierGroups(proof.Context, user, org, variant, firstKey, 0, first)
			if err != nil || !reflect.DeepEqual(replay, saved) {
				t.Fatalf("replay: %v, %v", replay, err)
			}
			changes := append([]MenuModifierGroup(nil), first...)
			changes[0].Label = "Changed"
			if _, err = service.SaveMenuModifierGroups(proof.Context, user, org, variant, firstKey, 0, changes); !errors.Is(err, ErrConflict) {
				t.Fatalf("changed replay: %v", err)
			}
			if _, err = service.SaveMenuModifierGroups(proof.Context, user, org, variant, "55555555-5555-4555-8555-555555555555", 0, changes); !errors.Is(err, ErrConflict) {
				t.Fatalf("stale revision: %v", err)
			}
			assertCounts(t, 1)
		}) {
			t.FailNow()
		}
		if !t.Run("audit failure rolls back and permits retry", func(t *testing.T) {
			const key = "66666666-6666-4666-8666-666666666666"
			changes := []MenuModifierGroup{{Label: "Sauce", MaxChoices: 1,
				Options: []MenuModifierOption{{Label: "Mild", ExtraPrice: "1.25", Saleable: true}}}}
			_, err := admin.Exec(ctx, `ALTER TABLE organization_audit_events ADD CONSTRAINT modifier_fixture_reject_audit
				CHECK (event_type <> 'restaurant.menu.modifiers_saved') NOT VALID`)
			if err != nil {
				t.Fatal(err)
			}
			failed, saveErr := service.SaveMenuModifierGroups(proof.Context, user, org, variant, key, 1, changes)
			if _, err := admin.Exec(ctx, "ALTER TABLE organization_audit_events DROP CONSTRAINT modifier_fixture_reject_audit"); err != nil {
				t.Fatal(err)
			}
			if saveErr == nil || !reflect.DeepEqual(failed, MenuModifierRevision{}) {
				t.Fatalf("audit failure returned %v, %v", failed, saveErr)
			}
			got, err := service.MenuModifierGroups(proof.Context, user, org, variant)
			if err != nil || !reflect.DeepEqual(got, original.Groups) {
				t.Fatalf("modifier projection after rollback: %v, %v", got, err)
			}
			assertCounts(t, 1)
			retry, err := service.SaveMenuModifierGroups(proof.Context, user, org, variant, key, 1, changes)
			if err != nil || retry.Revision != 2 || len(retry.Groups) != 3 {
				t.Fatalf("retry after rollback: %v, %v", retry, err)
			}
			assertCounts(t, 2)
		}) {
			t.FailNow()
		}
		t.Run("competing writes and historical replay", func(t *testing.T) {
			type writeResult struct {
				label string
				saved MenuModifierRevision
				err   error
			}
			start := make(chan struct{})
			results := make(chan writeResult, 2)
			for i, key := range []string{"77777777-7777-4777-8777-777777777777", "88888888-8888-4888-8888-888888888888"} {
				label := []string{"Garnish", "Topping"}[i]
				go func() {
					<-start
					changes := []MenuModifierGroup{{Label: label, MaxChoices: 1,
						Options: []MenuModifierOption{{Label: "Add", ExtraPrice: "0", Saleable: true}}}}
					saved, err := service.SaveMenuModifierGroups(proof.Context, user, org, variant, key, 2, changes)
					results <- writeResult{label, saved, err}
				}()
			}
			close(start)
			var winner, loser string
			for range 2 {
				got := <-results
				switch {
				case got.err == nil && got.saved.Revision == 3 && len(got.saved.Groups) == 4:
					winner = got.label
				case errors.Is(got.err, ErrConflict) && reflect.DeepEqual(got.saved, MenuModifierRevision{}):
					loser = got.label
				default:
					t.Errorf("competing write: %v, %v", got.saved, got.err)
				}
			}
			if winner == "" || loser == "" {
				t.Fatalf("want one winner and one conflict, got %q and %q", winner, loser)
			}
			got, err := service.MenuModifierGroups(proof.Context, user, org, variant)
			labels := make(map[string]bool, len(got))
			for _, group := range got {
				labels[group.Label] = true
			}
			if err != nil || len(got) != 4 || !labels[winner] || labels[loser] {
				t.Fatalf("competing writes left unexpected projection: %v, %v", got, err)
			}
			replay, err := service.SaveMenuModifierGroups(proof.Context, user, org, variant, firstKey, 0, first)
			if err != nil || !reflect.DeepEqual(replay, original) {
				t.Fatalf("historical replay: %v, %v", replay, err)
			}
			assertCounts(t, 3)
		})
		t.Run("organization setup shares menu revision", func(t *testing.T) {
			var categoryID, category string
			if err := admin.QueryRow(ctx, `SELECT c.id::text,c.name FROM restaurant_menu_items m
			  JOIN products p ON p.organization_id=m.organization_id AND p.id=m.product_id
			  JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
			  WHERE m.organization_id=$1 AND m.variant_id=$2`, org, variant).Scan(&categoryID, &category); err != nil {
				t.Fatal(err)
			}
			if _, err := admin.Exec(ctx, "INSERT INTO restaurant_menu_categories(organization_id,category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", org, categoryID); err != nil {
				t.Fatal(err)
			}
			choices, err := service.MenuModifierGroups(proof.Context, user, org, variant)
			if err != nil {
				t.Fatal(err)
			}
			const key = "99999999-9999-4999-8999-999999999999"
			input := SetupMenuInput{
				Categories: []SetupCategoryInput{{ID: categoryID, Name: category}},
				Items:      []SetupMenuItemInput{{VariantID: variant, CategoryID: categoryID, Category: category, Name: "Updated dish", Price: "88.25"}},
			}
			for range 2 {
				if _, err := service.SaveMenu(proof.Context, user, org, key, input); err != nil {
					t.Fatalf("organization setup save or replay: %v", err)
				}
			}
			var revision int64
			var history, audits int
			if err := admin.QueryRow(ctx, `SELECT COALESCE(max(revision),0),
			  count(*) FILTER (WHERE revision=4 AND actor_id=$3
			    AND jsonb_path_exists(after_state, '$.items[*] ? (@.variant_id == $variant && @.price == "88.25")', jsonb_build_object('variant',$2::text))
			    AND NOT jsonb_path_exists(before_state, '$.items[*] ? (@.variant_id == $variant && @.price == "88.25")', jsonb_build_object('variant',$2::text))),
			  (SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='RESTAURANT_SETUP_MENU')
			  FROM restaurant_menu_revisions WHERE organization_id=$1`, org, variant, user).Scan(&revision, &history, &audits); err != nil || revision != 4 || history != 1 || audits != 1 {
				t.Fatalf("organization setup revision=%d history=%d audits=%d: %v", revision, history, audits, err)
			}
			got, err := service.MenuModifierGroups(proof.Context, user, org, variant)
			if err != nil || !reflect.DeepEqual(got, choices) {
				t.Fatalf("setup did not preserve modifier choices: %v, %v", got, err)
			}
			if _, err = service.SaveMenuModifierGroups(proof.Context, user, org, variant, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 3, first); !errors.Is(err, ErrConflict) {
				t.Fatalf("a setup price edit did not invalidate an older revision: %v", err)
			}
		})
		t.Run("retained branch setup tracks only shared menu changes", func(t *testing.T) {
			const branch = "abababab-abab-4bab-8bab-abababababab"
			if _, err := admin.Exec(ctx, "INSERT INTO branches(id,organization_id,code,name) VALUES($1,$2,'BRANCH','Synthetic branch')", branch, org); err != nil {
				t.Fatal(err)
			}
			const branchOnlyKey = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
			branchOnly := SetupMenuInput{
				BranchID:   branch,
				Categories: []SetupCategoryInput{{Name: "Branch only"}},
				Items:      []SetupMenuItemInput{{Category: "Branch only", Name: "Branch dish", Price: "41.00"}},
			}
			if _, err := service.SaveMenu(proof.Context, user, org, branchOnlyKey, branchOnly); err != nil {
				t.Fatalf("branch-only save: %v", err)
			}
			readRevision := func() int {
				t.Helper()
				var revision int
				if err := admin.QueryRow(ctx, "SELECT COALESCE(max(revision),0) FROM restaurant_menu_revisions WHERE organization_id=$1", org).Scan(&revision); err != nil {
					t.Fatal(err)
				}
				return revision
			}
			if got := readRevision(); got != 4 {
				t.Fatalf("branch-only save changed shared revision to %d", got)
			}
			var categoryID, category string
			if err := admin.QueryRow(ctx, `SELECT c.id::text,c.name FROM restaurant_menu_items m
			  JOIN products p ON p.organization_id=m.organization_id AND p.id=m.product_id
			  JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
			  WHERE m.organization_id=$1 AND m.variant_id=$2`, org, variant).Scan(&categoryID, &category); err != nil {
				t.Fatal(err)
			}
			choices, err := service.MenuModifierGroups(proof.Context, user, org, variant)
			if err != nil {
				t.Fatal(err)
			}
			const sharedKey = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
			shared := SetupMenuInput{
				BranchID:   branch,
				Categories: []SetupCategoryInput{{ID: categoryID, Name: category}},
				Items:      []SetupMenuItemInput{{VariantID: variant, CategoryID: categoryID, Category: category, Name: "Retained menu dish", Price: "95.50"}},
			}
			for range 2 {
				if _, err := service.SaveMenu(proof.Context, user, org, sharedKey, shared); err != nil {
					t.Fatalf("shared branch save or replay: %v", err)
				}
			}
			if got := readRevision(); got != 5 {
				t.Fatalf("shared branch save and replay produced revision %d, want 5", got)
			}
			var beforePrice, afterPrice string
			if err := admin.QueryRow(ctx, `SELECT
			  jsonb_path_query_first(before_state, '$.items[*] ? (@.variant_id == $variant).price', jsonb_build_object('variant',$2::text)) #>> '{}',
			  jsonb_path_query_first(after_state, '$.items[*] ? (@.variant_id == $variant).price', jsonb_build_object('variant',$2::text)) #>> '{}'
			  FROM restaurant_menu_revisions WHERE organization_id=$1 AND revision=5`, org, variant).Scan(&beforePrice, &afterPrice); err != nil || beforePrice != "88.25" || afterPrice != "95.50" {
				t.Fatalf("shared branch history %q -> %q: %v", beforePrice, afterPrice, err)
			}
			got, err := service.MenuModifierGroups(proof.Context, user, org, variant)
			if err != nil || !reflect.DeepEqual(got, choices) {
				t.Fatalf("retained setup did not preserve choices: %v, %v", got, err)
			}
		})
		t.Run("catalog variant changes share the menu revision", func(t *testing.T) {
			catalogService := &catalog.Service{Organization: service.Organization}
			save := func(sku string, selling, cost string) (catalog.Variant, error) {
				t.Helper()
				var product, id string
				var input catalog.VariantInput
				if err := admin.QueryRow(ctx, `SELECT product_id::text,id::text,sku,name,unit_id::text,status,revision
				 FROM product_variants WHERE organization_id=$1 AND sku=$2`, org, sku).Scan(&product, &id, &input.SKU, &input.Name, &input.UnitID, &input.Status, &input.Revision); err != nil {
					t.Fatal(err)
				}
				input.SellingPrice, input.CostPrice = selling, cost
				return catalogService.SaveVariant(proof.Context, user, org, product, id, input)
			}
			if _, err := admin.Exec(ctx, `ALTER TABLE organization_audit_events ADD CONSTRAINT modifier_fixture_reject_catalog_audit
			 CHECK (event_type <> 'catalog.variant.saved') NOT VALID`); err != nil {
				t.Fatal(err)
			}
			failed, saveErr := save("A", "98.75", "0.00")
			if _, err := admin.Exec(ctx, "ALTER TABLE organization_audit_events DROP CONSTRAINT modifier_fixture_reject_catalog_audit"); err != nil {
				t.Fatal(err)
			}
			if saveErr == nil || !reflect.DeepEqual(failed, catalog.Variant{}) {
				t.Fatalf("failed audit returned a variant or no error: %v, %v", failed, saveErr)
			}
			for _, edit := range [][3]string{{"A", "96.75", "0.00"}, {"A", "96.75", "1.00"}, {"B", "97.00", "0.00"}} {
				if _, err := save(edit[0], edit[1], edit[2]); err != nil {
					t.Fatal(err)
				}
			}
			var revision int
			var before, after string
			if err := admin.QueryRow(ctx, `SELECT revision,COALESCE(before_state->>'selling_price',''),COALESCE(after_state->>'selling_price','')
			 FROM restaurant_menu_revisions WHERE organization_id=$1 ORDER BY revision DESC LIMIT 1`, org).Scan(&revision, &before, &after); err != nil || revision != 6 || before != "95.50" || after != "96.75" {
				t.Fatalf("catalog menu revision %d price %q -> %q: %v", revision, before, after, err)
			}
		})
		t.Run("catalog product and taxonomy share the menu revision", func(t *testing.T) {
			catalogService := &catalog.Service{Organization: service.Organization}
			var product, category, unit, unitCode string
			var productRev, categoryRev, unitRev int
			if err := admin.QueryRow(ctx, `SELECT p.id::text,c.id::text,u.id::text,u.code,p.revision,c.revision,u.revision
			 FROM product_variants v JOIN products p ON p.organization_id=v.organization_id AND p.id=v.product_id
			 JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
			 JOIN units u ON u.organization_id=v.organization_id AND u.id=v.unit_id
			 WHERE v.organization_id=$1 AND v.id=$2`, org, variant).Scan(&product, &category, &unit, &unitCode, &productRev, &categoryRev, &unitRev); err != nil {
				t.Fatal(err)
			}
			input := catalog.ProductInput{Name: "Catalog menu dish", CategoryID: &category, Status: "ACTIVE", Revision: productRev}
			saved, err := catalogService.UpdateProduct(proof.Context, user, org, product, input)
			if err != nil {
				t.Fatal(err)
			}
			input.Revision, input.Description = saved.Revision, "Only the private description changed"
			if _, err = catalogService.UpdateProduct(proof.Context, user, org, product, input); err != nil {
				t.Fatal(err)
			}
			if _, err = catalogService.SaveTaxonomy(proof.Context, user, org, "categories", category, catalog.TaxonomyInput{Name: "Catalog category", Revision: categoryRev}); err != nil {
				t.Fatal(err)
			}
			if _, err = catalogService.SaveTaxonomy(proof.Context, user, org, "units", unit, catalog.TaxonomyInput{Name: "Catalog unit", Revision: unitRev, Code: unitCode, UnitType: "COUNT"}); err != nil {
				t.Fatal(err)
			}
			if err := admin.QueryRow(ctx, "SELECT id::text,code,revision FROM units WHERE organization_id=$1 AND code='B'", org).Scan(&unit, &unitCode, &unitRev); err != nil {
				t.Fatal(err)
			}
			if _, err = catalogService.SaveTaxonomy(proof.Context, user, org, "units", unit, catalog.TaxonomyInput{Name: "Unit outside the menu", Revision: unitRev, Code: unitCode, UnitType: "COUNT"}); err != nil {
				t.Fatal(err)
			}
			var revision int
			var changes string
			if err := admin.QueryRow(ctx, `SELECT max(revision),
			 COALESCE(string_agg(after_state->>'name', ',' ORDER BY revision) FILTER (WHERE revision>6 AND before_state->>'name' <> after_state->>'name'),'')
			 FROM restaurant_menu_revisions WHERE organization_id=$1`, org).Scan(&revision, &changes); err != nil || revision != 9 || changes != "Catalog menu dish,Catalog category,Catalog unit" {
				t.Fatalf("catalog product and taxonomy revision %d changes %q: %v", revision, changes, err)
			}
		})
		t.Run("catalog import commits one revision for a batch", func(t *testing.T) {
			if _, err := admin.Exec(ctx, `INSERT INTO restaurant_menu_categories(organization_id,category_id)
			 SELECT p.organization_id,p.category_id FROM products p JOIN product_variants v
			 ON v.organization_id=p.organization_id AND v.product_id=p.id WHERE p.organization_id=$1 AND v.sku='B'`, org); err != nil {
				t.Fatal(err)
			}
			catalogService := &catalog.Service{Organization: service.Organization}
			csv := "product_name,sku,unit,cost_price,selling_price\nImported A,A,A,1.00,101.25\nImported B,B,B,0.00,102.50\n"
			job, err := catalogService.PreviewImport(proof.Context, user, org, "menu.csv", []byte(csv), nil)
			if err != nil || job.Valid != 2 {
				t.Fatalf("preview: %v, %v", job, err)
			}
			assertRevision := func(want int) {
				t.Helper()
				var got int
				if err := admin.QueryRow(ctx, "SELECT max(revision) FROM restaurant_menu_revisions WHERE organization_id=$1", org).Scan(&got); err != nil || got != want {
					t.Fatalf("menu revision %d, want %d: %v", got, want, err)
				}
			}
			assertRevision(9)
			if _, err = admin.Exec(ctx, `ALTER TABLE organization_audit_events ADD CONSTRAINT modifier_fixture_reject_import_audit
			 CHECK (event_type <> 'catalog.import.completed') NOT VALID`); err != nil {
				t.Fatal(err)
			}
			failed, applyErr := catalogService.ConfirmImport(proof.Context, user, org, job.ID, "UPDATE")
			if _, err = admin.Exec(ctx, "ALTER TABLE organization_audit_events DROP CONSTRAINT modifier_fixture_reject_import_audit"); err != nil {
				t.Fatal(err)
			}
			if applyErr == nil || failed.ID != "" {
				t.Fatalf("failed apply returned %v, %v", failed, applyErr)
			}
			assertRevision(9)
			for range 2 {
				completed, err := catalogService.ConfirmImport(proof.Context, user, org, job.ID, "UPDATE")
				if err != nil || completed.Status != "COMPLETED" || completed.Result == nil || completed.Result.Updated != 2 {
					t.Fatalf("apply/replay: %v, %v", completed, err)
				}
			}
			assertRevision(10)
			var before, after string
			if err = admin.QueryRow(ctx, `SELECT
			 (SELECT string_agg(x->>'selling_price',',' ORDER BY x->>'sku') FROM jsonb_array_elements(before_state->'items') x),
			 (SELECT string_agg(x->>'selling_price',',' ORDER BY x->>'sku') FROM jsonb_array_elements(after_state->'items') x)
			 FROM restaurant_menu_revisions WHERE organization_id=$1 AND revision=10`, org).Scan(&before, &after); err != nil || before != "96.75,97.00" || after != "101.25,102.50" {
				t.Fatalf("batch price history %q -> %q: %v", before, after, err)
			}
		})
		t.Run("variant recall advances shared revision once", func(t *testing.T) {
			stock := &inventory.Service{Organization: service.Organization}
			if _, err := stock.SaveBatch(proof.Context, user, org, "", "12121212-1212-4212-8212-121212121212",
				inventory.BatchInput{VariantID: variant, LotNumber: "SYNTHETIC", Status: "ACTIVE", Reason: "Acceptance fixture"}); err != nil {
				t.Fatal(err)
			}
			var batch string
			if err := admin.QueryRow(ctx, "SELECT id::text FROM product_batches WHERE organization_id=$1 AND variant_id=$2 AND lot_number='SYNTHETIC'", org, variant).Scan(&batch); err != nil {
				t.Fatal(err)
			}
			assertRevision := func(want int) {
				t.Helper()
				var got int
				if err := admin.QueryRow(ctx, "SELECT max(revision) FROM restaurant_menu_revisions WHERE organization_id=$1", org).Scan(&got); err != nil || got != want {
					t.Fatalf("recall revision %d, want %d: %v", got, want, err)
				}
			}
			input := inventory.RecallInput{VariantID: variant, BatchID: &batch, Reason: "Synthetic recall"}
			if _, err := stock.CreateRecall(proof.Context, user, org, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", input); err != nil {
				t.Fatal(err)
			}
			assertRevision(10)
			input.BatchID = nil
			const key = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
			if _, err := admin.Exec(ctx, `ALTER TABLE organization_audit_events ADD CONSTRAINT modifier_fixture_reject_recall_audit
			 CHECK (event_type <> 'quality.recall.activated') NOT VALID`); err != nil {
				t.Fatal(err)
			}
			failed, recallErr := stock.CreateRecall(proof.Context, user, org, key, input)
			if _, err := admin.Exec(ctx, "ALTER TABLE organization_audit_events DROP CONSTRAINT modifier_fixture_reject_recall_audit"); err != nil {
				t.Fatal(err)
			}
			if recallErr == nil || len(failed) != 0 {
				t.Fatalf("failed recall: %v, %v", failed, recallErr)
			}
			assertRevision(10)
			saved, err := stock.CreateRecall(proof.Context, user, org, key, input)
			if err != nil {
				t.Fatal(err)
			}
			again, err := stock.CreateRecall(proof.Context, user, org, key, input)
			if err != nil || !bytes.Equal(saved, again) {
				t.Fatalf("recall replay: %v, %v", again, err)
			}
			if _, err = stock.CreateRecall(proof.Context, user, org, "ffffffff-ffff-4fff-8fff-ffffffffffff", input); err != nil {
				t.Fatal(err)
			}
			assertRevision(11)
			var before, after string
			var recalls int
			if err = admin.QueryRow(ctx, `SELECT before_state->>'recalled',after_state->>'recalled',
			 (SELECT count(*) FROM quality_recalls WHERE organization_id=$1 AND variant_id=$2 AND batch_id IS NULL)
			 FROM restaurant_menu_revisions WHERE organization_id=$1 AND revision=11`, org, variant).Scan(&before, &after, &recalls); err != nil || before != "false" || after != "true" || recalls != 2 {
				t.Fatalf("recall history %q -> %q, %d records: %v", before, after, recalls, err)
			}
		})
		t.Run("modifier edits serialize with retained setup and import", func(t *testing.T) {
			var branch, categoryID, category string
			if err := admin.QueryRow(ctx, `SELECT b.id::text,c.id::text,c.name FROM product_variants v
			 JOIN products p ON p.organization_id=v.organization_id AND p.id=v.product_id
			 JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
			 JOIN branches b ON b.organization_id=v.organization_id
			 WHERE v.organization_id=$1 AND v.id=$2`, org, variant).Scan(&branch, &categoryID, &category); err != nil {
				t.Fatal(err)
			}
			setupInput := SetupMenuInput{BranchID: branch,
				Categories: []SetupCategoryInput{{ID: categoryID, Name: category}},
				Items:      []SetupMenuItemInput{{VariantID: variant, Category: category, CategoryID: categoryID, Name: "Concurrent setup", Price: "110.25"}},
			}
			catalogService := &catalog.Service{Organization: service.Organization}
			const setupKey = "13131313-1313-4313-8313-131313131313"
			runRace := func(t *testing.T, modifierFirst bool, expected int64, key, label, price string, write func() error) {
				t.Helper()
				before, err := service.MenuModifierGroups(proof.Context, user, org, variant)
				if err != nil {
					t.Fatal(err)
				}
				blocker, err := admin.Begin(ctx)
				if err != nil {
					t.Fatal(err)
				}
				defer blocker.Rollback(ctx)
				if modifierFirst {
					_, err = blocker.Exec(ctx, "LOCK TABLE restaurant_menu_modifier_options IN ACCESS EXCLUSIVE MODE")
				} else {
					_, err = blocker.Exec(ctx, "SELECT id FROM product_variants WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, variant)
				}
				if err != nil {
					t.Fatal(err)
				}
				type result struct {
					saved MenuModifierRevision
					err   error
				}
				modified := make(chan result, 1)
				changes := []MenuModifierGroup{{Label: label, MaxChoices: 1,
					Options: []MenuModifierOption{{Label: "Choice", ExtraPrice: "0.00", Saleable: true}}}}
				startModifier := func() {
					saved, err := service.SaveMenuModifierGroups(proof.Context, user, org, variant, key, expected, changes)
					modified <- result{saved, err}
				}
				waitBlocked := func(indirect bool) {
					t.Helper()
					for {
						var blocked bool
						err := blocker.QueryRow(ctx, `SELECT EXISTS (
						 SELECT 1 FROM pg_stat_activity a WHERE
						  (NOT $1 AND pg_backend_pid()=ANY(pg_blocking_pids(a.pid))) OR
						  ($1 AND EXISTS (SELECT 1 FROM unnest(pg_blocking_pids(a.pid)) b(pid)
						    WHERE pg_backend_pid()=ANY(pg_blocking_pids(b.pid))))
						)`, indirect).Scan(&blocked)
						if err != nil {
							t.Fatal(err)
						}
						if blocked {
							return
						}
						select {
						case <-ctx.Done():
							t.Fatalf("did not observe expected lock wait (indirect=%v)", indirect)
						case <-time.After(15 * time.Millisecond):
						}
					}
				}
				written := make(chan error, 1)
				startWriter := func() { written <- write() }
				if modifierFirst {
					go startModifier()
					waitBlocked(false)
					go startWriter()
				} else {
					go startWriter()
					waitBlocked(false)
					go startModifier()
				}
				waitBlocked(true)
				if err = blocker.Rollback(ctx); err != nil {
					t.Fatal(err)
				}
				got := <-modified
				if err = <-written; err != nil {
					t.Fatal(err)
				}
				if err = write(); err != nil {
					t.Fatalf("writer replay: %v", err)
				}
				wantRevision, wantGroups := expected+1, before
				replayed, err := service.SaveMenuModifierGroups(proof.Context, user, org, variant, key, expected, changes)
				if modifierFirst {
					wantRevision, wantGroups = expected+2, got.saved.Groups
					if got.err != nil || got.saved.Revision != expected+1 {
						t.Fatalf("modifier commit: %v, %v", got.saved, got.err)
					}
					if err != nil || !reflect.DeepEqual(replayed, got.saved) {
						t.Fatalf("modifier replay: %v, %v", replayed, err)
					}
				} else if !errors.Is(got.err, ErrConflict) || !errors.Is(err, ErrConflict) ||
					!reflect.DeepEqual(got.saved, MenuModifierRevision{}) || !reflect.DeepEqual(replayed, MenuModifierRevision{}) {
					t.Fatalf("stale modifier returned data or wrong error: %v, %v; retry: %v, %v", got.saved, got.err, replayed, err)
				}
				current, err := service.ReadMenuModifierRevision(proof.Context, user, org, variant)
				if err != nil || current.Revision != wantRevision || current.VariantID != variant || !reflect.DeepEqual(current.Groups, wantGroups) {
					t.Fatalf("modifier projection after the race: %v, %v", current, err)
				}
				var revision int64
				var selling string
				if err = admin.QueryRow(ctx, `SELECT
				 (SELECT max(revision) FROM restaurant_menu_revisions WHERE organization_id=$1),
				 selling_price::text FROM product_variants WHERE organization_id=$1 AND id=$2`, org, variant).Scan(&revision, &selling); err != nil || revision != wantRevision || selling != price {
					t.Fatalf("shared state at revision %d, price %q: %v", revision, selling, err)
				}
			}
			if !t.Run("retained setup", func(t *testing.T) {
				runRace(t, true, 11, "14141414-1414-4414-8414-141414141414", "Concurrent setup group", "110.25", func() error {
					_, err := service.SaveMenu(proof.Context, user, org, setupKey, setupInput)
					return err
				})
			}) {
				return
			}
			if !t.Run("catalog import", func(t *testing.T) {
				csv := "product_name,sku,unit,cost_price,selling_price\nConcurrent import,A,A,1.00,120.25\n"
				job, err := catalogService.PreviewImport(proof.Context, user, org, "concurrent.csv", []byte(csv), nil)
				if err != nil || job.Valid != 1 {
					t.Fatalf("preview: %v, %v", job, err)
				}
				runRace(t, true, 13, "15151515-1515-4515-8515-151515151515", "Concurrent import group", "120.25", func() error {
					_, err := catalogService.ConfirmImport(proof.Context, user, org, job.ID, "UPDATE")
					return err
				})
			}) {
				return
			}
			if !t.Run("retained setup commits first", func(t *testing.T) {
				setupInput.Items[0].Price = "130.25"
				runRace(t, false, 15, "16161616-1616-4616-8616-161616161616", "Stale setup group", "130.25", func() error {
					_, err := service.SaveMenu(proof.Context, user, org, "17171717-1717-4717-8717-171717171717", setupInput)
					return err
				})
			}) {
				return
			}
			t.Run("catalog import commits first", func(t *testing.T) {
				csv := "product_name,sku,unit,cost_price,selling_price\nImport commits first,A,A,1.00,140.25\n"
				job, err := catalogService.PreviewImport(proof.Context, user, org, "first.csv", []byte(csv), nil)
				if err != nil || job.Valid != 1 {
					t.Fatalf("preview: %v, %v", job, err)
				}
				runRace(t, false, 16, "18181818-1818-4818-8818-181818181818", "Stale import group", "140.25", func() error {
					_, err := catalogService.ConfirmImport(proof.Context, user, org, job.ID, "UPDATE")
					return err
				})
			})
		})
		t.Run("interleaved restaurants keep separate menu histories", func(t *testing.T) {
			var otherOrg, otherItem string
			if err := admin.QueryRow(ctx, `SELECT m.organization_id::text,m.variant_id::text
			 FROM restaurant_menu_items m JOIN organizations o ON o.id=m.organization_id
			 WHERE o.code='AVL_B'`).Scan(&otherOrg, &otherItem); err != nil {
				t.Fatal(err)
			}
			const otherEmail = "fixture-second@example.test"
			var otherUser string
			if err := admin.QueryRow(ctx, `INSERT INTO users(id,email,email_normalized,password_hash,display_name,email_verified_at)
			 VALUES(gen_random_uuid(),$1,$1,$2,'Second synthetic owner',clock_timestamp()) RETURNING id::text`, otherEmail, hash).Scan(&otherUser); err != nil {
				t.Fatal(err)
			}
			if _, err := admin.Exec(ctx, "INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'OWNER')", otherOrg, otherUser); err != nil {
				t.Fatal(err)
			}
			otherProof := testsupport.EnrollMFA(t, ctx, identity.Handler{Service: accounts, MFA: mfa, Origins: []string{testsupport.MFAOrigin}}, otherEmail, password)
			blocker, err := admin.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer blocker.Rollback(ctx)
			if _, err = blocker.Exec(ctx, "SELECT id FROM organizations WHERE id=$1 FOR UPDATE", org); err != nil {
				t.Fatal(err)
			}
			const key = "19191919-1919-4919-8919-191919191919"
			changes := func(label string) []MenuModifierGroup {
				return []MenuModifierGroup{{Label: label, MaxChoices: 1,
					Options: []MenuModifierOption{{Label: "Choice", ExtraPrice: "0.00", Saleable: true}}}}
			}
			type result struct {
				value MenuModifierRevision
				err   error
			}
			done := make(chan result, 1)
			go func() {
				value, err := service.SaveMenuModifierGroups(proof.Context, user, org, variant, key, 17, changes("First restaurant"))
				done <- result{value, err}
			}()
			for {
				var waiting bool
				if err = blocker.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_stat_activity a
				 WHERE pg_backend_pid()=ANY(pg_blocking_pids(a.pid)))`).Scan(&waiting); err != nil {
					t.Fatal(err)
				}
				if waiting {
					break
				}
				select {
				case got := <-done:
					t.Fatalf("first restaurant returned before waiting: %v", got.err)
				case <-ctx.Done():
					t.Fatal(ctx.Err())
				case <-time.After(15 * time.Millisecond):
				}
			}
			other, err := service.SaveMenuModifierGroups(otherProof.Context, otherUser, otherOrg, otherItem, key, 0, changes("Second restaurant"))
			if err != nil || other.Revision != 1 || other.VariantID != otherItem {
				t.Fatalf("second restaurant could not commit independently: %v, %v", other, err)
			}
			if err = blocker.Rollback(ctx); err != nil {
				t.Fatal(err)
			}
			first := <-done
			if first.err != nil || first.value.Revision != 18 || first.value.VariantID != variant {
				t.Fatalf("first restaurant commit: %v, %v", first.value, first.err)
			}
			for _, scope := range []struct {
				ctx                       context.Context
				user                      string
				org, ownItem, foreignItem string
				expected                  int64
				label                     string
			}{{proof.Context, user, org, variant, otherItem, 18, "First restaurant"},
				{otherProof.Context, otherUser, otherOrg, otherItem, variant, 1, "Second restaurant"}} {
				if groups, err := service.MenuModifierGroups(scope.ctx, scope.user, scope.org, scope.foreignItem); !errors.Is(err, ErrNotFound) || groups != nil {
					t.Fatalf("foreign item returned %v, %v", groups, err)
				}
				if got, err := service.SaveMenuModifierGroups(scope.ctx, scope.user, scope.org, scope.foreignItem, key, scope.expected, changes(scope.label)); !errors.Is(err, ErrNotFound) || !reflect.DeepEqual(got, MenuModifierRevision{}) {
					t.Fatalf("foreign edit returned %v, %v", got, err)
				}
				auth, err := service.beginOrganizationSetup(scope.ctx, scope.user, scope.org)
				if err != nil {
					t.Fatal(err)
				}
				var revision int64
				var ownItem string
				var visible int
				err = auth.Tx.QueryRow(ctx, `SELECT revision,after_state->>'VariantID',count(*) OVER ()
				 FROM restaurant_menu_revisions WHERE idempotency_key=$1`, key).Scan(&revision, &ownItem, &visible)
				auth.Tx.Rollback(ctx)
				if err != nil || visible != 1 || revision != scope.expected || ownItem != scope.ownItem {
					t.Fatalf("scoped history: %d visible, revision %d, item %q: %v", visible, revision, ownItem, err)
				}
			}
		})
	}
	var cutoff time.Time
	if err = admin.QueryRow(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '2 seconds' WHERE id=$1 RETURNING expires_at", identity.SessionFromContext(proof.Context).ID).Scan(&cutoff); err != nil {
		t.Fatal(err)
	}
	blocker, err := admin.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer blocker.Rollback(ctx)
	if _, err = blocker.Exec(ctx, "LOCK TABLE restaurant_menu_modifier_options IN ACCESS EXCLUSIVE MODE"); err != nil {
		t.Fatal(err)
	}
	type result struct {
		menu MenuModifierRevision
		err  error
	}
	done := make(chan result, 1)
	go func() {
		menu, err := service.ReadMenuModifierRevision(proof.Context, user, org, variant)
		done <- result{menu, err}
	}()
	for {
		var blocked, expired bool
		if err = blocker.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pg_backend_pid()=ANY(pg_blocking_pids(pid))),clock_timestamp()>=$1`, cutoff).Scan(&blocked, &expired); err != nil {
			t.Fatal(err)
		}
		if blocked && expired {
			break
		}
		select {
		case got := <-done:
			t.Fatalf("read ended before the proven lock wait expired: %v", got.err)
		case <-ctx.Done():
			t.Fatal("did not observe an expired blocked read")
		case <-time.After(15 * time.Millisecond):
		}
	}
	if err = blocker.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-done:
		if !reflect.DeepEqual(got.menu, MenuModifierRevision{}) || !errors.Is(got.err, identity.ErrInvalidToken) {
			t.Fatalf("expired read returned data or the wrong error: %v, %v", got.menu, got.err)
		}
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
}
