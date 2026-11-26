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
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/customers"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/loyalty"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/testsupport"
)

func posCheckoutMutationMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string) {
	t.Helper()
	ctx = owner.Context
	user := identity.SessionFromContext(ctx).User.ID
	point := &pos.Service{Organization: organizations}
	seed := seedPOSCustomerCart(t, ctx, organizations, point, user, org)
	catalogService := &catalog.Service{Organization: organizations}
	unit, err := catalogService.SaveTaxonomy(ctx, user, org, "units", "", catalog.TaxonomyInput{Name: "Checkout unit", Code: "CHECKMFA", UnitType: "COUNT", Status: "ACTIVE"})
	if err != nil {
		t.Fatal(err)
	}
	product, err := catalogService.CreateProduct(ctx, user, org, catalog.CreateInput{ProductInput: catalog.ProductInput{Name: "Checkout item", Status: "ACTIVE"}, Variants: []catalog.VariantInput{{SKU: "CHECKMFA", Name: "Checkout variant", UnitID: unit.ID, CostPrice: "1.00", SellingPrice: "12.34", Status: "ACTIVE"}}})
	if err != nil {
		t.Fatal(err)
	}
	_, primaryToken, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	sequence := 0
	nextKey := func() string {
		sequence++
		return fmt.Sprintf("dfa00000-0000-4000-8000-%012x", sequence)
	}
	readyCart := func() pos.Cart {
		t.Helper()
		cart, failure := point.CreateCart(ctx, user, org, nextKey(), pos.CartInput{TerminalID: seed.TerminalID})
		if failure != nil {
			t.Fatal(failure)
		}
		cart, failure = point.UpdateCart(ctx, user, org, cart.ID, "update", pos.CartInput{Revision: cart.Revision, Items: []pos.ItemInput{{VariantID: product.Variants[0].ID, Quantity: "1.000"}}})
		if failure != nil {
			t.Fatal(failure)
		}
		return cart
	}
	prepareInput := func(cart pos.Cart) pos.CheckoutInput {
		return pos.CheckoutInput{CartID: cart.ID, Revision: cart.Revision, Method: "CASH", ExpectedTotal: cart.Total, Received: "20.00", PricingRevision: cart.Pricing.Revision}
	}
	type operation struct {
		name string
		run  func(context.Context, *pos.Service, string, string) (pos.Checkout, error)
	}
	operations := []operation{}
	for _, replay := range []bool{false, true} {
		cart := readyCart()
		key, input := nextKey(), prepareInput(cart)
		if replay {
			if _, failure := point.PrepareCheckout(ctx, user, org, key, input); failure != nil {
				t.Fatal(failure)
			}
		}
		operations = append(operations, operation{fmt.Sprintf("prepare replay=%t", replay), func(request context.Context, service *pos.Service, actor, tenant string) (pos.Checkout, error) {
			return service.PrepareCheckout(request, actor, tenant, key, input)
		}})
	}
	for _, action := range []string{"confirm", "complete", "cancel", "resolve"} {
		for _, replay := range []bool{false, true} {
			cart := readyCart()
			checkout, failure := point.PrepareCheckout(ctx, user, org, nextKey(), prepareInput(cart))
			if failure != nil {
				t.Fatal(failure)
			}
			key := nextKey()
			input := pos.ConfirmationInput{Acknowledged: true, Note: "Synthetic operator reconciliation"}
			if action == "complete" || action == "resolve" {
				checkout, failure = point.ConfirmPayment(ctx, user, org, checkout.ID, nextKey(), input)
				if failure != nil {
					t.Fatal(failure)
				}
			}
			run := func(request context.Context, service *pos.Service, actor, tenant string) (pos.Checkout, error) {
				switch action {
				case "confirm":
					return service.ConfirmPayment(request, actor, tenant, checkout.ID, key, input)
				case "complete":
					return service.CompleteCheckout(request, actor, tenant, checkout.ID)
				default:
					return service.EndCheckout(request, actor, tenant, checkout.ID, action, input)
				}
			}
			if replay {
				if _, failure = run(ctx, point, user, org); failure != nil {
					t.Fatal(failure)
				}
			}
			operations = append(operations, operation{fmt.Sprintf("%s replay=%t", action, replay), run})
		}
	}
	before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
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
				value, failure := operation.run(denial.ctx, point, user, org)
				if !errors.Is(failure, denial.want) || !reflect.ValueOf(value).IsZero() {
					t.Errorf("checkout mutation authority bypass: %v", failure)
				}
			})
		}
	}
	if posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
		t.Error("denied checkout mutations retained business/audit/financial state")
	}
	for _, operation := range operations {
		for _, expired := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s checkout lock expiry=%t", operation.name, expired), func(t *testing.T) {
				before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
				verifyPrivateReadWait(t, ctx, pool, owner, "pos_checkouts", expired, func(request context.Context) (any, error) {
					return operation.run(request, point, user, org)
				})
				if posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("blocked checkout changed financial state")
				}
			})
		}
		t.Run(operation.name+" aborted projection", func(t *testing.T) {
			before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
			trace := &customerReadFailureTrace{prefix: "SELECT customer_id::text,customer_code_snapshot FROM pos_checkouts", remaining: 1}
			configuration := pool.Config()
			configuration.ConnConfig.Tracer = trace
			traced, failure := pgxpool.NewWithConfig(ctx, configuration)
			if failure != nil {
				t.Fatal(failure)
			}
			defer traced.Close()
			value, failure := operation.run(ctx, &pos.Service{Organization: &organization.Service{Pool: traced}}, user, org)
			if failure == nil || trace.failure == nil || !reflect.ValueOf(value).IsZero() || posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("aborted checkout projection: %v", failure)
			}
		})
		for _, cancel := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s result cancel=%t", operation.name, cancel), func(t *testing.T) {
				before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
				count := 2
				if operation.name == "prepare replay=false" || operation.name == "prepare replay=true" || strings.HasSuffix(operation.name, "replay=true") {
					count = 1
				}
				catalogReadInterrupted(t, ctx, pool, owner, "SELECT pricing_snapshot FROM pos_checkouts", count, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
					return operation.run(request, &pos.Service{Organization: traced.Organization}, user, org)
				}, true)
				if posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("interrupted checkout retained business/audit/financial state")
				}
			})
		}
		if strings.HasSuffix(operation.name, "replay=true") {
			continue
		}
		boundaries := []string{"UPDATE pos_checkouts SET status=", "INSERT INTO organization_audit_events"}
		if strings.HasPrefix(operation.name, "prepare") {
			boundaries[0] = "INSERT INTO pos_checkouts("
		}
		if strings.HasPrefix(operation.name, "complete") {
			boundaries = append(boundaries, "SAVEPOINT sale_posting", "INSERT INTO sales(", "INSERT INTO sale_items(", "INSERT INTO sale_payments(", "INSERT INTO receipts(", "UPDATE register_shifts SET cash_sales=", "UPDATE pos_carts SET status='COMPLETED'", "RELEASE SAVEPOINT sale_posting")
		}
		for _, boundary := range boundaries {
			for _, cancel := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s after %s cancel=%t", operation.name, boundary, cancel), func(t *testing.T) {
					before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
					catalogReadInterrupted(t, ctx, pool, owner, boundary, 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						return operation.run(request, &pos.Service{Organization: traced.Organization}, user, org)
					}, true)
					if posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
						t.Fatal("interrupted checkout posting/audit retained state")
					}
				})
			}
		}
	}
	foreign := identity.SessionFromContext(guest.Context).User.ID
	other, err := organizations.Create(ctx, user, nextKey(), organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Other checkout tenant", Code: "OTHERCHECKMFA", BusinessType: "RETAIL"}, Branch: organization.BranchInput{Name: "Main", Code: "MAIN", Status: "ACTIVE"}})
	if err != nil {
		t.Fatal(err)
	}
	for _, operation := range operations {
		for _, status := range []string{"", "ACTIVE", "SUSPENDED"} {
			t.Run(operation.name+" membership "+status, func(t *testing.T) {
				privateReadMembership(t, ctx, organizations, user, org, foreign, status)
				want := pos.ErrNotFound
				if status == "ACTIVE" {
					want = organization.ErrDenied
				}
				before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
				value, failure := operation.run(guest.Context, point, foreign, org)
				if !errors.Is(failure, want) || !reflect.ValueOf(value).IsZero() || posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatalf("checkout membership boundary: %v", failure)
				}
			})
		}
		privateReadMembership(t, ctx, organizations, user, org, foreign, "")
		t.Run(operation.name+" foreign document", func(t *testing.T) {
			before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
			otherBefore := posCheckoutMutationSnapshot(t, ctx, organizations, user, other.Organization.ID)
			value, failure := operation.run(ctx, point, user, other.Organization.ID)
			if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() || posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before || posCheckoutMutationSnapshot(t, ctx, organizations, user, other.Organization.ID) != otherBefore {
				t.Fatalf("checkout tenant boundary: %v", failure)
			}
		})
		t.Run(operation.name+" pinned deployment", func(t *testing.T) {
			value, failure := operation.run(ctx, &pos.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: other.Organization.ID}}, user, org)
			if !errors.Is(failure, pos.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("checkout deployment boundary: %v", failure)
			}
		})
	}
	tx, _, err := organizations.Authorized(ctx, user, org, "pos.checkout")
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
	for _, operation := range operations {
		t.Run(operation.name+" own cashier", func(t *testing.T) {
			before := posCheckoutPostingSnapshot(t, ctx, organizations, user, org)
			value, failure := operation.run(guest.Context, point, foreign, org)
			// Reconciliation permission deliberately lets an Owner resolve a cashier's funds.
			if strings.HasPrefix(operation.name, "resolve") {
				if failure != nil || value.Status != "RESOLVED" || posCheckoutPostingSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatalf("authorized Owner reconciliation: %v", failure)
				}
				return
			}
			if !errors.Is(failure, organization.ErrDenied) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("another Owner accessed cashier checkout: %v", failure)
			}
		})
	}
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	t.Run("revoked checkout authority", func(t *testing.T) {
		session := identity.SessionFromContext(ctx).ID
		if _, err := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1", session); err != nil {
			t.Fatal(err)
		}
		defer func() {
			if _, err := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=NULL WHERE id=$1", session); err != nil {
				t.Error(err)
			}
		}()
		for _, operation := range operations {
			value, failure := operation.run(ctx, point, user, org)
			if !errors.Is(failure, identity.ErrInvalidToken) || !reflect.ValueOf(value).IsZero() {
				t.Fatalf("revoked checkout: %v", failure)
			}
		}
	})
	for _, operation := range operations {
		t.Run(operation.name+" assured exact result", func(t *testing.T) {
			value, failure := operation.run(ctx, point, user, org)
			if failure != nil || value.ID == "" || value.Total != "12.34" || value.Received != "20.00" || value.Change != "7.66" || len(value.Items) != 1 || value.Items[0].Quantity != "1.000" {
				t.Fatalf("assured checkout exact result: %v", failure)
			}
			if strings.HasPrefix(operation.name, "complete") && (value.Status != "COMPLETED" || value.SaleID == "") {
				t.Fatal("confirmed cash did not post exactly once")
			}
		})
	}
	posCheckoutMutationHTTP(t, ctx, auth, organizations, point, owner, guest, org, readyCart, prepareInput, nextKey)
	t.Run("archived selected customer keeps its checkout error", func(t *testing.T) {
		cart := readyCart()
		customerService := &customers.Service{Organization: organizations}
		customer, failure := customerService.Save(ctx, user, org, "", nextKey(), customers.Input{Code: "CHECKARCHIVE", Name: "Archived checkout customer"})
		if failure != nil {
			t.Fatal(failure)
		}
		cart, failure = point.SelectCustomer(ctx, user, org, cart.ID, pos.CustomerInput{Revision: cart.Revision, CustomerID: &customer.ID})
		if failure != nil {
			t.Fatal(failure)
		}
		if _, failure = customerService.Archive(ctx, user, org, customer.ID, customer.Revision, false); failure != nil {
			t.Fatal(failure)
		}
		before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
		value, failure := point.PrepareCheckout(ctx, user, org, nextKey(), prepareInput(cart))
		if !errors.Is(failure, pos.ErrCustomer) || !reflect.ValueOf(value).IsZero() || posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("archived customer error changed: %v", failure)
		}
	})
	for _, method := range []string{"QR_MANUAL", "BANK_TRANSFER_MANUAL"} {
		t.Run(method+" keeps reference and exact noncash posting", func(t *testing.T) {
			cart := readyCart()
			input := prepareInput(cart)
			input.Method, input.Received = method, cart.Total
			value, failure := point.PrepareCheckout(ctx, user, org, nextKey(), input)
			if failure != nil {
				t.Fatal(failure)
			}
			before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
			key := nextKey()
			invalid, failure := point.ConfirmPayment(ctx, user, org, value.ID, key, pos.ConfirmationInput{Acknowledged: true})
			if !errors.Is(failure, pos.ErrInput) || !reflect.ValueOf(invalid).IsZero() || posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("manual reference validation changed: %v", failure)
			}
			confirmation := pos.ConfirmationInput{Acknowledged: true, Reference: "Synthetic operator funds reference"}
			value, failure = point.ConfirmPayment(ctx, user, org, value.ID, key, confirmation)
			if failure != nil || value.Status != "CONFIRMED" {
				t.Fatalf("manual funds acknowledgement: %v", failure)
			}
			replay, failure := point.ConfirmPayment(ctx, user, org, value.ID, key, confirmation)
			if failure != nil || !reflect.DeepEqual(value, replay) {
				t.Fatalf("manual confirmation replay: %v", failure)
			}
			value, failure = point.CompleteCheckout(ctx, user, org, value.ID)
			if failure != nil || value.Status != "COMPLETED" || value.Total != "12.34" || value.Received != "12.34" || value.Change != "0.00" || value.Method != method || value.Reference != confirmation.Reference {
				t.Fatalf("manual exact settlement: %v", failure)
			}
		})
	}
	t.Run("NONE loyalty redemption posts once and rolls back interrupted ledger", func(t *testing.T) {
		cart := readyCart()
		customerService := &customers.Service{Organization: organizations}
		customer, failure := customerService.Save(ctx, user, org, "", nextKey(), customers.Input{Code: "CHECKREWARD", Name: "Checkout reward customer"})
		if failure != nil {
			t.Fatal(failure)
		}
		cart, failure = point.SelectCustomer(ctx, user, org, cart.ID, pos.CustomerInput{Revision: cart.Revision, CustomerID: &customer.ID})
		if failure != nil {
			t.Fatal(failure)
		}
		rewards := &loyalty.Service{Organization: organizations}
		identifier := func(data json.RawMessage, failure error) string {
			t.Helper()
			var result struct{ ID string }
			if failure != nil || json.Unmarshal(data, &result) != nil || result.ID == "" {
				t.Fatalf("loyalty checkout fixture: %v", failure)
			}
			return result.ID
		}
		program := identifier(rewards.SaveProgram(ctx, user, org, "", nextKey(), loyalty.ProgramInput{Name: "Checkout reward", Spend: "1.00", EarnPoints: 1, PointValue: "0.01", Status: "ACTIVE"}))
		account := identifier(rewards.SaveAccount(ctx, user, org, "", nextKey(), loyalty.AccountInput{CustomerID: customer.ID, ProgramID: program, Status: "ACTIVE"}))
		if _, failure = rewards.Adjust(ctx, user, org, account, nextKey(), loyalty.AdjustmentInput{Points: 1234, Reason: "Synthetic checkout reward", BranchID: cart.BranchID}); failure != nil {
			t.Fatal(failure)
		}
		quote, failure := point.Quote(ctx, user, org, cart.ID, "", 1234)
		if failure != nil || quote.Total != "0.00" || quote.Loyalty == nil {
			t.Fatalf("full reward quote: %v", failure)
		}
		input := prepareInput(cart)
		input.Method, input.Received, input.ExpectedTotal, input.PricingRevision, input.LoyaltyPoints = "NONE", "0.00", quote.Total, quote.Revision, 1234
		key := nextKey()
		for _, cancel := range []bool{false, true} {
			before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
			catalogReadInterrupted(t, ctx, pool, owner, "UPDATE pos_checkouts SET status='CONFIRMED',confirmation_key=", 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
				return (&pos.Service{Organization: traced.Organization}).PrepareCheckout(request, user, org, key, input)
			}, true)
			if posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatal("interrupted NONE checkout retained reserved reward")
			}
		}
		value, failure := point.PrepareCheckout(ctx, user, org, key, input)
		if failure != nil || value.Status != "CONFIRMED" || value.Total != "0.00" || value.Method != "NONE" {
			t.Fatalf("NONE checkout confirmation: %v", failure)
		}
		for _, cancel := range []bool{false, true} {
			before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
			catalogReadInterrupted(t, ctx, pool, owner, "INSERT INTO loyalty_ledger(", 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
				return (&pos.Service{Organization: traced.Organization}).CompleteCheckout(request, user, org, value.ID)
			}, true)
			if posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatal("interrupted reward posting retained ledger/payment/sale")
			}
		}
		value, failure = point.CompleteCheckout(ctx, user, org, value.ID)
		if failure != nil || value.Status != "COMPLETED" || value.Total != "0.00" || value.Received != "0.00" || value.Change != "0.00" || value.Pricing.Loyalty == nil || value.Pricing.Loyalty.Points != 1234 {
			t.Fatalf("NONE reward posting: %v", failure)
		}
		replay, failure := point.CompleteCheckout(ctx, user, org, value.ID)
		if failure != nil || !reflect.DeepEqual(value, replay) {
			t.Fatalf("NONE reward completed replay: %v", failure)
		}
		tx, _, failure := organizations.Authorized(ctx, user, org, "pos.checkout")
		if failure != nil {
			t.Fatal(failure)
		}
		defer tx.Rollback(ctx)
		var redeems, earns, redeemed int
		failure = tx.QueryRow(ctx, "SELECT count(*) FILTER(WHERE kind='REDEEM'),count(*) FILTER(WHERE kind='EARN'),COALESCE(sum(points) FILTER(WHERE kind='REDEEM'),0) FROM loyalty_ledger WHERE organization_id=$1 AND sale_id=$2", org, value.SaleID).Scan(&redeems, &earns, &redeemed)
		if failure != nil || redeems != 1 || earns != 1 || redeemed != -1234 {
			t.Fatalf("reward ledger replay: %d/%d/%d: %v", redeems, earns, redeemed, failure)
		}
	})
	posCheckoutMutationPosting(t, ctx, pool, organizations, point, owner, org, readyCart, prepareInput, nextKey)
}

type checkoutPostingFailureTrace struct {
	failure  *customerReadFailureTrace
	boundary pgx.QueryTracer
}

func (trace *checkoutPostingFailureTrace) TraceQueryStart(ctx context.Context, connection *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	ctx = trace.failure.TraceQueryStart(ctx, connection, data)
	return trace.boundary.TraceQueryStart(ctx, connection, data)
}

func (trace *checkoutPostingFailureTrace) TraceQueryEnd(ctx context.Context, connection *pgx.Conn, data pgx.TraceQueryEndData) {
	trace.boundary.TraceQueryEnd(ctx, connection, data)
}

func posCheckoutMutationPosting(t *testing.T, ctx context.Context, pool *pgxpool.Pool, organizations *organization.Service, point *pos.Service, owner testsupport.MFASession, org string, readyCart func() pos.Cart, prepareInput func(pos.Cart) pos.CheckoutInput, nextKey func() string) {
	t.Helper()
	user := identity.SessionFromContext(ctx).User.ID
	confirmed := func() pos.Checkout {
		t.Helper()
		cart := readyCart()
		value, err := point.PrepareCheckout(ctx, user, org, nextKey(), prepareInput(cart))
		if err == nil {
			value, err = point.ConfirmPayment(ctx, user, org, value.ID, nextKey(), pos.ConfirmationInput{Acknowledged: true})
		}
		if err != nil || value.Status != "CONFIRMED" {
			t.Fatalf("confirmed posting fixture: %v", err)
		}
		return value
	}
	t.Run("savepoint SQL recovery retains funds without partial sale", func(t *testing.T) {
		value := confirmed()
		for _, boundary := range []string{"ROLLBACK TO SAVEPOINT sale_posting", "UPDATE pos_checkouts SET status='RECONCILIATION_REQUIRED'", "INSERT INTO organization_audit_events"} {
			for _, cancel := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s cancel=%t", boundary, cancel), func(t *testing.T) {
					before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
					catalogReadInterrupted(t, ctx, pool, owner, boundary, 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						configuration := traced.Organization.Pool.Config()
						failure := &customerReadFailureTrace{prefix: "INSERT INTO sales(", remaining: 1}
						configuration.ConnConfig.Tracer = &checkoutPostingFailureTrace{failure: failure, boundary: configuration.ConnConfig.Tracer}
						failedPool, err := pgxpool.NewWithConfig(request, configuration)
						if err != nil {
							return pos.Checkout{}, err
						}
						defer failedPool.Close()
						result, err := (&pos.Service{Organization: &organization.Service{Pool: failedPool}}).CompleteCheckout(request, user, org, value.ID)
						if failure.failure == nil {
							t.Error("posting SQL failure was not injected")
						}
						return result, err
					}, true)
					if posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
						t.Fatal("authority failure committed reconciliation or posting")
					}
				})
			}
		}
		configuration := pool.Config()
		trace := &customerReadFailureTrace{prefix: "INSERT INTO sales(", remaining: 1}
		configuration.ConnConfig.Tracer = trace
		failedPool, err := pgxpool.NewWithConfig(ctx, configuration)
		if err != nil {
			t.Fatal(err)
		}
		defer failedPool.Close()
		before := posCheckoutPostingSnapshot(t, ctx, organizations, user, org)
		result, err := (&pos.Service{Organization: &organization.Service{Pool: failedPool}}).CompleteCheckout(ctx, user, org, value.ID)
		if err != nil || trace.failure == nil || result.Status != "RECONCILIATION_REQUIRED" || result.FailureCode != "SALE_POSTING_FAILED" || result.SaleID != "" || result.Total != "12.34" || posCheckoutPostingSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("SQL savepoint recovery changed funds/posting: %v", err)
		}
		result, err = point.CompleteCheckout(ctx, user, org, value.ID)
		if err != nil || result.Status != "COMPLETED" || result.SaleID == "" {
			t.Fatalf("forward retry of retained checkout identity: %v", err)
		}
	})
	t.Run("concurrent prepare confirmation and completion replay", func(t *testing.T) {
		cart := readyCart()
		key, input := nextKey(), prepareInput(cart)
		type outcome struct {
			value pos.Checkout
			err   error
		}
		concurrent := func(run func() (pos.Checkout, error)) pos.Checkout {
			t.Helper()
			results := make(chan outcome, 2)
			for range 2 {
				go func() {
					value, err := run()
					results <- outcome{value, err}
				}()
			}
			left, right := <-results, <-results
			if left.err != nil || right.err != nil || !reflect.DeepEqual(left.value, right.value) {
				t.Fatalf("concurrent checkout replay: %v/%v", left.err, right.err)
			}
			return left.value
		}
		value := concurrent(func() (pos.Checkout, error) { return point.PrepareCheckout(ctx, user, org, key, input) })
		before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
		changed := input
		changed.Received = "21.00"
		result, err := point.PrepareCheckout(ctx, user, org, key, changed)
		if !errors.Is(err, pos.ErrConflict) || !reflect.ValueOf(result).IsZero() || posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("changed prepare replay: %v", err)
		}
		for _, expired := range []bool{false, true} {
			verifyPrivateReadWait(t, ctx, pool, owner, "pos_checkouts", expired, func(request context.Context) (any, error) {
				return point.PrepareCheckout(request, user, org, key, changed)
			})
		}
		confirmation := nextKey()
		value = concurrent(func() (pos.Checkout, error) {
			return point.ConfirmPayment(ctx, user, org, value.ID, confirmation, pos.ConfirmationInput{Acknowledged: true})
		})
		before = posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
		for _, candidate := range []struct{ key, reference string }{{nextKey(), ""}, {confirmation, "changed"}} {
			result, err := point.ConfirmPayment(ctx, user, org, value.ID, candidate.key, pos.ConfirmationInput{Acknowledged: true, Reference: candidate.reference})
			if !errors.Is(err, pos.ErrConflict) || !reflect.ValueOf(result).IsZero() || posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
				t.Fatalf("changed confirmation replay: %v", err)
			}
		}
		value = concurrent(func() (pos.Checkout, error) { return point.CompleteCheckout(ctx, user, org, value.ID) })
		tx, _, err := organizations.Authorized(ctx, user, org, "pos.checkout")
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var sales, payments, receipts, prepared, confirmed, completed int
		err = tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM sales WHERE organization_id=$1 AND checkout_id=$2),(SELECT count(*) FROM sale_payments WHERE organization_id=$1 AND checkout_id=$2),(SELECT count(*) FROM receipts WHERE organization_id=$1 AND sale_id=$3),(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='pos.checkout.prepared' AND object_id=$2),(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='pos.payment.confirmed' AND object_id=$2),(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='pos.sale.completed' AND object_id=$3)`, org, value.ID, value.SaleID).Scan(&sales, &payments, &receipts, &prepared, &confirmed, &completed)
		if err != nil || sales != 1 || payments != 1 || receipts != 1 || prepared != 1 || confirmed != 1 || completed != 1 {
			t.Fatalf("replay financial/audit atomicity: %d/%d/%d/%d/%d/%d: %v", sales, payments, receipts, prepared, confirmed, completed, err)
		}
	})
	t.Run("price failure retains acknowledged funds and forward recovery", func(t *testing.T) {
		cart := readyCart()
		value, err := point.PrepareCheckout(ctx, user, org, nextKey(), prepareInput(cart))
		if err != nil {
			t.Fatal(err)
		}
		setPrice := func(price string) {
			t.Helper()
			tx, _, err := organizations.Authorized(ctx, user, org, "pos.checkout")
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			_, err = tx.Exec(ctx, "UPDATE product_variants SET selling_price=$3::numeric WHERE organization_id=$1 AND id=$2", org, cart.Items[0].VariantID, price)
			if err == nil {
				err = tx.Commit(ctx)
			}
			if err != nil {
				t.Fatal(err)
			}
		}
		setPrice("13.34")
		defer setPrice("12.34")
		before := posCheckoutPostingSnapshot(t, ctx, organizations, user, org)
		value, err = point.ConfirmPayment(ctx, user, org, value.ID, nextKey(), pos.ConfirmationInput{Acknowledged: true})
		if err != nil || value.Status != "RECONCILIATION_REQUIRED" || value.FailureCode != "PRICING_CHANGED" || value.Total != "12.34" || posCheckoutPostingSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("confirmation lost funds/reconciliation: %v", err)
		}
		value, err = point.CompleteCheckout(ctx, user, org, value.ID)
		if err != nil || value.Status != "RECONCILIATION_REQUIRED" || value.FailureCode != "PRICE_CHANGED" || value.SaleID != "" || posCheckoutPostingSnapshot(t, ctx, organizations, user, org) != before {
			t.Fatalf("domain posting failure lost recovery: %v", err)
		}
		setPrice("12.34")
		value, err = point.CompleteCheckout(ctx, user, org, value.ID)
		if err != nil || value.Status != "COMPLETED" || value.Total != "12.34" || value.Change != "7.66" || value.SaleID == "" {
			t.Fatalf("domain failure forward recovery: %v", err)
		}
	})
}

func posCheckoutPostingSnapshot(t *testing.T, ctx context.Context, organizations *organization.Service, user, org string) string {
	t.Helper()
	tx, _, err := organizations.Authorized(ctx, user, org, "pos.checkout")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var result strings.Builder
	for _, table := range []string{"pos_carts", "pos_cart_items", "register_shifts", "sales", "sale_items", "sale_payments", "receipts", "stock_balances", "stock_movements", "quality_stock_balances", "inventory_operations", "promotion_redemptions", "loyalty_accounts", "loyalty_ledger"} {
		var digest string
		if err = tx.QueryRow(ctx, "SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM "+table+" t WHERE organization_id=$1", org).Scan(&digest); err != nil {
			t.Fatal(err)
		}
		result.WriteString(digest)
	}
	return result.String()
}

func posCheckoutMutationHTTP(t *testing.T, ctx context.Context, auth identity.Handler, organizations *organization.Service, point *pos.Service, owner, guest testsupport.MFASession, org string, readyCart func() pos.Cart, prepareInput func(pos.Cart) pos.CheckoutInput, nextKey func() string) {
	t.Helper()
	user := identity.SessionFromContext(ctx).User.ID
	_, primaryToken, primaryCSRF, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, pos.Handler{Service: point}.TenantRoutes)
	for _, action := range []string{"prepare", "confirm", "complete", "cancel", "resolve"} {
		cart := readyCart()
		path, status := "/pos/checkout", 201
		var body any = prepareInput(cart)
		if action != "prepare" {
			checkout, failure := point.PrepareCheckout(ctx, user, org, nextKey(), prepareInput(cart))
			if failure != nil {
				t.Fatal(failure)
			}
			if action == "complete" || action == "resolve" {
				checkout, failure = point.ConfirmPayment(ctx, user, org, checkout.ID, nextKey(), pos.ConfirmationInput{Acknowledged: true})
				if failure != nil {
					t.Fatal(failure)
				}
			}
			path, status = "/pos/checkouts/"+checkout.ID+"/"+action, 200
			if action == "confirm" {
				path = "/pos/payments/" + checkout.ID + "/confirm"
			}
			body = pos.ConfirmationInput{Acknowledged: true, Note: "Synthetic HTTP reconciliation"}
			if action == "complete" {
				body = struct{}{}
			}
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
				before := posCheckoutMutationSnapshot(t, ctx, organizations, user, org)
				encoded, _ := json.Marshal(body)
				request := httptest.NewRequest(http.MethodPost, "/organizations/"+org+path, strings.NewReader(string(encoded))).WithContext(ctx)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("Origin", candidate.origin)
				request.Header.Set("X-CSRF-Token", candidate.csrf)
				request.Header.Set("Idempotency-Key", key)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: candidate.token})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				if response.Code != candidate.status || response.Header().Get("Cache-Control") != "no-store" || candidate.code != "" && (!strings.Contains(response.Body.String(), candidate.code) || strings.Contains(response.Body.String(), `"data"`)) {
					t.Fatalf("checkout HTTP boundary %d", response.Code)
				}
				if candidate.code != "" && posCheckoutMutationSnapshot(t, ctx, organizations, user, org) != before {
					t.Fatal("denied checkout HTTP changed financial state")
				}
			})
		}
	}
}

func posCheckoutMutationSnapshot(t *testing.T, ctx context.Context, organizations *organization.Service, user, org string) string {
	t.Helper()
	result := posCustomerSnapshot(t, ctx, organizations, user, org) + privateReadSnapshot(t, ctx, organizations, user, org)
	tx, _, err := organizations.Authorized(ctx, user, org, "pos.checkout")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	for _, table := range []string{"stock_balances", "quality_stock_balances", "promotions", "promotion_redemptions", "discount_approvals", "loyalty_accounts", "loyalty_ledger"} {
		var digest string
		if err = tx.QueryRow(ctx, "SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM "+table+" t WHERE organization_id=$1", org).Scan(&digest); err != nil {
			t.Fatal(err)
		}
		result += digest
	}
	return result
}
