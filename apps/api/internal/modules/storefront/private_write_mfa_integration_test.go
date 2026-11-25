package storefront_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/testsupport"
)

func privateWriteMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string, shop storefront.Settings) {
	t.Helper()
	service := &storefront.Service{Organization: organizations}
	user := identity.SessionFromContext(owner.Context).User.ID
	foreign := identity.SessionFromContext(guest.Context).User.ID
	variant := seedSourceProduct(t, ctx, organizations, user, org, shop.BranchID, shop.LocationID, shop.LocationID)
	drafts := []string{}
	setup := &restaurant.Service{Organization: organizations}
	for index, key := range []string{"d4000000-0000-4000-8000-000000000002", "d4000000-0000-4000-8000-000000000003"} {
		draft, err := organizations.CreateRestaurant(ctx, user, key, organization.OrganizationInput{Name: "Private write draft", BusinessType: "RESTAURANT"})
		if err != nil {
			t.Fatal(err)
		}
		if _, err = setup.SaveProfile(ctx, user, draft.Organization.ID, key, restaurant.SetupProfileInput{Name: "Private write draft", BusinessType: "RESTAURANT"}); err != nil {
			t.Fatal(err)
		}
		if index == 1 {
			if _, err = service.SaveSettings(ctx, user, draft.Organization.ID, storefront.SettingsInput{Name: "Private write draft", ShippingFee: "0.00"}); err != nil {
				t.Fatal(err)
			}
		}
		drafts = append(drafts, draft.Organization.ID)
	}
	_, primaryToken, primaryCSRF, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, storefront.Handler{Service: service}.TenantRoutes)
	for _, target := range append([]string{org}, drafts...) {
		privateReadMembership(t, ctx, organizations, user, target, foreign, "")
	}
	for _, operation := range []struct {
		name, target string
		publish      bool
	}{
		{"publication", org, true}, {"legacy settings", org, false}, {"draft create", drafts[0], false}, {"draft update", drafts[1], false},
	} {
		t.Run(operation.name, func(t *testing.T) {
			current, err := service.Settings(owner.Context, user, operation.target)
			if err != nil {
				t.Fatal(err)
			}
			input := storefront.SettingsInput{Name: "Changed private write draft", ShippingFee: "12.35", DeliveryEnabled: true}
			if current != nil {
				input.Revision, input.Slug, input.TerminalID, input.OnlineTerminalID = current.Revision, current.Slug, current.TerminalID, current.OnlineTerminalID
				input.Published, input.AcceptingOrders = current.Published, current.AcceptingOrders
			}
			publication := storefront.PublishInput{}
			if operation.publish {
				publication.Revision = current.Revision
			}
			run := func(request context.Context, actor string) (any, error) {
				if operation.publish {
					return service.Publish(request, actor, operation.target, variant, publication)
				}
				return service.SaveSettings(request, actor, operation.target, input)
			}
			before := privateCatalogSnapshot(t, ctx, organizations, user, operation.target)
			for _, denial := range []struct {
				request context.Context
				actor   string
				want    error
			}{
				{context.Background(), user, identity.ErrInvalidToken}, {primary, user, identity.ErrMFARequired},
				{guest.Context, user, identity.ErrInvalidToken}, {guest.Context, foreign, storefront.ErrNotFound},
			} {
				value, failure := run(denial.request, denial.actor)
				if !errors.Is(failure, denial.want) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("unassured storefront write: %v", failure)
				}
			}
			for _, status := range []string{"ACTIVE", "SUSPENDED"} {
				privateReadMembership(t, ctx, organizations, user, operation.target, foreign, status)
				want := organization.ErrDenied
				if status == "SUSPENDED" {
					want = storefront.ErrNotFound
				}
				value, failure := run(guest.Context, foreign)
				if !errors.Is(failure, want) || !reflect.ValueOf(value).IsZero() {
					t.Fatalf("non-Owner storefront write: %v", failure)
				}
			}
			privateReadMembership(t, ctx, organizations, user, operation.target, foreign, "")
			payload, path := any(input), "/organizations/"+operation.target+"/storefront"
			if operation.publish {
				payload, path = publication, path+"/products/"+variant
			}
			encoded, err := json.Marshal(payload)
			if err != nil {
				t.Fatal(err)
			}
			for _, session := range []struct {
				token, csrf, code string
				status            int
			}{{"", "", "UNAUTHENTICATED", 401}, {primaryToken, primaryCSRF, "MFA_REQUIRED", 403}} {
				request := httptest.NewRequest(http.MethodPut, path, bytes.NewReader(encoded)).WithContext(ctx)
				request.Header.Set("Origin", testsupport.MFAOrigin)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("X-CSRF-Token", session.csrf)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: session.token})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				var body struct {
					Data  json.RawMessage
					Error struct{ Code string }
				}
				if failure := json.Unmarshal(response.Body.Bytes(), &body); failure != nil || response.Code != session.status || body.Error.Code != session.code || len(body.Data) != 0 || response.Header().Get("Cache-Control") != "no-store" {
					t.Fatalf("storefront write HTTP status=%d code=%s error=%v", response.Code, body.Error.Code, failure)
				}
			}
			locks := []string{"storefronts"}
			if operation.name == "legacy settings" {
				locks = append(locks, "pos_terminals", "stock_locations")
			}
			for _, table := range locks {
				for _, expired := range []bool{true, false} {
					verifyPrivateReadWait(t, ctx, pool, owner, table, expired, func(request context.Context) (any, error) { return run(request, user) })
					if privateCatalogSnapshot(t, ctx, organizations, user, operation.target) != before {
						t.Fatalf("storefront write did not roll back all business/audit effects at %s", table)
					}
				}
			}
			for _, expired := range []bool{true, false} {
				verifyPrivateWriteAuditWait(t, ctx, pool, owner, expired, func(traced *storefront.Service, request context.Context) (any, error) {
					if operation.publish {
						return traced.Publish(request, user, operation.target, variant, publication)
					}
					return traced.SaveSettings(request, user, operation.target, input)
				})
				if privateCatalogSnapshot(t, ctx, organizations, user, operation.target) != before {
					t.Fatal("write denied before audit retained earlier business effects")
				}
			}
			pinned := &storefront.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
			var denied any
			var failure error
			if operation.publish {
				denied, failure = pinned.Publish(owner.Context, user, operation.target, variant, publication)
			} else {
				denied, failure = pinned.SaveSettings(owner.Context, user, operation.target, input)
			}
			if !errors.Is(failure, storefront.ErrNotFound) || !reflect.ValueOf(denied).IsZero() {
				t.Fatalf("pinned storefront write crossed organization: %v", failure)
			}
			audits := privateWriteAudits(t, ctx, organizations, user, operation.target)
			var requests sync.WaitGroup
			results := make(chan error, 2)
			for i := 0; i < 2; i++ {
				requests.Add(1)
				go func() { defer requests.Done(); _, problem := run(owner.Context, user); results <- problem }()
			}
			requests.Wait()
			close(results)
			successes, conflicts := 0, 0
			for problem := range results {
				if problem == nil {
					successes++
				} else if errors.Is(problem, storefront.ErrConflict) {
					conflicts++
				} else {
					t.Fatalf("concurrent storefront write: %v", problem)
				}
			}
			if successes != 1 || conflicts != 1 || privateWriteAudits(t, ctx, organizations, user, operation.target) != audits+1 {
				t.Fatal("concurrent writes did not produce one revision/audit and one conflict")
			}
			after, failure := service.Settings(owner.Context, user, operation.target)
			if failure != nil || after == nil || after.Revision != input.Revision+1 {
				t.Fatalf("storefront revision changed: %v", failure)
			}
			if !operation.publish && (after.Name != input.Name || after.ShippingFee != "12.35" || !after.DeliveryEnabled) {
				t.Fatal("storefront settings/exact shipping fee changed")
			}
			if operation.publish {
				products, problem := service.Products(owner.Context, user, operation.target, "", "", 1)
				if problem != nil || len(products.Items) != 1 || products.Items[0].Published || products.Items[0].UnitPrice != "10.00" {
					t.Fatalf("publication flags or exact price changed: %v", problem)
				}
			}
			input.Revision, publication.Revision = after.Revision, after.Revision
			payload = input
			if operation.publish {
				payload = publication
			}
			encoded, err = json.Marshal(payload)
			if err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodPut, path, bytes.NewReader(encoded)).WithContext(ctx)
			request.Header.Set("Origin", testsupport.MFAOrigin)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("X-CSRF-Token", owner.CSRF)
			request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != 200 || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("assured storefront write HTTP status=%d", response.Code)
			}
		})
	}
	write, _, err := organizations.Authorized(ctx, user, org, "storefront.manage")
	if err != nil {
		t.Fatal(err)
	}
	_, err = write.Exec(ctx, "UPDATE product_variants SET status='INACTIVE' WHERE organization_id=$1 AND id=$2", org, variant)
	if err == nil {
		err = write.Commit(ctx)
	}
	write.Rollback(ctx)
	if err != nil {
		t.Fatal(err)
	}
	current, err := service.Settings(owner.Context, user, org)
	if err != nil {
		t.Fatal(err)
	}
	before := privateCatalogSnapshot(t, ctx, organizations, user, org)
	value, err := service.Publish(owner.Context, user, org, variant, storefront.PublishInput{Revision: current.Revision, Published: true})
	if !errors.Is(err, storefront.ErrConflict) || !reflect.ValueOf(value).IsZero() || privateCatalogSnapshot(t, ctx, organizations, user, org) != before {
		t.Fatalf("unsaleable product publication changed data: %v", err)
	}
}

func verifyPrivateWriteAuditWait(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner testsupport.MFASession, expired bool, run func(*storefront.Service, context.Context) (any, error)) {
	t.Helper()
	trace := &privateReadTrace{prefix: "INSERT INTO organization_audit_events", remaining: 1, arrived: make(chan struct{}), release: make(chan struct{})}
	configuration := pool.Config()
	configuration.ConnConfig.Tracer = trace
	tracedPool, err := pgxpool.NewWithConfig(ctx, configuration)
	if err != nil {
		t.Fatal(err)
	}
	defer tracedPool.Close()
	service := &storefront.Service{Organization: &organization.Service{Pool: tracedPool}}
	session := identity.SessionFromContext(owner.Context).ID
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
		value, failure := run(service, request)
		if !reflect.ValueOf(value).IsZero() {
			result <- errors.New("interrupted write disclosed a result")
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
		t.Fatal("storefront write did not reach post-write audit boundary")
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
		t.Fatalf("post-write audit interruption: %v", err)
	}
}

func privateWriteAudits(t *testing.T, ctx context.Context, organizations *organization.Service, user, org string) int {
	t.Helper()
	tx, _, err := organizations.Authorized(ctx, user, org, "storefront.manage")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var count int
	if err = tx.QueryRow(ctx, "SELECT count(*) FROM organization_audit_events WHERE organization_id=$1", org).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}
