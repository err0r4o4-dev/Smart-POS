package storefront_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/returns"
	"smartpos/api/internal/testsupport"
)

func returnsReadMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest, staff testsupport.MFASession, org, branch string) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User
	service := &returns.Service{Organization: organizations}
	filter := returns.Filter{Page: 1, PageSize: 25}
	for _, kind := range []string{"returns", "refunds"} {
		if data, err := service.List(owner.Context, user.ID, org, kind, filter); err != nil || !json.Valid(data) {
			t.Fatalf("authorized %s list: valid=%t err=%v", kind, json.Valid(data), err)
		}
	}
	for _, kind := range []string{"EXCHANGE", "REVERSAL"} {
		if data, err := service.ListAdjustments(owner.Context, user.ID, org, kind, filter); err != nil || !json.Valid(data) {
			t.Fatalf("authorized %s list: valid=%t err=%v", kind, json.Valid(data), err)
		}
	}
	guestID := identity.SessionFromContext(guest.Context).User.ID
	if data, err := service.List(guest.Context, guestID, org, "returns", filter); !errors.Is(err, organization.ErrNotFound) || data != nil {
		t.Fatalf("nonmember returns list: data=%t err=%v", data != nil, err)
	}
	_, token, csrf, err := auth.Service.Login(ctx, user.Email, "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, returns.Handler{Service: service}.TenantRoutes)
	const resource = "/00000000-0000-4000-8000-000000000001"
	const key = "00000000-0000-4000-8000-000000000002"
	type operation struct{ method, path string }
	var operations []operation
	for _, path := range []string{
		"/returns", "/returns" + resource, "/returns/sales" + resource,
		"/refunds", "/refunds" + resource, "/exchanges", "/exchanges" + resource,
		"/sales/voids", "/sales/voids" + resource, "/exchanges/quote", "/sales/voids/quote",
	} {
		method := http.MethodGet
		if strings.HasSuffix(path, "/quote") {
			method = http.MethodPost
		}
		operations = append(operations, operation{method, path})
	}
	operations = append(operations, operation{http.MethodPost, "/returns"})
	for _, action := range []string{"submit", "approve", "reject", "cancel", "complete"} {
		operations = append(operations, operation{http.MethodPost, "/returns" + resource + "/" + action})
	}
	for _, action := range []string{"report-settlement", "confirm-settlement", "reconcile"} {
		operations = append(operations, operation{http.MethodPost, "/refunds" + resource + "/" + action})
	}
	for _, path := range []string{"/exchanges", "/sales/voids"} {
		operations = append(operations, operation{http.MethodPost, path}, operation{http.MethodPatch, path + resource})
		for _, action := range []string{"submit", "approve", "reject", "cancel", "confirm-settlement", "complete"} {
			operations = append(operations, operation{http.MethodPost, path + resource + "/" + action})
		}
	}
	type denial struct {
		name, token, csrf, code string
		status                  int
		noStore                 bool
	}
	checkDenials := func(t *testing.T, actor denial) {
		t.Helper()
		for _, op := range operations {
			t.Run(actor.name+"/"+op.method+" "+op.path, func(t *testing.T) {
				request := httptest.NewRequest(op.method, "/organizations/"+org+op.path, strings.NewReader("{}"))
				request.Header.Set("Content-Type", "application/json")
				if op.method != http.MethodGet {
					request.Header.Set("Origin", testsupport.MFAOrigin)
					request.Header.Set("X-CSRF-Token", actor.csrf)
					request.Header.Set("Idempotency-Key", key)
				}
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: actor.token})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				var body struct {
					Data  json.RawMessage
					Error struct{ Code string }
				}
				if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || response.Code != actor.status ||
					body.Error.Code != actor.code || len(body.Data) != 0 || (actor.noStore && response.Header().Get("Cache-Control") != "no-store") {
					t.Fatalf("wanted private denial %d %s: status=%d code=%q data=%t no-store=%t decodeErr=%v",
						actor.status, actor.code, response.Code, body.Error.Code, len(body.Data) != 0, response.Header().Get("Cache-Control") == "no-store", err)
				}
			})
		}
	}
	checkDenials(t, denial{"primary_owner", token, csrf, "MFA_REQUIRED", http.StatusForbidden, true})
	checkDenials(t, denial{"mfa_nonmember", guest.Token, guest.CSRF, "NOT_FOUND", http.StatusNotFound, true})
	for _, role := range []string{"CASHIER", "MANAGER", "INVENTORY_STAFF", "PURCHASING_STAFF"} {
		t.Run("legacy branch assignment/"+role, func(t *testing.T) {
			staffID := identity.SessionFromContext(staff.Context).User.ID
			tx, _, err := organizations.Authorized(ctx, user.ID, org, "returns.read")
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			var membership string
			if err := tx.QueryRow(ctx, `INSERT INTO organization_memberships(organization_id,user_id,role)
				VALUES($1,$2,$3) ON CONFLICT (organization_id,user_id) DO UPDATE SET role=excluded.role
				RETURNING id`, org, staffID, role).Scan(&membership); err != nil {
				t.Fatal(err)
			}
			if _, err := tx.Exec(ctx, `INSERT INTO branch_memberships(organization_id,membership_id,branch_id)
				VALUES($1,$2,$3) ON CONFLICT (membership_id,branch_id) DO NOTHING`, org, membership, branch); err != nil {
				t.Fatal(err)
			}
			if err := tx.Commit(ctx); err != nil {
				t.Fatal(err)
			}
			checkDenials(t, denial{"mfa_staff", staff.Token, staff.CSRF, "FORBIDDEN", http.StatusForbidden, true})
		})
	}
	for _, interruption := range []struct {
		name   string
		cancel bool
	}{{"expired after projection", false}, {"canceled after projection", true}} {
		t.Run(interruption.name, func(t *testing.T) {
			catalogReadInterrupted(t, ctx, pool, owner, "WITH matched AS (SELECT to_jsonb(doc)", 1, interruption.cancel,
				func(request context.Context, traced *catalog.Service) (any, error) {
					return (&returns.Service{Organization: traced.Organization}).List(request, user.ID, org, "returns", filter)
				}, true)
		})
	}
	t.Run("revoked MFA Owner", func(t *testing.T) {
		// Temporarily revoke only the shared synthetic Owner session. Later
		// subtests in the same disposable database still need that fixture.
		session := identity.SessionFromContext(owner.Context).ID
		var revokedAt string
		if err := pool.QueryRow(ctx, `UPDATE auth_sessions SET revoked_at=clock_timestamp()
			WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND mfa_verified_at IS NOT NULL
			RETURNING revoked_at::text`, session, user.ID).Scan(&revokedAt); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			result, err := pool.Exec(ctx, `UPDATE auth_sessions SET revoked_at=NULL
				WHERE id=$1 AND user_id=$2 AND revoked_at=$3::text::timestamptz`, session, user.ID, revokedAt)
			if err != nil || result.RowsAffected() != 1 {
				t.Errorf("restore synthetic Owner session: rows=%d err=%v", result.RowsAffected(), err)
			}
		})
		checkDenials(t, denial{"revoked_owner", owner.Token, owner.CSRF, "UNAUTHENTICATED", http.StatusUnauthorized, false})
	})
}
