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
	"smartpos/api/internal/modules/customers"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/testsupport"
)

type customerReadOperation struct {
	name, path string
	run        func(context.Context, *customers.Service, string, string) (any, error)
}

func customerReadMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string) {
	t.Helper()
	ctx = owner.Context
	service := &customers.Service{Organization: organizations}
	user := identity.SessionFromContext(ctx).User.ID
	customer, err := service.Save(ctx, user, org, "", "df200000-0000-4000-8000-000000000002", customers.Input{Code: "PRIVATE", Name: "Private customer", Phone: "0812345678", Email: "customer@example.test", Notes: "Private notes", MarketingConsent: true})
	if err != nil {
		t.Fatal(err)
	}
	operations := []customerReadOperation{
		{"get", "/customers/" + customer.ID, func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.Get(c, u, o, customer.ID)
		}},
		{"list", "/customers", func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.List(c, u, o, customers.Filter{})
		}},
		{"groups", "/customers/groups", func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.Groups(c, u, o, customers.Filter{})
		}},
		{"history", "/customers/" + customer.ID + "/history", func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.History(c, u, o, customer.ID, customers.Filter{})
		}},
		{"audit", "/customers/" + customer.ID + "/audit", func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.Audit(c, u, o, customer.ID, customers.Filter{})
		}},
	}
	_, token, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, token)
	for _, operation := range operations {
		t.Run(operation.name+" independent denial", func(t *testing.T) {
			for _, candidate := range []struct {
				ctx  context.Context
				want error
			}{{context.Background(), identity.ErrInvalidToken}, {primary, identity.ErrMFARequired}, {guest.Context, identity.ErrInvalidToken}} {
				value, failure := operation.run(candidate.ctx, service, user, org)
				if !errors.Is(failure, candidate.want) || !reflect.ValueOf(value).IsZero() {
					t.Errorf("private customer read returned data or wrong denial: %v", failure)
				}
			}
		})
	}
	foreign := identity.SessionFromContext(guest.Context).User.ID
	for _, operation := range operations {
		t.Run(operation.name+" scope", func(t *testing.T) {
			for _, status := range []string{"", "ACTIVE", "SUSPENDED"} {
				privateReadMembership(t, ctx, organizations, user, org, foreign, status)
				want := organization.ErrNotFound
				if status == "ACTIVE" {
					want = organization.ErrDenied
				}
				value, failure := operation.run(guest.Context, service, foreign, org)
				if !errors.Is(failure, want) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("customer scope denial: %v", failure)
				}
			}
			privateReadMembership(t, ctx, organizations, user, org, foreign, "")
			pinned := &customers.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
			value, failure := operation.run(ctx, pinned, user, org)
			if !errors.Is(failure, organization.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("customer pinned denial: %v", failure)
			}
			if _, failure = operation.run(ctx, service, user, org); failure != nil {
				t.Fatalf("assured customer read: %v", failure)
			}
		})
	}
	t.Run("stale revoked context", func(t *testing.T) {
		session := identity.SessionFromContext(owner.Context).ID
		if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1", session); failure != nil {
			t.Fatal(failure)
		}
		defer func() {
			if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=NULL WHERE id=$1", session); failure != nil {
				t.Error(failure)
			}
		}()
		for _, operation := range operations {
			value, failure := operation.run(owner.Context, service, user, org)
			if !errors.Is(failure, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() {
				t.Errorf("revoked %s returned private data: %v", operation.name, failure)
			}
		}
	})
	group, err := service.SaveGroup(ctx, user, org, "", "df200000-0000-4000-8000-000000000003", customers.Group{Code: "PRIVATE", Name: "Private group", Status: "ACTIVE"})
	if err != nil {
		t.Fatal(err)
	}
	customer, err = service.Membership(ctx, user, org, customer.ID, group.ID, customers.MembershipInput{Revision: customer.Revision, GroupRevision: group.Revision, Present: true})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = service.Save(ctx, user, org, "", "df200000-0000-4000-8000-000000000004", customers.Input{Code: "SECOND", Name: "Second customer"}); err != nil {
		t.Fatal(err)
	}
	if value, failure := service.Get(ctx, user, org, customer.ID); failure != nil || value.Phone != "0812345678" || value.Email != "customer@example.test" || value.Notes != "Private notes" || !value.MarketingConsent || len(value.Groups) != 1 || value.Groups[0].MemberCount != 1 {
		t.Fatalf("assured private customer projection: %v", failure)
	}
	for _, f := range []struct {
		filter       customers.Filter
		total, count int
	}{{customers.Filter{PageSize: 1}, 2, 1}, {customers.Filter{Page: 3, PageSize: 1}, 2, 0}, {customers.Filter{Search: "private", GroupID: group.ID}, 1, 1}, {customers.Filter{Search: "%"}, 0, 0}} {
		value, failure := service.List(ctx, user, org, f.filter)
		if failure != nil || value.Total != f.total || len(value.Items.([]customers.Customer)) != f.count {
			t.Fatalf("customer filters/pagination: %v", failure)
		}
	}
	if history, failure := service.History(ctx, user, org, customer.ID, customers.Filter{}); failure != nil || history.Total != 0 || len(history.Items.([]json.RawMessage)) != 0 || history.Summary.Paid != "0.00" || history.Summary.NetCollected != "0.00" {
		t.Fatalf("empty customer history: %v", failure)
	}
	if audit, failure := service.Audit(ctx, user, org, customer.ID, customers.Filter{Page: 1, PageSize: 25}); failure != nil || audit.Total != 2 || len(audit.Items.([]json.RawMessage)) != 2 {
		t.Fatalf("customer audit projection: %v", failure)
	}
	write, _, err := organizations.Authorized(ctx, user, org, "customers.read")
	if err != nil {
		t.Fatal(err)
	}
	if err = organization.RecordAudit(ctx, write, org, user, "pos.customer.read.fixture", customer.ID); err == nil {
		err = write.Commit(ctx)
	}
	write.Rollback(ctx)
	if err != nil {
		t.Fatal(err)
	}
	audit, err := service.Audit(ctx, user, org, customer.ID, customers.Filter{BranchID: "11111111-1111-4111-8111-111111111111", From: time.Now().Add(time.Hour).Format(time.RFC3339), Page: 1, PageSize: 25})
	if err != nil || audit.Total != 2 || len(audit.Items.([]json.RawMessage)) != 2 {
		t.Fatalf("audit event prefix/object scope or unchanged date/branch behavior: %v", err)
	}
	branch, occurred := seedCustomerReadSale(t, ctx, organizations, user, org, customer.ID)
	for _, candidate := range []struct {
		filter customers.Filter
		total  int
		paid   string
	}{
		{customers.Filter{}, 1, "10.00"},
		{customers.Filter{BranchID: branch, From: occurred.Format(time.RFC3339Nano), To: occurred.Format(time.RFC3339Nano)}, 1, "10.00"},
		{customers.Filter{From: occurred.Add(time.Second).Format(time.RFC3339Nano)}, 0, "0.00"},
		{customers.Filter{To: occurred.Add(-time.Second).Format(time.RFC3339Nano)}, 0, "0.00"},
	} {
		history, failure := service.History(ctx, user, org, customer.ID, candidate.filter)
		if failure != nil || history.Total != candidate.total || len(history.Items.([]json.RawMessage)) != candidate.total || history.Summary.Purchases != candidate.total || history.Summary.Paid != candidate.paid || history.Summary.NetCollected != candidate.paid || history.Summary.Refunded != "0.00" || history.Summary.PendingRefund != "0.00" {
			t.Fatalf("customer history exact amount/date/branch: %v", failure)
		}
		for _, raw := range history.Items.([]json.RawMessage) {
			var item struct {
				Amount, Paid, BranchID string
				Kind                   string `json:"kind"`
			}
			var fields map[string]json.RawMessage
			if json.Unmarshal(raw, &item) != nil || json.Unmarshal(raw, &fields) != nil || item.Amount != "10.00" || item.Paid != "10.00" || item.Kind != "SALE" || len(fields["phone"]) != 0 || len(fields["email"]) != 0 || len(fields["notes"]) != 0 {
				t.Fatal("history changed exact values or disclosed contact")
			}
		}
	}
	for _, read := range []func() (any, error){
		func() (any, error) { return service.Get(ctx, user, org, "11111111-1111-4111-8111-111111111111") },
		func() (any, error) {
			return service.History(ctx, user, org, "11111111-1111-4111-8111-111111111111", customers.Filter{})
		},
		func() (any, error) {
			return service.Audit(ctx, user, org, "11111111-1111-4111-8111-111111111111", customers.Filter{})
		},
		func() (any, error) {
			return service.List(ctx, user, org, customers.Filter{BranchID: "11111111-1111-4111-8111-111111111111"})
		},
	} {
		value, failure := read()
		if !errors.Is(failure, customers.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("missing customer/branch: %v", failure)
		}
	}
	for _, read := range []func() (any, error){
		func() (any, error) { return service.List(ctx, user, org, customers.Filter{Page: -1}) },
		func() (any, error) { return service.Groups(ctx, user, org, customers.Filter{Page: -1}) },
		func() (any, error) { return service.History(ctx, user, org, customer.ID, customers.Filter{Page: -1}) },
		func() (any, error) { return service.Audit(ctx, user, org, customer.ID, customers.Filter{Page: -1}) },
	} {
		value, failure := read()
		if !errors.Is(failure, customers.ErrInput) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("invalid customer filter: %v", failure)
		}
	}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, customers.Handler{Service: service}.TenantRoutes)
	paths := append([]customerReadOperation{}, operations...)
	paths = append(paths, customerReadOperation{name: "search", path: "/customers/search"})
	for _, operation := range paths {
		t.Run("HTTP "+operation.name, func(t *testing.T) {
			method := http.MethodGet
			if operation.name == "search" {
				method = http.MethodPost
			}
			for _, candidate := range []struct {
				token, csrf, code string
				status            int
			}{{"", "", "UNAUTHENTICATED", 401}, {token, identity.SessionFromContext(primary).CSRFToken, "MFA_REQUIRED", 403}, {owner.Token, owner.CSRF, "", 200}} {
				request := httptest.NewRequest(method, "/organizations/"+org+operation.path, strings.NewReader(`{}`)).WithContext(ctx)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: candidate.token})
				request.Header.Set("Origin", testsupport.MFAOrigin)
				request.Header.Set("X-CSRF-Token", candidate.csrf)
				request.Header.Set("Content-Type", "application/json")
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				var body struct {
					Data  json.RawMessage
					Error struct{ Code string }
				}
				failure := json.Unmarshal(response.Body.Bytes(), &body)
				if failure != nil || response.Code != candidate.status || body.Error.Code != candidate.code || response.Header().Get("Cache-Control") != "no-store" || candidate.status != 200 && len(body.Data) != 0 {
					t.Fatalf("customer HTTP status=%d code=%s want=%d/%s: %v", response.Code, body.Error.Code, candidate.status, candidate.code, failure)
				}
				if candidate.status != 200 && (strings.Contains(response.Body.String(), "Private") || strings.Contains(response.Body.String(), "0812345678")) {
					t.Fatal("customer HTTP denial leaked data")
				}
			}
		})
	}
	for _, origin := range []string{testsupport.MFAOrigin, "https://untrusted.example.test"} {
		request := httptest.NewRequest(http.MethodPost, "/organizations/"+org+"/customers/search", strings.NewReader(`{}`)).WithContext(ctx)
		request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
		request.Header.Set("Origin", origin)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != 403 || strings.Contains(response.Body.String(), `"data"`) {
			t.Fatal("customer search bypassed Origin/CSRF")
		}
	}
	before := customerReadSnapshot(t, ctx, organizations, user, org)
	for index, operation := range operations {
		for _, expiry := range []bool{true, false} {
			t.Run(operation.name+map[bool]string{true: " lock expiry", false: " lock cancellation"}[expiry], func(t *testing.T) {
				tables := []string{"customers", "customers", "customer_groups", "customers", "customers"}
				verifyPrivateReadWait(t, ctx, pool, owner, tables[index], expiry, func(request context.Context) (any, error) { return operation.run(request, service, user, org) })
			})
		}
		t.Run(operation.name+" final assurance cancellation", func(t *testing.T) {
			counts := []int{3, 4, 4, 5, 5}
			catalogReadInterrupted(t, ctx, pool, owner, "WITH decision AS MATERIALIZED", counts[index], true, func(request context.Context, traced *catalog.Service) (any, error) {
				return operation.run(request, &customers.Service{Organization: traced.Organization}, user, org)
			})
		})
	}
	for _, boundary := range []struct {
		name, prefix string
		index, count int
	}{
		{"get projection", "SELECT item.id::text", 0, 1},
		{"list count", "SELECT count(*) FROM customers", 1, 1},
		{"list rows", "SELECT item.id::text", 1, 1},
		{"group count", "SELECT count(*) FROM customer_groups", 2, 1},
		{"group rows", "SELECT item.id::text", 2, 1},
		{"history lookup", "SELECT item.id::text", 3, 1},
		{"history summary", "WITH linked AS", 3, 1},
		{"history rows", "WITH linked AS", 3, 2},
		{"audit lookup", "SELECT item.id::text", 4, 1},
		{"audit count", "SELECT count(*) FROM organization_audit_events", 4, 1},
		{"audit rows", "SELECT jsonb_build_object", 4, 1},
	} {
		for _, cancel := range []bool{false, true} {
			t.Run(boundary.name+map[bool]string{false: " expiry", true: " cancellation"}[cancel], func(t *testing.T) {
				catalogReadInterrupted(t, ctx, pool, owner, boundary.prefix, boundary.count, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
					return operations[boundary.index].run(request, &customers.Service{Organization: traced.Organization}, user, org)
				}, true)
			})
		}
	}
	if customerReadSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatal("customer private reads changed business state")
	}
	for _, failure := range []struct {
		index  int
		prefix string
		count  int
	}{{1, "SELECT item.id::text", 1}, {2, "SELECT item.id::text", 1}, {3, "WITH linked AS", 2}, {4, "SELECT jsonb_build_object", 1}} {
		t.Run(operations[failure.index].name+" aborted projection", func(t *testing.T) {
			trace := &customerReadFailureTrace{prefix: failure.prefix, remaining: failure.count}
			configuration := pool.Config()
			configuration.ConnConfig.Tracer = trace
			tracedPool, err := pgxpool.NewWithConfig(ctx, configuration)
			if err != nil {
				t.Fatal(err)
			}
			defer tracedPool.Close()
			value, err := operations[failure.index].run(ctx, &customers.Service{Organization: &organization.Service{Pool: tracedPool}}, user, org)
			if err == nil || trace.failure == nil || trace.remaining != 0 || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("failed projection disclosed partial result: %v", err)
			}
		})
	}
	if customerReadSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatal("aborted customer reads changed business state")
	}
	customerReadIsolation(t, ctx, organizations, service, user, org, customer.ID, group.ID)
}

type customerReadFailureTrace struct {
	prefix    string
	remaining int
	failure   error
}

func (trace *customerReadFailureTrace) TraceQueryStart(ctx context.Context, connection *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	if strings.HasPrefix(data.SQL, trace.prefix) {
		trace.remaining--
		if trace.remaining == 0 {
			_, trace.failure = connection.Exec(ctx, "SELECT 1/0")
		}
	}
	return ctx
}
func (*customerReadFailureTrace) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func seedCustomerReadSale(t *testing.T, ctx context.Context, organizations *organization.Service, user, org, customer string) (string, time.Time) {
	t.Helper()
	tx, _, err := organizations.Authorized(ctx, user, org, "customers.read")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var branch, location, terminal string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM branches WHERE organization_id=$1", org).Scan(&branch); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO stock_locations(organization_id,branch_id,code,name,type,created_by,updated_by) VALUES($1,$2,'HISTORY','History stock','SALES_FLOOR',$3,$3) RETURNING id::text`, org, branch, user).Scan(&location); err != nil {
		t.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO pos_terminals(organization_id,branch_id,code,name,stock_location_id) VALUES($1,$2,'HISTORY','History POS',$3) RETURNING id::text`, org, branch, location).Scan(&terminal); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	catalogService := &catalog.Service{Organization: organizations}
	unit, err := catalogService.SaveTaxonomy(ctx, user, org, "units", "", catalog.TaxonomyInput{Name: "History unit", Code: "HISTORY", UnitType: "COUNT", Status: "ACTIVE"})
	if err != nil {
		t.Fatal(err)
	}
	product, err := catalogService.CreateProduct(ctx, user, org, catalog.CreateInput{ProductInput: catalog.ProductInput{Name: "History product", Status: "ACTIVE"}, Variants: []catalog.VariantInput{{SKU: "HISTORY", Name: "History variant", UnitID: unit.ID, CostPrice: "1.00", SellingPrice: "10.00", Status: "ACTIVE"}}})
	if err != nil {
		t.Fatal(err)
	}
	variant := product.Variants[0].ID
	point := &pos.Service{Organization: organizations}
	if _, err = point.OpenShift(ctx, user, org, "df210000-0000-4000-8000-000000000001", pos.ShiftInput{TerminalID: terminal, OpeningCash: "0.00"}); err != nil {
		t.Fatal(err)
	}
	cart, err := point.CreateCart(ctx, user, org, "df210000-0000-4000-8000-000000000002", pos.CartInput{TerminalID: terminal})
	if err != nil {
		t.Fatal(err)
	}
	cart, err = point.UpdateCart(ctx, user, org, cart.ID, "update", pos.CartInput{Revision: cart.Revision, Items: []pos.ItemInput{{VariantID: variant, Quantity: "1.000"}}})
	if err != nil {
		t.Fatal(err)
	}
	cart, err = point.SelectCustomer(ctx, user, org, cart.ID, pos.CustomerInput{Revision: cart.Revision, CustomerID: &customer})
	if err != nil {
		t.Fatal(err)
	}
	checkout, err := point.PrepareCheckout(ctx, user, org, "df210000-0000-4000-8000-000000000003", pos.CheckoutInput{CartID: cart.ID, Revision: cart.Revision, Method: "CASH", ExpectedTotal: cart.Total, Received: cart.Total, PricingRevision: cart.Pricing.Revision})
	if err != nil {
		t.Fatal(err)
	}
	checkout, err = point.ConfirmPayment(ctx, user, org, checkout.ID, "df210000-0000-4000-8000-000000000004", pos.ConfirmationInput{Acknowledged: true})
	if err != nil {
		t.Fatal(err)
	}
	checkout, err = point.CompleteCheckout(ctx, user, org, checkout.ID)
	if err != nil || checkout.Status != "COMPLETED" {
		t.Fatalf("customer history sale fixture: %v", err)
	}
	read, _, err := organizations.Authorized(ctx, user, org, "customers.read")
	if err != nil {
		t.Fatal(err)
	}
	defer read.Rollback(ctx)
	var occurred time.Time
	if err = read.QueryRow(ctx, "SELECT completed_at FROM sales WHERE organization_id=$1 AND id=$2", org, checkout.SaleID).Scan(&occurred); err != nil {
		t.Fatal(err)
	}
	return branch, occurred
}

func customerReadSnapshot(t *testing.T, ctx context.Context, organizations *organization.Service, user, org string) string {
	t.Helper()
	tx, _, err := organizations.Authorized(ctx, user, org, "customers.read")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var result strings.Builder
	for _, table := range []string{"customers", "customer_groups", "customer_group_memberships", "organization_audit_events", "sales", "sale_payments", "customer_returns", "customer_refunds", "sale_adjustments"} {
		var digest string
		if err = tx.QueryRow(ctx, "SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM "+table+" t WHERE organization_id=$1", org).Scan(&digest); err != nil {
			t.Fatal(err)
		}
		result.WriteString(digest)
	}
	return result.String()
}

func customerReadIsolation(t *testing.T, ctx context.Context, organizations *organization.Service, service *customers.Service, user, org, customerID, groupID string) {
	t.Helper()
	other, err := organizations.Create(ctx, user, "df200000-0000-4000-8000-000000000005", organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Other customers", Code: "CUSTOTHER", BusinessType: "RETAIL"}, Branch: organization.BranchInput{Name: "Other", Code: "MAIN", Status: "ACTIVE"}})
	if err != nil {
		t.Fatal(err)
	}
	otherID := other.Organization.ID
	for _, read := range []func() (any, error){func() (any, error) { return service.Get(ctx, user, otherID, customerID) }, func() (any, error) { return service.History(ctx, user, otherID, customerID, customers.Filter{}) }, func() (any, error) { return service.Audit(ctx, user, otherID, customerID, customers.Filter{}) }} {
		value, failure := read()
		if !errors.Is(failure, customers.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("foreign customer disclosed data: %v", failure)
		}
	}
	value, err := service.List(ctx, user, otherID, customers.Filter{GroupID: groupID})
	if err != nil || value.Total != 0 || len(value.Items.([]customers.Customer)) != 0 {
		t.Fatalf("foreign customer group disclosed data: %v", err)
	}
	for _, read := range []func() (any, error){func() (any, error) {
		return service.List(ctx, user, org, customers.Filter{BranchID: other.Branches[0].ID})
	}, func() (any, error) {
		return service.History(ctx, user, org, customerID, customers.Filter{BranchID: other.Branches[0].ID})
	}} {
		value, failure := read()
		if !errors.Is(failure, customers.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("foreign branch disclosed data: %v", failure)
		}
	}
}
