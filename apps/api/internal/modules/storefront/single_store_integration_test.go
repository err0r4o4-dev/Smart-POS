package storefront_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/database"
	"smartpos/api/internal/testsupport"
	"smartpos/api/internal/transport"
)

type singleStoreMailbox struct {
	tokens             map[string]string
	verificationTokens map[string]string
}

func (mailbox *singleStoreMailbox) SendReset(context.Context, string, string) error { return nil }
func (mailbox *singleStoreMailbox) SendEmailVerification(_ context.Context, email, token string) error {
	mailbox.verificationTokens[email] = token
	return nil
}
func (mailbox *singleStoreMailbox) SendInvitation(_ context.Context, email, token string) error {
	mailbox.tokens[email] = token
	return nil
}

func TestSingleStoreIsolatedDatabase(t *testing.T) {
	dsn := os.Getenv("SMARTPOS_SINGLE_STORE_TEST_DSN")
	if dsn == "" {
		t.Skip("requires explicitly provisioned ephemeral single-store database")
	}
	configuration, err := pgxpool.ParseConfig(dsn)
	if err != nil || configuration.ConnConfig.Host != "127.0.0.1" || configuration.ConnConfig.Port != 15514 || configuration.ConnConfig.Database != "smartpos_single_store_acceptance" {
		t.Fatal("refusing an unconfirmed isolated database target")
	}
	// The aggregate suite runs serial database-clock expiry checks across modules.
	deadline := 12 * time.Minute
	if os.Getenv("SMARTPOS_RESTAURANT_BROWSER") == "1" {
		deadline += time.Minute
	}
	ctx, cancel := context.WithTimeout(context.Background(), deadline)
	defer cancel()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatal("isolated database unavailable")
	}
	defer pool.Close()
	var marker string
	if err = pool.QueryRow(ctx, "SELECT marker FROM single_store_acceptance_marker").Scan(&marker); err != nil {
		t.Fatalf("isolated marker prerequisite failed: %s", strings.ReplaceAll(err.Error(), configuration.ConnConfig.Password, "[redacted]"))
	}
	if marker != "ephemeral-single-store" {
		t.Fatal("isolated database marker missing")
	}
	var users int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM users").Scan(&users); err != nil || users != 0 {
		t.Fatal("test requires a fresh empty isolated fixture database")
	}
	if err = (database.Checker{Pool: pool}).Ready(ctx); err != nil {
		t.Fatal("official schema migrations are required")
	}
	mailbox := &singleStoreMailbox{tokens: map[string]string{}, verificationTokens: map[string]string{}}
	accounts, err := identity.NewService(ctx, pool, mailbox, slog.New(slog.NewTextHandler(io.Discard, nil)), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	owner, err := accounts.Register(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026", "Synthetic owner")
	if err != nil {
		t.Fatal(err)
	}
	guest, err := accounts.Register(ctx, "single-store-staff@example.test", "Synthetic-staff-password-2026", "Synthetic staff")
	if err != nil {
		t.Fatal(err)
	}
	for _, profile := range []identity.Profile{owner.Profile, guest.Profile} {
		token := mailbox.verificationTokens[profile.Email]
		if token == "" {
			t.Fatalf("verification token missing for %s", profile.Email)
		}
		result, verifyErr := accounts.VerifyEmail(ctx, token)
		if verifyErr != nil {
			t.Fatal(verifyErr)
		}
		if !result.Verified || !result.User.EmailVerified || result.User.ID != profile.ID {
			t.Fatalf("verification failed for %s", profile.Email)
		}
	}
	mfa, err := identity.NewMFAService(pool, "synthetic-storefront-key", bytes.Repeat([]byte{0x42}, 32))
	if err != nil {
		t.Fatal(err)
	}
	auth := identity.Handler{Service: accounts, MFA: mfa, Origins: []string{testsupport.MFAOrigin}}
	ownerSession := testsupport.EnrollMFA(t, ctx, auth, owner.Email, "Synthetic-owner-password-2026")
	guestSession := testsupport.EnrollMFA(t, ctx, auth, guest.Email, "Synthetic-staff-password-2026")
	ctx = ownerSession.Context
	t.Run("sensitive authority requires recent primary and TOTP", func(t *testing.T) {
		recentMFAAcceptance(t, ctx, pool, ownerSession, guestSession)
	})
	multi := &organization.Service{Pool: pool, Mailer: mailbox}
	createInput := func(code string) organization.CreateInput {
		return organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Synthetic " + code, Code: code, BusinessType: "RETAIL"}, Branch: organization.BranchInput{Name: "Main", Code: "MAIN", Status: "ACTIVE"}}
	}
	first, err := multi.Create(ctx, owner.ID, "11111111-1111-4111-8111-111111111111", createInput("FIRST"))
	if err != nil {
		t.Fatal(err)
	}
	second, err := multi.Create(ctx, owner.ID, "22222222-2222-4222-8222-222222222222", createInput("SECOND"))
	if err != nil {
		t.Fatal(err)
	}
	t.Run("branchless restaurant organization", func(t *testing.T) {
		restaurantOwner, problem := accounts.Register(ctx, "branchless-owner@example.test", "Synthetic-branchless-owner-password-2026", "Branchless restaurant owner")
		if problem != nil {
			t.Fatal(problem)
		}
		verified, problem := accounts.VerifyEmail(ctx, mailbox.verificationTokens[restaurantOwner.Profile.Email])
		if problem != nil || !verified.Verified {
			t.Fatalf("branchless fixture owner verification failed: %v", problem)
		}
		restaurantSession := testsupport.EnrollMFA(t, ctx, auth, restaurantOwner.Email, "Synthetic-branchless-owner-password-2026")
		ctx := restaurantSession.Context
		branchless := verifyBranchlessOrganization(t, ctx, guestSession.Context, multi, restaurantOwner.ID, guest.ID)
		_, token, csrf, problem := accounts.Login(ctx, restaurantOwner.Email, "Synthetic-branchless-owner-password-2026")
		if problem != nil {
			t.Fatal(problem)
		}
		verifyAvailabilityHTTP(t, auth, multi, restaurantSession, guestSession, ownerSession, testsupport.MFASession{Token: token, CSRF: csrf}, branchless.Organization.ID)
		t.Run("modifier owner read", func(t *testing.T) {
			primary := testsupport.Authenticate(t, ctx, auth, token)
			verifyModifierOwnerRead(t, ctx, primary, guestSession.Context, multi, restaurantOwner.ID, guest.ID, branchless.Organization.ID)
		})
		unverified, problem := accounts.Register(ctx, "branchless-unverified@example.test", "Synthetic-unverified-password-2026", "Unverified restaurant owner")
		if problem != nil {
			t.Fatal(problem)
		}
		_, problem = multi.CreateRestaurant(ctx, unverified.ID, "83711111-1111-4111-8111-111111111111", organization.OrganizationInput{Name: "Unverified restaurant", BusinessType: "RESTAURANT"})
		if !errors.Is(problem, organization.ErrDenied) {
			t.Fatalf("unverified user created a restaurant: %v", problem)
		}
		fixtureTx, _, problem := multi.Authorized(ctx, restaurantOwner.ID, branchless.Organization.ID, "organization.read")
		if problem != nil {
			t.Fatal(problem)
		}
		defer fixtureTx.Rollback(ctx)
		if _, problem = fixtureTx.Exec(ctx, "INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'OWNER','ACTIVE')", branchless.Organization.ID, unverified.ID); problem != nil {
			t.Fatal(problem)
		}
		if problem = fixtureTx.Commit(ctx); problem != nil {
			t.Fatal(problem)
		}
		_, unverifiedToken, _, problem := accounts.Login(ctx, unverified.Email, "Synthetic-unverified-password-2026")
		if problem != nil {
			t.Fatal(problem)
		}
		unverifiedCtx := testsupport.Authenticate(t, ctx, auth, unverifiedToken)
		if _, problem = (&restaurant.Service{Organization: multi}).Setup(unverifiedCtx, unverified.ID, branchless.Organization.ID, ""); !errors.Is(problem, identity.ErrMFARequired) {
			t.Fatalf("unverified owner read branchless setup: %v", problem)
		}
		if _, problem = (&storefront.Service{Organization: multi}).Settings(unverifiedCtx, unverified.ID, branchless.Organization.ID); !errors.Is(problem, identity.ErrMFARequired) {
			t.Fatalf("unverified owner read restaurant draft: %v", problem)
		}
		if _, problem = (&storefront.Service{Organization: multi}).Products(unverifiedCtx, unverified.ID, branchless.Organization.ID, "", "", 1); !errors.Is(problem, identity.ErrMFARequired) {
			t.Fatalf("unverified owner read restaurant catalog: %v", problem)
		}
		if _, problem = (&storefront.Service{Organization: multi}).SaveSettings(unverifiedCtx, unverified.ID, branchless.Organization.ID, storefront.SettingsInput{Name: "Unverified draft"}); !errors.Is(problem, identity.ErrMFARequired) {
			t.Fatalf("unverified owner changed restaurant draft: %v", problem)
		}
	})
	seedShop := func(state organization.Context, slug string) storefront.Settings {
		t.Helper()
		tx, _, problem := multi.Authorized(ctx, owner.ID, state.Organization.ID, "storefront.manage")
		if problem != nil {
			t.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var location, terminal string
		problem = tx.QueryRow(ctx, `INSERT INTO stock_locations(organization_id,branch_id,code,name,type,created_by,updated_by) VALUES($1,$2,'FRONT','Synthetic front stock','SALES_FLOOR',$3,$3) RETURNING id::text`, state.Organization.ID, state.Branches[0].ID, owner.ID).Scan(&location)
		if problem != nil {
			t.Fatal(problem)
		}
		problem = tx.QueryRow(ctx, `INSERT INTO pos_terminals(organization_id,branch_id,code,name,stock_location_id) VALUES($1,$2,'MAIN','Synthetic POS',$3) RETURNING id::text`, state.Organization.ID, state.Branches[0].ID, location).Scan(&terminal)
		if problem != nil {
			t.Fatal(problem)
		}
		if problem = tx.Commit(ctx); problem != nil {
			t.Fatal(problem)
		}
		settings, problem := (&storefront.Service{Organization: multi}).SaveSettings(ctx, owner.ID, state.Organization.ID, storefront.SettingsInput{Slug: slug, Name: "Synthetic " + slug, TerminalID: terminal, Published: true, AcceptingOrders: true})
		if problem != nil {
			t.Fatal(problem)
		}
		return settings
	}
	firstShop := seedShop(first, "first-fixture")
	secondShop := seedShop(second, "second-fixture")
	t.Run("returns reads require independent MFA", func(t *testing.T) {
		const password = "Synthetic-returns-staff-password-2026"
		staff, err := accounts.Register(ctx, "single-store-returns-staff@example.test", password, "Synthetic Returns staff")
		if err != nil {
			t.Fatal(err)
		}
		if result, err := accounts.VerifyEmail(ctx, mailbox.verificationTokens[staff.Email]); err != nil || !result.Verified || result.User.ID != staff.ID {
			t.Fatalf("verify synthetic Returns staff: %v", err)
		}
		staffSession := testsupport.EnrollMFA(t, ctx, auth, staff.Email, password)
		returnsReadMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, staffSession, first.Organization.ID, firstShop.BranchID)
	})
	t.Run("inventory readers require independent MFA", func(t *testing.T) {
		inventoryReadMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, first.Organization.ID, firstShop, secondShop)
	})
	t.Run("legacy storefront cannot become restaurant draft", func(testContext *testing.T) {
		_, problem := (&storefront.Service{Organization: multi}).SaveSettings(ctx, owner.ID, first.Organization.ID, storefront.SettingsInput{Name: firstShop.Name, Revision: firstShop.Revision})
		if !errors.Is(problem, storefront.ErrConflict) {
			testContext.Fatalf("legacy storefront converted to draft: %v", problem)
		}
		current, problem := (&storefront.Service{Organization: multi}).Settings(ctx, owner.ID, first.Organization.ID)
		if problem != nil || current == nil || !reflect.DeepEqual(*current, firstShop) {
			testContext.Fatalf("legacy storefront changed after rejected draft: %v", problem)
		}
	})
	single := &organization.Service{Pool: pool, Mailer: mailbox, SingleStoreOrganizationID: first.Organization.ID}
	shop := &storefront.Service{Organization: single}
	t.Run("directory food categories preserve public projection visibility and rollback", func(t *testing.T) {
		publicDirectory := &storefront.Service{Organization: multi}
		result, problem := publicDirectory.Directory(ctx)
		if problem != nil {
			t.Fatal(problem)
		}
		var entries []map[string]any
		if problem = json.Unmarshal(result, &entries); problem != nil || len(entries) != 2 {
			t.Fatalf("multi-store directory: %v", problem)
		}
		for _, entry := range entries {
			if len(entry) != 7 || (entry["business_type"] != nil || !reflect.DeepEqual(entry["category_codes"], []any{})) || entry["name"] == nil || entry["accepting_orders"] != true || (entry["slug"] != firstShop.Slug && entry["slug"] != "second-fixture") {
				t.Fatal("unexpected public directory projection")
			}
			if entry["average_rating"] != nil || entry["review_count"] != float64(0) || entry["delivery_enabled"] != false {
				t.Fatal("unexpected unrated storefront metadata")
			}
		}
		tx, _, problem := multi.Authorized(ctx, owner.ID, first.Organization.ID, "storefront.manage")
		if problem != nil {
			t.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		if _, problem = tx.Exec(ctx, "UPDATE storefronts SET category_codes=ARRAY['noodles','drinks'] WHERE organization_id=$1", first.Organization.ID); problem != nil {
			t.Fatal(problem)
		}
		if problem = tx.QueryRow(ctx, "SELECT storefront_directory()").Scan(&result); problem != nil {
			t.Fatal(problem)
		}
		if problem = json.Unmarshal(result, &entries); problem != nil || len(entries) != 2 || entries[0]["slug"] != firstShop.Slug || !reflect.DeepEqual(entries[0]["category_codes"], []any{"noodles", "drinks"}) || !reflect.DeepEqual(entries[1]["category_codes"], []any{}) {
			t.Fatalf("food category metadata or ordering: %v", problem)
		}
		for _, mutation := range []string{
			"UPDATE storefronts SET published=false,accepting_orders=false WHERE organization_id=$1",
			"UPDATE storefronts SET published=true,accepting_orders=true WHERE organization_id=$1;",
			"UPDATE organizations SET status='INACTIVE' WHERE id=$1",
		} {
			if _, problem = tx.Exec(ctx, mutation, first.Organization.ID); problem != nil {
				t.Fatal(problem)
			}
			if problem = tx.QueryRow(ctx, "SELECT storefront_directory()").Scan(&result); problem != nil {
				t.Fatal(problem)
			}
			if problem = json.Unmarshal(result, &entries); problem != nil {
				t.Fatal(problem)
			}
			if strings.Contains(mutation, "published=true") {
				if len(entries) != 2 || entries[0]["slug"] != firstShop.Slug || entries[0]["accepting_orders"] != true || entries[1]["slug"] != "second-fixture" {
					t.Fatal("republished store missing from directory")
				}
				continue
			}
			if len(entries) != 1 || entries[0]["slug"] != "second-fixture" {
				t.Fatalf("unpublished or inactive store exposed: %v", problem)
			}
		}
		if problem = tx.Rollback(ctx); problem != nil {
			t.Fatal(problem)
		}
		result, problem = shop.Directory(ctx)
		if problem != nil {
			t.Fatal(problem)
		}
		if problem = json.Unmarshal(result, &entries); problem != nil || len(entries) != 1 || !reflect.DeepEqual(entries[0]["category_codes"], []any{}) {
			t.Fatalf("directory fixture rollback failed: %v", problem)
		}
	})
	t.Run("real HTTP exposes mode and enforces scope auth csrf and creation denial", func(t *testing.T) {
		origin := "http://localhost:18088"
		logger := slog.New(slog.NewTextHandler(io.Discard, nil))
		server := httptest.NewServer(transport.RouterWithOptions(database.Checker{Pool: pool}, logger, transport.Options{SingleStoreOrganizationID: first.Organization.ID}, identity.Handler{Service: accounts, Origins: []string{origin}}))
		defer server.Close()
		loginBody, problem := json.Marshal(map[string]string{"email": owner.Email, "password": "Synthetic-owner-password-2026"})
		if problem != nil {
			t.Fatal(problem)
		}
		loginRequest, problem := http.NewRequestWithContext(ctx, http.MethodPost, server.URL+"/api/v1/auth/login", bytes.NewReader(loginBody))
		if problem != nil {
			t.Fatal(problem)
		}
		loginRequest.Header.Set("Content-Type", "application/json")
		loginRequest.Header.Set("Origin", origin)
		login, problem := server.Client().Do(loginRequest)
		if problem != nil {
			t.Fatal(problem)
		}
		defer login.Body.Close()
		if login.StatusCode != 200 {
			t.Fatalf("fixture login status: %d", login.StatusCode)
		}
		var session struct {
			Data struct {
				CSRF string `json:"csrf_token"`
			} `json:"data"`
		}
		if problem = json.NewDecoder(login.Body).Decode(&session); problem != nil || session.Data.CSRF == "" {
			t.Fatal("fixture session missing")
		}
		call := func(method, path string, body []byte, authenticated, csrf bool) *http.Response {
			t.Helper()
			request, requestErr := http.NewRequestWithContext(ctx, method, server.URL+"/api/v1"+path, bytes.NewReader(body))
			if requestErr != nil {
				t.Fatal(requestErr)
			}
			request.Header.Set("Origin", origin)
			if body != nil {
				request.Header.Set("Content-Type", "application/json")
			}
			if authenticated {
				for _, cookie := range login.Cookies() {
					request.AddCookie(cookie)
				}
			}
			if csrf {
				request.Header.Set("X-CSRF-Token", session.Data.CSRF)
			}
			request.Header.Set("Idempotency-Key", "11111111-1111-4111-8111-111111111111")
			response, requestErr := server.Client().Do(request)
			if requestErr != nil {
				t.Fatal(requestErr)
			}
			t.Cleanup(func() { response.Body.Close() })
			return response
		}
		for _, path := range []string{"/organizations", "/storefronts"} {
			response := call("GET", path, nil, true, false)
			wantStatus := http.StatusOK
			if path == "/organizations" {
				wantStatus = http.StatusForbidden
				var body struct {
					Data  any                   `json:"data"`
					Error struct{ Code string } `json:"error"`
				}
				if problem = json.NewDecoder(response.Body).Decode(&body); problem != nil || body.Error.Code != "MFA_REQUIRED" || body.Data != nil {
					t.Fatal("primary-only organization list must require MFA without private data")
				}
			}
			if response.StatusCode != wantStatus || response.Header.Get("X-SmartPOS-Store-Mode") != "single" {
				t.Fatalf("mode header on %s: %d", path, response.StatusCode)
			}
		}
		if response := call("GET", "/organizations/"+second.Organization.ID+"/context", nil, true, false); response.StatusCode != 404 {
			t.Fatalf("foreign owner context status: %d", response.StatusCode)
		}
		if response := call("GET", "/organizations/"+first.Organization.ID+"/context", nil, false, false); response.StatusCode != 401 {
			t.Fatalf("anonymous context status: %d", response.StatusCode)
		}
		creation, problem := json.Marshal(createInput("FIRST"))
		if problem != nil {
			t.Fatal(problem)
		}
		for _, csrf := range []bool{false, true} {
			if response := call("POST", "/organizations", creation, true, csrf); response.StatusCode != 403 {
				t.Fatalf("creation denial (csrf=%v): %d", csrf, response.StatusCode)
			}
		}
	})
	t.Run("lists only pinned membership and preserves default mode", func(t *testing.T) {
		all, problem := multi.List(ctx, owner.ID)
		if problem != nil || len(all) != 2 {
			t.Fatalf("default membership list: %v", problem)
		}
		allowed, problem := single.List(ctx, owner.ID)
		if problem != nil || len(allowed) != 1 || allowed[0].ID != first.Organization.ID {
			t.Fatalf("single membership list: %v", problem)
		}
		empty, problem := single.List(guestSession.Context, guest.ID)
		if problem != nil || len(empty) != 0 {
			t.Fatalf("nonmember received a store: %v", problem)
		}
	})
	t.Run("rejects foreign context even for its owner and denies creation retries", func(t *testing.T) {
		if _, problem := single.Context(ctx, owner.ID, second.Organization.ID); !errors.Is(problem, organization.ErrNotFound) {
			t.Fatalf("foreign context: %v", problem)
		}
		if _, problem := single.Create(ctx, owner.ID, "11111111-1111-4111-8111-111111111111", createInput("FIRST")); !errors.Is(problem, organization.ErrDenied) {
			t.Fatalf("creation replay: %v", problem)
		}
		if _, problem := single.Context(guestSession.Context, guest.ID, first.Organization.ID); !errors.Is(problem, organization.ErrNotFound) {
			t.Fatalf("membership required: %v", problem)
		}
	})
	t.Run("restaurant onboarding generated metadata and profile preservation", func(testContext *testing.T) {
		onboardingAcceptance(testContext, ctx, guestSession.Context, accounts, multi, single, owner.ID, guest.ID, second)
	})
	t.Run("public directory and slug reads cannot expose another store", func(t *testing.T) {
		result, problem := shop.Directory(ctx)
		if problem != nil {
			t.Fatal(problem)
		}
		var entries []map[string]any
		if problem = json.Unmarshal(result, &entries); problem != nil || len(entries) != 1 || entries[0]["slug"] != firstShop.Slug || len(entries[0]) != 7 || !reflect.DeepEqual(entries[0]["category_codes"], []any{}) || entries[0]["average_rating"] != nil || entries[0]["review_count"] != float64(0) {
			t.Fatalf("unsafe public directory: %v", problem)
		}
		if _, problem = shop.PublicSettings(ctx, "second-fixture"); !errors.Is(problem, storefront.ErrNotFound) {
			t.Fatalf("foreign public slug: %v", problem)
		}
		settings, problem := shop.PublicSettings(ctx, firstShop.Slug)
		if problem != nil || settings.TerminalID != "" || settings.BranchID != "" || settings.LocationID != "" {
			t.Fatalf("public internal IDs: %v", problem)
		}
	})
	for _, fixture := range []struct{ name, org, branch string }{
		{"foreign", second.Organization.ID, second.Branches[0].ID},
		{"pinned", first.Organization.ID, first.Branches[0].ID},
	} {
		t.Run("retired invitation preserves history and denies membership/"+fixture.name, func(t *testing.T) {
			token := "retained-invitation-" + fixture.org
			hash := sha256.Sum256([]byte(token))
			tx, _, problem := multi.Authorized(ctx, owner.ID, fixture.org, "storefront.manage")
			if problem != nil {
				t.Fatal(problem)
			}
			defer tx.Rollback(ctx)
			var invitation, before string
			problem = tx.QueryRow(ctx, `INSERT INTO organization_invitations(organization_id,email,role,branch_ids,token_hash,invited_by)
				VALUES($1,$2,'CASHIER',ARRAY[$3::uuid],$4,$5) RETURNING id::text`, fixture.org, guest.Email, fixture.branch, hash[:], owner.ID).Scan(&invitation)
			if problem != nil {
				t.Fatal(problem)
			}
			if problem = tx.QueryRow(ctx, "SELECT row_to_json(invitation)::text FROM organization_invitations invitation WHERE organization_id=$1 AND id=$2", fixture.org, invitation).Scan(&before); problem != nil {
				t.Fatal(problem)
			}
			var auditsBefore int
			if problem = tx.QueryRow(ctx, "SELECT count(*) FROM organization_audit_events WHERE organization_id=$1", fixture.org).Scan(&auditsBefore); problem != nil {
				t.Fatal(problem)
			}
			if problem = tx.Commit(ctx); problem != nil {
				t.Fatal(problem)
			}
			sentBefore := len(mailbox.tokens)
			for _, service := range []*organization.Service{multi, single} {
				if _, problem = service.Invite(ctx, owner.ID, fixture.org, organization.InviteInput{Email: guest.Email, Role: "CASHIER", BranchIDs: []string{fixture.branch}}); !errors.Is(problem, organization.ErrNotFound) {
					t.Fatalf("retired invitation creation: %v", problem)
				}
				if _, problem = service.Invitations(ctx, owner.ID, fixture.org); !errors.Is(problem, organization.ErrNotFound) {
					t.Fatalf("retired invitation listing: %v", problem)
				}
				if problem = service.RevokeInvitation(ctx, owner.ID, fixture.org, invitation); !errors.Is(problem, organization.ErrNotFound) {
					t.Fatalf("retired invitation revocation: %v", problem)
				}
				if _, problem = service.Accept(ctx, guest.Profile, token); !errors.Is(problem, organization.ErrNotFound) {
					t.Fatalf("retired invitation acceptance: %v", problem)
				}
			}
			if len(mailbox.tokens) != sentBefore {
				t.Fatal("retired invitation sent mail")
			}
			if _, problem = multi.Context(guestSession.Context, guest.ID, fixture.org); !errors.Is(problem, organization.ErrNotFound) {
				t.Fatalf("retired invitation granted context: %v", problem)
			}
			if _, problem = shop.Settings(guestSession.Context, guest.ID, fixture.org); !errors.Is(problem, storefront.ErrNotFound) {
				t.Fatalf("retired invitation granted management: %v", problem)
			}
			probe, _, problem := multi.Authorized(ctx, owner.ID, fixture.org, "storefront.manage")
			if problem != nil {
				t.Fatal(problem)
			}
			defer probe.Rollback(ctx)
			var after string
			var invitations, memberships, auditsAfter int
			problem = probe.QueryRow(ctx, `SELECT row_to_json(invitation)::text,
				(SELECT count(*) FROM organization_invitations WHERE organization_id=$1),
				(SELECT count(*) FROM organization_memberships WHERE organization_id=$1 AND user_id=$3),
				(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1)
				FROM organization_invitations invitation WHERE organization_id=$1 AND id=$2`, fixture.org, invitation, guest.ID).Scan(&after, &invitations, &memberships, &auditsAfter)
			if problem != nil || before != after || invitations != 1 || memberships != 0 || auditsAfter != auditsBefore {
				t.Fatalf("retired invitation changed retained data: invitations=%d memberships=%d audits=%d error=%v", invitations, memberships, auditsAfter-auditsBefore, problem)
			}
		})
	}
	t.Run("POS online mutations require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "dfb00000-0000-4000-8000-000000000001", createInput("POSONLINEMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		posOnlineMutationMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID, seedShop(state, "pos-online-mfa"))
	})
	t.Run("POS checkout mutations require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "dfa00000-0000-4000-8000-000000000001", createInput("POSCHECKMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		posCheckoutMutationMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID)
	})
	t.Run("POS cart mutations require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "df900000-0000-4000-8000-000000000001", createInput("POSCARTMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		posCartMutationMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID)
	})
	t.Run("POS register mutations require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "df800000-0000-4000-8000-000000000001", createInput("POSREGISTERMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		posRegisterMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID)
	})
	t.Run("remaining POS reads require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "df700000-0000-4000-8000-000000000001", createInput("POSOTHERREADMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		posOtherReadMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID)
	})
	t.Run("POS list reads require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "df600000-0000-4000-8000-000000000001", createInput("POSLISTMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		posListMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID)
	})
	t.Run("POS detail reads require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "df500000-0000-4000-8000-000000000001", createInput("POSREADMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		posReadMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID)
	})
	t.Run("POS customer selection requires independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "df400000-0000-4000-8000-000000000001", createInput("POSCUSTOMERMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		posCustomerMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID)
	})
	t.Run("customer mutations require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "df300000-0000-4000-8000-000000000001", createInput("CUSTWRITEMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		customerMutationMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID)
	})
	t.Run("customer reads require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "df200000-0000-4000-8000-000000000001", createInput("CUSTREADMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		customerReadMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID)
	})
	t.Run("catalog reads require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "df000000-0000-4000-8000-000000000001", createInput("CATREADMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		catalogReadMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID)
	})
	t.Run("catalog mutations require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "df100000-0000-4000-8000-000000000001", createInput("CATWRITEMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		catalogMutationMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID)
	})
	t.Run("storefront private reads require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "d2000000-0000-4000-8000-000000000002", createInput("PRIVATE"))
		if problem != nil {
			t.Fatal(problem)
		}
		empty, problem := multi.Create(ctx, owner.ID, "d2000000-0000-4000-8000-000000000003", createInput("EMPTY"))
		if problem != nil {
			t.Fatal(problem)
		}
		privateReadMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID, seedShop(state, "private-mfa-fixture"), secondShop.Slug, empty)
	})
	t.Run("storefront private catalog requires independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "d3000000-0000-4000-8000-000000000001", createInput("CATALOGMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		privateCatalogMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID, seedShop(state, "private-catalog-mfa"))
	})
	t.Run("storefront writes require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "d4000000-0000-4000-8000-000000000001", createInput("WRITEMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		privateWriteMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID, seedShop(state, "private-write-mfa"))
	})
	t.Run("storefront organization quote requires independent MFA", func(t *testing.T) {
		privateQuoteMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, first.Organization.ID)
	})
	t.Run("storefront order transitions require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "d6000000-0000-4000-8000-000000000001", createInput("TRANSITIONMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		privateTransitionMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID, seedShop(state, "private-transition-mfa"))
	})
	t.Run("storefront private payment review requires independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "d7000000-0000-4000-8000-000000000001", createInput("PAYMENTREVIEWMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		privatePaymentReviewMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID, seedShop(state, "private-payment-review-mfa"), first.Organization.ID)
	})
	t.Run("storefront fulfillment review writes require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "d8000000-0000-4000-8000-000000000001", createInput("FULFILLMENTREVIEWMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		privateFulfillmentReviewMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID, seedShop(state, "private-fulfillment-review-mfa"))
	})
	t.Run("storefront reconciliation preflight requires independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "d9000000-0000-4000-8000-000000000001", createInput("RECONCILIATIONPREFLIGHTMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		privateReconciliationPreflightMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID, seedShop(state, "private-reconciliation-preflight-mfa"))
	})
	t.Run("storefront reconciliation results require live MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "da000000-0000-4000-8000-000000000001", createInput("RECONCILIATIONRESULTMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		privateReconciliationMFAAcceptance(t, ctx, pool, multi, ownerSession, state.Organization.ID, seedShop(state, "private-reconciliation-result-mfa"))
	})
	t.Run("storefront refund preparation requires independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "db000000-0000-4000-8000-000000000001", createInput("REFUNDPREPARATIONMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		privateRefundPreparationMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID, seedShop(state, "private-refund-preparation-mfa"))
	})
	t.Run("storefront discovered refund preflight requires independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "dc000000-0000-4000-8000-000000000001", createInput("REFUNDPREFLIGHTMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		privateRefundPreflightMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID, seedShop(state, "private-refund-preflight-mfa"))
	})
	t.Run("storefront refund results require independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "dd000000-0000-4000-8000-000000000001", createInput("REFUNDRESULTMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		privateRefundResultMFAAcceptance(t, ctx, pool, multi, ownerSession, state.Organization.ID, seedShop(state, "private-refund-result-mfa"))
	})
	t.Run("storefront sandbox requires independent MFA", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "de000000-0000-4000-8000-000000000001", createInput("SANDBOXMFA"))
		if problem != nil {
			t.Fatal(problem)
		}
		sandboxMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID)
	})
	t.Run("durable customer payment persistence", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "f1111111-1111-4111-8111-111111111111", createInput("PAYMENT"))
		if problem != nil {
			t.Fatal(problem)
		}
		paymentPersistenceAcceptance(t, ctx, multi, owner.ID, state.Organization.ID, seedShop(state, "payment-fixture"), first.Organization.ID)
	})
	t.Run("customer payment stock hold lifecycle", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "9a111111-1111-4111-8111-111111111111", createInput("HOLDS"))
		if problem != nil {
			t.Fatal(problem)
		}
		paymentHoldAcceptance(t, ctx, multi, owner.ID, state.Organization.ID, seedShop(state, "payment-hold-fixture"), first.Organization.ID)
	})
	t.Run("customer checkout orchestration and retrieval recovery", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "8a111111-1111-4111-8111-111111111111", createInput("CHECKOUT"))
		if problem != nil {
			t.Fatal(problem)
		}
		paymentCheckoutAcceptance(t, ctx, multi, owner.ID, state.Organization.ID, seedShop(state, "checkout-fixture"), first.Organization.ID)
	})
	t.Run("customer prepaid POS settlement", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "7a111111-1111-4111-8111-111111111111", createInput("PREPAID"))
		if problem != nil {
			t.Fatal(problem)
		}
		paymentPrepaidAcceptance(t, ctx, guestSession.Context, multi, owner.ID, state.Organization.ID, seedShop(state, "prepaid-fixture"), first.Organization.ID, guest.ID)
	})
	t.Run("menu-only zero-stock sales", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "bf111111-1111-4111-8111-111111111111", createInput("MENU_ONLY"))
		if problem != nil {
			t.Fatal(problem)
		}
		menuOnlyAcceptance(t, ctx, multi, owner.ID, state.Organization.ID, seedShop(state, "menu-only-fixture"), first.Organization.ID, guest.ID, auth, ownerSession)
	})
	t.Run("staff customer payment reconciliation", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "6a111111-1111-4111-8111-111111111111", createInput("RECONCILE"))
		if problem != nil {
			t.Fatal(problem)
		}
		paymentReconciliationAcceptance(t, ctx, guestSession.Context, multi, owner.ID, state.Organization.ID, seedShop(state, "reconciliation-fixture"), first.Organization.ID, guest.ID)
	})
	t.Run("complete delivery flow", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "5a111111-1111-4111-8111-111111111111", createInput("DELIVERY"))
		if problem != nil {
			t.Fatal(problem)
		}
		deliveryAcceptance(t, ctx, guestSession.Context, multi, owner.ID, state.Organization.ID, seedShop(state, "delivery-fixture"), first.Organization.ID, guest.ID)
	})
	t.Run("atomic online reservation foundation", func(t *testing.T) {
		reservationAcceptance(t, ctx, multi, owner.ID, first.Organization.ID, firstShop, shop, second.Organization.ID, secondShop.Slug)
	})
	t.Run("recipe ingredient reservation and deduction", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "ae111111-1111-4111-8111-111111111111", createInput("INGREDIENT"))
		if problem != nil {
			t.Fatal(problem)
		}
		ingredientReservationAcceptance(t, ctx, guestSession.Context, multi, owner.ID, state.Organization.ID, seedShop(state, "ingredient-fixture"), first.Organization.ID, guest.ID)
	})
	t.Run("unpublished pinned store does not fall back to another store", func(t *testing.T) {
		_, problem := (&storefront.Service{Organization: multi}).SaveSettings(ctx, owner.ID, first.Organization.ID, storefront.SettingsInput{Slug: firstShop.Slug, Name: firstShop.Name, TerminalID: firstShop.TerminalID, Revision: firstShop.Revision})
		if problem != nil {
			t.Fatal(problem)
		}
		result, problem := shop.Directory(ctx)
		if problem != nil || string(result) != "[]" {
			t.Fatalf("unpublished store leaked a fallback: %v", problem)
		}
	})
	t.Run("separate front and back online stock sources", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "d1111111-1111-4111-8111-111111111111", createInput("SOURCE"))
		if problem != nil {
			t.Fatal(problem)
		}
		sourceAcceptance(t, ctx, multi, owner.ID, state.Organization.ID, seedShop(state, "source-fixture"), firstShop.TerminalID, guest.ID)
	})
	t.Run("public catalog layout query acceptance", func(t *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "e1111111-1111-4111-8111-111111111111", createInput("CATALOG"))
		if problem != nil {
			t.Fatal(problem)
		}
		catalogAcceptance(t, ctx, multi, owner.ID, state.Organization.ID, seedShop(state, "catalog-fixture"))
	})
	t.Run("durable restaurant queue numbers", func(testContext *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "9c111111-1111-4111-8111-111111111111", createInput("QUEUE"))
		if problem != nil {
			testContext.Fatal(problem)
		}
		restaurantQueueAcceptance(testContext, ctx, multi, owner.ID, state.Organization.ID, seedShop(state, "queue-fixture"), first.Organization.ID)
	})
	t.Run("recipe browse availability", func(testContext *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "ab444444-4444-4444-8444-444444444444", createInput("BROWSE_RECIPE"))
		if problem != nil {
			testContext.Fatal(problem)
		}
		catalogBrowseAcceptance(testContext, ctx, multi, owner.ID, state.Organization.ID, seedShop(state, "browse-recipe-fixture"), first.Organization.ID, guest.ID)
	})
	if os.Getenv("SMARTPOS_RESTAURANT_BROWSER") == "1" {
		t.Run("real restaurant browser lifecycle", func(testContext *testing.T) {
			state, problem := multi.Create(ctx, owner.ID, "ab555555-5555-4555-8555-555555555555", createInput("BROWSER_RECIPE"))
			if problem != nil {
				testContext.Fatal(problem)
			}
			restaurantBrowserAcceptance(testContext, ctx, multi, accounts, owner.ID, owner.Email, state.Organization.ID, seedShop(state, "browser-restaurant"))
		})
	}
	t.Run("restaurant queue schema isolation", func(testContext *testing.T) {
		state, problem := multi.Create(ctx, owner.ID, "9d111111-1111-4111-8111-111111111111", createInput("QUEUE_SCHEMA"))
		if problem != nil {
			testContext.Fatal(problem)
		}
		restaurantQueueSchemaAcceptance(testContext, ctx, multi, owner.ID, state.Organization.ID, seedShop(state, "queue-schema-fixture"), first.Organization.ID)
	})
	// This fixture adds a published store and a membership to the shared database.
	t.Run("inventory settings require independent MFA", func(t *testing.T) {
		state, err := multi.Create(ctx, owner.ID, "dfb10000-0000-4000-8000-000000000001", createInput("INVSETTINGMFA"))
		if err != nil {
			t.Fatal(err)
		}
		inventorySettingsMFAAcceptance(t, ctx, pool, auth, multi, ownerSession, guestSession, state.Organization.ID, seedShop(state, "inventory-settings-mfa"), secondShop)
	})
}
