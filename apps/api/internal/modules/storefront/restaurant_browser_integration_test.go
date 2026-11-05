package storefront_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/restaurant"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/database"
	"smartpos/api/internal/platform/stripe"
	"smartpos/api/internal/transport"
)

func restaurantBrowserAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, accounts *identity.Service, owner, email, org string, shop storefront.Settings) {
	test.Helper()
	root, err := filepath.Abs("../../../../..")
	if err != nil {
		test.Fatal(err)
	}
	dist := filepath.Join(root, "apps", "web", "dist")
	if _, err = os.Stat(filepath.Join(dist, "index.html")); err != nil {
		test.Fatal("browser acceptance requires a current npm run build")
	}
	tx, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		test.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var countUnit, weightUnit, product, menu, ingredient, operation string
	for _, unit := range []struct {
		code, kind string
		target     *string
	}{{"DISH", "COUNT", &countUnit}, {"KG", "WEIGHT", &weightUnit}} {
		if err = tx.QueryRow(ctx, `INSERT INTO units(organization_id,code,name,unit_type) VALUES($1,$2,$2,$3) RETURNING id::text`, org, unit.code, unit.kind).Scan(unit.target); err != nil {
			test.Fatal(err)
		}
	}
	if err = tx.QueryRow(ctx, `INSERT INTO products(organization_id,name,created_by,updated_by) VALUES($1,'Browser recipe menu',$2,$2) RETURNING id::text`, org, owner).Scan(&product); err != nil {
		test.Fatal(err)
	}
	for _, variant := range []struct {
		sku, unit string
		target    *string
	}{{"BROWSER_MENU", countUnit, &menu}, {"BROWSER_INGREDIENT", weightUnit, &ingredient}} {
		if err = tx.QueryRow(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency) VALUES($1,$2,$3,$3,$4,1,10,'THB') RETURNING id::text`, org, product, variant.sku, variant.unit).Scan(variant.target); err != nil {
			test.Fatal(err)
		}
	}
	if _, err = tx.Exec(ctx, `INSERT INTO storefront_products(organization_id,variant_id,published) VALUES($1,$2,true)`, org, menu); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'restaurant.browser-fixture',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("0", 64)).Scan(&operation); err != nil {
		test.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'OPENING_BALANCE',3.000,$5,'SYNTHETIC_BROWSER',$6)`, org, shop.BranchID, shop.LocationID, ingredient, operation, owner); err != nil {
		test.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `UPDATE inventory_operations SET result='{}' WHERE organization_id=$1 AND id=$2`, org, operation); err != nil {
		test.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		test.Fatal(err)
	}
	restaurantService := &restaurant.Service{Organization: organizations}
	if _, err = restaurantService.SaveRecipe(ctx, owner, org, "", "ab111111-1111-4111-8111-111111111111", restaurant.RecipeInput{BranchID: shop.BranchID, MenuVariantID: menu, Status: "ACTIVE", Items: []restaurant.RecipeIngredientInput{{IngredientVariantID: ingredient, Quantity: "0.200"}}}); err != nil {
		test.Fatal(err)
	}
	table, err := restaurantService.SaveTable(ctx, owner, org, "", "ab222222-2222-4222-8222-222222222222", restaurant.TableInput{BranchID: shop.BranchID, Code: "B1", Name: "Browser table", Seats: 4, Status: "ACTIVE"})
	if err != nil {
		test.Fatal(err)
	}
	service := &storefront.Service{Organization: organizations}
	shop, err = service.SaveSettings(ctx, owner, org, storefront.SettingsInput{Slug: shop.Slug, Name: shop.Name, TerminalID: shop.TerminalID, Published: true, AcceptingOrders: true, DeliveryEnabled: true, ShippingFee: "5.00", Revision: shop.Revision})
	if err != nil {
		test.Fatal(err)
	}
	if _, err = (&pos.Service{Organization: organizations}).OpenShift(ctx, owner, org, "ab333333-3333-4333-8333-333333333333", pos.ShiftInput{TerminalID: shop.TerminalID, OpeningCash: "0.00"}); err != nil {
		test.Fatal(err)
	}
	server := httptest.NewUnstartedServer(nil)
	origin := "http://" + server.Listener.Addr().String()
	base, err := stripe.NewSandbox("sk_test_syntheticBrowser", origin)
	if err != nil {
		test.Fatal(err)
	}
	client, err := stripe.NewCustomerClient(base, persistenceSigningSecret, true)
	if err != nil {
		test.Fatal(err)
	}
	gateway := &checkoutGatewayFixture{CustomerClient: client}
	var sessionMutex sync.Mutex
	sessions := make(map[string]stripe.CustomerSession)
	gateway.create = func(_ context.Context, charge stripe.CustomerCharge) (stripe.CustomerSession, error) {
		sessionMutex.Lock()
		defer sessionMutex.Unlock()
		session := paymentFixtureSession(storefront.PaymentAttempt{OrganizationID: charge.OrganizationID, OrderID: charge.OrderID, AmountMinor: charge.AmountMinor, ExpiresAt: charge.ExpiresAt}, "cs_test_"+strings.ReplaceAll(charge.OrderID, "-", ""), "open", "unpaid")
		sessions[charge.OrderID] = session
		return session, nil
	}
	gateway.retrieve = func(_ context.Context, charge stripe.CustomerCharge, id string) (stripe.CustomerSession, error) {
		sessionMutex.Lock()
		defer sessionMutex.Unlock()
		session, found := sessions[charge.OrderID]
		if !found || session.ID != id {
			return stripe.CustomerSession{}, stripe.ErrNotFound
		}
		return session, nil
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	api := transport.RouterWithOptions(database.Checker{Pool: organizations.Pool}, logger, transport.Options{SingleStoreOrganizationID: org, CustomerPayments: gateway}, identity.Handler{Service: accounts, Origins: []string{origin}})
	mux := http.NewServeMux()
	mux.Handle("/api/", api)
	mux.HandleFunc("/health/ready", api.ServeHTTP)
	mux.HandleFunc("/", func(writer http.ResponseWriter, request *http.Request) {
		if strings.HasPrefix(request.URL.Path, "/assets/") || strings.HasPrefix(request.URL.Path, "/fonts/") || request.URL.Path == "/favicon.svg" {
			http.FileServer(http.Dir(dist)).ServeHTTP(writer, request)
			return
		}
		http.ServeFile(writer, request, filepath.Join(dist, "index.html"))
	})
	mux.HandleFunc("/__acceptance/pay", func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost {
			writer.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var input struct {
			OrderID string `json:"order_id"`
		}
		if json.NewDecoder(http.MaxBytesReader(writer, request.Body, 1024)).Decode(&input) != nil {
			writer.WriteHeader(http.StatusBadRequest)
			return
		}
		sessionMutex.Lock()
		session, found := sessions[input.OrderID]
		if found {
			session.Status, session.PaymentStatus, session.URL = "complete", "paid", ""
			session.PaymentIntent = "pi_" + strings.TrimPrefix(session.ID, "cs_test_")
			sessions[input.OrderID] = session
		}
		sessionMutex.Unlock()
		if !found {
			writer.WriteHeader(http.StatusNotFound)
			return
		}
		now := time.Now()
		event := stripe.CustomerEvent{ID: "evt_" + strings.ReplaceAll(input.OrderID, "-", ""), Object: "event", Type: "checkout.session.completed", LiveMode: new(bool), Created: now.Unix()}
		event.Data.Object = session
		body, problem := json.Marshal(event)
		if problem != nil {
			writer.WriteHeader(500)
			return
		}
		webhook := httptest.NewRequest(http.MethodPost, "/api/v1/storefront-payments/stripe/webhook", bytes.NewReader(body))
		webhook.Header.Set("Content-Type", "application/json")
		webhook.Header.Set("Stripe-Signature", paymentSignature(body, now))
		api.ServeHTTP(writer, webhook)
	})
	mux.HandleFunc("/__acceptance/stock", func(writer http.ResponseWriter, request *http.Request) {
		read, _, problem := organizations.Authorized(request.Context(), owner, org, "storefront.manage")
		if problem != nil {
			writer.WriteHeader(500)
			return
		}
		defer read.Rollback(request.Context())
		var quantity, reserved string
		var movements, sales int
		problem = read.QueryRow(request.Context(), `SELECT quantity::text,storefront_reserved_quantity($1,$2,$3)::text,(SELECT count(*) FROM stock_movements WHERE organization_id=$1 AND variant_id=$3 AND movement_type='SALE'),(SELECT count(*) FROM sales WHERE organization_id=$1) FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3`, org, shop.LocationID, ingredient).Scan(&quantity, &reserved, &movements, &sales)
		if problem != nil {
			writer.WriteHeader(500)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		json.NewEncoder(writer).Encode(map[string]any{"quantity": quantity, "reserved": reserved, "sale_movements": movements, "sales": sales})
	})
	server.Config.Handler = mux
	server.Start()
	defer server.Close()
	fixture, err := json.Marshal(map[string]string{"slug": shop.Slug, "org": org, "branch": shop.BranchID, "menuVariant": menu, "ingredientVariant": ingredient, "tableToken": table.QRToken, "ownerEmail": email, "ownerPassword": "Synthetic-owner-password-2026"})
	if err != nil {
		test.Fatal(err)
	}
	command := exec.CommandContext(ctx, "node", filepath.Join(root, "node_modules", "@playwright", "test", "cli.js"), "test", "tests/e2e/restaurant-live.spec.mjs", "--workers=1", "--reporter=line", "--output="+filepath.Join(root, ".local", "restaurant-flow-20261105", "live-browser-results"))
	command.Dir = root
	for _, value := range os.Environ() {
		if !strings.HasPrefix(value, "SMARTPOS_SINGLE_STORE_TEST_DSN=") && !strings.HasPrefix(value, "AUTH_TEST_PROXY=") && !strings.HasPrefix(value, "E2E_BASE_URL=") && !strings.HasPrefix(value, "AUTH_E2E=") {
			command.Env = append(command.Env, value)
		}
	}
	command.Env = append(command.Env, "E2E_BASE_URL="+origin, "SMARTPOS_RESTAURANT_LIVE_FIXTURE="+string(fixture), "AUTH_TEST_PROXY=", "AUTH_E2E=0")
	output, err := command.CombinedOutput()
	test.Log(string(output))
	if err != nil {
		test.Fatalf("real API/database browser acceptance failed: %v", err)
	}
}
