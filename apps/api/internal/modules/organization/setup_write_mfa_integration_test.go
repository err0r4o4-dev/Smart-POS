package organization_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	"smartpos/api/internal/testsupport"
)

func setupJSON(t *testing.T, value any) []byte {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	// JSONB replay restores interface fields as maps; compare the wire values.
	var wire any
	if err = json.Unmarshal(encoded, &wire); err != nil {
		t.Fatal(err)
	}
	encoded, err = json.Marshal(wire)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func setupBusinessSnapshot(t *testing.T, ctx context.Context, pool *pgxpool.Pool, user, org string) string {
	t.Helper()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT set_config('app.user_id',$1,true),set_config('app.organization_id',$2,true)`, user, org); err != nil {
		t.Fatal(err)
	}
	var result []string
	for _, table := range []string{"organizations", "organization_memberships", "branches", "restaurant_profiles", "restaurant_setup_commands", "restaurant_dining_zones", "restaurant_dining_tables", "restaurant_menu_categories", "restaurant_menu_items", "categories", "units", "products", "product_variants", "organization_audit_events", "inventory_operations", "restaurant_setup_progress", "restaurant_setup_steps", "restaurant_service_modes", "restaurant_zones", "restaurant_tables", "restaurant_table_zones", "restaurant_settings", "restaurant_payment_settings", "restaurant_charge_settings", "restaurant_trials", "restaurant_recipes", "restaurant_recipe_items"} {
		predicate := "organization_id=$1"
		if table == "organizations" {
			predicate = "id=$1"
		}
		var digest string
		if err = tx.QueryRow(ctx, `SELECT md5(coalesce(string_agg(to_jsonb(row)::text,E'\n' ORDER BY to_jsonb(row)::text),'')) FROM `+table+` row WHERE `+predicate, org).Scan(&digest); err != nil {
			t.Fatal(err)
		}
		result = append(result, table+":"+digest)
	}
	return strings.Join(result, "\n")
}

func verifyBranchlessSetupWriteMFA(t *testing.T, ctx context.Context, pool, admin *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, user, primaryToken, primaryCSRF string, primary context.Context, assured testsupport.MFASession) {
	t.Helper()
	verifySetupWriteMFA(t, ctx, pool, admin, auth, organizations, user, primaryToken, primaryCSRF, primary, assured, false)
}

func verifySetupWriteMFA(t *testing.T, ctx context.Context, pool, admin *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, user, primaryToken, primaryCSRF string, primary context.Context, assured testsupport.MFASession, retained bool) {
	t.Helper()
	prefix, branch := "b2000000", ""
	email := "setup-writer@example.test"
	if retained {
		prefix, email = "c2000000", "retained-setup-writer@example.test"
	}
	keyFor := func(index int) string { return fmt.Sprintf("%s-0000-4000-8000-%012d", prefix, index) }
	var created organization.Context
	var err error
	if retained {
		created, err = organizations.Create(assured.Context, user, keyFor(1), organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Retained MFA setup writer", BusinessType: "RESTAURANT"}})
		if err == nil && len(created.Branches) == 1 {
			branch = created.Branches[0].ID
		} else if err == nil {
			t.Fatal("retained fixture has no branch")
		}
	} else {
		created, err = organizations.CreateRestaurant(assured.Context, user, keyFor(1), organization.OrganizationInput{Name: "MFA setup writer", BusinessType: "RESTAURANT"})
	}
	if err != nil {
		t.Fatal(err)
	}
	org := created.Organization.ID
	service := &restaurant.Service{Organization: organizations}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, restaurant.Handler{Service: service}.TenantRoutes)
	var foreign string
	if err = pool.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at)
	 SELECT $2,$2,password_hash,'Synthetic setup writer',clock_timestamp() FROM users WHERE id=$1 RETURNING id`, user, email).Scan(&foreign); err != nil {
		t.Fatal(err)
	}
	other := testsupport.EnrollMFA(t, ctx, auth, email, "Synthetic-owner-gate-password-2026")
	profile := restaurant.SetupProfileInput{Name: "MFA setup writer", BusinessType: "RESTAURANT", Address: "Synthetic setup address", Location: &restaurant.SetupLocationInput{Latitude: 13.7, Longitude: 100.5, Address: "Synthetic setup address", Confirmed: true}}
	services := restaurant.SetupServicesInput{ServiceModes: restaurant.ServiceModes{DineIn: true, Takeaway: true}}
	tables := restaurant.SetupTablesInput{GenerateQR: true, Zones: []restaurant.SetupZoneInput{{Code: "MAIN", Name: "Main"}}, Tables: []restaurant.SetupTableInput{{Code: "T1", Name: "Table one", Seats: 4, ZoneCode: "MAIN"}}}
	menu := restaurant.SetupMenuInput{Categories: []restaurant.SetupCategoryInput{{Name: "Meals"}}, Items: []restaurant.SetupMenuItemInput{{Name: "Soup", Category: "Meals", Price: "45.25"}}}
	payments := restaurant.SetupPaymentsInput{Cash: true}
	orders := restaurant.SetupOrdersInput{VATRate: "7.00", ServiceChargeRate: "10.00", KitchenQueue: true}
	profile.BranchID, services.BranchID, tables.BranchID, menu.BranchID, payments.BranchID, orders.BranchID = branch, branch, branch, branch, branch, branch
	if state, failure := service.Complete(assured.Context, user, org, branch, keyFor(9)); !errors.Is(failure, restaurant.ErrConflict) || !reflect.DeepEqual(state, restaurant.SetupState{}) {
		t.Fatalf("incomplete setup exposed state: %v", failure)
	}
	operations := []struct {
		name string
		run  func(context.Context, string, string) (restaurant.SetupState, error)
	}{
		{"profile", func(request context.Context, actor, key string) (restaurant.SetupState, error) {
			return service.SaveProfile(request, actor, org, key, profile)
		}},
		{"services", func(request context.Context, actor, key string) (restaurant.SetupState, error) {
			return service.SaveServices(request, actor, org, key, services)
		}},
		{"tables", func(request context.Context, actor, key string) (restaurant.SetupState, error) {
			return service.SaveTables(request, actor, org, key, tables)
		}},
		{"menu", func(request context.Context, actor, key string) (restaurant.SetupState, error) {
			return service.SaveMenu(request, actor, org, key, menu)
		}},
		{"payments", func(request context.Context, actor, key string) (restaurant.SetupState, error) {
			return service.SavePayments(request, actor, org, key, payments)
		}},
		{"orders", func(request context.Context, actor, key string) (restaurant.SetupState, error) {
			return service.SaveOrders(request, actor, org, key, orders)
		}},
		{"complete", func(request context.Context, actor, key string) (restaurant.SetupState, error) {
			return service.Complete(request, actor, org, branch, key)
		}},
	}
	for index, operation := range operations {
		t.Run(operation.name, func(t *testing.T) {
			key := keyFor(index + 10)
			before := setupBusinessSnapshot(t, ctx, pool, user, org)
			for _, denial := range []struct {
				request context.Context
				actor   string
				want    error
			}{
				{ctx, user, identity.ErrInvalidToken}, {primary, user, identity.ErrMFARequired},
				{other.Context, foreign, organization.ErrNotFound}, {other.Context, user, identity.ErrInvalidToken},
			} {
				state, failure := operation.run(denial.request, denial.actor, key)
				if !errors.Is(failure, denial.want) || !reflect.DeepEqual(state, restaurant.SetupState{}) {
					t.Fatalf("%s wrote or returned setup without assurance: %v", operation.name, failure)
				}
				if setupBusinessSnapshot(t, ctx, pool, user, org) != before {
					t.Fatal("denied setup changed durable state")
				}
			}
			for _, status := range []string{"ACTIVE", "SUSPENDED"} {
				if _, err = admin.Exec(ctx, `INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'MANAGER',$3)
				 ON CONFLICT(organization_id,user_id) DO UPDATE SET status=excluded.status`, org, foreign, status); err != nil {
					t.Fatal(err)
				}
				deniedBefore := setupBusinessSnapshot(t, ctx, pool, user, org)
				want := organization.ErrDenied
				if status == "SUSPENDED" {
					want = organization.ErrNotFound
				}
				state, failure := operation.run(other.Context, foreign, key)
				if !errors.Is(failure, want) || !reflect.DeepEqual(state, restaurant.SetupState{}) || setupBusinessSnapshot(t, ctx, pool, user, org) != deniedBefore {
					t.Fatalf("%s member wrote or disclosed setup: %v", status, failure)
				}
			}
			if _, err = admin.Exec(ctx, `DELETE FROM organization_memberships WHERE organization_id=$1 AND user_id=$2`, org, foreign); err != nil {
				t.Fatal(err)
			}
			verifySetupWriteExpiry(t, ctx, pool, admin, user, org, assured, "SELECT pg_advisory_xact_lock(430081)", func(request context.Context) (restaurant.SetupState, error) {
				return operation.run(organization.WithRequestID(request, "owner-mfa-final-wait"), user, key)
			})
			if operation.name == "tables" || operation.name == "menu" {
				lock := "LOCK TABLE restaurant_dining_tables IN SHARE MODE"
				if retained {
					lock = "LOCK TABLE restaurant_tables IN SHARE MODE"
				}
				if operation.name == "menu" {
					lock = "LOCK TABLE units IN SHARE MODE"
				}
				verifySetupWriteExpiry(t, ctx, pool, admin, user, org, assured, lock, func(request context.Context) (restaurant.SetupState, error) {
					return operation.run(request, user, key)
				})
			}
			if retained {
				beforeCommit := setupBusinessSnapshot(t, ctx, pool, user, org)
				state, failure := operation.run(organization.WithRequestID(assured.Context, "retained-setup-commit-fail"), user, key)
				if failure == nil || !reflect.DeepEqual(state, restaurant.SetupState{}) || setupBusinessSnapshot(t, ctx, pool, user, org) != beforeCommit {
					t.Fatalf("commit failure returned state or retained partial setup effects: %v", failure)
				}
			}
			var state restaurant.SetupState
			var failure error
			if retained {
				type result struct {
					state restaurant.SetupState
					err   error
				}
				results := make(chan result, 2)
				requestID := "retained-setup-concurrent-" + operation.name
				for attempt := 0; attempt < 2; attempt++ {
					go func() {
						value, problem := operation.run(organization.WithRequestID(assured.Context, requestID), user, key)
						results <- result{value, problem}
					}()
				}
				first, second := <-results, <-results
				if first.err != nil || second.err != nil || !bytes.Equal(setupJSON(t, first.state), setupJSON(t, second.state)) {
					t.Fatalf("concurrent matching setup did not converge: %v / %v", first.err, second.err)
				}
				access, err := organizations.AuthorizeMFA(assured.Context, user, org, "organization.update")
				if err != nil {
					t.Fatal(err)
				}
				var audits int
				err = access.Tx.QueryRow(ctx, "SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND request_id=$2", org, requestID).Scan(&audits)
				access.Tx.Rollback(ctx)
				if err != nil || audits != 1 {
					t.Fatalf("concurrent matching command did not produce exactly one audit: %d %v", audits, err)
				}
				state = first.state
			} else {
				state, failure = operation.run(assured.Context, user, key)
			}
			if failure != nil || state.OrganizationID != org {
				t.Fatalf("assured setup failed: %v", failure)
			}
			if operation.name == "tables" && len(state.IssuedTableQRTokens) != 1 {
				t.Fatal("table setup did not issue exactly one QR token")
			}
			if operation.name == "complete" && (!state.Completed || !state.Ready) {
				t.Fatal("full setup did not complete")
			}
			after := setupBusinessSnapshot(t, ctx, pool, user, org)
			replayed, failure := operation.run(assured.Context, user, key)
			if failure != nil || !bytes.Equal(setupJSON(t, state), setupJSON(t, replayed)) || setupBusinessSnapshot(t, ctx, pool, user, org) != after {
				t.Fatalf("replay changed setup JSON, QR tokens or durable effects: %v", failure)
			}
			replayed, failure = operation.run(primary, user, key)
			if !errors.Is(failure, identity.ErrMFARequired) || !reflect.DeepEqual(replayed, restaurant.SetupState{}) || setupBusinessSnapshot(t, ctx, pool, user, org) != after {
				t.Fatalf("primary session replay exposed state or QR tokens: %v", failure)
			}
			commandLock := "LOCK TABLE restaurant_setup_commands IN ACCESS EXCLUSIVE MODE"
			if retained {
				commandLock = "LOCK TABLE inventory_operations IN ACCESS EXCLUSIVE MODE"
			}
			verifySetupWriteExpiry(t, ctx, pool, admin, user, org, assured, commandLock, func(request context.Context) (restaurant.SetupState, error) {
				return operation.run(request, user, key)
			})
			input := map[string]any{"profile": profile, "services": services, "tables": tables, "menu": menu, "payments": payments, "orders": orders, "complete": restaurant.SetupCompleteInput{BranchID: branch}}[operation.name]
			changedProfile, changedServices, changedTables, changedMenu, changedPayments, changedOrders := profile, services, tables, menu, payments, orders
			changedProfile.Name = "Changed fingerprint"
			changedServices.ServiceModes.Delivery = true
			changedTables.GenerateQR = false
			changedMenu.Items = []restaurant.SetupMenuItemInput{{Name: "Soup", Category: "Meals", Price: "46.25"}}
			changedPayments.BankTransfer = true
			changedOrders.VATRate = "8.00"
			changed := map[string]any{"profile": changedProfile, "services": changedServices, "tables": changedTables, "menu": changedMenu, "payments": changedPayments, "orders": changedOrders}[operation.name]
			method := http.MethodPut
			if operation.name == "complete" {
				method = http.MethodPost
			}
			for _, session := range []struct {
				token, csrf, code string
				status            int
			}{
				{"", "", "UNAUTHENTICATED", http.StatusUnauthorized},
				{primaryToken, primaryCSRF, "MFA_REQUIRED", http.StatusForbidden},
				{assured.Token, assured.CSRF, "", http.StatusOK},
			} {
				request := httptest.NewRequest(method, "/organizations/"+org+"/restaurant/setup/"+operation.name, bytes.NewReader(setupJSON(t, input))).WithContext(ctx)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: session.token})
				request.Header.Set("Origin", testsupport.MFAOrigin)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("X-CSRF-Token", session.csrf)
				request.Header.Set("Idempotency-Key", key)
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				var result struct {
					Data  json.RawMessage       `json:"data"`
					Error struct{ Code string } `json:"error"`
				}
				if err = json.Unmarshal(response.Body.Bytes(), &result); err != nil {
					t.Fatal(err)
				}
				if response.Code != session.status || result.Error.Code != session.code || (session.status != http.StatusOK && len(result.Data) != 0) {
					t.Fatalf("setup HTTP status=%d code=%s", response.Code, result.Error.Code)
				}
				if session.status == http.StatusOK {
					var actual restaurant.SetupState
					if err = json.Unmarshal(result.Data, &actual); err != nil || !bytes.Equal(setupJSON(t, state), setupJSON(t, actual)) {
						t.Fatal("HTTP replay changed private setup JSON")
					}
				}
				if setupBusinessSnapshot(t, ctx, pool, user, org) != after {
					t.Fatal("HTTP denial or matching replay changed durable setup")
				}
			}
			if changed != nil {
				request := httptest.NewRequest(method, "/organizations/"+org+"/restaurant/setup/"+operation.name, bytes.NewReader(setupJSON(t, changed))).WithContext(ctx)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: assured.Token})
				request.Header.Set("Origin", testsupport.MFAOrigin)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("X-CSRF-Token", assured.CSRF)
				request.Header.Set("Idempotency-Key", key)
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				var result struct {
					Data  any
					Error struct{ Code string }
				}
				if err = json.Unmarshal(response.Body.Bytes(), &result); err != nil || response.Code != http.StatusConflict || result.Error.Code != "CONFLICT" || result.Data != nil || setupBusinessSnapshot(t, ctx, pool, user, org) != after {
					t.Fatalf("changed fingerprint exposed data or changed state: status=%d code=%s err=%v", response.Code, result.Error.Code, err)
				}
			}
		})
	}
	verifySetupWriteExpiry(t, ctx, pool, admin, user, org, assured, "SELECT pg_advisory_xact_lock(430082)", func(request context.Context) (restaurant.SetupState, error) {
		return service.Complete(request, user, org, branch, keyFor(888))
	})
	before := setupBusinessSnapshot(t, ctx, pool, user, org)
	if state, failure := service.SavePayments(assured.Context, user, org, keyFor(889), payments); !errors.Is(failure, restaurant.ErrConflict) || !reflect.DeepEqual(state, restaurant.SetupState{}) || setupBusinessSnapshot(t, ctx, pool, user, org) != before {
		t.Fatalf("completed setup mutation changed state or disclosed data: %v", failure)
	}
	if state, failure := service.Complete(assured.Context, user, org, branch, keyFor(890)); failure != nil || !state.Completed || !state.Ready {
		t.Fatalf("already completed setup did not return verified result: %v", failure)
	}
	t.Run("concurrent logout serializes with setup and denies later replay", func(t *testing.T) {
		verifySetupWriteRevocation(t, ctx, pool, admin, auth, organizations, user, retained)
	})
}

func verifySetupWriteRevocation(t *testing.T, ctx context.Context, pool, admin *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, template string, retained bool) {
	t.Helper()
	email, prefix, branch := "setup-revoke@example.test", "b3000000", ""
	if retained {
		email, prefix = "retained-setup-revoke@example.test", "c3000000"
	}
	var user string
	if err := pool.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at)
	 SELECT $2,$2,password_hash,'Synthetic setup revoke',clock_timestamp() FROM users WHERE id=$1 RETURNING id`, template, email).Scan(&user); err != nil {
		t.Fatal(err)
	}
	assured := testsupport.EnrollMFA(t, ctx, auth, email, "Synthetic-owner-gate-password-2026")
	var created organization.Context
	var err error
	if retained {
		created, err = organizations.Create(assured.Context, user, prefix+"-0000-4000-8000-000000000001", organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Revocation setup", BusinessType: "RESTAURANT"}})
		if err == nil && len(created.Branches) == 1 {
			branch = created.Branches[0].ID
		} else if err == nil {
			t.Fatal("retained revocation fixture has no branch")
		}
	} else {
		created, err = organizations.CreateRestaurant(assured.Context, user, prefix+"-0000-4000-8000-000000000001", organization.OrganizationInput{Name: "Revocation setup", BusinessType: "RESTAURANT"})
	}
	if err != nil {
		t.Fatal(err)
	}
	org := created.Organization.ID
	service := &restaurant.Service{Organization: organizations}
	blocker, err := admin.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer blocker.Rollback(ctx)
	if _, err = blocker.Exec(ctx, `SELECT pg_advisory_xact_lock(430081)`); err != nil {
		t.Fatal(err)
	}
	var blockerPID, businessPID int32
	if err = blocker.QueryRow(ctx, `SELECT pg_backend_pid()`).Scan(&blockerPID); err != nil {
		t.Fatal(err)
	}
	save := func(request context.Context) (restaurant.SetupState, error) {
		return service.SaveProfile(request, user, org, prefix+"-0000-4000-8000-000000000002", restaurant.SetupProfileInput{BranchID: branch, Name: "Revocation setup", BusinessType: "RESTAURANT"})
	}
	result := make(chan error, 1)
	go func() {
		_, failure := save(organization.WithRequestID(assured.Context, "owner-mfa-final-wait"))
		result <- failure
	}()
	waitOwnerMFABlocked(t, ctx, pool, blockerPID, time.Now())
	if err = pool.QueryRow(ctx, `SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))`, blockerPID).Scan(&businessPID); err != nil {
		t.Fatal(err)
	}
	revoked := make(chan error, 1)
	go func() { revoked <- auth.Service.Logout(ctx, assured.Token, user) }()
	waitOwnerMFABlocked(t, ctx, pool, businessPID, time.Now())
	if err = blocker.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if err = <-result; err != nil {
		t.Fatalf("in-flight setup failed before serialized logout: %v", err)
	}
	if err = <-revoked; err != nil {
		t.Fatalf("serialized logout failed: %v", err)
	}
	before := setupBusinessSnapshot(t, ctx, pool, user, org)
	state, failure := save(assured.Context)
	if !errors.Is(failure, identity.ErrInvalidToken) || !reflect.DeepEqual(state, restaurant.SetupState{}) || setupBusinessSnapshot(t, ctx, pool, user, org) != before {
		t.Fatalf("revoked session replayed setup: %v", failure)
	}
}

func verifySetupWriteExpiry(t *testing.T, ctx context.Context, pool, admin *pgxpool.Pool, user, org string, assured testsupport.MFASession, lock string, run func(context.Context) (restaurant.SetupState, error)) {
	t.Helper()
	before := setupBusinessSnapshot(t, ctx, pool, user, org)
	session := identity.SessionFromContext(assured.Context).ID
	var cutoff time.Time
	if err := pool.QueryRow(ctx, `UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at`, session).Scan(&cutoff); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := pool.Exec(ctx, `UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1`, session); err != nil {
			t.Fatal(err)
		}
	}()
	blocker, err := admin.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer blocker.Rollback(ctx)
	if _, err = blocker.Exec(ctx, lock); err != nil {
		t.Fatal(err)
	}
	var pid int32
	if err = blocker.QueryRow(ctx, `SELECT pg_backend_pid()`).Scan(&pid); err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() {
		state, failure := run(assured.Context)
		if !reflect.DeepEqual(state, restaurant.SetupState{}) {
			result <- errors.New("expired setup returned private state or QR tokens")
			return
		}
		result <- failure
	}()
	waitOwnerMFABlocked(t, ctx, pool, pid, cutoff)
	if err = blocker.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if err = <-result; !errors.Is(err, identity.ErrInvalidToken) {
		t.Fatalf("setup survived business wait expiry: %v", err)
	}
	if setupBusinessSnapshot(t, ctx, pool, user, org) != before {
		t.Fatal("expiry failed to roll back setup/menu/table/QR/command/audit state")
	}
}
