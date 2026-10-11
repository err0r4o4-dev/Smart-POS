package storefront_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/database"
	"smartpos/api/internal/transport"
)

type singleStoreMailbox struct{ tokens map[string]string }

func (mailbox *singleStoreMailbox) SendReset(context.Context, string, string) error { return nil }
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
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
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
	mailbox := &singleStoreMailbox{tokens: map[string]string{}}
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
	seedShop(second, "second-fixture")
	single := &organization.Service{Pool: pool, Mailer: mailbox, SingleStoreOrganizationID: first.Organization.ID}
	shop := &storefront.Service{Organization: single}
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
			if response.StatusCode != 200 || response.Header.Get("X-SmartPOS-Store-Mode") != "single" {
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
		empty, problem := single.List(ctx, guest.ID)
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
		if _, problem := single.Context(ctx, guest.ID, first.Organization.ID); !errors.Is(problem, organization.ErrNotFound) {
			t.Fatalf("membership required: %v", problem)
		}
	})
	t.Run("public directory and slug reads cannot expose another store", func(t *testing.T) {
		result, problem := shop.Directory(ctx)
		if problem != nil {
			t.Fatal(problem)
		}
		var entries []map[string]any
		if problem = json.Unmarshal(result, &entries); problem != nil || len(entries) != 1 || entries[0]["slug"] != firstShop.Slug || len(entries[0]) != 3 {
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
	t.Run("foreign invitation remains pending and grants no membership", func(t *testing.T) {
		_, problem := multi.Invite(ctx, owner.ID, second.Organization.ID, organization.InviteInput{Email: guest.Email, Role: "CASHIER", BranchIDs: []string{second.Branches[0].ID}})
		if problem != nil {
			t.Fatal(problem)
		}
		if _, problem = single.Accept(ctx, guest, mailbox.tokens[guest.Email]); !errors.Is(problem, organization.ErrNotFound) {
			t.Fatalf("foreign invitation accepted: %v", problem)
		}
		invitations, problem := multi.Invitations(ctx, owner.ID, second.Organization.ID)
		if problem != nil || len(invitations) != 1 || invitations[0].Status != "PENDING" {
			t.Fatalf("foreign invitation mutated: %v", problem)
		}
		if _, problem = multi.Context(ctx, guest.ID, second.Organization.ID); !errors.Is(problem, organization.ErrNotFound) {
			t.Fatalf("foreign membership created: %v", problem)
		}
	})
	t.Run("pinned invitation preserves role and branch permissions", func(t *testing.T) {
		_, problem := single.Invite(ctx, owner.ID, first.Organization.ID, organization.InviteInput{Email: guest.Email, Role: "CASHIER", BranchIDs: []string{first.Branches[0].ID}})
		if problem != nil {
			t.Fatal(problem)
		}
		joined, problem := single.Accept(ctx, guest, mailbox.tokens[guest.Email])
		if problem != nil || joined.Membership.Role != "CASHIER" || len(joined.Branches) != 1 || joined.Branches[0].ID != first.Branches[0].ID {
			t.Fatalf("pinned invitation: %v", problem)
		}
		if _, problem = shop.Settings(ctx, guest.ID, first.Organization.ID); !errors.Is(problem, organization.ErrDenied) {
			t.Fatalf("staff received management authority: %v", problem)
		}
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
}
