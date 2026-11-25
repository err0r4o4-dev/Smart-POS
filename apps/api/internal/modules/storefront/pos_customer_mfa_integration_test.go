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

func posCustomerMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string) {
	t.Helper()
	ctx = owner.Context
	user := identity.SessionFromContext(ctx).User.ID
	customer, err := (&customers.Service{Organization: organizations}).Save(ctx, user, org, "", "df400000-0000-4000-8000-000000000002", customers.Input{Code: "POSMFA", Name: "Private POS customer"})
	if err != nil {
		t.Fatal(err)
	}
	point := &pos.Service{Organization: organizations}
	cart := seedPOSCustomerCart(t, ctx, organizations, point, user, org)
	_, primaryToken, primaryCSRF, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	before := posCustomerSnapshot(t, ctx, organizations, user, org)
	for _, candidate := range []struct {
		name string
		ctx  context.Context
		want error
	}{
		{"missing session", context.Background(), identity.ErrInvalidToken},
		{"primary-only session", primary, identity.ErrMFARequired},
		{"mismatched session", guest.Context, identity.ErrInvalidToken},
	} {
		t.Run(candidate.name, func(t *testing.T) {
			current, failure := point.Cart(ctx, user, org, cart.ID)
			if failure != nil {
				t.Fatal(failure)
			}
			value, failure := point.SelectCustomer(candidate.ctx, user, org, cart.ID, pos.CustomerInput{Revision: current.Revision, CustomerID: &customer.ID})
			if !errors.Is(failure, candidate.want) || !reflect.ValueOf(value).IsZero() {
				t.Errorf("POS selection authority bypass or private result: %v", failure)
			}
		})
	}
	if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatal("denied POS selection changed business/audit state")
	}
	t.Run("primary-only expires after user lock", func(t *testing.T) {
		verifyPrivateReadWait(t, ctx, pool, testsupport.MFASession{Context: primary}, "users", true, func(request context.Context) (any, error) {
			return point.SelectCustomer(request, user, org, cart.ID, pos.CustomerInput{Revision: cart.Revision, CustomerID: &customer.ID})
		})
		if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatal("expired primary-only selection changed business/audit state")
		}
	})
	input := pos.CustomerInput{Revision: cart.Revision, CustomerID: &customer.ID}
	foreign := identity.SessionFromContext(guest.Context).User.ID
	for _, status := range []string{"", "ACTIVE", "SUSPENDED"} {
		t.Run("membership "+status, func(t *testing.T) {
			privateReadMembership(t, ctx, organizations, user, org, foreign, status)
			want := pos.ErrNotFound
			if status == "ACTIVE" {
				want = organization.ErrDenied
			}
			value, failure := point.SelectCustomer(guest.Context, foreign, org, cart.ID, input)
			if !errors.Is(failure, want) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("POS membership denial: %v", failure)
			}
		})
	}
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	t.Run("pinned deployment", func(t *testing.T) {
		pinned := &pos.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
		value, failure := pinned.SelectCustomer(ctx, user, org, cart.ID, input)
		if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("pinned POS scope: %v", failure)
		}
	})
	t.Run("revoked session", func(t *testing.T) {
		session := identity.SessionFromContext(ctx).ID
		if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1", session); failure != nil {
			t.Fatal(failure)
		}
		defer func() {
			if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=NULL WHERE id=$1", session); failure != nil {
				t.Error(failure)
			}
		}()
		value, failure := point.SelectCustomer(ctx, user, org, cart.ID, input)
		if !errors.Is(failure, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("revoked POS selection: %v", failure)
		}
	})
	for _, table := range []string{"pos_carts", "pos_checkouts", "customers"} {
		for _, expiry := range []bool{true, false} {
			t.Run(fmt.Sprintf("%s lock expiry=%t", table, expiry), func(t *testing.T) {
				verifyPrivateReadWait(t, ctx, pool, owner, table, expiry, func(request context.Context) (any, error) {
					return point.SelectCustomer(request, user, org, cart.ID, input)
				})
			})
			if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatal("blocked POS selection retained effects")
			}
		}
	}
	for _, boundary := range []struct {
		name, prefix string
		count        int
	}{
		{"cart header", "SELECT cart.id::text", 1},
		{"checkout guard", "SELECT EXISTS(SELECT 1 FROM pos_checkouts", 1},
		{"customer lock", "SELECT id::text,code,name,status FROM customers", 1},
		{"selection written", "UPDATE pos_carts SET customer_id=", 1},
		{"cart reread", "SELECT cart.id::text", 2},
		{"customer reread", "SELECT id::text,code,name,status FROM customers", 2},
		{"audit", "INSERT INTO organization_audit_events", 1},
	} {
		for _, cancel := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s interrupted cancel=%t", boundary.name, cancel), func(t *testing.T) {
				catalogReadInterrupted(t, ctx, pool, owner, boundary.prefix, boundary.count, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
					return (&pos.Service{Organization: traced.Organization}).SelectCustomer(request, user, org, cart.ID, input)
				}, true)
			})
			if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatal("interrupted POS selection retained effects")
			}
		}
	}
	for _, fault := range []struct {
		name, prefix string
		count        int
	}{
		{"projection", "SELECT cart.id::text", 2},
		{"audit", "INSERT INTO organization_audit_events", 1},
	} {
		t.Run("aborted SQL "+fault.name, func(t *testing.T) {
			trace := &customerReadFailureTrace{prefix: fault.prefix, remaining: fault.count}
			configuration := pool.Config()
			configuration.ConnConfig.Tracer = trace
			tracedPool, failure := pgxpool.NewWithConfig(ctx, configuration)
			if failure != nil {
				t.Fatal(failure)
			}
			defer tracedPool.Close()
			value, failure := (&pos.Service{Organization: &organization.Service{Pool: tracedPool}}).SelectCustomer(ctx, user, org, cart.ID, input)
			if failure == nil || trace.failure == nil || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("aborted POS result: %v", failure)
			}
			if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatal("aborted POS transaction retained effects")
			}
		})
	}
	cart = posCustomerHTTP(t, ctx, auth, organizations, point, owner, guest, primaryToken, primaryCSRF, org, cart, input)
	posCustomerDomain(t, ctx, organizations, point, user, org, cart, customer)
}

func posCustomerSnapshot(t *testing.T, ctx context.Context, organizations *organization.Service, user, org string) string {
	t.Helper()
	tx, _, err := organizations.Authorized(ctx, user, org, "pos.cart.manage")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var result strings.Builder
	for _, table := range []string{"pos_carts", "pos_cart_items", "pos_checkouts", "register_shifts", "organization_audit_events", "customers", "customer_groups", "customer_group_memberships", "sales", "sale_items", "sale_payments", "receipts"} {
		var digest string
		if err = tx.QueryRow(ctx, "SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM "+table+" t WHERE organization_id=$1", org).Scan(&digest); err != nil {
			t.Fatal(err)
		}
		result.WriteString(digest)
	}
	return result.String()
}

func posCustomerHTTP(t *testing.T, ctx context.Context, auth identity.Handler, organizations *organization.Service, point *pos.Service, owner, guest testsupport.MFASession, primaryToken, primaryCSRF, org string, cart pos.Cart, input pos.CustomerInput) pos.Cart {
	t.Helper()
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, pos.Handler{Service: point}.TenantRoutes)
	for _, candidate := range []struct {
		name, token, csrf, origin string
		status                    int
		code                      string
	}{
		{"missing cookie", "", "", testsupport.MFAOrigin, 401, "UNAUTHENTICATED"},
		{"primary cookie", primaryToken, primaryCSRF, testsupport.MFAOrigin, 403, "MFA_REQUIRED"},
		{"foreign cookie", guest.Token, guest.CSRF, testsupport.MFAOrigin, 404, "NOT_FOUND"},
		{"missing CSRF", owner.Token, "", testsupport.MFAOrigin, 403, "INVALID_CSRF"},
		{"foreign Origin", owner.Token, owner.CSRF, "https://foreign.example.test", 403, "INVALID_ORIGIN"},
	} {
		t.Run("HTTP "+candidate.name, func(t *testing.T) {
			body, _ := json.Marshal(input)
			request := httptest.NewRequest(http.MethodPatch, "/organizations/"+org+"/pos/carts/"+cart.ID+"/customer", strings.NewReader(string(body))).WithContext(ctx)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Origin", candidate.origin)
			request.Header.Set("X-CSRF-Token", candidate.csrf)
			if candidate.token != "" {
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: candidate.token})
			}
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != candidate.status || !strings.Contains(response.Body.String(), candidate.code) || strings.Contains(response.Body.String(), `"data"`) || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("POS HTTP denial status=%d body=%s", response.Code, response.Body.String())
			}
		})
	}
	body, _ := json.Marshal(input)
	request := httptest.NewRequest(http.MethodPatch, "/organizations/"+org+"/pos/carts/"+cart.ID+"/customer", strings.NewReader(string(body))).WithContext(ctx)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", testsupport.MFAOrigin)
	request.Header.Set("X-CSRF-Token", owner.CSRF)
	request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	var envelope struct{ Data pos.Cart }
	if response.Code != 200 || response.Header().Get("Cache-Control") != "no-store" || json.Unmarshal(response.Body.Bytes(), &envelope) != nil || envelope.Data.ID != cart.ID || envelope.Data.Revision != cart.Revision+1 || envelope.Data.CustomerID == nil || *envelope.Data.CustomerID != *input.CustomerID {
		t.Fatalf("POS cookie success contract status=%d", response.Code)
	}
	return envelope.Data
}

func posCustomerDomain(t *testing.T, ctx context.Context, organizations *organization.Service, point *pos.Service, user, org string, cart pos.Cart, customer customers.Customer) {
	t.Helper()
	t.Run("tenant isolation", func(t *testing.T) {
		other, err := organizations.Create(ctx, user, "df400000-0000-4000-8000-000000000005", organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Other POS customer", Code: "OTHERPOSMFA", BusinessType: "RETAIL"}, Branch: organization.BranchInput{Name: "Other", Code: "MAIN", Status: "ACTIVE"}})
		if err != nil {
			t.Fatal(err)
		}
		foreignOrg := other.Organization.ID
		foreignCustomer, err := (&customers.Service{Organization: organizations}).Save(ctx, user, foreignOrg, "", "df400000-0000-4000-8000-000000000006", customers.Input{Code: "FOREIGN", Name: "Other tenant customer"})
		if err != nil {
			t.Fatal(err)
		}
		localBefore := posCustomerSnapshot(t, ctx, organizations, user, org)
		foreignBefore := posCustomerSnapshot(t, ctx, organizations, user, foreignOrg)
		for _, attempt := range []struct {
			org, customer string
		}{{org, foreignCustomer.ID}, {foreignOrg, customer.ID}} {
			value, failure := point.SelectCustomer(ctx, user, attempt.org, cart.ID, pos.CustomerInput{Revision: cart.Revision, CustomerID: &attempt.customer})
			if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("foreign POS selection: %v", failure)
			}
		}
		if posCustomerSnapshot(t, ctx, organizations, user, org) != localBefore || posCustomerSnapshot(t, ctx, organizations, user, foreignOrg) != foreignBefore {
			t.Fatal("foreign POS selection changed tenant data")
		}
	})
	t.Run("revision concurrency", func(t *testing.T) {
		result := make(chan error, 2)
		for range 2 {
			go func() {
				value, failure := point.SelectCustomer(ctx, user, org, cart.ID, pos.CustomerInput{Revision: cart.Revision, CustomerID: &customer.ID})
				if failure != nil && !reflect.ValueOf(value).IsZero() {
					failure = errors.New("conflicting selection exposed a cart")
				}
				result <- failure
			}()
		}
		first, second := <-result, <-result
		if !(first == nil && errors.Is(second, pos.ErrConflict) || second == nil && errors.Is(first, pos.ErrConflict)) {
			t.Fatalf("POS concurrent selection: %v / %v", first, second)
		}
	})
	current, err := point.Cart(ctx, user, org, cart.ID)
	if err != nil || current.CustomerID == nil || *current.CustomerID != customer.ID || current.Customer == nil || current.Revision != cart.Revision+1 {
		t.Fatalf("selected POS customer projection: %v", err)
	}
	cleared, err := point.SelectCustomer(ctx, user, org, cart.ID, pos.CustomerInput{Revision: current.Revision})
	if err != nil || cleared.CustomerID != nil || cleared.Customer != nil || cleared.Revision != current.Revision+1 {
		t.Fatalf("clear POS customer: %v", err)
	}
	held, err := point.UpdateCart(ctx, user, org, cart.ID, "hold", pos.CartInput{Revision: cleared.Revision})
	if err != nil {
		t.Fatal(err)
	}
	held, err = point.SelectCustomer(ctx, user, org, cart.ID, pos.CustomerInput{Revision: held.Revision, CustomerID: &customer.ID})
	if err != nil || held.Status != "HELD" || held.CustomerID == nil || *held.CustomerID != customer.ID {
		t.Fatalf("held POS customer: %v", err)
	}
	cleared, err = point.SelectCustomer(ctx, user, org, cart.ID, pos.CustomerInput{Revision: held.Revision})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = (&customers.Service{Organization: organizations}).Archive(ctx, user, org, customer.ID, customer.Revision, false); err != nil {
		t.Fatal(err)
	}
	before := posCustomerSnapshot(t, ctx, organizations, user, org)
	value, err := point.SelectCustomer(ctx, user, org, cart.ID, pos.CustomerInput{Revision: cleared.Revision, CustomerID: &customer.ID})
	if !errors.Is(err, pos.ErrConflict) || !reflect.ValueOf(value).IsZero() || posCustomerSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("archived POS customer selected: %v", err)
	}
	t.Run("active customer checkout compatibility", func(t *testing.T) {
		active, err := (&customers.Service{Organization: organizations}).Save(ctx, user, org, "", "df400000-0000-4000-8000-000000000007", customers.Input{Code: "CHECKOUT", Name: "Active checkout customer"})
		if err != nil {
			t.Fatal(err)
		}
		catalogService := &catalog.Service{Organization: organizations}
		unit, err := catalogService.SaveTaxonomy(ctx, user, org, "units", "", catalog.TaxonomyInput{Name: "POS MFA unit", Code: "POSMFA", UnitType: "COUNT", Status: "ACTIVE"})
		if err != nil {
			t.Fatal(err)
		}
		product, err := catalogService.CreateProduct(ctx, user, org, catalog.CreateInput{ProductInput: catalog.ProductInput{Name: "POS MFA product", Status: "ACTIVE"}, Variants: []catalog.VariantInput{{SKU: "POSMFA", Name: "POS MFA variant", UnitID: unit.ID, CostPrice: "1.00", SellingPrice: "10.00", Status: "ACTIVE"}}})
		if err != nil {
			t.Fatal(err)
		}
		ready, err := point.UpdateCart(ctx, user, org, cart.ID, "resume", pos.CartInput{Revision: cleared.Revision})
		if err != nil {
			t.Fatal(err)
		}
		ready, err = point.UpdateCart(ctx, user, org, cart.ID, "update", pos.CartInput{Revision: ready.Revision, Items: []pos.ItemInput{{VariantID: product.Variants[0].ID, Quantity: "1.000"}}})
		if err != nil {
			t.Fatal(err)
		}
		ready, err = point.SelectCustomer(ctx, user, org, cart.ID, pos.CustomerInput{Revision: ready.Revision, CustomerID: &active.ID})
		if err != nil {
			t.Fatal(err)
		}
		checkout, err := point.PrepareCheckout(ctx, user, org, "df400000-0000-4000-8000-000000000008", pos.CheckoutInput{CartID: cart.ID, Revision: ready.Revision, Method: "CASH", ExpectedTotal: ready.Total, Received: ready.Total, PricingRevision: ready.Pricing.Revision})
		if err != nil {
			t.Fatal(err)
		}
		before := posCustomerSnapshot(t, ctx, organizations, user, org)
		value, failure := point.SelectCustomer(ctx, user, org, cart.ID, pos.CustomerInput{Revision: ready.Revision})
		if !errors.Is(failure, pos.ErrPending) || !reflect.ValueOf(value).IsZero() || posCustomerSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("pending checkout selection changed: %v", failure)
		}
		checkout, err = point.ConfirmPayment(ctx, user, org, checkout.ID, "df400000-0000-4000-8000-000000000009", pos.ConfirmationInput{Acknowledged: true})
		if err != nil {
			t.Fatal(err)
		}
		checkout, err = point.CompleteCheckout(ctx, user, org, checkout.ID)
		if err != nil || checkout.Status != "COMPLETED" || checkout.CustomerID == nil || *checkout.CustomerID != active.ID || checkout.CustomerCode != active.Code || checkout.Total != "10.00" {
			t.Fatalf("POS selected customer checkout: %v", err)
		}
	})
}

func seedPOSCustomerCart(t *testing.T, ctx context.Context, organizations *organization.Service, point *pos.Service, user, org string) pos.Cart {
	t.Helper()
	tx, _, err := organizations.Authorized(ctx, user, org, "pos.cart.manage")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var branch, location, terminal string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM branches WHERE organization_id=$1 ORDER BY id LIMIT 1", org).Scan(&branch); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO stock_locations(organization_id,branch_id,code,name,type,created_by,updated_by) VALUES($1,$2,'POSMFA','POS MFA stock','SALES_FLOOR',$3,$3) RETURNING id::text`, org, branch, user).Scan(&location); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO pos_terminals(organization_id,branch_id,code,name,stock_location_id) VALUES($1,$2,'POSMFA','POS MFA terminal',$3) RETURNING id::text`, org, branch, location).Scan(&terminal); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = point.OpenShift(ctx, user, org, "df400000-0000-4000-8000-000000000003", pos.ShiftInput{TerminalID: terminal, OpeningCash: "0.00"}); err != nil {
		t.Fatal(err)
	}
	cart, err := point.CreateCart(ctx, user, org, "df400000-0000-4000-8000-000000000004", pos.CartInput{TerminalID: terminal})
	if err != nil {
		t.Fatal(err)
	}
	return cart
}
