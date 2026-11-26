package storefront_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/testsupport"
)

type privateReadTrace struct {
	prefix    string
	remaining int
	arrived   chan struct{}
	release   chan struct{}
}

func (trace *privateReadTrace) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	if strings.HasPrefix(data.SQL, trace.prefix) {
		trace.remaining--
		if trace.remaining == 0 {
			close(trace.arrived)
			select {
			case <-trace.release:
			case <-ctx.Done():
			}
		}
	}
	return ctx
}

func (*privateReadTrace) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func privateReadMembership(t *testing.T, ctx context.Context, organizations *organization.Service, user, org, foreign, status string) {
	t.Helper()
	tx, _, err := organizations.Authorized(ctx, user, org, "storefront.manage")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if status == "" {
		status = "REMOVED"
	}
	_, err = tx.Exec(ctx, `INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'MANAGER',$3) ON CONFLICT(organization_id,user_id) DO UPDATE SET status=excluded.status`, org, foreign, status)
	if err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
}

func privateReadSnapshot(t *testing.T, ctx context.Context, organizations *organization.Service, user, org string) string {
	t.Helper()
	tx, _, err := organizations.Authorized(ctx, user, org, "storefront.manage")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var result strings.Builder
	for _, table := range []string{"organization_memberships", "branches", "organization_audit_events", "storefronts", "storefront_products", "online_orders", "online_order_items", "online_order_events", "online_payment_attempts", "online_payment_reconciliations", "online_refund_intents", "inventory_operations", "stock_movements", "sales"} {
		var digest string
		if err = tx.QueryRow(ctx, "SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM "+table+" t WHERE organization_id=$1", org).Scan(&digest); err != nil {
			t.Fatal(err)
		}
		result.WriteString(digest)
	}
	return result.String()
}

func verifyPrivateReadWait(t *testing.T, ctx context.Context, pool *pgxpool.Pool, assured testsupport.MFASession, table string, expired bool, run func(context.Context) (any, error)) {
	t.Helper()
	session := identity.SessionFromContext(assured.Context).ID
	var cutoff time.Time
	if err := pool.QueryRow(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at", session).Scan(&cutoff); err != nil {
		t.Fatal(err)
	}
	if !expired {
		cutoff = time.Now()
		if _, err := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", session); err != nil {
			t.Fatal(err)
		}
	}
	defer func() {
		if _, err := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", session); err != nil {
			t.Fatal(err)
		}
	}()
	blocker, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer blocker.Rollback(ctx)
	switch table {
	case "users", "storefronts", "online_orders", "online_order_events", "pos_terminals", "pos_carts", "pos_checkouts", "register_shifts", "sales", "receipts", "stock_locations", "categories", "brands", "units", "products", "product_barcodes", "product_import_jobs", "customers", "customer_groups":
	default:
		t.Fatal("unrecognized private-read lock target")
	}
	if _, err = blocker.Exec(ctx, "LOCK TABLE "+table+" IN ACCESS EXCLUSIVE MODE"); err != nil {
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
		value, failure := run(request)
		if !reflect.ValueOf(value).IsZero() {
			result <- errors.New("interrupted private read returned partial data")
			return
		}
		result <- failure
	}()
	deadline := time.Now().Add(5 * time.Second)
	for {
		var blocked, elapsed bool
		if err = pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))),clock_timestamp()>=$2", pid, cutoff).Scan(&blocked, &elapsed); err != nil {
			t.Fatal(err)
		}
		if blocked && elapsed {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("private query did not reach lock/time rendezvous")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !expired {
		cancel()
	}
	if err = blocker.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	failure := <-result
	if expired && !errors.Is(failure, identity.ErrInvalidToken) || !expired && !errors.Is(failure, context.Canceled) {
		t.Fatalf("private read interrupted outcome: %v", failure)
	}
}

func privateReadMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string, shop storefront.Settings, otherSlug string, empty organization.Context) {
	t.Helper()
	service := &storefront.Service{Organization: organizations}
	user := identity.SessionFromContext(owner.Context).User.ID
	foreign := identity.SessionFromContext(guest.Context).User.ID
	variant := seedSourceProduct(t, ctx, organizations, user, org, shop.BranchID, shop.LocationID, shop.LocationID)
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	quote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		t.Fatal(err)
	}
	input := storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic private buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("7", 64)}
	order, err := service.CreateOrder(ctx, shop.Slug, "d2000000-0000-4000-8000-000000000001", input)
	if err != nil {
		t.Fatal(err)
	}
	secondInput := input
	secondInput.AccessToken = strings.Repeat("8", 64)
	second, err := service.CreateOrder(ctx, shop.Slug, "d2000000-0000-4000-8000-000000000004", secondInput)
	if err != nil {
		t.Fatal(err)
	}
	_, primaryToken, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	missing, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, storefront.Handler{Service: service}.TenantRoutes)
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	privateReadMembership(t, ctx, organizations, user, empty.Organization.ID, foreign, "")
	operations := []struct {
		name, org, path, table string
		run                    func(context.Context, string) (any, error)
	}{
		{"settings", org, "storefront", "storefronts", func(request context.Context, actor string) (any, error) { return service.Settings(request, actor, org) }},
		{"absent settings", empty.Organization.ID, "storefront", "storefronts", func(request context.Context, actor string) (any, error) {
			return service.Settings(request, actor, empty.Organization.ID)
		}},
		{"order", org, "online-orders/" + order.ID, "online_orders", func(request context.Context, actor string) (any, error) {
			return service.Order(request, actor, org, order.ID)
		}},
		{"orders", org, "online-orders?branch_id=" + shop.BranchID, "online_orders", func(request context.Context, actor string) (any, error) {
			return service.Orders(request, actor, org, shop.BranchID, "", 1)
		}},
		{"empty orders", empty.Organization.ID, "online-orders?branch_id=" + empty.Branches[0].ID, "online_orders", func(request context.Context, actor string) (any, error) {
			return service.Orders(request, actor, empty.Organization.ID, empty.Branches[0].ID, "", 1)
		}},
	}
	for _, operation := range operations {
		t.Run(operation.name, func(t *testing.T) {
			before := privateReadSnapshot(t, ctx, organizations, user, operation.org)
			for _, denial := range []struct {
				request context.Context
				actor   string
				want    error
			}{{missing, user, identity.ErrInvalidToken}, {primary, user, identity.ErrMFARequired}, {guest.Context, foreign, storefront.ErrNotFound}, {guest.Context, user, identity.ErrInvalidToken}} {
				value, failure := operation.run(denial.request, denial.actor)
				if !errors.Is(failure, denial.want) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("private storefront read disclosed data or wrong denial: %v", failure)
				}
			}
			for _, status := range []string{"ACTIVE", "SUSPENDED"} {
				privateReadMembership(t, ctx, organizations, user, operation.org, foreign, status)
				want := organization.ErrDenied
				if status == "SUSPENDED" {
					want = storefront.ErrNotFound
				}
				value, failure := operation.run(guest.Context, foreign)
				if !errors.Is(failure, want) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("non-Owner private read: %v", failure)
				}
			}
			privateReadMembership(t, ctx, organizations, user, operation.org, foreign, "")
			for _, session := range []struct {
				token, code string
				status      int
			}{{"", "UNAUTHENTICATED", 401}, {primaryToken, "MFA_REQUIRED", 403}, {owner.Token, "", 200}} {
				request := httptest.NewRequest(http.MethodGet, "/organizations/"+operation.org+"/"+operation.path, nil).WithContext(ctx)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: session.token})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				var result struct {
					Data  json.RawMessage
					Error struct{ Code string }
				}
				if err = json.Unmarshal(response.Body.Bytes(), &result); err != nil || response.Code != session.status || result.Error.Code != session.code || (session.status != 200 && len(result.Data) != 0) || response.Header().Get("Cache-Control") != "no-store" {
					t.Fatalf("private storefront HTTP status=%d code=%s want=%d/%s error=%v", response.Code, result.Error.Code, session.status, session.code, err)
				}
			}
			for _, expired := range []bool{true, false} {
				verifyPrivateReadWait(t, ctx, pool, owner, operation.table, expired, func(request context.Context) (any, error) { return operation.run(request, user) })
			}
			if privateReadSnapshot(t, ctx, organizations, user, operation.org) != before {
				t.Fatal("private reads changed protected business rows")
			}
		})
	}
	for _, candidate := range []struct {
		name, prefix string
		count        int
		cancel       bool
	}{
		{"expiry before ID query", "SELECT id::text FROM online_orders", 1, false},
		{"expiry after first private detail", "SELECT doc.id::text,doc.number", 2, false},
		{"cancel after first private detail", "SELECT doc.id::text,doc.number", 2, true},
	} {
		t.Run(candidate.name, func(t *testing.T) {
			before := privateReadSnapshot(t, ctx, organizations, user, org)
			trace := &privateReadTrace{prefix: candidate.prefix, remaining: candidate.count, arrived: make(chan struct{}), release: make(chan struct{})}
			configuration := pool.Config()
			configuration.ConnConfig.Tracer = trace
			tracedPool, failure := pgxpool.NewWithConfig(ctx, configuration)
			if failure != nil {
				t.Fatal(failure)
			}
			defer tracedPool.Close()
			traced := &storefront.Service{Organization: &organization.Service{Pool: tracedPool}}
			session := identity.SessionFromContext(owner.Context).ID
			var cutoff time.Time
			if !candidate.cancel {
				if failure = pool.QueryRow(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at", session).Scan(&cutoff); failure != nil {
					t.Fatal(failure)
				}
			}
			request, stop := context.WithCancel(owner.Context)
			defer stop()
			result := make(chan error, 1)
			go func() {
				value, problem := traced.Orders(request, user, org, shop.BranchID, "", 1)
				if !reflect.ValueOf(value).IsZero() {
					result <- errors.New("later interrupted read returned earlier private details")
					return
				}
				result <- problem
			}()
			select {
			case <-trace.arrived:
			case <-time.After(5 * time.Second):
				stop()
				close(trace.release)
				<-result
				t.Fatal("private read trace boundary not reached")
			}
			if candidate.cancel {
				stop()
			} else {
				for {
					var elapsed bool
					if failure = pool.QueryRow(ctx, "SELECT clock_timestamp()>=$1", cutoff).Scan(&elapsed); failure != nil {
						stop()
						close(trace.release)
						<-result
						t.Fatal(failure)
					}
					if elapsed {
						break
					}
					time.Sleep(10 * time.Millisecond)
				}
			}
			close(trace.release)
			failure = <-result
			if _, err = pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", session); err != nil {
				t.Fatal(err)
			}
			want := identity.ErrInvalidToken
			if candidate.cancel {
				want = context.Canceled
			}
			if !errors.Is(failure, want) || privateReadSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("later private read boundary: %v", failure)
			}
		})
	}
	if value, failure := service.Order(ctx, user, empty.Organization.ID, order.ID); !errors.Is(failure, storefront.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
		t.Fatalf("foreign order disclosed private data: %v", failure)
	}
	pinned := &storefront.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: empty.Organization.ID}}
	for _, run := range []func() (any, error){
		func() (any, error) { return pinned.Settings(ctx, user, org) },
		func() (any, error) { return pinned.Order(ctx, user, org, order.ID) },
		func() (any, error) { return pinned.Orders(ctx, user, org, shop.BranchID, "", 1) },
	} {
		value, failure := run()
		if !errors.Is(failure, storefront.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("pinned private read crossed organization: %v", failure)
		}
	}
	for _, filter := range []struct {
		status             string
		page, total, count int
	}{{"PENDING", 1, 2, 2}, {"READY", 1, 0, 0}, {"", 2, 2, 0}} {
		value, failure := service.Orders(ctx, user, org, shop.BranchID, filter.status, filter.page)
		if failure != nil || value.Page != filter.page || value.PageSize != 20 || value.Total != filter.total || len(value.Items) != filter.count {
			t.Fatalf("private order pagination/filter changed: %v", failure)
		}
	}
	current, failure := service.Order(ctx, user, org, order.ID)
	if failure != nil || current.CustomerName != input.CustomerName || current.ContactPhone != input.ContactPhone || len(current.Items) != 1 {
		t.Fatalf("authorized private order projection changed: %v", failure)
	}
	write, _, failure := organizations.Authorized(ctx, user, org, "storefront.manage")
	if failure != nil {
		t.Fatal(failure)
	}
	_, failure = write.Exec(ctx, "UPDATE branches SET status='INACTIVE' WHERE organization_id=$1 AND id=$2", org, shop.BranchID)
	if failure == nil {
		failure = write.Commit(ctx)
	}
	write.Rollback(ctx)
	if failure != nil {
		t.Fatal(failure)
	}
	for _, run := range []func() (any, error){
		func() (any, error) { return service.Settings(ctx, user, org) },
		func() (any, error) { return service.Order(ctx, user, org, order.ID) },
		func() (any, error) { return service.Orders(ctx, user, org, shop.BranchID, "", 1) },
	} {
		if _, failure = run(); failure != nil {
			t.Fatalf("inactive branch historical read changed: %v", failure)
		}
	}
	write, _, failure = organizations.Authorized(ctx, user, org, "storefront.manage")
	if failure != nil {
		t.Fatal(failure)
	}
	_, failure = write.Exec(ctx, "UPDATE branches SET status='ACTIVE' WHERE organization_id=$1 AND id=$2", org, shop.BranchID)
	if failure == nil {
		failure = write.Commit(ctx)
	}
	write.Rollback(ctx)
	if failure != nil {
		t.Fatal(failure)
	}
	public, failure := service.Track(missing, shop.Slug, storefront.TrackingInput{OrderID: order.ID, AccessToken: input.AccessToken})
	if failure != nil || public.CustomerName != "" || public.ContactPhone != "" || public.DeliveryAddress != "" || public.BranchID != "" {
		t.Fatalf("public tracking required employee MFA or disclosed private data: %v", failure)
	}
	if _, failure = service.PublicSettings(missing, shop.Slug); failure != nil {
		t.Fatalf("public settings required employee MFA: %v", failure)
	}
	t.Run("guest order proof is bound to the exact order and shop", func(t *testing.T) {
		// Unpublishing a storefront must still respect its live-order guard.
		for _, fixture := range []storefront.Order{order, second} {
			cancelled, err := service.Transition(ctx, user, org, fixture.ID, storefront.TransitionInput{
				Revision: fixture.Revision, Status: "CANCELLED", Message: "Synthetic tracking fixture",
			})
			if err != nil || cancelled.Status != "CANCELLED" {
				t.Fatalf("cancel guest tracking fixture: %v", err)
			}
		}
		hidden, err := service.SaveSettings(ctx, user, org, storefront.SettingsInput{
			Slug: shop.Slug, Name: shop.Name, Description: shop.Description,
			ContactPhone: shop.ContactPhone, PickupInstructions: shop.PickupInstructions,
			TerminalID: shop.TerminalID, OnlineTerminalID: shop.OnlineTerminalID,
			Revision: shop.Revision,
		})
		if err != nil || hidden.Published || hidden.AcceptingOrders {
			t.Fatalf("unpublish guest tracking fixture: %v", err)
		}
		if _, err = service.PublicSettings(missing, shop.Slug); !errors.Is(err, storefront.ErrNotFound) {
			t.Fatalf("unpublished storefront still resolves publicly: %v", err)
		}
		before := privateReadSnapshot(t, ctx, organizations, user, org)
		publicRouter := chi.NewRouter()
		storefront.Handler{Service: service, Authentication: auth}.PublicRoutes(publicRouter)
		for _, candidate := range []struct {
			name, slug, orderID, proof string
			status                     int
		}{
			{"matching proof", shop.Slug, order.ID, input.AccessToken, http.StatusOK},
			{"matching second proof", shop.Slug, second.ID, secondInput.AccessToken, http.StatusOK},
			{"missing proof", shop.Slug, order.ID, "", http.StatusNotFound},
			{"different order", shop.Slug, second.ID, input.AccessToken, http.StatusNotFound},
			{"different shop", otherSlug, order.ID, input.AccessToken, http.StatusNotFound},
		} {
			t.Run(candidate.name, func(t *testing.T) {
				payload, err := json.Marshal(storefront.TrackingInput{OrderID: candidate.orderID, AccessToken: candidate.proof})
				if err != nil {
					t.Fatal(err)
				}
				request := httptest.NewRequest(http.MethodPost, "/storefronts/"+candidate.slug+"/track", strings.NewReader(string(payload))).WithContext(ctx)
				request.Header.Set("Origin", testsupport.MFAOrigin)
				request.Header.Set("Content-Type", "application/json")
				response := httptest.NewRecorder()
				publicRouter.ServeHTTP(response, request)
				if response.Header().Get("Cache-Control") != "no-store" {
					t.Fatal("guest tracking response must not be stored")
				}
				var body struct {
					Data  *storefront.Order
					Error struct{ Code string }
				}
				if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || response.Code != candidate.status {
					t.Fatalf("tracking status = %d, want %d (decode: %v)", response.Code, candidate.status, err)
				}
				if candidate.status == http.StatusNotFound {
					if body.Data != nil || body.Error.Code != "NOT_FOUND" {
						t.Fatal("proof denial returned order data or a different error")
					}
					return
				}
				value := body.Data
				if value == nil || value.ID != candidate.orderID || value.Status != "CANCELLED" || len(value.Items) != 1 || value.CustomerName != "" || value.ContactPhone != "" || value.CustomerNote != "" || value.DeliveryAddress != "" || value.BranchID != "" || value.TerminalID != "" || value.CartID != nil || value.SaleID != nil {
					t.Fatal("matching proof did not return the redacted order projection")
				}
			})
		}
		if privateReadSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatal("guest tracking changed protected business rows")
		}
	})
}
