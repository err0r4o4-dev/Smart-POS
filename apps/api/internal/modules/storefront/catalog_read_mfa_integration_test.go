package storefront_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/testsupport"
)

type catalogReadOperation struct {
	name, path string
	run        func(context.Context, *catalog.Service, string, string) (any, error)
}

func catalogReadMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string) {
	t.Helper()
	ctx = owner.Context
	service := &catalog.Service{Organization: organizations}
	user := identity.SessionFromContext(owner.Context).User.ID
	unit, err := service.SaveTaxonomy(ctx, user, org, "units", "", catalog.TaxonomyInput{Name: "Read unit", Code: "READ", UnitType: "COUNT", Status: "ACTIVE"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.CreateProduct(ctx, user, org, catalog.CreateInput{ProductInput: catalog.ProductInput{Name: "Second private product", Status: "ACTIVE"}, Variants: []catalog.VariantInput{{SKU: "CATALOG-PAGE", Name: "Page variant", UnitID: unit.ID, CostPrice: "3.25", SellingPrice: "40.35", Status: "ACTIVE"}}}); err != nil {
		t.Fatal(err)
	}
	product, err := service.CreateProduct(ctx, user, org, catalog.CreateInput{ProductInput: catalog.ProductInput{Name: "Private read product", Status: "ACTIVE"}, Variants: []catalog.VariantInput{{SKU: "CATALOG-READ", Name: "Read variant", UnitID: unit.ID, CostPrice: "1.25", SellingPrice: "20.35", Status: "ACTIVE"}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.SaveVariant(ctx, user, org, product.ID, "", catalog.VariantInput{SKU: "CATALOG-SECOND", Name: "Second private variant", UnitID: unit.ID, CostPrice: "2.25", SellingPrice: "30.35", Status: "ACTIVE"}); err != nil {
		t.Fatal(err)
	}
	barcode, err := service.RegisterBarcode(ctx, user, org, product.ID, product.Variants[0].ID, catalog.BarcodeInput{Code: "CATALOG-READ", Symbology: "CODE128", Source: "ALIAS", IsPrimary: true}, false)
	if err != nil {
		t.Fatal(err)
	}
	job, err := service.PreviewImport(ctx, user, org, "read.csv", []byte("product_name,sku,unit,cost_price,selling_price\nImport read,IMPORT-READ,READ,1.25,20.35\n"), nil)
	if err != nil {
		t.Fatal(err)
	}
	operations := []catalogReadOperation{
		{"categories", "/categories", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.Taxonomies(c, u, o, "categories", catalog.Filter{})
		}},
		{"brands", "/brands", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.Taxonomies(c, u, o, "brands", catalog.Filter{})
		}},
		{"units", "/units", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.Taxonomies(c, u, o, "units", catalog.Filter{})
		}},
		{"product", "/products/" + product.ID, func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.Product(c, u, o, product.ID)
		}},
		{"products", "/products", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.Products(c, u, o, catalog.Filter{})
		}},
		{"lookup", "/barcodes/lookup?code=" + barcode.Code, func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.Lookup(c, u, o, barcode.Code)
		}},
		{"import", "/products/import/" + job.ID, func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.ImportJob(c, u, o, job.ID)
		}},
		{"labels", "/products/" + product.ID + "/labels", func(c context.Context, s *catalog.Service, u, o string) (any, error) {
			return s.Labels(c, u, o, product.ID)
		}},
	}
	_, primaryToken, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	foreign := identity.SessionFromContext(guest.Context).User.ID
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	for _, operation := range operations {
		t.Run(operation.name, func(t *testing.T) {
			for _, candidate := range []struct {
				ctx  context.Context
				want error
			}{{context.Background(), identity.ErrInvalidToken}, {primary, identity.ErrMFARequired}, {guest.Context, identity.ErrInvalidToken}} {
				value, failure := operation.run(candidate.ctx, service, user, org)
				if !errors.Is(failure, candidate.want) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("catalog read disclosed data or wrong denial: %v", failure)
				}
			}
			value, failure := operation.run(guest.Context, service, foreign, org)
			if !errors.Is(failure, organization.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("foreign catalog read disclosed data: %v", failure)
			}
			for _, status := range []string{"ACTIVE", "SUSPENDED"} {
				privateReadMembership(t, ctx, organizations, user, org, foreign, status)
				want := organization.ErrDenied
				if status == "SUSPENDED" {
					want = organization.ErrNotFound
				}
				value, failure = operation.run(guest.Context, service, foreign, org)
				if !errors.Is(failure, want) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("non-Owner catalog read disclosed data: %v", failure)
				}
			}
			privateReadMembership(t, ctx, organizations, user, org, foreign, "")
			pinned := &catalog.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
			value, failure = operation.run(owner.Context, pinned, user, org)
			if !errors.Is(failure, organization.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("pinned catalog read crossed deployment: %v", failure)
			}
		})
	}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, catalog.Handler{Service: service}.TenantRoutes)
	paths := []string{"/products/" + product.ID + "/variants"}
	for _, operation := range operations {
		paths = append(paths, operation.path)
	}
	for _, path := range paths {
		t.Run("HTTP"+path, func(t *testing.T) {
			for _, candidate := range []struct {
				token, code string
				status      int
			}{{"", "UNAUTHENTICATED", 401}, {primaryToken, "MFA_REQUIRED", 403}, {owner.Token, "", 200}} {
				request := httptest.NewRequest(http.MethodGet, "/organizations/"+org+path, nil).WithContext(ctx)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: candidate.token})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				var body struct {
					Data  json.RawMessage
					Error struct{ Code string }
				}
				if failure := json.Unmarshal(response.Body.Bytes(), &body); failure != nil || response.Code != candidate.status || body.Error.Code != candidate.code || candidate.status != 200 && len(body.Data) != 0 || response.Header().Get("Cache-Control") != "no-store" {
					t.Fatalf("catalog HTTP status=%d code=%s want=%d/%s error=%v", response.Code, body.Error.Code, candidate.status, candidate.code, failure)
				}
				if candidate.status != 200 && strings.Contains(response.Body.String(), "Private read product") {
					t.Fatal("catalog error leaked private name")
				}
			}
		})
	}
	for _, candidate := range []struct {
		path   string
		status int
	}{
		{"/products?search=no-such-private-product", 200},
		{"/products/11111111-1111-4111-8111-111111111111", 404},
		{"/products/11111111-1111-4111-8111-111111111111/variants", 404},
		{"/products/11111111-1111-4111-8111-111111111111/labels", 404},
		{"/products/import/11111111-1111-4111-8111-111111111111", 404},
		{"/barcodes/lookup?code=ABSENT-CATALOG-CODE", 404},
	} {
		t.Run("HTTP empty or missing"+candidate.path, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/organizations/"+org+candidate.path, nil).WithContext(ctx)
			request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			var body struct {
				Data  json.RawMessage
				Error struct{ Code string }
			}
			if failure := json.Unmarshal(response.Body.Bytes(), &body); failure != nil || response.Code != candidate.status || response.Header().Get("Cache-Control") != "no-store" || candidate.status == 404 && (body.Error.Code != "NOT_FOUND" || len(body.Data) != 0) {
				t.Fatalf("catalog empty/missing status=%d want=%d error=%v", response.Code, candidate.status, failure)
			}
		})
	}
	before := catalogReadSnapshot(t, ctx, organizations, user, org)
	for index, operation := range operations {
		t.Run(operation.name+" business lock expiry", func(t *testing.T) {
			tables := []string{"categories", "brands", "units", "products", "products", "product_barcodes", "product_import_jobs", "products"}
			verifyPrivateReadWait(t, ctx, pool, owner, tables[index], true, func(request context.Context) (any, error) {
				return operation.run(request, service, user, org)
			})
		})
		t.Run(operation.name+" final cancellation", func(t *testing.T) {
			catalogReadInterrupted(t, ctx, pool, owner, "WITH decision AS MATERIALIZED", 3, true, func(request context.Context, traced *catalog.Service) (any, error) {
				return operation.run(request, traced, user, org)
			})
		})
	}
	for _, candidate := range []struct {
		name, prefix     string
		operation, count int
	}{
		{"taxonomy count", "SELECT count(*) FROM units", 2, 1},
		{"taxonomy projection", "SELECT id::text,organization_id::text,name,description", 2, 1},
		{"product projection", "SELECT p.id::text", 3, 1},
		{"product page count", "SELECT count(*) FROM products", 4, 1},
		{"product page projection", "SELECT p.id::text", 4, 1},
		{"second product variants", "SELECT id::text,organization_id::text,product_id::text,sku", 4, 2},
		{"second variant barcodes", "SELECT id::text,variant_id::text,code", 3, 2},
		{"lookup resolution", "SELECT v.product_id::text,v.id::text", 5, 1},
		{"lookup nested barcodes", "SELECT id::text,variant_id::text,code", 5, 2},
		{"import locked projection", "SELECT id::text,status,rows,result,mode,expires_at", 6, 1},
		{"labels nested barcodes", "SELECT id::text,variant_id::text,code", 7, 2},
		{"final assurance", "WITH decision AS MATERIALIZED", 3, 3},
	} {
		for _, cancel := range []bool{false, true} {
			name := candidate.name + " expiry"
			if cancel {
				name = candidate.name + " cancellation"
			}
			t.Run(name, func(t *testing.T) {
				catalogReadInterrupted(t, ctx, pool, owner, candidate.prefix, candidate.count, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
					return operations[candidate.operation].run(request, traced, user, org)
				})
			})
		}
	}
	if catalogReadSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatal("private catalog reads changed protected business state")
	}
	catalogReadIsolation(t, ctx, pool, organizations, service, owner, guest, org, product.ID, job.ID)
}

func catalogReadSnapshot(t *testing.T, ctx context.Context, organizations *organization.Service, user, org string) string {
	t.Helper()
	result := privateCatalogSnapshot(t, ctx, organizations, user, org)
	tx, _, err := organizations.Authorized(ctx, user, org, "catalog.read")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	for _, table := range []string{"brands", "product_barcodes", "product_import_jobs"} {
		var digest string
		if err = tx.QueryRow(ctx, "SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM "+table+" t WHERE organization_id=$1", org).Scan(&digest); err != nil {
			t.Fatal(err)
		}
		result += digest
	}
	return result
}

func catalogReadInterrupted(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner testsupport.MFASession, prefix string, count int, cancel bool, run func(context.Context, *catalog.Service) (any, error), after ...bool) {
	t.Helper()
	trace := &privateReadTrace{prefix: prefix, remaining: count, arrived: make(chan struct{}), release: make(chan struct{})}
	configuration := pool.Config()
	configuration.ConnConfig.Tracer = trace
	if len(after) > 0 && after[0] {
		configuration.ConnConfig.Tracer = &catalogMutationEndTrace{trace: trace}
	}
	tracedPool, err := pgxpool.NewWithConfig(ctx, configuration)
	if err != nil {
		t.Fatal(err)
	}
	defer tracedPool.Close()
	session := identity.SessionFromContext(owner.Context).ID
	var cutoff time.Time
	if !cancel {
		if err = pool.QueryRow(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at", session).Scan(&cutoff); err != nil {
			t.Fatal(err)
		}
		defer func() {
			if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", session); failure != nil {
				t.Error(failure)
			}
		}()
	}
	request, stop := context.WithCancel(owner.Context)
	defer stop()
	result := make(chan error, 1)
	go func() {
		value, failure := run(request, &catalog.Service{Organization: &organization.Service{Pool: tracedPool}})
		if !reflect.ValueOf(value).IsZero() {
			failure = errors.New("interrupted catalog returned partial private data or metadata")
		}
		result <- failure
	}()
	select {
	case <-trace.arrived:
	case <-time.After(5 * time.Second):
		stop()
		close(trace.release)
		<-result
		t.Fatal("catalog query boundary not reached")
	}
	if cancel {
		stop()
	} else {
		for {
			var elapsed bool
			if err = pool.QueryRow(ctx, "SELECT clock_timestamp()>=$1", cutoff).Scan(&elapsed); err != nil {
				stop()
				close(trace.release)
				<-result
				t.Fatal(err)
			}
			if elapsed {
				break
			}
			time.Sleep(10 * time.Millisecond)
		}
	}
	close(trace.release)
	want := identity.ErrInvalidToken
	if cancel {
		want = context.Canceled
	}
	if err = <-result; !errors.Is(err, want) {
		t.Fatalf("interrupted catalog outcome: %v", err)
	}
}

func catalogReadIsolation(t *testing.T, ctx context.Context, pool *pgxpool.Pool, organizations *organization.Service, service *catalog.Service, owner, guest testsupport.MFASession, org, productID, jobID string) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User.ID
	foreign := identity.SessionFromContext(guest.Context).User.ID
	other, err := organizations.CreateRestaurant(owner.Context, user, "df000000-0000-4000-8000-000000000002", organization.OrganizationInput{Name: "Other catalog", BusinessType: "RESTAURANT"})
	if err != nil {
		t.Fatal(err)
	}
	otherID := other.Organization.ID
	unit, err := service.SaveTaxonomy(ctx, user, otherID, "units", "", catalog.TaxonomyInput{Name: "Foreign unit", Code: "READ", UnitType: "COUNT", Status: "ACTIVE"})
	if err != nil {
		t.Fatal(err)
	}
	otherProduct, err := service.CreateProduct(ctx, user, otherID, catalog.CreateInput{ProductInput: catalog.ProductInput{Name: "Foreign product", Status: "ACTIVE"}, Variants: []catalog.VariantInput{{SKU: "CATALOG-READ", Name: "Foreign variant", UnitID: unit.ID, CostPrice: "9.25", SellingPrice: "99.35", Status: "ACTIVE"}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.RegisterBarcode(ctx, user, otherID, otherProduct.ID, otherProduct.Variants[0].ID, catalog.BarcodeInput{Code: "CATALOG-READ", Symbology: "CODE128", Source: "ALIAS"}, false); err != nil {
		t.Fatal(err)
	}
	before := catalogReadSnapshot(t, ctx, organizations, user, org)
	otherBefore := catalogReadSnapshot(t, ctx, organizations, user, otherID)
	for _, target := range []string{org, otherID} {
		value, failure := service.Lookup(owner.Context, user, target, "CATALOG-READ\r\n")
		want := productID
		if target == otherID {
			want = otherProduct.ID
		}
		if failure != nil || value.Product.ID != want || value.Product.OrganizationID != target || !value.Saleable {
			t.Fatalf("scoped barcode lookup: %v", failure)
		}
		for _, variant := range value.Product.Variants {
			if variant.OrganizationID != target || variant.ProductID != want {
				t.Fatal("foreign nested variant")
			}
			for _, barcode := range variant.Barcodes {
				if barcode.VariantID != variant.ID {
					t.Fatal("foreign nested barcode")
				}
			}
		}
	}
	for _, run := range []func(context.Context, *catalog.Service) (any, error){
		func(c context.Context, s *catalog.Service) (any, error) {
			return s.Product(c, user, otherID, productID)
		},
		func(c context.Context, s *catalog.Service) (any, error) { return s.Labels(c, user, otherID, productID) },
		func(c context.Context, s *catalog.Service) (any, error) { return s.ImportJob(c, user, otherID, jobID) },
		func(c context.Context, s *catalog.Service) (any, error) {
			return s.Lookup(c, user, org, "ABSENT-CATALOG-CODE")
		},
	} {
		value, failure := run(owner.Context, service)
		if !errors.Is(failure, catalog.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("foreign private object disclosed: %v", failure)
		}
		catalogReadInterrupted(t, ctx, pool, owner, "WITH decision AS MATERIALIZED", 3, false, run)
	}
	page, err := service.Products(owner.Context, user, org, catalog.Filter{PageSize: 1})
	if err != nil || page.Total != 2 || page.Page != 1 || page.PageSize != 1 || len(page.Items) != 1 || page.Items[0].ID != productID || len(page.Items[0].Variants) != 2 || page.Items[0].Variants[0].CostPrice != "1.25" || page.Items[0].Variants[0].SellingPrice != "20.35" {
		t.Fatalf("exact catalog page projection: %v", err)
	}
	empty, err := service.Products(owner.Context, user, org, catalog.Filter{Search: "no-such-private-product"})
	if err != nil || empty.Items == nil || len(empty.Items) != 0 || empty.Total != 0 || empty.Page != 1 {
		t.Fatalf("empty catalog projection: %v", err)
	}
	boundary, err := service.Products(owner.Context, user, org, catalog.Filter{Page: 3, PageSize: 1})
	if err != nil || boundary.Total != 2 || boundary.Items == nil || len(boundary.Items) != 0 {
		t.Fatalf("catalog page boundary: %v", err)
	}
	if catalogReadSnapshot(t, ctx, organizations, user, org) != before || catalogReadSnapshot(t, ctx, organizations, user, otherID) != otherBefore {
		t.Fatal("scoped reads changed business rows")
	}

	mutateJob := func(query string, args ...any) {
		t.Helper()
		tx, _, failure := organizations.Authorized(ctx, user, org, "catalog.import")
		if failure != nil {
			t.Fatal(failure)
		}
		defer tx.Rollback(ctx)
		if _, failure = tx.Exec(ctx, query, args...); failure != nil {
			t.Fatal(failure)
		}
		if failure = tx.Commit(ctx); failure != nil {
			t.Fatal(failure)
		}
	}
	mutateJob("UPDATE product_import_jobs SET created_by=$3 WHERE organization_id=$1 AND id=$2", org, jobID, foreign)
	value, failure := service.ImportJob(owner.Context, user, org, jobID)
	mutateJob("UPDATE product_import_jobs SET created_by=$3 WHERE organization_id=$1 AND id=$2", org, jobID, user)
	if !errors.Is(failure, catalog.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
		t.Fatalf("another user's import disclosed: %v", failure)
	}
	tx, _, err := organizations.Authorized(ctx, user, org, "catalog.import")
	if err != nil {
		t.Fatal(err)
	}
	var stored []byte
	err = tx.QueryRow(ctx, "SELECT rows FROM product_import_jobs WHERE organization_id=$1 AND id=$2", org, jobID).Scan(&stored)
	tx.Rollback(ctx)
	if err != nil {
		t.Fatal(err)
	}
	mutateJob("UPDATE product_import_jobs SET rows='[\"invalid-row\"]'::jsonb WHERE organization_id=$1 AND id=$2", org, jobID)
	value, failure = service.ImportJob(owner.Context, user, org, jobID)
	if !errors.Is(failure, catalog.ErrConflict) || !reflect.ValueOf(value).IsZero() {
		t.Fatalf("malformed import leaked partial job: %v", failure)
	}
	catalogReadInterrupted(t, ctx, pool, owner, "WITH decision AS MATERIALIZED", 3, false, func(request context.Context, traced *catalog.Service) (any, error) {
		return traced.ImportJob(request, user, org, jobID)
	})
	mutateJob("UPDATE product_import_jobs SET rows=$3 WHERE organization_id=$1 AND id=$2", org, jobID, stored)
	for _, run := range []func(*catalog.Service) (any, error){
		func(s *catalog.Service) (any, error) { return s.Product(owner.Context, user, org, productID) },
		func(s *catalog.Service) (any, error) { return s.Products(owner.Context, user, org, catalog.Filter{}) },
		func(s *catalog.Service) (any, error) { return s.Labels(owner.Context, user, org, productID) },
		func(s *catalog.Service) (any, error) { return s.Lookup(owner.Context, user, org, "CATALOG-READ") },
	} {
		trace := &catalogReadFailureTrace{remaining: 2}
		configuration := pool.Config()
		configuration.ConnConfig.Tracer = trace
		tracedPool, problem := pgxpool.NewWithConfig(ctx, configuration)
		if problem != nil {
			t.Fatal(problem)
		}
		result, problem := run(&catalog.Service{Organization: &organization.Service{Pool: tracedPool}})
		tracedPool.Close()
		if trace.remaining != 0 || trace.failure == nil || problem == nil || !reflect.ValueOf(result).IsZero() {
			t.Fatalf("nested SQL failure leaked partial result: %v", problem)
		}
	}
	if catalogReadSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatal("failed reads changed catalog state")
	}
}

type catalogReadFailureTrace struct {
	remaining int
	failure   error
}

func (trace *catalogReadFailureTrace) TraceQueryStart(ctx context.Context, connection *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	if strings.HasPrefix(data.SQL, "SELECT id::text,variant_id::text,code") {
		trace.remaining--
		if trace.remaining == 0 {
			_, trace.failure = connection.Exec(ctx, "SELECT 1/0")
		}
	}
	return ctx
}

func (*catalogReadFailureTrace) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}
