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
	"smartpos/api/internal/modules/customers"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/testsupport"
)

func posReadMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string) {
	t.Helper()
	ctx = owner.Context
	user := identity.SessionFromContext(ctx).User.ID
	service := &pos.Service{Organization: organizations}
	cart := seedPOSCustomerCart(t, ctx, organizations, service, user, org)
	catalogService := &catalog.Service{Organization: organizations}
	unit, err := catalogService.SaveTaxonomy(ctx, user, org, "units", "", catalog.TaxonomyInput{Name: "POS read unit", Code: "POSREAD", UnitType: "COUNT", Status: "ACTIVE"})
	if err != nil {
		t.Fatal(err)
	}
	product, err := catalogService.CreateProduct(ctx, user, org, catalog.CreateInput{ProductInput: catalog.ProductInput{Name: "POS read product", Status: "ACTIVE"}, Variants: []catalog.VariantInput{{SKU: "POSREAD", Name: "POS read variant", UnitID: unit.ID, CostPrice: "1.00", SellingPrice: "10.00", Status: "ACTIVE"}}})
	if err != nil {
		t.Fatal(err)
	}
	cart, err = service.UpdateCart(ctx, user, org, cart.ID, "update", pos.CartInput{Revision: cart.Revision, Items: []pos.ItemInput{{VariantID: product.Variants[0].ID, Quantity: "1.000"}}})
	if err != nil {
		t.Fatal(err)
	}
	customer, err := (&customers.Service{Organization: organizations}).Save(ctx, user, org, "", "df500000-0000-4000-8000-000000000003", customers.Input{Code: "POSREAD", Name: "Private reader customer"})
	if err != nil {
		t.Fatal(err)
	}
	cart, err = service.SelectCustomer(ctx, user, org, cart.ID, pos.CustomerInput{Revision: cart.Revision, CustomerID: &customer.ID})
	if err != nil {
		t.Fatal(err)
	}
	checkout, err := service.PrepareCheckout(ctx, user, org, "df500000-0000-4000-8000-000000000002", pos.CheckoutInput{CartID: cart.ID, Revision: cart.Revision, Method: "CASH", ExpectedTotal: "10.00", Received: "10.00", PricingRevision: cart.Pricing.Revision})
	if err != nil {
		t.Fatal(err)
	}
	_, primaryToken, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	foreign := identity.SessionFromContext(guest.Context).User.ID
	other, err := organizations.Create(ctx, user, "df500000-0000-4000-8000-000000000004", organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Other reader tenant", Code: "OTHERPOSREAD", BusinessType: "RETAIL"}, Branch: organization.BranchInput{Name: "Main", Code: "MAIN", Status: "ACTIVE"}})
	if err != nil {
		t.Fatal(err)
	}
	operations := []struct {
		name, id, final string
		tables          []string
		run             func(context.Context, *pos.Service, string, string, string) (any, error)
	}{
		{"carts", cart.ID, "SELECT id::text,number,estimated_total::text FROM online_orders", []string{"pos_carts", "pos_terminals", "customers"}, func(request context.Context, point *pos.Service, actor, tenant, id string) (any, error) {
			return point.Cart(request, actor, tenant, id)
		}},
		{"checkouts", checkout.ID, "SELECT pricing_snapshot FROM pos_checkouts", []string{"pos_checkouts", "pos_carts"}, func(request context.Context, point *pos.Service, actor, tenant, id string) (any, error) {
			return point.Checkout(request, actor, tenant, id)
		}},
	}
	before := posCustomerSnapshot(t, ctx, organizations, user, org)
	for _, operation := range operations {
		for _, denial := range []struct {
			name string
			ctx  context.Context
			want error
		}{
			{"missing session", context.Background(), identity.ErrInvalidToken},
			{"primary-only session", primary, identity.ErrMFARequired},
			{"mismatched session", guest.Context, identity.ErrInvalidToken},
		} {
			t.Run(operation.name+" "+denial.name, func(t *testing.T) {
				value, failure := operation.run(denial.ctx, service, user, org, operation.id)
				if !errors.Is(failure, denial.want) || !reflect.ValueOf(value).IsZero() {
					t.Errorf("POS detail reader disclosed private data or wrong denial: %v", failure)
				}
			})
		}
		for _, status := range []string{"", "ACTIVE", "SUSPENDED"} {
			t.Run(operation.name+" membership "+status, func(t *testing.T) {
				privateReadMembership(t, ctx, organizations, user, org, foreign, status)
				want := pos.ErrNotFound
				if status == "ACTIVE" {
					want = organization.ErrDenied
				}
				value, failure := operation.run(guest.Context, service, foreign, org, operation.id)
				if !errors.Is(failure, want) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("POS detail membership denial: %v", failure)
				}
			})
		}
		privateReadMembership(t, ctx, organizations, user, org, foreign, "")
		for _, candidate := range []struct {
			name, tenant, id string
			want             error
		}{{"foreign document", other.Organization.ID, operation.id, pos.ErrNotFound}, {"invalid id", org, "invalid-id", pos.ErrInput}} {
			t.Run(operation.name+" "+candidate.name, func(t *testing.T) {
				value, failure := operation.run(ctx, service, user, candidate.tenant, candidate.id)
				if !errors.Is(failure, candidate.want) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("POS detail document boundary: %v", failure)
				}
			})
		}
		t.Run(operation.name+" pinned scope", func(t *testing.T) {
			pinned := &pos.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
			value, failure := operation.run(ctx, pinned, user, org, operation.id)
			if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("POS detail deployment scope: %v", failure)
			}
		})
		for _, table := range operation.tables {
			for _, expiry := range []bool{true, false} {
				t.Run(fmt.Sprintf("%s %s lock expiry=%t", operation.name, table, expiry), func(t *testing.T) {
					verifyPrivateReadWait(t, ctx, pool, owner, table, expiry, func(request context.Context) (any, error) {
						return operation.run(request, service, user, org, operation.id)
					})
				})
			}
		}
		for _, boundary := range []struct {
			prefix string
			count  int
		}{{operation.final, 1}, {"WITH decision AS MATERIALIZED", 3}} {
			for _, cancel := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s interrupted %s cancel=%t", operation.name, boundary.prefix, cancel), func(t *testing.T) {
					// Expiry must precede the final DB decision; cancellation is also checked after it.
					after := boundary.prefix != "WITH decision AS MATERIALIZED" || cancel
					catalogReadInterrupted(t, ctx, pool, owner, boundary.prefix, boundary.count, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						return operation.run(request, &pos.Service{Organization: traced.Organization}, user, org, operation.id)
					}, after)
				})
			}
		}
		t.Run(operation.name+" aborted final projection", func(t *testing.T) {
			trace := &customerReadFailureTrace{prefix: operation.final, remaining: 1}
			configuration := pool.Config()
			configuration.ConnConfig.Tracer = trace
			tracedPool, failure := pgxpool.NewWithConfig(ctx, configuration)
			if failure != nil {
				t.Fatal(failure)
			}
			defer tracedPool.Close()
			value, failure := operation.run(ctx, &pos.Service{Organization: &organization.Service{Pool: tracedPool}}, user, org, operation.id)
			if failure == nil || trace.failure == nil || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("POS detail aborted projection exposed data: %v", failure)
			}
		})
		router := chi.NewRouter()
		organization.Handler{Service: organizations, Authentication: auth}.Routes(router, pos.Handler{Service: service}.TenantRoutes)
		t.Run(operation.name+" revoked direct and HTTP", func(t *testing.T) {
			session := identity.SessionFromContext(ctx).ID
			if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1", session); failure != nil {
				t.Fatal(failure)
			}
			defer func() {
				if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=NULL WHERE id=$1", session); failure != nil {
					t.Error(failure)
				}
			}()
			value, failure := operation.run(ctx, service, user, org, operation.id)
			if !errors.Is(failure, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("revoked POS detail access: %v", failure)
			}
			request := httptest.NewRequest(http.MethodGet, "/organizations/"+org+"/pos/"+operation.name+"/"+operation.id, nil).WithContext(ctx)
			request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != 401 || !strings.Contains(response.Body.String(), "UNAUTHENTICATED") || strings.Contains(response.Body.String(), `"data"`) || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("revoked POS detail HTTP: %d", response.Code)
			}
		})
		for _, candidate := range []struct {
			name, token, code string
			status            int
		}{{"missing", "", "UNAUTHENTICATED", 401}, {"primary", primaryToken, "MFA_REQUIRED", 403}, {"foreign", guest.Token, "NOT_FOUND", 404}, {"assured", owner.Token, "", 200}} {
			t.Run(operation.name+" HTTP "+candidate.name, func(t *testing.T) {
				request := httptest.NewRequest(http.MethodGet, "/organizations/"+org+"/pos/"+operation.name+"/"+operation.id, nil).WithContext(ctx)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: candidate.token})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				var envelope struct {
					Data json.RawMessage `json:"data"`
				}
				if failure := json.Unmarshal(response.Body.Bytes(), &envelope); failure != nil {
					t.Fatal(failure)
				}
				if response.Code != candidate.status || response.Header().Get("Cache-Control") != "no-store" || candidate.code != "" && (!strings.Contains(response.Body.String(), candidate.code) || len(envelope.Data) != 0) {
					t.Fatalf("POS detail HTTP status=%d body=%s", response.Code, response.Body.String())
				}
				if candidate.status == 200 {
					if operation.name == "carts" {
						var value pos.Cart
						if json.Unmarshal(envelope.Data, &value) != nil || value.Total != "10.00" || value.Customer == nil || value.Customer.ID != customer.ID || len(value.Items) != 1 || value.Items[0].Quantity != "1.000" || value.Items[0].StockPolicy != "MENU_ONLY" || value.Items[0].Available != nil {
							t.Fatal("POS detail cart lost exact pricing/customer/menu-only projection")
						}
					} else {
						var value pos.Checkout
						if json.Unmarshal(envelope.Data, &value) != nil || value.Total != "10.00" || value.CustomerID == nil || *value.CustomerID != customer.ID || value.CustomerCode != "POSREAD" || len(value.Items) != 1 || value.Items[0].Quantity != "1.000" || value.Items[0].StockPolicy != "MENU_ONLY" || value.Items[0].Available != nil {
							t.Fatal("POS detail checkout lost exact frozen/customer/menu-only projection")
						}
					}
				}
			})
		}
	}
	t.Run("Owner access retains own-cart rule and shared checkout visibility", func(t *testing.T) {
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
		value, failure := service.Cart(guest.Context, foreign, org, cart.ID)
		if !errors.Is(failure, organization.ErrDenied) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("other Owner read cashier cart: %v", failure)
		}
		shared, failure := service.Checkout(guest.Context, foreign, org, checkout.ID)
		if failure != nil || shared.ID != checkout.ID || shared.Total != "10.00" {
			t.Fatalf("existing Owner checkout visibility changed: %v", failure)
		}
	})
	if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatal("POS detail reads changed business/audit state")
	}
}
