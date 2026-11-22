package organization_test

import (
	"context"
	"encoding/json"
	"errors"
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

func verifyBranchlessSetupReadMFA(t *testing.T, ctx context.Context, pool, admin *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, user, org, primaryToken string, primary context.Context, assured testsupport.MFASession) {
	t.Helper()
	verifySetupReadMFA(t, ctx, pool, admin, auth, organizations, user, org, "", primaryToken, primary, assured)
}

func verifyRetainedSetupReadMFA(t *testing.T, ctx context.Context, pool, admin *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, user, org, branch, primaryToken string, primary context.Context, assured testsupport.MFASession) {
	t.Helper()
	verifySetupReadMFA(t, ctx, pool, admin, auth, organizations, user, org, branch, primaryToken, primary, assured)
}

func verifySetupReadMFA(t *testing.T, ctx context.Context, pool, admin *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, user, org, branch, primaryToken string, primary context.Context, assured testsupport.MFASession) {
	t.Helper()
	service := &restaurant.Service{Organization: organizations}
	denied := func(request context.Context, actor string, want error) {
		t.Helper()
		state, failure := service.Setup(request, actor, org, branch)
		if !errors.Is(failure, want) || !reflect.DeepEqual(state, restaurant.SetupState{}) {
			t.Fatalf("private setup read returned state or wrong denial: %v", failure)
		}
	}
	denied(ctx, user, identity.ErrInvalidToken)
	denied(primary, user, identity.ErrMFARequired)
	if state, failure := service.Setup(assured.Context, user, org, branch); failure != nil || state.OrganizationID != org || state.BranchID != branch {
		t.Fatalf("assured private setup read failed: %v", failure)
	}
	if branch != "" {
		foreignOrg, err := organizations.Create(assured.Context, user, "c1000000-0000-4000-8000-000000000001", organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Other retained setup", BusinessType: "RESTAURANT"}})
		if err != nil || len(foreignOrg.Branches) != 1 {
			t.Fatalf("foreign branch fixture failed: %v", err)
		}
		before := setupBusinessSnapshot(t, ctx, pool, user, org)
		for _, candidate := range []string{foreignOrg.Branches[0].ID, "c1000000-0000-4000-8000-000000000002"} {
			state, failure := service.Setup(assured.Context, user, org, candidate)
			if !errors.Is(failure, restaurant.ErrNotFound) || !reflect.DeepEqual(state, restaurant.SetupState{}) {
				t.Fatalf("foreign or unknown branch exposed retained setup: %v", failure)
			}
			state, failure = service.SavePayments(assured.Context, user, org, "c1000000-0000-4000-8000-000000000003", restaurant.SetupPaymentsInput{BranchID: candidate, Cash: true})
			if !errors.Is(failure, restaurant.ErrNotFound) || !reflect.DeepEqual(state, restaurant.SetupState{}) || setupBusinessSnapshot(t, ctx, pool, user, org) != before {
				t.Fatalf("foreign or unknown branch wrote retained setup: %v", failure)
			}
		}
		if _, err = admin.Exec(ctx, "UPDATE branches SET status='INACTIVE' WHERE organization_id=$1 AND id=$2", org, branch); err != nil {
			t.Fatal(err)
		}
		denied(assured.Context, user, restaurant.ErrConflict)
		if _, err = admin.Exec(ctx, "UPDATE branches SET status='ACTIVE' WHERE organization_id=$1 AND id=$2", org, branch); err != nil {
			t.Fatal(err)
		}
	}
	var foreign string
	email := "setup-reader@example.test"
	if branch != "" {
		email = "retained-setup-reader@example.test"
	}
	if err := pool.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at)
	 SELECT $2,$2,password_hash,'Synthetic setup reader',clock_timestamp() FROM users WHERE id=$1 RETURNING id`, user, email).Scan(&foreign); err != nil {
		t.Fatal(err)
	}
	other := testsupport.EnrollMFA(t, ctx, auth, email, "Synthetic-owner-gate-password-2026")
	denied(other.Context, foreign, organization.ErrNotFound)
	denied(other.Context, user, identity.ErrInvalidToken)
	for _, status := range []string{"ACTIVE", "SUSPENDED"} {
		access, err := organizations.AuthorizeMFA(assured.Context, user, org, "organization.update")
		if err != nil {
			t.Fatal(err)
		}
		_, err = access.Tx.Exec(ctx, `INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'MANAGER',$3)
		 ON CONFLICT(organization_id,user_id) DO UPDATE SET status=excluded.status`, org, foreign, status)
		if err == nil {
			err = access.Tx.Commit(ctx)
		}
		access.Tx.Rollback(ctx)
		if err != nil {
			t.Fatal(err)
		}
		want := organization.ErrDenied
		if status == "SUSPENDED" {
			want = organization.ErrNotFound
		}
		denied(other.Context, foreign, want)
	}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, restaurant.Handler{Service: service}.TenantRoutes)
	for _, session := range []struct {
		token  string
		status int
		code   string
	}{
		{"", http.StatusUnauthorized, "UNAUTHENTICATED"},
		{primaryToken, http.StatusForbidden, "MFA_REQUIRED"},
		{assured.Token, http.StatusOK, ""},
	} {
		request := httptest.NewRequest(http.MethodGet, "/organizations/"+org+"/restaurant/setup?branch_id="+branch, nil).WithContext(ctx)
		request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: session.token})
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		var result struct {
			Data  any                   `json:"data"`
			Error struct{ Code string } `json:"error"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if response.Code != session.status || result.Error.Code != session.code || (session.status != http.StatusOK && result.Data != nil) {
			t.Fatalf("private setup HTTP returned status=%d code=%s", response.Code, result.Error.Code)
		}
	}
	t.Run("expires during final menu read", func(t *testing.T) {
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
		lock := "LOCK TABLE restaurant_menu_items IN ACCESS EXCLUSIVE MODE"
		if branch != "" {
			lock = "LOCK TABLE restaurant_charge_settings IN ACCESS EXCLUSIVE MODE"
		}
		if _, err = blocker.Exec(ctx, lock); err != nil {
			t.Fatal(err)
		}
		var pid int32
		if err = blocker.QueryRow(ctx, `SELECT pg_backend_pid()`).Scan(&pid); err != nil {
			t.Fatal(err)
		}
		result := make(chan error, 1)
		go func() {
			state, failure := service.Setup(assured.Context, user, org, branch)
			if !reflect.DeepEqual(state, restaurant.SetupState{}) {
				result <- errors.New("expired menu read returned private setup state")
				return
			}
			result <- failure
		}()
		waitOwnerMFABlocked(t, ctx, pool, pid, cutoff)
		if err = blocker.Rollback(ctx); err != nil {
			t.Fatal(err)
		}
		if err = <-result; !errors.Is(err, identity.ErrInvalidToken) {
			t.Fatalf("private setup survived final query expiry: %v", err)
		}
	})
	if branch != "" {
		t.Run("cancels after partial scanning without returning data or retaining locks", func(t *testing.T) {
			blocker, err := admin.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer blocker.Rollback(ctx)
			if _, err = blocker.Exec(ctx, "LOCK TABLE restaurant_charge_settings IN ACCESS EXCLUSIVE MODE"); err != nil {
				t.Fatal(err)
			}
			var pid int32
			if err = blocker.QueryRow(ctx, "SELECT pg_backend_pid()").Scan(&pid); err != nil {
				t.Fatal(err)
			}
			request, cancel := context.WithCancel(assured.Context)
			defer cancel()
			result := make(chan error, 1)
			go func() {
				state, failure := service.Setup(request, user, org, branch)
				if !reflect.DeepEqual(state, restaurant.SetupState{}) {
					result <- errors.New("cancelled read returned partial setup")
					return
				}
				result <- failure
			}()
			waitOwnerMFABlocked(t, ctx, pool, pid, time.Now())
			cancel()
			if failure := <-result; !errors.Is(failure, context.Canceled) {
				t.Fatalf("cancelled read did not report cancellation: %v", failure)
			}
			if err = blocker.Rollback(ctx); err != nil {
				t.Fatal(err)
			}
			if state, failure := service.Setup(assured.Context, user, org, branch); failure != nil || state.BranchID != branch {
				t.Fatalf("cancelled read retained locks or broke recovery: %v", failure)
			}
		})
	}
}
