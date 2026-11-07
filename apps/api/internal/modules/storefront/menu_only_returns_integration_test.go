package storefront_test

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/returns"
	"smartpos/api/internal/modules/storefront"
)

func menuOnlyReturnsAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, saleID, variantID string) {
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
	input := returns.CreateInput{SaleID: saleID, Reason: "Menu return", Items: []returns.LineInput{{SaleItemID: originalItem, Quantity: "1.000", Disposition: "RESTOCK", Destination: &shop.LocationID}}}
	doc := decode(service.Create(ctx, owner, org, key(), input))
	if doc.Status != "DRAFT" || doc.Amount != "10.00" || len(doc.Items) != 1 || doc.Items[0].Quantity != "1.000" || doc.Items[0].RefundAmount != "10.00" || doc.Items[0].Disposition != "NO_STOCK_RETURN" || doc.Items[0].Destination != nil || doc.Items[0].MovementID != nil {
		test.Fatalf("return draft: %+v", doc)
	}
	for _, action := range []string{"submit", "approve", "complete"} {
		doc = decode(service.Transition(ctx, owner, org, doc.ID, action, key(), returns.ActionInput{Revision: doc.Revision}))
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
	refund = decode(service.Settle(ctx, owner, org, refund.ID, "report", key(), returns.SettlementInput{Revision: refund.Revision, Method: "CASH_REFUND", ShiftID: &shift, Note: "Cash returned", Acknowledged: true}))
	if refund.Status != "SETTLEMENT_REPORTED" {
		test.Fatalf("reported refund: %+v", refund)
	}
	confirmKey := key()
	confirmInput := returns.SettlementInput{Revision: refund.Revision, Note: "Cash confirmed", Acknowledged: true}
	refund = decode(service.Settle(ctx, owner, org, refund.ID, "confirm", confirmKey, confirmInput))
	replay := decode(service.Settle(ctx, owner, org, refund.ID, "confirm", confirmKey, confirmInput))
	if refund.Status != "CONFIRMED" || refund.Amount != "10.00" || replay.ID != refund.ID || replay.Revision != refund.Revision || replay.Status != refund.Status {
		test.Fatalf("refund confirmation/replay: %+v %+v", refund, replay)
	}
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
	exchange := decode(service.SaveAdjustment(ctx, owner, org, "EXCHANGE", "", key(), exchangeInput))
	if exchange.Status != "DRAFT" || exchange.ReturnCredit != "10.00" || exchange.ReplacementTotal != "10.00" || exchange.Difference != "0.00" || exchange.ReturnID == "" {
		test.Fatalf("exchange draft: %+v", exchange)
	}
	for _, action := range []string{"submit", "approve"} {
		exchange = decode(service.TransitionAdjustment(ctx, owner, org, "EXCHANGE", exchange.ID, action, key(), returns.SettlementInput{Revision: exchange.Revision}))
	}
	exchange = decode(service.TransitionAdjustment(ctx, owner, org, "EXCHANGE", exchange.ID, "confirm-settlement", key(), returns.SettlementInput{Revision: exchange.Revision, Method: "NONE", Note: "Equal exchange", Acknowledged: true}))
	if exchange.Status != "AWAITING_SETTLEMENT" {
		test.Fatalf("exchange acknowledgement: %+v", exchange)
	}
	completeKey := key()
	completeInput := returns.SettlementInput{Revision: exchange.Revision}
	exchange = decode(service.TransitionAdjustment(ctx, owner, org, "EXCHANGE", exchange.ID, "complete", completeKey, completeInput))
	exchangeReplay := decode(service.TransitionAdjustment(ctx, owner, org, "EXCHANGE", exchange.ID, "complete", completeKey, completeInput))
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
	afterMovements, afterBalances := snapshot()
	if afterMovements != beforeMovements || afterBalances != beforeBalances {
		test.Fatalf("phantom inventory: movements %d -> %d, balances %s -> %s", beforeMovements, afterMovements, beforeBalances, afterBalances)
	}
}
