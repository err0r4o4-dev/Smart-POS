package storefront_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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
	"smartpos/api/internal/testsupport"
)

func privateTransitionMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string, shop storefront.Settings) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User.ID
	service := &storefront.Service{Organization: organizations}
	variant := seedSourceProduct(t, ctx, organizations, user, org, shop.BranchID, shop.LocationID, shop.LocationID)
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	quote, err := service.Quote(context.Background(), shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		t.Fatal(err)
	}
	order, err := service.CreateOrder(context.Background(), shop.Slug, "d6000000-0000-4000-8000-000000000002", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Private transition buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("6", 64)})
	if err != nil {
		t.Fatal(err)
	}
	value, err := service.Transition(context.Background(), user, org, order.ID, storefront.TransitionInput{Revision: order.Revision, Status: "CANCELLED", Message: "Missing session must deny"})
	if !errors.Is(err, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() {
		t.Fatalf("unassured order transition returned data: %v", err)
	}
	foreign := identity.SessionFromContext(guest.Context).User.ID
	_, primaryToken, primaryCSRF, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	input := storefront.TransitionInput{Revision: order.Revision, Status: "PREPARING"}
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	for _, denial := range []struct {
		request context.Context
		actor   string
		want    error
	}{
		{primary, user, identity.ErrMFARequired}, {guest.Context, user, identity.ErrInvalidToken},
		{guest.Context, foreign, storefront.ErrNotFound},
	} {
		value, problem := service.Transition(denial.request, denial.actor, org, order.ID, input)
		if !errors.Is(problem, denial.want) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("private transition authentication/tenant denial: %v", problem)
		}
	}
	for _, status := range []string{"ACTIVE", "SUSPENDED"} {
		privateReadMembership(t, ctx, organizations, user, org, foreign, status)
		want := organization.ErrDenied
		if status == "SUSPENDED" {
			want = storefront.ErrNotFound
		}
		value, problem := service.Transition(guest.Context, foreign, org, order.ID, input)
		if !errors.Is(problem, want) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("private transition non-Owner denial: %v", problem)
		}
	}
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	if value, problem := service.Transition(owner.Context, user, org, order.ID, input); !errors.Is(problem, storefront.ErrConflict) || !reflect.ValueOf(value).IsZero() {
		t.Fatalf("unpaid transition returned data: %v", problem)
	}
	payReservationFixture(t, ctx, service, shop.Slug, strings.Repeat("6", 64), order)
	before := privateCatalogSnapshot(t, ctx, organizations, user, org)
	for _, table := range []string{"online_orders"} {
		for _, expired := range []bool{true, false} {
			verifyPrivateReadWait(t, ctx, pool, owner, table, expired, func(request context.Context) (any, error) {
				return service.Transition(request, user, org, order.ID, input)
			})
			if privateCatalogSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("interrupted transition retained effects at %s", table)
			}
		}
	}
	for _, stage := range []struct {
		prefix string
		count  int
	}{
		{"SELECT status,message,created_at FROM online_order_events", 1},
		{"INSERT INTO online_order_events", 1},
		{"SELECT status,message,created_at FROM online_order_events", 2},
	} {
		for _, expired := range []bool{true, false} {
			verifyPrivateTransitionStage(t, ctx, pool, owner, org, order.ID, input, stage.prefix, stage.count, expired)
			if privateCatalogSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatal("interrupted transition stage retained business or audit effects")
			}
		}
	}
	for _, expired := range []bool{true, false} {
		verifyPrivateWriteAuditWait(t, ctx, pool, owner, expired, func(traced *storefront.Service, request context.Context) (any, error) {
			return traced.Transition(request, user, org, order.ID, input)
		})
		if privateCatalogSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatal("post-write denial retained status, revision, event or audit effects")
		}
	}
	for _, candidate := range []struct {
		input storefront.TransitionInput
		want  error
	}{
		{storefront.TransitionInput{Revision: order.Revision + 1, Status: "PREPARING"}, storefront.ErrConflict},
		{storefront.TransitionInput{Revision: order.Revision, Status: "READY"}, storefront.ErrConflict},
		{storefront.TransitionInput{Revision: order.Revision, Status: "COMPLETED"}, storefront.ErrConflict},
		{storefront.TransitionInput{Revision: order.Revision, Status: "CANCELLED"}, storefront.ErrInput},
	} {
		value, problem := service.Transition(owner.Context, user, org, order.ID, candidate.input)
		if !errors.Is(problem, candidate.want) || !reflect.ValueOf(value).IsZero() || privateCatalogSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("invalid transition returned data or retained effects: %v", problem)
		}
	}
	pinned := &storefront.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
	if value, problem := pinned.Transition(owner.Context, user, org, order.ID, input); !errors.Is(problem, storefront.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
		t.Fatalf("transition crossed pinned organization: %v", problem)
	}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, storefront.Handler{Service: service}.TenantRoutes)
	requestHTTP := func(token, csrf string, input storefront.TransitionInput) *httptest.ResponseRecorder {
		t.Helper()
		encoded, problem := json.Marshal(input)
		if problem != nil {
			t.Fatal(problem)
		}
		request := httptest.NewRequest(http.MethodPost, "/organizations/"+org+"/online-orders/"+order.ID+"/status", bytes.NewReader(encoded)).WithContext(ctx)
		request.Header.Set("Origin", testsupport.MFAOrigin)
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("X-CSRF-Token", csrf)
		request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: token})
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}
	for _, session := range []struct {
		token, csrf, code string
		status            int
	}{{"", "", "UNAUTHENTICATED", 401}, {primaryToken, primaryCSRF, "MFA_REQUIRED", 403}} {
		response := requestHTTP(session.token, session.csrf, input)
		var body struct {
			Data  json.RawMessage
			Error struct{ Code string }
		}
		if problem := json.Unmarshal(response.Body.Bytes(), &body); problem != nil || response.Code != session.status || body.Error.Code != session.code || len(body.Data) != 0 || response.Header().Get("Cache-Control") != "no-store" || privateCatalogSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("transition HTTP status=%d code=%s error=%v", response.Code, body.Error.Code, problem)
		}
	}
	audits := privateWriteAudits(t, ctx, organizations, user, org)
	var workers sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			_, problem := service.Transition(owner.Context, user, org, order.ID, input)
			results <- problem
		}()
	}
	workers.Wait()
	close(results)
	successes, conflicts := 0, 0
	for problem := range results {
		if problem == nil {
			successes++
		} else if errors.Is(problem, storefront.ErrConflict) {
			conflicts++
		} else {
			t.Fatalf("competing transition: %v", problem)
		}
	}
	current, err := service.Order(owner.Context, user, org, order.ID)
	if err != nil || successes != 1 || conflicts != 1 || current.Status != "PREPARING" || current.Revision != order.Revision+1 || len(current.Events) != len(order.Events)+1 || privateWriteAudits(t, ctx, organizations, user, org) != audits+1 {
		t.Fatalf("competing transitions did not commit one status/event/audit: %v", err)
	}
	response := requestHTTP(owner.Token, owner.CSRF, storefront.TransitionInput{Revision: current.Revision, Status: "READY"})
	var body struct{ Data storefront.Order }
	if err = json.Unmarshal(response.Body.Bytes(), &body); err != nil || response.Code != 200 || response.Header().Get("Cache-Control") != "no-store" || body.Data.Status != "READY" || body.Data.Revision != current.Revision+1 || body.Data.EstimatedTotal != "10.00" || len(body.Data.Items) != 1 || body.Data.Items[0].Quantity != "1.000" || body.Data.Items[0].UnitPrice != "10.00" {
		t.Fatalf("assured READY transition HTTP status=%d error=%v", response.Code, err)
	}
}

func verifyPrivateTransitionStage(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner testsupport.MFASession, org, id string, input storefront.TransitionInput, prefix string, count int, expired bool) {
	t.Helper()
	trace := &privateReadTrace{prefix: prefix, remaining: count, arrived: make(chan struct{}), release: make(chan struct{})}
	configuration := pool.Config()
	configuration.ConnConfig.Tracer = trace
	tracedPool, err := pgxpool.NewWithConfig(ctx, configuration)
	if err != nil {
		t.Fatal(err)
	}
	defer tracedPool.Close()
	service := &storefront.Service{Organization: &organization.Service{Pool: tracedPool}}
	user, session := identity.SessionFromContext(owner.Context).User.ID, identity.SessionFromContext(owner.Context).ID
	var cutoff time.Time
	if expired {
		if err = pool.QueryRow(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at", session).Scan(&cutoff); err != nil {
			t.Fatal(err)
		}
		defer func() {
			if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", session); failure != nil {
				t.Error(failure)
			}
		}()
	}
	request, stop := context.WithCancel(owner.Context)
	defer stop()
	result := make(chan error, 1)
	go func() {
		value, failure := service.Transition(request, user, org, id, input)
		if !reflect.ValueOf(value).IsZero() {
			result <- errors.New("interrupted transition disclosed order data")
			return
		}
		result <- failure
	}()
	select {
	case <-trace.arrived:
	case <-time.After(5 * time.Second):
		stop()
		close(trace.release)
		<-result
		t.Fatal("transition did not reach expected query stage")
	}
	if expired {
		for {
			var elapsed bool
			if err = pool.QueryRow(ctx, "SELECT clock_timestamp()>=$1", cutoff).Scan(&elapsed); err != nil {
				stop()
				close(trace.release)
				<-result
				t.Fatal(err)
			}
			if elapsed {
				break
			}
			time.Sleep(10 * time.Millisecond)
		}
	} else {
		stop()
	}
	close(trace.release)
	err = <-result
	want := identity.ErrInvalidToken
	if !expired {
		want = context.Canceled
	}
	if !errors.Is(err, want) {
		t.Fatalf("interrupted transition stage: %v", err)
	}
}
