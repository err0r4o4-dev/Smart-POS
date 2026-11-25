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
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/testsupport"
)

func privateCatalogMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string, shop storefront.Settings) {
	t.Helper()
	service := &storefront.Service{Organization: organizations}
	user := identity.SessionFromContext(owner.Context).User.ID
	foreign := identity.SessionFromContext(guest.Context).User.ID
	variant := seedSourceProduct(t, ctx, organizations, user, org, shop.BranchID, shop.LocationID, shop.LocationID)
	fixture, _, err := organizations.Authorized(ctx, user, org, "storefront.manage")
	if err != nil {
		t.Fatal(err)
	}
	_, err = fixture.Exec(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency)
	 SELECT organization_id,product_id,'SOURCE2','Private second variant',unit_id,cost_price,13.37,currency FROM product_variants WHERE organization_id=$1 AND id=$2`, org, variant)
	if err == nil {
		err = fixture.Commit(ctx)
	}
	fixture.Rollback(ctx)
	if err != nil {
		t.Fatal(err)
	}
	draft, err := organizations.CreateRestaurant(ctx, user, "d3000000-0000-4000-8000-000000000002", organization.OrganizationInput{Name: "Private catalog draft", BusinessType: "RESTAURANT"})
	if err != nil {
		t.Fatal(err)
	}
	setup := &restaurant.Service{Organization: organizations}
	if _, err = setup.SaveProfile(ctx, user, draft.Organization.ID, "d3000000-0000-4000-8000-000000000004", restaurant.SetupProfileInput{Name: "Private catalog draft", BusinessType: "RESTAURANT"}); err != nil {
		t.Fatalf("catalog draft profile fixture: %v", err)
	}
	if _, err = service.SaveSettings(ctx, user, draft.Organization.ID, storefront.SettingsInput{Name: "Private catalog draft", ShippingFee: "0.00"}); err != nil {
		t.Fatalf("catalog draft storefront fixture: %v", err)
	}
	if _, err = setup.SaveMenu(ctx, user, draft.Organization.ID, "d3000000-0000-4000-8000-000000000003", restaurant.SetupMenuInput{Categories: []restaurant.SetupCategoryInput{{Name: "Meals"}}, Items: []restaurant.SetupMenuItemInput{{Category: "Meals", Name: "Soup", SKU: "SOUP", Price: "45.25"}, {Category: "Meals", Name: "Rice", SKU: "RICE", Price: "12.35"}}}); err != nil {
		t.Fatal(err)
	}
	_, primaryToken, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, storefront.Handler{Service: service}.TenantRoutes)
	for _, target := range []string{org, draft.Organization.ID} {
		privateReadMembership(t, ctx, organizations, user, target, foreign, "")
	}
	for _, candidate := range []struct{ name, org, search string }{
		{"legacy catalog", org, ""}, {"legacy empty", org, "no-such-product"},
		{"draft catalog", draft.Organization.ID, ""}, {"draft empty", draft.Organization.ID, "no-such-product"},
	} {
		t.Run(candidate.name, func(t *testing.T) {
			before := privateCatalogSnapshot(t, ctx, organizations, user, candidate.org)
			for _, denial := range []struct {
				request context.Context
				actor   string
				want    error
			}{{context.Background(), user, identity.ErrInvalidToken}, {primary, user, identity.ErrMFARequired}, {guest.Context, user, identity.ErrInvalidToken}, {guest.Context, foreign, storefront.ErrNotFound}} {
				value, failure := service.Products(denial.request, denial.actor, candidate.org, "", candidate.search, 1)
				if !errors.Is(failure, denial.want) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("private catalog disclosed data or wrong denial: %v", failure)
				}
			}
			for _, status := range []string{"ACTIVE", "SUSPENDED"} {
				privateReadMembership(t, ctx, organizations, user, candidate.org, foreign, status)
				want := organization.ErrDenied
				if status == "SUSPENDED" {
					want = storefront.ErrNotFound
				}
				value, failure := service.Products(guest.Context, foreign, candidate.org, "", candidate.search, 1)
				if !errors.Is(failure, want) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("non-Owner catalog disclosure: %v", failure)
				}
			}
			privateReadMembership(t, ctx, organizations, user, candidate.org, foreign, "")
			for _, session := range []struct {
				token, code string
				status      int
			}{{"", "UNAUTHENTICATED", 401}, {primaryToken, "MFA_REQUIRED", 403}, {owner.Token, "", 200}} {
				request := httptest.NewRequest(http.MethodGet, "/organizations/"+candidate.org+"/storefront/products?search="+candidate.search, nil).WithContext(ctx)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: session.token})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				var body struct {
					Data  json.RawMessage
					Error struct{ Code string }
				}
				if failure := json.Unmarshal(response.Body.Bytes(), &body); failure != nil || response.Code != session.status || body.Error.Code != session.code || (session.status != 200 && len(body.Data) != 0) || response.Header().Get("Cache-Control") != "no-store" {
					t.Fatalf("catalog HTTP status=%d code=%s want=%d/%s error=%v", response.Code, body.Error.Code, session.status, session.code, failure)
				}
			}
			for _, expired := range []bool{true, false} {
				verifyPrivateReadWait(t, ctx, pool, owner, "storefronts", expired, func(request context.Context) (any, error) {
					return service.Products(request, user, candidate.org, "", candidate.search, 1)
				})
			}
			if privateCatalogSnapshot(t, ctx, organizations, user, candidate.org) != before {
				t.Fatal("private catalog reads changed protected business data")
			}
		})
	}
	for _, candidate := range []struct {
		name, target, prefix string
		count                int
		cancel               bool
	}{
		{"legacy count expiry", org, "SELECT count(*) FROM product_variants", 1, false},
		{"legacy IDs expiry", org, "SELECT variant.id::text FROM product_variants", 1, false},
		{"legacy second detail expiry", org, "SELECT variant.id::text,product.name,variant.name", 2, false},
		{"legacy second detail cancellation", org, "SELECT variant.id::text,product.name,variant.name", 2, true},
		{"legacy final helper expiry", org, "SELECT COALESCE((SELECT published", 2, false},
		{"draft count expiry", draft.Organization.ID, "SELECT count(*) FROM restaurant_menu_items", 1, false},
		{"draft projection expiry", draft.Organization.ID, "SELECT variant.id::text,product.name,variant.name", 1, false},
		{"draft projection cancellation", draft.Organization.ID, "SELECT variant.id::text,product.name,variant.name", 1, true},
	} {
		t.Run(candidate.name, func(t *testing.T) {
			before := privateCatalogSnapshot(t, ctx, organizations, user, candidate.target)
			trace := &privateReadTrace{prefix: candidate.prefix, remaining: candidate.count, arrived: make(chan struct{}), release: make(chan struct{})}
			configuration := pool.Config()
			configuration.ConnConfig.Tracer = trace
			tracedPool, failure := pgxpool.NewWithConfig(ctx, configuration)
			if failure != nil {
				t.Fatal(failure)
			}
			defer tracedPool.Close()
			traced := &storefront.Service{Organization: &organization.Service{Pool: tracedPool}}
			session := identity.SessionFromContext(owner.Context).ID
			var cutoff time.Time
			if !candidate.cancel {
				if failure = pool.QueryRow(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at", session).Scan(&cutoff); failure != nil {
					t.Fatal(failure)
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
				page, problem := traced.Products(request, user, candidate.target, "", "", 1)
				if !reflect.ValueOf(page).IsZero() {
					result <- errors.New("interrupted catalog returned accumulated private items or metadata")
					return
				}
				result <- problem
			}()
			select {
			case <-trace.arrived:
			case <-time.After(5 * time.Second):
				stop()
				close(trace.release)
				<-result
				t.Fatal("catalog query boundary not reached")
			}
			if candidate.cancel {
				stop()
			} else {
				for {
					var elapsed bool
					if failure = pool.QueryRow(ctx, "SELECT clock_timestamp()>=$1", cutoff).Scan(&elapsed); failure != nil {
						stop()
						close(trace.release)
						<-result
						t.Fatal(failure)
					}
					if elapsed {
						break
					}
					time.Sleep(10 * time.Millisecond)
				}
			}
			close(trace.release)
			failure = <-result
			want := identity.ErrInvalidToken
			if candidate.cancel {
				want = context.Canceled
			}
			if !errors.Is(failure, want) || privateCatalogSnapshot(t, ctx, organizations, user, candidate.target) != before {
				t.Fatalf("catalog interrupted outcome: %v", failure)
			}
		})
	}
	for _, target := range []string{org, draft.Organization.ID} {
		page, failure := service.Products(owner.Context, user, target, "", "", 1)
		if failure != nil || page.Total != 2 || len(page.Items) != 2 || page.Page != 1 || page.PageSize != 24 {
			t.Fatalf("authorized catalog projection: %v", failure)
		}
		if target == draft.Organization.ID {
			for _, item := range page.Items {
				want := map[string]string{"RICE": "12.35", "SOUP": "45.25"}[item.SKU]
				if want == "" || item.UnitPrice != want || item.Available != nil || item.StockPolicy != "MENU_ONLY" || item.Published {
					t.Fatal("draft exact prices/publication changed")
				}
			}
		}
		if value, failure := service.Products(owner.Context, user, target, "", "", 2); failure != nil || value.Total != 2 || len(value.Items) != 0 || value.Items == nil {
			t.Fatalf("catalog page boundary: %v", failure)
		}
		if value, failure := service.Products(owner.Context, user, target, "", "", 0); !errors.Is(failure, storefront.ErrInput) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("invalid catalog query result: %v", failure)
		}
		pinned := &storefront.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
		if value, failure := pinned.Products(owner.Context, user, target, "", "", 1); !errors.Is(failure, storefront.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("pinned catalog crossed organization: %v", failure)
		}
	}
	public, err := service.Products(context.Background(), "", "", shop.Slug, "", 1)
	if err != nil || public.Total != 1 || len(public.Items) != 1 || public.Items[0].VariantID != variant || !public.Items[0].Published {
		t.Fatalf("public listing changed: %v", err)
	}
	invalidEmployee, err := service.Products(guest.Context, user, org, shop.Slug, "", 1)
	if err != nil || !reflect.DeepEqual(public, invalidEmployee) {
		t.Fatalf("public listing depended on employee principal: %v", err)
	}
}

func privateCatalogSnapshot(t *testing.T, ctx context.Context, organizations *organization.Service, user, org string) string {
	t.Helper()
	base := privateReadSnapshot(t, ctx, organizations, user, org)
	tx, _, err := organizations.Authorized(ctx, user, org, "storefront.manage")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var result strings.Builder
	result.WriteString(base)
	for _, table := range []string{"products", "product_variants", "units", "categories", "restaurant_profiles", "restaurant_menu_items", "restaurant_menu_categories", "restaurant_setup_commands", "quality_recalls", "price_lists"} {
		var digest string
		if err = tx.QueryRow(ctx, "SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM "+table+" t WHERE organization_id=$1", org).Scan(&digest); err != nil {
			t.Fatal(err)
		}
		result.WriteString(digest)
	}
	return result.String()
}
