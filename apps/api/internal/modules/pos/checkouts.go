package pos

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pricing"
)

func checkout(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, id string) (Checkout, error) {
	item := Checkout{Items: []CartItem{}}
	if !uuidPattern.MatchString(id) {
		return item, ErrInput
	}
	var items []byte
	err := tx.QueryRow(ctx, `SELECT id::text,branch_id::text,terminal_id::text,shift_id::text,cart_id::text,cashier_id::text,status,method,total::text,received::text,change::text,reference,failure_code,COALESCE((SELECT id::text FROM sales WHERE organization_id=checkout.organization_id AND checkout_id=checkout.id),''),items FROM pos_checkouts checkout WHERE organization_id=$1 AND id=$2 FOR UPDATE`, org, id).Scan(&item.ID, &item.BranchID, &item.TerminalID, &item.ShiftID, &item.CartID, &item.CashierID, &item.Status, &item.Method, &item.Total, &item.Received, &item.Change, &item.Reference, &item.FailureCode, &item.SaleID, &items)
	if err != nil {
		return item, dbError(err)
	}
	if actor.Role == "CASHIER" && item.CashierID != user {
		return item, organization.ErrDenied
	}
	if err = scope(ctx, tx, actor, org, item.BranchID, false); err != nil {
		return item, err
	}
	err = json.Unmarshal(items, &item.Items)
	if err == nil {
		var data []byte
		err = tx.QueryRow(ctx, "SELECT pricing_snapshot FROM pos_checkouts WHERE organization_id=$1 AND id=$2", org, id).Scan(&data)
		if err == nil {
			err = json.Unmarshal(data, &item.Pricing)
		}
	}
	return item, err
}
func (service *Service) Checkout(ctx context.Context, user, org, id string) (Checkout, error) {
	tx, actor, err := service.begin(ctx, user, org, "pos.checkout")
	if err != nil {
		return Checkout{}, err
	}
	defer tx.Rollback(ctx)
	return checkout(ctx, tx, actor, user, org, id)
}
func paymentPermission(method string) string {
	if method == "NONE" {
		return "pos.checkout"
	}
	if method == "CASH" {
		return "pos.payment.cash"
	}
	return "pos.payment.manual_confirm"
}

func (service *Service) PrepareCheckout(ctx context.Context, user, org, key string, input CheckoutInput) (Checkout, error) {
	tx, actor, err := service.begin(ctx, user, org, "pos.checkout")
	if err != nil {
		return Checkout{}, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(key) || !uuidPattern.MatchString(input.CartID) || !allowed(actor.Permissions, paymentPermission(input.Method)) {
		return Checkout{}, ErrInput
	}
	hash := fingerprint(input)
	var id, previous string
	err = tx.QueryRow(ctx, "SELECT id::text,fingerprint FROM pos_checkouts WHERE organization_id=$1 AND cashier_id=$2 AND idempotency_key=$3", org, user, key).Scan(&id, &previous)
	if err == nil {
		if hash != previous {
			return Checkout{}, ErrConflict
		}
		result, problem := checkout(ctx, tx, actor, user, org, id)
		if problem != nil {
			return result, problem
		}
		if problem = pricing.CurrentApprover(ctx, tx, org, result.Pricing.ApprovalID); problem != nil {
			return result, problem
		}
		if result.Status == "AWAITING_PAYMENT" {
			problem = revalidate(ctx, tx, org, result)
		}
		return result, problem
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Checkout{}, err
	}
	cart, err := readCart(ctx, tx, actor, user, org, input.CartID)
	if err != nil {
		return Checkout{}, err
	}
	if cart.Status != "ACTIVE" || cart.Revision != input.Revision || len(cart.Items) == 0 {
		return Checkout{}, ErrConflict
	}
	value, err := terminal(ctx, tx, actor, org, cart.TerminalID, true)
	if err != nil {
		return Checkout{}, err
	}
	shift, err := ownShift(ctx, tx, org, value.ID, user)
	if err != nil {
		return Checkout{}, err
	}
	if err = cartUnlocked(ctx, tx, org, cart.ID); err != nil {
		return Checkout{}, err
	}
	if cart.ReviewRequired {
		return Checkout{}, ErrPrice
	}
	if err = priceCart(ctx, tx, org, &cart, input.ApprovalID); err != nil {
		return Checkout{}, err
	}
	if input.PricingRevision != "" && input.PricingRevision != cart.Pricing.Revision {
		return Checkout{}, ErrPrice
	}
	if input.ExpectedTotal != cart.Total {
		return Checkout{}, ErrPrice
	}
	for _, item := range cart.Items {
		if item.PriceChanged {
			return Checkout{}, ErrPrice
		}
		if !item.Saleable {
			return Checkout{}, ErrConflict
		}
		requested, _ := scaled(item.Quantity, 3)
		available, _ := scaled(item.Available, 3)
		if available < requested {
			return Checkout{}, ErrStock
		}
	}
	change, err := payment(input.Method, cart.Total, input.Received)
	if err != nil {
		return Checkout{}, err
	}
	items, err := json.Marshal(cart.Items)
	if err != nil {
		return Checkout{}, err
	}
	quoteData, _ := json.Marshal(cart.Pricing)
	err = tx.QueryRow(ctx, `INSERT INTO pos_checkouts(organization_id,branch_id,terminal_id,shift_id,cart_id,cashier_id,cart_revision,idempotency_key,fingerprint,status,method,currency,total,received,change,items,pricing_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'AWAITING_PAYMENT',$10,'THB',$11,$12,$13,$14,$15) RETURNING id::text`, org, cart.BranchID, cart.TerminalID, shift, cart.ID, user, cart.Revision, key, hash, input.Method, cart.Total, input.Received, change, items, quoteData).Scan(&id)
	if err != nil {
		return Checkout{}, dbError(err)
	}
	if input.Method == "NONE" {
		if _, err = tx.Exec(ctx, "UPDATE pos_checkouts SET status='CONFIRMED',confirmation_key=$3,confirmed_by=$4,confirmed_at=now() WHERE organization_id=$1 AND id=$2", org, id, key, user); err != nil {
			return Checkout{}, dbError(err)
		}
	}
	result, err := checkout(ctx, tx, actor, user, org, id)
	if err != nil {
		return result, err
	}
	return result, finish(ctx, tx, org, user, "pos.checkout.prepared", id)
}

func (service *Service) ConfirmPayment(ctx context.Context, user, org, id, key string, input ConfirmationInput) (Checkout, error) {
	tx, actor, err := service.begin(ctx, user, org, "pos.checkout")
	if err != nil {
		return Checkout{}, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(key) || !input.Acknowledged || !text(input.Reference, 200, false) {
		return Checkout{}, ErrInput
	}
	item, err := checkout(ctx, tx, actor, user, org, id)
	if err != nil {
		return item, err
	}
	if item.CashierID != user || !allowed(actor.Permissions, paymentPermission(item.Method)) {
		return item, organization.ErrDenied
	}
	if item.Method != "CASH" && item.Method != "NONE" && !text(input.Reference, 200, true) {
		return item, ErrInput
	}
	if item.Status != "AWAITING_PAYMENT" {
		if err = pricing.CurrentApprover(ctx, tx, org, item.Pricing.ApprovalID); err != nil {
			return item, err
		}
		var previous string
		err = tx.QueryRow(ctx, "SELECT COALESCE(confirmation_key::text,'') FROM pos_checkouts WHERE organization_id=$1 AND id=$2", org, id).Scan(&previous)
		if err != nil {
			return item, err
		}
		if previous != key || item.Reference != input.Reference || allowed([]string{"CANCELLED", "RESOLVED"}, item.Status) {
			return item, ErrConflict
		}
		return item, nil
	}
	if _, err = terminal(ctx, tx, actor, org, item.TerminalID, true); err != nil {
		return item, err
	}
	shift, err := ownShift(ctx, tx, org, item.TerminalID, user)
	if err != nil || shift != item.ShiftID {
		return item, ErrConflict
	}
	_, err = tx.Exec(ctx, "UPDATE pos_checkouts SET status='CONFIRMED',confirmation_key=$3,confirmed_by=$4,confirmed_at=now(),reference=$5 WHERE organization_id=$1 AND id=$2", org, id, key, user, input.Reference)
	if err != nil {
		return item, dbError(err)
	}
	if problem := revalidate(ctx, tx, org, item); problem != nil {
		if _, err = tx.Exec(ctx, "UPDATE pos_checkouts SET status='RECONCILIATION_REQUIRED',failure_code='PRICING_CHANGED' WHERE organization_id=$1 AND id=$2", org, id); err != nil {
			return item, dbError(err)
		}
	}
	result, err := checkout(ctx, tx, actor, user, org, id)
	if err != nil {
		return result, err
	}
	return result, finish(ctx, tx, org, user, "pos.payment.confirmed", id)
}

func (service *Service) EndCheckout(ctx context.Context, user, org, id, action string, input ConfirmationInput) (Checkout, error) {
	permission := "pos.checkout"
	if action == "resolve" {
		permission = "pos.payment.reconcile"
	}
	tx, actor, err := service.begin(ctx, user, org, permission)
	if err != nil {
		return Checkout{}, err
	}
	defer tx.Rollback(ctx)
	item, err := checkout(ctx, tx, actor, user, org, id)
	if err != nil {
		return item, err
	}
	if action == "cancel" {
		if item.CashierID != user {
			return item, organization.ErrDenied
		}
		if item.Status == "CANCELLED" {
			return item, nil
		}
		if item.Status != "AWAITING_PAYMENT" {
			return item, ErrPending
		}
		_, err = tx.Exec(ctx, "UPDATE pos_checkouts SET status='CANCELLED' WHERE organization_id=$1 AND id=$2", org, id)
	} else {
		if !input.Acknowledged || !text(input.Note, 2000, true) {
			return item, ErrInput
		}
		if item.Status == "RESOLVED" {
			return item, nil
		}
		if !allowed([]string{"CONFIRMED", "RECONCILIATION_REQUIRED"}, item.Status) {
			return item, ErrConflict
		}
		_, err = tx.Exec(ctx, "UPDATE pos_checkouts SET status='RESOLVED',resolution_note=$3,resolved_by=$4,resolved_at=now() WHERE organization_id=$1 AND id=$2", org, id, input.Note, user)
	}
	if err != nil {
		return item, dbError(err)
	}
	result, err := checkout(ctx, tx, actor, user, org, id)
	if err != nil {
		return result, err
	}
	return result, finish(ctx, tx, org, user, "pos.checkout."+action, id)
}
