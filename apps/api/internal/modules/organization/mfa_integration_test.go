package organization_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/platform/database"
	"smartpos/api/internal/testsupport"
)

func TestOwnerMFAIsolatedDatabase(t *testing.T) {
	dsn := os.Getenv("SMARTPOS_MFA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires explicitly provisioned task-owned MFA database")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil || config.ConnConfig.Host != "127.0.0.1" || config.ConnConfig.Port != 15514 || config.ConnConfig.Database != "smartpos_single_store_acceptance" {
		t.Fatal("refusing unconfirmed isolated Owner MFA target")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatal("isolated database unavailable")
	}
	defer pool.Close()
	var marker, role string
	var privileged bool
	if err = pool.QueryRow(ctx, `SELECT marker,current_user,(SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) FROM single_store_acceptance_marker`).Scan(&marker, &role, &privileged); err != nil || marker != "ephemeral-single-store" || role != "smartpos_runtime" || privileged {
		t.Fatal("isolated target/runtime role not confirmed")
	}
	adminConfig, err := pgxpool.ParseConfig(os.Getenv("SMARTPOS_ADMIN_TEST_DSN"))
	if err != nil || adminConfig.ConnConfig.Host != config.ConnConfig.Host || adminConfig.ConnConfig.Port != config.ConnConfig.Port || adminConfig.ConnConfig.Database != config.ConnConfig.Database || adminConfig.ConnConfig.User != "postgres" {
		t.Fatal("refusing unconfirmed isolated administrator fixture target")
	}
	admin, err := pgxpool.NewWithConfig(ctx, adminConfig)
	if err != nil {
		t.Fatal("isolated administrator fixture unavailable")
	}
	defer admin.Close()
	if err = admin.QueryRow(ctx, `SELECT marker,current_user FROM single_store_acceptance_marker`).Scan(&marker, &role); err != nil || marker != "ephemeral-single-store" || role != "postgres" {
		t.Fatal("isolated administrator fixture target not confirmed")
	}
	hash, err := identity.HashPassword("Synthetic-owner-gate-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	var user string
	if err = pool.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at) VALUES('owner-gate@example.test','owner-gate@example.test',$1,'Synthetic owner gate',clock_timestamp()) RETURNING id`, hash).Scan(&user); err != nil {
		t.Fatal(err)
	}
	service := &organization.Service{Pool: pool}
	_, err = service.CreateRestaurant(ctx, user, "a1000000-0000-4000-8000-000000000001", organization.OrganizationInput{Name: "First protected restaurant", BusinessType: "RESTAURANT"})
	if !errors.Is(err, identity.ErrInvalidToken) {
		t.Fatalf("first Owner creation must require middleware-authenticated session: %v", err)
	}
	accounts := &identity.Service{Pool: pool, SessionTTL: time.Hour}
	mfa, err := identity.NewMFAService(pool, "synthetic-owner-key", bytes.Repeat([]byte{0x42}, 32))
	if err != nil {
		t.Fatal(err)
	}
	auth := identity.Handler{Service: accounts, MFA: mfa, Origins: []string{testsupport.MFAOrigin}}
	_, primaryToken, primaryCSRF, err := accounts.Login(ctx, "owner-gate@example.test", "Synthetic-owner-gate-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	input := organization.OrganizationInput{Name: "Protected restaurant", BusinessType: "RESTAURANT"}
	for _, branchless := range []bool{false, true} {
		var problem error
		if branchless {
			_, problem = service.CreateRestaurant(primary, user, "a1000000-0000-4000-8000-000000000002", input)
		} else {
			_, problem = service.Create(primary, user, "a1000000-0000-4000-8000-000000000002", organization.CreateInput{OrganizationInput: input})
		}
		if !errors.Is(problem, identity.ErrMFARequired) {
			t.Fatalf("creation must deny primary-only session (branchless=%t): %v", branchless, problem)
		}
	}
	verified := testsupport.EnrollMFA(t, ctx, auth, "owner-gate@example.test", "Synthetic-owner-gate-password-2026")
	const key = "a1000000-0000-4000-8000-000000000003"
	created, err := service.CreateRestaurant(verified.Context, user, key, input)
	if err != nil || created.Membership.UserID != user || len(created.Branches) != 0 {
		t.Fatalf("MFA-authenticated first Owner creation failed: %v", err)
	}
	if _, err = service.Context(primary, user, created.Organization.ID); !errors.Is(err, identity.ErrMFARequired) {
		t.Fatalf("private Context must deny primary-only session: %v", err)
	}
	if _, err = service.Context(ctx, user, created.Organization.ID); !errors.Is(err, identity.ErrInvalidToken) {
		t.Fatalf("private Context must require server session: %v", err)
	}
	if _, err = service.Context(verified.Context, user, created.Organization.ID); err != nil {
		t.Fatalf("MFA Context read failed: %v", err)
	}
	replay, err := service.CreateRestaurant(verified.Context, user, key, input)
	if err != nil || replay.Organization.ID != created.Organization.ID {
		t.Fatalf("protected idempotent replay failed: %v", err)
	}
	if _, err = service.CreateRestaurant(primary, user, key, input); !errors.Is(err, identity.ErrMFARequired) {
		t.Fatalf("primary-only session replayed creation: %v", err)
	}
	legacy, err := service.Create(verified.Context, user, "a1000000-0000-4000-8000-000000000004", organization.CreateInput{OrganizationInput: input})
	if err != nil || len(legacy.Branches) != 1 {
		t.Fatalf("legacy Owner creation with MFA failed: %v", err)
	}
	snapshot := func() string {
		t.Helper()
		tx, problem := pool.Begin(ctx)
		if problem != nil {
			t.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		if _, problem = tx.Exec(ctx, `SELECT set_config('app.user_id',$1,true),set_config('app.organization_id','',true)`, user); problem != nil {
			t.Fatal(problem)
		}
		var digest string
		if problem = tx.QueryRow(ctx, `SELECT md5(concat(
		 (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM organizations o),
		 (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM organization_memberships m),
		 (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM branches b),
		 (SELECT jsonb_agg(to_jsonb(r) ORDER BY user_id,key) FROM organization_creation_requests r),
		 (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM organization_audit_events a)))`).Scan(&digest); problem != nil {
			t.Fatal(problem)
		}
		return digest
	}
	baseline := snapshot()
	t.Run("list requires live session assurance including empty results", func(t *testing.T) {
		for _, test := range []struct {
			name string
			ctx  context.Context
			want error
		}{
			{"missing session", ctx, identity.ErrInvalidToken},
			{"primary only", primary, identity.ErrMFARequired},
		} {
			listed, problem := service.List(test.ctx, user)
			if !errors.Is(problem, test.want) || listed != nil {
				t.Fatalf("%s exposed list without assurance: %v", test.name, problem)
			}
		}
		listed, problem := service.List(verified.Context, user)
		if problem != nil || len(listed) != 2 {
			t.Fatalf("assured Owner list failed: count=%d err=%v", len(listed), problem)
		}
		single := &organization.Service{Pool: pool, SingleStoreOrganizationID: created.Organization.ID}
		listed, problem = single.List(verified.Context, user)
		if problem != nil || len(listed) != 1 || listed[0].ID != created.Organization.ID {
			t.Fatalf("single-store MFA list widened scope: %v", problem)
		}
		for _, test := range []struct {
			name, deny, restore string
		}{
			{"inactive account", `UPDATE users SET status='DISABLED' WHERE id=$1`, `UPDATE users SET status='ACTIVE' WHERE id=$1`},
			{"unverified account", `UPDATE users SET email_verified_at=NULL WHERE id=$1`, `UPDATE users SET email_verified_at=created_at WHERE id=$1`},
			{"expired session", `UPDATE auth_sessions SET expires_at=greatest(created_at,mfa_verified_at)+interval '1 microsecond' WHERE user_id=$1 AND mfa_factor_id IS NOT NULL`, `UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE user_id=$1 AND mfa_factor_id IS NOT NULL`},
		} {
			if _, problem = pool.Exec(ctx, test.deny, user); problem != nil {
				t.Fatal(problem)
			}
			listed, failure := service.List(verified.Context, user)
			_, restoreErr := pool.Exec(ctx, test.restore, user)
			if restoreErr != nil {
				t.Fatal(restoreErr)
			}
			if !errors.Is(failure, identity.ErrInvalidToken) || listed != nil {
				t.Fatalf("%s returned organizations: %v", test.name, failure)
			}
		}
		router := chi.NewRouter()
		organization.Handler{Service: service, Authentication: auth}.Routes(router)
		for _, test := range []struct {
			token  string
			status int
			code   string
		}{
			{primaryToken, http.StatusForbidden, "MFA_REQUIRED"},
			{verified.Token, http.StatusOK, ""},
		} {
			request := httptest.NewRequest(http.MethodGet, "/organizations", nil).WithContext(ctx)
			request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: test.token})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			var body struct {
				Data  []organization.Organization `json:"data"`
				Error struct{ Code string }       `json:"error"`
			}
			if problem = json.Unmarshal(response.Body.Bytes(), &body); problem != nil || response.Code != test.status || body.Error.Code != test.code || (test.status != http.StatusOK && body.Data != nil) {
				t.Fatalf("list HTTP recovery contract failed: status=%d code=%s", response.Code, body.Error.Code)
			}
		}
		if snapshot() != baseline {
			t.Fatal("list changed business state")
		}
	})
	t.Run("list rechecks after query wait", func(t *testing.T) {
		sessionID := identity.SessionFromContext(verified.Context).ID
		before := snapshot()
		var cutoff time.Time
		if err = pool.QueryRow(ctx, `UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at`, sessionID).Scan(&cutoff); err != nil {
			t.Fatal(err)
		}
		defer func() {
			if _, problem := pool.Exec(ctx, `UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1`, sessionID); problem != nil {
				t.Fatal(problem)
			}
		}()
		blocker, problem := pool.Begin(ctx)
		if problem != nil {
			t.Fatal(problem)
		}
		defer blocker.Rollback(ctx)
		if _, problem = blocker.Exec(ctx, `LOCK TABLE organizations IN ACCESS EXCLUSIVE MODE`); problem != nil {
			t.Fatal(problem)
		}
		var pid int32
		if problem = blocker.QueryRow(ctx, `SELECT pg_backend_pid()`).Scan(&pid); problem != nil {
			t.Fatal(problem)
		}
		result := make(chan error, 1)
		go func() {
			listed, failure := service.List(verified.Context, user)
			if listed != nil {
				result <- errors.New("expired list returned private records")
				return
			}
			result <- failure
		}()
		waitOwnerMFABlocked(t, ctx, pool, pid, cutoff)
		if problem = blocker.Rollback(ctx); problem != nil {
			t.Fatal(problem)
		}
		if problem = <-result; !errors.Is(problem, identity.ErrInvalidToken) {
			t.Fatalf("expired session survived list query wait: %v", problem)
		}
		if snapshot() != before {
			t.Fatal("denied list changed business state")
		}
	})
	t.Run("current session authority and tenant isolation", func(t *testing.T) {
		var foreign string
		if err = pool.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at) VALUES('owner-gate-foreign@example.test','owner-gate-foreign@example.test',$1,'Synthetic foreign owner',clock_timestamp()) RETURNING id`, hash).Scan(&foreign); err != nil {
			t.Fatal(err)
		}
		other := testsupport.EnrollMFA(t, ctx, auth, "owner-gate-foreign@example.test", "Synthetic-owner-gate-password-2026")
		t.Run("store navigation contains only caller and deployment hints", func(t *testing.T) {
			for _, tc := range []struct {
				name, token, singleStore string
				hasStore, canCreate      bool
			}{
				{"primary-only owner", primaryToken, "", true, false},
				{"foreign account", other.Token, "", false, true},
				{"matching single store", primaryToken, created.Organization.ID, true, false},
				{"foreign single store", other.Token, created.Organization.ID, false, false},
			} {
				t.Run(tc.name, func(t *testing.T) {
					router := chi.NewRouter()
					limited := &organization.Service{Pool: pool, SingleStoreOrganizationID: tc.singleStore}
					organization.Handler{Service: limited, Authentication: auth}.Routes(router)
					request := httptest.NewRequest(http.MethodGet, "/organizations/store-status?user_id="+user, nil).WithContext(ctx)
					request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: tc.token})
					response := httptest.NewRecorder()
					router.ServeHTTP(response, request)
					var body struct {
						Data map[string]bool `json:"data"`
					}
					if decodeErr := json.Unmarshal(response.Body.Bytes(), &body); decodeErr != nil || response.Code != http.StatusOK ||
						len(body.Data) != 2 || body.Data["has_store"] != tc.hasStore ||
						body.Data["can_create_store"] != tc.canCreate || response.Header().Get("Cache-Control") != "no-store" {
						t.Fatalf("unexpected store status: HTTP %d, %v", response.Code, decodeErr)
					}
				})
			}
		})
		if listed, problem := service.List(other.Context, foreign); problem != nil || len(listed) != 0 {
			t.Fatalf("foreign list must be empty: %v", problem)
		}
		if listed, problem := service.List(other.Context, user); !errors.Is(problem, identity.ErrInvalidToken) || listed != nil {
			t.Fatalf("foreign session listed another actor's organizations: %v", problem)
		}
		if _, err = service.Context(other.Context, foreign, created.Organization.ID); !errors.Is(err, organization.ErrNotFound) {
			t.Fatalf("foreign MFA-authenticated user read restaurant: %v", err)
		}
		if authorization, failure := service.AuthorizeMFA(other.Context, foreign, created.Organization.ID, "branch.read"); !errors.Is(failure, organization.ErrNotFound) || authorization != nil {
			t.Fatalf("foreign MFA session acquired organization handle: %v", failure)
		}
		if _, err = service.Context(other.Context, user, created.Organization.ID); !errors.Is(err, identity.ErrInvalidToken) {
			t.Fatalf("mismatched actor parameter accepted: %v", err)
		}
		if authorization, failure := service.AuthorizeMFA(other.Context, user, created.Organization.ID, "branch.read"); !errors.Is(failure, identity.ErrInvalidToken) || authorization != nil {
			t.Fatalf("mismatched actor acquired organization handle: %v", failure)
		}
		if _, err = pool.Exec(ctx, `UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1`, identity.SessionFromContext(other.Context).ID); err != nil {
			t.Fatal(err)
		}
		if _, err = service.CreateRestaurant(other.Context, foreign, "a1000000-0000-4000-8000-000000000005", input); !errors.Is(err, identity.ErrInvalidToken) {
			t.Fatalf("cached revoked session created restaurant: %v", err)
		}
		if listed, problem := service.List(other.Context, foreign); !errors.Is(problem, identity.ErrInvalidToken) || listed != nil {
			t.Fatalf("revoked session returned an empty successful list: %v", problem)
		}
		if snapshot() != baseline {
			t.Fatal("denial changed business state")
		}
	})
	operations := []struct {
		name string
		run  func(context.Context, string) error
	}{
		{"branches", func(request context.Context, actor string) error {
			result, failure := service.Branches(request, actor, legacy.Organization.ID)
			if failure != nil && result != nil {
				return errors.New("denied branches exposed data")
			}
			return failure
		}},
		{"audit", func(request context.Context, actor string) error {
			result, failure := service.Audit(request, actor, legacy.Organization.ID, "")
			if failure != nil && result != nil {
				return errors.New("denied audit exposed data")
			}
			return failure
		}},
		{"update", func(request context.Context, actor string) error {
			input := legacy.Organization.OrganizationInput
			input.Name = "MFA protected organization update"
			result, failure := service.Update(request, actor, legacy.Organization.ID, input)
			if failure != nil && result.ID != "" {
				return errors.New("denied update exposed data")
			}
			return failure
		}},
		{"save branch", func(request context.Context, actor string) error {
			input := legacy.Branches[0].BranchInput
			input.Name = "MFA protected branch update"
			result, failure := service.SaveBranch(request, actor, legacy.Organization.ID, legacy.Branches[0].ID, input)
			if failure != nil && result.ID != "" {
				return errors.New("denied branch update exposed data")
			}
			return failure
		}},
	}
	t.Run("organization operations require session assurance", func(t *testing.T) {
		for _, operation := range operations {
			t.Run(operation.name, func(t *testing.T) {
				before := snapshot()
				for _, test := range []struct {
					request context.Context
					want    error
				}{
					{ctx, identity.ErrInvalidToken},
					{primary, identity.ErrMFARequired},
				} {
					if failure := operation.run(test.request, user); !errors.Is(failure, test.want) {
						t.Fatalf("unguarded %s: %v", operation.name, failure)
					}
				}
				if snapshot() != before {
					t.Fatal("denial changed organization state")
				}
				if failure := operation.run(verified.Context, user); failure != nil {
					t.Fatalf("assured operation failed: %v", failure)
				}
			})
		}
	})
	t.Run("organization operations preserve tenant and permission denials", func(t *testing.T) {
		var foreign string
		if err = pool.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at) VALUES('operation-foreign@example.test','operation-foreign@example.test',$1,'Synthetic operation foreign user',clock_timestamp()) RETURNING id`, hash).Scan(&foreign); err != nil {
			t.Fatal(err)
		}
		other := testsupport.EnrollMFA(t, ctx, auth, "operation-foreign@example.test", "Synthetic-owner-gate-password-2026")
		checkDenial := func(want error) {
			t.Helper()
			for _, operation := range operations {
				before := snapshot()
				if failure := operation.run(other.Context, foreign); !errors.Is(failure, want) {
					t.Fatalf("%s widened tenant or permission authority: %v", operation.name, failure)
				}
				if failure := operation.run(other.Context, user); !errors.Is(failure, identity.ErrInvalidToken) {
					t.Fatalf("%s accepted mismatched session actor: %v", operation.name, failure)
				}
				if snapshot() != before {
					t.Fatalf("%s denial changed business state", operation.name)
				}
			}
		}
		checkDenial(organization.ErrNotFound)
		setMembership := func(create bool) {
			t.Helper()
			tx, problem := pool.Begin(ctx)
			if problem != nil {
				t.Fatal(problem)
			}
			defer tx.Rollback(ctx)
			if _, problem = tx.Exec(ctx, `SELECT set_config('app.user_id',$1,true),set_config('app.organization_id',$2,true)`, user, legacy.Organization.ID); problem != nil {
				t.Fatal(problem)
			}
			if _, problem = tx.Exec(ctx, `SELECT id FROM organizations WHERE id=$1 FOR UPDATE`, legacy.Organization.ID); problem != nil {
				t.Fatal(problem)
			}
			if create {
				_, problem = tx.Exec(ctx, `INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'MANAGER')`, legacy.Organization.ID, foreign)
			} else {
				_, problem = tx.Exec(ctx, `UPDATE organization_memberships SET status='SUSPENDED' WHERE organization_id=$1 AND user_id=$2`, legacy.Organization.ID, foreign)
			}
			if problem != nil {
				t.Fatal(problem)
			}
			if problem = tx.Commit(ctx); problem != nil {
				t.Fatal(problem)
			}
		}
		setMembership(true)
		checkDenial(organization.ErrDenied)
		setMembership(false)
		checkDenial(organization.ErrNotFound)
	})
	t.Run("organization HTTP exposes explicit MFA recovery", func(t *testing.T) {
		router := chi.NewRouter()
		organization.Handler{Service: service, Authentication: auth}.Routes(router)
		for _, test := range []struct {
			method, suffix string
			body           any
			status         int
		}{
			{http.MethodGet, "/branches", nil, http.StatusOK},
			{http.MethodGet, "/branches/" + legacy.Branches[0].ID, nil, http.StatusOK},
			{http.MethodGet, "/audit", nil, http.StatusOK},
			{http.MethodPatch, "/", legacy.Organization.OrganizationInput, http.StatusOK},
			{http.MethodPatch, "/branches/" + legacy.Branches[0].ID, legacy.Branches[0].BranchInput, http.StatusOK},
			{http.MethodPost, "/branches", organization.BranchInput{Name: "MFA HTTP branch", Code: "MFA_HTTP", Status: "ACTIVE"}, http.StatusCreated},
		} {
			for _, session := range []struct {
				token, csrf string
				assured     bool
			}{
				{primaryToken, primaryCSRF, false},
				{verified.Token, verified.CSRF, true},
			} {
				body, problem := json.Marshal(test.body)
				if problem != nil {
					t.Fatal(problem)
				}
				request := httptest.NewRequest(test.method, "/organizations/"+legacy.Organization.ID+test.suffix, strings.NewReader(string(body))).WithContext(ctx)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: session.token})
				request.Header.Set("Origin", testsupport.MFAOrigin)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("X-CSRF-Token", session.csrf)
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				var result struct {
					Data  any                   `json:"data"`
					Error struct{ Code string } `json:"error"`
				}
				if problem = json.Unmarshal(response.Body.Bytes(), &result); problem != nil {
					t.Fatal(problem)
				}
				if !session.assured {
					if response.Code != http.StatusForbidden || result.Error.Code != "MFA_REQUIRED" || result.Data != nil {
						t.Fatalf("primary-only %s %s returned status=%d code=%s", test.method, test.suffix, response.Code, result.Error.Code)
					}
				} else if response.Code != test.status || result.Data == nil || result.Error.Code != "" {
					t.Fatalf("assured %s %s returned status=%d code=%s", test.method, test.suffix, response.Code, result.Error.Code)
				}
			}
		}
	})
	for _, operation := range operations {
		t.Run(operation.name+" rechecks after final business wait", func(t *testing.T) {
			before := snapshot()
			sessionID := identity.SessionFromContext(verified.Context).ID
			var cutoff time.Time
			if err = pool.QueryRow(ctx, `UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at`, sessionID).Scan(&cutoff); err != nil {
				t.Fatal(err)
			}
			defer func() {
				if _, problem := pool.Exec(ctx, `UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1`, sessionID); problem != nil {
					t.Fatal(problem)
				}
			}()
			blockerPool := pool
			if operation.name == "audit" {
				blockerPool = admin
			}
			blocker, problem := blockerPool.Begin(ctx)
			if problem != nil {
				t.Fatal(problem)
			}
			defer blocker.Rollback(ctx)
			switch operation.name {
			case "branches":
				_, problem = blocker.Exec(ctx, `LOCK TABLE branches IN ACCESS EXCLUSIVE MODE`)
			case "audit":
				_, problem = blocker.Exec(ctx, `LOCK TABLE organization_audit_events IN ACCESS EXCLUSIVE MODE`)
			default:
				_, problem = blocker.Exec(ctx, `SELECT pg_advisory_xact_lock(430081)`)
			}
			if problem != nil {
				t.Fatal(problem)
			}
			var pid int32
			if problem = blocker.QueryRow(ctx, `SELECT pg_backend_pid()`).Scan(&pid); problem != nil {
				t.Fatal(problem)
			}
			result := make(chan error, 1)
			go func() {
				request := organization.WithRequestID(verified.Context, "owner-mfa-final-wait")
				result <- operation.run(request, user)
			}()
			waitOwnerMFABlocked(t, ctx, pool, pid, cutoff)
			if problem = blocker.Rollback(ctx); problem != nil {
				t.Fatal(problem)
			}
			if problem = <-result; !errors.Is(problem, identity.ErrInvalidToken) {
				t.Fatalf("expired %s survived final business wait: %v", operation.name, problem)
			}
			if snapshot() != before {
				t.Fatal("expiry failed to roll back organization/branch/audit state")
			}
		})
	}
	t.Run("branchless setup read requires independent MFA", func(t *testing.T) {
		verifyBranchlessSetupReadMFA(t, ctx, pool, admin, auth, service, user, created.Organization.ID, primaryToken, primary, verified)
	})
	t.Run("branchless setup mutations require independent MFA", func(t *testing.T) {
		verifyBranchlessSetupWriteMFA(t, ctx, pool, admin, auth, service, user, primaryToken, primaryCSRF, primary, verified)
	})
	t.Run("retained setup read requires independent MFA", func(t *testing.T) {
		verifyRetainedSetupReadMFA(t, ctx, pool, admin, auth, service, user, legacy.Organization.ID, legacy.Branches[0].ID, primaryToken, primary, verified)
	})
	t.Run("retained setup mutations require independent MFA", func(t *testing.T) {
		verifySetupWriteMFA(t, ctx, pool, admin, auth, service, user, primaryToken, primaryCSRF, primary, verified, true)
	})
	t.Run("restaurant employee endpoints require independent MFA", func(t *testing.T) {
		verifyRestaurantEmployeeMFA(t, ctx, pool, admin, auth, service, user, primaryToken, primaryCSRF, primary, verified)
	})
	for index, boundary := range []string{"advisory", "context", "final", "commit", "authorization"} {
		t.Run("expiry across "+boundary+" lock", func(t *testing.T) {
			sessionID := identity.SessionFromContext(verified.Context).ID
			var cutoff time.Time
			if err = pool.QueryRow(ctx, `UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at`, sessionID).Scan(&cutoff); err != nil {
				t.Fatal(err)
			}
			blocker, problem := pool.Begin(ctx)
			if problem != nil {
				t.Fatal(problem)
			}
			defer blocker.Rollback(ctx)
			waitKey := fmt.Sprintf("a1000000-0000-4000-8000-%012d", index+10)
			var pid int32
			switch boundary {
			case "advisory":
				problem = blocker.QueryRow(ctx, `SELECT pg_backend_pid() FROM pg_advisory_xact_lock(hashtextextended($1,0))`, user+waitKey).Scan(&pid)
			case "context", "authorization":
				if _, problem = blocker.Exec(ctx, `SELECT set_config('app.user_id',$1,true),set_config('app.organization_id',$2,true)`, user, created.Organization.ID); problem == nil {
					problem = blocker.QueryRow(ctx, `SELECT pg_backend_pid() FROM organizations WHERE id=$1 FOR UPDATE`, created.Organization.ID).Scan(&pid)
				}
			default:
				problem = blocker.QueryRow(ctx, `SELECT pg_backend_pid() FROM pg_advisory_xact_lock(430081)`).Scan(&pid)
			}
			if problem != nil {
				t.Fatal(problem)
			}
			before := snapshot()
			result := make(chan error, 1)
			go func() {
				if boundary == "authorization" {
					authorization, failure := service.AuthorizeMFA(verified.Context, user, created.Organization.ID, "organization.read")
					if authorization != nil {
						authorization.Tx.Rollback(ctx)
						result <- errors.New("expired acquisition returned authorization")
						return
					}
					result <- failure
					return
				}
				if boundary == "context" {
					_, failure := service.Context(verified.Context, user, created.Organization.ID)
					result <- failure
					return
				}
				requestCtx := verified.Context
				if boundary == "final" || boundary == "commit" {
					requestCtx = organization.WithRequestID(requestCtx, "owner-mfa-"+boundary+"-wait")
				}
				_, failure := service.CreateRestaurant(requestCtx, user, waitKey, input)
				result <- failure
			}()
			waitOwnerMFABlocked(t, ctx, pool, pid, cutoff)
			if problem = blocker.Rollback(ctx); problem != nil {
				t.Fatal(problem)
			}
			if problem = <-result; !errors.Is(problem, identity.ErrInvalidToken) {
				t.Fatalf("expired session survived %s wait: %v", boundary, problem)
			}
			if boundary != "commit" && snapshot() != before {
				t.Fatal("denied operation failed atomic rollback")
			}
			if _, problem = pool.Exec(ctx, `UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1`, sessionID); problem != nil {
				t.Fatal(problem)
			}
			if boundary == "commit" {
				var committed string
				if problem = pool.QueryRow(ctx, `SELECT organization_id FROM organization_creation_requests WHERE user_id=$1 AND key=$2`, user, waitKey).Scan(&committed); problem != nil {
					t.Fatal("creation should have committed before response gate denied")
				}
				recovered, failure := service.CreateRestaurant(verified.Context, user, waitKey, input)
				if failure != nil || recovered.Organization.ID != committed {
					t.Fatalf("same-key recovery lost committed restaurant: %v", failure)
				}
			}
		})
	}
}

func waitOwnerMFABlocked(t *testing.T, ctx context.Context, pool *pgxpool.Pool, blocker int32, cutoff time.Time) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var blocked, expired bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))),clock_timestamp()>=$2`, blocker, cutoff).Scan(&blocked, &expired); err != nil {
			t.Fatal(err)
		}
		if blocked && expired {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("expected business lock/time rendezvous not reached")
}
