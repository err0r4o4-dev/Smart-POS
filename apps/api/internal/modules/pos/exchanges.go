package pos

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pricing"
)

type ExchangePricing struct {
	Terminal Terminal
	Shift    string
	Items    []CartItem
	Total    string
	Pricing  pricing.Quote
}

func QuoteExchange(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, terminalID string, items []ItemInput) (ExchangePricing, error) {
	var quote ExchangePricing
	if err := validateItems(items); err != nil || len(items) == 0 {
		return quote, ErrInput
	}
	value, err := terminal(ctx, tx, actor, org, terminalID, true)
	if err != nil {
		return quote, err
	}
	quote.Terminal = value
	quote.Shift, err = ownShift(ctx, tx, org, terminalID, user)
	if err != nil {
		return quote, err
	}
	total := int64(0)
	for _, input := range items {
		item, err := variant(ctx, tx, org, value.StockLocationID, input.VariantID, input.Quantity, "")
		if err != nil {
			return quote, err
		}
		requested, _ := scaled(item.Quantity, 3)
		available, _ := scaled(item.Available, 3)
		if !item.Saleable {
			return quote, ErrConflict
		}
		if available < requested {
			return quote, ErrStock
		}
		amount, err := scaled(item.LineTotal, 2)
		if err != nil || total > maxDecimal-amount {
			return quote, ErrInput
		}
		total += amount
		quote.Items = append(quote.Items, item)
	}
	quote.Total = money(total)
	cart := Cart{BranchID: value.BranchID, Items: quote.Items, CashierID: user}
	if err = priceCart(ctx, tx, org, &cart, ""); err != nil {
		return quote, err
	}
	quote.Items = cart.Items
	quote.Total = cart.Total
	quote.Pricing = cart.Pricing
	return quote, nil
}

func PostExchange(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, id, terminalID, credit, method, reference string, snapshots []CartItem) (string, error) {
	inputs := []ItemInput{}
	for _, item := range snapshots {
		inputs = append(inputs, ItemInput{VariantID: item.VariantID, Quantity: item.Quantity})
	}
	quote, err := QuoteExchange(ctx, tx, actor, user, org, terminalID, inputs)
	if err != nil {
		return "", err
	}
	for index, item := range quote.Items {
		if item.UnitPrice != snapshots[index].UnitPrice || item.PricingRevision != snapshots[index].PricingRevision {
			return "", ErrPrice
		}
	}
	amount, _ := scaled(quote.Total, 2)
	applied, err := scaled(credit, 2)
	if err != nil {
		return "", err
	}
	if applied > amount {
		applied = amount
	}
	external := money(amount - applied)
	if applied == amount {
		method = "EXCHANGE_CREDIT"
	}
	if amount == 0 {
		method = "NONE"
	}
	var cart, checkoutID string
	var customerID *string
	var customerCode string
	if err = tx.QueryRow(ctx, "SELECT sale.customer_id::text,sale.customer_code_snapshot FROM sale_adjustments adjustment JOIN sales sale ON sale.organization_id=adjustment.organization_id AND sale.id=adjustment.original_sale_id WHERE adjustment.organization_id=$1 AND adjustment.id=$2", org, id).Scan(&customerID, &customerCode); err != nil {
		return "", dbError(err)
	}
	err = tx.QueryRow(ctx, "INSERT INTO pos_carts(organization_id,branch_id,terminal_id,cashier_id,create_key,customer_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text", org, quote.Terminal.BranchID, terminalID, user, id, customerID).Scan(&cart)
	if err != nil {
		return "", dbError(err)
	}
	for _, item := range quote.Items {
		if _, err = tx.Exec(ctx, "INSERT INTO pos_cart_items(organization_id,cart_id,variant_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5)", org, cart, item.VariantID, item.Quantity, item.UnitPrice); err != nil {
			return "", dbError(err)
		}
	}
	data, _ := json.Marshal(quote.Items)
	quoteData, _ := json.Marshal(quote.Pricing)
	err = tx.QueryRow(ctx, "INSERT INTO pos_checkouts(organization_id,branch_id,terminal_id,shift_id,cart_id,cashier_id,cart_revision,idempotency_key,fingerprint,status,method,currency,total,received,change,items,confirmation_key,confirmed_by,confirmed_at,reference,adjustment_id,credit_amount,pricing_snapshot,customer_id,customer_code_snapshot) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,'CONFIRMED',$9,'THB',$10,$11,0,$12,$7,$6,now(),$13,$7,$14,$15,$16,$17) RETURNING id::text", org, quote.Terminal.BranchID, terminalID, quote.Shift, cart, user, id, fingerprint(id), method, quote.Total, external, data, reference, money(applied), quoteData, customerID, customerCode).Scan(&checkoutID)
	if err != nil {
		return "", dbError(err)
	}
	return settle(ctx, tx, actor, user, org, Checkout{ID: checkoutID, BranchID: quote.Terminal.BranchID, TerminalID: terminalID, ShiftID: quote.Shift, CartID: cart, CashierID: user, Method: method, Total: quote.Total, Items: quote.Items, Pricing: quote.Pricing, CustomerID: customerID, CustomerCode: customerCode})
}
