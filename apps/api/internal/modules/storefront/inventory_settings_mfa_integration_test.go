package storefront_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/customers"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/loyalty"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/pricing"
	"smartpos/api/internal/modules/purchasing"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/testsupport"
)

func inventorySettingsMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, org string, shop, foreignShop storefront.Settings) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User
	_, primaryToken, primaryCSRF, err := auth.Service.Login(ctx, user.Email, "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	t.Run("purchasing HTTP writes require MFA", func(t *testing.T) {
		verifyPurchasingWriteDenials(t, auth, organizations, org,
			purchasingWriteActor{"primary_owner", primaryToken, primaryCSRF, "MFA_REQUIRED", http.StatusForbidden, true},
			purchasingWriteActor{"mfa_nonmember", guest.Token, guest.CSRF, "NOT_FOUND", http.StatusNotFound, true},
		)
	})
	service := &inventory.Service{Organization: organizations}
	variant := seedSourceProduct(t, ctx, organizations, user.ID, org, shop.BranchID, shop.LocationID, shop.LocationID)
	t.Run("supplier write authority", func(t *testing.T) {
		writer := &purchasing.Service{Organization: organizations}
		tx, _, err := organizations.Authorized(ctx, user.ID, org, "supplier.read")
		if err != nil {
			t.Fatal(err)
		}
		var unit string
		err = tx.QueryRow(ctx, "SELECT unit_id::text FROM product_variants WHERE organization_id=$1 AND id=$2", org, variant).Scan(&unit)
		tx.Rollback(ctx)
		if err != nil {
			t.Fatal(err)
		}
		router := chi.NewRouter()
		organization.Handler{Service: organizations, Authentication: auth}.Routes(router, purchasing.Handler{Service: writer}.TenantRoutes)
		type row struct {
			ID       string
			Revision int64
		}
		submit := func(t *testing.T, path, query string, payload any, update bool, revision int64, command func(context.Context, *purchasing.Service, string) (json.RawMessage, error)) row {
			t.Helper()
			if data, err := command(primary, writer, user.ID); data != nil || !errors.Is(err, identity.ErrMFARequired) {
				t.Fatalf("primary supplier write: data=%t err=%v", data != nil, err)
			}
			if data, err := command(guest.Context, writer, identity.SessionFromContext(guest.Context).User.ID); data != nil || !errors.Is(err, organization.ErrNotFound) {
				t.Fatalf("nonmember supplier write: data=%t err=%v", data != nil, err)
			}
			body, err := json.Marshal(payload)
			if err != nil {
				t.Fatal(err)
			}
			method := http.MethodPost
			if update {
				method = http.MethodPatch
			}
			request := func(token, csrf string) *httptest.ResponseRecorder {
				req := httptest.NewRequest(method, "/organizations/"+org+path, bytes.NewReader(body))
				req.Header.Set("Origin", testsupport.MFAOrigin)
				req.Header.Set("X-CSRF-Token", csrf)
				req.Header.Set("Content-Type", "application/json")
				req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: token})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, req)
				return response
			}
			response := request(primaryToken, primaryCSRF)
			if response.Code != 403 || !bytes.Contains(response.Body.Bytes(), []byte(`"MFA_REQUIRED"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
				t.Fatalf("primary supplier HTTP: status=%d", response.Code)
			}
			for _, boundary := range []struct {
				query  string
				cancel bool
			}{{query, false}, {"INSERT INTO organization_audit_events", true}, {"INSERT INTO organization_audit_events", false}} {
				catalogReadInterrupted(t, ctx, pool, owner, boundary.query, 1, boundary.cancel, func(c context.Context, traced *catalog.Service) (any, error) {
					data, err := command(c, &purchasing.Service{Organization: traced.Organization}, user.ID)
					return data != nil, err
				}, true)
			}
			response = request(owner.Token, owner.CSRF)
			status := http.StatusCreated
			if update {
				status = http.StatusOK
			}
			var result struct{ Data row }
			err = json.Unmarshal(response.Body.Bytes(), &result)
			if response.Code != status || response.Header().Get("Cache-Control") != "no-store" || err != nil || result.Data.ID == "" || result.Data.Revision != revision {
				t.Fatalf("authorized supplier HTTP after interruption: want status=%d revision=%d, got status=%d revision=%d no-store=%t decode=%v",
					status, revision, response.Code, result.Data.Revision, response.Header().Get("Cache-Control") == "no-store", err)
			}
			return result.Data
		}
		supplier := purchasing.SupplierInput{Code: "MFASUPWRITE", Name: "Synthetic supplier write"}
		saved := submit(t, "/suppliers", "INSERT INTO suppliers(", supplier, false, 1, func(c context.Context, s *purchasing.Service, actor string) (json.RawMessage, error) {
			return s.SaveSupplier(c, actor, org, "", supplier)
		})
		path := "/suppliers/" + saved.ID
		supplier.Revision, supplier.Name = saved.Revision, "Updated synthetic supplier"
		submit(t, path, "UPDATE suppliers SET", supplier, true, 2, func(c context.Context, s *purchasing.Service, actor string) (json.RawMessage, error) {
			return s.SaveSupplier(c, actor, org, saved.ID, supplier)
		})
		product := purchasing.ProductInput{VariantID: variant, PurchaseUnitID: unit, UnitCost: "3.25", Minimum: "1.000", Multiple: "1.000"}
		link := submit(t, path+"/products", "INSERT INTO supplier_products(", product, false, 1, func(c context.Context, s *purchasing.Service, actor string) (json.RawMessage, error) {
			return s.SaveProduct(c, actor, org, saved.ID, "", product)
		})
		product.Revision, product.UnitCost = link.Revision, "4.25"
		submit(t, path+"/products/"+link.ID, "UPDATE supplier_products SET", product, true, 2, func(c context.Context, s *purchasing.Service, actor string) (json.RawMessage, error) {
			return s.SaveProduct(c, actor, org, saved.ID, link.ID, product)
		})
		tx, _, err = organizations.Authorized(ctx, user.ID, org, "supplier.read")
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var name, cost string
		var supplierRevision, productRevision int64
		err = tx.QueryRow(ctx, `SELECT s.name, s.revision, p.unit_cost::text, p.revision
			FROM suppliers s JOIN supplier_products p ON p.organization_id=s.organization_id AND p.supplier_id=s.id
			WHERE s.organization_id=$1 AND s.id=$2 AND p.id=$3 AND p.variant_id=$4 AND p.purchase_unit_id=$5`,
			org, saved.ID, link.ID, variant, unit).Scan(&name, &supplierRevision, &cost, &productRevision)
		if err != nil || name != supplier.Name || cost != product.UnitCost || supplierRevision != 2 || productRevision != 2 {
			t.Fatalf("persisted supplier writes: supplier rev=%d, link rev=%d, expected name=%t cost=%t, err=%v", supplierRevision, productRevision, name == supplier.Name, cost == product.UnitCost, err)
		}
		var suppliers, products int
		err = tx.QueryRow(ctx, "SELECT count(*) FILTER (WHERE event_type='supplier.saved'), count(*) FILTER (WHERE event_type='supplier.product.saved') FROM organization_audit_events WHERE organization_id=$1", org).Scan(&suppliers, &products)
		if err != nil || suppliers != 2 || products != 2 {
			t.Fatalf("supplier audit count: suppliers=%d products=%d err=%v", suppliers, products, err)
		}
	})
	const orderCreateKey = "dfb30000-0000-4000-8000-000000000201"
	var orderCreateInput purchasing.DocumentInput
	t.Run("purchase order authority", func(t *testing.T) {
		writer := &purchasing.Service{Organization: organizations}
		tx, _, err := organizations.Authorized(ctx, user.ID, org, "supplier.read")
		if err != nil {
			t.Fatal(err)
		}
		var unit string
		err = tx.QueryRow(ctx, "SELECT unit_id::text FROM product_variants WHERE organization_id=$1 AND id=$2", org, variant).Scan(&unit)
		tx.Rollback(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var supplier struct{ ID string }
		data, err := writer.SaveSupplier(ctx, user.ID, org, "", purchasing.SupplierInput{Code: "MFAORDER", Name: "Synthetic order supplier"})
		if err != nil || json.Unmarshal(data, &supplier) != nil || supplier.ID == "" {
			t.Fatalf("seed order supplier: %v", err)
		}
		if _, err = writer.SaveProduct(ctx, user.ID, org, supplier.ID, "", purchasing.ProductInput{VariantID: variant, PurchaseUnitID: unit, UnitCost: "3.25", Minimum: "1.000", Multiple: "1.000"}); err != nil {
			t.Fatal(err)
		}
		const saveKey = orderCreateKey
		const submitKey = "dfb30000-0000-4000-8000-000000000202"
		input := purchasing.DocumentInput{BranchID: shop.BranchID, SupplierID: supplier.ID, Items: []purchasing.ItemInput{{VariantID: variant, PurchaseUnitID: unit, Quantity: "1.000", UnitCost: "3.25"}}}
		orderCreateInput = input
		router := chi.NewRouter()
		organization.Handler{Service: organizations, Authentication: auth}.Routes(router, purchasing.Handler{Service: writer}.TenantRoutes)
		type orderResult struct {
			ID       string
			Revision int64
			Status   string
			Items    []struct{ ID string }
		}
		checkRead := func(t *testing.T, path string, check func(json.RawMessage)) {
			t.Helper()
			for _, actor := range []struct {
				name, token, code string
				status            int
			}{
				{"owner", owner.Token, "", http.StatusOK},
				{"primary-only owner", primaryToken, "MFA_REQUIRED", http.StatusForbidden},
				{"MFA nonmember", guest.Token, "NOT_FOUND", http.StatusNotFound},
			} {
				req := httptest.NewRequest(http.MethodGet, "/organizations/"+org+"/purchasing/"+path, nil)
				req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: actor.token})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, req)
				var body struct {
					Data  json.RawMessage
					Error struct{ Code string }
				}
				if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || response.Code != actor.status || response.Header().Get("Cache-Control") != "no-store" || body.Error.Code != actor.code {
					t.Fatalf("%s read for %s: status=%d code=%q cache=%q decode=%v", path, actor.name, response.Code, body.Error.Code, response.Header().Get("Cache-Control"), err)
				}
				if actor.status != http.StatusOK {
					if len(body.Data) != 0 {
						t.Fatalf("%s read returned data to %s", path, actor.name)
					}
					continue
				}
				check(body.Data)
			}
		}
		checkDetail := func(t *testing.T, resource, id, state, item string, revision int64) {
			t.Helper()
			checkRead(t, resource+"/"+id, func(data json.RawMessage) {
				var document orderResult
				if err := json.Unmarshal(data, &document); err != nil || document.ID != id || document.Status != state || document.Revision != revision || len(document.Items) != 1 || document.Items[0].ID != item {
					t.Fatalf("%s detail did not match the persisted document: status=%q revision=%d items=%d decode=%v", resource, document.Status, document.Revision, len(document.Items), err)
				}
			})
		}
		var order orderResult
		for _, step := range []struct {
			name, change string
			run          func(context.Context, *purchasing.Service) (json.RawMessage, error)
		}{
			{"create", "INSERT INTO purchasing_documents(", func(c context.Context, s *purchasing.Service) (json.RawMessage, error) {
				return s.SaveDocument(c, user.ID, org, "ORDER", "", saveKey, input)
			}},
			{"submit", "UPDATE purchasing_documents SET status=", func(c context.Context, s *purchasing.Service) (json.RawMessage, error) {
				return s.ActDocument(c, user.ID, org, "ORDER", order.ID, "submit", submitKey, purchasing.ActionInput{Revision: order.Revision})
			}},
		} {
			t.Run(step.name, func(t *testing.T) {
				if data, err := step.run(primary, writer); data != nil || !errors.Is(err, identity.ErrMFARequired) {
					t.Fatalf("purchase order requires MFA: data=%t err=%v", data != nil, err)
				}
				interrupt := func(prefix string, cancel bool) {
					t.Helper()
					catalogReadInterrupted(t, ctx, pool, owner, prefix, 1, cancel, func(c context.Context, traced *catalog.Service) (any, error) {
						data, err := step.run(c, &purchasing.Service{Organization: traced.Organization})
						return data != nil, err
					}, true)
				}
				interrupt(step.change, false)
				interrupt("INSERT INTO organization_audit_events", true)
				path, key, wantStatus, wantState := "/purchasing/orders", saveKey, http.StatusCreated, "DRAFT"
				var payload any = input
				if step.name == "submit" {
					path, key, wantStatus, wantState = path+"/"+order.ID+"/submit", submitKey, http.StatusOK, "PENDING_APPROVAL"
					payload = purchasing.ActionInput{Revision: order.Revision}
				}
				body, err := json.Marshal(payload)
				if err != nil {
					t.Fatal(err)
				}
				request := func() json.RawMessage {
					t.Helper()
					req := httptest.NewRequest(http.MethodPost, "/organizations/"+org+path, bytes.NewReader(body))
					req.Header.Set("Origin", testsupport.MFAOrigin)
					req.Header.Set("X-CSRF-Token", owner.CSRF)
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("Idempotency-Key", key)
					req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
					response := httptest.NewRecorder()
					router.ServeHTTP(response, req)
					var result struct{ Data json.RawMessage }
					err := json.Unmarshal(response.Body.Bytes(), &result)
					if response.Code != wantStatus || response.Header().Get("Cache-Control") != "no-store" || err != nil || len(result.Data) == 0 {
						t.Fatalf("authorized purchase order HTTP: got status=%d, want %d, no-store=%t, data=%t, decode=%v", response.Code, wantStatus, response.Header().Get("Cache-Control") == "no-store", len(result.Data) != 0, err)
					}
					return result.Data
				}
				data := request()
				if cached := request(); !bytes.Equal(data, cached) {
					t.Fatal("purchase order HTTP replay returned different data")
				}
				interrupt("SELECT id::text,fingerprint,result FROM inventory_operations", false)
				var updated orderResult
				if json.Unmarshal(data, &updated) != nil || updated.ID == "" || (order.ID != "" && order.ID != updated.ID) || updated.Status != wantState || updated.Revision != order.Revision+1 || len(updated.Items) != 1 || updated.Items[0].ID == "" {
					t.Fatalf("wrong order state after rollback and retry: state=%s revision=%d items=%d", updated.Status, updated.Revision, len(updated.Items))
				}
				checkDetail(t, "orders", updated.ID, wantState, updated.Items[0].ID, updated.Revision)
				order = updated
			})
			if t.Failed() {
				return
			}
		}
		advance := func(t *testing.T, kind, resource, id, item, action, key, reason, beforeState, wantState string, revision int64) {
			t.Helper()
			t.Run(resource+" "+action+" HTTP", func(t *testing.T) {
				input := purchasing.ActionInput{Revision: revision, Reason: reason}
				t.Run("expiry after document update", func(t *testing.T) {
					catalogReadInterrupted(t, ctx, pool, owner, "UPDATE purchasing_documents SET status=", 1, false, func(c context.Context, traced *catalog.Service) (any, error) {
						result, err := (&purchasing.Service{Organization: traced.Organization}).ActDocument(c, user.ID, org, kind, id, action, key, input)
						return len(result) != 0, err
					}, true)
					checkDetail(t, resource, id, beforeState, item, revision)
				})
				if t.Failed() {
					return
				}
				payload, err := json.Marshal(input)
				if err != nil {
					t.Fatal(err)
				}
				path := "/organizations/" + org + "/purchasing/" + resource + "/" + id + "/" + action
				req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(payload))
				req.Header.Set("Origin", testsupport.MFAOrigin)
				req.Header.Set("X-CSRF-Token", owner.CSRF)
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Idempotency-Key", key)
				req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, req)
				var body struct{ Data orderResult }
				if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "no-store" || body.Data.ID != id || body.Data.Status != wantState || body.Data.Revision != revision+1 {
					t.Fatalf("transition: status=%d state=%q revision=%d decode=%v", response.Code, body.Data.Status, body.Data.Revision, err)
				}
				checkDetail(t, resource, id, wantState, item, revision+1)
			})
		}
		advance(t, "ORDER", "orders", order.ID, order.Items[0].ID, "approve", "dfb30000-0000-4000-8000-000000000203", "", "PENDING_APPROVAL", "APPROVED", order.Revision)
		advance(t, "ORDER", "orders", order.ID, order.Items[0].ID, "issue", "dfb30000-0000-4000-8000-000000000204", "Synthetic order issue", "APPROVED", "ORDERED", order.Revision+1)
		if t.Failed() {
			return
		}
		tx, _, err = organizations.Authorized(ctx, user.ID, org, "supplier.read")
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var warehouse string
		if err = tx.QueryRow(ctx, `INSERT INTO stock_locations(organization_id,branch_id,code,name,type,created_by,updated_by) VALUES($1,$2,'MFAWH','Synthetic order warehouse','WAREHOUSE',$3,$3) RETURNING id::text`, org, shop.BranchID, user.ID).Scan(&warehouse); err != nil {
			t.Fatal(err)
		}
		if err = tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		parent, parentItem := order.ID, order.Items[0].ID
		for _, command := range []struct {
			kind, resource, pending, action, state, save, submit, approve, post, delta string
		}{
			{"RECEIPT", "receipts", "PENDING_REVIEW", "post", "POSTED", "205", "206", "207", "208", "1.000"},
			{"RETURN", "returns", "PENDING_APPROVAL", "dispatch", "DISPATCHED", "209", "210", "211", "212", "-1.000"},
		} {
			t.Run(command.kind, func(t *testing.T) {
				key := func(suffix string) string { return "dfb30000-0000-4000-8000-000000000" + suffix }
				line := purchasing.ItemInput{VariantID: variant, ParentItemID: parentItem, Quantity: "1.000"}
				if command.kind == "RECEIPT" {
					line.Delivered, line.Rejected, line.Damaged = "2.000", "1.000", "0.000"
					line.Reason = "Synthetic rejected delivery item"
				} else {
					line.Reason = "Synthetic return reason"
				}
				data, err := writer.SaveDocument(ctx, user.ID, org, command.kind, "", key(command.save), purchasing.DocumentInput{BranchID: shop.BranchID, SupplierID: supplier.ID, ParentID: parent, LocationID: warehouse, Items: []purchasing.ItemInput{line}})
				var document struct {
					ID    string
					Items []struct{ ID string }
				}
				if err != nil || json.Unmarshal(data, &document) != nil || document.ID == "" || len(document.Items) != 1 {
					t.Fatalf("create %s: %v", command.kind, err)
				}
				advance(t, command.kind, command.resource, document.ID, document.Items[0].ID, "submit", key(command.submit), "", "DRAFT", command.pending, 1)
				advance(t, command.kind, command.resource, document.ID, document.Items[0].ID, "approve", key(command.approve), "", command.pending, "APPROVED", 2)
				if t.Failed() {
					return
				}
				post := func(c context.Context, s *purchasing.Service) (json.RawMessage, error) {
					return s.ActDocument(c, user.ID, org, command.kind, document.ID, command.action, key(command.post), purchasing.ActionInput{Revision: 3})
				}
				checkMovements := func(count int, delta string) {
					t.Helper()
					tx, _, err := organizations.Authorized(ctx, user.ID, org, "supplier.read")
					if err != nil {
						t.Fatal(err)
					}
					defer tx.Rollback(ctx)
					var actual int
					var total string
					err = tx.QueryRow(ctx, "SELECT count(*),coalesce(sum(quantity_delta),0)::numeric(18,3)::text FROM stock_movements WHERE organization_id=$1 AND purchasing_document_id=$2", org, document.ID).Scan(&actual, &total)
					if err != nil || actual != count || total != delta {
						t.Fatalf("%s movement count=%d delta=%s err=%v", command.kind, actual, total, err)
					}
				}
				type postingState struct {
					balance                    string
					events, audits, operations int
					parentStatus, accepted     string
					parentRevision             int64
					parentReceivedEvents       int
				}
				readPostingState := func() postingState {
					t.Helper()
					tx, _, err := organizations.Authorized(ctx, user.ID, org, "supplier.read")
					if err != nil {
						t.Fatal(err)
					}
					defer tx.Rollback(ctx)
					var state postingState
					err = tx.QueryRow(ctx, `SELECT
						COALESCE((SELECT quantity FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3),0)::numeric(18,3)::text,
						(SELECT count(*) FROM purchasing_events WHERE organization_id=$1 AND document_id=$4 AND action=$5),
						(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND object_id=$4 AND event_type=$6),
						(SELECT count(*) FROM inventory_operations WHERE organization_id=$1 AND actor_id=$7 AND operation=$8 AND idempotency_key=$9)`,
						org, warehouse, variant, document.ID, command.action, "purchasing."+command.kind+"."+command.action, user.ID,
						"purchasing:"+command.kind+":"+document.ID+":"+command.action, key(command.post)).Scan(&state.balance, &state.events, &state.audits, &state.operations)
					if err != nil {
						t.Fatal(err)
					}
					if command.kind == "RECEIPT" {
						err = tx.QueryRow(ctx, `SELECT doc.status, doc.revision, item.accepted_quantity::text,
							(SELECT count(*) FROM purchasing_events WHERE organization_id=$1 AND document_id=$2 AND action='received' AND reason=$4)
							FROM purchasing_documents doc JOIN purchasing_items item
							ON item.organization_id=doc.organization_id AND item.document_id=doc.id
							WHERE doc.organization_id=$1 AND doc.id=$2 AND item.id=$3`, org, parent, parentItem, document.ID).
							Scan(&state.parentStatus, &state.parentRevision, &state.accepted, &state.parentReceivedEvents)
						if err != nil {
							t.Fatal(err)
						}
					}
					return state
				}
				before := readPostingState()
				if command.kind == "RECEIPT" && (before.parentStatus != "ORDERED" || before.parentRevision != order.Revision+2 || before.accepted != "0.000" || before.parentReceivedEvents != 0) {
					t.Fatalf("unexpected parent order before receipt posting: %+v", before)
				}
				catalogReadInterrupted(t, ctx, pool, owner, "INSERT INTO stock_movements(", 1, false, func(c context.Context, traced *catalog.Service) (any, error) {
					data, err := post(c, &purchasing.Service{Organization: traced.Organization})
					return data != nil, err
				}, true)
				checkMovements(0, "0.000")
				if got := readPostingState(); got != before {
					t.Fatalf("expiry after stock movement changed durable state: got %+v, want %+v", got, before)
				}
				t.Run("expiry after audit insert", func(t *testing.T) {
					catalogReadInterrupted(t, ctx, pool, owner, "INSERT INTO organization_audit_events", 1, false, func(c context.Context, traced *catalog.Service) (any, error) {
						data, err := post(c, &purchasing.Service{Organization: traced.Organization})
						return data != nil, err
					}, true)
					checkDetail(t, command.resource, document.ID, "APPROVED", document.Items[0].ID, 3)
					checkMovements(0, "0.000")
					if got := readPostingState(); got != before {
						t.Fatalf("expired posting changed durable state: got %+v, want %+v", got, before)
					}
				})
				if t.Failed() {
					return
				}
				body, err := json.Marshal(purchasing.ActionInput{Revision: 3})
				if err != nil {
					t.Fatal(err)
				}
				send := func(c context.Context, target http.Handler) *httptest.ResponseRecorder {
					path := "/organizations/" + org + "/purchasing/" + command.resource + "/" + document.ID + "/" + command.action
					req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body)).WithContext(c)
					req.Header.Set("Origin", testsupport.MFAOrigin)
					req.Header.Set("X-CSRF-Token", owner.CSRF)
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("Idempotency-Key", key(command.post))
					req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
					response := httptest.NewRecorder()
					target.ServeHTTP(response, req)
					return response
				}
				expiredHTTP := func(c context.Context, traced *catalog.Service) (any, error) {
					tracedRouter := chi.NewRouter()
					organization.Handler{Service: organizations, Authentication: auth}.Routes(tracedRouter, purchasing.Handler{
						Service: &purchasing.Service{Organization: traced.Organization},
					}.TenantRoutes)
					response := send(c, tracedRouter)
					var result struct {
						Data  json.RawMessage
						Error struct{ Code string }
					}
					err := json.Unmarshal(response.Body.Bytes(), &result)
					if err != nil || response.Code != http.StatusUnauthorized || result.Error.Code != "UNAUTHENTICATED" || response.Header().Get("Cache-Control") != "no-store" || len(result.Data) != 0 {
						return false, fmt.Errorf("expired HTTP action: status=%d code=%q cache=%q data=%t decode=%v", response.Code, result.Error.Code, response.Header().Get("Cache-Control"), len(result.Data) != 0, err)
					}
					return false, identity.ErrInvalidToken
				}
				if !t.Run("HTTP expiry after audit insert", func(t *testing.T) {
					catalogReadInterrupted(t, ctx, pool, owner, "INSERT INTO organization_audit_events", 1, false, expiredHTTP, true)
					checkDetail(t, command.resource, document.ID, "APPROVED", document.Items[0].ID, 3)
					checkMovements(0, "0.000")
					if got := readPostingState(); got != before {
						t.Fatalf("expired HTTP write changed durable state: got %+v, want %+v", got, before)
					}
				}) {
					return
				}
				request := func() json.RawMessage {
					t.Helper()
					response := send(ctx, router)
					var result struct{ Data json.RawMessage }
					err := json.Unmarshal(response.Body.Bytes(), &result)
					if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "no-store" || err != nil || len(result.Data) == 0 {
						t.Fatalf("%s HTTP: status=%d no-store=%t data=%t decode=%v", command.action, response.Code, response.Header().Get("Cache-Control") == "no-store", len(result.Data) != 0, err)
					}
					return result.Data
				}
				data = request()
				var posted orderResult
				if err := json.Unmarshal(data, &posted); err != nil || posted.ID != document.ID || posted.Status != command.state || posted.Revision != 4 {
					t.Fatalf("%s HTTP result: status=%q revision=%d decode=%v", command.action, posted.Status, posted.Revision, err)
				}
				checkMovements(1, command.delta)
				t.Run("expiry after replay lookup", func(t *testing.T) {
					catalogReadInterrupted(t, ctx, pool, owner, "SELECT id::text,fingerprint,result FROM inventory_operations", 1, false, func(c context.Context, traced *catalog.Service) (any, error) {
						data, err := post(c, &purchasing.Service{Organization: traced.Organization})
						return data != nil, err
					}, true)
				})
				t.Run("HTTP expiry after replay lookup", func(t *testing.T) {
					catalogReadInterrupted(t, ctx, pool, owner, "SELECT id::text,fingerprint,result FROM inventory_operations", 1, false, expiredHTTP, true)
				})
				if t.Failed() {
					return
				}
				if cached := request(); !bytes.Equal(data, cached) {
					t.Fatalf("%s HTTP replay returned different data", command.action)
				}
				checkMovements(1, command.delta)
				checkDetail(t, command.resource, document.ID, command.state, document.Items[0].ID, 4)
				want := before
				want.balance = "0.000"
				want.events++
				want.audits++
				want.operations++
				if command.kind == "RECEIPT" {
					want.balance = "1.000"
					want.parentStatus = "RECEIVED"
					want.parentRevision++
					want.accepted = "1.000"
					want.parentReceivedEvents++
				}
				if got := readPostingState(); got != want {
					t.Fatalf("posting and replay durable state: got %+v, want %+v", got, want)
				}
				if command.kind == "RECEIPT" {
					checkDetail(t, "discrepancies", document.ID, command.state, document.Items[0].ID, 4)
					checkRead(t, "discrepancies?parent_id="+parent, func(data json.RawMessage) {
						var page purchasing.Page
						if err := json.Unmarshal(data, &page); err != nil || page.Total != 1 || page.Page != 1 || page.PageSize != 20 || len(page.Items) != 1 {
							t.Fatalf("unexpected discrepancy pagination: total=%d page=%d size=%d items=%d decode=%v", page.Total, page.Page, page.PageSize, len(page.Items), err)
						}
						var listed orderResult
						if err := json.Unmarshal(page.Items[0], &listed); err != nil || listed.ID != document.ID || listed.Status != command.state || listed.Revision != 4 {
							t.Fatalf("listed discrepancy did not match the posted receipt: status=%q revision=%d decode=%v", listed.Status, listed.Revision, err)
						}
					})
				}
				parent, parentItem = document.ID, document.Items[0].ID
			})
			if t.Failed() {
				return
			}
		}
	})
	t.Run("shelf write authority", func(t *testing.T) {
		writer := &purchasing.Service{Organization: organizations}
		input := purchasing.ShelfInput{BranchID: shop.BranchID, LocationID: shop.LocationID, Code: "MFASHELF", Name: "Synthetic shelf"}
		if data, err := writer.SaveShelf(primary, user.ID, org, "", input); data != nil || !errors.Is(err, identity.ErrMFARequired) {
			t.Fatalf("shelf write requires MFA: data=%t err=%v", data != nil, err)
		}
		catalogReadInterrupted(t, ctx, pool, owner, "INSERT INTO organization_audit_events", 1, false, func(c context.Context, traced *catalog.Service) (any, error) {
			data, err := (&purchasing.Service{Organization: traced.Organization}).SaveShelf(c, user.ID, org, "", input)
			return data != nil, err
		}, true)
		var shelf struct {
			ID       string
			Revision int64
		}
		data, err := writer.SaveShelf(ctx, user.ID, org, "", input)
		if err != nil || json.Unmarshal(data, &shelf) != nil || shelf.ID == "" || shelf.Revision != 1 {
			t.Fatalf("shelf retry after expiry: revision=%d err=%v", shelf.Revision, err)
		}
		readID := func(data json.RawMessage, err error) string {
			t.Helper()
			var result struct{ ID string }
			if err != nil || json.Unmarshal(data, &result) != nil || result.ID == "" {
				t.Fatalf("shelf fixture: %v", err)
			}
			return result.ID
		}
		slot := readID(writer.SaveSlot(ctx, user.ID, org, shelf.ID, purchasing.SlotInput{Code: "MFASLOT", Position: 1}))
		assignment := readID(writer.SaveAssignment(ctx, user.ID, org, shelf.ID, "", purchasing.AssignmentInput{SlotID: slot, VariantID: variant, Minimum: "1.000", Target: "20.000", Capacity: "25.000"}))
		tx, _, err := organizations.Authorized(ctx, user.ID, org, "shelf.manage")
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var warehouse, op string
		if err = tx.QueryRow(ctx, `INSERT INTO stock_locations(organization_id,branch_id,code,name,type,created_by,updated_by) VALUES($1,$2,'MFAREPL','Synthetic replenishment warehouse','WAREHOUSE',$3,$3) RETURNING id::text`, org, shop.BranchID, user.ID).Scan(&warehouse); err != nil {
			t.Fatal(err)
		}
		if err = tx.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'shelf.fixture',gen_random_uuid(),repeat('0',64)) RETURNING id::text`, org, user.ID).Scan(&op); err != nil {
			t.Fatal(err)
		}
		if _, err = tx.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'OPENING_BALANCE',3,$5,'SYNTHETIC_SOURCE',$6)`, org, shop.BranchID, warehouse, variant, op, user.ID); err != nil {
			t.Fatal(err)
		}
		if err = inventory.CompleteSale(ctx, tx, org, op, json.RawMessage(`{}`)); err != nil {
			t.Fatal(err)
		}
		if err = tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		task := readID(writer.CreateTask(ctx, user.ID, org, "dfb30000-0000-4000-8000-000000000231", purchasing.TaskInput{AssignmentID: assignment, SourceID: warehouse, Quantity: "1.000"}))
		readID(writer.ActTask(ctx, user.ID, org, task, "start", "dfb30000-0000-4000-8000-000000000232", purchasing.ActionInput{Revision: 1}))
		complete := func(c context.Context, service *purchasing.Service) (json.RawMessage, error) {
			return service.ActTask(c, user.ID, org, task, "complete", "dfb30000-0000-4000-8000-000000000233", purchasing.ActionInput{Revision: 2})
		}
		if data, err := complete(primary, writer); data != nil || !errors.Is(err, identity.ErrMFARequired) {
			t.Fatalf("replenishment requires MFA: data=%t err=%v", data != nil, err)
		}
		interrupted := func(prefix string) {
			t.Helper()
			catalogReadInterrupted(t, ctx, pool, owner, prefix, 1, false, func(c context.Context, traced *catalog.Service) (any, error) {
				data, err := complete(c, &purchasing.Service{Organization: traced.Organization})
				return data != nil, err
			}, true)
		}
		interrupted("INSERT INTO stock_movements(")
		assertSourceStock(t, ctx, organizations, user.ID, org, shop.BranchID, warehouse, variant, "3.000", "0.000", "3.000")
		data, err = complete(ctx, writer)
		if readID(data, err) != task {
			t.Fatal("completed wrong replenishment")
		}
		cached, err := complete(ctx, writer)
		if err != nil || !bytes.Equal(data, cached) {
			t.Fatalf("replenishment replay differs: %v", err)
		}
		interrupted("SELECT id::text,fingerprint,result FROM inventory_operations")
		assertSourceStock(t, ctx, organizations, user.ID, org, shop.BranchID, warehouse, variant, "2.000", "0.000", "2.000")
		router := chi.NewRouter()
		organization.Handler{Service: organizations, Authentication: auth}.Routes(router, purchasing.Handler{Service: writer}.TenantRoutes)
		type row struct {
			ID, Status, Quantity string
			AssignmentID         string `json:"assignment_id"`
			Revision             int64
			Slots, Assignments   []struct{ ID string }
		}
		for _, route := range []struct {
			path  string
			check func(json.RawMessage) bool
		}{
			{"/shelves/" + shelf.ID, func(data json.RawMessage) bool {
				var result row
				return json.Unmarshal(data, &result) == nil && result.ID == shelf.ID && len(result.Slots) == 1 && result.Slots[0].ID == slot && len(result.Assignments) == 1 && result.Assignments[0].ID == assignment
			}},
			{"/shelves/" + shelf.ID + "/slots", func(data json.RawMessage) bool {
				var result []row
				return json.Unmarshal(data, &result) == nil && len(result) == 1 && result[0].ID == slot
			}},
			{"/shelves/" + shelf.ID + "/assignments", func(data json.RawMessage) bool {
				var result []row
				return json.Unmarshal(data, &result) == nil && len(result) == 1 && result[0].ID == assignment
			}},
			{"/shelves/replenishments/" + task, func(data json.RawMessage) bool {
				var result row
				return json.Unmarshal(data, &result) == nil && result.ID == task && result.AssignmentID == assignment && result.Status == "COMPLETED" && result.Revision == 3 && result.Quantity == "1.000"
			}},
		} {
			t.Run("populated detail "+route.path, func(t *testing.T) {
				for _, actor := range []struct {
					name, token, code string
					status            int
				}{
					{"owner", owner.Token, "", http.StatusOK},
					{"primary-only owner", primaryToken, "MFA_REQUIRED", http.StatusForbidden},
					{"MFA nonmember", guest.Token, "NOT_FOUND", http.StatusNotFound},
				} {
					req := httptest.NewRequest(http.MethodGet, "/organizations/"+org+route.path, nil)
					req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: actor.token})
					response := httptest.NewRecorder()
					router.ServeHTTP(response, req)
					var body struct {
						Data  json.RawMessage
						Error struct{ Code string }
					}
					if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || response.Code != actor.status || body.Error.Code != actor.code || response.Header().Get("Cache-Control") != "no-store" {
						t.Fatalf("detail for %s: status=%d code=%q cache=%q decode=%v", actor.name, response.Code, body.Error.Code, response.Header().Get("Cache-Control"), err)
					}
					if actor.status == http.StatusOK && !route.check(body.Data) || actor.status != http.StatusOK && len(body.Data) != 0 {
						t.Fatalf("unexpected detail projection for %s", actor.name)
					}
				}
			})
		}
	})
	t.Run("purchasing read authority", func(t *testing.T) {
		reader := &purchasing.Service{Organization: organizations}
		var supplier struct{ ID string }
		data, err := reader.SaveSupplier(ctx, user.ID, org, "", purchasing.SupplierInput{Code: "MFASUPPLIER", Name: "Synthetic purchasing supplier"})
		if err != nil || json.Unmarshal(data, &supplier) != nil || supplier.ID == "" {
			t.Fatalf("seed supplier: %v", err)
		}
		router := chi.NewRouter()
		organization.Handler{Service: organizations, Authentication: auth}.Routes(router, purchasing.Handler{Service: reader}.TenantRoutes)
		const missing = "dfb30000-0000-4000-8000-000000000100"
		for _, route := range []struct{ path, resource, id string }{
			{"/suppliers", "suppliers", ""},
			{"/suppliers/" + supplier.ID, "suppliers", supplier.ID},
			{"/suppliers/" + supplier.ID + "/products", "products", supplier.ID},
			{"/purchasing/orders", "orders", ""},
			{"/purchasing/orders/" + missing, "orders", missing},
			{"/purchasing/receipts", "receipts", ""},
			{"/purchasing/receipts/" + missing, "receipts", missing},
			{"/purchasing/returns", "returns", ""},
			{"/purchasing/returns/" + missing, "returns", missing},
			{"/purchasing/discrepancies", "discrepancies", ""},
			{"/purchasing/discrepancies/" + missing, "discrepancies", missing},
			{"/purchasing/suggestions", "suggestions", ""},
			{"/shelves", "shelves", ""},
			{"/shelves/" + missing, "shelves", missing},
			{"/shelves/" + missing + "/slots", "shelves", missing},
			{"/shelves/" + missing + "/assignments", "shelves", missing},
			{"/shelves/replenishments", "tasks", ""},
			{"/shelves/replenishments/" + missing, "tasks", missing},
			{"/shelves/replenishments/suggestions", "replenishment-suggestions", ""},
		} {
			t.Run(route.path, func(t *testing.T) {
				read := func(c context.Context, service *purchasing.Service, actor string) (bool, error) {
					if route.id != "" {
						result, err := service.Get(c, actor, org, route.resource, route.id)
						return result != nil, err
					}
					result, err := service.List(c, actor, org, route.resource, purchasing.Filter{Page: 1, Size: 20, Branch: shop.BranchID})
					return result.Items != nil || result.Total != 0 || result.Page != 0 || result.PageSize != 0, err
				}
				if leaked, err := read(primary, reader, user.ID); leaked || !errors.Is(err, identity.ErrMFARequired) {
					t.Errorf("primary purchasing read: result=%t err=%v", leaked, err)
				}
				if leaked, err := read(guest.Context, reader, identity.SessionFromContext(guest.Context).User.ID); leaked || !errors.Is(err, organization.ErrNotFound) {
					t.Errorf("nonmember purchasing read: result=%t err=%v", leaked, err)
				}
				for _, token := range []string{primaryToken, guest.Token, owner.Token} {
					req := httptest.NewRequest(http.MethodGet, "/organizations/"+org+route.path, nil)
					req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: token})
					response := httptest.NewRecorder()
					router.ServeHTTP(response, req)
					if token == primaryToken {
						if response.Code != 403 || !bytes.Contains(response.Body.Bytes(), []byte(`"MFA_REQUIRED"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
							t.Errorf("primary purchasing HTTP read: status=%d", response.Code)
						}
					} else if token == guest.Token {
						if response.Code != http.StatusNotFound || !bytes.Contains(response.Body.Bytes(), []byte(`"NOT_FOUND"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
							t.Errorf("nonmember purchasing HTTP read: status=%d", response.Code)
						}
					} else if route.id == missing {
						if response.Code != 404 {
							t.Errorf("assured missing purchasing object: status=%d", response.Code)
						}
					} else if response.Code != 200 || !bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
						t.Errorf("assured purchasing HTTP read: status=%d", response.Code)
					}
					if response.Header().Get("Cache-Control") != "no-store" {
						t.Error("purchasing response missing no-store")
					}
				}
				if route.id == "" || route.resource == "suppliers" {
					prefix := "SELECT count(*) FROM "
					if route.id != "" {
						prefix = "SELECT to_jsonb(row) FROM suppliers row"
					}
					for _, cancel := range []bool{false, true} {
						catalogReadInterrupted(t, ctx, pool, owner, prefix, 1, cancel, func(c context.Context, traced *catalog.Service) (any, error) {
							return read(c, &purchasing.Service{Organization: traced.Organization}, user.ID)
						}, true)
					}
				}
			})
		}
		page, err := reader.List(ctx, user.ID, org, "orders", purchasing.Filter{Page: 1, Size: 20, Branch: foreignShop.BranchID})
		if page.Items != nil || page.Total != 0 || page.Page != 0 || page.PageSize != 0 || !errors.Is(err, inventory.ErrNotFound) {
			t.Fatalf("foreign branch purchasing read: err=%v", err)
		}
	})
	t.Run("pricing read authority", func(t *testing.T) {
		reader := &pricing.Service{Organization: organizations}
		list, err := reader.Save(ctx, user.ID, org, "price_lists", "", pricing.Definition{Name: "Synthetic price list", BranchID: shop.BranchID, Items: []pricing.PriceItem{{VariantID: variant, UnitPrice: "17.25"}}})
		if err != nil {
			t.Fatal(err)
		}
		promo, err := reader.Save(ctx, user.ID, org, "promotions", "", pricing.Definition{Name: "Synthetic promotion", BranchID: shop.BranchID, Rule: &pricing.Rule{Type: "PERCENTAGE", Policy: "EXCLUSIVE", BasisPoints: 500}})
		if err != nil {
			t.Fatal(err)
		}
		router := chi.NewRouter()
		organization.Handler{Service: organizations, Authentication: auth}.Routes(router, pricing.Handler{Service: reader}.TenantRoutes)
		for _, step := range []struct{ path, table, id, query, expected string }{
			{"/pricing/lists", "price_lists", "", "SELECT id::text,name,COALESCE(branch_id", list.ID},
			{"/pricing/lists/" + list.ID, "price_lists", list.ID, "SELECT id::text,name,COALESCE(branch_id", list.ID},
			{"/promotions", "promotions", "", "SELECT id::text,name,COALESCE(branch_id", promo.ID},
			{"/promotions/" + promo.ID, "promotions", promo.ID, "SELECT id::text,name,COALESCE(branch_id", promo.ID},
			{"/discount-approvals", "", "", "SELECT to_jsonb(item)||jsonb_build_object('amount'", `"data":[]`},
		} {
			t.Run(step.path, func(t *testing.T) {
				read := func(c context.Context, s *pricing.Service, actor string) (any, error) {
					if step.table == "" {
						result, err := s.Approvals(c, actor, org)
						if result == nil {
							return nil, err
						}
						return result, err
					}
					return s.List(c, actor, org, step.table, step.id)
				}
				if data, err := read(primary, reader, user.ID); data != nil || !errors.Is(err, identity.ErrMFARequired) {
					t.Errorf("primary pricing read: data=%t err=%v", data != nil, err)
				}
				if data, err := read(guest.Context, reader, identity.SessionFromContext(guest.Context).User.ID); data != nil || !errors.Is(err, organization.ErrNotFound) {
					t.Errorf("nonmember pricing read: data=%t err=%v", data != nil, err)
				}
				for _, token := range []string{primaryToken, owner.Token} {
					request := httptest.NewRequest(http.MethodGet, "/organizations/"+org+step.path, nil)
					request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: token})
					response := httptest.NewRecorder()
					router.ServeHTTP(response, request)
					if token == primaryToken {
						if response.Code != http.StatusForbidden || !bytes.Contains(response.Body.Bytes(), []byte(`"MFA_REQUIRED"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
							t.Errorf("primary pricing HTTP denial: status=%d", response.Code)
						}
					} else if response.Code != http.StatusOK || !bytes.Contains(response.Body.Bytes(), []byte(step.expected)) {
						t.Errorf("assured pricing HTTP read: status=%d", response.Code)
					}
					if response.Header().Get("Cache-Control") != "no-store" {
						t.Error("pricing response missing no-store")
					}
				}
				for _, cancel := range []bool{false, true} {
					catalogReadInterrupted(t, ctx, pool, owner, step.query, 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						data, err := read(request, &pricing.Service{Organization: traced.Organization}, user.ID)
						return data != nil, err
					}, true)
				}
			})
		}
	})
	t.Run("loyalty read authority", func(t *testing.T) {
		reader := &loyalty.Service{Organization: organizations}
		router := chi.NewRouter()
		organization.Handler{Service: organizations, Authentication: auth}.Routes(router, loyalty.Handler{Service: reader}.TenantRoutes)
		foreign := identity.SessionFromContext(guest.Context).User.ID
		for _, resource := range []string{"programs", "accounts", "history"} {
			t.Run(resource, func(t *testing.T) {
				if data, err := reader.Read(primary, user.ID, org, resource, "", shop.BranchID, 1); data != nil || !errors.Is(err, identity.ErrMFARequired) {
					t.Fatalf("primary read: data=%t err=%v", data != nil, err)
				}
				if data, err := reader.Read(guest.Context, foreign, org, resource, "", shop.BranchID, 1); data != nil || !errors.Is(err, organization.ErrNotFound) {
					t.Fatalf("nonmember read: data=%t err=%v", data != nil, err)
				}
				if data, err := reader.Read(ctx, user.ID, org, resource, "", foreignShop.BranchID, 1); data != nil || !errors.Is(err, inventory.ErrNotFound) {
					t.Fatalf("foreign branch read: data=%t err=%v", data != nil, err)
				}
				if data, err := reader.Read(ctx, user.ID, org, resource, "", shop.BranchID, 1); err != nil || !bytes.Contains(data, []byte(`"items"`)) {
					t.Fatalf("assured read: err=%v", err)
				}
				request := httptest.NewRequest(http.MethodGet, "/organizations/"+org+"/loyalty/"+resource, nil)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: primaryToken})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				if response.Code != http.StatusForbidden || response.Header().Get("Cache-Control") != "no-store" || !bytes.Contains(response.Body.Bytes(), []byte(`"MFA_REQUIRED"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
					t.Fatalf("loyalty HTTP denial: status=%d cache=%q", response.Code, response.Header().Get("Cache-Control"))
				}
				for _, cancel := range []bool{false, true} {
					catalogReadInterrupted(t, ctx, pool, owner, "SELECT jsonb_build_object('items'", 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						data, err := (&loyalty.Service{Organization: traced.Organization}).Read(request, user.ID, org, resource, "", shop.BranchID, 1)
						return len(data) != 0, err
					}, true)
				}
			})
		}
	})
	t.Run("pricing definition write authority", func(t *testing.T) {
		writer := &pricing.Service{Organization: organizations}
		router := chi.NewRouter()
		organization.Handler{Service: organizations, Authentication: auth}.Routes(router, pricing.Handler{Service: writer}.TenantRoutes)
		for _, resource := range []struct {
			table, path string
			input       pricing.Definition
		}{
			{"price_lists", "/pricing/lists", pricing.Definition{Name: "Synthetic definition price list", BranchID: shop.BranchID, Items: []pricing.PriceItem{{VariantID: variant, UnitPrice: "18.25"}}}},
			{"promotions", "/promotions", pricing.Definition{Name: "Synthetic definition promotion", BranchID: shop.BranchID, Rule: &pricing.Rule{Type: "PERCENTAGE", Policy: "EXCLUSIVE", BasisPoints: 400}}},
		} {
			var current pricing.Definition
			for _, step := range []struct{ action, method, status string }{
				{"create", http.MethodPost, "DRAFT"},
				{"update", http.MethodPut, "DRAFT"},
				{"submit", http.MethodPost, "PENDING_APPROVAL"},
				{"approve", http.MethodPost, "APPROVED"},
				{"activate", http.MethodPost, "ACTIVE"},
				{"pause", http.MethodPost, "PAUSED"},
			} {
				if !t.Run(resource.table+" "+step.action, func(t *testing.T) {
					input := resource.input
					input.Revision = current.Revision
					path, query := resource.path, "INSERT INTO "+resource.table+"("
					var body any = input
					switch step.action {
					case "create":
					case "update":
						path += "/" + current.ID
						query = "UPDATE " + resource.table + " SET name="
						input.Priority = 10
						body = input
					default:
						path += "/" + current.ID + "/" + step.action
						query = "UPDATE " + resource.table + " SET status="
						body = map[string]int64{"revision": current.Revision}
					}
					write := func(c context.Context, s *pricing.Service, actor string) (pricing.Definition, error) {
						if step.action == "create" || step.action == "update" {
							return s.Save(c, actor, org, resource.table, current.ID, input)
						}
						return s.Transition(c, actor, org, resource.table, current.ID, step.action, current.Revision)
					}
					for _, caller := range []struct {
						context context.Context
						actor   string
						want    error
					}{
						{primary, user.ID, identity.ErrMFARequired},
						{guest.Context, identity.SessionFromContext(guest.Context).User.ID, organization.ErrNotFound},
					} {
						if data, err := write(caller.context, writer, caller.actor); data.ID != "" || !errors.Is(err, caller.want) {
							t.Fatalf("pricing write denial: data=%t err=%v want=%v", data.ID != "", err, caller.want)
						}
					}
					encoded, err := json.Marshal(body)
					if err != nil {
						t.Fatal(err)
					}
					request := httptest.NewRequest(step.method, "/organizations/"+org+path, bytes.NewReader(encoded))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set("Origin", testsupport.MFAOrigin)
					request.Header.Set("X-CSRF-Token", primaryCSRF)
					request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: primaryToken})
					response := httptest.NewRecorder()
					router.ServeHTTP(response, request)
					if response.Code != http.StatusForbidden || !bytes.Contains(response.Body.Bytes(), []byte(`"MFA_REQUIRED"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
						t.Fatalf("primary pricing HTTP write denial: status=%d", response.Code)
					}
					for _, interrupt := range []struct {
						query  string
						cancel bool
					}{{query, false}, {query, true}, {"INSERT INTO organization_audit_events", false}} {
						catalogReadInterrupted(t, ctx, pool, owner, interrupt.query, 1, interrupt.cancel, func(request context.Context, traced *catalog.Service) (any, error) {
							data, err := write(request, &pricing.Service{Organization: traced.Organization}, user.ID)
							return data.ID != "" || data.Name != "", err
						}, true)
					}
					data, err := write(ctx, writer, user.ID)
					if err != nil || data.ID == "" || data.Status != step.status || data.Revision != current.Revision+1 {
						t.Fatalf("pricing write after rollback: id=%t status=%q revision=%d err=%v", data.ID != "", data.Status, data.Revision, err)
					}
					event, expectedAudits := step.action, 1
					if step.action == "create" || step.action == "update" {
						event = "saved"
						expectedAudits = 2 // Includes the separate read fixture of this resource.
						if step.action == "update" {
							expectedAudits++
						}
					}
					tx, _, err := organizations.Authorized(ctx, user.ID, org, "pricing.read")
					if err != nil {
						t.Fatal(err)
					}
					var audits int
					err = tx.QueryRow(ctx, "SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type=$2", org, "pricing."+resource.table+"."+event).Scan(&audits)
					tx.Rollback(ctx)
					if err != nil || audits != expectedAudits {
						t.Fatalf("interrupted pricing write left audit effects: count=%d want=%d err=%v", audits, expectedAudits, err)
					}
					if step.action == "create" {
						raw, err := writer.List(ctx, user.ID, org, resource.table, "")
						rows, valid := raw.([]pricing.Definition)
						matches := 0
						for _, row := range rows {
							if row.Name == input.Name {
								matches++
							}
						}
						if err != nil || !valid || matches != 1 {
							t.Fatalf("duplicate after interrupted creation: count=%d err=%v", matches, err)
						}
					}
					current = data
				}) {
					break
				}
			}
		}
	})
	t.Run("discount approval write authority", func(t *testing.T) {
		writer := &pricing.Service{Organization: organizations}
		point := &pos.Service{Organization: organizations}
		cart := seedPOSCustomerCart(t, ctx, organizations, point, user.ID, org)
		cart, err := point.UpdateCart(ctx, user.ID, org, cart.ID, "update", pos.CartInput{Revision: cart.Revision, Items: []pos.ItemInput{{VariantID: variant, Quantity: "1.000"}}})
		if err != nil {
			t.Fatal(err)
		}
		router := chi.NewRouter()
		organization.Handler{Service: organizations, Authentication: auth}.Routes(router, pricing.Handler{Service: writer}.TenantRoutes)
		primaryHTTP := func(t *testing.T, path, key string, payload any) {
			t.Helper()
			body, err := json.Marshal(payload)
			if err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodPost, "/organizations/"+org+"/discount-approvals"+path, bytes.NewReader(body))
			request.Header.Set("Origin", testsupport.MFAOrigin)
			request.Header.Set("X-CSRF-Token", primaryCSRF)
			request.Header.Set("Idempotency-Key", key)
			request.Header.Set("Content-Type", "application/json")
			request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: primaryToken})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden || !bytes.Contains(response.Body.Bytes(), []byte(`"MFA_REQUIRED"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
				t.Fatalf("primary approval HTTP denial: status=%d", response.Code)
			}
		}
		for index, action := range []string{"approve", "reject"} {
			t.Run(action, func(t *testing.T) {
				key := fmt.Sprintf("dfb30000-0000-4000-8000-%012d", index+1)
				input := pricing.ApprovalInput{CartID: cart.ID, Revision: cart.Revision, PricingRevision: cart.Pricing.Revision, Amount: "1.23", Reason: "Synthetic discount review"}
				send := func(c context.Context, service *pricing.Service) (json.RawMessage, error) {
					return service.RequestApproval(c, user.ID, org, key, input)
				}
				if data, err := send(primary, writer); data != nil || !errors.Is(err, identity.ErrMFARequired) {
					t.Fatalf("primary discount request: data=%t err=%v", data != nil, err)
				}
				primaryHTTP(t, "", key, input)
				interrupt := func(query string, cancel bool, run func(context.Context, *pricing.Service) (json.RawMessage, error)) {
					t.Helper()
					catalogReadInterrupted(t, ctx, pool, owner, query, 1, cancel, func(c context.Context, traced *catalog.Service) (any, error) {
						data, err := run(c, &pricing.Service{Organization: traced.Organization})
						return data != nil, err
					}, true)
				}
				interrupt("INSERT INTO discount_approvals(", false, send)
				interrupt("INSERT INTO organization_audit_events", true, send)
				var row struct {
					ID, Status, Amount string
					Revision           int64
				}
				requested, err := send(ctx, writer)
				if err != nil || json.Unmarshal(requested, &row) != nil || row.ID == "" || row.Status != "PENDING" || row.Amount != "1.23" {
					t.Fatalf("assured discount request: %v", err)
				}
				if data, err := send(primary, writer); data != nil || !errors.Is(err, identity.ErrMFARequired) {
					t.Fatalf("primary discount replay: data=%t err=%v", data != nil, err)
				}
				interrupt("SELECT to_jsonb(item)||jsonb_build_object('amount'", false, send)
				if replay, err := send(ctx, writer); err != nil || !bytes.Equal(replay, requested) {
					t.Fatalf("unchanged pending replay: %v", err)
				}
				decide := func(c context.Context, service *pricing.Service) (json.RawMessage, error) {
					return service.Decide(c, user.ID, org, row.ID, action, row.Revision)
				}
				if data, err := decide(primary, writer); data != nil || !errors.Is(err, identity.ErrMFARequired) {
					t.Fatalf("primary discount decision: data=%t err=%v", data != nil, err)
				}
				primaryHTTP(t, "/"+row.ID+"/"+action, "", map[string]int64{"revision": row.Revision})
				if data, err := writer.Decide(guest.Context, identity.SessionFromContext(guest.Context).User.ID, org, row.ID, action, row.Revision); data != nil || !errors.Is(err, organization.ErrNotFound) {
					t.Fatalf("nonmember discount decision: data=%t err=%v", data != nil, err)
				}
				interrupt("UPDATE discount_approvals SET status=", false, decide)
				interrupt("INSERT INTO organization_audit_events", true, decide)
				if replay, err := send(ctx, writer); err != nil || !bytes.Equal(replay, requested) {
					t.Fatalf("interrupted decision changed replay: %v", err)
				}
				data, err := decide(ctx, writer)
				want := map[string]string{"approve": "APPROVED", "reject": "REJECTED"}[action]
				previous := row.Revision
				if err != nil || json.Unmarshal(data, &row) != nil || row.Status != want || row.Revision != previous+1 {
					t.Fatalf("assured discount decision: status=%s revision=%d err=%v", row.Status, row.Revision, err)
				}
				if replay, err := send(ctx, writer); err != nil || !bytes.Equal(replay, data) {
					t.Fatalf("decided replay: %v", err)
				}
				tx, _, err := organizations.Authorized(ctx, user.ID, org, "discount.read")
				if err != nil {
					t.Fatal(err)
				}
				var audits int
				err = tx.QueryRow(ctx, "SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND object_id=$2 AND event_type IN ('pricing.discount.requested',$3)", org, row.ID, "pricing.discount."+action).Scan(&audits)
				tx.Rollback(ctx)
				if err != nil || audits != 2 {
					t.Fatalf("discount audit count: count=%d err=%v", audits, err)
				}
			})
		}
	})
	t.Run("loyalty write authority", func(t *testing.T) {
		writer := &loyalty.Service{Organization: organizations}
		program := loyalty.ProgramInput{Name: "Synthetic loyalty program", Spend: "1.00", EarnPoints: 1, PointValue: "0.01", Status: "ACTIVE"}
		sequence := 0
		nextKey := func() string {
			sequence++
			return fmt.Sprintf("dfb20000-0000-4000-8000-%012d", sequence)
		}
		readID := func(data json.RawMessage, err error) string {
			t.Helper()
			var row struct{ ID string }
			if err != nil || json.Unmarshal(data, &row) != nil || row.ID == "" {
				t.Fatalf("loyalty fixture: %v", err)
			}
			return row.ID
		}
		customer, err := (&customers.Service{Organization: organizations}).Save(ctx, user.ID, org, "", nextKey(), customers.Input{Code: "MFAREWARDS", Name: "Synthetic rewards customer"})
		if err != nil {
			t.Fatal(err)
		}
		programID := readID(writer.SaveProgram(ctx, user.ID, org, "", nextKey(), program))
		account := loyalty.AccountInput{CustomerID: customer.ID, ProgramID: programID, Status: "ACTIVE"}
		accountID := readID(writer.SaveAccount(ctx, user.ID, org, "", nextKey(), account))
		updateProgram := program
		updateProgram.Revision, updateProgram.Name = 1, "Synthetic renamed program"
		freshAccount := account
		secondCustomer, err := (&customers.Service{Organization: organizations}).Save(ctx, user.ID, org, "", nextKey(), customers.Input{Code: "MFAREWARDS2", Name: "Second synthetic rewards customer"})
		if err != nil {
			t.Fatal(err)
		}
		freshAccount.CustomerID = secondCustomer.ID
		createProgram := program
		createProgram.Name, createProgram.Status = "Synthetic program to create", "SUSPENDED"
		updateAccount := account
		updateAccount.Revision = 1
		adjust := loyalty.AdjustmentInput{Points: 1234, Reason: "Synthetic loyalty adjustment", BranchID: shop.BranchID}
		foreignBranch := adjust
		foreignBranch.BranchID = foreignShop.BranchID
		if data, err := writer.Adjust(ctx, user.ID, org, accountID, nextKey(), foreignBranch); data != nil || !errors.Is(err, inventory.ErrNotFound) {
			t.Fatalf("foreign branch adjustment: data=%t err=%v", data != nil, err)
		}
		router := chi.NewRouter()
		organization.Handler{Service: organizations, Authentication: auth}.Routes(router, loyalty.Handler{Service: writer}.TenantRoutes)
		for _, step := range []struct {
			method, path, query string
			input               any
			run                 func(context.Context, *loyalty.Service, string, string) (json.RawMessage, error)
		}{
			{http.MethodPost, "/programs", "INSERT INTO loyalty_programs(", createProgram, func(c context.Context, s *loyalty.Service, actor, key string) (json.RawMessage, error) {
				return s.SaveProgram(c, actor, org, "", key, createProgram)
			}},
			{http.MethodPut, "/programs/" + programID, "UPDATE loyalty_programs SET", updateProgram, func(c context.Context, s *loyalty.Service, actor, key string) (json.RawMessage, error) {
				return s.SaveProgram(c, actor, org, programID, key, updateProgram)
			}},
			{http.MethodPost, "/accounts", "INSERT INTO loyalty_accounts(", freshAccount, func(c context.Context, s *loyalty.Service, actor, key string) (json.RawMessage, error) {
				return s.SaveAccount(c, actor, org, "", key, freshAccount)
			}},
			{http.MethodPut, "/accounts/" + accountID, "UPDATE loyalty_accounts SET", updateAccount, func(c context.Context, s *loyalty.Service, actor, key string) (json.RawMessage, error) {
				return s.SaveAccount(c, actor, org, accountID, key, updateAccount)
			}},
			{http.MethodPost, "/accounts/" + accountID + "/adjust", "INSERT INTO loyalty_ledger(", adjust, func(c context.Context, s *loyalty.Service, actor, key string) (json.RawMessage, error) {
				return s.Adjust(c, actor, org, accountID, key, adjust)
			}},
		} {
			t.Run(step.method+" "+step.path, func(t *testing.T) {
				key := nextKey()
				checkDenied := func(c context.Context, actor string, want error) {
					t.Helper()
					if data, err := step.run(c, writer, actor, key); data != nil || !errors.Is(err, want) {
						t.Errorf("write denied: data=%t err=%v want=%v", data != nil, err, want)
					}
				}
				checkDenied(primary, user.ID, identity.ErrMFARequired)
				checkDenied(guest.Context, identity.SessionFromContext(guest.Context).User.ID, organization.ErrNotFound)
				body, err := json.Marshal(step.input)
				if err != nil {
					t.Fatal(err)
				}
				call := func(token, csrf string) *httptest.ResponseRecorder {
					req := httptest.NewRequest(step.method, "/organizations/"+org+"/loyalty"+step.path, bytes.NewReader(body))
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("Origin", testsupport.MFAOrigin)
					req.Header.Set("X-CSRF-Token", csrf)
					req.Header.Set("Idempotency-Key", key)
					req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: token})
					response := httptest.NewRecorder()
					router.ServeHTTP(response, req)
					return response
				}
				for _, interrupt := range []struct {
					query  string
					cancel bool
				}{{step.query, false}, {step.query, true}, {"INSERT INTO organization_audit_events", false}, {"UPDATE inventory_operations SET result=", true}} {
					catalogReadInterrupted(t, ctx, pool, owner, interrupt.query, 1, interrupt.cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						data, err := step.run(request, &loyalty.Service{Organization: traced.Organization}, user.ID, key)
						return len(data) != 0, err
					}, true)
				}
				tx, _, err := organizations.Authorized(ctx, user.ID, org, "loyalty.read")
				if err != nil {
					t.Fatal(err)
				}
				var operations int
				err = tx.QueryRow(ctx, "SELECT count(*) FROM inventory_operations WHERE organization_id=$1 AND actor_id=$2 AND idempotency_key=$3", org, user.ID, key).Scan(&operations)
				tx.Rollback(ctx)
				if err != nil || operations != 0 {
					t.Fatalf("interrupted command left replay operation: count=%d err=%v", operations, err)
				}
				data, err := step.run(ctx, writer, user.ID, key)
				if err != nil || !json.Valid(data) {
					t.Fatalf("assured write after rollback: %v", err)
				}
				if step.path == "/accounts/"+accountID+"/adjust" && !bytes.Contains(data, []byte(`"balance": "1234"`)) {
					t.Fatal("adjustment did not post the exact points once")
				}
				checkDenied(primary, user.ID, identity.ErrMFARequired)
				response := call(primaryToken, primaryCSRF)
				if response.Code != http.StatusForbidden || response.Header().Get("Cache-Control") != "no-store" || !bytes.Contains(response.Body.Bytes(), []byte(`"MFA_REQUIRED"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
					t.Fatalf("loyalty HTTP denial: status=%d", response.Code)
				}
				response = call(owner.Token, owner.CSRF)
				var replay struct{ Data json.RawMessage }
				var compact bytes.Buffer
				if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &replay) != nil || json.Compact(&compact, data) != nil || !bytes.Equal(replay.Data, compact.Bytes()) {
					t.Fatalf("loyalty HTTP exact replay: status=%d", response.Code)
				}
				catalogReadInterrupted(t, ctx, pool, owner, "SELECT id::text,fingerprint,result FROM inventory_operations", 1, false, func(request context.Context, traced *catalog.Service) (any, error) {
					data, err := step.run(request, &loyalty.Service{Organization: traced.Organization}, user.ID, key)
					return len(data) != 0, err
				}, true)
			})
		}
	})
	location := inventory.LocationInput{BranchID: shop.BranchID, Code: "MFA01", Name: "Synthetic location", Type: "WAREHOUSE"}
	reorder := inventory.ReorderInput{BranchID: shop.BranchID, VariantID: variant, Minimum: "1.000", Target: "7.000"}
	const key = "dfb10000-0000-4000-8000-000000000002"
	t.Run("tenant isolation", func(t *testing.T) {
		foreignActor := identity.SessionFromContext(guest.Context).User.ID
		if data, err := service.SaveLocation(guest.Context, foreignActor, org, "", location); data != nil || !errors.Is(err, organization.ErrNotFound) {
			t.Fatalf("nonmember location: data=%t err=%v", data != nil, err)
		}
		if data, err := service.SaveReorder(guest.Context, foreignActor, org, key, reorder); data != nil || !errors.Is(err, organization.ErrNotFound) {
			t.Fatalf("nonmember reorder: data=%t err=%v", data != nil, err)
		}
		if data, err := service.SaveLocation(ctx, user.ID, org, foreignShop.LocationID, location); data != nil || !errors.Is(err, inventory.ErrNotFound) {
			t.Fatalf("foreign location: data=%t err=%v", data != nil, err)
		}
		foreignReorder := reorder
		foreignReorder.BranchID = foreignShop.BranchID
		if data, err := service.SaveReorder(ctx, user.ID, org, key, foreignReorder); data != nil || !errors.Is(err, inventory.ErrNotFound) {
			t.Fatalf("foreign reorder branch: data=%t err=%v", data != nil, err)
		}
	})
	for _, caller := range []struct {
		name string
		ctx  context.Context
		want error
	}{
		{"no session", context.Background(), identity.ErrInvalidToken},
		{"primary only", primary, identity.ErrMFARequired},
		{"other actor", guest.Context, identity.ErrInvalidToken},
	} {
		t.Run(caller.name, func(t *testing.T) {
			if data, err := service.SaveLocation(caller.ctx, user.ID, org, "", location); data != nil || !errors.Is(err, caller.want) {
				t.Fatalf("location: data=%t err=%v", data != nil, err)
			}
			if data, err := service.SaveReorder(caller.ctx, user.ID, org, key, reorder); data != nil || !errors.Is(err, caller.want) {
				t.Fatalf("reorder: data=%t err=%v", data != nil, err)
			}
		})
	}
	for _, cancel := range []bool{false, true} {
		catalogReadInterrupted(t, ctx, pool, owner, "INSERT INTO organization_audit_events", 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
			data, err := (&inventory.Service{Organization: traced.Organization}).SaveLocation(request, user.ID, org, "", location)
			return len(data) != 0, err
		}, true)
		catalogReadInterrupted(t, ctx, pool, owner, "UPDATE inventory_operations SET result=", 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
			data, err := (&inventory.Service{Organization: traced.Organization}).SaveReorder(request, user.ID, org, key, reorder)
			return len(data) != 0, err
		}, true)
	}
	locationResult, err := service.SaveLocation(ctx, user.ID, org, "", location)
	if err != nil {
		t.Fatal(err)
	}
	var row struct {
		ID       string `json:"id"`
		Revision int64  `json:"revision"`
	}
	if err = json.Unmarshal(locationResult, &row); err != nil || row.ID == "" || row.Revision != 1 {
		t.Fatalf("location output: revision=%d err=%v", row.Revision, err)
	}
	location.Revision = row.Revision
	if data, err := service.SaveLocation(primary, user.ID, org, row.ID, location); data != nil || !errors.Is(err, identity.ErrMFARequired) {
		t.Fatalf("location update: data=%t err=%v", data != nil, err)
	}
	t.Run("competing location revisions", func(t *testing.T) {
		responses := make(chan error, 2)
		for _, name := range []string{"Synthetic west", "Synthetic east"} {
			input := location
			input.Name = name
			go func() {
				_, err := service.SaveLocation(ctx, user.ID, org, row.ID, input)
				responses <- err
			}()
		}
		var success, conflicts int
		for range 2 {
			switch err := <-responses; {
			case err == nil:
				success++
			case errors.Is(err, inventory.ErrConflict):
				conflicts++
			default:
				t.Fatal(err)
			}
		}
		if success != 1 || conflicts != 1 {
			t.Fatalf("location revisions: success=%d conflicts=%d", success, conflicts)
		}
	})
	result, err := service.SaveReorder(ctx, user.ID, org, key, reorder)
	var limits struct {
		Minimum string `json:"minimum_quantity"`
		Target  string `json:"target_quantity"`
	}
	if err != nil || json.Unmarshal(result, &limits) != nil || limits.Minimum != "1.000" || limits.Target != "7.000" {
		t.Fatalf("reorder result: err=%v", err)
	}
	if data, err := service.SaveReorder(primary, user.ID, org, key, reorder); data != nil || !errors.Is(err, identity.ErrMFARequired) {
		t.Fatalf("reorder denied replay: data=%t err=%v", data != nil, err)
	}
	if replay, err := service.SaveReorder(ctx, user.ID, org, key, reorder); err != nil || !bytes.Equal(result, replay) {
		t.Fatalf("reorder replay: err=%v", err)
	}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, inventory.Handler{Service: service}.TenantRoutes)
	for _, request := range []struct {
		method, path string
		input        any
	}{
		{http.MethodPost, "/locations", location},
		{http.MethodPatch, "/locations/" + row.ID, location},
		{http.MethodPut, "/reorder-points", reorder},
	} {
		t.Run(request.method+" "+request.path, func(t *testing.T) {
			body, err := json.Marshal(request.input)
			if err != nil {
				t.Fatal(err)
			}
			req := httptest.NewRequest(request.method, "/organizations/"+org+"/inventory"+request.path, bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Origin", testsupport.MFAOrigin)
			req.Header.Set("X-CSRF-Token", primaryCSRF)
			req.Header.Set("Idempotency-Key", key)
			req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: primaryToken})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			if response.Code != 403 || !bytes.Contains(response.Body.Bytes(), []byte(`"MFA_REQUIRED"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
				t.Fatalf("inventory settings HTTP denial: status=%d", response.Code)
			}
		})
	}
	reorder.Target = "8.000"
	if data, err := service.SaveReorder(ctx, user.ID, org, key, reorder); data != nil || !errors.Is(err, inventory.ErrConflict) {
		t.Fatalf("changed reorder replay: data=%t err=%v", data != nil, err)
	}
	tx, _, err := organizations.Authorized(ctx, user.ID, org, "inventory.read")
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var locations, reorderAudit, writes int
	if err = tx.QueryRow(ctx, `SELECT count(*) FILTER(WHERE event_type='inventory.location.saved'),count(*) FILTER(WHERE event_type='inventory.reorder.saved'),(SELECT count(*) FROM inventory_operations WHERE organization_id=$1 AND operation='reorder') FROM organization_audit_events WHERE organization_id=$1`, org).Scan(&locations, &reorderAudit, &writes); err != nil || locations != 2 || reorderAudit != 1 || writes != 1 {
		t.Fatalf("inventory effects: location audit=%d reorder audit=%d operations=%d err=%v", locations, reorderAudit, writes, err)
	}
	if err = tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	t.Run("opening balance authority", func(t *testing.T) {
		const openingKey = "dfb10000-0000-4000-8000-000000000003"
		input := inventory.Command{BranchID: shop.BranchID, LocationID: row.ID, ReasonCode: "SYNTHETIC_OPENING", Items: []inventory.Item{{VariantID: variant, Quantity: "4.000"}}}
		if data, err := service.Opening(primary, user.ID, org, openingKey, input); data != nil || !errors.Is(err, identity.ErrMFARequired) {
			t.Fatalf("opening denied: data=%t err=%v", data != nil, err)
		}
		foreign := identity.SessionFromContext(guest.Context).User.ID
		if data, err := service.Opening(guest.Context, foreign, org, openingKey, input); data != nil || !errors.Is(err, organization.ErrNotFound) {
			t.Fatalf("opening nonmember: data=%t err=%v", data != nil, err)
		}
		foreignInput := input
		foreignInput.LocationID = foreignShop.LocationID
		if data, err := service.Opening(ctx, user.ID, org, openingKey, foreignInput); data != nil || !errors.Is(err, inventory.ErrNotFound) {
			t.Fatalf("opening foreign location: data=%t err=%v", data != nil, err)
		}
		body, err := json.Marshal(input)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodPost, "/organizations/"+org+"/inventory/opening-balances", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", testsupport.MFAOrigin)
		req.Header.Set("X-CSRF-Token", primaryCSRF)
		req.Header.Set("Idempotency-Key", openingKey)
		req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: primaryToken})
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		if response.Code != http.StatusForbidden || !bytes.Contains(response.Body.Bytes(), []byte(`"MFA_REQUIRED"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
			t.Fatalf("opening HTTP denial: status=%d", response.Code)
		}
		for _, cancel := range []bool{false, true} {
			catalogReadInterrupted(t, ctx, pool, owner, "INSERT INTO stock_movements", 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
				data, err := (&inventory.Service{Organization: traced.Organization}).Opening(request, user.ID, org, openingKey, input)
				return len(data) != 0, err
			}, true)
		}
		posted, err := service.Opening(ctx, user.ID, org, openingKey, input)
		if err != nil || !bytes.Contains(posted, []byte(`"POSTED"`)) {
			t.Fatalf("opening post: err=%v", err)
		}
		if denied, err := service.Opening(primary, user.ID, org, openingKey, input); denied != nil || !errors.Is(err, identity.ErrMFARequired) {
			t.Fatalf("opening replay denied: data=%t err=%v", denied != nil, err)
		}
		var first, retry map[string]string
		replayed, err := service.Opening(ctx, user.ID, org, openingKey, input)
		if err != nil || json.Unmarshal(posted, &first) != nil || json.Unmarshal(replayed, &retry) != nil || first["id"] == "" || retry["id"] != first["id"] || retry["status"] != "POSTED" {
			t.Fatalf("opening replay: err=%v", err)
		}
		check, _, err := organizations.Authorized(ctx, user.ID, org, "inventory.read")
		if err != nil {
			t.Fatal(err)
		}
		defer check.Rollback(ctx)
		var balance string
		var movements, audit, operations int
		err = check.QueryRow(ctx, `SELECT quantity::text,
			(SELECT count(*) FROM stock_movements WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3),
			(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='inventory.opening.posted'),
			(SELECT count(*) FROM inventory_operations WHERE organization_id=$1 AND operation='opening')
			FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3`, org, row.ID, variant).Scan(&balance, &movements, &audit, &operations)
		if err != nil || balance != "4.000" || movements != 1 || audit != 1 || operations != 1 {
			t.Fatalf("opening effects: balance=%s movements=%d audit=%d operations=%d err=%v", balance, movements, audit, operations, err)
		}
	})
	t.Run("document creation authority", func(t *testing.T) {
		for _, fixture := range []struct{ kind, path, status string }{
			{"ADJUSTMENT", "adjustments", "DRAFT"}, {"COUNT", "counts", "IN_PROGRESS"}, {"TRANSFER", "transfers", "DRAFT"},
		} {
			t.Run(fixture.kind, func(t *testing.T) {
				const documentKey = "dfb10000-0000-4000-8000-000000000004"
				input := inventory.Command{BranchID: shop.BranchID, LocationID: row.ID, ReasonCode: "SYNTHETIC_DOCUMENT", Items: []inventory.Item{{VariantID: variant, Quantity: "2.000"}}}
				if fixture.kind == "ADJUSTMENT" {
					input.AdjustmentType = "CORRECTION"
				} else if fixture.kind == "TRANSFER" {
					branch, err := organizations.SaveBranch(ctx, user.ID, org, "", organization.BranchInput{Name: "Synthetic destination", Code: "MFADST"})
					if err != nil {
						t.Fatal(err)
					}
					location, err := service.SaveLocation(ctx, user.ID, org, "", inventory.LocationInput{BranchID: branch.ID, Code: "MFADST", Name: "Synthetic destination stock", Type: "WAREHOUSE"})
					var destination struct{ ID string }
					if err != nil || json.Unmarshal(location, &destination) != nil || destination.ID == "" {
						t.Fatalf("transfer destination: %v", err)
					}
					input.DestinationLocationID = &destination.ID
				}
				if data, err := service.CreateDocument(primary, user.ID, org, fixture.kind, documentKey, input); data != nil || !errors.Is(err, identity.ErrMFARequired) {
					t.Fatalf("document denied: data=%t err=%v", data != nil, err)
				}
				foreign := identity.SessionFromContext(guest.Context).User.ID
				if data, err := service.CreateDocument(guest.Context, foreign, org, fixture.kind, documentKey, input); data != nil || !errors.Is(err, organization.ErrNotFound) {
					t.Fatalf("document nonmember: data=%t err=%v", data != nil, err)
				}
				foreignInput := input
				if fixture.kind == "TRANSFER" {
					foreignInput.DestinationLocationID = &foreignShop.LocationID
				} else {
					foreignInput.LocationID = foreignShop.LocationID
				}
				if data, err := service.CreateDocument(ctx, user.ID, org, fixture.kind, documentKey, foreignInput); data != nil || !errors.Is(err, inventory.ErrNotFound) {
					t.Fatalf("document foreign location: data=%t err=%v", data != nil, err)
				}
				body, err := json.Marshal(input)
				if err != nil {
					t.Fatal(err)
				}
				request := httptest.NewRequest(http.MethodPost, "/organizations/"+org+"/inventory/"+fixture.path, bytes.NewReader(body))
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("Origin", testsupport.MFAOrigin)
				request.Header.Set("X-CSRF-Token", primaryCSRF)
				request.Header.Set("Idempotency-Key", documentKey)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: primaryToken})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				if response.Code != http.StatusForbidden || !bytes.Contains(response.Body.Bytes(), []byte(`"MFA_REQUIRED"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
					t.Fatalf("document HTTP denial: status=%d", response.Code)
				}
				for _, cancel := range []bool{false, true} {
					catalogReadInterrupted(t, ctx, pool, owner, "INSERT INTO inventory_document_items", 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						data, err := (&inventory.Service{Organization: traced.Organization}).CreateDocument(request, user.ID, org, fixture.kind, documentKey, input)
						return len(data) != 0, err
					}, true)
				}
				created, err := service.CreateDocument(ctx, user.ID, org, fixture.kind, documentKey, input)
				var document struct{ ID, Status string }
				if err != nil || json.Unmarshal(created, &document) != nil || document.ID == "" || document.Status != fixture.status {
					t.Fatalf("document create: status=%s err=%v", document.Status, err)
				}
				actions := map[string][]string{
					"ADJUSTMENT": {"submit", "approve", "post", "reject", "cancel"},
					"COUNT":      {"submit", "approve", "post", "cancel"},
					"TRANSFER":   {"submit", "approve", "dispatch", "receive", "cancel"},
				}
				for _, action := range actions[fixture.kind] {
					t.Run("HTTP primary "+action, func(t *testing.T) {
						request := httptest.NewRequest(http.MethodPost, "/organizations/"+org+"/inventory/"+fixture.path+"/"+document.ID+"/"+action, bytes.NewBufferString(`{"revision":1}`))
						request.Header.Set("Content-Type", "application/json")
						request.Header.Set("Origin", testsupport.MFAOrigin)
						request.Header.Set("X-CSRF-Token", primaryCSRF)
						request.Header.Set("Idempotency-Key", documentKey)
						request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: primaryToken})
						response := httptest.NewRecorder()
						router.ServeHTTP(response, request)
						if response.Code != http.StatusForbidden || !bytes.Contains(response.Body.Bytes(), []byte(`"MFA_REQUIRED"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
							t.Fatalf("transition HTTP denial: status=%d", response.Code)
						}
					})
				}
				if data, err := service.CreateDocument(primary, user.ID, org, fixture.kind, documentKey, input); data != nil || !errors.Is(err, identity.ErrMFARequired) {
					t.Fatalf("document replay denied: data=%t err=%v", data != nil, err)
				}
				replay, err := service.CreateDocument(ctx, user.ID, org, fixture.kind, documentKey, input)
				var saved struct{ ID, Status string }
				if err != nil || json.Unmarshal(replay, &saved) != nil || saved != document {
					t.Fatalf("document replay: err=%v", err)
				}
				if fixture.kind == "COUNT" {
					t.Run("save count authority", func(t *testing.T) {
						const key = "dfb10000-0000-4000-8000-000000000005"
						counted := "6.000"
						input := inventory.Command{Revision: 1, Items: []inventory.Item{{VariantID: variant, CountedQuantity: &counted}}}
						if data, err := service.SaveCount(primary, user.ID, org, document.ID, key, input); data != nil || !errors.Is(err, identity.ErrMFARequired) {
							t.Fatalf("save count without assurance: data=%t err=%v", data != nil, err)
						}
						foreign := identity.SessionFromContext(guest.Context).User.ID
						if data, err := service.SaveCount(guest.Context, foreign, org, document.ID, key, input); data != nil || !errors.Is(err, organization.ErrNotFound) {
							t.Fatalf("save count by nonmember: data=%t err=%v", data != nil, err)
						}
						body, err := json.Marshal(input)
						if err != nil {
							t.Fatal(err)
						}
						request := httptest.NewRequest(http.MethodPatch, "/organizations/"+org+"/inventory/counts/"+document.ID+"/items", bytes.NewReader(body))
						request.Header.Set("Content-Type", "application/json")
						request.Header.Set("Origin", testsupport.MFAOrigin)
						request.Header.Set("X-CSRF-Token", primaryCSRF)
						request.Header.Set("Idempotency-Key", key)
						request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: primaryToken})
						response := httptest.NewRecorder()
						router.ServeHTTP(response, request)
						if response.Code != http.StatusForbidden || !bytes.Contains(response.Body.Bytes(), []byte(`"MFA_REQUIRED"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
							t.Fatalf("save count HTTP denial: status=%d", response.Code)
						}
						for _, cancel := range []bool{false, true} {
							catalogReadInterrupted(t, ctx, pool, owner, "UPDATE inventory_document_items SET counted_quantity", 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
								data, err := (&inventory.Service{Organization: traced.Organization}).SaveCount(request, user.ID, org, document.ID, key, input)
								return len(data) != 0, err
							}, true)
						}
						data, err := service.SaveCount(ctx, user.ID, org, document.ID, key, input)
						var result struct {
							Revision int64
							Items    []struct {
								Counted string `json:"counted_quantity"`
							}
						}
						if err != nil || json.Unmarshal(data, &result) != nil || result.Revision != 2 || len(result.Items) != 1 || result.Items[0].Counted != counted {
							t.Fatalf("save count: revision=%d err=%v", result.Revision, err)
						}
						if retry, err := service.SaveCount(ctx, user.ID, org, document.ID, key, input); err != nil || !bytes.Equal(data, retry) {
							t.Fatalf("save count replay: err=%v", err)
						}
						if denied, err := service.SaveCount(primary, user.ID, org, document.ID, key, input); denied != nil || !errors.Is(err, identity.ErrMFARequired) {
							t.Fatalf("save count replay without assurance: data=%t err=%v", denied != nil, err)
						}
						if stale, err := service.SaveCount(ctx, user.ID, org, document.ID, "dfb10000-0000-4000-8000-000000000006", input); stale != nil || !errors.Is(err, inventory.ErrConflict) {
							t.Fatalf("save count stale revision: data=%t err=%v", stale != nil, err)
						}
						check, _, err := organizations.Authorized(ctx, user.ID, org, "inventory.read")
						if err != nil {
							t.Fatal(err)
						}
						defer check.Rollback(ctx)
						var audits, operations int
						err = check.QueryRow(ctx, `SELECT (SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND object_id=$2 AND event_type='inventory.count.saved'), (SELECT count(*) FROM inventory_operations WHERE organization_id=$1 AND operation=$3)`, org, document.ID, "count:items:"+document.ID).Scan(&audits, &operations)
						if err != nil || audits != 1 || operations != 1 {
							t.Fatalf("save count effects: audit=%d operations=%d err=%v", audits, operations, err)
						}
					})
				}
				if fixture.kind == "COUNT" {
					t.Run("count posting authority", func(t *testing.T) {
						for index, action := range []string{"submit", "approve"} {
							key := fmt.Sprintf("dfb10000-0000-4000-8000-%012d", 11+index)
							if _, err := service.Act(ctx, user.ID, org, fixture.kind, document.ID, action, key, inventory.Command{Revision: int64(2 + index)}); err != nil {
								t.Fatalf("count %s: %v", action, err)
							}
						}
						const key = "dfb10000-0000-4000-8000-000000000013"
						command := inventory.Command{Revision: 4}
						for _, cancel := range []bool{false, true} {
							catalogReadInterrupted(t, ctx, pool, owner, "INSERT INTO stock_movements", 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
								data, err := (&inventory.Service{Organization: traced.Organization}).Act(request, user.ID, org, fixture.kind, document.ID, "post", key, command)
								return len(data) != 0, err
							}, true)
						}
						posted, err := service.Act(ctx, user.ID, org, fixture.kind, document.ID, "post", key, command)
						if err != nil || !bytes.Contains(posted, []byte(`"POSTED"`)) {
							t.Fatalf("post count: %v", err)
						}
						if data, err := service.Act(primary, user.ID, org, fixture.kind, document.ID, "post", key, command); data != nil || !errors.Is(err, identity.ErrMFARequired) {
							t.Fatalf("post replay denial: data=%t err=%v", data != nil, err)
						}
						if data, err := service.Act(guest.Context, foreign, org, fixture.kind, document.ID, "post", key, command); data != nil || !errors.Is(err, organization.ErrNotFound) {
							t.Fatalf("post replay nonmember: data=%t err=%v", data != nil, err)
						}
						if replay, err := service.Act(ctx, user.ID, org, fixture.kind, document.ID, "post", key, command); err != nil || !bytes.Equal(replay, posted) {
							t.Fatalf("post replay: %v", err)
						}
						check, _, err := organizations.Authorized(ctx, user.ID, org, "inventory.read")
						if err != nil {
							t.Fatal(err)
						}
						defer check.Rollback(ctx)
						var balance string
						var moves, audits int
						err = check.QueryRow(ctx, `SELECT quantity::text,
							(SELECT count(*) FROM stock_movements WHERE organization_id=$1 AND document_id=$4 AND movement_type='COUNT_CORRECTION'),
							(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND object_id=$4 AND event_type='inventory.count.post')
							FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3`, org, row.ID, variant, document.ID).Scan(&balance, &moves, &audits)
						if err != nil || balance != "6.000" || moves != 1 || audits != 1 {
							t.Fatalf("count effects: balance=%s movements=%d audits=%d err=%v", balance, moves, audits, err)
						}
					})
				}
				if fixture.kind == "TRANSFER" {
					t.Run("transfer dispatch and receipt authority", func(t *testing.T) {
						const beforeDispatch = 3
						for index, action := range []string{"submit", "approve"} {
							key := fmt.Sprintf("dfb10000-0000-4000-8000-%012d", 7+index)
							if _, err := service.Act(ctx, user.ID, org, fixture.kind, document.ID, action, key, inventory.Command{Revision: int64(index + 1)}); err != nil {
								t.Fatalf("transfer %s: %v", action, err)
							}
						}
						const key = "dfb10000-0000-4000-8000-000000000009"
						command := inventory.Command{Revision: beforeDispatch}
						if data, err := service.Act(primary, user.ID, org, fixture.kind, document.ID, "dispatch", key, command); data != nil || !errors.Is(err, identity.ErrMFARequired) {
							t.Fatalf("dispatch denial: data=%t err=%v", data != nil, err)
						}
						for _, cancel := range []bool{false, true} {
							catalogReadInterrupted(t, ctx, pool, owner, "INSERT INTO stock_movements", 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
								data, err := (&inventory.Service{Organization: traced.Organization}).Act(request, user.ID, org, fixture.kind, document.ID, "dispatch", key, command)
								return len(data) != 0, err
							}, true)
						}
						posted, err := service.Act(ctx, user.ID, org, fixture.kind, document.ID, "dispatch", key, command)
						var detail struct {
							Status   string
							Revision int64
						}
						if err != nil || json.Unmarshal(posted, &detail) != nil || detail.Status != "DISPATCHED" || detail.Revision != 4 {
							t.Fatalf("dispatch: status=%s revision=%d err=%v", detail.Status, detail.Revision, err)
						}
						if replay, err := service.Act(ctx, user.ID, org, fixture.kind, document.ID, "dispatch", key, command); err != nil || !bytes.Equal(posted, replay) {
							t.Fatalf("dispatch replay: %v", err)
						}
						const receiveKey = "dfb10000-0000-4000-8000-000000000010"
						for _, cancel := range []bool{false, true} {
							catalogReadInterrupted(t, ctx, pool, owner, "INSERT INTO stock_movements", 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
								data, err := (&inventory.Service{Organization: traced.Organization}).Act(request, user.ID, org, fixture.kind, document.ID, "receive", receiveKey, inventory.Command{Revision: 4})
								return len(data) != 0, err
							}, true)
						}
						received, err := service.Act(ctx, user.ID, org, fixture.kind, document.ID, "receive", receiveKey, inventory.Command{Revision: 4})
						if err != nil || json.Unmarshal(received, &detail) != nil || detail.Status != "RECEIVED" || detail.Revision != 5 {
							t.Fatalf("receive: status=%s revision=%d err=%v", detail.Status, detail.Revision, err)
						}
						check, _, err := organizations.Authorized(ctx, user.ID, org, "inventory.read")
						if err != nil {
							t.Fatal(err)
						}
						defer check.Rollback(ctx)
						var sourceBalance, destinationBalance string
						var moves, audits int
						err = check.QueryRow(ctx, `SELECT quantity::text,
							(SELECT count(*) FROM stock_movements WHERE organization_id=$1 AND document_id=$4),
							(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND object_id=$4 AND event_type IN ('inventory.transfer.dispatch','inventory.transfer.receive')),
							(SELECT quantity::text FROM stock_balances WHERE organization_id=$1 AND location_id=$5 AND variant_id=$3)
							FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3`, org, row.ID, variant, document.ID, *input.DestinationLocationID).Scan(&sourceBalance, &moves, &audits, &destinationBalance)
						if err != nil || sourceBalance != "4.000" || destinationBalance != "2.000" || moves != 4 || audits != 2 {
							t.Fatalf("transfer effects: source=%s destination=%s moves=%d audits=%d err=%v", sourceBalance, destinationBalance, moves, audits, err)
						}
					})
				}
			})
		}
		check, _, err := organizations.Authorized(ctx, user.ID, org, "inventory.read")
		if err != nil {
			t.Fatal(err)
		}
		defer check.Rollback(ctx)
		var documents, items, audits, operations int
		err = check.QueryRow(ctx, `SELECT
			(SELECT count(*) FROM inventory_documents WHERE organization_id=$1 AND reason_code <> 'SHELF_REPLENISHMENT'),
			(SELECT count(*) FROM inventory_document_items item JOIN inventory_documents doc ON doc.organization_id=item.organization_id AND doc.id=item.document_id WHERE item.organization_id=$1 AND doc.reason_code <> 'SHELF_REPLENISHMENT'),
			(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type IN ('inventory.adjustment.created','inventory.count.created','inventory.transfer.created')),
			(SELECT count(*) FROM inventory_operations WHERE organization_id=$1 AND operation IN ('create:ADJUSTMENT','create:COUNT','create:TRANSFER'))`, org).Scan(&documents, &items, &audits, &operations)
		if err != nil || documents != 3 || items != 3 || audits != 3 || operations != 3 {
			t.Fatalf("document effects: documents=%d items=%d audits=%d operations=%d err=%v", documents, items, audits, operations, err)
		}
	})
	t.Run("batch and recall authority", func(t *testing.T) {
		batch := inventory.BatchInput{VariantID: variant, LotNumber: "MFA-LOT", Reason: "Synthetic inventory check"}
		var lot struct {
			ID       string
			Revision int64
		}
		for index, name := range []string{"create batch", "update batch", "recall batch"} {
			t.Run(name, func(t *testing.T) {
				key := fmt.Sprintf("dfb10000-0000-4000-8000-%012d", 14+index)
				method, path, query := http.MethodPost, "/quality/batches", "INSERT INTO product_batches"
				id := ""
				if index == 1 {
					id = lot.ID
					batch.Revision, batch.Status = 1, "QUARANTINED"
					method, path, query = http.MethodPut, path+"/"+id, "UPDATE product_batches"
				}
				recall := inventory.RecallInput{VariantID: variant, BatchID: &lot.ID, Reason: "Synthetic recall"}
				var input any = batch
				if index == 2 {
					input, path, query = recall, "/quality/recalls", "INSERT INTO quality_recalls"
				}
				run := func(request context.Context, service *inventory.Service, actor string) (json.RawMessage, error) {
					if index == 2 {
						return service.CreateRecall(request, actor, org, key, recall)
					}
					return service.SaveBatch(request, actor, org, id, key, batch)
				}
				if data, err := run(primary, service, user.ID); data != nil || !errors.Is(err, identity.ErrMFARequired) {
					t.Fatalf("quality denial: data=%t err=%v", data != nil, err)
				}
				foreign := identity.SessionFromContext(guest.Context).User.ID
				if data, err := run(guest.Context, service, foreign); data != nil || !errors.Is(err, organization.ErrNotFound) {
					t.Fatalf("quality nonmember: data=%t err=%v", data != nil, err)
				}
				body, err := json.Marshal(input)
				if err != nil {
					t.Fatal(err)
				}
				request := httptest.NewRequest(method, "/organizations/"+org+path, bytes.NewReader(body))
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("Origin", testsupport.MFAOrigin)
				request.Header.Set("X-CSRF-Token", primaryCSRF)
				request.Header.Set("Idempotency-Key", key)
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: primaryToken})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)
				if response.Code != http.StatusForbidden || !bytes.Contains(response.Body.Bytes(), []byte(`"MFA_REQUIRED"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
					t.Fatalf("quality HTTP denial: %d", response.Code)
				}
				for _, cancel := range []bool{false, true} {
					catalogReadInterrupted(t, ctx, pool, owner, query, 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						data, err := run(request, &inventory.Service{Organization: traced.Organization}, user.ID)
						return len(data) != 0, err
					}, true)
				}
				data, err := run(ctx, service, user.ID)
				if err != nil || len(data) == 0 {
					t.Fatalf("quality write: %v", err)
				}
				if replay, err := run(ctx, service, user.ID); err != nil || !bytes.Equal(data, replay) {
					t.Fatalf("quality replay: %v", err)
				}
				if denied, err := run(primary, service, user.ID); denied != nil || !errors.Is(err, identity.ErrMFARequired) {
					t.Fatalf("quality replay denial: data=%t err=%v", denied != nil, err)
				}
				if index < 2 {
					if err := json.Unmarshal(data, &lot); err != nil || lot.ID == "" || lot.Revision != int64(index+1) {
						t.Fatalf("batch revision=%d err=%v", lot.Revision, err)
					}
				}
			})
		}
		check, _, err := organizations.Authorized(ctx, user.ID, org, "quality.read")
		if err != nil {
			t.Fatal(err)
		}
		defer check.Rollback(ctx)
		var batches, recalls, audits, operations int
		err = check.QueryRow(ctx, `SELECT
			(SELECT count(*) FROM product_batches WHERE organization_id=$1),
			(SELECT count(*) FROM quality_recalls WHERE organization_id=$1 AND batch_id=$2),
			(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type IN ('quality.batch.saved','quality.recall.activated')),
			(SELECT count(*) FROM inventory_operations WHERE organization_id=$1 AND operation IN ('quality.batch.','quality.batch.'||$2::uuid::text,'quality.recall'))`, org, lot.ID).Scan(&batches, &recalls, &audits, &operations)
		if err != nil || batches != 1 || recalls != 1 || audits != 3 || operations != 3 {
			t.Fatalf("quality effects: batches=%d recalls=%d audits=%d operations=%d err=%v", batches, recalls, audits, operations, err)
		}
	})
	t.Run("write-off authority", func(t *testing.T) {
		input := inventory.WriteOffInput{LocationID: row.ID, VariantID: variant, Quantity: "1.000", Reason: "Synthetic write-off"}
		type result struct {
			ID, Status, Quantity string
			Revision             int64
		}
		var approved, rejected result
		for index, step := range []struct {
			action, query, status string
			revision              int64
		}{
			{"", "INSERT INTO quality_write_offs", "PENDING_APPROVAL", 1},
			{"approve", "UPDATE quality_write_offs SET status=", "APPROVED", 2},
			{"post", "INSERT INTO stock_movements", "POSTED", 3},
			{"", "INSERT INTO quality_write_offs", "PENDING_APPROVAL", 1},
			{"reject", "UPDATE quality_write_offs SET status=", "REJECTED", 2},
		} {
			key := fmt.Sprintf("dfb10000-0000-4000-8000-%012d", 17+index)
			record := &approved
			if index >= 3 {
				record = &rejected
			}
			id := record.ID
			path := "/quality/write-offs"
			var body any = input
			if step.action != "" {
				path += "/" + id + "/" + step.action
				body = map[string]int64{"revision": step.revision - 1}
			}
			run := func(request context.Context, service *inventory.Service, actor string) (json.RawMessage, error) {
				if step.action == "" {
					return service.RequestWriteOff(request, actor, org, key, input)
				}
				return service.ChangeWriteOff(request, actor, org, id, step.action, key, step.revision-1)
			}
			if data, err := run(primary, service, user.ID); data != nil || !errors.Is(err, identity.ErrMFARequired) {
				t.Fatalf("write-off %s denial: data=%t err=%v", step.action, data != nil, err)
			}
			foreign := identity.SessionFromContext(guest.Context).User.ID
			if data, err := run(guest.Context, service, foreign); data != nil || !errors.Is(err, organization.ErrNotFound) {
				t.Fatalf("write-off %s nonmember: data=%t err=%v", step.action, data != nil, err)
			}
			encoded, err := json.Marshal(body)
			if err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodPost, "/organizations/"+org+path, bytes.NewReader(encoded))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Origin", testsupport.MFAOrigin)
			request.Header.Set("X-CSRF-Token", primaryCSRF)
			request.Header.Set("Idempotency-Key", key)
			request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: primaryToken})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden || !bytes.Contains(response.Body.Bytes(), []byte(`"MFA_REQUIRED"`)) || bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
				t.Fatalf("write-off %s HTTP denial: %d", step.action, response.Code)
			}
			if index != 3 {
				for _, cancel := range []bool{false, true} {
					catalogReadInterrupted(t, ctx, pool, owner, step.query, 1, cancel, func(request context.Context, traced *catalog.Service) (any, error) {
						data, err := run(request, &inventory.Service{Organization: traced.Organization}, user.ID)
						if err != nil && !errors.Is(err, identity.ErrInvalidToken) && !errors.Is(err, context.Canceled) {
							t.Logf("write-off %q before interruption: %v", step.action, err)
						}
						return len(data) != 0, err
					}, true)
				}
			}
			data, err := run(ctx, service, user.ID)
			if err != nil || json.Unmarshal(data, record) != nil || record.ID == "" || (id != "" && id != record.ID) || record.Status != step.status || record.Revision != step.revision || record.Quantity != input.Quantity {
				t.Fatalf("write-off %s result: status=%s revision=%d err=%v", step.action, record.Status, record.Revision, err)
			}
			if replay, err := run(ctx, service, user.ID); err != nil || !bytes.Equal(data, replay) {
				t.Fatalf("write-off %s replay: %v", step.action, err)
			}
			if denied, err := run(primary, service, user.ID); denied != nil || !errors.Is(err, identity.ErrMFARequired) {
				t.Fatalf("write-off %s replay denial: data=%t err=%v", step.action, denied != nil, err)
			}
		}
		check, _, err := organizations.Authorized(ctx, user.ID, org, "quality.read")
		if err != nil {
			t.Fatal(err)
		}
		defer check.Rollback(ctx)
		var balance, delta string
		var docs, moves, audits, operations int
		err = check.QueryRow(ctx, `SELECT quantity::text,
			(SELECT count(*) FROM quality_write_offs WHERE organization_id=$1),
			(SELECT count(*) FROM stock_movements WHERE organization_id=$1 AND quality_write_off_id IS NOT NULL),
			(SELECT quantity_delta::text FROM stock_movements WHERE organization_id=$1 AND quality_write_off_id=$4),
			(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type LIKE 'quality.write_off.%'),
			(SELECT count(*) FROM inventory_operations WHERE organization_id=$1 AND operation LIKE 'quality.write_off.%')
			FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3`, org, row.ID, variant, approved.ID).Scan(&balance, &docs, &moves, &delta, &audits, &operations)
		if err != nil || balance != "3.000" || docs != 2 || moves != 1 || delta != "-1.000" || audits != 5 || operations != 5 {
			t.Fatalf("write-off effects: balance=%s delta=%s documents=%d movements=%d audits=%d operations=%d err=%v", balance, delta, docs, moves, audits, operations, err)
		}
	})
	purchasingReadPaths := func(t *testing.T, handler purchasing.Handler, order string) []string {
		t.Helper()
		routes := chi.NewRouter()
		handler.TenantRoutes(routes)
		var reads []string
		if err := chi.Walk(routes, func(method, path string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
			if method == http.MethodGet {
				reads = append(reads, strings.ReplaceAll(path, "{resourceId}", order))
			}
			return nil
		}); err != nil || len(reads) != 19 {
			t.Fatalf("purchasing read routes: count=%d err=%v", len(reads), err)
		}
		return append(reads, "/purchasing/orders?branch_id="+shop.BranchID)
	}
	t.Run("legacy branch assignment does not confer purchasing access", func(t *testing.T) {
		staff := identity.SessionFromContext(guest.Context).User.ID
		tx, _, err := organizations.Authorized(ctx, user.ID, org, "purchasing.read")
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var membership, order string
		if err := tx.QueryRow(ctx, `INSERT INTO organization_memberships(organization_id,user_id,role) VALUES($1,$2,'PURCHASING_STAFF') RETURNING id::text`, org, staff).Scan(&membership); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO branch_memberships(organization_id,membership_id,branch_id) VALUES($1,$2,$3)`, org, membership, shop.BranchID); err != nil {
			t.Fatal(err)
		}
		if err := tx.QueryRow(ctx, `SELECT id::text FROM purchasing_documents WHERE organization_id=$1 AND branch_id=$2 AND kind='ORDER' AND status='RECEIVED' ORDER BY id LIMIT 1`, org, shop.BranchID).Scan(&order); err != nil {
			t.Fatal(err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		router := chi.NewRouter()
		handler := purchasing.Handler{Service: &purchasing.Service{Organization: organizations}}
		organization.Handler{Service: organizations, Authentication: auth}.Routes(router, handler.TenantRoutes)
		reads := purchasingReadPaths(t, handler, order)
		for _, role := range []string{"PURCHASING_STAFF", "MANAGER", "CASHIER", "INVENTORY_STAFF"} {
			t.Run(role, func(t *testing.T) {
				tx, _, err := organizations.Authorized(ctx, user.ID, org, "purchasing.read")
				if err != nil {
					t.Fatal(err)
				}
				defer tx.Rollback(ctx)
				changed, err := tx.Exec(ctx, `UPDATE organization_memberships SET role=$3 WHERE organization_id=$1 AND id=$2`, org, membership, role)
				if err != nil || changed.RowsAffected() != 1 {
					t.Fatalf("set synthetic staff role: rows=%d err=%v", changed.RowsAffected(), err)
				}
				if err := tx.Commit(ctx); err != nil {
					t.Fatal(err)
				}
				for _, path := range reads {
					t.Run("GET "+path, func(t *testing.T) {
						req := httptest.NewRequest(http.MethodGet, "/organizations/"+org+path, nil)
						req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: guest.Token})
						response := httptest.NewRecorder()
						router.ServeHTTP(response, req)
						var body struct {
							Data  json.RawMessage
							Error struct{ Code string }
						}
						if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || response.Code != http.StatusForbidden || body.Error.Code != "FORBIDDEN" || len(body.Data) != 0 || response.Header().Get("Cache-Control") != "no-store" {
							t.Fatalf("status=%d code=%q data=%t cache=%q decode=%v", response.Code, body.Error.Code, len(body.Data) != 0, response.Header().Get("Cache-Control"), err)
						}
					})
				}
				verifyPurchasingWriteDenials(t, auth, organizations, org,
					purchasingWriteActor{"mfa_staff", guest.Token, guest.CSRF, "FORBIDDEN", http.StatusForbidden, true})
			})
		}
	})
	t.Run("purchasing order reads and replay deny a logged-out Owner", func(t *testing.T) {
		reader := &purchasing.Service{Organization: organizations}
		router := chi.NewRouter()
		handler := purchasing.Handler{Service: reader}
		organization.Handler{Service: organizations, Authentication: auth}.Routes(router, handler.TenantRoutes)
		get := func(path string) *httptest.ResponseRecorder {
			req := httptest.NewRequest(http.MethodGet, "/organizations/"+org+path, nil)
			req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			return response
		}
		const list = "orders"
		response := get("/purchasing/" + list)
		var before struct{ Data purchasing.Page }
		if err := json.Unmarshal(response.Body.Bytes(), &before); err != nil || response.Code != http.StatusOK || len(before.Data.Items) == 0 {
			t.Fatalf("live Owner order list: status=%d items=%d decode=%v", response.Code, len(before.Data.Items), err)
		}
		var order struct{ ID string }
		if err := json.Unmarshal(before.Data.Items[0], &order); err != nil || order.ID == "" {
			t.Fatalf("live Owner order ID missing: %v", err)
		}
		detail := "/purchasing/" + list + "/" + order.ID
		if response := get(detail); response.Code != http.StatusOK {
			t.Fatalf("live Owner order detail: status=%d", response.Code)
		}
		payload, err := json.Marshal(orderCreateInput)
		if err != nil {
			t.Fatal(err)
		}
		replay := func() *httptest.ResponseRecorder {
			req := httptest.NewRequest(http.MethodPost, "/organizations/"+org+"/purchasing/orders", bytes.NewReader(payload))
			req.Header.Set("Origin", testsupport.MFAOrigin)
			req.Header.Set("X-CSRF-Token", owner.CSRF)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Idempotency-Key", orderCreateKey)
			req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: owner.Token})
			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			return response
		}
		if response := replay(); response.Code != http.StatusCreated || !bytes.Contains(response.Body.Bytes(), []byte(`"data"`)) {
			t.Fatalf("live Owner create replay: status=%d", response.Code)
		}
		snapshot := func() [3]int {
			t.Helper()
			tx, _, err := organizations.Authorized(ctx, user.ID, org, "purchasing.read")
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			var counts [3]int
			if err = tx.QueryRow(ctx, `SELECT
				(SELECT count(*) FROM purchasing_documents WHERE organization_id=$1),
				(SELECT count(*) FROM inventory_operations WHERE organization_id=$1),
				(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1)`, org).Scan(&counts[0], &counts[1], &counts[2]); err != nil {
				t.Fatal(err)
			}
			return counts
		}
		counts := snapshot()
		if err := auth.Service.Logout(ctx, owner.Token, user.ID); err != nil {
			t.Fatal(err)
		}
		checkLoggedOut := func(t *testing.T, response *httptest.ResponseRecorder) {
			t.Helper()
			var body struct {
				Data  json.RawMessage
				Error struct{ Code string }
			}
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || response.Code != http.StatusUnauthorized || body.Error.Code != "UNAUTHENTICATED" || len(body.Data) != 0 {
				t.Errorf("logged-out Owner: status=%d code=%q data=%t decode=%v", response.Code, body.Error.Code, len(body.Data) != 0, err)
			}
		}
		for _, path := range purchasingReadPaths(t, handler, order.ID) {
			t.Run("revoked_owner/GET "+path, func(t *testing.T) {
				checkLoggedOut(t, get(path))
			})
		}
		t.Run("revoked_owner/order create replay", func(t *testing.T) {
			checkLoggedOut(t, replay())
		})
		page, err := reader.List(ctx, user.ID, org, list, purchasing.Filter{Page: 1, Size: 20})
		if !errors.Is(err, identity.ErrInvalidToken) || page.Items != nil || page.Total != 0 || page.Page != 0 || page.PageSize != 0 {
			t.Fatalf("stale service context returned order list data or unexpected error: %v", err)
		}
		if data, err := reader.Get(ctx, user.ID, org, list, order.ID); !errors.Is(err, identity.ErrInvalidToken) || len(data) != 0 {
			t.Fatalf("stale service context returned order detail data or unexpected error: %v", err)
		}
		if data, err := reader.SaveDocument(ctx, user.ID, org, "ORDER", "", orderCreateKey, orderCreateInput); !errors.Is(err, identity.ErrInvalidToken) || len(data) != 0 {
			t.Fatalf("stale service context returned order replay data or unexpected error: %v", err)
		}
		verifyPurchasingWriteDenials(t, auth, organizations, org,
			purchasingWriteActor{"revoked_owner", owner.Token, owner.CSRF, "UNAUTHENTICATED", http.StatusUnauthorized, false},
		)
		if after := snapshot(); after != counts {
			t.Fatalf("denied replay changed document, operation or audit counts: before=%v after=%v", counts, after)
		}
	})
}
