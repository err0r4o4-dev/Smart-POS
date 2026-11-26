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
	"smartpos/api/internal/testsupport"
)

type customerMutationOperation struct {
	name string
	run  func(context.Context, *customers.Service, string, string) (any, error)
}

func customerMutationZero(value any) bool {
	return value == nil || reflect.ValueOf(value).IsZero()
}

func customerMutationMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string) {
	t.Helper()
	ctx = owner.Context
	service := &customers.Service{Organization: organizations}
	user := identity.SessionFromContext(ctx).User.ID
	input := customers.Input{Code: "WRITE", Name: "Private writer", Phone: "0812345678", Email: "writer@example.test", Notes: "Private notes"}
	key := "df300000-0000-4000-8000-000000000002"
	customer, err := service.Save(ctx, user, org, "", key, input)
	if err != nil {
		t.Fatal(err)
	}
	groupInput := customers.Group{Code: "WRITE", Name: "Private group", Status: "ACTIVE"}
	groupKey := "df300000-0000-4000-8000-000000000003"
	group, err := service.SaveGroup(ctx, user, org, "", groupKey, groupInput)
	if err != nil {
		t.Fatal(err)
	}
	update := input
	update.Name, update.Revision = "Updated writer", customer.Revision
	groupUpdate := groupInput
	groupUpdate.Name, groupUpdate.Revision = "Updated group", group.Revision
	operations := []customerMutationOperation{
		{"create", func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.Save(c, u, o, "", "df300000-0000-4000-8000-000000000004", customers.Input{Code: "NEW", Name: "New customer"})
		}},
		{"update", func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.Save(c, u, o, customer.ID, "", update)
		}},
		{"group create", func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.SaveGroup(c, u, o, "", "df300000-0000-4000-8000-000000000005", customers.Group{Code: "NEW", Name: "New group"})
		}},
		{"group update", func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.SaveGroup(c, u, o, group.ID, "", groupUpdate)
		}},
		{"archive", func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.Archive(c, u, o, customer.ID, customer.Revision, false)
		}},
		{"group archive", func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.Archive(c, u, o, group.ID, group.Revision, true)
		}},
		{"membership", func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.Membership(c, u, o, customer.ID, group.ID, customers.MembershipInput{Revision: customer.Revision, GroupRevision: group.Revision, Present: true})
		}},
		{"customer replay", func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.Save(c, u, o, "", key, input)
		}},
		{"group replay", func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.SaveGroup(c, u, o, "", groupKey, groupInput)
		}},
		{"membership no-op", func(c context.Context, s *customers.Service, u, o string) (any, error) {
			return s.Membership(c, u, o, customer.ID, group.ID, customers.MembershipInput{Revision: customer.Revision, GroupRevision: group.Revision})
		}},
	}
	_, token, primaryCSRF, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, token)
	t.Run("valid no-op denies missing session", func(t *testing.T) {
		value, failure := operations[9].run(context.Background(), service, user, org)
		if !errors.Is(failure, identity.ErrInvalidToken) || !customerMutationZero(value) {
			t.Errorf("valid membership no-op bypass: %v", failure)
		}
	})
	for _, op := range operations {
		t.Run(op.name+" independent denial", func(t *testing.T) {
			for _, candidate := range []struct {
				ctx  context.Context
				want error
			}{
				{context.Background(), identity.ErrInvalidToken}, {primary, identity.ErrMFARequired}, {guest.Context, identity.ErrInvalidToken},
			} {
				value, failure := op.run(candidate.ctx, service, user, org)
				if !errors.Is(failure, candidate.want) || !customerMutationZero(value) {
					t.Errorf("customer mutation bypass or partial result: %v", failure)
				}
			}
		})
	}
	before := customerReadSnapshot(t, ctx, organizations, user, org)
	foreign := identity.SessionFromContext(guest.Context).User.ID
	for _, op := range operations {
		t.Run(op.name+" scope", func(t *testing.T) {
			for _, status := range []string{"", "ACTIVE", "SUSPENDED"} {
				privateReadMembership(t, ctx, organizations, user, org, foreign, status)
				want := organization.ErrNotFound
				if status == "ACTIVE" {
					want = organization.ErrDenied
				}
				value, failure := op.run(guest.Context, service, foreign, org)
				if !errors.Is(failure, want) || !customerMutationZero(value) {
					t.Fatalf("customer writer scope: %v", failure)
				}
			}
			privateReadMembership(t, ctx, organizations, user, org, foreign, "")
			pinned := &customers.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
			value, failure := op.run(ctx, pinned, user, org)
			if !errors.Is(failure, organization.ErrNotFound) || !customerMutationZero(value) {
				t.Fatalf("pinned customer writer: %v", failure)
			}
		})
	}
	t.Run("revoked session denies every writer and replay", func(t *testing.T) {
		session := identity.SessionFromContext(ctx).ID
		if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1", session); failure != nil {
			t.Fatal(failure)
		}
		defer func() {
			if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=NULL WHERE id=$1", session); failure != nil {
				t.Error(failure)
			}
		}()
		for _, op := range operations {
			value, failure := op.run(ctx, service, user, org)
			if !errors.Is(failure, identity.ErrInvalidToken) || !customerMutationZero(value) {
				t.Errorf("revoked %s: %v", op.name, failure)
			}
		}
	})
	if customerReadSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatal("denied writer changed business/audit")
	}
	for index, table := range []string{"customers", "customers", "customer_groups", "customer_groups", "customers", "customer_groups", "customers"} {
		for _, expiry := range []bool{true, false} {
			t.Run(fmt.Sprintf("%s blocked expiry=%t", operations[index].name, expiry), func(t *testing.T) {
				verifyPrivateReadWait(t, ctx, pool, owner, table, expiry, func(request context.Context) (any, error) {
					value, failure := operations[index].run(request, service, user, org)
					if value == nil {
						value = struct{}{}
					}
					return value, failure
				})
				if customerReadSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("blocked writer retained effects")
				}
			})
		}
	}
	for _, boundary := range []struct {
		name, prefix string
		index, count int
	}{
		{"create lookup", "SELECT id::text,create_fingerprint FROM customers", 0, 1},
		{"created", "INSERT INTO customers", 0, 1},
		{"updated", "UPDATE customers SET code=", 1, 1},
		{"group created", "INSERT INTO customer_groups", 2, 1},
		{"group updated", "UPDATE customer_groups SET code=", 3, 1},
		{"archived", "UPDATE customers SET status=", 4, 1},
		{"group archived", "UPDATE customer_groups SET status=", 5, 1},
		{"relationship inserted", "INSERT INTO customer_group_memberships", 6, 1},
		{"customer revision", "UPDATE customers SET revision=", 6, 1},
		{"group revision", "UPDATE customer_groups SET revision=", 6, 1},
		{"membership final read", "SELECT item.id::text,item.code,item.name,item.phone", 6, 2},
		{"membership audit", "INSERT INTO organization_audit_events", 6, 1},
		{"customer final read", "SELECT item.id::text,item.code,item.name,item.phone", 1, 1},
		{"group final read", "SELECT item.id::text,item.code,item.name,item.status", 3, 1},
		{"customer replay read", "SELECT item.id::text,item.code,item.name,item.phone", 7, 1},
		{"group replay read", "SELECT item.id::text,item.code,item.name,item.status", 8, 1},
		{"no-op decision", "SELECT EXISTS(SELECT 1 FROM customer_group_memberships", 9, 1},
	} {
		for _, cancel := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s cancel=%t", boundary.name, cancel), func(t *testing.T) {
				catalogReadInterrupted(t, ctx, pool, owner, boundary.prefix, boundary.count, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
					value, failure := operations[boundary.index].run(request, &customers.Service{Organization: traced.Organization}, user, org)
					if value == nil {
						value = struct{}{}
					}
					return value, failure
				}, true)
				if customerReadSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("partly written customer mutation survived rollback")
				}
			})
		}
	}
	for _, fault := range []struct {
		name, prefix string
		index        int
	}{
		{"customer projection", "SELECT item.id::text,item.code,item.name,item.phone", 0},
		{"group projection", "SELECT item.id::text,item.code,item.name,item.status", 2},
		{"archive projection", "SELECT item.id::text,item.code,item.name,item.phone", 4},
		{"group archive projection", "SELECT item.id::text,item.code,item.name,item.status", 5},
		{"audit", "INSERT INTO organization_audit_events", 6},
	} {
		t.Run("aborted SQL "+fault.name, func(t *testing.T) {
			trace := &customerReadFailureTrace{prefix: fault.prefix, remaining: 1}
			configuration := pool.Config()
			configuration.ConnConfig.Tracer = trace
			tracedPool, failure := pgxpool.NewWithConfig(ctx, configuration)
			if failure != nil {
				t.Fatal(failure)
			}
			defer tracedPool.Close()
			value, failure := operations[fault.index].run(ctx, &customers.Service{Organization: &organization.Service{Pool: tracedPool}}, user, org)
			if failure == nil || trace.failure == nil || !customerMutationZero(value) {
				t.Fatalf("SQL fault retained payload: %v", failure)
			}
			if customerReadSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatal("SQL fault retained effects")
			}
		})
	}
	customerMutationHTTP(t, ctx, auth, organizations, service, owner, guest, token, primaryCSRF, org, customer, group, input)
	customerMutationDomain(t, ctx, pool, organizations, service, owner, guest, org, customer, group, input, groupInput, key, groupKey)
}

func customerMutationHTTP(t *testing.T, ctx context.Context, auth identity.Handler, organizations *organization.Service, service *customers.Service, owner, guest testsupport.MFASession, primaryToken, primaryCSRF, org string, customer customers.Customer, group customers.Group, input customers.Input) {
	t.Helper()
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, customers.Handler{Service: service}.TenantRoutes)
	input.Revision = customer.Revision
	groupUpdate := customers.GroupInput{Code: group.Code, Name: group.Name, Revision: group.Revision}
	for _, op := range []struct {
		method, path, key string
		body              any
	}{
		{http.MethodPost, "/customers", "df300000-0000-4000-8000-000000000006", customers.Input{Code: "HTTP", Name: "HTTP customer"}},
		{http.MethodPut, "/customers/" + customer.ID, "", input},
		{http.MethodPost, "/customers/groups", "df300000-0000-4000-8000-000000000007", customers.GroupInput{Code: "HTTP", Name: "HTTP group"}},
		{http.MethodPut, "/customers/groups/" + group.ID, "", groupUpdate},
		{http.MethodPost, "/customers/" + customer.ID + "/archive", "", map[string]any{"revision": customer.Revision}},
		{http.MethodPost, "/customers/groups/" + group.ID + "/archive", "", map[string]any{"revision": group.Revision}},
		{http.MethodPut, "/customers/" + customer.ID + "/groups/" + group.ID, "", customers.MembershipInput{Revision: customer.Revision, GroupRevision: group.Revision, Present: true}},
	} {
		t.Run("HTTP "+op.method+" "+op.path, func(t *testing.T) {
			body, _ := json.Marshal(op.body)
			for _, candidate := range []struct {
				token, csrf string
				status      int
				code        string
			}{
				{"", "", 401, "UNAUTHENTICATED"}, {primaryToken, primaryCSRF, 403, "MFA_REQUIRED"}, {guest.Token, guest.CSRF, 404, "NOT_FOUND"},
				{owner.Token, "", 403, "INVALID_CSRF"},
			} {
				request := httptest.NewRequest(op.method, "/organizations/"+org+op.path, strings.NewReader(string(body))).WithContext(ctx)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("Origin", testsupport.MFAOrigin)
				request.Header.Set("X-CSRF-Token", candidate.csrf)
				request.Header.Set("Idempotency-Key", op.key)
				if candidate.token != "" {
					request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: candidate.token})
				}
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				if response.Code != candidate.status || !strings.Contains(response.Body.String(), candidate.code) || strings.Contains(response.Body.String(), `"data"`) || response.Header().Get("Cache-Control") != "no-store" {
					t.Fatalf("writer HTTP denial status=%d body=%s", response.Code, response.Body.String())
				}
			}
			request := httptest.NewRequest(op.method, "/organizations/"+org+op.path, strings.NewReader(string(body))).WithContext(ctx)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Origin", "https://foreign.example.test")
			request.Header.Set("X-CSRF-Token", owner.CSRF)
			request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != 403 || strings.Contains(response.Body.String(), `"data"`) {
				t.Fatal("writer foreign Origin bypass")
			}
		})
	}
	t.Run("seven cookie writer success contracts", func(t *testing.T) {
		send := func(method, path, key string, body any, target any) {
			data, _ := json.Marshal(body)
			request := httptest.NewRequest(method, "/organizations/"+org+path, strings.NewReader(string(data))).WithContext(ctx)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Origin", testsupport.MFAOrigin)
			request.Header.Set("X-CSRF-Token", owner.CSRF)
			request.Header.Set("Idempotency-Key", key)
			request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != 200 || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("writer HTTP success status=%d body=%s", response.Code, response.Body.String())
			}
			var envelope struct{ Data json.RawMessage }
			if json.Unmarshal(response.Body.Bytes(), &envelope) != nil || json.Unmarshal(envelope.Data, target) != nil {
				t.Fatal("writer HTTP success schema")
			}
		}
		var c customers.Customer
		var g customers.Group
		send(http.MethodPost, "/customers", "df300000-0000-4000-8000-000000000008", customers.Input{Code: "HTTPSUCCESS", Name: "Cookie customer"}, &c)
		send(http.MethodPut, "/customers/"+c.ID, "", customers.Input{Code: c.Code, Name: "Updated cookie", Revision: c.Revision}, &c)
		send(http.MethodPost, "/customers/groups", "df300000-0000-4000-8000-000000000009", customers.GroupInput{Code: "HTTPSUCCESS", Name: "Cookie group"}, &g)
		send(http.MethodPut, "/customers/groups/"+g.ID, "", customers.GroupInput{Code: g.Code, Name: "Updated cookie group", Revision: g.Revision}, &g)
		send(http.MethodPut, "/customers/"+c.ID+"/groups/"+g.ID, "", customers.MembershipInput{Revision: c.Revision, GroupRevision: g.Revision, Present: true}, &c)
		if c.Revision != 3 || len(c.Groups) != 1 || c.Groups[0].Revision != 3 || c.Groups[0].MemberCount != 1 {
			t.Fatal("cookie membership revision/projection")
		}
		send(http.MethodPost, "/customers/groups/"+g.ID+"/archive", "", map[string]any{"revision": c.Groups[0].Revision}, &g)
		send(http.MethodPost, "/customers/"+c.ID+"/archive", "", map[string]any{"revision": c.Revision}, &c)
		if c.Status != "ARCHIVED" || len(c.Groups) != 1 || g.Status != "ARCHIVED" || g.MemberCount != 1 {
			t.Fatal("archive changed membership history")
		}
	})
}

func customerMutationDomain(t *testing.T, ctx context.Context, pool *pgxpool.Pool, organizations *organization.Service, service *customers.Service, owner, guest testsupport.MFASession, org string, customer customers.Customer, group customers.Group, input customers.Input, groupInput customers.Group, key, groupKey string) {
	t.Helper()
	user := identity.SessionFromContext(ctx).User.ID
	checkDenied := func(test *testing.T, value any, failure, want error) {
		test.Helper()
		if !errors.Is(failure, want) || !customerMutationZero(value) {
			test.Fatalf("writer negative result: %v want %v", failure, want)
		}
	}
	t.Run("tenant and nested object isolation", func(t *testing.T) {
		other, failure := organizations.Create(ctx, user, "df300000-0000-4000-8000-000000000010", organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Other writer", Code: "CUSTWRITEOTHER", BusinessType: "RETAIL"}, Branch: organization.BranchInput{Name: "Main", Code: "MAIN", Status: "ACTIVE"}})
		if failure != nil {
			t.Fatal(failure)
		}
		o := other.Organization.ID
		foreignCustomer, failure := service.Save(ctx, user, o, "", "df300000-0000-4000-8000-000000000011", customers.Input{Code: input.Code, Name: "Foreign private customer"})
		if failure != nil {
			t.Fatal(failure)
		}
		foreignGroup, failure := service.SaveGroup(ctx, user, o, "", "df300000-0000-4000-8000-000000000012", groupInput)
		if failure != nil {
			t.Fatal(failure)
		}
		before, otherBefore := customerReadSnapshot(t, ctx, organizations, user, org), customerReadSnapshot(t, ctx, organizations, user, o)
		for _, objects := range []struct{ c, g string }{{customer.ID, foreignGroup.ID}, {foreignCustomer.ID, group.ID}, {foreignCustomer.ID, foreignGroup.ID}} {
			value, failure := service.Membership(ctx, user, org, objects.c, objects.g, customers.MembershipInput{Revision: 1, GroupRevision: 1, Present: true})
			checkDenied(t, value, failure, customers.ErrNotFound)
		}
		changed := input
		changed.Revision = customer.Revision
		value, failure := service.Save(ctx, user, o, customer.ID, "", changed)
		checkDenied(t, value, failure, customers.ErrConflict)
		groupInput.Revision = group.Revision
		g, failure := service.SaveGroup(ctx, user, o, group.ID, "", groupInput)
		checkDenied(t, g, failure, customers.ErrConflict)
		groupInput.Revision = 0
		for _, isGroup := range []bool{false, true} {
			id := customer.ID
			if isGroup {
				id = group.ID
			}
			value, failure := service.Archive(ctx, user, o, id, 1, isGroup)
			checkDenied(t, value, failure, customers.ErrConflict)
		}
		if customerReadSnapshot(t, ctx, organizations, user, org) != before || customerReadSnapshot(t, ctx, organizations, user, o) != otherBefore {
			t.Fatal("foreign writer retained effects")
		}
	})
	t.Run("replay returns current revision without effects", func(t *testing.T) {
		changed := input
		changed.Name = "Current projection"
		changed.Revision = customer.Revision
		var failure error
		customer, failure = service.Save(ctx, user, org, customer.ID, "", changed)
		if failure != nil {
			t.Fatal(failure)
		}
		g := groupInput
		g.Name = "Current group"
		g.Revision = group.Revision
		group, failure = service.SaveGroup(ctx, user, org, group.ID, "", g)
		if failure != nil {
			t.Fatal(failure)
		}
		before := customerReadSnapshot(t, ctx, organizations, user, org)
		replay, failure := service.Save(ctx, user, org, "", key, input)
		if failure != nil || replay.ID != customer.ID || replay.Revision != customer.Revision || replay.Name != customer.Name || replay.Phone != input.Phone {
			t.Fatalf("customer replay changed: %v", failure)
		}
		gReplay, failure := service.SaveGroup(ctx, user, org, "", groupKey, groupInput)
		if failure != nil || gReplay.ID != group.ID || gReplay.Revision != group.Revision || gReplay.Name != group.Name {
			t.Fatalf("group replay changed: %v", failure)
		}
		m, failure := service.Membership(ctx, user, org, customer.ID, group.ID, customers.MembershipInput{Revision: customer.Revision, GroupRevision: group.Revision})
		if failure != nil || m.Revision != customer.Revision || len(m.Groups) != 0 {
			t.Fatalf("no-op changed: %v", failure)
		}
		changed.Revision = 0
		v, failure := service.Save(ctx, user, org, "", key, changed)
		checkDenied(t, v, failure, customers.ErrConflict)
		g.Revision = 0
		gv, failure := service.SaveGroup(ctx, user, org, "", groupKey, g)
		checkDenied(t, gv, failure, customers.ErrConflict)
		stale := input
		stale.Revision = 1
		staleGroup := groupInput
		staleGroup.Revision = 1
		for _, run := range []func() (any, error){
			func() (any, error) { return service.Save(ctx, user, org, customer.ID, "", stale) },
			func() (any, error) { return service.SaveGroup(ctx, user, org, group.ID, "", staleGroup) },
			func() (any, error) { return service.Archive(ctx, user, org, customer.ID, 1, false) },
			func() (any, error) { return service.Archive(ctx, user, org, group.ID, 1, true) },
			func() (any, error) {
				return service.Membership(ctx, user, org, customer.ID, group.ID, customers.MembershipInput{Revision: 1, GroupRevision: group.Revision})
			},
		} {
			value, failure := run()
			checkDenied(t, value, failure, customers.ErrConflict)
		}
		if customerReadSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatal("replay/no-op/conflict changed business state")
		}
	})
	t.Run("concurrent same-key creates commit once", func(t *testing.T) {
		for _, isGroup := range []bool{false, true} {
			type result struct {
				id  string
				err error
			}
			results := make(chan result, 2)
			start := make(chan struct{})
			for i := 0; i < 2; i++ {
				go func() {
					<-start
					if isGroup {
						v, e := service.SaveGroup(ctx, user, org, "", "df300000-0000-4000-8000-000000000013", customers.Group{Code: "RACE", Name: "Concurrent group"})
						results <- result{v.ID, e}
					} else {
						v, e := service.Save(ctx, user, org, "", "df300000-0000-4000-8000-000000000014", customers.Input{Code: "RACE", Name: "Concurrent customer"})
						results <- result{v.ID, e}
					}
				}()
			}
			close(start)
			a, b := <-results, <-results
			if a.err != nil || b.err != nil || a.id == "" || a.id != b.id {
				t.Fatalf("concurrent replay: %v/%v", a.err, b.err)
			}
			tx, _, failure := organizations.Authorized(ctx, user, org, "customers.read")
			if failure != nil {
				t.Fatal(failure)
			}
			var audits int
			failure = tx.QueryRow(ctx, "SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND object_id=$2", org, a.id).Scan(&audits)
			tx.Rollback(ctx)
			if failure != nil || audits != 1 {
				t.Fatalf("duplicate create audit: %d %v", audits, failure)
			}
		}
	})
	t.Run("creation keys remain bound to creator", func(t *testing.T) {
		foreign := identity.SessionFromContext(guest.Context).User.ID
		setRole := func(role, status string) {
			t.Helper()
			tx, _, failure := organizations.Authorized(ctx, user, org, "customers.manage")
			if failure != nil {
				t.Fatal(failure)
			}
			defer tx.Rollback(ctx)
			_, failure = tx.Exec(ctx, "UPDATE organization_memberships SET role=$3,status=$4 WHERE organization_id=$1 AND user_id=$2", org, foreign, role, status)
			if failure == nil {
				failure = tx.Commit(ctx)
			}
			if failure != nil {
				t.Fatal(failure)
			}
		}
		setRole("OWNER", "ACTIVE")
		defer setRole("MANAGER", "REMOVED")
		c, failure := service.Save(guest.Context, foreign, org, "", key, customers.Input{Code: "OTHERCREATOR", Name: "Other creator customer"})
		if failure != nil || c.ID == customer.ID || c.Code != "OTHERCREATOR" {
			t.Fatalf("customer creator binding: %v", failure)
		}
		g, failure := service.SaveGroup(guest.Context, foreign, org, "", groupKey, customers.Group{Code: "OTHERCREATOR", Name: "Other creator group"})
		if failure != nil || g.ID == group.ID || g.Code != "OTHERCREATOR" {
			t.Fatalf("group creator binding: %v", failure)
		}
	})
	t.Run("membership revisions and archived-group removal", func(t *testing.T) {
		request := customers.MembershipInput{Revision: customer.Revision, GroupRevision: group.Revision, Present: true}
		results := make(chan error, 2)
		start := make(chan struct{})
		for i := 0; i < 2; i++ {
			go func() {
				<-start
				_, failure := service.Membership(ctx, user, org, customer.ID, group.ID, request)
				results <- failure
			}()
		}
		close(start)
		a, b := <-results, <-results
		if !((a == nil && errors.Is(b, customers.ErrConflict)) || (b == nil && errors.Is(a, customers.ErrConflict))) {
			t.Fatalf("stale membership race: %v/%v", a, b)
		}
		var failure error
		customer, failure = service.Get(ctx, user, org, customer.ID)
		if failure != nil || customer.Revision != request.Revision+1 || len(customer.Groups) != 1 || customer.Groups[0].Revision != request.GroupRevision+1 {
			t.Fatalf("membership revision projection: %v", failure)
		}
		group = customer.Groups[0]
		for _, boundary := range []struct {
			name, prefix string
			count        int
		}{
			{"removed relationship", "DELETE FROM customer_group_memberships", 1},
			{"removed customer revision", "UPDATE customers SET revision=", 1},
			{"removed group revision", "UPDATE customer_groups SET revision=", 1},
			{"removed final read", "SELECT item.id::text,item.code,item.name,item.phone", 2},
			{"removed audit", "INSERT INTO organization_audit_events", 1},
		} {
			for _, cancel := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s cancel=%t", boundary.name, cancel), func(t *testing.T) {
					before := customerReadSnapshot(t, ctx, organizations, user, org)
					catalogReadInterrupted(t, ctx, pool, owner, boundary.prefix, boundary.count, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						return (&customers.Service{Organization: traced.Organization}).Membership(request, user, org, customer.ID, group.ID, customers.MembershipInput{Revision: customer.Revision, GroupRevision: group.Revision})
					}, true)
					if customerReadSnapshot(t, ctx, organizations, user, org) != before {
						t.Fatal("membership removal retained partial effects")
					}
				})
			}
		}
		value, failure := service.Archive(ctx, user, org, group.ID, group.Revision, true)
		if failure != nil {
			t.Fatal(failure)
		}
		group = value.(customers.Group)
		before := customerReadSnapshot(t, ctx, organizations, user, org)
		v, failure := service.Membership(ctx, user, org, customer.ID, group.ID, customers.MembershipInput{Revision: customer.Revision, GroupRevision: group.Revision, Present: true})
		checkDenied(t, v, failure, customers.ErrConflict)
		if customerReadSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatal("archived no-op addition changed data")
		}
		customer, failure = service.Membership(ctx, user, org, customer.ID, group.ID, customers.MembershipInput{Revision: customer.Revision, GroupRevision: group.Revision, Present: false})
		if failure != nil || customer.Revision != request.Revision+2 || len(customer.Groups) != 0 {
			t.Fatalf("archived group removal: %v", failure)
		}
		page, failure := service.Groups(ctx, user, org, customers.Filter{Status: "ARCHIVED"})
		if failure != nil {
			t.Fatal(failure)
		}
		found := false
		for _, g := range page.Items.([]customers.Group) {
			if g.ID == group.ID {
				found = true
				if g.Revision != group.Revision || g.MemberCount != 0 {
					t.Fatal("archived group revision changed")
				}
			}
		}
		if !found {
			t.Fatal("archived group lost")
		}
		value, failure = service.Archive(ctx, user, org, customer.ID, customer.Revision, false)
		if failure != nil {
			t.Fatal(failure)
		}
		customer = value.(customers.Customer)
		before = customerReadSnapshot(t, ctx, organizations, user, org)
		v, failure = service.Membership(ctx, user, org, customer.ID, group.ID, customers.MembershipInput{Revision: customer.Revision, GroupRevision: group.Revision})
		checkDenied(t, v, failure, customers.ErrConflict)
		if customerReadSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatal("archived customer no-op changed data")
		}
	})
}
