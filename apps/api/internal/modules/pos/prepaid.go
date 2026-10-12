package pos

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
)

func (service *Service) SettlePrepaidOnlineOrder(ctx context.Context, user, org, id string, input OnlineOrderInput) (Checkout, error) {
	tx, actor, err := service.begin(ctx, user, org, "online_orders.manage")
	if err != nil {
		return Checkout{}, err
	}
	defer tx.Rollback(ctx)
	if !allowed(actor.Permissions, "pos.cart.manage") || !allowed(actor.Permissions, "pos.checkout") {
		return Checkout{}, organization.ErrDenied
	}
	if !uuidPattern.MatchString(id) || input.Revision <= 0 {
		return Checkout{}, ErrInput
	}
	var status, branch, terminalID, location, total string
	var revision int64
	var cartID *string
	err = tx.QueryRow(ctx, `SELECT status,branch_id::text,terminal_id::text,stock_location_id::text,estimated_total::text,revision,cart_id::text FROM online_orders WHERE organization_id=$1 AND id=$2 FOR UPDATE`, org, id).Scan(&status, &branch, &terminalID, &location, &total, &revision, &cartID)
	if err != nil {
		return Checkout{}, dbError(err)
	}
	if err = scope(ctx, tx, actor, org, branch, true); err != nil {
		return Checkout{}, err
	}
	var previous string
	var requestedRevision int64
	err = tx.QueryRow(ctx, "SELECT id::text,prepaid_order_revision FROM pos_checkouts WHERE organization_id=$1 AND prepaid_order_id=$2", org, id).Scan(&previous, &requestedRevision)
	if err == nil {
		if input.Revision != requestedRevision || status != "COMPLETED" {
			return Checkout{}, ErrConflict
		}
		return checkout(ctx, tx, actor, user, org, previous)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Checkout{}, err
	}
	if status != "READY" || revision != input.Revision || cartID != nil {
		return Checkout{}, ErrConflict
	}
	var reference string
	var paid bool
	err = tx.QueryRow(ctx, `SELECT COALESCE(payment_intent,''),state='PAID' AND NOT stock_hold_released AND amount_minor=($3::numeric*100)::bigint AND currency='thb' AND session_id IS NOT NULL FROM online_payment_attempts WHERE organization_id=$1 AND order_id=$2 FOR UPDATE`, org, id, total).Scan(&reference, &paid)
	if errors.Is(err, pgx.ErrNoRows) || err == nil && !paid {
		return Checkout{}, ErrConflict
	}
	if err != nil {
		return Checkout{}, dbError(err)
	}
	value, err := terminal(ctx, tx, actor, org, terminalID, true)
	if err != nil {
		return Checkout{}, err
	}
	if value.BranchID != branch || value.StockLocationID != location {
		return Checkout{}, ErrConflict
	}
	shift, err := ownShift(ctx, tx, org, terminalID, user)
	if err != nil {
		return Checkout{}, err
	}
	var cart string
	err = tx.QueryRow(ctx, "INSERT INTO pos_carts(organization_id,branch_id,terminal_id,cashier_id,create_key) VALUES($1,$2,$3,$4,gen_random_uuid()) RETURNING id::text", org, branch, terminalID, user).Scan(&cart)
	if err != nil {
		return Checkout{}, dbError(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO pos_cart_items(organization_id,cart_id,variant_id,quantity,unit_price) SELECT organization_id,$3,variant_id,quantity,unit_price FROM online_order_items WHERE organization_id=$1 AND order_id=$2`, org, id, cart); err != nil {
		return Checkout{}, dbError(err)
	}
	if _, err = tx.Exec(ctx, "UPDATE online_orders SET cart_id=$3,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2", org, id, cart); err != nil {
		return Checkout{}, dbError(err)
	}
	current, err := readCart(ctx, tx, actor, user, org, cart)
	if err != nil {
		return Checkout{}, err
	}
	for _, item := range current.Items {
		if !item.Saleable {
			return Checkout{}, ErrConflict
		}
		if item.PriceChanged {
			return Checkout{}, ErrPrice
		}
		quantity, problem := scaled(item.Quantity, 3)
		if problem != nil {
			return Checkout{}, problem
		}
		available, problem := scaled(item.Available, 3)
		if problem != nil {
			return Checkout{}, problem
		}
		if available < quantity {
			return Checkout{}, ErrStock
		}
	}
	if current.ReviewRequired || current.Total != total || current.Pricing.Discount != "0.00" {
		return Checkout{}, ErrPrice
	}
	items, err := json.Marshal(current.Items)
	if err != nil {
		return Checkout{}, err
	}
	quote, err := json.Marshal(current.Pricing)
	if err != nil {
		return Checkout{}, err
	}
	var checkoutID string
	err = tx.QueryRow(ctx, `INSERT INTO pos_checkouts(organization_id,branch_id,terminal_id,shift_id,cart_id,cashier_id,cart_revision,idempotency_key,fingerprint,status,method,currency,total,received,change,items,pricing_snapshot,confirmation_key,confirmed_by,confirmed_at,reference,prepaid_order_id,prepaid_order_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'CONFIRMED','ONLINE_STRIPE','THB',$10,$10,0,$11,$12,$8,$6,now(),$13,$8,$14) RETURNING id::text`, org, branch, terminalID, shift, cart, user, current.Revision, id, fingerprint(input), total, items, quote, reference, input.Revision).Scan(&checkoutID)
	if err != nil {
		return Checkout{}, dbError(err)
	}
	item, err := checkout(ctx, tx, actor, user, org, checkoutID)
	if err != nil {
		return Checkout{}, err
	}
	sale, err := settle(ctx, tx, actor, user, org, item)
	if err != nil {
		return Checkout{}, err
	}
	result, err := checkout(ctx, tx, actor, user, org, checkoutID)
	if err != nil {
		return Checkout{}, err
	}
	return result, finish(ctx, tx, org, user, "pos.prepaid_sale.completed", sale)
}
