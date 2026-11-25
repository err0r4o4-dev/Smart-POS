package storefront_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/testsupport"
)

func inventoryReadMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string, shop, foreignShop storefront.Settings) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User
	branch, location := shop.BranchID, shop.LocationID
	_, primaryToken, _, err := auth.Service.Login(ctx, user.Email, "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	service := &inventory.Service{Organization: organizations}
	filter := inventory.Filter{BranchID: branch, Page: 1, PageSize: 20}
	t.Run("foreign location and branch return no data", func(t *testing.T) {
		if data, err := service.Get(ctx, user.ID, org, "locations", foreignShop.LocationID); !errors.Is(err, inventory.ErrNotFound) || data != nil {
			t.Fatalf("foreign location: data=%t err=%v", data != nil, err)
		}
		if data, err := service.ReadQuality(ctx, user.ID, org, "lots", foreignShop.BranchID, "", "", 1); !errors.Is(err, inventory.ErrNotFound) || data != nil {
			t.Fatalf("foreign branch: data=%t err=%v", data != nil, err)
		}
		foreign := identity.SessionFromContext(guest.Context).User.ID
		if data, err := service.List(guest.Context, foreign, org, "locations", filter); !errors.Is(err, organization.ErrNotFound) || data != nil {
			t.Fatalf("nonmember: data=%t err=%v", data != nil, err)
		}
	})
	for _, operation := range []struct {
		name string
		read func(context.Context) (bool, error)
	}{
		{"locations", func(ctx context.Context) (bool, error) {
			page, err := service.List(ctx, user.ID, org, "locations", filter)
			return page != nil, err
		}},
		{"location detail", func(ctx context.Context) (bool, error) {
			data, err := service.Get(ctx, user.ID, org, "locations", location)
			return len(data) != 0, err
		}},
		{"quality lots", func(ctx context.Context) (bool, error) {
			data, err := service.ReadQuality(ctx, user.ID, org, "lots", branch, "", "", 1)
			return len(data) != 0, err
		}},
	} {
		t.Run(operation.name, func(t *testing.T) {
			for _, principal := range []struct {
				name string
				ctx  context.Context
				want error
			}{
				{"no session", context.Background(), identity.ErrInvalidToken},
				{"primary only", primary, identity.ErrMFARequired},
				{"foreign session", guest.Context, identity.ErrInvalidToken},
			} {
				t.Run(principal.name, func(t *testing.T) {
					hasData, err := operation.read(principal.ctx)
					if !errors.Is(err, principal.want) || hasData {
						t.Fatalf("private read returned data=%t err=%v, want no data and %v", hasData, err, principal.want)
					}
				})
			}
			if hasData, err := operation.read(owner.Context); err != nil || !hasData {
				t.Fatalf("authorized read returned data=%t err=%v", hasData, err)
			}
		})
	}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, inventory.Handler{Service: service}.TenantRoutes)
	paths := []string{"/inventory/overview", "/inventory/reorder-points"}
	for _, resource := range []string{"locations", "balances", "movements", "adjustments", "counts", "transfers"} {
		paths = append(paths, "/inventory/"+resource, "/inventory/"+resource+"/"+location)
	}
	for _, resource := range []string{"lots", "batches", "expiry", "write-offs", "recalls"} {
		paths = append(paths, "/quality/"+resource+"?branch_id="+branch)
	}
	for _, path := range paths {
		t.Run("HTTP primary "+path, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/organizations/"+org+path, nil)
			request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: primaryToken})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			var body struct {
				Data  json.RawMessage
				Error struct{ Code string }
			}
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || response.Code != 403 || body.Error.Code != "MFA_REQUIRED" || len(body.Data) != 0 || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("inventory HTTP authority: status=%d code=%s data=%t", response.Code, body.Error.Code, len(body.Data) != 0)
			}
		})
	}
	for _, boundary := range []struct {
		prefix string
		read   func(context.Context, *inventory.Service) (bool, error)
	}{
		{"SELECT count(*)  FROM stock_locations item", func(ctx context.Context, service *inventory.Service) (bool, error) {
			page, err := service.List(ctx, user.ID, org, "locations", filter)
			return page != nil, err
		}},
		{"SELECT to_jsonb(item) FROM stock_locations item", func(ctx context.Context, service *inventory.Service) (bool, error) {
			data, err := service.Get(ctx, user.ID, org, "locations", location)
			return len(data) != 0, err
		}},
		{"SELECT COALESCE(jsonb_agg(data ORDER BY expires_on NULLS LAST,lot_number,id)", func(ctx context.Context, service *inventory.Service) (bool, error) {
			data, err := service.ReadQuality(ctx, user.ID, org, "lots", branch, "", "", 1)
			return len(data) != 0, err
		}},
	} {
		for _, cancel := range []bool{false, true} {
			t.Run(fmt.Sprintf("after %s cancel=%t", boundary.prefix, cancel), func(t *testing.T) {
				catalogReadInterrupted(t, ctx, pool, owner, boundary.prefix, 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
					return boundary.read(request, &inventory.Service{Organization: traced.Organization})
				}, true)
			})
		}
	}
}
