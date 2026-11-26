package storefront_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/stripe"
	"smartpos/api/internal/testsupport"
)

type sandboxMFAGateway struct {
	configured bool
	check      func() bool
	invoke     func(context.Context, string, stripe.Scope, string) error
	calls      []sandboxMFACall
}

type sandboxMFACall struct {
	action, identity string
	scope            stripe.Scope
}

func (gateway *sandboxMFAGateway) Configured() bool {
	if gateway.check != nil {
		return gateway.check()
	}
	return gateway.configured
}
func (gateway *sandboxMFAGateway) run(ctx context.Context, action string, scope stripe.Scope, id string) error {
	gateway.calls = append(gateway.calls, sandboxMFACall{action, id, scope})
	if gateway.invoke != nil {
		return gateway.invoke(ctx, action, scope, id)
	}
	return nil
}
func (gateway *sandboxMFAGateway) CreateCheckout(ctx context.Context, scope stripe.Scope, id string) (stripe.Checkout, error) {
	return stripe.Checkout{ID: "cs_test_mfa", URL: "https://checkout.stripe.com/c/pay/cs_test_mfa", Status: "open", PaymentStatus: "unpaid", AmountMinor: 2000, Currency: "thb"}, gateway.run(ctx, "create", scope, id)
}
func (gateway *sandboxMFAGateway) RetrieveCheckout(ctx context.Context, scope stripe.Scope, id string) (stripe.Checkout, error) {
	return stripe.Checkout{ID: id, Status: "complete", PaymentStatus: "paid", AmountMinor: 2000, Currency: "thb"}, gateway.run(ctx, "retrieve", scope, id)
}
func (gateway *sandboxMFAGateway) RefundCheckout(ctx context.Context, scope stripe.Scope, id string) (stripe.Refund, error) {
	return stripe.Refund{ID: "re_sandboxMFA", Status: "pending", AmountMinor: 2000, Currency: "thb"}, gateway.run(ctx, "refund", scope, id)
}

type sandboxMFAAction struct {
	action, method, path string
	status               int
}

var sandboxMFAActions = []sandboxMFAAction{
	{"status", "GET", "", 200},
	{"create", "POST", "/checkouts", 201},
	{"retrieve", "GET", "/checkouts/cs_test_mfa", 200},
	{"refund", "POST", "/checkouts/cs_test_mfa/refund", 200},
}

const sandboxMFAKey = "de000000-0000-4000-8000-000000000002"

func sandboxMFARouter(organizations *organization.Service, gateway *sandboxMFAGateway) http.Handler {
	router := chi.NewRouter()
	router.Route("/organizations/{id}", storefront.SandboxHandler{Organization: organizations, Gateway: gateway}.Routes)
	return router
}

func sandboxMFARequest(ctx context.Context, org string, action sandboxMFAAction, body io.Reader) *http.Request {
	request := httptest.NewRequest(action.method, "/organizations/"+org+"/storefront/payment-sandbox"+action.path, body).WithContext(ctx)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", sandboxMFAKey)
	return request
}

func sandboxMFADenial(t *testing.T, response *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if response.Code != status || !strings.Contains(response.Body.String(), code) || strings.Contains(response.Body.String(), `"data"`) || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("sandbox denial disclosed private data or mapped error incorrectly: status=%d want=%d code=%s", response.Code, status, code)
	}
}

func sandboxMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string) {
	t.Helper()
	_, token, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, token)
	user, session := identity.SessionFromContext(owner.Context).User.ID, identity.SessionFromContext(owner.Context).ID
	foreign := identity.SessionFromContext(guest.Context).User.ID
	gateway := &sandboxMFAGateway{configured: true}
	router := sandboxMFARouter(organizations, gateway)
	before := privatePreflightSnapshot(t, ctx, organizations, user, org)
	proof := privateQuoteProof(t, ctx, pool, user)
	call := func(requestCtx context.Context, organizationID string, action sandboxMFAAction, body io.Reader) *httptest.ResponseRecorder {
		t.Helper()
		response := httptest.NewRecorder()
		router.ServeHTTP(response, sandboxMFARequest(requestCtx, organizationID, action, body))
		return response
	}
	for _, configured := range []bool{false, true} {
		gateway.configured = configured
		for _, action := range sandboxMFAActions {
			sandboxMFADenial(t, call(primary, org, action, strings.NewReader(`{}`)), 403, "MFA_REQUIRED")
			sandboxMFADenial(t, call(context.Background(), org, action, strings.NewReader(`{}`)), 401, "UNAUTHENTICATED")
			sandboxMFADenial(t, call(guest.Context, org, action, strings.NewReader(`{}`)), 404, "NOT_FOUND")
			sandboxMFADenial(t, call(owner.Context, "de000000-0000-4000-8000-000000000003", action, strings.NewReader(`{}`)), 404, "NOT_FOUND")
			response := call(owner.Context, org, action, strings.NewReader(`{}`))
			if !configured {
				if action.action == "status" {
					if response.Code != 200 || !strings.Contains(response.Body.String(), `"configured":false`) || !strings.Contains(response.Body.String(), `"customer_checkout_enabled":false`) {
						t.Fatal("disabled sandbox status changed")
					}
				} else {
					sandboxMFADenial(t, response, 503, "GATEWAY_UNAVAILABLE")
				}
			} else if response.Code != action.status || !strings.Contains(response.Body.String(), `"amount_minor":2000`) || !strings.Contains(response.Body.String(), `"currency":"thb"`) {
				t.Fatalf("authorized sandbox %s changed exact result: %d", action.action, response.Code)
			}
		}
	}
	if len(gateway.calls) != 3 {
		t.Fatal("denied or disabled sandbox dispatched")
	}
	if privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatal("sandbox configuration or commands changed local business history")
	}
	for _, membership := range []string{"ACTIVE", "SUSPENDED"} {
		privateReadMembership(t, ctx, organizations, user, org, foreign, membership)
		for _, action := range sandboxMFAActions {
			status, code := 403, "FORBIDDEN"
			if membership == "SUSPENDED" {
				status, code = 404, "NOT_FOUND"
			}
			sandboxMFADenial(t, call(guest.Context, org, action, strings.NewReader(`{}`)), status, code)
		}
	}
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	router = sandboxMFARouter(&organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}, gateway)
	for _, action := range sandboxMFAActions {
		sandboxMFADenial(t, call(owner.Context, org, action, strings.NewReader(`{}`)), 404, "NOT_FOUND")
	}
	router = sandboxMFARouter(organizations, gateway)
	for _, action := range []sandboxMFAAction{sandboxMFAActions[1], sandboxMFAActions[3]} {
		for _, body := range []string{`{"amount":1}`, `{} {}`, `null`, `[]`, `{"secret":"private"}`, `{"organization_id":"foreign"}`, strings.Repeat(" ", 1025)} {
			sandboxMFADenial(t, call(owner.Context, org, action, strings.NewReader(body)), 400, "INVALID_INPUT")
		}
		request := sandboxMFARequest(owner.Context, org, action, strings.NewReader(`{}`))
		request.Header.Set("Content-Type", "text/plain")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		sandboxMFADenial(t, response, 415, "UNSUPPORTED_MEDIA_TYPE")
	}
	if len(gateway.calls) != 3 {
		t.Fatal("invalid or inaccessible sandbox dispatched")
	}
	// Runtime fixtures keep a second Owner while testing revocation of the caller.
	tx, _, err := organizations.Authorized(ctx, user, org, "storefront.manage")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, "UPDATE organization_memberships SET role='OWNER',status='ACTIVE' WHERE organization_id=$1 AND user_id=$2", org, foreign); err == nil {
		err = tx.Commit(ctx)
	}
	tx.Rollback(ctx)
	if err != nil {
		t.Fatal(err)
	}
	before = privatePreflightSnapshot(t, ctx, organizations, user, org)
	var factor string
	var verified time.Time
	if err = pool.QueryRow(ctx, "SELECT mfa_factor_id::text,mfa_verified_at FROM auth_sessions WHERE id=$1", session).Scan(&factor, &verified); err != nil {
		t.Fatal(err)
	}
	member := func(role, status string) {
		t.Helper()
		tx, _, problem := organizations.Authorized(ctx, foreign, org, "storefront.manage")
		if problem != nil {
			t.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		if _, problem = tx.Exec(ctx, "UPDATE organization_memberships SET role=$3,status=$4 WHERE organization_id=$1 AND user_id=$2", org, user, role, status); problem == nil {
			problem = tx.Commit(ctx)
		}
		if problem != nil {
			t.Fatal(problem)
		}
	}
	restore := func() {
		t.Helper()
		if _, problem := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour',revoked_at=NULL,mfa_factor_id=$2,mfa_verified_at=$3 WHERE id=$1", session, factor, verified); problem != nil {
			t.Fatal(problem)
		}
		member("OWNER", "ACTIVE")
	}
	defer restore()
	probe := func(requestCtx context.Context) {
		t.Helper()
		bounded, cancel := context.WithTimeout(requestCtx, 2*time.Second)
		defer cancel()
		tx, _, problem := organizations.Authorized(bounded, user, org, "storefront.manage")
		if problem != nil {
			t.Fatal("sandbox retained organization locks across local/provider work")
		}
		defer tx.Rollback(bounded)
		if _, problem = tx.Exec(bounded, "SELECT id FROM auth_sessions WHERE id=$1 FOR UPDATE NOWAIT", session); problem != nil {
			t.Fatal("sandbox retained session locks across local/provider work")
		}
	}
	for _, failure := range []struct {
		kind, code string
		status     int
	}{
		{"expired", "UNAUTHENTICATED", 401}, {"revoked", "UNAUTHENTICATED", 401}, {"primary", "MFA_REQUIRED", 403},
		{"canceled", "GATEWAY_UNAVAILABLE", 503}, {"suspended", "NOT_FOUND", 404}, {"demoted", "FORBIDDEN", 403},
	} {
		for _, providerError := range []bool{false, true} {
			for _, action := range sandboxMFAActions[1:] {
				requestCtx, cancel := context.WithCancel(owner.Context)
				gateway.invoke = func(network context.Context, gotAction string, scope stripe.Scope, id string) error {
					probe(network)
					deadline, bounded := network.Deadline()
					wantID := "cs_test_mfa"
					if action.action == "create" {
						wantID = sandboxMFAKey
					}
					if !bounded || time.Until(deadline) > 25*time.Second || scope != (stripe.Scope{OrganizationID: org, UserID: user}) || id != wantID || gotAction != action.action {
						t.Fatal("sandbox changed bound, scope or operation identity")
					}
					var problem error
					switch failure.kind {
					case "expired":
						_, problem = pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", session)
					case "revoked":
						_, problem = pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1", session)
					case "primary":
						_, problem = pool.Exec(ctx, "UPDATE auth_sessions SET mfa_factor_id=NULL,mfa_verified_at=NULL WHERE id=$1", session)
					case "canceled":
						cancel()
					case "suspended":
						member("OWNER", "SUSPENDED")
					case "demoted":
						member("MANAGER", "ACTIVE")
					}
					if problem != nil {
						t.Fatal(problem)
					}
					if providerError {
						return stripe.ErrConflict
					}
					return nil
				}
				previous := len(gateway.calls)
				response := call(requestCtx, org, action, strings.NewReader(`{}`))
				cancel()
				sandboxMFADenial(t, response, failure.status, failure.code)
				restore()
				if len(gateway.calls) != previous+1 || privatePreflightSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("sandbox repeated an uncertain dispatch or changed local history")
				}
				gateway.invoke = nil
				response = call(owner.Context, org, action, strings.NewReader(`{}`))
				if response.Code != action.status || len(gateway.calls) != previous+2 || !reflect.DeepEqual(gateway.calls[previous], gateway.calls[previous+1]) {
					t.Fatal("sandbox recovery replaced the original scope/key/session identity")
				}
			}
		}
	}
	for _, action := range sandboxMFAActions {
		for _, configured := range []bool{false, true} {
			for _, canceled := range []bool{false, true} {
				requestCtx, cancel := context.WithCancel(owner.Context)
				gateway.check = func() bool {
					probe(requestCtx)
					if canceled {
						cancel()
					} else if _, problem := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", session); problem != nil {
						t.Fatal(problem)
					}
					return configured
				}
				previous := len(gateway.calls)
				response := call(requestCtx, org, action, strings.NewReader(`{}`))
				cancel()
				status, code := 401, "UNAUTHENTICATED"
				if canceled {
					status, code = 503, "GATEWAY_UNAVAILABLE"
				}
				sandboxMFADenial(t, response, status, code)
				restore()
				if len(gateway.calls) != previous {
					t.Fatal("interrupted configuration dispatched")
				}
			}
		}
	}
	gateway.check = nil
	for _, action := range []sandboxMFAAction{sandboxMFAActions[1], sandboxMFAActions[3]} {
		requestCtx, cancel := context.WithCancel(owner.Context)
		previous := len(gateway.calls)
		body := &sandboxMFAReader{Reader: strings.NewReader(`{}`), before: func() { probe(requestCtx); cancel() }}
		sandboxMFADenial(t, call(requestCtx, org, action, body), 503, "GATEWAY_UNAVAILABLE")
		cancel()
		if len(gateway.calls) != previous {
			t.Fatal("canceled body read dispatched")
		}
	}
	for _, stage := range []int{1, 2, 3} {
		for _, expired := range []bool{true, false} {
			verifySandboxMFAWait(t, ctx, pool, organizations, owner, org, stage, expired)
		}
	}
	if privatePreflightSnapshot(t, ctx, organizations, user, org) != before || privateQuoteProof(t, ctx, pool, user) != proof {
		t.Fatal("sandbox changed local business or MFA proof history")
	}
	verifySandboxMFAMiddleware(t, ctx, auth, organizations, owner, org)
}

type sandboxMFAReader struct {
	io.Reader
	before func()
}

func (reader *sandboxMFAReader) Read(buffer []byte) (int, error) {
	if reader.before != nil {
		before := reader.before
		reader.before = nil
		before()
	}
	return reader.Reader.Read(buffer)
}

func verifySandboxMFAWait(t *testing.T, ctx context.Context, pool *pgxpool.Pool, organizations *organization.Service, owner testsupport.MFASession, org string, stage int, expired bool) {
	t.Helper()
	trace := &privateReadTrace{prefix: "SELECT m.id,m.user_id", remaining: stage, arrived: make(chan struct{}), release: make(chan struct{})}
	configuration := pool.Config()
	configuration.ConnConfig.Tracer = trace
	tracedPool, err := pgxpool.NewWithConfig(ctx, configuration)
	if err != nil {
		t.Fatal(err)
	}
	defer tracedPool.Close()
	session := identity.SessionFromContext(owner.Context).ID
	var cutoff time.Time
	if expired {
		if err = pool.QueryRow(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at", session).Scan(&cutoff); err != nil {
			t.Fatal(err)
		}
		defer func() {
			if _, problem := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", session); problem != nil {
				t.Error(problem)
			}
		}()
	}
	gateway := &sandboxMFAGateway{configured: true}
	router := sandboxMFARouter(&organization.Service{Pool: tracedPool}, gateway)
	requestCtx, cancel := context.WithCancel(owner.Context)
	defer cancel()
	release := sync.OnceFunc(func() { close(trace.release) })
	defer release()
	result := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, sandboxMFARequest(requestCtx, org, sandboxMFAActions[1], strings.NewReader(`{}`)))
		result <- response
	}()
	select {
	case <-trace.arrived:
	case <-time.After(5 * time.Second):
		t.Fatal("sandbox authorization did not reach expected query stage")
	}
	if expired {
		for {
			var elapsed bool
			if err = pool.QueryRow(ctx, "SELECT clock_timestamp()>=$1", cutoff).Scan(&elapsed); err != nil {
				t.Fatal(err)
			}
			if elapsed {
				break
			}
			time.Sleep(10 * time.Millisecond)
		}
	} else {
		cancel()
	}
	release()
	select {
	case response := <-result:
		status, code := 401, "UNAUTHENTICATED"
		if !expired {
			status, code = 503, "GATEWAY_UNAVAILABLE"
		}
		sandboxMFADenial(t, response, status, code)
	case <-time.After(5 * time.Second):
		t.Fatal("interrupted sandbox authorization did not finish")
	}
	wantCalls := 0
	if stage == 3 {
		wantCalls = 1
	}
	if len(gateway.calls) != wantCalls {
		t.Fatal("interrupted sandbox authorization dispatched at the wrong stage")
	}
}

func verifySandboxMFAMiddleware(t *testing.T, ctx context.Context, auth identity.Handler, organizations *organization.Service, owner testsupport.MFASession, org string) {
	t.Helper()
	gateway := &sandboxMFAGateway{configured: true}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, storefront.SandboxHandler{Organization: organizations, Gateway: gateway}.Routes)
	for _, action := range sandboxMFAActions {
		for _, candidate := range []string{"missing-session", "missing-csrf", "foreign-origin", "allowed"} {
			request := sandboxMFARequest(ctx, org, action, strings.NewReader(`{}`))
			if candidate != "missing-session" {
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
			}
			request.Header.Set("Origin", testsupport.MFAOrigin)
			if candidate != "missing-csrf" {
				request.Header.Set("X-CSRF-Token", owner.CSRF)
			}
			if candidate == "foreign-origin" {
				request.Header.Set("Origin", "https://foreign.example.test")
			}
			previous := len(gateway.calls)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			want := action.status
			if candidate == "missing-session" {
				want = 401
			} else if action.method == "POST" && candidate != "allowed" {
				want = 403
			}
			if response.Code != want || want >= 400 && (strings.Contains(response.Body.String(), `"data"`) || len(gateway.calls) != previous) {
				t.Fatalf("sandbox real middleware boundary %s/%s: %d", action.action, candidate, response.Code)
			}
		}
	}
}
