package storefront_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/testsupport"
)

func posListMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string) {
	t.Helper()
	ctx = owner.Context
	user := identity.SessionFromContext(ctx).User.ID
	service := &pos.Service{Organization: organizations}
	cart := seedPOSCustomerCart(t, ctx, organizations, service, user, org)
	catalogService := &catalog.Service{Organization: organizations}
	unit, err := catalogService.SaveTaxonomy(ctx, user, org, "units", "", catalog.TaxonomyInput{Name: "POS list unit", Code: "POSLIST", UnitType: "COUNT", Status: "ACTIVE"})
	if err != nil {
		t.Fatal(err)
	}
	product, err := catalogService.CreateProduct(ctx, user, org, catalog.CreateInput{ProductInput: catalog.ProductInput{Name: "POS list product", Status: "ACTIVE"}, Variants: []catalog.VariantInput{{SKU: "POSLIST", Name: "POS list variant", UnitID: unit.ID, CostPrice: "1.00", SellingPrice: "10.00", Status: "ACTIVE"}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = catalogService.RegisterBarcode(ctx, user, org, product.ID, product.Variants[0].ID, catalog.BarcodeInput{Code: "POSLIST", Symbology: "CODE128", Source: "ALIAS"}, false); err != nil {
		t.Fatal(err)
	}
	cart, err = service.UpdateCart(ctx, user, org, cart.ID, "update", pos.CartInput{Revision: cart.Revision, Items: []pos.ItemInput{{VariantID: product.Variants[0].ID, Quantity: "1.000"}}})
	if err != nil {
		t.Fatal(err)
	}
	checkout, err := service.PrepareCheckout(ctx, user, org, "df600000-0000-4000-8000-000000000002", pos.CheckoutInput{CartID: cart.ID, Revision: cart.Revision, Method: "CASH", ExpectedTotal: "10.00", Received: "10.00", PricingRevision: cart.Pricing.Revision})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.ConfirmPayment(ctx, user, org, checkout.ID, "df600000-0000-4000-8000-000000000003", pos.ConfirmationInput{Acknowledged: true}); err != nil {
		t.Fatal(err)
	}
	if _, err = service.CompleteCheckout(ctx, user, org, checkout.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = service.CreateCart(ctx, user, org, "df600000-0000-4000-8000-000000000004", pos.CartInput{TerminalID: cart.TerminalID}); err != nil {
		t.Fatal(err)
	}
	emptyBranch, err := organizations.SaveBranch(ctx, user, org, "", organization.BranchInput{Name: "Empty branch", Code: "EMPTY", Status: "ACTIVE"})
	if err != nil {
		t.Fatal(err)
	}
	other, err := organizations.Create(ctx, user, "df600000-0000-4000-8000-000000000005", organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Other POS list tenant", Code: "OTHERPOSLIST", BusinessType: "RETAIL"}, Branch: organization.BranchInput{Name: "Main", Code: "MAIN", Status: "ACTIVE"}})
	if err != nil {
		t.Fatal(err)
	}
	_, primaryToken, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	foreign := identity.SessionFromContext(guest.Context).User.ID
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	before := posCustomerSnapshot(t, ctx, organizations, user, org)
	filters := pos.Filter{TerminalID: cart.TerminalID, Page: 1, PageSize: 25}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, pos.Handler{Service: service}.TenantRoutes)
	for _, resource := range []string{"terminals", "carts", "shifts", "checkouts", "sales", "receipts", "products"} {
		for _, denial := range []struct {
			name string
			ctx  context.Context
			want error
		}{
			{"missing session", context.Background(), identity.ErrInvalidToken},
			{"primary-only session", primary, identity.ErrMFARequired},
			{"mismatched session", guest.Context, identity.ErrInvalidToken},
		} {
			t.Run(resource+" "+denial.name, func(t *testing.T) {
				value, failure := service.List(denial.ctx, user, org, resource, filters)
				if !errors.Is(failure, denial.want) || !reflect.ValueOf(value).IsZero() {
					t.Errorf("POS list disclosed private data or wrong denial: %v", failure)
				}
			})
		}
		for _, status := range []string{"", "ACTIVE", "SUSPENDED"} {
			t.Run(resource+" membership "+status, func(t *testing.T) {
				privateReadMembership(t, ctx, organizations, user, org, foreign, status)
				want := pos.ErrNotFound
				if status == "ACTIVE" {
					want = organization.ErrDenied
				}
				value, failure := service.List(guest.Context, foreign, org, resource, filters)
				if !errors.Is(failure, want) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("POS list membership denial: %v", failure)
				}
			})
		}
		privateReadMembership(t, ctx, organizations, user, org, foreign, "")
		t.Run(resource+" pinned scope", func(t *testing.T) {
			pinned := &pos.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
			value, failure := pinned.List(ctx, user, org, resource, filters)
			if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("POS list deployment boundary: %v", failure)
			}
		})
		t.Run(resource+" foreign branch", func(t *testing.T) {
			candidate := filters
			candidate.BranchID = other.Branches[0].ID
			value, failure := service.List(ctx, user, org, resource, candidate)
			if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("POS list foreign branch disclosed data: %v", failure)
			}
		})
		t.Run(resource+" foreign tenant", func(t *testing.T) {
			value, failure := service.List(ctx, user, other.Organization.ID, resource, filters)
			if resource == "products" {
				if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("POS product list accepted foreign terminal: %v", failure)
				}
			} else if failure != nil || value.Total != 0 || len(posListItems(t, value)) != 0 {
				t.Fatalf("POS list leaked foreign tenant rows: %v", failure)
			}
		})
		t.Run(resource+" exact page and empty page", func(t *testing.T) {
			candidate := filters
			candidate.PageSize = 1
			value, failure := service.List(ctx, user, org, resource, candidate)
			total := 1
			if resource == "carts" {
				total = 2
			}
			items := posListItems(t, value)
			if failure != nil || value.Total != total || value.Page != 1 || value.PageSize != 1 || len(items) != 1 {
				t.Fatalf("POS list pagination changed: %v", failure)
			}
			for _, field := range []string{"create_key", "open_key", "close_key", "fingerprint", "idempotency_key", "confirmation_key"} {
				if _, exists := items[0][field]; exists {
					t.Fatal("POS list exposed internal command identity")
				}
			}
			switch resource {
			case "products":
				if string(items[0]["unit_price"]) != `"10.00"` || string(items[0]["quantity"]) != `"1"` || string(items[0]["stock_policy"]) != `"MENU_ONLY"` || string(items[0]["available"]) != "null" {
					t.Fatal("POS product exact/menu-only projection changed")
				}
			case "checkouts":
				if string(items[0]["total"]) != `"10.00"` || string(items[0]["received"]) != `"10.00"` || string(items[0]["change"]) != `"0.00"` {
					t.Fatal("POS checkout exact amounts changed")
				}
			case "sales", "receipts":
				if string(items[0]["grand_total"]) != `"10.00"` || string(items[0]["method"]) != `"CASH"` || len(items[0]["receipt_id"]) == 0 {
					t.Fatal("POS sale/receipt immutable projection changed")
				}
			case "shifts":
				if string(items[0]["opening_cash"]) != `"0.00"` || string(items[0]["cash_sales"]) != `"10.00"` {
					t.Fatal("POS shift exact amounts changed")
				}
			}
			candidate.Page = 99
			value, failure = service.List(ctx, user, org, resource, candidate)
			if failure != nil || value.Total != total || value.Page != 99 || len(posListItems(t, value)) != 0 {
				t.Fatalf("POS list empty pagination changed: %v", failure)
			}
			if resource != "products" {
				candidate.BranchID = emptyBranch.ID
				value, failure = service.List(ctx, user, org, resource, candidate)
				if failure != nil || value.Total != 0 || len(posListItems(t, value)) != 0 {
					t.Fatalf("POS list branch filter leaked rows: %v", failure)
				}
			}
		})
		table := map[string]string{"terminals": "pos_terminals", "carts": "pos_carts", "shifts": "register_shifts", "checkouts": "pos_checkouts", "products": "pos_terminals"}[resource]
		if table != "" {
			for _, expiry := range []bool{true, false} {
				t.Run(fmt.Sprintf("%s lock expiry=%t", resource, expiry), func(t *testing.T) {
					verifyPrivateReadWait(t, ctx, pool, owner, table, expiry, func(request context.Context) (any, error) {
						return service.List(request, user, org, resource, filters)
					})
				})
			}
		}
		projection := "SELECT to_jsonb(item)"
		if resource == "products" {
			projection = "SELECT variant.id::text,product.name"
		}
		for _, boundary := range []struct {
			prefix string
			count  int
		}{{"SELECT count(*)", 1}, {projection, 1}, {"WITH decision AS MATERIALIZED", 3}} {
			for _, cancel := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s interrupted %s cancel=%t", resource, boundary.prefix, cancel), func(t *testing.T) {
					after := boundary.prefix != "WITH decision AS MATERIALIZED" || cancel
					catalogReadInterrupted(t, ctx, pool, owner, boundary.prefix, boundary.count, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						return (&pos.Service{Organization: traced.Organization}).List(request, user, org, resource, filters)
					}, after)
				})
			}
		}
		t.Run(resource+" aborted projection", func(t *testing.T) {
			trace := &customerReadFailureTrace{prefix: projection, remaining: 1}
			configuration := pool.Config()
			configuration.ConnConfig.Tracer = trace
			tracedPool, failure := pgxpool.NewWithConfig(ctx, configuration)
			if failure != nil {
				t.Fatal(failure)
			}
			defer tracedPool.Close()
			value, failure := (&pos.Service{Organization: &organization.Service{Pool: tracedPool}}).List(ctx, user, org, resource, filters)
			if failure == nil || trace.failure == nil || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("POS list aborted query exposed page: %v", failure)
			}
		})
		path := "/pos/" + resource
		if resource == "sales" || resource == "receipts" {
			path = "/" + resource
		}
		posListHTTP(t, ctx, router, org, path+"?terminal_id="+cart.TerminalID, owner.Token, primaryToken, guest.Token)
	}
	posListHTTP(t, ctx, router, org, "/pos/barcodes/POSLIST?terminal_id="+cart.TerminalID, owner.Token, primaryToken, guest.Token)
	t.Run("revoked direct and cookie lists", func(t *testing.T) {
		session := identity.SessionFromContext(ctx).ID
		if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1", session); failure != nil {
			t.Fatal(failure)
		}
		defer func() {
			if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=NULL WHERE id=$1", session); failure != nil {
				t.Error(failure)
			}
		}()
		for _, resource := range []string{"terminals", "carts", "shifts", "checkouts", "sales", "receipts", "products", "barcodes/POSLIST"} {
			if resource != "barcodes/POSLIST" {
				value, failure := service.List(ctx, user, org, resource, filters)
				if !errors.Is(failure, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("revoked direct POS list exposed data: %v", failure)
				}
			}
			path := "/pos/" + resource
			if resource == "sales" || resource == "receipts" {
				path = "/" + resource
			}
			request := httptest.NewRequest(http.MethodGet, "/organizations/"+org+path+"?terminal_id="+cart.TerminalID, nil).WithContext(ctx)
			request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != 401 || !strings.Contains(response.Body.String(), "UNAUTHENTICATED") || strings.Contains(response.Body.String(), `"data"`) || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("revoked cookie POS list: status=%d", response.Code)
			}
		}
	})
	t.Run("Owner retains own-cart and shared history visibility", func(t *testing.T) {
		setRole := func(role, status string) {
			t.Helper()
			tx, _, failure := organizations.Authorized(ctx, user, org, "pos.cart.manage")
			if failure != nil {
				t.Fatal(failure)
			}
			defer tx.Rollback(ctx)
			if _, failure = tx.Exec(ctx, "UPDATE organization_memberships SET role=$3,status=$4 WHERE organization_id=$1 AND user_id=$2", org, foreign, role, status); failure != nil {
				t.Fatal(failure)
			}
			if failure = tx.Commit(ctx); failure != nil {
				t.Fatal(failure)
			}
		}
		setRole("OWNER", "ACTIVE")
		defer setRole("MANAGER", "REMOVED")
		for _, resource := range []string{"carts", "shifts", "checkouts", "sales", "receipts"} {
			value, failure := service.List(guest.Context, foreign, org, resource, filters)
			want := 1
			if resource == "carts" {
				want = 0
			}
			if failure != nil || value.Total != want || len(posListItems(t, value)) != want {
				t.Fatalf("POS Owner list ownership/history changed: %s %v", resource, failure)
			}
		}
	})
	t.Run("barcode empty and invalid filters", func(t *testing.T) {
		for _, candidate := range []struct {
			path   string
			status int
			code   string
		}{
			{"/pos/barcodes/MISSING?terminal_id=" + cart.TerminalID, 404, "NOT_FOUND"},
			{"/pos/carts?page_size=101", 400, "INVALID_INPUT"},
			{"/sales?from=invalid", 400, "INVALID_INPUT"},
		} {
			request := httptest.NewRequest(http.MethodGet, "/organizations/"+org+candidate.path, nil).WithContext(ctx)
			request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != candidate.status || !strings.Contains(response.Body.String(), candidate.code) || strings.Contains(response.Body.String(), `"data"`) {
				t.Fatalf("POS list invalid/empty HTTP: %d", response.Code)
			}
		}
	})
	t.Run("unknown resource and failed terminal discard metadata", func(t *testing.T) {
		for _, resource := range []string{"invalid", "products"} {
			candidate := filters
			candidate.TerminalID = "invalid"
			value, failure := service.List(ctx, user, org, resource, candidate)
			if !errors.Is(failure, pos.ErrInput) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("POS list failed metadata exposed: %v", failure)
			}
		}
	})
	if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatal("POS list reads changed business/audit state")
	}
}

func posListItems(t *testing.T, page pos.Page) []map[string]json.RawMessage {
	t.Helper()
	data, err := json.Marshal(page.Items)
	if err != nil {
		t.Fatal(err)
	}
	var items []map[string]json.RawMessage
	if err = json.Unmarshal(data, &items); err != nil {
		t.Fatal(err)
	}
	return items
}

func posListHTTP(t *testing.T, ctx context.Context, router http.Handler, org, path, assured, primary, foreign string) {
	t.Helper()
	for _, candidate := range []struct {
		name, token, code string
		status            int
	}{
		{"missing", "", "UNAUTHENTICATED", 401}, {"primary", primary, "MFA_REQUIRED", 403}, {"foreign", foreign, "NOT_FOUND", 404}, {"assured", assured, "", 200},
	} {
		t.Run(path+" HTTP "+candidate.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/organizations/"+org+path, nil).WithContext(ctx)
			request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: candidate.token})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != candidate.status || response.Header().Get("Cache-Control") != "no-store" || candidate.code != "" && (!strings.Contains(response.Body.String(), candidate.code) || strings.Contains(response.Body.String(), `"data"`)) {
				t.Fatalf("POS list cookie boundary: status=%d", response.Code)
			}
			if candidate.status == 200 {
				var envelope struct {
					Data pos.Page `json:"data"`
				}
				if json.Unmarshal(response.Body.Bytes(), &envelope) != nil || envelope.Data.Total < 1 || len(posListItems(t, envelope.Data)) < 1 {
					t.Fatal("POS list HTTP lost page")
				}
			}
		})
	}
}
