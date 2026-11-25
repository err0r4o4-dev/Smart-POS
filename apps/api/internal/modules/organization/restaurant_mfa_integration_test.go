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
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
	"smartpos/api/internal/testsupport"
)

func verifyRestaurantEmployeeMFA(t *testing.T, ctx context.Context, pool, admin *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, user, primaryToken, primaryCSRF string, primary context.Context, assured testsupport.MFASession) {
	t.Helper()
	created, err := organizations.Create(assured.Context, user, "d1000000-0000-4000-8000-000000000001", organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Employee MFA fixture", BusinessType: "RESTAURANT"}})
	if err != nil || len(created.Branches) != 1 {
		t.Fatalf("employee restaurant fixture: %v", err)
	}
	org, branch := created.Organization.ID, created.Branches[0].ID
	service := &restaurant.Service{Organization: organizations}
	menuState, err := service.SaveMenu(assured.Context, user, org, "d1000000-0000-4000-8000-000000000006", restaurant.SetupMenuInput{BranchID: branch, Categories: []restaurant.SetupCategoryInput{{Name: "Meals"}}, Items: []restaurant.SetupMenuItemInput{{Name: "Soup", Category: "Meals", Price: "45.25"}, {Name: "Ingredient", Category: "Meals", Price: "2.00"}}})
	if err != nil {
		t.Fatal(err)
	}
	var menu struct {
		Items []struct {
			Name      string `json:"name"`
			VariantID string `json:"variant_id"`
		}
	}
	if err = json.Unmarshal(setupJSON(t, menuState.Menu), &menu); err != nil || len(menu.Items) != 2 {
		t.Fatalf("recipe menu fixture: %v", err)
	}
	var menuID, ingredientID string
	for _, item := range menu.Items {
		if item.Name == "Soup" {
			menuID = item.VariantID
		} else {
			ingredientID = item.VariantID
		}
	}
	settings := restaurant.SettingsInput{BranchID: branch, ClosingTime: "22:00", Timezone: "UTC"}
	recipe := restaurant.RecipeInput{BranchID: branch, MenuVariantID: menuID, Status: "ACTIVE", Items: []restaurant.RecipeIngredientInput{{IngredientVariantID: ingredientID, Quantity: "1.000"}}}
	table := restaurant.TableInput{BranchID: branch, Code: "MFA", Name: "MFA table", Seats: 4, Status: "ACTIVE"}
	var foreign string
	if err = pool.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at)
	 SELECT 'restaurant-employee-foreign@example.test','restaurant-employee-foreign@example.test',password_hash,'Synthetic employee foreign',clock_timestamp() FROM users WHERE id=$1 RETURNING id`, user).Scan(&foreign); err != nil {
		t.Fatal(err)
	}
	other := testsupport.EnrollMFA(t, ctx, auth, "restaurant-employee-foreign@example.test", "Synthetic-owner-gate-password-2026")
	foreignOrg, err := organizations.Create(assured.Context, user, "d1000000-0000-4000-8000-000000000007", organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Other employee restaurant", BusinessType: "RESTAURANT"}})
	if err != nil || len(foreignOrg.Branches) != 1 {
		t.Fatalf("foreign branch fixture: %v", err)
	}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, restaurant.Handler{Service: service}.TenantRoutes)
	operations := []struct {
		name, lock, method, path string
		body                     any
		run                      func(context.Context, string, string, string) (any, error)
	}{
		{"settings", "LOCK TABLE restaurant_settings IN ACCESS EXCLUSIVE MODE", "GET", "settings?branch_id=" + branch, nil, func(request context.Context, actor, candidate, key string) (any, error) {
			return service.Settings(request, actor, org, candidate)
		}},
		{"save settings", "", "PATCH", "settings", settings, func(request context.Context, actor, candidate, key string) (any, error) {
			input := settings
			input.BranchID = candidate
			return service.SaveSettings(request, actor, org, input)
		}},
		{"recipes", "LOCK TABLE restaurant_recipes IN ACCESS EXCLUSIVE MODE", "", "", nil, func(request context.Context, actor, candidate, key string) (any, error) {
			return service.Recipes(request, actor, org, candidate)
		}},
		{"save recipe", "", "", "", recipe, func(request context.Context, actor, candidate, key string) (any, error) {
			input := recipe
			input.BranchID = candidate
			return service.SaveRecipe(request, actor, org, "", key, input)
		}},
		{"tables", "LOCK TABLE restaurant_tables IN ACCESS EXCLUSIVE MODE", "GET", "tables?branch_id=" + branch, nil, func(request context.Context, actor, candidate, key string) (any, error) {
			return service.Tables(request, actor, org, candidate)
		}},
		{"save table", "", "POST", "tables", table, func(request context.Context, actor, candidate, key string) (any, error) {
			input := table
			input.BranchID = candidate
			return service.SaveTable(request, actor, org, "", key, input)
		}},
		{"queue", "LOCK TABLE online_orders IN ACCESS EXCLUSIVE MODE", "GET", "queue?branch_id=" + branch, nil, func(request context.Context, actor, candidate, key string) (any, error) {
			return service.Queue(request, actor, org, candidate)
		}},
		{"forecast status", "LOCK TABLE branches IN ACCESS EXCLUSIVE MODE", "", "", nil, func(request context.Context, actor, candidate, key string) (any, error) {
			return service.ForecastStatus(request, actor, org, candidate)
		}},
	}
	saved := map[string]any{}
	for index, operation := range operations {
		t.Run(operation.name, func(t *testing.T) {
			key := fmt.Sprintf("d1000000-0000-4000-8000-%012d", index+10)
			before := setupBusinessSnapshot(t, ctx, pool, user, org)
			for _, denial := range []struct {
				request context.Context
				actor   string
				want    error
			}{{ctx, user, identity.ErrInvalidToken}, {primary, user, identity.ErrMFARequired}, {other.Context, foreign, organization.ErrNotFound}, {other.Context, user, identity.ErrInvalidToken}} {
				value, failure := operation.run(denial.request, denial.actor, branch, key)
				if !errors.Is(failure, denial.want) || !reflect.ValueOf(value).IsZero() || setupBusinessSnapshot(t, ctx, pool, user, org) != before {
					t.Fatalf("employee endpoint returned data or wrong denial without MFA: %v", failure)
				}
			}
			for _, status := range []string{"ACTIVE", "SUSPENDED"} {
				if _, err = admin.Exec(ctx, `INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'MANAGER',$3) ON CONFLICT(organization_id,user_id) DO UPDATE SET status=excluded.status`, org, foreign, status); err != nil {
					t.Fatal(err)
				}
				deniedBefore := setupBusinessSnapshot(t, ctx, pool, user, org)
				want := organization.ErrDenied
				if status == "SUSPENDED" {
					want = organization.ErrNotFound
				}
				value, failure := operation.run(other.Context, foreign, branch, key)
				if !errors.Is(failure, want) || !reflect.ValueOf(value).IsZero() || setupBusinessSnapshot(t, ctx, pool, user, org) != deniedBefore {
					t.Fatalf("employee permission denial changed or disclosed data: %v", failure)
				}
			}
			if _, err = admin.Exec(ctx, "DELETE FROM organization_memberships WHERE organization_id=$1 AND user_id=$2", org, foreign); err != nil {
				t.Fatal(err)
			}
			for _, candidate := range []string{foreignOrg.Branches[0].ID, "d1000000-0000-4000-8000-000000000099"} {
				value, failure := operation.run(assured.Context, user, candidate, key)
				if !errors.Is(failure, restaurant.ErrNotFound) || !reflect.ValueOf(value).IsZero() || setupBusinessSnapshot(t, ctx, pool, user, org) != before {
					t.Fatalf("foreign or unknown branch changed or disclosed data: %v", failure)
				}
			}
			if _, err = admin.Exec(ctx, "UPDATE branches SET status='INACTIVE' WHERE organization_id=$1 AND id=$2", org, branch); err != nil {
				t.Fatal(err)
			}
			value, failure := operation.run(assured.Context, user, branch, key)
			if !errors.Is(failure, restaurant.ErrConflict) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("inactive branch allowed employee operation: %v", failure)
			}
			if _, err = admin.Exec(ctx, "UPDATE branches SET status='ACTIVE' WHERE organization_id=$1 AND id=$2", org, branch); err != nil {
				t.Fatal(err)
			}
			if operation.method != "" {
				for _, session := range []struct {
					token, csrf, code string
					status            int
				}{{"", "", "UNAUTHENTICATED", 401}, {primaryToken, primaryCSRF, "MFA_REQUIRED", 403}} {
					employeeHTTP(t, ctx, router, org, operation.method, operation.path, key, session.token, session.csrf, operation.body, session.status, session.code)
				}
			}
			run := func(request context.Context) (any, error) { return operation.run(request, user, branch, key) }
			if operation.lock != "" {
				verifyRestaurantExpiry(t, ctx, pool, admin, user, org, assured, operation.lock, run)
			} else {
				verifyRestaurantExpiry(t, ctx, pool, admin, user, org, assured, "SELECT pg_advisory_xact_lock(430081)", func(request context.Context) (any, error) {
					return run(organization.WithRequestID(request, "owner-mfa-final-wait"))
				})
				beforeCommit := setupBusinessSnapshot(t, ctx, pool, user, org)
				value, failure := run(organization.WithRequestID(assured.Context, "retained-setup-commit-fail"))
				if failure == nil || !reflect.ValueOf(value).IsZero() || setupBusinessSnapshot(t, ctx, pool, user, org) != beforeCommit {
					t.Fatalf("employee commit failure retained effects or returned data: %v", failure)
				}
			}
			if operation.name == "save recipe" || operation.name == "save table" {
				type result struct {
					value any
					err   error
				}
				results := make(chan result, 2)
				requestID := "employee-concurrent-" + operation.name
				for attempt := 0; attempt < 2; attempt++ {
					go func() {
						actual, problem := run(organization.WithRequestID(assured.Context, requestID))
						results <- result{actual, problem}
					}()
				}
				first, second := <-results, <-results
				if first.err != nil || second.err != nil || !bytes.Equal(setupJSON(t, first.value), setupJSON(t, second.value)) {
					t.Fatalf("concurrent employee creates did not converge: %v / %v", first.err, second.err)
				}
				access, problem := organizations.AuthorizeMFA(assured.Context, user, org, "organization.update")
				if problem != nil {
					t.Fatal(problem)
				}
				var commands, audits int
				problem = access.Tx.QueryRow(ctx, `SELECT
				 (SELECT count(*) FROM inventory_operations WHERE organization_id=$1 AND idempotency_key=$2),
				 (SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND request_id=$3)`, org, key, requestID).Scan(&commands, &audits)
				access.Tx.Rollback(ctx)
				if problem != nil || commands != 1 || audits != 1 {
					t.Fatalf("concurrent employee create duplicated effects: commands=%d audits=%d error=%v", commands, audits, problem)
				}
				value, failure = first.value, first.err
			} else {
				value, failure = run(assured.Context)
			}
			if failure != nil || reflect.ValueOf(value).IsZero() {
				t.Fatalf("assured employee operation failed: %v", failure)
			}
			saved[operation.name] = value
			if operation.name == "save recipe" || operation.name == "save table" {
				after := setupBusinessSnapshot(t, ctx, pool, user, org)
				replayed, problem := run(assured.Context)
				if problem != nil || !bytes.Equal(setupJSON(t, value), setupJSON(t, replayed)) || setupBusinessSnapshot(t, ctx, pool, user, org) != after {
					t.Fatalf("employee create replay changed private response or state: %v", problem)
				}
				verifyRestaurantExpiry(t, ctx, pool, admin, user, org, assured, "LOCK TABLE inventory_operations IN ACCESS EXCLUSIVE MODE", run)
			}
			if operation.method == "GET" || operation.method == "POST" {
				employeeHTTP(t, ctx, router, org, operation.method, operation.path, key, assured.Token, assured.CSRF, operation.body, 200, "")
			}
		})
	}
	if result, ok := saved["forecast status"].(restaurant.ForecastStatus); !ok || result.Status != "unavailable" || result.Reason != "FORECAST_NOT_CONFIGURED" || len(result.Items) != 0 {
		t.Fatal("authorization cutover changed forecast behavior")
	}
	if len(saved) != len(operations) {
		return
	}
	settings.Revision = saved["save settings"].(restaurant.Settings).Revision
	table.Revision = saved["save table"].(restaurant.Table).Revision
	recipe.Revision = saved["save recipe"].(restaurant.Recipe).Revision
	for _, update := range []struct {
		name, path string
		body       any
		run        func(context.Context) (any, error)
	}{
		{"settings", "settings", settings, func(request context.Context) (any, error) { return service.SaveSettings(request, user, org, settings) }},
		{"table", "tables/" + saved["save table"].(restaurant.Table).ID, table, func(request context.Context) (any, error) {
			return service.SaveTable(request, user, org, saved["save table"].(restaurant.Table).ID, "", table)
		}},
		{"recipe", "", nil, func(request context.Context) (any, error) {
			return service.SaveRecipe(request, user, org, saved["save recipe"].(restaurant.Recipe).ID, "", recipe)
		}},
	} {
		t.Run(update.name+" update preserves revision and rollback", func(t *testing.T) {
			before := setupBusinessSnapshot(t, ctx, pool, user, org)
			value, failure := update.run(primary)
			if !errors.Is(failure, identity.ErrMFARequired) || !reflect.ValueOf(value).IsZero() || setupBusinessSnapshot(t, ctx, pool, user, org) != before {
				t.Fatalf("primary-only update changed or disclosed state: %v", failure)
			}
			verifyRestaurantExpiry(t, ctx, pool, admin, user, org, assured, "SELECT pg_advisory_xact_lock(430081)", func(request context.Context) (any, error) {
				return update.run(organization.WithRequestID(request, "owner-mfa-final-wait"))
			})
			value, failure = update.run(organization.WithRequestID(assured.Context, "retained-setup-commit-fail"))
			if failure == nil || !reflect.ValueOf(value).IsZero() || setupBusinessSnapshot(t, ctx, pool, user, org) != before {
				t.Fatalf("failed employee update committed partial state: %v", failure)
			}
			if update.path != "" {
				method := "PUT"
				if update.name == "settings" {
					method = "PATCH"
				}
				employeeHTTP(t, ctx, router, org, method, update.path, "", primaryToken, primaryCSRF, update.body, 403, "MFA_REQUIRED")
				employeeHTTP(t, ctx, router, org, method, update.path, "", assured.Token, assured.CSRF, update.body, 200, "")
			} else if value, failure = update.run(assured.Context); failure != nil || reflect.ValueOf(value).IsZero() {
				t.Fatalf("assured recipe update failed: %v", failure)
			}
			after := setupBusinessSnapshot(t, ctx, pool, user, org)
			value, failure = update.run(assured.Context)
			if !errors.Is(failure, restaurant.ErrConflict) || !reflect.ValueOf(value).IsZero() || setupBusinessSnapshot(t, ctx, pool, user, org) != after {
				t.Fatalf("stale employee revision changed or disclosed state: %v", failure)
			}
		})
	}
}

func employeeHTTP(t *testing.T, ctx context.Context, router http.Handler, org, method, path, key, token, csrf string, body any, status int, code string) {
	t.Helper()
	request := httptest.NewRequest(method, "/organizations/"+org+"/restaurant/"+path, bytes.NewReader(setupJSON(t, body))).WithContext(ctx)
	request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: token})
	request.Header.Set("Origin", testsupport.MFAOrigin)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-CSRF-Token", csrf)
	request.Header.Set("Idempotency-Key", key)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	var result struct {
		Data  json.RawMessage
		Error struct{ Code string }
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || response.Code != status || result.Error.Code != code || (status != 200 && len(result.Data) != 0) || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("employee HTTP status=%d code=%s expected=%d/%s error=%v", response.Code, result.Error.Code, status, code, err)
	}
}

func verifyRestaurantExpiry(t *testing.T, ctx context.Context, pool, admin *pgxpool.Pool, user, org string, assured testsupport.MFASession, lock string, run func(context.Context) (any, error)) {
	t.Helper()
	before := setupBusinessSnapshot(t, ctx, pool, user, org)
	session := identity.SessionFromContext(assured.Context).ID
	var cutoff time.Time
	if err := pool.QueryRow(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at", session).Scan(&cutoff); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", session); err != nil {
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
	if err = blocker.QueryRow(ctx, "SELECT pg_backend_pid()").Scan(&pid); err != nil {
		t.Fatal(err)
	}
	result := make(chan error, 1)
	go func() {
		value, failure := run(assured.Context)
		if !reflect.ValueOf(value).IsZero() {
			result <- errors.New("expired employee operation returned private state")
			return
		}
		result <- failure
	}()
	waitOwnerMFABlocked(t, ctx, pool, pid, cutoff)
	if err = blocker.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if failure := <-result; !errors.Is(failure, identity.ErrInvalidToken) || setupBusinessSnapshot(t, ctx, pool, user, org) != before {
		t.Fatalf("employee wait expiry exposed data or retained effects: %v", failure)
	}
}
