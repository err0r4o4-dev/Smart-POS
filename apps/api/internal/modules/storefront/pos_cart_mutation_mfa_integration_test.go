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

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/customers"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/testsupport"
)

func posCartMutationMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string) {
	t.Helper()
	ctx = owner.Context
	user := identity.SessionFromContext(ctx).User.ID
	point := &pos.Service{Organization: organizations}
	seed := seedPOSCustomerCart(t, ctx, organizations, point, user, org)
	_, token, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, token)
	catalogService := &catalog.Service{Organization: organizations}
	unit, err := catalogService.SaveTaxonomy(ctx, user, org, "units", "", catalog.TaxonomyInput{Name: "Cart weight", Code: "CARTWEIGHT", UnitType: "WEIGHT", Status: "ACTIVE"})
	if err != nil {
		t.Fatal(err)
	}
	product, err := catalogService.CreateProduct(ctx, user, org, catalog.CreateInput{ProductInput: catalog.ProductInput{Name: "Cart item", Status: "ACTIVE"}, Variants: []catalog.VariantInput{{SKU: "CARTITEM", Name: "Cart variant", UnitID: unit.ID, CostPrice: "1.00", SellingPrice: "10.00", Status: "ACTIVE"}}})
	if err != nil {
		t.Fatal(err)
	}
	items := []pos.ItemInput{{VariantID: product.Variants[0].ID, Quantity: "1.125"}}
	sequence := 0
	nextKey := func() string {
		sequence++
		return fmt.Sprintf("df900000-0000-4000-8000-%012x", sequence)
	}
	operations := []struct {
		name string
		run  func(context.Context, *pos.Service) (pos.Cart, error)
	}{
		{"create", func(request context.Context, service *pos.Service) (pos.Cart, error) {
			return service.CreateCart(request, user, org, nextKey(), pos.CartInput{TerminalID: seed.TerminalID})
		}},
		{"create replay", func(request context.Context, service *pos.Service) (pos.Cart, error) {
			return service.CreateCart(request, user, org, "df400000-0000-4000-8000-000000000004", pos.CartInput{TerminalID: seed.TerminalID})
		}},
	}
	for _, action := range []string{"update", "hold", "resume", "cancel"} {
		cart, failure := point.CreateCart(ctx, user, org, nextKey(), pos.CartInput{TerminalID: seed.TerminalID})
		if failure != nil {
			t.Fatal(failure)
		}
		if action == "resume" {
			cart, failure = point.UpdateCart(ctx, user, org, cart.ID, "hold", pos.CartInput{Revision: cart.Revision})
			if failure != nil {
				t.Fatal(failure)
			}
		}
		operations = append(operations, struct {
			name string
			run  func(context.Context, *pos.Service) (pos.Cart, error)
		}{action, func(request context.Context, service *pos.Service) (pos.Cart, error) {
			value, failure := service.UpdateCart(request, user, org, cart.ID, action, pos.CartInput{Revision: cart.Revision, Items: items})
			if failure == nil {
				cart = value
			}
			return value, failure
		}})
	}
	before := posCustomerSnapshot(t, ctx, organizations, user, org)
	for _, operation := range operations {
		for _, denial := range []struct {
			name string
			ctx  context.Context
			want error
		}{
			{"missing", context.Background(), identity.ErrInvalidToken},
			{"primary", primary, identity.ErrMFARequired},
			{"mismatched", guest.Context, identity.ErrInvalidToken},
		} {
			t.Run(operation.name+" "+denial.name, func(t *testing.T) {
				value, failure := operation.run(denial.ctx, point)
				if !errors.Is(failure, denial.want) || !reflect.ValueOf(value).IsZero() {
					t.Errorf("cart lifecycle authority bypass: %v", failure)
				}
			})
		}
	}
	if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
		t.Error("denied cart lifecycle changed business/audit state")
	}
	for _, operation := range operations {
		t.Run(operation.name+" expires after result", func(t *testing.T) {
			before := posCustomerSnapshot(t, ctx, organizations, user, org)
			catalogReadInterrupted(t, ctx, pool, owner, "SELECT id::text,number,estimated_total::text FROM online_orders", 1, false, func(request context.Context, traced *catalog.Service) (any, error) {
				return operation.run(request, &pos.Service{Organization: traced.Organization})
			}, true)
			if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
				t.Error("expired cart result retained business/audit state")
			}
		})
		t.Run(operation.name+" cancel after result", func(t *testing.T) {
			before := posCustomerSnapshot(t, ctx, organizations, user, org)
			catalogReadInterrupted(t, ctx, pool, owner, "SELECT id::text,number,estimated_total::text FROM online_orders", 1, true, func(request context.Context, traced *catalog.Service) (any, error) {
				return operation.run(request, &pos.Service{Organization: traced.Organization})
			}, true)
			if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatal("canceled cart result retained state")
			}
		})
		for _, expiry := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s actual cart lock expiry=%t", operation.name, expiry), func(t *testing.T) {
				before := posCustomerSnapshot(t, ctx, organizations, user, org)
				verifyPrivateReadWait(t, ctx, pool, owner, "pos_carts", expiry, func(request context.Context) (any, error) { return operation.run(request, point) })
				if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("blocked cart retained state")
				}
			})
		}
		t.Run(operation.name+" aborted result", func(t *testing.T) {
			before := posCustomerSnapshot(t, ctx, organizations, user, org)
			trace := &customerReadFailureTrace{prefix: "SELECT id::text,number,estimated_total::text FROM online_orders", remaining: 1}
			configuration := pool.Config()
			configuration.ConnConfig.Tracer = trace
			traced, failure := pgxpool.NewWithConfig(ctx, configuration)
			if failure != nil {
				t.Fatal(failure)
			}
			defer traced.Close()
			value, failure := operation.run(ctx, &pos.Service{Organization: &organization.Service{Pool: traced}})
			if failure == nil || trace.failure == nil || !reflect.ValueOf(value).IsZero() || posCustomerSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("aborted cart result: %v", failure)
			}
		})
		if operation.name == "create replay" {
			continue
		}
		write := "UPDATE pos_carts SET status="
		if operation.name == "create" {
			write = "INSERT INTO pos_carts("
		}
		boundaries := []string{write, "INSERT INTO organization_audit_events"}
		if operation.name == "update" {
			boundaries = append(boundaries, "DELETE FROM pos_cart_items", "INSERT INTO pos_cart_items(", "UPDATE pos_carts SET pricing_revision=")
		}
		for _, boundary := range boundaries {
			for _, cancel := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s after %s cancel=%t", operation.name, boundary, cancel), func(t *testing.T) {
					before := posCustomerSnapshot(t, ctx, organizations, user, org)
					catalogReadInterrupted(t, ctx, pool, owner, boundary, 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						return operation.run(request, &pos.Service{Organization: traced.Organization})
					}, true)
					if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
						t.Fatal("interrupted cart write/audit retained state")
					}
				})
			}
		}
	}
	posCartMutationScopes(t, ctx, pool, organizations, point, owner, guest, org, seed)
	posCartMutationHTTP(t, ctx, auth, organizations, point, owner, guest, org, seed.TerminalID, nextKey)
	for _, operation := range operations {
		t.Run(operation.name+" assured result", func(t *testing.T) {
			value, failure := operation.run(ctx, point)
			if failure != nil || value.ID == "" || value.Items == nil {
				t.Fatalf("assured cart lifecycle: %v", failure)
			}
			if operation.name == "update" && (value.Total != "11.25" || len(value.Items) != 1 || value.Items[0].Quantity != "1.125" || value.Items[0].UnitPrice != "10.00" || value.StoredPricingRevision != value.Pricing.Revision) {
				t.Fatal("cart exact quantities/pricing changed")
			}
		})
	}
	posCartMutationDomain(t, ctx, pool, organizations, point, owner, org, seed.TerminalID, items, nextKey)
}

func posCartMutationDomain(t *testing.T, ctx context.Context, pool *pgxpool.Pool, organizations *organization.Service, point *pos.Service, owner testsupport.MFASession, org, terminal string, items []pos.ItemInput, nextKey func() string) {
	t.Helper()
	user := identity.SessionFromContext(ctx).User.ID
	create := func() pos.Cart {
		t.Helper()
		value, err := point.CreateCart(ctx, user, org, nextKey(), pos.CartInput{TerminalID: terminal})
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	t.Run("create concurrent replay and conflict", func(t *testing.T) {
		key := nextKey()
		type outcome struct {
			cart pos.Cart
			err  error
		}
		results := make(chan outcome, 2)
		for range 2 {
			go func() {
				cart, err := point.CreateCart(ctx, user, org, key, pos.CartInput{TerminalID: terminal})
				results <- outcome{cart, err}
			}()
		}
		left, right := <-results, <-results
		if left.err != nil || right.err != nil || !reflect.DeepEqual(left.cart, right.cart) {
			t.Fatalf("concurrent create replay: %v/%v", left.err, right.err)
		}
		before := posCustomerSnapshot(t, ctx, organizations, user, org)
		value, failure := point.CreateCart(ctx, user, org, key, pos.CartInput{TerminalID: "df900000-0000-4000-8000-000000002001"})
		if !errors.Is(failure, pos.ErrConflict) || !reflect.ValueOf(value).IsZero() || posCustomerSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("changed cart create replay: %v", failure)
		}
		for _, expiry := range []bool{false, true} {
			verifyPrivateReadWait(t, ctx, pool, owner, "pos_carts", expiry, func(request context.Context) (any, error) {
				return point.CreateCart(request, user, org, key, pos.CartInput{TerminalID: "df900000-0000-4000-8000-000000002001"})
			})
		}
		if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatal("interrupted create conflict retained state")
		}
		tx, _, failure := organizations.Authorized(ctx, user, org, "pos.cart.manage")
		if failure != nil {
			t.Fatal(failure)
		}
		defer tx.Rollback(ctx)
		var carts, audits int
		failure = tx.QueryRow(ctx, "SELECT (SELECT count(*) FROM pos_carts WHERE organization_id=$1 AND create_key=$2),(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='pos.cart.created' AND object_id=$3)", org, key, left.cart.ID).Scan(&carts, &audits)
		if failure != nil || carts != 1 || audits != 1 {
			t.Fatalf("create replay atomicity carts=%d audits=%d: %v", carts, audits, failure)
		}
	})
	t.Run("cart revision race", func(t *testing.T) {
		cart := create()
		results := make(chan error, 2)
		for range 2 {
			go func() {
				value, failure := point.UpdateCart(ctx, user, org, cart.ID, "hold", pos.CartInput{Revision: cart.Revision})
				if failure != nil && !reflect.ValueOf(value).IsZero() {
					failure = errors.New("stale mutation exposed cart")
				}
				results <- failure
			}()
		}
		first, second := <-results, <-results
		if !(first == nil && errors.Is(second, pos.ErrConflict) || second == nil && errors.Is(first, pos.ErrConflict)) {
			t.Fatalf("cart revision race: %v/%v", first, second)
		}
		current, failure := point.Cart(ctx, user, org, cart.ID)
		if failure != nil || current.Status != "HELD" || current.Revision != cart.Revision+1 {
			t.Fatalf("cart race projection: %v", failure)
		}
	})
	t.Run("archived customer resume is atomic", func(t *testing.T) {
		cart := create()
		customerService := &customers.Service{Organization: organizations}
		customer, failure := customerService.Save(ctx, user, org, "", nextKey(), customers.Input{Code: "CARTRESUME", Name: "Resume customer"})
		if failure != nil {
			t.Fatal(failure)
		}
		cart, failure = point.SelectCustomer(ctx, user, org, cart.ID, pos.CustomerInput{Revision: cart.Revision, CustomerID: &customer.ID})
		if failure != nil {
			t.Fatal(failure)
		}
		cart, failure = point.UpdateCart(ctx, user, org, cart.ID, "hold", pos.CartInput{Revision: cart.Revision})
		if failure != nil {
			t.Fatal(failure)
		}
		if _, failure = customerService.Archive(ctx, user, org, customer.ID, customer.Revision, false); failure != nil {
			t.Fatal(failure)
		}
		for _, cancel := range []bool{false, true} {
			before := posCustomerSnapshot(t, ctx, organizations, user, org)
			catalogReadInterrupted(t, ctx, pool, owner, "INSERT INTO organization_audit_events", 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
				return (&pos.Service{Organization: traced.Organization}).UpdateCart(request, user, org, cart.ID, "resume", pos.CartInput{Revision: cart.Revision})
			}, true)
			if posCustomerSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatal("interrupted customer clearing retained state/audit")
			}
		}
		value, failure := point.UpdateCart(ctx, user, org, cart.ID, "resume", pos.CartInput{Revision: cart.Revision})
		if failure != nil || value.Status != "ACTIVE" || !value.CustomerCleared || value.CustomerID != nil || value.Customer != nil || value.Revision != cart.Revision+1 {
			t.Fatalf("archived customer resume: %v", failure)
		}
	})
	t.Run("cart validation and pending funds", func(t *testing.T) {
		cart := create()
		for _, input := range []pos.CartInput{
			{Revision: cart.Revision - 1},
			{Revision: cart.Revision, Items: append(append([]pos.ItemInput{}, items...), items...)},
			{Revision: cart.Revision, Items: []pos.ItemInput{{VariantID: items[0].VariantID, Quantity: "0.000"}}},
			{Revision: cart.Revision, Items: []pos.ItemInput{{VariantID: items[0].VariantID, Quantity: "1.125", BatchVerified: true}}},
		} {
			before := posCustomerSnapshot(t, ctx, organizations, user, org)
			value, failure := point.UpdateCart(ctx, user, org, cart.ID, "update", input)
			if failure == nil || !reflect.ValueOf(value).IsZero() || posCustomerSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("invalid cart retained state: %v", failure)
			}
		}
		cart, failure := point.UpdateCart(ctx, user, org, cart.ID, "update", pos.CartInput{Revision: cart.Revision, Items: items})
		if failure != nil {
			t.Fatal(failure)
		}
		checkout, failure := point.PrepareCheckout(ctx, user, org, nextKey(), pos.CheckoutInput{CartID: cart.ID, Revision: cart.Revision, Method: "CASH", ExpectedTotal: cart.Total, Received: cart.Total, PricingRevision: cart.Pricing.Revision})
		if failure != nil {
			t.Fatal(failure)
		}
		before := posCustomerSnapshot(t, ctx, organizations, user, org)
		for _, action := range []string{"update", "hold", "resume", "cancel"} {
			value, failure := point.UpdateCart(ctx, user, org, cart.ID, action, pos.CartInput{Revision: cart.Revision, Items: items})
			if !errors.Is(failure, pos.ErrPending) || !reflect.ValueOf(value).IsZero() || posCustomerSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("pending funds cart changed: %v", failure)
			}
		}
		checkout, failure = point.ConfirmPayment(ctx, user, org, checkout.ID, nextKey(), pos.ConfirmationInput{Acknowledged: true})
		if failure != nil {
			t.Fatal(failure)
		}
		checkout, failure = point.CompleteCheckout(ctx, user, org, checkout.ID)
		if failure != nil || checkout.Status != "COMPLETED" || checkout.Total != "11.25" {
			t.Fatalf("exact cart checkout compatibility: %v", failure)
		}
	})
	t.Run("online cart cancellation rolls back link and event", func(t *testing.T) {
		cart := create()
		cart, failure := point.UpdateCart(ctx, user, org, cart.ID, "update", pos.CartInput{Revision: cart.Revision, Items: items})
		if failure != nil {
			t.Fatal(failure)
		}
		tx, _, failure := organizations.Authorized(ctx, user, org, "online_orders.manage")
		if failure != nil {
			t.Fatal(failure)
		}
		defer tx.Rollback(ctx)
		_, failure = tx.Exec(ctx, "INSERT INTO storefronts(organization_id,slug,name,terminal_id) VALUES($1,'cart-mfa-online','Cart MFA online',$2)", org, terminal)
		if failure != nil {
			t.Fatal(failure)
		}
		order := nextKey()
		_, failure = tx.Exec(ctx, `INSERT INTO online_orders(id,organization_id,branch_id,terminal_id,stock_location_id,status,customer_name,contact_phone,store_name,estimated_total,access_hash,request_fingerprint,cart_id,stock_policy)
			SELECT $3,$1,branch_id,id,stock_location_id,'READY','Synthetic online buyer','0800000000','Cart MFA online',11.25,repeat('0',64),repeat('1',64),$4,'MENU_ONLY'
			FROM pos_terminals WHERE organization_id=$1 AND id=$2`, org, terminal, order, cart.ID)
		if failure != nil {
			t.Fatal(failure)
		}
		_, failure = tx.Exec(ctx, `INSERT INTO online_order_items(organization_id,order_id,variant_id,product_name,variant_name,sku,unit,quantity,unit_price,line_total) VALUES($1,$2,$3,'Cart item','Cart variant','CARTITEM','Cart weight',1.125,10.00,11.25)`, org, order, items[0].VariantID)
		if failure != nil {
			t.Fatal(failure)
		}
		if failure = tx.Commit(ctx); failure != nil {
			t.Fatal(failure)
		}
		snapshot := func() string {
			t.Helper()
			return posCustomerSnapshot(t, ctx, organizations, user, org) + privateReadSnapshot(t, ctx, organizations, user, org)
		}
		for _, boundary := range []string{"UPDATE online_orders SET cart_id=NULL", "INSERT INTO online_order_events", "INSERT INTO organization_audit_events"} {
			for _, cancel := range []bool{false, true} {
				before := snapshot()
				catalogReadInterrupted(t, ctx, pool, owner, boundary, 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
					return (&pos.Service{Organization: traced.Organization}).UpdateCart(request, user, org, cart.ID, "cancel", pos.CartInput{Revision: cart.Revision})
				}, true)
				if snapshot() != before {
					t.Fatal("interrupted online release retained link/event/cart/audit effects")
				}
			}
		}
		value, failure := point.UpdateCart(ctx, user, org, cart.ID, "cancel", pos.CartInput{Revision: cart.Revision})
		if failure != nil || value.Status != "CANCELLED" || value.Revision != cart.Revision+1 {
			t.Fatalf("online cart cancellation: %v", failure)
		}
		probe, _, failure := organizations.Authorized(ctx, user, org, "online_orders.manage")
		if failure != nil {
			t.Fatal(failure)
		}
		defer probe.Rollback(ctx)
		var released bool
		var events, revision int
		failure = probe.QueryRow(ctx, "SELECT cart_id IS NULL,revision,(SELECT count(*) FROM online_order_events WHERE organization_id=$1 AND order_id=$2) FROM online_orders WHERE organization_id=$1 AND id=$2", org, order).Scan(&released, &revision, &events)
		if failure != nil || !released || revision != 2 || events != 1 {
			t.Fatalf("online cancellation link/event: released=%t revision=%d events=%d: %v", released, revision, events, failure)
		}
	})
}

func posCartMutationScopes(t *testing.T, ctx context.Context, pool *pgxpool.Pool, organizations *organization.Service, point *pos.Service, owner, guest testsupport.MFASession, org string, seed pos.Cart) {
	t.Helper()
	user := identity.SessionFromContext(ctx).User.ID
	foreign := identity.SessionFromContext(guest.Context).User.ID
	other, err := organizations.Create(ctx, user, "df900000-0000-4000-8000-000000001001", organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Other cart tenant", Code: "OTHERCARTMFA", BusinessType: "RETAIL"}, Branch: organization.BranchInput{Name: "Main", Code: "MAIN", Status: "ACTIVE"}})
	if err != nil {
		t.Fatal(err)
	}
	for _, action := range []string{"create", "update", "hold", "resume", "cancel"} {
		run := func(request context.Context, service *pos.Service, actor, tenant string) (pos.Cart, error) {
			if action == "create" {
				return service.CreateCart(request, actor, tenant, "df400000-0000-4000-8000-000000000004", pos.CartInput{TerminalID: seed.TerminalID})
			}
			return service.UpdateCart(request, actor, tenant, seed.ID, action, pos.CartInput{Revision: seed.Revision})
		}
		for _, status := range []string{"", "ACTIVE", "SUSPENDED"} {
			t.Run(action+" membership "+status, func(t *testing.T) {
				privateReadMembership(t, ctx, organizations, user, org, foreign, status)
				want := pos.ErrNotFound
				if status == "ACTIVE" {
					want = organization.ErrDenied
				}
				before := posCustomerSnapshot(t, ctx, organizations, user, org)
				value, failure := run(guest.Context, point, foreign, org)
				if !errors.Is(failure, want) || !reflect.ValueOf(value).IsZero() || posCustomerSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatalf("cart membership boundary: %v", failure)
				}
			})
		}
		privateReadMembership(t, ctx, organizations, user, org, foreign, "")
		t.Run(action+" foreign document", func(t *testing.T) {
			before := posCustomerSnapshot(t, ctx, organizations, user, org)
			otherBefore := posCustomerSnapshot(t, ctx, organizations, user, other.Organization.ID)
			value, failure := run(ctx, point, user, other.Organization.ID)
			if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() || posCustomerSnapshot(t, ctx, organizations, user, org) != before || posCustomerSnapshot(t, ctx, organizations, user, other.Organization.ID) != otherBefore {
				t.Fatalf("cart tenant boundary: %v", failure)
			}
		})
		t.Run(action+" pinned deployment", func(t *testing.T) {
			value, failure := run(ctx, &pos.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: other.Organization.ID}}, user, org)
			if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("cart deployment boundary: %v", failure)
			}
		})
	}
	tx, _, err := organizations.Authorized(ctx, user, org, "pos.cart.manage")
	if err != nil {
		t.Fatal(err)
	}
	_, err = tx.Exec(ctx, "UPDATE organization_memberships SET role='OWNER',status='ACTIVE' WHERE organization_id=$1 AND user_id=$2", org, foreign)
	if err == nil {
		err = tx.Commit(ctx)
	}
	tx.Rollback(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, action := range []string{"update", "hold", "resume", "cancel"} {
		value, failure := point.UpdateCart(guest.Context, foreign, org, seed.ID, action, pos.CartInput{Revision: seed.Revision})
		if !errors.Is(failure, organization.ErrDenied) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("another Owner changed own-cashier cart: %v", failure)
		}
	}
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	t.Run("revoked cart mutations", func(t *testing.T) {
		session := identity.SessionFromContext(ctx).ID
		if _, err := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1", session); err != nil {
			t.Fatal(err)
		}
		defer func() {
			if _, err := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=NULL WHERE id=$1", session); err != nil {
				t.Error(err)
			}
		}()
		value, failure := point.CreateCart(ctx, user, org, "df400000-0000-4000-8000-000000000004", pos.CartInput{TerminalID: seed.TerminalID})
		if !errors.Is(failure, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("revoked create replay: %v", failure)
		}
		for _, action := range []string{"update", "hold", "resume", "cancel"} {
			value, failure := point.UpdateCart(ctx, user, org, seed.ID, action, pos.CartInput{Revision: seed.Revision})
			if !errors.Is(failure, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("revoked cart mutation: %v", failure)
			}
		}
	})
}

func posCartMutationHTTP(t *testing.T, ctx context.Context, auth identity.Handler, organizations *organization.Service, point *pos.Service, owner, guest testsupport.MFASession, org, terminal string, nextKey func() string) {
	t.Helper()
	user := identity.SessionFromContext(ctx).User.ID
	_, primaryToken, primaryCSRF, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, pos.Handler{Service: point}.TenantRoutes)
	for _, action := range []string{"create", "update", "hold", "resume", "cancel"} {
		cart, failure := point.CreateCart(ctx, user, org, nextKey(), pos.CartInput{TerminalID: terminal})
		if failure != nil {
			t.Fatal(failure)
		}
		if action == "resume" {
			cart, failure = point.UpdateCart(ctx, user, org, cart.ID, "hold", pos.CartInput{Revision: cart.Revision})
			if failure != nil {
				t.Fatal(failure)
			}
		}
		method, path, status := http.MethodPost, "/pos/carts", 201
		if action == "update" {
			method, path, status = http.MethodPatch, "/pos/carts/"+cart.ID, 200
		} else if action != "create" {
			path, status = "/pos/carts/"+cart.ID+"/"+action, 200
		}
		key := nextKey()
		for _, candidate := range []struct {
			name, token, csrf, origin, code string
			status                          int
		}{
			{"missing", "", "", testsupport.MFAOrigin, "UNAUTHENTICATED", 401},
			{"primary", primaryToken, primaryCSRF, testsupport.MFAOrigin, "MFA_REQUIRED", 403},
			{"foreign", guest.Token, guest.CSRF, testsupport.MFAOrigin, "NOT_FOUND", 404},
			{"CSRF", owner.Token, "", testsupport.MFAOrigin, "INVALID_CSRF", 403},
			{"Origin", owner.Token, owner.CSRF, "https://untrusted.example.test", "INVALID_ORIGIN", 403},
			{"assured", owner.Token, owner.CSRF, testsupport.MFAOrigin, "", status},
		} {
			t.Run(action+" HTTP "+candidate.name, func(t *testing.T) {
				before := posCustomerSnapshot(t, ctx, organizations, user, org)
				body, _ := json.Marshal(pos.CartInput{TerminalID: terminal, Revision: cart.Revision})
				request := httptest.NewRequest(method, "/organizations/"+org+path, strings.NewReader(string(body))).WithContext(ctx)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("Origin", candidate.origin)
				request.Header.Set("X-CSRF-Token", candidate.csrf)
				request.Header.Set("Idempotency-Key", key)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: candidate.token})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				if response.Code != candidate.status || response.Header().Get("Cache-Control") != "no-store" || candidate.code != "" && (!strings.Contains(response.Body.String(), candidate.code) || strings.Contains(response.Body.String(), `"data"`)) {
					t.Fatalf("cart HTTP boundary %d", response.Code)
				}
				if candidate.code != "" && posCustomerSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("denied cart HTTP changed state")
				}
			})
		}
	}
}
