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

func posRegisterMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string) {
	t.Helper()
	ctx = owner.Context
	user := identity.SessionFromContext(ctx).User.ID
	service := &pos.Service{Organization: organizations}
	cart := seedPOSCustomerCart(t, ctx, organizations, service, user, org)
	tx, _, err := organizations.Authorized(ctx, user, org, "pos.access")
	if err != nil {
		t.Fatal(err)
	}
	var shift, location string
	err = tx.QueryRow(ctx, "SELECT shift.id::text,terminal.stock_location_id::text FROM register_shifts shift JOIN pos_terminals terminal ON terminal.organization_id=shift.organization_id AND terminal.id=shift.terminal_id WHERE shift.organization_id=$1 AND shift.terminal_id=$2", org, cart.TerminalID).Scan(&shift, &location)
	tx.Rollback(ctx)
	if err != nil {
		t.Fatal(err)
	}
	_, primaryToken, primaryCSRF, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	idleInput := pos.TerminalInput{BranchID: cart.BranchID, StockLocationID: location, Code: "REGIDLE", Name: "Idle register", Status: "ACTIVE"}
	idle, err := service.SaveTerminal(ctx, user, org, "", idleInput)
	if err != nil {
		t.Fatal(err)
	}
	sequence := 0
	operations := []struct {
		name string
		run  func(context.Context, *pos.Service) (any, error)
	}{
		{"terminal create", func(request context.Context, point *pos.Service) (any, error) {
			sequence++
			return point.SaveTerminal(request, user, org, "", pos.TerminalInput{BranchID: cart.BranchID, StockLocationID: location, Code: fmt.Sprintf("REGMFA%d", sequence), Name: "Protected terminal", Status: "ACTIVE"})
		}},
		{"terminal update", func(request context.Context, point *pos.Service) (any, error) {
			input := idleInput
			input.Revision = idle.Revision
			value, failure := point.SaveTerminal(request, user, org, idle.ID, input)
			if failure == nil {
				idle = value
			}
			return value, failure
		}},
		{"open shift replay", func(request context.Context, point *pos.Service) (any, error) {
			return point.OpenShift(request, user, org, "df400000-0000-4000-8000-000000000003", pos.ShiftInput{TerminalID: cart.TerminalID, OpeningCash: "0.00"})
		}},
		{"close shift and replay", func(request context.Context, point *pos.Service) (any, error) {
			return point.CloseShift(request, user, org, shift, "df800000-0000-4000-8000-000000000002", pos.ShiftInput{CountedCash: "0.00"})
		}},
	}
	before := posRegisterSnapshot(t, ctx, organizations, user, org)
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
				value, failure := operation.run(denial.ctx, service)
				if !errors.Is(failure, denial.want) || !reflect.ValueOf(value).IsZero() {
					t.Errorf("POS register authority bypass: %v", failure)
				}
			})
		}
	}
	if posRegisterSnapshot(t, ctx, organizations, user, org) != before {
		t.Error("denied register calls changed business/audit state")
	}
	for _, expiry := range []bool{false, true} {
		t.Run(fmt.Sprintf("changed open replay wait expiry=%t", expiry), func(t *testing.T) {
			before := posRegisterSnapshot(t, ctx, organizations, user, org)
			verifyPrivateReadWait(t, ctx, pool, owner, "register_shifts", expiry, func(request context.Context) (any, error) {
				return service.OpenShift(request, user, org, "df400000-0000-4000-8000-000000000003", pos.ShiftInput{TerminalID: cart.TerminalID, OpeningCash: "0.01"})
			})
			if posRegisterSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatal("interrupted changed replay retained effects")
			}
		})
	}
	if _, err = service.CloseShift(ctx, user, org, shift, "df800000-0000-4000-8000-000000000002", pos.ShiftInput{CountedCash: "0.00"}); err != nil {
		t.Fatal(err)
	}
	for _, operation := range operations {
		prefix := "SELECT to_jsonb(shift)"
		count := 1
		if operation.name == "terminal create" || operation.name == "terminal update" {
			prefix = "SELECT id::text,branch_id::text,code,name"
		}
		if operation.name == "terminal update" {
			count = 2
		}
		for _, cancel := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s after result cancel=%t", operation.name, cancel), func(t *testing.T) {
				before := posRegisterSnapshot(t, ctx, organizations, user, org)
				catalogReadInterrupted(t, ctx, pool, owner, prefix, count, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
					return operation.run(request, &pos.Service{Organization: traced.Organization})
				}, true)
				if posRegisterSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("interrupted register result retained effects")
				}
			})
		}
		t.Run(operation.name+" aborted result", func(t *testing.T) {
			before := posRegisterSnapshot(t, ctx, organizations, user, org)
			trace := &customerReadFailureTrace{prefix: prefix, remaining: count}
			configuration := pool.Config()
			configuration.ConnConfig.Tracer = trace
			tracedPool, failure := pgxpool.NewWithConfig(ctx, configuration)
			if failure != nil {
				t.Fatal(failure)
			}
			defer tracedPool.Close()
			value, failure := operation.run(ctx, &pos.Service{Organization: &organization.Service{Pool: tracedPool}})
			if failure == nil || trace.failure == nil || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("register aborted result: %v", failure)
			}
			if posRegisterSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatal("register aborted result retained effects")
			}
		})
		table := "pos_terminals"
		if operation.name == "terminal create" {
			table = "stock_locations"
		}
		if operation.name == "close shift and replay" {
			table = "register_shifts"
		}
		for _, expiry := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s %s lock expiry=%t", operation.name, table, expiry), func(t *testing.T) {
				before := posRegisterSnapshot(t, ctx, organizations, user, org)
				verifyPrivateReadWait(t, ctx, pool, owner, table, expiry, func(request context.Context) (any, error) { return operation.run(request, service) })
				if posRegisterSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("blocked register retained effects")
				}
			})
		}
	}
	for _, operation := range operations[:2] {
		prefix := "INSERT INTO pos_terminals("
		if operation.name == "terminal update" {
			prefix = "UPDATE pos_terminals SET code="
		}
		for _, boundary := range []string{prefix, "INSERT INTO organization_audit_events"} {
			for _, cancel := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s after %s cancel=%t", operation.name, boundary, cancel), func(t *testing.T) {
					before := posRegisterSnapshot(t, ctx, organizations, user, org)
					catalogReadInterrupted(t, ctx, pool, owner, boundary, 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						return operation.run(request, &pos.Service{Organization: traced.Organization})
					}, true)
					if posRegisterSnapshot(t, ctx, organizations, user, org) != before {
						t.Fatal("terminal write/audit interruption retained effects")
					}
				})
			}
		}
	}
	var finalShift string
	for _, stage := range []string{"open", "close"} {
		key := "df800000-0000-4000-8000-000000000003"
		var currentShift string
		if stage == "close" {
			value, failure := service.OpenShift(ctx, user, org, key, pos.ShiftInput{TerminalID: idle.ID, OpeningCash: "12.34"})
			if failure != nil {
				t.Fatal(failure)
			}
			var fields struct {
				ID string `json:"id"`
			}
			if json.Unmarshal(value, &fields) != nil || fields.ID == "" {
				t.Fatal("missing fresh shift")
			}
			currentShift = fields.ID
			finalShift = currentShift
		}
		run := func(request context.Context, point *pos.Service) (any, error) {
			if stage == "open" {
				return point.OpenShift(request, user, org, key, pos.ShiftInput{TerminalID: idle.ID, OpeningCash: "12.34"})
			}
			return point.CloseShift(request, user, org, currentShift, "df800000-0000-4000-8000-000000000004", pos.ShiftInput{CountedCash: "12.35"})
		}
		write := "INSERT INTO register_shifts("
		tables := []string{"pos_terminals", "register_shifts"}
		if stage == "close" {
			write = "UPDATE register_shifts SET status='CLOSED'"
			tables = []string{"register_shifts", "pos_checkouts"}
		}
		for _, boundary := range []string{write, "SELECT to_jsonb(shift)", "INSERT INTO organization_audit_events"} {
			for _, cancel := range []bool{false, true} {
				t.Run(fmt.Sprintf("fresh %s after %s cancel=%t", stage, boundary, cancel), func(t *testing.T) {
					before := posRegisterSnapshot(t, ctx, organizations, user, org)
					catalogReadInterrupted(t, ctx, pool, owner, boundary, 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						return run(request, &pos.Service{Organization: traced.Organization})
					}, true)
					if posRegisterSnapshot(t, ctx, organizations, user, org) != before {
						t.Fatal("interrupted shift write retained effects")
					}
				})
			}
			t.Run(stage+" aborted "+boundary, func(t *testing.T) {
				before := posRegisterSnapshot(t, ctx, organizations, user, org)
				trace := &customerReadFailureTrace{prefix: boundary, remaining: 1}
				configuration := pool.Config()
				configuration.ConnConfig.Tracer = trace
				tracedPool, failure := pgxpool.NewWithConfig(ctx, configuration)
				if failure != nil {
					t.Fatal(failure)
				}
				defer tracedPool.Close()
				value, failure := run(ctx, &pos.Service{Organization: &organization.Service{Pool: tracedPool}})
				if failure == nil || trace.failure == nil || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("aborted shift leaked result: %v", failure)
				}
				if posRegisterSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("aborted shift retained effects")
				}
			})
		}
		for _, table := range tables {
			for _, expiry := range []bool{false, true} {
				t.Run(fmt.Sprintf("fresh %s %s lock expiry=%t", stage, table, expiry), func(t *testing.T) {
					before := posRegisterSnapshot(t, ctx, organizations, user, org)
					verifyPrivateReadWait(t, ctx, pool, owner, table, expiry, func(request context.Context) (any, error) { return run(request, service) })
					if posRegisterSnapshot(t, ctx, organizations, user, org) != before {
						t.Fatal("blocked shift retained effects")
					}
				})
			}
		}
		if stage == "close" {
			value, failure := run(ctx, service)
			if failure != nil {
				t.Fatal(failure)
			}
			var fields map[string]json.RawMessage
			if json.Unmarshal(value.(json.RawMessage), &fields) != nil || string(fields["opening_cash"]) != `"12.34"` || string(fields["counted_cash"]) != `"12.35"` || string(fields["difference"]) != `"0.01"` || string(fields["status"]) != `"CLOSED"` {
				t.Fatal("shift exact close changed")
			}
			before := posRegisterSnapshot(t, ctx, organizations, user, org)
			replay, failure := run(ctx, service)
			if failure != nil || !reflect.DeepEqual(value, replay) || posRegisterSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("shift close replay changed: %v", failure)
			}
		}
	}
	foreign := identity.SessionFromContext(guest.Context).User.ID
	other, err := organizations.Create(ctx, user, "df800000-0000-4000-8000-000000000006", organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Other register tenant", Code: "OTHERREGMFA", BusinessType: "RETAIL"}, Branch: organization.BranchInput{Name: "Main", Code: "MAIN", Status: "ACTIVE"}})
	if err != nil {
		t.Fatal(err)
	}
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	runScoped := func(request context.Context, point *pos.Service, actor, tenant, name string) (any, error) {
		switch name {
		case "terminal create":
			return point.SaveTerminal(request, actor, tenant, "", idleInput)
		case "terminal update":
			input := idleInput
			input.Revision = idle.Revision
			return point.SaveTerminal(request, actor, tenant, idle.ID, input)
		case "open shift replay":
			return point.OpenShift(request, actor, tenant, "df400000-0000-4000-8000-000000000003", pos.ShiftInput{TerminalID: cart.TerminalID, OpeningCash: "0.00"})
		default:
			return point.CloseShift(request, actor, tenant, shift, "df800000-0000-4000-8000-000000000002", pos.ShiftInput{CountedCash: "0.00"})
		}
	}
	for _, operation := range operations {
		for _, status := range []string{"", "ACTIVE", "SUSPENDED"} {
			t.Run(operation.name+" membership "+status, func(t *testing.T) {
				privateReadMembership(t, ctx, organizations, user, org, foreign, status)
				want := pos.ErrNotFound
				if status == "ACTIVE" {
					want = organization.ErrDenied
				}
				before := posRegisterSnapshot(t, ctx, organizations, user, org)
				value, failure := runScoped(guest.Context, service, foreign, org, operation.name)
				if !errors.Is(failure, want) || !reflect.ValueOf(value).IsZero() || posRegisterSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatalf("register membership boundary: %v", failure)
				}
			})
		}
		privateReadMembership(t, ctx, organizations, user, org, foreign, "")
		t.Run(operation.name+" foreign document", func(t *testing.T) {
			before := posRegisterSnapshot(t, ctx, organizations, user, org)
			foreignBefore := posRegisterSnapshot(t, ctx, organizations, user, other.Organization.ID)
			value, failure := runScoped(ctx, service, user, other.Organization.ID, operation.name)
			if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() || posRegisterSnapshot(t, ctx, organizations, user, org) != before || posRegisterSnapshot(t, ctx, organizations, user, other.Organization.ID) != foreignBefore {
				t.Fatalf("register tenant boundary: %v", failure)
			}
		})
		t.Run(operation.name+" pinned deployment", func(t *testing.T) {
			value, failure := runScoped(ctx, &pos.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: other.Organization.ID}}, user, org, operation.name)
			if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("register deployment boundary: %v", failure)
			}
		})
	}
	t.Run("revoked register mutations", func(t *testing.T) {
		session := identity.SessionFromContext(ctx).ID
		if _, err := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1", session); err != nil {
			t.Fatal(err)
		}
		defer func() {
			if _, err := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=NULL WHERE id=$1", session); err != nil {
				t.Error(err)
			}
		}()
		for _, operation := range operations {
			value, failure := operation.run(ctx, service)
			if !errors.Is(failure, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("revoked register authority: %v", failure)
			}
		}
	})
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, pos.Handler{Service: service}.TenantRoutes)
	for _, operation := range []struct {
		name, method, path, key string
		body                    any
		status                  int
	}{
		{"create", http.MethodPost, "/pos/terminals", "", pos.TerminalInput{BranchID: cart.BranchID, StockLocationID: location, Code: "REGHTTP", Name: "HTTP terminal", Status: "ACTIVE"}, 201},
		{"update", http.MethodPatch, "/pos/terminals/" + idle.ID, "", pos.TerminalInput{BranchID: cart.BranchID, StockLocationID: location, Code: idle.Code, Name: idle.Name, Status: "ACTIVE", Revision: idle.Revision}, 200},
		{"open", http.MethodPost, "/pos/shifts/open", "df800000-0000-4000-8000-000000000005", pos.ShiftInput{TerminalID: idle.ID, OpeningCash: "1.23"}, 201},
		{"close replay", http.MethodPost, "/pos/shifts/" + finalShift + "/close", "df800000-0000-4000-8000-000000000004", pos.ShiftInput{CountedCash: "12.35"}, 200},
	} {
		for _, candidate := range []struct {
			name, token, csrf, origin, code string
			status                          int
		}{
			{"missing", "", "", testsupport.MFAOrigin, "UNAUTHENTICATED", 401},
			{"primary", primaryToken, primaryCSRF, testsupport.MFAOrigin, "MFA_REQUIRED", 403},
			{"foreign", guest.Token, guest.CSRF, testsupport.MFAOrigin, "NOT_FOUND", 404},
			{"CSRF", owner.Token, "", testsupport.MFAOrigin, "INVALID_CSRF", 403},
			{"Origin", owner.Token, owner.CSRF, "https://untrusted.example.test", "INVALID_ORIGIN", 403},
			{"assured", owner.Token, owner.CSRF, testsupport.MFAOrigin, "", operation.status},
		} {
			t.Run(operation.name+" HTTP "+candidate.name, func(t *testing.T) {
				before := posRegisterSnapshot(t, ctx, organizations, user, org)
				body, _ := json.Marshal(operation.body)
				request := httptest.NewRequest(operation.method, "/organizations/"+org+operation.path, strings.NewReader(string(body))).WithContext(ctx)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("Origin", candidate.origin)
				request.Header.Set("X-CSRF-Token", candidate.csrf)
				request.Header.Set("Idempotency-Key", operation.key)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: candidate.token})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				if response.Code != candidate.status || response.Header().Get("Cache-Control") != "no-store" || candidate.code != "" && (!strings.Contains(response.Body.String(), candidate.code) || strings.Contains(response.Body.String(), `"data"`)) {
					t.Fatalf("register HTTP boundary %d", response.Code)
				}
				if candidate.code != "" && posRegisterSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("denied register HTTP changed state")
				}
			})
		}
	}
	t.Run("register revision and shift concurrency", func(t *testing.T) {
		tx, _, failure := organizations.Authorized(ctx, user, org, "pos.access")
		if failure != nil {
			t.Fatal(failure)
		}
		var openID string
		failure = tx.QueryRow(ctx, "SELECT id::text FROM register_shifts WHERE organization_id=$1 AND terminal_id=$2 AND status='OPEN'", org, idle.ID).Scan(&openID)
		tx.Rollback(ctx)
		if failure != nil {
			t.Fatal(failure)
		}
		if _, failure = service.CloseShift(ctx, user, org, openID, "df800000-0000-4000-8000-000000000007", pos.ShiftInput{CountedCash: "1.23"}); failure != nil {
			t.Fatal(failure)
		}
		tx, _, failure = organizations.Authorized(ctx, user, org, "pos.access")
		if failure != nil {
			t.Fatal(failure)
		}
		input := idleInput
		failure = tx.QueryRow(ctx, "SELECT revision FROM pos_terminals WHERE organization_id=$1 AND id=$2", org, idle.ID).Scan(&input.Revision)
		tx.Rollback(ctx)
		if failure != nil {
			t.Fatal(failure)
		}
		results := make(chan error, 2)
		for range 2 {
			go func() {
				value, problem := service.SaveTerminal(ctx, user, org, idle.ID, input)
				if problem != nil && !reflect.ValueOf(value).IsZero() {
					problem = errors.New("stale terminal returned result")
				}
				results <- problem
			}()
		}
		first, second := <-results, <-results
		if !(first == nil && errors.Is(second, pos.ErrConflict) || second == nil && errors.Is(first, pos.ErrConflict)) {
			t.Fatalf("terminal revision concurrency: %v/%v", first, second)
		}
		before := posRegisterSnapshot(t, ctx, organizations, user, org)
		input.Revision--
		value, problem := service.SaveTerminal(ctx, user, org, idle.ID, input)
		if !errors.Is(problem, pos.ErrConflict) || !reflect.ValueOf(value).IsZero() || posRegisterSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("terminal stale revision: %v", problem)
		}
		shifts := make(chan json.RawMessage, 2)
		for range 2 {
			go func() {
				value, problem := service.OpenShift(ctx, user, org, "df800000-0000-4000-8000-000000000008", pos.ShiftInput{TerminalID: idle.ID, OpeningCash: "2.34"})
				shifts <- value
				results <- problem
			}()
		}
		left, right := <-shifts, <-shifts
		if first, second = <-results, <-results; first != nil || second != nil || !reflect.DeepEqual(left, right) {
			t.Fatalf("shift concurrent open replay: %v/%v", first, second)
		}
		var opened struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(left, &opened) != nil || opened.ID == "" {
			t.Fatal("missing concurrent shift")
		}
		before = posRegisterSnapshot(t, ctx, organizations, user, org)
		invalid, problem := service.OpenShift(ctx, user, org, "df800000-0000-4000-8000-000000000008", pos.ShiftInput{TerminalID: idle.ID, OpeningCash: "2.35"})
		if !errors.Is(problem, pos.ErrConflict) || len(invalid) != 0 || posRegisterSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("changed open replay: %v", problem)
		}
		for range 2 {
			go func() {
				value, problem := service.CloseShift(ctx, user, org, opened.ID, "df800000-0000-4000-8000-000000000009", pos.ShiftInput{CountedCash: "2.34"})
				shifts <- value
				results <- problem
			}()
		}
		left, right = <-shifts, <-shifts
		if first, second = <-results, <-results; first != nil || second != nil || !reflect.DeepEqual(left, right) {
			t.Fatalf("shift concurrent close replay: %v/%v", first, second)
		}
		before = posRegisterSnapshot(t, ctx, organizations, user, org)
		invalid, problem = service.CloseShift(ctx, user, org, opened.ID, "df800000-0000-4000-8000-000000000009", pos.ShiftInput{CountedCash: "2.35"})
		if !errors.Is(problem, pos.ErrConflict) || len(invalid) != 0 || posRegisterSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("changed close replay: %v", problem)
		}
	})
	t.Run("pending funds still block shift close", func(t *testing.T) {
		value, problem := service.OpenShift(ctx, user, org, "df800000-0000-4000-8000-00000000000a", pos.ShiftInput{TerminalID: idle.ID, OpeningCash: "0.00"})
		if problem != nil {
			t.Fatal(problem)
		}
		var opened struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(value, &opened) != nil {
			t.Fatal("invalid pending shift")
		}
		catalogService := &catalog.Service{Organization: organizations}
		unit, problem := catalogService.SaveTaxonomy(ctx, user, org, "units", "", catalog.TaxonomyInput{Name: "Register unit", Code: "REGUNIT", UnitType: "COUNT", Status: "ACTIVE"})
		if problem != nil {
			t.Fatal(problem)
		}
		product, problem := catalogService.CreateProduct(ctx, user, org, catalog.CreateInput{ProductInput: catalog.ProductInput{Name: "Register item", Status: "ACTIVE"}, Variants: []catalog.VariantInput{{SKU: "REGITEM", Name: "Register variant", UnitID: unit.ID, CostPrice: "1.00", SellingPrice: "10.00", Status: "ACTIVE"}}})
		if problem != nil {
			t.Fatal(problem)
		}
		variant := product.Variants[0].ID
		pendingCart, problem := service.CreateCart(ctx, user, org, "df800000-0000-4000-8000-00000000000b", pos.CartInput{TerminalID: idle.ID})
		if problem != nil {
			t.Fatal(problem)
		}
		pendingCart, problem = service.UpdateCart(ctx, user, org, pendingCart.ID, "update", pos.CartInput{Revision: pendingCart.Revision, Items: []pos.ItemInput{{VariantID: variant, Quantity: "1.000"}}})
		if problem != nil {
			t.Fatal(problem)
		}
		_, problem = service.PrepareCheckout(ctx, user, org, "df800000-0000-4000-8000-00000000000c", pos.CheckoutInput{CartID: pendingCart.ID, Revision: pendingCart.Revision, Method: "CASH", ExpectedTotal: pendingCart.Total, Received: pendingCart.Total, PricingRevision: pendingCart.Pricing.Revision})
		if problem != nil {
			t.Fatal(problem)
		}
		before := posRegisterSnapshot(t, ctx, organizations, user, org)
		value, problem = service.CloseShift(ctx, user, org, opened.ID, "df800000-0000-4000-8000-00000000000d", pos.ShiftInput{CountedCash: "0.00"})
		if !errors.Is(problem, pos.ErrPending) || len(value) != 0 || posRegisterSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("pending shift closed: %v", problem)
		}
		busy := idleInput
		tx, _, problem := organizations.Authorized(ctx, user, org, "pos.access")
		if problem != nil {
			t.Fatal(problem)
		}
		problem = tx.QueryRow(ctx, "SELECT revision FROM pos_terminals WHERE organization_id=$1 AND id=$2", org, idle.ID).Scan(&busy.Revision)
		tx.Rollback(ctx)
		if problem != nil {
			t.Fatal(problem)
		}
		terminalValue, problem := service.SaveTerminal(ctx, user, org, idle.ID, busy)
		if !errors.Is(problem, pos.ErrConflict) || !reflect.ValueOf(terminalValue).IsZero() || posRegisterSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("busy terminal changed: %v", problem)
		}
	})
}

func posRegisterSnapshot(t *testing.T, ctx context.Context, organizations *organization.Service, user, org string) string {
	t.Helper()
	base := posCustomerSnapshot(t, ctx, organizations, user, org)
	tx, _, err := organizations.Authorized(ctx, user, org, "pos.access")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var digest string
	if err = tx.QueryRow(ctx, "SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM pos_terminals t WHERE organization_id=$1", org).Scan(&digest); err != nil {
		t.Fatal(err)
	}
	return base + digest
}
