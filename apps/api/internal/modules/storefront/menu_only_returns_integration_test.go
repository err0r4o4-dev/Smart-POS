package storefront_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/returns"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/testsupport"
)

func refundLogoutOrdering(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, session testsupport.MFASession, owner, prefix string, cancelBeforeRelease bool, run func(context.Context, *returns.Service) (json.RawMessage, error)) (json.RawMessage, error) {
	t.Helper()
	request, cancel := context.WithTimeout(ctx, 8*time.Second)
	trace := &privateReadTrace{prefix: prefix, remaining: 1, arrived: make(chan struct{}), release: make(chan struct{})}
	config := pool.Config()
	config.MaxConns = 1
	config.MinConns = 0
	config.ConnConfig.RuntimeParams["application_name"] = "smartpos-test-refund-logout"
	config.ConnConfig.Tracer = &catalogMutationEndTrace{trace: trace}
	tracedPool, err := pgxpool.NewWithConfig(request, config)
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	defer tracedPool.Close()
	defer cancel()
	traced := &returns.Service{Organization: &organization.Service{Pool: tracedPool}}
	type outcome struct {
		data json.RawMessage
		err  error
	}
	replayed := make(chan outcome, 1)
	writeCtx, cancelWrite := context.WithCancel(request)
	defer cancelWrite()
	go func() {
		data, err := run(writeCtx, traced)
		replayed <- outcome{data, err}
	}()
	select {
	case <-trace.arrived:
	case result := <-replayed:
		t.Fatalf("refund did not reach the expected query: %v", result.err)
	case <-request.Done():
		t.Fatal(request.Err())
	}
	sessionID := identity.SessionFromContext(ctx).ID
	logout := make(chan error, 1)
	go func() { logout <- auth.Service.Logout(request, session.Token, owner) }()
	for {
		var blocked bool
		err := pool.QueryRow(request, `SELECT EXISTS (SELECT 1 FROM pg_stat_activity waiter
			JOIN pg_stat_activity blocker ON blocker.pid=ANY(pg_blocking_pids(waiter.pid))
			WHERE blocker.application_name=$1 AND waiter.query LIKE 'UPDATE auth_sessions SET revoked_at=%')`, config.ConnConfig.RuntimeParams["application_name"]).Scan(&blocked)
		if err != nil {
			t.Fatal(err)
		}
		if blocked {
			break
		}
		select {
		case err := <-logout:
			t.Fatalf("logout completed before refund released its lock: %v", err)
		case <-request.Done():
			t.Fatal(request.Err())
		case <-time.After(10 * time.Millisecond):
		}
	}
	if cancelBeforeRelease {
		cancelWrite()
	}
	close(trace.release)
	result := <-replayed
	if err := <-logout; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		// Restore the shared synthetic session for subsequent fixture checks.
		updated, err := pool.Exec(ctx, "UPDATE auth_sessions SET revoked_at=NULL WHERE id=$1 AND user_id=$2 AND revoked_at IS NOT NULL", sessionID, owner)
		if err != nil || updated.RowsAffected() != 1 {
			t.Errorf("restore synthetic Owner session: %v", err)
		}
	})
	return result.data, result.err
}

func menuOnlyReturnsAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, saleID, variantID string, auth identity.Handler, session testsupport.MFASession) {
	test.Helper()
	key := func() string {
		test.Helper()
		var value [16]byte
		if _, err := rand.Read(value[:]); err != nil {
			test.Fatal(err)
		}
		value[6] = value[6]&0x0f | 0x40
		value[8] = value[8]&0x3f | 0x80
		return fmt.Sprintf("%x-%x-%x-%x-%x", value[0:4], value[4:6], value[6:8], value[8:10], value[10:16])
	}
	type document struct {
		ID                string `json:"id"`
		Status            string `json:"status"`
		Revision          int64  `json:"revision"`
		Amount            string `json:"amount"`
		RefundID          string `json:"refund_id"`
		ReturnCredit      string `json:"return_credit"`
		ReplacementTotal  string `json:"replacement_total"`
		Difference        string `json:"net_difference"`
		ReturnID          string `json:"linked_return_id"`
		ReplacementSaleID string `json:"replacement_sale_id"`
		Items             []struct {
			Quantity     string  `json:"quantity"`
			RefundAmount string  `json:"refund_amount"`
			Disposition  string  `json:"disposition"`
			Destination  *string `json:"destination_location_id"`
			MovementID   *string `json:"movement_id"`
		} `json:"items"`
	}
	decode := func(raw json.RawMessage, err error) document {
		test.Helper()
		if err != nil {
			test.Fatal(err)
		}
		var doc document
		if err := json.Unmarshal(raw, &doc); err != nil {
			test.Fatalf("decode %s: %v", raw, err)
		}
		if doc.ID == "" {
			test.Fatalf("missing document id: %s", raw)
		}
		return doc
	}
	snapshot := func() (int, string) {
		test.Helper()
		tx, _, err := organizations.Authorized(ctx, owner, org, "pos.checkout")
		if err != nil {
			test.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var movements int
		var balances string
		err = tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM stock_movements WHERE organization_id=$1), COALESCE((SELECT jsonb_agg(jsonb_build_array(location_id,variant_id,quantity,version) ORDER BY location_id,variant_id)::text FROM stock_balances WHERE organization_id=$1),'[]')`, org).Scan(&movements, &balances)
		if err != nil {
			test.Fatal(err)
		}
		return movements, balances
	}
	saleItem := func(sale string) string {
		test.Helper()
		tx, _, err := organizations.Authorized(ctx, owner, org, "pos.checkout")
		if err != nil {
			test.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var item, policy, total, quantity string
		var count int
		err = tx.QueryRow(ctx, `SELECT s.stock_policy,s.grand_total::text,i.id::text,i.quantity::text,(SELECT count(*) FROM sale_items WHERE organization_id=$1 AND sale_id=$2) FROM sales s JOIN sale_items i ON i.organization_id=s.organization_id AND i.sale_id=s.id WHERE s.organization_id=$1 AND s.id=$2 AND i.variant_id=$3`, org, sale, variantID).Scan(&policy, &total, &item, &quantity, &count)
		if err != nil || policy != "MENU_ONLY" || total != "10.00" || quantity != "1.000" || count != 1 {
			test.Fatalf("sale snapshot: policy=%s total=%s quantity=%s count=%d: %v", policy, total, quantity, count, err)
		}
		return item
	}
	beforeMovements, beforeBalances := snapshot()
	originalItem := saleItem(saleID)
	service := &returns.Service{Organization: organizations}
	router := chi.NewRouter()
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, returns.Handler{Service: service}.TenantRoutes)
	newRequest := func(test *testing.T, actor testsupport.MFASession, path, key string, payload any) *http.Request {
		test.Helper()
		body, err := json.Marshal(payload)
		if err != nil {
			test.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodPost, "/organizations/"+org+path, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", testsupport.MFAOrigin)
		req.Header.Set("X-CSRF-Token", actor.CSRF)
		req.Header.Set("Idempotency-Key", key)
		req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: actor.Token})
		return req.WithContext(test.Context())
	}
	serve := func(req *http.Request) *httptest.ResponseRecorder {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}
	responseData := func(test *testing.T, response *httptest.ResponseRecorder, path string, status int) json.RawMessage {
		test.Helper()
		var result struct{ Data json.RawMessage }
		err := json.Unmarshal(response.Body.Bytes(), &result)
		if response.Code != status || response.Header().Get("Cache-Control") != "no-store" || err != nil || len(result.Data) == 0 {
			test.Fatalf("authorized Returns HTTP %s: got %d want %d, no-store=%t, data=%t, decode=%v", path, response.Code, status, response.Header().Get("Cache-Control") == "no-store", len(result.Data) != 0, err)
		}
		return result.Data
	}
	post := func(test *testing.T, path, key string, payload any, status int) json.RawMessage {
		test.Helper()
		return responseData(test, serve(newRequest(test, session, path, key, payload)), path, status)
	}
	expiredReturnsRequest := func(t *testing.T, request *http.Request, prefix string) {
		t.Helper()
		catalogReadInterrupted(t, ctx, organizations.Pool, session, prefix, 1, false,
			func(requestContext context.Context, traced *catalog.Service) (any, error) {
				tracedRouter := chi.NewRouter()
				organization.Handler{Service: organizations, Authentication: auth}.Routes(tracedRouter,
					returns.Handler{Service: &returns.Service{Organization: traced.Organization}}.TenantRoutes)
				response := httptest.NewRecorder()
				tracedRouter.ServeHTTP(response, request.WithContext(requestContext))
				var result struct {
					Data  json.RawMessage
					Error struct{ Code string }
				}
				err := json.Unmarshal(response.Body.Bytes(), &result)
				if err != nil || response.Code != http.StatusUnauthorized || result.Error.Code != "UNAUTHENTICATED" ||
					response.Header().Get("Cache-Control") != "no-store" || len(result.Data) != 0 {
					return false, fmt.Errorf("expired Returns HTTP: status=%d code=%q no-store=%t data=%t decode=%v",
						response.Code, result.Error.Code, response.Header().Get("Cache-Control") == "no-store", len(result.Data) != 0, err)
				}
				return false, identity.ErrInvalidToken
			}, true)
	}
	expiredReturnsHTTP := func(t *testing.T, path, key string, payload any, prefix string) {
		t.Helper()
		expiredReturnsRequest(t, newRequest(t, session, path, key, payload), prefix)
	}
	// Every Returns write records its audit row last before commit; this digest
	// detects any record that survives a denied attempt in this organization.
	returnsDigest := func(t *testing.T) string {
		t.Helper()
		tx, _, err := organizations.Authorized(ctx, owner, org, "pos.checkout")
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		state := ""
		for _, table := range []string{"customer_returns", "customer_return_items", "customer_refunds", "refund_settlement_events",
			"register_cash_disbursements", "sale_adjustments", "adjustment_settlement_events", "sales", "pos_checkouts",
			"stock_movements", "inventory_operations", "organization_audit_events"} {
			var digest string
			if err := tx.QueryRow(ctx, "SELECT count(*)::text||':'||md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM "+table+" t WHERE organization_id=$1", org).Scan(&digest); err != nil {
				t.Fatal(err)
			}
			state += table + "=" + digest + ";"
		}
		return state
	}
	// guardedPost first denies the exact request on expiry after its audit insert,
	// proves nothing persisted, then sends the same request with live authority.
	guardedPost := func(t *testing.T, path, key string, payload any, status int) json.RawMessage {
		t.Helper()
		ok := t.Run("HTTP expires after audit insert "+path, func(t *testing.T) {
			before := returnsDigest(t)
			expiredReturnsHTTP(t, path, key, payload, "INSERT INTO organization_audit_events")
			if returnsDigest(t) != before {
				t.Fatal("expired HTTP write changed persisted Returns state before retry")
			}
		})
		if !ok {
			t.FailNow()
		}
		return post(t, path, key, payload, status)
	}
	input := returns.CreateInput{SaleID: saleID, Reason: "Menu return", Items: []returns.LineInput{{SaleItemID: originalItem, Quantity: "1.000", Disposition: "RESTOCK", Destination: &shop.LocationID}}}
	createKey := key()
	test.Run("return draft rolls back on expiry", func(t *testing.T) {
		catalogReadInterrupted(t, ctx, organizations.Pool, testsupport.MFASession{Context: ctx}, "INSERT INTO customer_returns", 1, false,
			func(request context.Context, traced *catalog.Service) (any, error) {
				return (&returns.Service{Organization: traced.Organization}).Create(request, owner, org, createKey, input)
			}, true)
	})
	doc := decode(guardedPost(test, "/returns", createKey, input, http.StatusCreated), nil)
	if doc.Status != "DRAFT" || doc.Amount != "10.00" || len(doc.Items) != 1 || doc.Items[0].Quantity != "1.000" || doc.Items[0].RefundAmount != "10.00" || doc.Items[0].Disposition != "NO_STOCK_RETURN" || doc.Items[0].Destination != nil || doc.Items[0].MovementID != nil {
		test.Fatalf("return draft: %+v", doc)
	}
	for _, action := range []string{"submit", "approve", "complete"} {
		actionKey := key()
		actionInput := returns.ActionInput{Revision: doc.Revision}
		path := "/returns/" + doc.ID + "/" + action
		if action == "complete" {
			test.Run("return completion rolls back on cancellation", func(t *testing.T) {
				catalogReadInterrupted(t, ctx, organizations.Pool, testsupport.MFASession{Context: ctx}, "INSERT INTO customer_refunds", 1, true,
					func(request context.Context, traced *catalog.Service) (any, error) {
						return (&returns.Service{Organization: traced.Organization}).Transition(request, owner, org, doc.ID, action, actionKey, actionInput)
					}, true)
			})
			current := decode(service.Get(ctx, owner, org, "returns", doc.ID))
			if current.Status != doc.Status || current.Revision != doc.Revision || current.RefundID != "" {
				test.Fatalf("rolled back return advanced: status=%s revision=%d refund=%t", current.Status, current.Revision, current.RefundID != "")
			}
			readCompletion := func(t *testing.T) [4]string {
				t.Helper()
				tx, _, err := organizations.Authorized(ctx, owner, org, "returns.read")
				if err != nil {
					t.Fatal(err)
				}
				defer tx.Rollback(ctx)
				var state [4]string
				err = tx.QueryRow(ctx, `SELECT to_jsonb(r)::text,
					COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id)::text FROM customer_refunds f WHERE f.organization_id=r.organization_id AND f.return_id=r.id), '[]'),
					COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id)::text FROM organization_audit_events a WHERE a.organization_id=r.organization_id AND a.object_id=r.id AND a.event_type='returns.complete'), '[]'),
					COALESCE((SELECT to_jsonb(o)::text FROM inventory_operations o WHERE o.organization_id=r.organization_id AND o.actor_id=$3 AND o.operation='customer-return.complete' AND o.idempotency_key=$4), 'null')
					FROM customer_returns r WHERE r.organization_id=$1 AND r.id=$2`, org, doc.ID, owner, actionKey).
					Scan(&state[0], &state[1], &state[2], &state[3])
				if err != nil {
					t.Fatal(err)
				}
				return state
			}
			if !test.Run("return completion HTTP expires after audit insert", func(t *testing.T) {
				before := readCompletion(t)
				if before[1] != "[]" || before[2] != "[]" || before[3] != "null" {
					t.Fatal("uncompleted return already has completion records")
				}
				expiredReturnsHTTP(t, path, actionKey, actionInput, "INSERT INTO organization_audit_events")
				if readCompletion(t) != before {
					t.Fatal("expired HTTP return completion changed persisted state before retry")
				}
			}) {
				return
			}
			data := post(test, path, actionKey, actionInput, http.StatusOK)
			if !test.Run("return completion HTTP expires after replay lookup", func(t *testing.T) {
				before := readCompletion(t)
				if before[1] == "[]" || before[2] == "[]" || before[3] == "null" {
					t.Fatal("completed return is missing completion records")
				}
				expiredReturnsHTTP(t, path, actionKey, actionInput, "SELECT id::text,fingerprint,result FROM inventory_operations")
				if readCompletion(t) != before {
					t.Fatal("expired HTTP return completion replay changed persisted state before retry")
				}
				if !bytes.Equal(data, post(t, path, actionKey, actionInput, http.StatusOK)) {
					t.Fatal("return completion HTTP replay differed")
				}
				if readCompletion(t) != before {
					t.Fatal("authorized HTTP return completion replay changed persisted state")
				}
			}) {
				return
			}
			doc = decode(data, nil)
			continue
		}
		doc = decode(guardedPost(test, path, actionKey, actionInput, http.StatusOK), nil)
	}
	if doc.Status != "COMPLETED" || doc.RefundID == "" || doc.Amount != "10.00" || len(doc.Items) != 1 || doc.Items[0].MovementID != nil {
		test.Fatalf("completed return: %+v", doc)
	}
	if _, err := service.Create(ctx, owner, org, key(), input); !errors.Is(err, returns.ErrConflict) {
		test.Fatalf("over-return: %v", err)
	}
	tx, _, err := organizations.Authorized(ctx, owner, org, "pos.checkout")
	if err != nil {
		test.Fatal(err)
	}
	var shift string
	err = tx.QueryRow(ctx, `SELECT id::text FROM register_shifts WHERE organization_id=$1 AND terminal_id=$2 AND cashier_id=$3 AND status='OPEN'`, org, shop.TerminalID, owner).Scan(&shift)
	tx.Rollback(ctx)
	if err != nil {
		test.Fatal(err)
	}
	refund := decode(service.Get(ctx, owner, org, "refunds", doc.RefundID))
	if refund.Status != "PENDING_SETTLEMENT" || refund.Amount != "10.00" {
		test.Fatalf("pending refund: %+v", refund)
	}
	refund = decode(guardedPost(test, "/refunds/"+refund.ID+"/report-settlement", key(), returns.SettlementInput{Revision: refund.Revision, Method: "CASH_REFUND", ShiftID: &shift, Note: "Cash returned", Acknowledged: true}, http.StatusOK), nil)
	if refund.Status != "SETTLEMENT_REPORTED" {
		test.Fatalf("reported refund: %+v", refund)
	}
	confirmKey := key()
	confirmInput := returns.SettlementInput{Revision: refund.Revision, Note: "Cash confirmed", Acknowledged: true}
	test.Run("logout waits for canceled first refund confirmation", func(t *testing.T) {
		type confirmationState struct {
			status                        string
			revision                      int64
			disbursements, events, replay int
		}
		readState := func() confirmationState {
			t.Helper()
			var state confirmationState
			tx, _, err := organizations.Authorized(ctx, owner, org, "pos.checkout")
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			if err := tx.QueryRow(ctx, `SELECT status, revision,
				(SELECT count(*) FROM register_cash_disbursements WHERE organization_id=$1 AND refund_id=$2),
				(SELECT count(*) FROM refund_settlement_events WHERE organization_id=$1 AND refund_id=$2),
				(SELECT count(*) FROM inventory_operations WHERE organization_id=$1 AND actor_id=$3 AND operation='customer-refund.confirm' AND idempotency_key=$4)
				FROM customer_refunds WHERE organization_id=$1 AND id=$2`, org, refund.ID, owner, confirmKey).
				Scan(&state.status, &state.revision, &state.disbursements, &state.events, &state.replay); err != nil {
				t.Fatal(err)
			}
			return state
		}
		before := readState()
		if before.status != "SETTLEMENT_REPORTED" || before.revision != refund.Revision || before.disbursements != 0 || before.replay != 0 {
			t.Fatalf("first confirmation fixture: %+v", before)
		}
		run := func(request context.Context, svc *returns.Service) (json.RawMessage, error) {
			return svc.Settle(request, owner, org, refund.ID, "confirm", confirmKey, confirmInput)
		}
		data, err := refundLogoutOrdering(t, ctx, organizations.Pool, auth, session, owner, "INSERT INTO register_cash_disbursements", true, run)
		if !errors.Is(err, context.Canceled) || len(data) != 0 {
			t.Fatalf("canceled first confirmation: data=%t err=%v", len(data) != 0, err)
		}
		if data, err := run(ctx, service); !errors.Is(err, identity.ErrInvalidToken) || len(data) != 0 {
			t.Fatalf("first confirmation after logout: data=%t err=%v", len(data) != 0, err)
		}
		if after := readState(); after != before {
			t.Fatalf("canceled confirmation changed persisted state: before=%+v after=%+v", before, after)
		}
	})
	test.Run("cash refund rolls back on expiry", func(t *testing.T) {
		catalogReadInterrupted(t, ctx, organizations.Pool, testsupport.MFASession{Context: ctx}, "INSERT INTO register_cash_disbursements", 1, false,
			func(request context.Context, traced *catalog.Service) (any, error) {
				return (&returns.Service{Organization: traced.Organization}).Settle(request, owner, org, refund.ID, "confirm", confirmKey, confirmInput)
			}, true)
	})
	if current := decode(service.Get(ctx, owner, org, "refunds", refund.ID)); current.Status != refund.Status || current.Revision != refund.Revision {
		test.Fatalf("rolled back refund advanced: status=%s revision=%d", current.Status, current.Revision)
	}
	confirmPath := "/refunds/" + refund.ID + "/confirm-settlement"
	confirmationSnapshot := func() [4]string {
		test.Helper()
		tx, _, err := organizations.Authorized(ctx, owner, org, "pos.checkout")
		if err != nil {
			test.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var state [4]string
		err = tx.QueryRow(ctx, `SELECT to_jsonb(r)::text,
			COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id)::text FROM register_cash_disbursements d WHERE d.organization_id=r.organization_id AND d.refund_id=r.id), '[]'),
			COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)::text FROM refund_settlement_events e WHERE e.organization_id=r.organization_id AND e.refund_id=r.id), '[]'),
			COALESCE((SELECT to_jsonb(o)::text FROM inventory_operations o WHERE o.organization_id=r.organization_id AND o.actor_id=$3 AND o.operation='customer-refund.confirm' AND o.idempotency_key=$4), 'null')
			FROM customer_refunds r WHERE r.organization_id=$1 AND r.id=$2`, org, refund.ID, owner, confirmKey).
			Scan(&state[0], &state[1], &state[2], &state[3])
		if err != nil {
			test.Fatal(err)
		}
		return state
	}
	beforeConfirmation := confirmationSnapshot()
	if beforeConfirmation[1] != "[]" || beforeConfirmation[3] != "null" {
		test.Fatal("fresh confirmation already has a disbursement or saved result")
	}
	if !test.Run("refund confirmation HTTP expires after disbursement insert", func(t *testing.T) {
		expiredReturnsHTTP(t, confirmPath, confirmKey, confirmInput, "INSERT INTO register_cash_disbursements")
	}) {
		return
	}
	if confirmationSnapshot() != beforeConfirmation {
		test.Fatal("expired HTTP confirmation changed persisted state before retry")
	}
	var confirmed json.RawMessage
	if !test.Run("concurrent refund HTTP confirmations share one result", func(t *testing.T) {
		first := newRequest(t, session, confirmPath, confirmKey, confirmInput)
		second := newRequest(t, session, confirmPath, confirmKey, confirmInput)
		ready := make(chan struct{}, 2)
		start := make(chan struct{})
		responses := make(chan *httptest.ResponseRecorder, 2)
		for _, req := range []*http.Request{first, second} {
			go func() {
				ready <- struct{}{}
				<-start
				responses <- serve(req)
			}()
		}
		<-ready
		<-ready
		close(start)
		firstResponse, secondResponse := <-responses, <-responses
		confirmed = responseData(t, firstResponse, confirmPath, http.StatusOK)
		other := responseData(t, secondResponse, confirmPath, http.StatusOK)
		if !bytes.Equal(confirmed, other) {
			t.Fatal("concurrent refund confirmation responses differed")
		}
	}) {
		return
	}
	refund = decode(confirmed, nil)
	replayed := post(test, confirmPath, confirmKey, confirmInput, http.StatusOK)
	if !bytes.Equal(confirmed, replayed) {
		test.Fatal("cash refund confirmation HTTP replay differed")
	}
	replay := decode(replayed, nil)
	if refund.Status != "CONFIRMED" || refund.Amount != "10.00" || replay.ID != refund.ID || replay.Revision != refund.Revision || replay.Status != refund.Status {
		test.Fatalf("refund confirmation/replay: %+v %+v", refund, replay)
	}
	beforeReplay := confirmationSnapshot()
	if beforeReplay[1] == "[]" || beforeReplay[3] == "null" {
		test.Fatal("confirmed refund is missing a disbursement or saved result")
	}
	if !test.Run("refund confirmation HTTP expires after replay lookup", func(t *testing.T) {
		expiredReturnsHTTP(t, confirmPath, confirmKey, confirmInput, "SELECT id::text,fingerprint,result FROM inventory_operations")
	}) {
		return
	}
	if confirmationSnapshot() != beforeReplay {
		test.Fatal("expired HTTP replay changed persisted state before retry")
	}
	if again := post(test, confirmPath, confirmKey, confirmInput, http.StatusOK); !bytes.Equal(confirmed, again) {
		test.Fatal("refund confirmation HTTP replay changed after expiry")
	}
	test.Run("refund replay requires authority after lookup", func(t *testing.T) {
		catalogReadInterrupted(t, ctx, organizations.Pool, testsupport.MFASession{Context: ctx}, "SELECT id::text,fingerprint,result FROM inventory_operations", 1, false,
			func(request context.Context, traced *catalog.Service) (any, error) {
				return (&returns.Service{Organization: traced.Organization}).Settle(request, owner, org, refund.ID, "confirm", confirmKey, confirmInput)
			}, true)
	})
	test.Run("refund HTTP rejects altered and unauthorized replays", func(t *testing.T) {
		denied := func(actor testsupport.MFASession, payload returns.SettlementInput, status int, code string, privateRoute bool) {
			t.Helper()
			response := serve(newRequest(t, actor, confirmPath, confirmKey, payload))
			var result struct {
				Data  json.RawMessage
				Error struct{ Code string }
			}
			err := json.Unmarshal(response.Body.Bytes(), &result)
			if err != nil || response.Code != status || result.Error.Code != code || len(result.Data) != 0 || (privateRoute && response.Header().Get("Cache-Control") != "no-store") {
				t.Fatalf("refund replay: want %d %s, got %d %s, data=%t, decode=%v", status, code, response.Code, result.Error.Code, len(result.Data) != 0, err)
			}
		}
		changed := confirmInput
		changed.Note = "Changed synthetic confirmation"
		denied(session, changed, http.StatusConflict, "CONFLICT", true)
		user := identity.SessionFromContext(ctx).User
		_, token, csrf, err := auth.Service.Login(ctx, user.Email, "Synthetic-owner-password-2026")
		if err != nil {
			t.Fatal(err)
		}
		primary := testsupport.MFASession{Token: token, CSRF: csrf}
		denied(primary, confirmInput, http.StatusForbidden, "MFA_REQUIRED", true)
		if err = auth.Service.Logout(ctx, token, owner); err != nil {
			t.Fatal(err)
		}
		denied(primary, confirmInput, http.StatusUnauthorized, "UNAUTHENTICATED", false)
		if current := decode(service.Get(ctx, owner, org, "refunds", refund.ID)); current.Status != refund.Status || current.Revision != refund.Revision || current.Amount != refund.Amount {
			t.Fatal("denied replays changed the confirmed refund")
		}
	})
	test.Run("refund replay and logout serialize on the session", func(t *testing.T) {
		data, err := refundLogoutOrdering(t, ctx, organizations.Pool, auth, session, owner, "SELECT id::text,fingerprint,result FROM inventory_operations", false, func(request context.Context, svc *returns.Service) (json.RawMessage, error) {
			return svc.Settle(request, owner, org, refund.ID, "confirm", confirmKey, confirmInput)
		})
		var stored, actual map[string]any
		if err != nil || json.Unmarshal(confirmed, &stored) != nil || json.Unmarshal(data, &actual) != nil || !reflect.DeepEqual(actual, stored) {
			t.Fatalf("replay acquired before logout did not return the saved refund: %v", err)
		}
		if data, err := service.Settle(ctx, owner, org, refund.ID, "confirm", confirmKey, confirmInput); !errors.Is(err, identity.ErrInvalidToken) || len(data) != 0 {
			t.Fatalf("replay after logout returned data or unexpected error: %v", err)
		}
	})
	tx, _, err = organizations.Authorized(ctx, owner, org, "pos.checkout")
	if err != nil {
		test.Fatal(err)
	}
	var disbursements, refundEvents int
	var disbursed string
	err = tx.QueryRow(ctx, `SELECT count(*),COALESCE(sum(amount),0)::numeric(18,2)::text,(SELECT count(*) FROM refund_settlement_events WHERE organization_id=$1 AND refund_id=$2) FROM register_cash_disbursements WHERE organization_id=$1 AND refund_id=$2`, org, refund.ID).Scan(&disbursements, &disbursed, &refundEvents)
	tx.Rollback(ctx)
	if err != nil || disbursements != 1 || disbursed != "10.00" || refundEvents != 2 {
		test.Fatalf("refund ledger: count=%d amount=%s events=%d: %v", disbursements, disbursed, refundEvents, err)
	}

	point := &pos.Service{Organization: organizations}
	cart, err := point.CreateCart(ctx, owner, org, key(), pos.CartInput{TerminalID: shop.TerminalID})
	if err != nil {
		test.Fatal(err)
	}
	cart, err = point.UpdateCart(ctx, owner, org, cart.ID, "update", pos.CartInput{Revision: cart.Revision, Items: []pos.ItemInput{{VariantID: variantID, Quantity: "1.000"}}})
	if err != nil || cart.Total != "10.00" || cart.StockPolicy != "MENU_ONLY" {
		test.Fatalf("exchange original cart: %+v %v", cart, err)
	}
	checkout, err := point.PrepareCheckout(ctx, owner, org, key(), pos.CheckoutInput{CartID: cart.ID, Revision: cart.Revision, Method: "CASH", ExpectedTotal: cart.Total, Received: cart.Total, PricingRevision: cart.Pricing.Revision})
	if err != nil {
		test.Fatal(err)
	}
	if _, err = point.ConfirmPayment(ctx, owner, org, checkout.ID, key(), pos.ConfirmationInput{Acknowledged: true}); err != nil {
		test.Fatal(err)
	}
	checkout, err = point.CompleteCheckout(ctx, owner, org, checkout.ID)
	if err != nil || checkout.Status != "COMPLETED" || checkout.SaleID == "" {
		test.Fatalf("exchange original checkout: %+v %v", checkout, err)
	}
	exchangeItem := saleItem(checkout.SaleID)
	exchangeInput := returns.AdjustmentInput{CreateInput: returns.CreateInput{SaleID: checkout.SaleID, Reason: "Menu exchange", Items: []returns.LineInput{{SaleItemID: exchangeItem, Quantity: "1.000", Disposition: "RESTOCK", Destination: &shop.LocationID}}}, TerminalID: shop.TerminalID, Replacements: []pos.ItemInput{{VariantID: variantID, Quantity: "1.000"}}}
	exchangeKey := key()
	test.Run("exchange draft rolls back on expiry", func(t *testing.T) {
		catalogReadInterrupted(t, ctx, organizations.Pool, testsupport.MFASession{Context: ctx}, "INSERT INTO sale_adjustments", 1, false,
			func(request context.Context, traced *catalog.Service) (any, error) {
				return (&returns.Service{Organization: traced.Organization}).SaveAdjustment(request, owner, org, "EXCHANGE", "", exchangeKey, exchangeInput)
			}, true)
	})
	exchange := decode(guardedPost(test, "/exchanges", exchangeKey, exchangeInput, http.StatusCreated), nil)
	if exchange.Status != "DRAFT" || exchange.ReturnCredit != "10.00" || exchange.ReplacementTotal != "10.00" || exchange.Difference != "0.00" || exchange.ReturnID == "" {
		test.Fatalf("exchange draft: %+v", exchange)
	}
	for _, action := range []string{"submit", "approve"} {
		exchange = decode(guardedPost(test, "/exchanges/"+exchange.ID+"/"+action, key(), returns.SettlementInput{Revision: exchange.Revision}, http.StatusOK), nil)
	}
	exchange = decode(guardedPost(test, "/exchanges/"+exchange.ID+"/confirm-settlement", key(), returns.SettlementInput{Revision: exchange.Revision, Method: "NONE", Note: "Equal exchange", Acknowledged: true}, http.StatusOK), nil)
	if exchange.Status != "AWAITING_SETTLEMENT" {
		test.Fatalf("exchange acknowledgement: %+v", exchange)
	}
	completeKey := key()
	completeInput := returns.SettlementInput{Revision: exchange.Revision}
	test.Run("exchange completion rolls back on expiry after projection", func(t *testing.T) {
		catalogReadInterrupted(t, ctx, organizations.Pool, testsupport.MFASession{Context: ctx}, "SELECT to_jsonb(doc)||jsonb_build_object('return_credit'", 2, false,
			func(request context.Context, traced *catalog.Service) (any, error) {
				return (&returns.Service{Organization: traced.Organization}).TransitionAdjustment(request, owner, org, "EXCHANGE", exchange.ID, "complete", completeKey, completeInput)
			}, true)
	})
	if current := decode(service.GetAdjustment(ctx, owner, org, "EXCHANGE", exchange.ID)); current.Status != exchange.Status || current.Revision != exchange.Revision || current.ReplacementSaleID != "" {
		test.Fatalf("rolled back exchange advanced: status=%s revision=%d sale=%t", current.Status, current.Revision, current.ReplacementSaleID != "")
	}
	exchangePath := "/exchanges/" + exchange.ID + "/complete"
	readExchange := func(t *testing.T) [6]string {
		t.Helper()
		tx, _, err := organizations.Authorized(ctx, owner, org, "pos.checkout")
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var state [6]string
		err = tx.QueryRow(ctx, `SELECT to_jsonb(a)::text,to_jsonb(r)::text,
			COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)::text FROM adjustment_settlement_events e WHERE e.organization_id=a.organization_id AND e.adjustment_id=a.id), '[]'),
			COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id)::text FROM organization_audit_events x WHERE x.organization_id=a.organization_id AND x.object_id=a.id AND x.event_type='adjustments.complete'), '[]'),
			COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)::text FROM sales s JOIN pos_checkouts c ON c.organization_id=s.organization_id AND c.id=s.checkout_id WHERE c.organization_id=a.organization_id AND c.adjustment_id=a.id), '[]'),
			COALESCE((SELECT to_jsonb(o)::text FROM inventory_operations o WHERE o.organization_id=a.organization_id AND o.actor_id=$3 AND o.operation='adjustment.EXCHANGE.complete' AND o.idempotency_key=$4), 'null')
			FROM sale_adjustments a JOIN customer_returns r ON r.organization_id=a.organization_id AND r.id=a.linked_return_id
			WHERE a.organization_id=$1 AND a.id=$2`, org, exchange.ID, owner, completeKey).
			Scan(&state[0], &state[1], &state[2], &state[3], &state[4], &state[5])
		if err != nil {
			t.Fatal(err)
		}
		return state
	}
	if !test.Run("exchange completion HTTP expires after audit insert", func(t *testing.T) {
		before := readExchange(t)
		if before[3] != "[]" || before[4] != "[]" || before[5] != "null" {
			t.Fatal("uncompleted exchange already has completion records")
		}
		expiredReturnsHTTP(t, exchangePath, completeKey, completeInput, "INSERT INTO organization_audit_events")
		if readExchange(t) != before {
			t.Fatal("expired HTTP exchange completion changed persisted state before retry")
		}
	}) {
		return
	}
	completedExchange := post(test, exchangePath, completeKey, completeInput, http.StatusOK)
	exchange = decode(completedExchange, nil)
	completedState := readExchange(test)
	if completedState[3] == "[]" || completedState[4] == "[]" || completedState[5] == "null" {
		test.Fatal("completed exchange is missing completion records")
	}
	if !test.Run("exchange completion HTTP expires after replay lookup", func(t *testing.T) {
		expiredReturnsHTTP(t, exchangePath, completeKey, completeInput, "SELECT id::text,fingerprint,result FROM inventory_operations")
		if readExchange(t) != completedState {
			t.Fatal("expired HTTP exchange replay changed persisted state before retry")
		}
	}) {
		return
	}
	replayedExchange := post(test, exchangePath, completeKey, completeInput, http.StatusOK)
	if readExchange(test) != completedState {
		test.Fatal("authorized HTTP exchange replay changed persisted state")
	}
	decodeJSON := func(raw json.RawMessage) any {
		test.Helper()
		decoder := json.NewDecoder(bytes.NewReader(raw))
		decoder.UseNumber()
		var value any
		if err := decoder.Decode(&value); err != nil {
			test.Fatalf("decode exchange response: %v", err)
		}
		return value
	}
	// JSONB can reorder object keys when the operation result is read back.
	if !reflect.DeepEqual(decodeJSON(completedExchange), decodeJSON(replayedExchange)) {
		test.Fatal("exchange completion HTTP replay returned different values")
	}
	exchangeReplay := decode(replayedExchange, nil)
	if exchange.Status != "COMPLETED" || exchange.ReplacementSaleID == "" || exchange.ReturnCredit != "10.00" || exchange.ReplacementTotal != "10.00" || exchange.Difference != "0.00" || exchangeReplay.ID != exchange.ID || exchangeReplay.Revision != exchange.Revision || exchangeReplay.ReplacementSaleID != exchange.ReplacementSaleID {
		test.Fatalf("exchange completion/replay: %+v %+v", exchange, exchangeReplay)
	}
	saleItem(exchange.ReplacementSaleID)
	exchangedReturn := decode(service.Get(ctx, owner, org, "return", exchange.ReturnID))
	if exchangedReturn.Status != "COMPLETED" || exchangedReturn.Amount != "10.00" || len(exchangedReturn.Items) != 1 || exchangedReturn.Items[0].Disposition != "NO_STOCK_RETURN" || exchangedReturn.Items[0].Destination != nil || exchangedReturn.Items[0].MovementID != nil {
		test.Fatalf("exchange return: %+v", exchangedReturn)
	}
	if _, err := service.Create(ctx, owner, org, key(), exchangeInput.CreateInput); !errors.Is(err, returns.ErrConflict) {
		test.Fatalf("exchange over-return: %v", err)
	}
	if _, err := service.Get(ctx, key(), org, "sale", saleID); err == nil {
		test.Fatal("non-member read of returnable sale succeeded")
	}
	if _, err := service.Get(ctx, owner, key(), "sale", saleID); err == nil {
		test.Fatal("returnable sale read under unrelated organization succeeded")
	}
	tx, _, err = organizations.Authorized(ctx, owner, org, "pos.checkout")
	if err != nil {
		test.Fatal(err)
	}
	var linkedMovements, replacementSales, exchangeRefunds int
	var originalReturned, exchangeReturned string
	err = tx.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM stock_movements m WHERE m.organization_id=$1 AND (m.sale_id IN ($2,$3,$4) OR m.customer_return_item_id IN (SELECT id FROM customer_return_items WHERE organization_id=$1 AND return_id IN ($5,$6)))),
		(SELECT count(*) FROM sale_adjustments WHERE organization_id=$1 AND id=$7 AND replacement_sale_id=$4 AND status='COMPLETED'),
		(SELECT count(*) FROM customer_refunds WHERE organization_id=$1 AND return_id=$6),
		(SELECT COALESCE(sum(i.quantity),0)::numeric(18,3)::text FROM customer_return_items i JOIN customer_returns r ON r.organization_id=i.organization_id AND r.id=i.return_id WHERE i.organization_id=$1 AND i.original_sale_item_id=$8 AND r.status='COMPLETED'),
		(SELECT COALESCE(sum(i.quantity),0)::numeric(18,3)::text FROM customer_return_items i JOIN customer_returns r ON r.organization_id=i.organization_id AND r.id=i.return_id WHERE i.organization_id=$1 AND i.original_sale_item_id=$9 AND r.status='COMPLETED')`, org, saleID, checkout.SaleID, exchange.ReplacementSaleID, doc.ID, exchange.ReturnID, exchange.ID, originalItem, exchangeItem).Scan(&linkedMovements, &replacementSales, &exchangeRefunds, &originalReturned, &exchangeReturned)
	tx.Rollback(ctx)
	if err != nil || linkedMovements != 0 || replacementSales != 1 || exchangeRefunds != 0 || originalReturned != "1.000" || exchangeReturned != "1.000" {
		test.Fatalf("persisted exchange/returns: movements=%d replacements=%d refunds=%d quantities=%s,%s: %v", linkedMovements, replacementSales, exchangeRefunds, originalReturned, exchangeReturned, err)
	}
	var seededVoid string
	test.Run("void posting failure preserves reconciliation and allows forward recovery", func(t *testing.T) {
		input := returns.AdjustmentInput{CreateInput: returns.CreateInput{
			SaleID: exchange.ReplacementSaleID, Reason: "Menu void",
			Items: []returns.LineInput{{SaleItemID: saleItem(exchange.ReplacementSaleID), Quantity: "1.000", Disposition: "NO_STOCK_RETURN"}},
		}}
		doc := decode(guardedPost(t, "/sales/voids", key(), input, http.StatusCreated), nil)
		seededVoid = doc.ID
		voidPath := "/sales/voids/" + doc.ID
		for _, action := range []string{"submit", "approve"} {
			doc = decode(guardedPost(t, voidPath+"/"+action, key(), returns.SettlementInput{Revision: doc.Revision}, http.StatusOK), nil)
		}
		doc = decode(guardedPost(t, voidPath+"/confirm-settlement", key(), returns.SettlementInput{
			Revision: doc.Revision, Method: "MANUAL_BANK_REFUND", Reference: "synthetic-reconciliation", Note: "Refund acknowledged", Acknowledged: true,
		}, http.StatusOK), nil)
		trace := &customerReadFailureTrace{prefix: "INSERT INTO customer_refunds", remaining: 1}
		configuration := organizations.Pool.Config()
		configuration.ConnConfig.Tracer = trace
		pool, err := pgxpool.NewWithConfig(ctx, configuration)
		if err != nil {
			t.Fatal(err)
		}
		defer pool.Close()
		failing := &returns.Service{Organization: &organization.Service{Pool: pool}}
		recoveryKey := key()
		recoveryInput := returns.SettlementInput{Revision: doc.Revision}
		recovery := decode(failing.TransitionAdjustment(ctx, owner, org, "REVERSAL", doc.ID, "complete", recoveryKey, recoveryInput))
		linked := decode(service.Get(ctx, owner, org, "returns", doc.ReturnID))
		if trace.failure == nil || recovery.Status != "RECONCILIATION_REQUIRED" || linked.Status != "APPROVED" || linked.RefundID != "" {
			t.Fatalf("void rollback: state=%s return=%s refund=%t sqlFailure=%t", recovery.Status, linked.Status, linked.RefundID != "", trace.failure != nil)
		}
		replay := decode(post(t, voidPath+"/complete", recoveryKey, recoveryInput, http.StatusOK), nil)
		if replay.Status != recovery.Status || replay.Revision != recovery.Revision {
			t.Fatalf("reconciliation replay changed: state=%s revision=%d", replay.Status, replay.Revision)
		}
		completionKey := key()
		completionInput := returns.SettlementInput{Revision: recovery.Revision}
		readVoid := func() [7]string {
			t.Helper()
			tx, _, err := organizations.Authorized(ctx, owner, org, "pos.checkout")
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			var state [7]string
			err = tx.QueryRow(ctx, `SELECT to_jsonb(a)::text, to_jsonb(r)::text,
				COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.id)::text FROM customer_refunds f WHERE f.organization_id=r.organization_id AND f.return_id=r.id), '[]'),
				COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)::text FROM refund_settlement_events e JOIN customer_refunds f ON f.organization_id=e.organization_id AND f.id=e.refund_id WHERE f.organization_id=r.organization_id AND f.return_id=r.id), '[]'),
				COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)::text FROM adjustment_settlement_events e WHERE e.organization_id=a.organization_id AND e.adjustment_id=a.id), '[]'),
				COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id)::text FROM organization_audit_events x WHERE x.organization_id=a.organization_id AND x.object_id=a.id AND x.event_type='adjustments.complete'), '[]'),
				COALESCE((SELECT to_jsonb(o)::text FROM inventory_operations o WHERE o.organization_id=a.organization_id AND o.actor_id=$3 AND o.operation='adjustment.REVERSAL.complete' AND o.idempotency_key=$4), 'null')
				FROM sale_adjustments a JOIN customer_returns r ON r.organization_id=a.organization_id AND r.id=a.linked_return_id
				WHERE a.organization_id=$1 AND a.id=$2`, org, doc.ID, owner, completionKey).
				Scan(&state[0], &state[1], &state[2], &state[3], &state[4], &state[5], &state[6])
			if err != nil {
				t.Fatal(err)
			}
			return state
		}
		before := readVoid()
		// The failed posting already recorded an adjustments.complete audit for reconciliation.
		if before[2] != "[]" || before[3] != "[]" || before[5] == "[]" || before[6] != "null" {
			t.Fatal("void awaiting recovery already has completion records")
		}
		expiredReturnsHTTP(t, voidPath+"/complete", completionKey, completionInput, "INSERT INTO organization_audit_events")
		if readVoid() != before {
			t.Fatal("expired HTTP void completion changed persisted state before retry")
		}
		completedData := post(t, voidPath+"/complete", completionKey, completionInput, http.StatusOK)
		completed := decode(completedData, nil)
		linked = decode(service.Get(ctx, owner, org, "returns", doc.ReturnID))
		if completed.Status != "COMPLETED" || linked.Status != "COMPLETED" || linked.RefundID == "" {
			t.Fatalf("void recovery did not complete: state=%s return=%s refund=%t", completed.Status, linked.Status, linked.RefundID != "")
		}
		committed := readVoid()
		if committed[2] == "[]" || committed[3] == "[]" || committed[5] == before[5] || committed[6] == "null" {
			t.Fatal("completed void is missing settlement or completion records")
		}
		expiredReturnsHTTP(t, voidPath+"/complete", completionKey, completionInput, "SELECT id::text,fingerprint,result FROM inventory_operations")
		if readVoid() != committed {
			t.Fatal("expired HTTP void replay changed persisted state before retry")
		}
		replayedData := post(t, voidPath+"/complete", completionKey, completionInput, http.StatusOK)
		if !reflect.DeepEqual(decodeJSON(completedData), decodeJSON(replayedData)) || readVoid() != committed {
			t.Fatal("authorized HTTP void replay changed the result or persisted state")
		}
	})
	test.Run("Returns HTTP reads expire after projection", func(t *testing.T) {
		newRead := func(t *testing.T, path string) *http.Request {
			t.Helper()
			req := httptest.NewRequest(http.MethodGet, "/organizations/"+org+path, nil)
			req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: session.Token})
			return req.WithContext(t.Context())
		}
		listIDs := func(t *testing.T, path string) []string {
			t.Helper()
			var page struct {
				Items []struct {
					ID string `json:"id"`
				} `json:"items"`
				Total int `json:"total"`
			}
			if err := json.Unmarshal(responseData(t, serve(newRead(t, path)), path, http.StatusOK), &page); err != nil || len(page.Items) == 0 || page.Total < len(page.Items) {
				t.Fatalf("seeded HTTP list %s: items=%d total=%d err=%v", path, len(page.Items), page.Total, err)
			}
			ids := make([]string, len(page.Items))
			for index, item := range page.Items {
				ids[index] = item.ID
			}
			return ids
		}
		contains := func(ids []string, id string) bool {
			for _, candidate := range ids {
				if candidate == id {
					return true
				}
			}
			return false
		}
		if seededVoid == "" {
			t.Fatal("void fixture was not created")
		}
		for path, want := range map[string]struct{ include, exclude []string }{
			"/returns":     {[]string{doc.ID, exchange.ReturnID}, nil},
			"/refunds":     {[]string{refund.ID}, nil},
			"/exchanges":   {[]string{exchange.ID}, []string{seededVoid}},
			"/sales/voids": {[]string{seededVoid}, []string{exchange.ID}},
		} {
			ids := listIDs(t, path)
			for _, id := range want.include {
				if !contains(ids, id) {
					t.Fatalf("seeded HTTP list %s is missing %s", path, id)
				}
			}
			for _, id := range want.exclude {
				if contains(ids, id) {
					t.Fatalf("seeded HTTP list %s includes another adjustment kind %s", path, id)
				}
			}
		}
		const (
			returnProjection     = "SELECT to_jsonb(doc)||jsonb_build_object('amount',doc.amount::text,'items'"
			adjustmentProjection = "WITH matched AS (SELECT to_jsonb(doc)||jsonb_build_object('return_credit'"
		)
		for _, read := range []struct{ name, path, id, prefix string }{
			{"returns list", "/returns", "", "WITH matched AS (SELECT to_jsonb(doc)||jsonb_build_object('amount'"},
			{"refunds list", "/refunds", "", "WITH matched AS (SELECT to_jsonb(refund)"},
			{"exchanges list", "/exchanges", "", adjustmentProjection},
			{"voids list", "/sales/voids", "", adjustmentProjection},
			{"return detail", "/returns/" + doc.ID, doc.ID, returnProjection},
			{"refund detail", "/refunds/" + refund.ID, refund.ID, "SELECT to_jsonb(refund)||jsonb_build_object('amount'"},
			// Adjustment details finish by projecting the linked return document.
			{"exchange detail", "/exchanges/" + exchange.ID, exchange.ID, returnProjection},
			{"void detail", "/sales/voids/" + seededVoid, seededVoid, returnProjection},
			{"returnable sale", "/returns/sales/" + saleID, saleID, "SELECT jsonb_build_object('id',sale.id"},
		} {
			t.Run(read.name, func(t *testing.T) {
				if read.id != "" {
					var detail struct {
						ID string `json:"id"`
					}
					if err := json.Unmarshal(responseData(t, serve(newRead(t, read.path)), read.path, http.StatusOK), &detail); err != nil || detail.ID != read.id {
						t.Fatalf("seeded HTTP detail %s: id=%q err=%v", read.path, detail.ID, err)
					}
				}
				expiredReturnsRequest(t, newRead(t, read.path), read.prefix)
			})
		}
	})
	test.Run("first cash refund confirmation commits before waiting logout", func(t *testing.T) {
		cart, err := point.CreateCart(ctx, owner, org, key(), pos.CartInput{TerminalID: shop.TerminalID})
		if err != nil {
			t.Fatal(err)
		}
		cart, err = point.UpdateCart(ctx, owner, org, cart.ID, "update", pos.CartInput{Revision: cart.Revision, Items: []pos.ItemInput{{VariantID: variantID, Quantity: "1.000"}}})
		if err != nil || cart.Total != "10.00" {
			t.Fatalf("cash refund fixture cart: total=%q err=%v", cart.Total, err)
		}
		checkout, err := point.PrepareCheckout(ctx, owner, org, key(), pos.CheckoutInput{CartID: cart.ID, Revision: cart.Revision, Method: "CASH", ExpectedTotal: cart.Total, Received: cart.Total, PricingRevision: cart.Pricing.Revision})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := point.ConfirmPayment(ctx, owner, org, checkout.ID, key(), pos.ConfirmationInput{Acknowledged: true}); err != nil {
			t.Fatal(err)
		}
		checkout, err = point.CompleteCheckout(ctx, owner, org, checkout.ID)
		if err != nil || checkout.SaleID == "" || checkout.Status != "COMPLETED" {
			t.Fatalf("cash refund fixture checkout: status=%q err=%v", checkout.Status, err)
		}
		returned := decode(post(t, "/returns", key(), returns.CreateInput{SaleID: checkout.SaleID, Reason: "Synthetic refund before logout", Items: []returns.LineInput{{SaleItemID: saleItem(checkout.SaleID), Quantity: "1.000", Disposition: "NO_STOCK_RETURN"}}}, http.StatusCreated), nil)
		for _, action := range []string{"submit", "approve", "complete"} {
			returned = decode(post(t, "/returns/"+returned.ID+"/"+action, key(), returns.ActionInput{Revision: returned.Revision}, http.StatusOK), nil)
		}
		if returned.RefundID == "" {
			t.Fatal("cash refund fixture did not create a refund")
		}
		path := "/refunds/" + returned.RefundID
		pending := decode(service.Get(ctx, owner, org, "refunds", returned.RefundID))
		reported := decode(post(t, path+"/report-settlement", key(), returns.SettlementInput{Revision: pending.Revision, Method: "CASH_REFUND", ShiftID: &shift, Note: "Cash returned", Acknowledged: true}, http.StatusOK), nil)
		confirmationKey := key()
		confirmation := returns.SettlementInput{Revision: reported.Revision, Note: "Cash confirmed", Acknowledged: true}
		data, err := refundLogoutOrdering(t, ctx, organizations.Pool, auth, session, owner, "INSERT INTO register_cash_disbursements", false, func(request context.Context, svc *returns.Service) (json.RawMessage, error) {
			return svc.Settle(request, owner, org, reported.ID, "confirm", confirmationKey, confirmation)
		})
		var settled document
		if err != nil || json.Unmarshal(data, &settled) != nil || settled.ID != reported.ID || settled.Status != "CONFIRMED" || settled.Amount != "10.00" || settled.Revision != reported.Revision+1 {
			t.Fatalf("first confirmation before logout: status=%q revision=%d err=%v", settled.Status, settled.Revision, err)
		}
		response := serve(newRequest(t, session, path+"/confirm-settlement", confirmationKey, confirmation))
		var denied struct {
			Data  json.RawMessage
			Error struct{ Code string }
		}
		if err := json.Unmarshal(response.Body.Bytes(), &denied); err != nil || response.Code != http.StatusUnauthorized || denied.Error.Code != "UNAUTHENTICATED" || len(denied.Data) != 0 {
			t.Fatalf("refund replay after logout: status=%d code=%q data=%t err=%v", response.Code, denied.Error.Code, len(denied.Data) != 0, err)
		}
		tx, _, err := organizations.Authorized(ctx, owner, org, "pos.checkout")
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var count, events int
		var amount string
		err = tx.QueryRow(ctx, `SELECT count(*), COALESCE(sum(amount),0)::numeric(18,2)::text,
			(SELECT count(*) FROM refund_settlement_events WHERE organization_id=$1 AND refund_id=$2)
			FROM register_cash_disbursements WHERE organization_id=$1 AND refund_id=$2`, org, settled.ID).Scan(&count, &amount, &events)
		if err != nil || count != 1 || amount != "10.00" || events != 2 {
			t.Fatalf("refund ledger after logout: count=%d amount=%q events=%d err=%v", count, amount, events, err)
		}
	})
	afterMovements, afterBalances := snapshot()
	if afterMovements != beforeMovements || afterBalances != beforeBalances {
		test.Fatalf("phantom inventory: movements %d -> %d, balances %s -> %s", beforeMovements, afterMovements, beforeBalances, afterBalances)
	}
}
