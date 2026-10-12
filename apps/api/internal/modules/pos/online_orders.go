package pos

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
	"time"
)

type OnlineOrderLink struct {
	ID             string `json:"id"`
	Number         string `json:"number"`
	EstimatedTotal string `json:"estimated_total"`
}
type OnlineOrderInput struct {
	Revision int64 `json:"revision"`
}

func EstimateOnlineLine(price, quantity, unitType string) (int64, error) {
	units, err := scaled(quantity, 3)
	if err != nil || units <= 0 || (allowed([]string{"COUNT", "PACKAGING"}, unitType) && units%1000 != 0) {
		return 0, ErrInput
	}
	cents, err := scaled(price, 2)
	if err != nil || cents <= 0 {
		return 0, ErrInput
	}
	return lineTotal(price, quantity)
}
func onlineOrderLink(ctx context.Context, tx pgx.Tx, org, cart string) (*OnlineOrderLink, error) {
	var result OnlineOrderLink
	err := tx.QueryRow(ctx, "SELECT id::text,number,estimated_total::text FROM online_orders WHERE organization_id=$1 AND cart_id=$2", org, cart).Scan(&result.ID, &result.Number, &result.EstimatedTotal)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &result, dbError(err)
}
func (service *Service) ImportOnlineOrder(ctx context.Context, user, org, id string, input OnlineOrderInput) (Cart, error) {
	tx, actor, err := service.begin(ctx, user, org, "online_orders.manage")
	if err != nil {
		return Cart{}, err
	}
	defer tx.Rollback(ctx)
	if !allowed(actor.Permissions, "pos.cart.manage") || !allowed(actor.Permissions, "pos.checkout") {
		return Cart{}, organization.ErrDenied
	}
	if !uuidPattern.MatchString(id) {
		return Cart{}, ErrInput
	}
	var status, branch, terminalID, location string
	var revision int64
	var expires time.Time
	var cartID *string
	err = tx.QueryRow(ctx, "SELECT status,branch_id::text,terminal_id::text,stock_location_id::text,revision,expires_at,cart_id::text FROM online_orders WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, id).Scan(&status, &branch, &terminalID, &location, &revision, &expires, &cartID)
	if err != nil {
		return Cart{}, dbError(err)
	}
	if err = scope(ctx, tx, actor, org, branch, true); err != nil {
		return Cart{}, err
	}
	if status != "READY" {
		return Cart{}, ErrConflict
	}
	var paymentBacked bool
	if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM online_payment_attempts WHERE organization_id=$1 AND order_id=$2)", org, id).Scan(&paymentBacked); err != nil {
		return Cart{}, err
	}
	if paymentBacked {
		return Cart{}, ErrConflict
	}
	value, err := terminal(ctx, tx, actor, org, terminalID, true)
	if err != nil {
		return Cart{}, err
	}
	if value.BranchID != branch || value.StockLocationID != location {
		return Cart{}, ErrConflict
	}
	if _, err = ownShift(ctx, tx, org, value.ID, user); err != nil {
		return Cart{}, err
	}
	if cartID != nil {
		current, err := cartHeader(ctx, tx, actor, user, org, *cartID)
		if err != nil {
			return current, err
		}
		if current.Status == "HELD" {
			if err = cartUnlocked(ctx, tx, org, *cartID); err != nil {
				return current, err
			}
			if _, err = tx.Exec(ctx, "UPDATE pos_carts SET status='ACTIVE',revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2", org, *cartID); err != nil {
				return current, err
			}
			result, err := readCart(ctx, tx, actor, user, org, *cartID)
			if err != nil {
				return result, err
			}
			return result, finish(ctx, tx, org, user, "online_order.pos_cart.resumed", id)
		}
		if current.Status != "ACTIVE" {
			return current, ErrConflict
		}
		return readCart(ctx, tx, actor, user, org, *cartID)
	}
	if revision != input.Revision || !expires.After(time.Now()) {
		return Cart{}, ErrConflict
	}
	rows, err := tx.Query(ctx, "SELECT variant_id::text,quantity::text FROM online_order_items WHERE organization_id=$1 AND order_id=$2 ORDER BY variant_id", org, id)
	if err != nil {
		return Cart{}, err
	}
	items := []ItemInput{}
	for rows.Next() {
		var item ItemInput
		if err = rows.Scan(&item.VariantID, &item.Quantity); err != nil {
			rows.Close()
			return Cart{}, err
		}
		items = append(items, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return Cart{}, err
	}
	if validateItems(items) != nil {
		return Cart{}, ErrInput
	}
	var next string
	if err = tx.QueryRow(ctx, "INSERT INTO pos_carts(organization_id,branch_id,terminal_id,cashier_id,create_key) VALUES($1,$2,$3,$4,gen_random_uuid()) RETURNING id::text", org, branch, terminalID, user).Scan(&next); err != nil {
		return Cart{}, dbError(err)
	}
	for _, inputItem := range items {
		item, err := variant(ctx, tx, org, location, inputItem.VariantID, inputItem.Quantity, "")
		if err != nil {
			return Cart{}, err
		}
		if !item.Saleable {
			return Cart{}, ErrConflict
		}
		if _, err = tx.Exec(ctx, "INSERT INTO pos_cart_items(organization_id,cart_id,variant_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5)", org, next, item.VariantID, item.Quantity, item.UnitPrice); err != nil {
			return Cart{}, dbError(err)
		}
	}
	if _, err = tx.Exec(ctx, "UPDATE online_orders SET cart_id=$3,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2", org, id, next); err != nil {
		return Cart{}, dbError(err)
	}
	result, err := readCart(ctx, tx, actor, user, org, next)
	if err != nil {
		return result, err
	}
	if _, err = tx.Exec(ctx, "UPDATE pos_carts SET pricing_revision=$3 WHERE organization_id=$1 AND id=$2", org, next, result.Pricing.Revision); err != nil {
		return result, err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO online_order_events(organization_id,order_id,status,message,actor_id) VALUES($1,$2,'READY','พนักงานเปิดออเดอร์เข้า POS เพื่อทบทวนยอดและรับชำระ',$3)", org, id, user); err != nil {
		return result, err
	}
	return result, finish(ctx, tx, org, user, "online_order.pos_cart.created", id)
}
func validateOnlineCart(ctx context.Context, tx pgx.Tx, org, cart string, items []ItemInput) error {
	link, err := onlineOrderLink(ctx, tx, org, cart)
	if err != nil || link == nil {
		return err
	}
	rows, err := tx.Query(ctx, "SELECT variant_id::text,quantity::text FROM online_order_items WHERE organization_id=$1 AND order_id=$2", org, link.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	expected := map[string]int64{}
	for rows.Next() {
		var id, quantity string
		if err = rows.Scan(&id, &quantity); err != nil {
			return err
		}
		expected[id], err = scaled(quantity, 3)
		if err != nil {
			return err
		}
	}
	if err = rows.Err(); err != nil {
		return err
	}
	if len(items) != len(expected) {
		return ErrConflict
	}
	for _, item := range items {
		quantity, err := scaled(item.Quantity, 3)
		if err != nil || quantity != expected[item.VariantID] {
			return ErrConflict
		}
	}
	return nil
}
func releaseOnlineCart(ctx context.Context, tx pgx.Tx, user, org, cart string) error {
	var id string
	err := tx.QueryRow(ctx, "UPDATE online_orders SET cart_id=NULL,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND cart_id=$2 AND status='READY' RETURNING id::text", org, cart).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return dbError(err)
	}
	_, err = tx.Exec(ctx, "INSERT INTO online_order_events(organization_id,order_id,status,message,actor_id) VALUES($1,$2,'READY','ยกเลิกตะกร้า POS โดยยังไม่ได้บันทึกขาย',$3)", org, id, user)
	return err
}
func completeOnlineOrder(ctx context.Context, tx pgx.Tx, user, org, cart, sale string) error {
	var id string
	err := tx.QueryRow(ctx, "UPDATE online_orders SET status='COMPLETED',sale_id=$3,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND cart_id=$2 AND status='READY' RETURNING id::text", org, cart, sale).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return dbError(err)
	}
	if _, err = tx.Exec(ctx, "INSERT INTO online_order_events(organization_id,order_id,status,message,actor_id) VALUES($1,$2,'COMPLETED','รับชำระและบันทึกขายที่ร้านเรียบร้อยแล้ว',$3)", org, id, user); err != nil {
		return err
	}
	return organization.RecordAudit(ctx, tx, org, user, "online_order.completed", id)
}
