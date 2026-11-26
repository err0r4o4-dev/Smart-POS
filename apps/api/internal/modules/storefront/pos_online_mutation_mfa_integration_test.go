package storefront_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/stripe"
	"smartpos/api/internal/testsupport"
)

func posOnlineMutationMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string, shop storefront.Settings) {
	t.Helper()
	ctx = owner.Context
	user := identity.SessionFromContext(ctx).User.ID
	point := &pos.Service{Organization: organizations}
	variant := seedSourceProduct(t, ctx, organizations, user, org, shop.BranchID, shop.LocationID, shop.LocationID)
	write, _, err := organizations.Authorized(ctx, user, org, "catalog.update")
	if err != nil {
		t.Fatal(err)
	}
	defer write.Rollback(ctx)
	if _, err = write.Exec(ctx, "UPDATE product_variants SET selling_price=12.34 WHERE organization_id=$1 AND id=$2", org, variant); err != nil {
		t.Fatal(err)
	}
	if err = write.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	sequence := 0
	nextKey := func() string {
		sequence++
		return fmt.Sprintf("dfb00000-0000-4000-8000-%012x", sequence)
	}
	if _, err = point.OpenShift(ctx, user, org, nextKey(), pos.ShiftInput{TerminalID: shop.TerminalID, OpeningCash: "0.00"}); err != nil {
		t.Fatal(err)
	}
	gateway, err := stripe.NewSandbox("sk_test_synthetic", "http://localhost:8088")
	if err != nil {
		t.Fatal(err)
	}
	client, err := stripe.NewCustomerClient(gateway, persistenceSigningSecret, true)
	if err != nil {
		t.Fatal(err)
	}
	service := &storefront.Service{Organization: organizations, CustomerPayments: client}
	newOrder := func(paid bool) storefront.Order {
		t.Helper()
		items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
		quote, failure := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
		if failure != nil {
			t.Fatal(failure)
		}
		order, failure := service.CreateOrder(ctx, shop.Slug, nextKey(), storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic online MFA buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("b", 64)})
		if failure != nil {
			t.Fatal(failure)
		}
		if paid {
			attempt, problem := service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: order.ID, AccessToken: strings.Repeat("b", 64)})
			if problem != nil {
				t.Fatal(problem)
			}
			suffix := strings.ReplaceAll(order.ID, "-", "")
			body := paymentFixtureEvent(t, "evt_onlineMFA"+suffix, "checkout.session.completed", paymentFixtureSession(attempt, "cs_test_onlineMFA"+suffix, "complete", "paid"))
			now := time.Now()
			if _, problem = service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); problem != nil {
				t.Fatal(problem)
			}
			for _, status := range []string{"PREPARING", "READY"} {
				order, problem = service.Transition(ctx, user, org, order.ID, storefront.TransitionInput{Revision: order.Revision, Status: status})
				if problem != nil {
					t.Fatal(problem)
				}
			}
		} else {
			// Retained READY orders without provider payment use the legacy import path.
			tx, _, problem := organizations.Authorized(ctx, user, org, "online_orders.manage")
			if problem != nil {
				t.Fatal(problem)
			}
			defer tx.Rollback(ctx)
			for _, status := range []string{"PREPARING", "READY"} {
				if _, problem = tx.Exec(ctx, "UPDATE online_orders SET status=$3,revision=revision+1 WHERE organization_id=$1 AND id=$2", org, order.ID, status); problem != nil {
					t.Fatal(problem)
				}
			}
			if problem = tx.Commit(ctx); problem != nil {
				t.Fatal(problem)
			}
			order.Status, order.Revision = "READY", order.Revision+2
		}
		return order
	}
	_, primaryToken, primaryCSRF, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	type operation struct {
		name  string
		order storefront.Order
		run   func(context.Context, *pos.Service, string, string) (any, error)
	}
	operations := []operation{}
	for _, state := range []string{"fresh", "active replay", "held resume"} {
		order := newOrder(false)
		if state != "fresh" {
			cart, failure := point.ImportOnlineOrder(ctx, user, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision})
			if failure != nil {
				t.Fatal(failure)
			}
			if state == "held resume" {
				if _, failure = point.UpdateCart(ctx, user, org, cart.ID, "hold", pos.CartInput{Revision: cart.Revision}); failure != nil {
					t.Fatal(failure)
				}
			}
		}
		operations = append(operations, operation{"import " + state, order, func(request context.Context, service *pos.Service, actor, tenant string) (any, error) {
			return service.ImportOnlineOrder(request, actor, tenant, order.ID, pos.OnlineOrderInput{Revision: order.Revision})
		}})
	}
	for _, replay := range []bool{false, true} {
		order := newOrder(true)
		if replay {
			if _, failure := point.SettlePrepaidOnlineOrder(ctx, user, org, order.ID, pos.OnlineOrderInput{Revision: order.Revision}); failure != nil {
				t.Fatal(failure)
			}
		}
		operations = append(operations, operation{fmt.Sprintf("prepaid replay=%t", replay), order, func(request context.Context, service *pos.Service, actor, tenant string) (any, error) {
			return service.SettlePrepaidOnlineOrder(request, actor, tenant, order.ID, pos.OnlineOrderInput{Revision: order.Revision})
		}})
	}
	for _, action := range operations {
		for _, denial := range []struct {
			name string
			ctx  context.Context
			want error
		}{
			{"missing", context.Background(), identity.ErrInvalidToken},
			{"primary", primary, identity.ErrMFARequired},
			{"mismatched", guest.Context, identity.ErrInvalidToken},
		} {
			t.Run(action.name+" "+denial.name, func(t *testing.T) {
				before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
				value, failure := action.run(denial.ctx, point, user, org)
				if !errors.Is(failure, denial.want) || !reflect.ValueOf(value).IsZero() {
					t.Errorf("online mutation authority bypass: %v", failure)
				}
				if posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
					t.Error("denied online mutation retained state")
				}
			})
		}
	}
	for _, action := range operations {
		prefix, count := "SELECT id::text,number,estimated_total::text FROM online_orders", 1
		if strings.HasPrefix(action.name, "prepaid") {
			prefix = "SELECT pricing_snapshot FROM pos_checkouts"
			if action.name == "prepaid replay=false" {
				count = 2
			}
		}
		boundaries := []struct {
			prefix string
			count  int
		}{{prefix, count}, {"SELECT status,branch_id::text,terminal_id::text,stock_location_id::text,", 1}}
		for _, boundary := range boundaries {
			for _, cancel := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s projection %s cancel=%t", action.name, boundary.prefix, cancel), func(t *testing.T) {
					before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
					catalogReadInterrupted(t, ctx, pool, owner, boundary.prefix, boundary.count, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						return action.run(request, &pos.Service{Organization: traced.Organization}, user, org)
					}, true)
					if posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
						t.Fatal("interrupted online mutation retained business/payment/audit effects")
					}
				})
			}
		}
		t.Run(action.name+" aborted private projection", func(t *testing.T) {
			before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
			trace := &customerReadFailureTrace{prefix: prefix, remaining: count}
			configuration := pool.Config()
			configuration.ConnConfig.Tracer = trace
			traced, failure := pgxpool.NewWithConfig(ctx, configuration)
			if failure != nil {
				t.Fatal(failure)
			}
			defer traced.Close()
			value, failure := action.run(ctx, &pos.Service{Organization: &organization.Service{Pool: traced}}, user, org)
			if failure == nil || trace.failure == nil || !reflect.ValueOf(value).IsZero() || posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("aborted online projection exposed data or effects: %v", failure)
			}
		})
		for _, expiry := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s actual order lock expiry=%t", action.name, expiry), func(t *testing.T) {
				before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
				verifyPrivateReadWait(t, ctx, pool, owner, "online_orders", expiry, func(request context.Context) (any, error) { return action.run(request, point, user, org) })
				if posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("blocked online mutation retained state")
				}
			})
		}
		writes := []string{}
		switch action.name {
		case "import fresh":
			writes = []string{"INSERT INTO pos_carts(", "INSERT INTO pos_cart_items(", "UPDATE online_orders SET cart_id=", "UPDATE pos_carts SET pricing_revision=", "INSERT INTO online_order_events", "INSERT INTO organization_audit_events"}
		case "import held resume":
			writes = []string{"UPDATE pos_carts SET status='ACTIVE'", "INSERT INTO organization_audit_events"}
		case "prepaid replay=false":
			writes = []string{"INSERT INTO pos_carts(", "INSERT INTO pos_cart_items(", "UPDATE online_orders SET cart_id=", "INSERT INTO pos_checkouts(", "INSERT INTO sales(", "INSERT INTO sale_items(", "INSERT INTO sale_payments(", "INSERT INTO receipts(", "UPDATE pos_carts SET status='COMPLETED'", "UPDATE pos_checkouts SET status='COMPLETED'", "UPDATE online_orders SET status='COMPLETED'", "INSERT INTO online_order_events", "INSERT INTO organization_audit_events"}
		}
		for _, boundary := range writes {
			for _, cancel := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s after %s cancel=%t", action.name, boundary, cancel), func(t *testing.T) {
					before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
					catalogReadInterrupted(t, ctx, pool, owner, boundary, 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						return action.run(request, &pos.Service{Organization: traced.Organization}, user, org)
					}, true)
					if posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
						t.Fatal("interrupted online posting/audit retained state")
					}
				})
			}
		}
	}
	other, err := organizations.Create(ctx, user, nextKey(), organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Other online tenant", Code: "OTHERONLINEMFA", BusinessType: "RETAIL"}, Branch: organization.BranchInput{Name: "Main", Code: "MAIN", Status: "ACTIVE"}})
	if err != nil {
		t.Fatal(err)
	}
	foreign := identity.SessionFromContext(guest.Context).User.ID
	for _, action := range operations {
		for _, status := range []string{"", "ACTIVE", "SUSPENDED"} {
			t.Run(action.name+" membership "+status, func(t *testing.T) {
				privateReadMembership(t, ctx, organizations, user, org, foreign, status)
				want := pos.ErrNotFound
				if status == "ACTIVE" {
					want = organization.ErrDenied
				}
				before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
				value, failure := action.run(guest.Context, point, foreign, org)
				if !errors.Is(failure, want) || !reflect.ValueOf(value).IsZero() || posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatalf("online membership boundary: %v", failure)
				}
			})
		}
		privateReadMembership(t, ctx, organizations, user, org, foreign, "")
		t.Run(action.name+" foreign document", func(t *testing.T) {
			before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
			otherBefore := posCheckoutMutationSnapshot(t, ctx, organizations, user, other.Organization.ID)
			value, failure := action.run(ctx, point, user, other.Organization.ID)
			if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() || posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before || posCheckoutMutationSnapshot(t, ctx, organizations, user, other.Organization.ID) != otherBefore {
				t.Fatalf("online tenant boundary: %v", failure)
			}
		})
		t.Run(action.name+" pinned deployment", func(t *testing.T) {
			value, failure := action.run(ctx, &pos.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: other.Organization.ID}}, user, org)
			if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("online deployment boundary: %v", failure)
			}
		})
	}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, pos.Handler{Service: point}.TenantRoutes)
	for _, action := range operations {
		path := "/online-orders/" + action.order.ID + "/pos-cart"
		if strings.HasPrefix(action.name, "prepaid") {
			path = "/online-orders/" + action.order.ID + "/settle-prepaid"
		}
		for _, candidate := range []struct {
			name, token, csrf, origin, code string
			status                          int
		}{
			{"missing", "", "", testsupport.MFAOrigin, "UNAUTHENTICATED", 401},
			{"primary", primaryToken, primaryCSRF, testsupport.MFAOrigin, "MFA_REQUIRED", 403},
			{"foreign", guest.Token, guest.CSRF, testsupport.MFAOrigin, "NOT_FOUND", 404},
			{"CSRF", owner.Token, "", testsupport.MFAOrigin, "INVALID_CSRF", 403},
			{"Origin", owner.Token, owner.CSRF, "https://untrusted.example.test", "INVALID_ORIGIN", 403},
		} {
			t.Run(action.name+" HTTP "+candidate.name, func(t *testing.T) {
				before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
				body, _ := json.Marshal(pos.OnlineOrderInput{Revision: action.order.Revision})
				request := httptest.NewRequest(http.MethodPost, "/organizations/"+org+path, strings.NewReader(string(body))).WithContext(ctx)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("Origin", candidate.origin)
				request.Header.Set("X-CSRF-Token", candidate.csrf)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: candidate.token})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				if response.Code != candidate.status || response.Header().Get("Cache-Control") != "no-store" || !strings.Contains(response.Body.String(), candidate.code) || strings.Contains(response.Body.String(), `"data"`) || posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatalf("online HTTP boundary: status=%d want=%d", response.Code, candidate.status)
				}
			})
		}
	}
	for _, action := range operations {
		t.Run(action.name+" concurrent exact result and replay", func(t *testing.T) {
			type outcome struct {
				value   any
				failure error
			}
			results := make(chan outcome, 2)
			for range 2 {
				go func() {
					value, failure := action.run(ctx, point, user, org)
					results <- outcome{value, failure}
				}()
			}
			left, right := <-results, <-results
			if left.failure != nil || right.failure != nil || !reflect.DeepEqual(left.value, right.value) {
				t.Fatalf("concurrent online replay: %v/%v", left.failure, right.failure)
			}
			switch value := left.value.(type) {
			case pos.Cart:
				if value.Status != "ACTIVE" || value.Total != "12.34" || value.OnlineOrder == nil || value.OnlineOrder.ID != action.order.ID || len(value.Items) != 1 || value.Items[0].Quantity != "1.000" {
					t.Fatal("online cart exact result changed")
				}
			case pos.Checkout:
				if value.Status != "COMPLETED" || value.Method != "ONLINE_STRIPE" || value.Total != "12.34" || value.Received != "12.34" || value.Change != "0.00" || value.SaleID == "" || len(value.Items) != 1 {
					t.Fatal("online prepaid exact result changed")
				}
			}
		})
	}
	for _, action := range operations {
		if action.name != "import fresh" && action.name != "prepaid replay=false" {
			continue
		}
		t.Run(action.name+" assured HTTP replay", func(t *testing.T) {
			path := "/pos-cart"
			if strings.HasPrefix(action.name, "prepaid") {
				path = "/settle-prepaid"
			}
			before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
			body, err := json.Marshal(pos.OnlineOrderInput{Revision: action.order.Revision})
			if err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodPost, "/organizations/"+org+"/online-orders/"+action.order.ID+path, strings.NewReader(string(body))).WithContext(ctx)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Origin", testsupport.MFAOrigin)
			request.Header.Set("X-CSRF-Token", owner.CSRF)
			request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			var result struct {
				Data struct{ ID, Status, Total string }
			}
			expectedStatus := "ACTIVE"
			if path == "/settle-prepaid" {
				expectedStatus = "COMPLETED"
			}
			if err = json.Unmarshal(response.Body.Bytes(), &result); err != nil || response.Code != 200 || result.Data.ID == "" || result.Data.Status != expectedStatus || result.Data.Total != "12.34" || response.Header().Get("Cache-Control") != "no-store" || posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("assured replay: status=%d state=%s total=%s err=%v", response.Code, result.Data.Status, result.Data.Total, err)
			}
		})
	}
}
