package storefront_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/testsupport"
)

type catalogMutationOperation struct {
	name string
	run  func(context.Context, *catalog.Service, string, string) (any, error)
}

type catalogMutationEndTrace struct {
	trace   *privateReadTrace
	matched bool
}

func (trace *catalogMutationEndTrace) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	trace.matched = strings.HasPrefix(data.SQL, trace.trace.prefix)
	return ctx
}
func (trace *catalogMutationEndTrace) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryEndData) {
	if !trace.matched {
		return
	}
	trace.trace.remaining--
	if trace.trace.remaining == 0 {
		close(trace.trace.arrived)
		select {
		case <-trace.trace.release:
		case <-ctx.Done():
		}
	}
}

func catalogMutationRollbackAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, service *catalog.Service, owner, guest testsupport.MFASession, org string) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User.ID
	f := newCatalogMutationFixture(t, owner.Context, service, user, org, "ROLLBACK")
	if _, err := service.RegisterBarcode(owner.Context, user, org, f.product.ID, f.product.Variants[0].ID, catalog.BarcodeInput{Code: "ROLLBACK-SECOND", Symbology: "CODE128", Source: "ALIAS"}, false); err != nil {
		t.Fatal(err)
	}
	operations := catalogMutationOperations(f)
	for _, item := range []struct {
		index int
		table string
	}{{0, "categories"}, {6, "products"}, {7, "products"}, {8, "products"}, {9, "units"}, {10, "product_barcodes"}, {12, "product_barcodes"}, {13, "product_import_jobs"}, {14, "product_import_jobs"}} {
		for _, expiry := range []bool{true, false} {
			t.Run(fmt.Sprintf("%s lock expiry=%t", operations[item.index].name, expiry), func(t *testing.T) {
				before := catalogReadSnapshot(t, ctx, organizations, user, org)
				verifyPrivateReadWait(t, ctx, pool, owner, item.table, expiry, func(request context.Context) (any, error) {
					return operations[item.index].run(request, service, user, org)
				})
				if catalogReadSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("interrupted mutation retained business/audit effects")
				}
			})
		}
	}
	for _, item := range []struct {
		name, prefix string
		index, count int
	}{
		{"taxonomy written", "INSERT INTO categories", 0, 1},
		{"product inserted", "INSERT INTO products", 6, 1},
		{"product updated", "UPDATE products SET name", 7, 1},
		{"variant inserted", "INSERT INTO product_variants", 8, 1},
		{"variant updated", "UPDATE product_variants", 9, 1},
		{"primary demoted", "UPDATE product_barcodes SET is_primary=false", 10, 1},
		{"barcode inserted", "INSERT INTO product_barcodes", 10, 1},
		{"generated inserted", "INSERT INTO product_barcodes", 11, 1},
		{"barcode deleted", "DELETE FROM product_barcodes", 12, 1},
		{"barcode promoted", "UPDATE product_barcodes SET is_primary=true", 12, 1},
		{"preview inserted", "INSERT INTO product_import_jobs", 13, 1},
		{"job completed", "UPDATE product_import_jobs SET status='COMPLETED'", 14, 1},
		{"completion audited", "INSERT INTO organization_audit_events", 14, 1},
	} {
		for _, cancel := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s cancellation=%t", item.name, cancel), func(t *testing.T) {
				before := catalogReadSnapshot(t, ctx, organizations, user, org)
				catalogReadInterrupted(t, ctx, pool, owner, item.prefix, item.count, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
					return operations[item.index].run(request, traced, user, org)
				}, true)
				if catalogReadSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("partly written mutation survived rollback")
				}
			})
		}
	}
	catalogMutationImportAcceptance(t, ctx, pool, auth, organizations, service, owner, guest, org, f)
	catalogMutationDomainAcceptance(t, ctx, organizations, service, owner, guest, org, f)
}

func catalogMutationDomainAcceptance(t *testing.T, ctx context.Context, organizations *organization.Service, service *catalog.Service, owner, guest testsupport.MFASession, org string, f catalogMutationFixture) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User.ID
	deny := func(name string, want error, run func() (any, error)) {
		t.Helper()
		t.Run(name, func(t *testing.T) {
			before := catalogReadSnapshot(t, ctx, organizations, user, org)
			value, err := run()
			if !errors.Is(err, want) || !reflect.ValueOf(value).IsZero() || catalogReadSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("domain failure retained data/effects: %v", err)
			}
		})
	}
	v := f.product.Variants[0]
	deny("stale variant", catalog.ErrConflict, func() (any, error) {
		input := v.VariantInput
		input.Revision++
		return service.SaveVariant(owner.Context, user, org, f.product.ID, v.ID, input)
	})
	deny("immutable SKU", catalog.ErrConflict, func() (any, error) {
		input := v.VariantInput
		input.SKU += "CHANGED"
		return service.SaveVariant(owner.Context, user, org, f.product.ID, v.ID, input)
	})
	deny("duplicate SKU", catalog.ErrConflict, func() (any, error) {
		return service.SaveVariant(owner.Context, user, org, f.product.ID, "", v.VariantInput)
	})
	deny("last active variant", catalog.ErrConflict, func() (any, error) {
		input := v.VariantInput
		input.Status = "ARCHIVED"
		return service.SaveVariant(owner.Context, user, org, f.product.ID, v.ID, input)
	})
	deny("stale product", catalog.ErrConflict, func() (any, error) {
		input := f.product.ProductInput
		input.Revision++
		return service.UpdateProduct(owner.Context, user, org, f.product.ID, input)
	})
	deny("used unit type", catalog.ErrConflict, func() (any, error) {
		input := f.unit.TaxonomyInput
		input.UnitType = "WEIGHT"
		return service.SaveTaxonomy(owner.Context, user, org, "units", f.unit.ID, input)
	})
	deny("used unit archive", catalog.ErrConflict, func() (any, error) {
		input := f.unit.TaxonomyInput
		input.Status = "ARCHIVED"
		return service.SaveTaxonomy(owner.Context, user, org, "units", f.unit.ID, input)
	})
	deny("category self cycle", catalog.ErrConflict, func() (any, error) {
		input := f.category.TaxonomyInput
		input.ParentID = &f.category.ID
		return service.SaveTaxonomy(owner.Context, user, org, "categories", f.category.ID, input)
	})
	deny("incompatible base unit", catalog.ErrInput, func() (any, error) {
		return service.SaveTaxonomy(owner.Context, user, org, "units", "", catalog.TaxonomyInput{Name: "Invalid base", Code: "INVALIDBASE", Status: "ACTIVE", UnitType: "WEIGHT", BaseUnitID: &f.unit.ID, ConversionFactor: "2"})
	})
	other, err := organizations.CreateRestaurant(owner.Context, user, "df100000-0000-4000-8000-000000000002", organization.OrganizationInput{Name: "Foreign mutation fixture", BusinessType: "RESTAURANT"})
	if err != nil {
		t.Fatal(err)
	}
	otherID := other.Organization.ID
	otherUnit, err := service.SaveTaxonomy(owner.Context, user, otherID, "units", "", catalog.TaxonomyInput{Name: "Foreign unit", Code: "ROLLBACK", UnitType: "COUNT", Status: "ACTIVE"})
	if err != nil {
		t.Fatal(err)
	}
	otherProduct, err := service.CreateProduct(owner.Context, user, otherID, catalog.CreateInput{ProductInput: catalog.ProductInput{Name: "Foreign product", Status: "ACTIVE"}, Variants: []catalog.VariantInput{{SKU: "ROLLBACK", Name: "Default", UnitID: otherUnit.ID, CostPrice: "9.25", SellingPrice: "99.35", Status: "ACTIVE"}}})
	if err != nil {
		t.Fatal(err)
	}
	otherBefore := catalogReadSnapshot(t, ctx, organizations, user, otherID)
	deny("foreign unit reference", catalog.ErrInput, func() (any, error) {
		input := v.VariantInput
		input.UnitID = otherUnit.ID
		return service.SaveVariant(owner.Context, user, org, f.product.ID, v.ID, input)
	})
	deny("foreign product ID", catalog.ErrNotFound, func() (any, error) {
		return service.UpdateProduct(owner.Context, user, org, otherProduct.ID, otherProduct.ProductInput)
	})
	deny("foreign nested variant", catalog.ErrNotFound, func() (any, error) {
		return service.RegisterBarcode(owner.Context, user, org, f.product.ID, otherProduct.Variants[0].ID, catalog.BarcodeInput{Code: "FOREIGN", Symbology: "CODE128", Source: "ALIAS"}, false)
	})
	if catalogReadSnapshot(t, ctx, organizations, user, otherID) != otherBefore {
		t.Fatal("mutation changed foreign tenant")
	}
	mutateJob := func(creator string) {
		t.Helper()
		tx, _, err := organizations.Authorized(ctx, user, org, "catalog.import")
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		if _, err = tx.Exec(ctx, "UPDATE product_import_jobs SET created_by=$3 WHERE organization_id=$1 AND id=$2", org, f.job.ID, creator); err != nil {
			t.Fatal(err)
		}
		if err = tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
	}
	mutateJob(identity.SessionFromContext(guest.Context).User.ID)
	deny("foreign import creator", catalog.ErrNotFound, func() (any, error) { return service.ConfirmImport(owner.Context, user, org, f.job.ID, "CREATE") })
	mutateJob(user)
	t.Run("exact prices and primary promotion", func(t *testing.T) {
		input := v.VariantInput
		input.SellingPrice = "21.45"
		updated, err := service.SaveVariant(owner.Context, user, org, f.product.ID, v.ID, input)
		if err != nil || updated.CostPrice != "1.25" || updated.SellingPrice != "21.45" || updated.Revision != v.Revision+1 || updated.UnitID != f.unit.ID {
			t.Fatalf("variant exact values/revision changed: %v", err)
		}
		codes, err := service.DeleteBarcode(owner.Context, user, org, f.product.ID, v.ID, f.barcode.ID)
		if err != nil || !codes["removed"] {
			t.Fatalf("barcode delete: %v", err)
		}
		product, err := service.Product(owner.Context, user, org, f.product.ID)
		if err != nil || len(product.Variants[0].Barcodes) != 1 || !product.Variants[0].Barcodes[0].IsPrimary || product.Variants[0].Barcodes[0].Code != "ROLLBACK-SECOND" {
			t.Fatalf("primary promotion: %v", err)
		}
		for index := 1; index < 20; index++ {
			if _, err = service.RegisterBarcode(owner.Context, user, org, f.product.ID, v.ID, catalog.BarcodeInput{Code: fmt.Sprintf("LIMIT%02d", index), Symbology: "CODE128", Source: "ALIAS"}, false); err != nil {
				t.Fatal(err)
			}
		}
		deny("barcode limit", catalog.ErrConflict, func() (any, error) {
			return service.RegisterBarcode(owner.Context, user, org, f.product.ID, v.ID, catalog.BarcodeInput{Code: "LIMIT20", Symbology: "CODE128", Source: "ALIAS", IsPrimary: true}, false)
		})
	})
}

func catalogMutationImportAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, service *catalog.Service, owner, guest testsupport.MFASession, org string, f catalogMutationFixture) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User.ID
	t.Run("concurrent confirm and immutable replay", func(t *testing.T) {
		result := make(chan catalog.ImportJob, 2)
		failures := make(chan error, 2)
		for range 2 {
			go func() {
				job, err := service.ConfirmImport(owner.Context, user, org, f.job.ID, "CREATE")
				result <- job
				failures <- err
			}()
		}
		first, second := <-result, <-result
		for range 2 {
			if err := <-failures; err != nil {
				t.Fatal(err)
			}
		}
		if !reflect.DeepEqual(first, second) || first.Status != "COMPLETED" || first.Result == nil || first.Result.Imported != 1 {
			t.Fatal("concurrent confirm changed result")
		}
		before := catalogReadSnapshot(t, ctx, organizations, user, org)
		job, err := service.ConfirmImport(owner.Context, user, org, f.job.ID, "CREATE")
		if err != nil || !reflect.DeepEqual(job, first) {
			t.Fatalf("completed replay changed result: %v", err)
		}
		job, err = service.ConfirmImport(owner.Context, user, org, f.job.ID, "UPDATE")
		if !errors.Is(err, catalog.ErrConflict) || !reflect.ValueOf(job).IsZero() {
			t.Fatalf("conflicting replay disclosed job: %v", err)
		}
		if catalogReadSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatal("replay changed job/business/audit")
		}
		for _, cancel := range []bool{false, true} {
			catalogReadInterrupted(t, ctx, pool, owner, "SELECT id::text,status,rows,result,mode,expires_at", 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
				return traced.ConfirmImport(request, user, org, f.job.ID, "CREATE")
			}, true)
		}
		if catalogReadSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatal("interrupted replay changed job/business/audit")
		}
		tx, _, err := organizations.Authorized(ctx, user, org, "catalog.import")
		if err != nil {
			t.Fatal(err)
		}
		var count int
		err = tx.QueryRow(ctx, "SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND object_id=$2 AND event_type='catalog.import.completed'", org, f.job.ID).Scan(&count)
		tx.Rollback(ctx)
		if err != nil || count != 1 {
			t.Fatalf("duplicate completion audit: count=%d err=%v", count, err)
		}
	})
	t.Run("late import row rolls back prior rows", func(t *testing.T) {
		job, err := service.PreviewImport(owner.Context, user, org, "late.csv", []byte("product_name,sku,unit,cost_price,selling_price,barcode\nFirst,LATE-A,ROLLBACK,1.25,20.35,LATE-A\nSecond,LATE-B,ROLLBACK,2.25,30.35,LATE-B\n"), nil)
		if err != nil {
			t.Fatal(err)
		}
		before := catalogReadSnapshot(t, ctx, organizations, user, org)
		trace := &catalogMutationFailureTrace{prefix: "INSERT INTO product_barcodes", remaining: 2}
		config := pool.Config()
		config.ConnConfig.Tracer = trace
		tracedPool, err := pgxpool.NewWithConfig(ctx, config)
		if err != nil {
			t.Fatal(err)
		}
		value, err := (&catalog.Service{Organization: &organization.Service{Pool: tracedPool}}).ConfirmImport(owner.Context, user, org, job.ID, "CREATE")
		tracedPool.Close()
		if trace.remaining != 0 || trace.failure == nil || err == nil || !reflect.ValueOf(value).IsZero() || catalogReadSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("late import failure retained partial results/effects: %v", err)
		}
	})
	t.Run("import SKIP and UPDATE preserve modes and exact values", func(t *testing.T) {
		fixture := newCatalogMutationFixture(t, owner.Context, service, user, org, "MODES")
		router := chi.NewRouter()
		organization.Handler{Service: organizations, Authentication: auth}.Routes(router, catalog.Handler{Service: service}.TenantRoutes)
		_, token, csrf, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
		if err != nil {
			t.Fatal(err)
		}
		for _, mode := range []string{"SKIP", "UPDATE"} {
			job, err := service.PreviewImport(owner.Context, user, org, "modes.csv", []byte("product_name,sku,unit,cost_price,selling_price,barcode\nImported mode,MODES,MODES,2.25,30.35,MODES-ALIAS\n"), nil)
			if err != nil {
				t.Fatal(err)
			}
			before := catalogReadSnapshot(t, ctx, organizations, user, org)
			if mode == "UPDATE" {
				for _, prefix := range []string{"UPDATE product_variants", "UPDATE products SET name"} {
					for _, cancel := range []bool{false, true} {
						catalogReadInterrupted(t, ctx, pool, owner, prefix, 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
							return traced.ConfirmImport(request, user, org, job.ID, mode)
						}, true)
					}
				}
				if catalogReadSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("interrupted UPDATE retained imported effects")
				}
			}
			for _, candidate := range []struct {
				token, csrf, code string
				status            int
			}{{token, csrf, "MFA_REQUIRED", 403}, {owner.Token, "", "INVALID_CSRF", 403}, {owner.Token, owner.CSRF, "", 200}} {
				request := httptest.NewRequest(http.MethodPost, "/organizations/"+org+"/products/import/"+job.ID+"/confirm", strings.NewReader(`{"mode":"`+mode+`"}`)).WithContext(ctx)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: candidate.token})
				request.Header.Set("Origin", testsupport.MFAOrigin)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("X-CSRF-Token", candidate.csrf)
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				var body struct {
					Data  json.RawMessage
					Error struct{ Code string }
				}
				if err = json.Unmarshal(response.Body.Bytes(), &body); err != nil || response.Code != candidate.status || body.Error.Code != candidate.code || candidate.status != 200 && len(body.Data) != 0 {
					t.Fatalf("%s HTTP status=%d code=%s err=%v", mode, response.Code, body.Error.Code, err)
				}
				if candidate.status != 200 && catalogReadSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("mode HTTP denial changed state")
				}
			}
			result, err := service.ConfirmImport(owner.Context, user, org, job.ID, mode)
			if err != nil || result.Result == nil || result.Result.Total != 1 || mode == "SKIP" && result.Result.Skipped != 1 || mode == "UPDATE" && result.Result.Updated != 1 {
				t.Fatalf("import %s result: %v", mode, err)
			}
			product, err := service.Product(owner.Context, user, org, fixture.product.ID)
			wantCost, wantPrice, wantCodes := "1.25", "20.35", 1
			if mode == "UPDATE" {
				wantCost, wantPrice, wantCodes = "2.25", "30.35", 2
			}
			if err != nil || product.Variants[0].CostPrice != wantCost || product.Variants[0].SellingPrice != wantPrice || len(product.Variants[0].Barcodes) != wantCodes {
				t.Fatalf("import mode changed exact prices/barcodes: %v", err)
			}
			state := catalogReadSnapshot(t, ctx, organizations, user, org)
			replay, err := service.ConfirmImport(owner.Context, user, org, job.ID, mode)
			if err != nil || !reflect.DeepEqual(replay, result) || catalogReadSnapshot(t, ctx, organizations, user, org) != state {
				t.Fatalf("mode replay rewrote result/effects: %v", err)
			}
		}
	})
}

type catalogMutationFailureTrace struct {
	prefix    string
	remaining int
	failure   error
}

func (trace *catalogMutationFailureTrace) TraceQueryStart(ctx context.Context, connection *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	if strings.HasPrefix(data.SQL, trace.prefix) {
		trace.remaining--
		if trace.remaining == 0 {
			_, trace.failure = connection.Exec(ctx, "SELECT 1/0")
		}
	}
	return ctx
}
func (*catalogMutationFailureTrace) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {
}

type catalogMutationFixture struct {
	unit            catalog.Taxonomy
	product         catalog.Product
	barcode         catalog.Barcode
	job             catalog.ImportJob
	code            string
	category, brand catalog.Taxonomy
}

func newCatalogMutationFixture(t *testing.T, ctx context.Context, service *catalog.Service, user, org, code string) catalogMutationFixture {
	t.Helper()
	unit, err := service.SaveTaxonomy(ctx, user, org, "units", "", catalog.TaxonomyInput{Name: code + " unit", Code: code, UnitType: "COUNT", Status: "ACTIVE"})
	if err != nil {
		t.Fatal(err)
	}
	product, err := service.CreateProduct(ctx, user, org, catalog.CreateInput{ProductInput: catalog.ProductInput{Name: code + " product", Status: "ACTIVE"}, Variants: []catalog.VariantInput{{SKU: code, Name: "Default", UnitID: unit.ID, CostPrice: "1.25", SellingPrice: "20.35", Status: "ACTIVE"}}})
	if err != nil {
		t.Fatal(err)
	}
	barcode, err := service.RegisterBarcode(ctx, user, org, product.ID, product.Variants[0].ID, catalog.BarcodeInput{Code: code, Symbology: "CODE128", Source: "ALIAS", IsPrimary: true}, false)
	if err != nil {
		t.Fatal(err)
	}
	job, err := service.PreviewImport(ctx, user, org, "write.csv", []byte("product_name,sku,unit,cost_price,selling_price\nImported,"+code+"-IMPORT,"+code+",1.25,20.35\n"), nil)
	if err != nil {
		t.Fatal(err)
	}
	category, err := service.SaveTaxonomy(ctx, user, org, "categories", "", catalog.TaxonomyInput{Name: code + " category", Status: "ACTIVE"})
	if err != nil {
		t.Fatal(err)
	}
	brand, err := service.SaveTaxonomy(ctx, user, org, "brands", "", catalog.TaxonomyInput{Name: code + " brand", Status: "ACTIVE"})
	if err != nil {
		t.Fatal(err)
	}
	return catalogMutationFixture{unit: unit, product: product, barcode: barcode, job: job, code: code, category: category, brand: brand}
}

func catalogMutationOperations(fixture catalogMutationFixture) []catalogMutationOperation {
	operations := []catalogMutationOperation{}
	for _, kind := range []string{"categories", "brands", "units"} {
		input := catalog.TaxonomyInput{Name: fixture.code + " new " + kind, Status: "ACTIVE"}
		if kind == "units" {
			input.Code = fixture.code + "-NEW"
			input.UnitType = "COUNT"
		}
		operations = append(operations, catalogMutationOperation{kind + " create", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.SaveTaxonomy(c, u, o, kind, "", input)
		}})
	}
	updatedUnit := fixture.unit.TaxonomyInput
	updatedUnit.Name += " updated"
	operations = append(operations, catalogMutationOperation{"units update", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
		return s.SaveTaxonomy(c, u, o, "units", fixture.unit.ID, updatedUnit)
	}})
	for _, entry := range []struct {
		kind string
		item catalog.Taxonomy
	}{{"categories", fixture.category}, {"brands", fixture.brand}} {
		input := entry.item.TaxonomyInput
		input.Name += " updated"
		operations = append(operations, catalogMutationOperation{entry.kind + " update", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.SaveTaxonomy(c, u, o, entry.kind, entry.item.ID, input)
		}})
	}
	productInput := fixture.product.ProductInput
	productInput.Name += " updated"
	newVariant := fixture.product.Variants[0].VariantInput
	newVariant.SKU += "-NEW"
	newVariant.Revision = 0
	updatedVariant := fixture.product.Variants[0].VariantInput
	updatedVariant.SellingPrice = "21.45"
	return append(operations,
		catalogMutationOperation{"product create", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.CreateProduct(c, u, o, catalog.CreateInput{ProductInput: catalog.ProductInput{Name: fixture.code + " new product", Status: "ACTIVE"}, Variants: []catalog.VariantInput{newVariant}})
		}},
		catalogMutationOperation{"product update", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.UpdateProduct(c, u, o, fixture.product.ID, productInput)
		}},
		catalogMutationOperation{"variant create", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.SaveVariant(c, u, o, fixture.product.ID, "", newVariant)
		}},
		catalogMutationOperation{"variant update", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.SaveVariant(c, u, o, fixture.product.ID, fixture.product.Variants[0].ID, updatedVariant)
		}},
		catalogMutationOperation{"barcode register", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.RegisterBarcode(c, u, o, fixture.product.ID, fixture.product.Variants[0].ID, catalog.BarcodeInput{Code: fixture.code + "-NEW", Symbology: "CODE128", Source: "ALIAS", IsPrimary: true}, false)
		}},
		catalogMutationOperation{"barcode generate", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.RegisterBarcode(c, u, o, fixture.product.ID, fixture.product.Variants[0].ID, catalog.BarcodeInput{IsPrimary: true}, true)
		}},
		catalogMutationOperation{"barcode delete", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.DeleteBarcode(c, u, o, fixture.product.ID, fixture.product.Variants[0].ID, fixture.barcode.ID)
		}},
		catalogMutationOperation{"import preview", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.PreviewImport(c, u, o, "preview.csv", []byte("product_name,sku,unit,cost_price,selling_price\nNew,"+fixture.code+"-PREVIEW,"+fixture.code+",1.25,20.35\n"), nil)
		}},
		catalogMutationOperation{"import confirm", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.ConfirmImport(c, u, o, fixture.job.ID, "CREATE")
		}},
	)
}

func catalogMutationMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string) {
	t.Helper()
	service := &catalog.Service{Organization: organizations}
	user := identity.SessionFromContext(owner.Context).User.ID
	_, token, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, token)
	foreign := identity.SessionFromContext(guest.Context).User.ID
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, catalog.Handler{Service: service}.TenantRoutes)
	for index := 0; index < 15; index++ {
		fixture := newCatalogMutationFixture(t, owner.Context, service, user, org, fmt.Sprintf("WRITE%02d", index))
		operation := catalogMutationOperations(fixture)[index]
		t.Run(operation.name, func(t *testing.T) {
			before := catalogReadSnapshot(t, ctx, organizations, user, org)
			for _, candidate := range []struct {
				request context.Context
				want    error
			}{{context.Background(), identity.ErrInvalidToken}, {primary, identity.ErrMFARequired}, {guest.Context, identity.ErrInvalidToken}} {
				value, failure := operation.run(candidate.request, service, user, org)
				if !errors.Is(failure, candidate.want) || !reflect.ValueOf(value).IsZero() || catalogReadSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatalf("unassured catalog mutation retained data/effects: %v", failure)
				}
			}
			for _, status := range []string{"", "ACTIVE", "SUSPENDED"} {
				privateReadMembership(t, ctx, organizations, user, org, foreign, status)
				want := organization.ErrNotFound
				if status == "ACTIVE" {
					want = organization.ErrDenied
				}
				state := catalogReadSnapshot(t, ctx, organizations, user, org)
				value, failure := operation.run(guest.Context, service, foreign, org)
				if !errors.Is(failure, want) || !reflect.ValueOf(value).IsZero() || catalogReadSnapshot(t, ctx, organizations, user, org) != state {
					t.Fatalf("foreign/non-Owner mutation changed state: %v", failure)
				}
			}
			privateReadMembership(t, ctx, organizations, user, org, foreign, "")
			before = catalogReadSnapshot(t, ctx, organizations, user, org)
			pinned := &catalog.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
			value, failure := operation.run(owner.Context, pinned, user, org)
			if !errors.Is(failure, organization.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("pinned mutation crossed deployment: %v", failure)
			}
			method, path, body, contentType := catalogMutationRequest(t, fixture, operation.name)
			for _, candidate := range []struct {
				token, csrf, code string
				status            int
			}{
				{"", "", "UNAUTHENTICATED", 401},
				{token, identity.SessionFromContext(primary).CSRFToken, "MFA_REQUIRED", 403},
				{owner.Token, "", "INVALID_CSRF", 403},
				{owner.Token, owner.CSRF, "", 200},
			} {
				request := httptest.NewRequest(method, "/organizations/"+org+path, bytes.NewReader(body)).WithContext(ctx)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: candidate.token})
				request.Header.Set("Origin", testsupport.MFAOrigin)
				request.Header.Set("X-CSRF-Token", candidate.csrf)
				request.Header.Set("Content-Type", contentType)
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				var result struct {
					Data  json.RawMessage
					Error struct{ Code string }
				}
				failure := json.Unmarshal(response.Body.Bytes(), &result)
				wantStatus := candidate.status
				if candidate.status == 200 && method == http.MethodPost && !strings.HasSuffix(path, "/confirm") {
					wantStatus = 201
				}
				if failure != nil || response.Code != wantStatus || result.Error.Code != candidate.code || response.Header().Get("Cache-Control") != "no-store" || candidate.status != 200 && len(result.Data) != 0 {
					t.Fatalf("mutation HTTP status=%d code=%s want=%d/%s error=%v", response.Code, result.Error.Code, wantStatus, candidate.code, failure)
				}
				if candidate.status != 200 && catalogReadSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("HTTP denial committed mutation effects")
				}
			}
		})
	}
	catalogMutationRollbackAcceptance(t, ctx, pool, auth, organizations, service, owner, guest, org)
}

func catalogMutationRequest(t *testing.T, f catalogMutationFixture, name string) (string, string, []byte, string) {
	t.Helper()
	method, path := http.MethodPost, ""
	var input any
	parts := strings.Split(name, " ")
	if parts[0] == "categories" || parts[0] == "brands" || parts[0] == "units" {
		path = "/" + parts[0]
		item := map[string]catalog.Taxonomy{"categories": f.category, "brands": f.brand, "units": f.unit}[parts[0]]
		value := item.TaxonomyInput
		value.Name += " HTTP"
		if parts[1] == "update" {
			method = http.MethodPatch
			path += "/" + item.ID
		} else if parts[0] == "units" {
			value.Code += "-HTTP"
		}
		input = value
	} else {
		path = "/products/" + f.product.ID
		variant := f.product.Variants[0]
		switch name {
		case "product create":
			path = "/products"
			v := variant.VariantInput
			v.SKU += "-HTTP"
			input = catalog.CreateInput{ProductInput: catalog.ProductInput{Name: f.code + " HTTP", Status: "ACTIVE"}, Variants: []catalog.VariantInput{v}}
		case "product update":
			method = http.MethodPatch
			value := f.product.ProductInput
			value.Name += " HTTP"
			input = value
		case "variant create", "variant update":
			path += "/variants"
			value := variant.VariantInput
			value.SellingPrice = "21.45"
			if name == "variant update" {
				method = http.MethodPatch
				path += "/" + variant.ID
			} else {
				value.SKU += "-HTTP"
			}
			input = value
		case "barcode register", "barcode generate", "barcode delete":
			path += "/variants/" + variant.ID + "/barcodes"
			input = catalog.BarcodeInput{Code: f.code + "-HTTP", Symbology: "CODE128", Source: "ALIAS", IsPrimary: true}
			if name == "barcode generate" {
				path += "/generate"
				input = map[string]bool{"is_primary": true}
			}
			if name == "barcode delete" {
				method = http.MethodDelete
				path += "/" + f.barcode.ID
			}
		case "import confirm":
			path = "/products/import/" + f.job.ID + "/confirm"
			input = map[string]string{"mode": "CREATE"}
		case "import preview":
			var body bytes.Buffer
			writer := multipart.NewWriter(&body)
			part, err := writer.CreateFormFile("file", "http.csv")
			if err != nil {
				t.Fatal(err)
			}
			if _, err = part.Write([]byte("product_name,sku,unit,cost_price,selling_price\nHTTP," + f.code + "-HTTP," + f.code + ",1.25,20.35\n")); err != nil {
				t.Fatal(err)
			}
			if err = writer.Close(); err != nil {
				t.Fatal(err)
			}
			return method, "/products/import/preview", body.Bytes(), writer.FormDataContentType()
		}
	}
	encoded, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	return method, path, encoded, "application/json"
}
