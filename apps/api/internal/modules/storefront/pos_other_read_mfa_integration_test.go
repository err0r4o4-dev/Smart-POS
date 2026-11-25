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

func posOtherReadMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string) {
	t.Helper()
	ctx = owner.Context
	user := identity.SessionFromContext(ctx).User.ID
	service := &pos.Service{Organization: organizations}
	customer, err := (&customers.Service{Organization: organizations}).Save(ctx, user, org, "", "df700000-0000-4000-8000-000000000002", customers.Input{Code: "POSOTHER", Name: "POS other reader customer"})
	if err != nil {
		t.Fatal(err)
	}
	seedCustomerReadSale(t, ctx, organizations, user, org, customer.ID)
	tx, _, err := organizations.Authorized(ctx, user, org, "pos.access")
	if err != nil {
		t.Fatal(err)
	}
	var terminal, shift, sale, receipt, variant string
	err = tx.QueryRow(ctx, `SELECT sale.terminal_id::text,sale.shift_id::text,sale.id::text,receipt.id::text,item.variant_id::text FROM sales sale JOIN receipts receipt ON receipt.organization_id=sale.organization_id AND receipt.sale_id=sale.id JOIN sale_items item ON item.organization_id=sale.organization_id AND item.sale_id=sale.id WHERE sale.organization_id=$1`, org).Scan(&terminal, &shift, &sale, &receipt, &variant)
	tx.Rollback(ctx)
	if err != nil {
		t.Fatal(err)
	}
	cart, err := service.CreateCart(ctx, user, org, "df700000-0000-4000-8000-000000000003", pos.CartInput{TerminalID: terminal})
	if err != nil {
		t.Fatal(err)
	}
	cart, err = service.UpdateCart(ctx, user, org, cart.ID, "update", pos.CartInput{Revision: cart.Revision, Items: []pos.ItemInput{{VariantID: variant, Quantity: "1.000"}}})
	if err != nil {
		t.Fatal(err)
	}
	_, primaryToken, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	foreign := identity.SessionFromContext(guest.Context).User.ID
	other, err := organizations.Create(ctx, user, "df700000-0000-4000-8000-000000000004", organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Other private reader tenant", Code: "OTHERPOSOTHER", BusinessType: "RETAIL"}, Branch: organization.BranchInput{Name: "Main", Code: "MAIN", Status: "ACTIVE"}})
	if err != nil {
		t.Fatal(err)
	}
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, pos.Handler{Service: service}.TenantRoutes)
	operations := []struct {
		name, id, path string
		run            func(context.Context, *pos.Service, string, string, string) (any, error)
	}{
		{"shift", shift, "/pos/shifts/" + shift, func(request context.Context, point *pos.Service, actor, tenant, id string) (any, error) {
			return point.Shift(request, actor, tenant, id)
		}},
		{"sale", sale, "/sales/" + sale, func(request context.Context, point *pos.Service, actor, tenant, id string) (any, error) {
			return point.Sale(request, actor, tenant, id, false)
		}},
		{"receipt", receipt, "/receipts/" + receipt, func(request context.Context, point *pos.Service, actor, tenant, id string) (any, error) {
			return point.Sale(request, actor, tenant, id, true)
		}},
		{"quote", cart.ID, "/pos/carts/" + cart.ID + "/quote", func(request context.Context, point *pos.Service, actor, tenant, id string) (any, error) {
			return point.Quote(request, actor, tenant, id, "")
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
					t.Errorf("POS reader disclosed private result or wrong denial: %v", failure)
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
					t.Fatalf("private POS membership boundary: %v", failure)
				}
			})
		}
		privateReadMembership(t, ctx, organizations, user, org, foreign, "")
		for _, candidate := range []struct {
			name, tenant, id string
			want             error
		}{
			{"foreign tenant", other.Organization.ID, operation.id, pos.ErrNotFound},
			{"invalid id", org, "invalid", pos.ErrInput},
			{"missing document", org, "11111111-1111-4111-8111-111111111111", pos.ErrNotFound},
		} {
			t.Run(operation.name+" "+candidate.name, func(t *testing.T) {
				value, failure := operation.run(ctx, service, user, candidate.tenant, candidate.id)
				if !errors.Is(failure, candidate.want) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("private POS document boundary: %v", failure)
				}
			})
		}
		t.Run(operation.name+" pinned deployment", func(t *testing.T) {
			pinned := &pos.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: other.Organization.ID}}
			value, failure := operation.run(ctx, pinned, user, org, operation.id)
			if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("private POS deployment boundary: %v", failure)
			}
		})
		t.Run(operation.name+" exact private result", func(t *testing.T) {
			value, failure := operation.run(ctx, service, user, org, operation.id)
			if failure != nil {
				t.Fatal(failure)
			}
			data, failure := json.Marshal(value)
			if failure != nil {
				t.Fatal(failure)
			}
			var fields map[string]json.RawMessage
			if json.Unmarshal(data, &fields) != nil {
				t.Fatal("invalid private POS result")
			}
			switch operation.name {
			case "shift":
				if string(fields["opening_cash"]) != `"0.00"` || string(fields["cash_sales"]) != `"10.00"` {
					t.Fatal("shift exact history changed")
				}
			case "sale", "receipt":
				if string(fields["grand_total"]) != `"10.00"` || string(fields["stock_policy"]) != `"MENU_ONLY"` {
					t.Fatal("immutable sale snapshot changed")
				}
				var payment map[string]json.RawMessage
				if json.Unmarshal(fields["payment"], &payment) != nil || string(payment["method"]) != `"CASH"` || string(payment["amount"]) != `"10.00"` {
					t.Fatal("immutable payment snapshot changed")
				}
			case "quote":
				if string(fields["total"]) != `"10.00"` || string(fields["revision"]) == `""` {
					t.Fatal("exact live quote changed")
				}
			}
		})
		final := map[string]string{"shift": "SELECT to_jsonb(shift)", "sale": "SELECT to_jsonb(sale)", "receipt": "SELECT to_jsonb(sale)", "quote": "SELECT id::text FROM promotions"}[operation.name]
		for _, cancel := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s after private helper cancel=%t", operation.name, cancel), func(t *testing.T) {
				catalogReadInterrupted(t, ctx, pool, owner, final, 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
					return operation.run(request, &pos.Service{Organization: traced.Organization}, user, org, operation.id)
				}, true)
			})
		}
		if table := map[string]string{"shift": "register_shifts", "quote": "pos_carts"}[operation.name]; table != "" {
			for _, expiry := range []bool{true, false} {
				t.Run(fmt.Sprintf("%s lock expiry=%t", operation.name, expiry), func(t *testing.T) {
					verifyPrivateReadWait(t, ctx, pool, owner, table, expiry, func(request context.Context) (any, error) {
						return operation.run(request, service, user, org, operation.id)
					})
				})
			}
		}
		for _, cancel := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s final decision cancel=%t", operation.name, cancel), func(t *testing.T) {
				catalogReadInterrupted(t, ctx, pool, owner, "WITH decision AS MATERIALIZED", 3, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
					return operation.run(request, &pos.Service{Organization: traced.Organization}, user, org, operation.id)
				}, cancel)
			})
		}
		t.Run(operation.name+" aborted helper", func(t *testing.T) {
			trace := &customerReadFailureTrace{prefix: final, remaining: 1}
			configuration := pool.Config()
			configuration.ConnConfig.Tracer = trace
			tracedPool, failure := pgxpool.NewWithConfig(ctx, configuration)
			if failure != nil {
				t.Fatal(failure)
			}
			defer tracedPool.Close()
			value, failure := operation.run(ctx, &pos.Service{Organization: &organization.Service{Pool: tracedPool}}, user, org, operation.id)
			if failure == nil || trace.failure == nil || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("aborted private POS query: %v", failure)
			}
		})
		posOtherReadHTTP(t, ctx, router, org, operation.path, owner.Token, primaryToken, guest.Token)
	}
	t.Run("failed loyalty quote discards partial prices", func(t *testing.T) {
		value, failure := service.Quote(ctx, user, org, cart.ID, "", -1)
		if !errors.Is(failure, pos.ErrInput) || !reflect.ValueOf(value).IsZero() {
			t.Errorf("failed POS loyalty quote exposed private prices: %v", failure)
		}
	})
	posOtherReadHTTP(t, ctx, router, org, "/pos/payment-methods", owner.Token, primaryToken, guest.Token)
	for _, count := range []int{2, 3} {
		for _, cancel := range []bool{false, true} {
			t.Run(fmt.Sprintf("payment methods decision=%d cancel=%t", count, cancel), func(t *testing.T) {
				catalogReadInterrupted(t, ctx, pool, owner, "WITH decision AS MATERIALIZED", count, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
					direct := chi.NewRouter()
					direct.Route("/organizations/{id}", (pos.Handler{Service: &pos.Service{Organization: traced.Organization}}).TenantRoutes)
					response := httptest.NewRecorder()
					direct.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/organizations/"+org+"/pos/payment-methods", nil).WithContext(request))
					if response.Code == 200 {
						return response.Body.String(), nil
					}
					if strings.Contains(response.Body.String(), `"data"`) {
						return response.Body.String(), errors.New("failed methods response exposed data")
					}
					if request.Err() != nil {
						return "", request.Err()
					}
					if response.Code == 401 {
						return "", identity.ErrInvalidToken
					}
					return "", fmt.Errorf("unexpected payment-method status %d", response.Code)
				}, count == 2 || cancel)
			})
		}
	}
	t.Run("Owner keeps historical visibility and own-cart rule", func(t *testing.T) {
		setRole := func(role, status string) {
			t.Helper()
			tx, _, failure := organizations.Authorized(ctx, user, org, "pos.access")
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
		for _, operation := range operations {
			value, failure := operation.run(guest.Context, service, foreign, org, operation.id)
			if operation.name == "quote" {
				if !errors.Is(failure, organization.ErrDenied) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("Owner read another cashier cart: %v", failure)
				}
			} else if failure != nil || reflect.ValueOf(value).IsZero() {
				t.Fatalf("Owner lost historical reader: %s %v", operation.name, failure)
			}
		}
	})
	t.Run("revoked direct and cookie readers", func(t *testing.T) {
		session := identity.SessionFromContext(ctx).ID
		if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1", session); failure != nil {
			t.Fatal(failure)
		}
		defer func() {
			if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=NULL WHERE id=$1", session); failure != nil {
				t.Error(failure)
			}
		}()
		paths := []string{"/pos/payment-methods"}
		for _, operation := range operations {
			value, failure := operation.run(ctx, service, user, org, operation.id)
			if !errors.Is(failure, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("revoked private POS reader: %v", failure)
			}
			paths = append(paths, operation.path)
		}
		for _, path := range paths {
			request := httptest.NewRequest(http.MethodGet, "/organizations/"+org+path, nil).WithContext(ctx)
			request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != 401 || !strings.Contains(response.Body.String(), "UNAUTHENTICATED") || strings.Contains(response.Body.String(), `"data"`) || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("revoked POS HTTP: %d", response.Code)
			}
		}
	})
	t.Run("primary-only payment methods", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodGet, "/organizations/"+org+"/pos/payment-methods", nil).WithContext(ctx)
		request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: primaryToken})
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != 403 || !strings.Contains(response.Body.String(), "MFA_REQUIRED") || strings.Contains(response.Body.String(), `"data"`) {
			t.Errorf("primary-only payment methods disclosed: status=%d", response.Code)
		}
	})
	if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatal("POS reader preparation changed business state")
	}
}

func posOtherReadHTTP(t *testing.T, ctx context.Context, router http.Handler, org, path, assured, primary, foreign string) {
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
				t.Fatalf("private POS HTTP boundary: %d", response.Code)
			}
			if candidate.status == 200 && (!strings.Contains(response.Body.String(), `"data"`) || path == "/pos/payment-methods" && !strings.Contains(response.Body.String(), `["CASH","QR_MANUAL","BANK_TRANSFER_MANUAL"]`)) {
				t.Fatal("private POS HTTP result changed")
			}
		})
	}
}
