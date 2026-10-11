package storefront

import (
	"context"
	"crypto/subtle"
	"errors"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
	"time"
)

func readOrder(ctx context.Context, tx pgx.Tx, org, id string, public bool) (Order, error) {
	result := Order{Items: []Line{}, Events: []Event{}, PaymentStatus: "UNPAID"}
	err := tx.QueryRow(ctx, `SELECT doc.id::text,doc.number,doc.status,doc.customer_name,doc.contact_phone,doc.customer_note,doc.store_name,doc.store_phone,doc.pickup_instructions,doc.estimated_total::text,doc.branch_id::text,doc.terminal_id::text,doc.cart_id::text,doc.sale_id::text,doc.revision,doc.created_at,doc.expires_at,sale.grand_total::text,receipt.receipt_number FROM online_orders doc LEFT JOIN sales sale ON sale.organization_id=doc.organization_id AND sale.id=doc.sale_id LEFT JOIN receipts receipt ON receipt.organization_id=doc.organization_id AND receipt.sale_id=doc.sale_id WHERE doc.organization_id=$1 AND doc.id=$2`, org, id).Scan(&result.ID, &result.Number, &result.Status, &result.CustomerName, &result.ContactPhone, &result.CustomerNote, &result.StoreName, &result.StorePhone, &result.PickupInstructions, &result.EstimatedTotal, &result.BranchID, &result.TerminalID, &result.CartID, &result.SaleID, &result.Revision, &result.CreatedAt, &result.ExpiresAt, &result.FinalTotal, &result.ReceiptNumber)
	if err != nil {
		return result, dbError(err)
	}
	result.Status = effectiveStatus(result.Status, result.ExpiresAt, result.CartID, time.Now())
	if result.Status == "COMPLETED" {
		result.PaymentStatus = "PAID_AT_STORE"
	}
	rows, err := tx.Query(ctx, `SELECT variant_id::text,product_name,variant_name,sku,unit,quantity::text,unit_price::text,line_total::text FROM online_order_items WHERE organization_id=$1 AND order_id=$2 ORDER BY variant_id`, org, id)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var line Line
		if err = rows.Scan(&line.VariantID, &line.ProductName, &line.VariantName, &line.SKU, &line.Unit, &line.Quantity, &line.UnitPrice, &line.LineTotal); err != nil {
			rows.Close()
			return result, err
		}
		result.Items = append(result.Items, line)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	rows, err = tx.Query(ctx, `SELECT status,message,created_at FROM online_order_events WHERE organization_id=$1 AND order_id=$2 ORDER BY id`, org, id)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var event Event
		if err = rows.Scan(&event.Status, &event.Message, &event.CreatedAt); err != nil {
			rows.Close()
			return result, err
		}
		result.Events = append(result.Events, event)
	}
	err = rows.Err()
	rows.Close()
	if public {
		result.CustomerName = ""
		result.ContactPhone = ""
		result.CustomerNote = ""
		result.BranchID = ""
		result.TerminalID = ""
		result.CartID = nil
		result.SaleID = nil
	}
	return result, err
}
func (service *Service) CreateOrder(ctx context.Context, slug, key string, input OrderInput) (Order, error) {
	if !uuidPattern.MatchString(key) || input.validate() != nil {
		return Order{}, ErrInput
	}
	tx, org, err := service.public(ctx, slug, true)
	if err != nil {
		return Order{}, err
	}
	defer tx.Rollback(ctx)
	fingerprint := digest(input)
	var previous, hash string
	err = tx.QueryRow(ctx, "SELECT request_fingerprint,access_hash FROM online_orders WHERE organization_id=$1 AND id=$2", org, key).Scan(&previous, &hash)
	if err == nil {
		if subtle.ConstantTimeCompare([]byte(hash), []byte(accessHash(input.AccessToken))) != 1 {
			return Order{}, ErrNotFound
		}
		if previous != fingerprint {
			return Order{}, ErrConflict
		}
		return readOrder(ctx, tx, org, key, true)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Order{}, err
	}
	shop, err := settings(ctx, tx, org)
	if err != nil {
		return Order{}, err
	}
	quote, err := quote(ctx, tx, org, shop, input.Items)
	if err != nil {
		return Order{}, err
	}
	if quote.ID != input.QuoteID {
		return Order{}, ErrQuote
	}
	_, err = tx.Exec(ctx, `INSERT INTO online_orders(id,organization_id,branch_id,terminal_id,stock_location_id,customer_name,contact_phone,customer_note,pickup_instructions,store_name,store_phone,estimated_total,access_hash,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, key, org, shop.BranchID, shop.TerminalID, shop.LocationID, input.CustomerName, input.ContactPhone, input.CustomerNote, shop.PickupInstructions, shop.Name, shop.ContactPhone, quote.Total, accessHash(input.AccessToken), fingerprint)
	if err != nil {
		return Order{}, dbError(err)
	}
	for _, line := range quote.Items {
		_, err = tx.Exec(ctx, `INSERT INTO online_order_items(organization_id,order_id,variant_id,product_name,variant_name,sku,unit,quantity,unit_price,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, org, key, line.VariantID, line.ProductName, line.VariantName, line.SKU, line.Unit, line.Quantity, line.UnitPrice, line.LineTotal)
		if err != nil {
			return Order{}, dbError(err)
		}
	}
	if _, err = tx.Exec(ctx, "INSERT INTO online_order_events(organization_id,order_id,status) VALUES($1,$2,'PENDING')", org, key); err != nil {
		return Order{}, err
	}
	result, err := readOrder(ctx, tx, org, key, true)
	if err != nil {
		return result, err
	}
	return result, dbError(tx.Commit(ctx))
}
func (service *Service) Track(ctx context.Context, slug string, input TrackingInput) (Order, error) {
	if !slugPattern.MatchString(slug) || !uuidPattern.MatchString(input.OrderID) || !tokenPattern.MatchString(input.AccessToken) {
		return Order{}, ErrNotFound
	}
	tx, err := service.Organization.Pool.Begin(ctx)
	if err != nil {
		return Order{}, err
	}
	defer tx.Rollback(ctx)
	var org *string
	if err = tx.QueryRow(ctx, "SELECT storefront_tracking_resolve($1,$2,$3)::text", slug, input.OrderID, accessHash(input.AccessToken)).Scan(&org); err != nil {
		return Order{}, dbError(err)
	}
	if org == nil {
		return Order{}, ErrNotFound
	}
	if _, err = tx.Exec(ctx, "SELECT set_config('app.organization_id',$1,true),set_config('app.user_id','',true)", *org); err != nil {
		return Order{}, err
	}
	return readOrder(ctx, tx, *org, input.OrderID, true)
}
func (service *Service) Order(ctx context.Context, user, org, id string) (Order, error) {
	tx, actor, err := service.authorized(ctx, user, org, "online_orders.read")
	if err != nil {
		return Order{}, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(id) {
		return Order{}, ErrNotFound
	}
	result, err := readOrder(ctx, tx, org, id, false)
	if err != nil {
		return result, err
	}
	if !branchAllowed(actor, result.BranchID) {
		return Order{}, organization.ErrDenied
	}
	return result, nil
}
func (service *Service) Orders(ctx context.Context, user, org, branch, status string, page int) (Page[Order], error) {
	result := Page[Order]{Items: []Order{}, Page: page, PageSize: 20}
	tx, actor, err := service.authorized(ctx, user, org, "online_orders.read")
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(branch) || page < 1 || page > 10000 {
		return result, ErrInput
	}
	if !branchAllowed(actor, branch) {
		return result, organization.ErrDenied
	}
	if status != "" && status != "PENDING" && status != "PREPARING" && status != "READY" && status != "COMPLETED" && status != "REJECTED" && status != "CANCELLED" && status != "EXPIRED" {
		return result, ErrInput
	}
	where := ` FROM online_orders WHERE organization_id=$1 AND branch_id=$2 AND ($3='' OR CASE WHEN status IN ('PENDING','PREPARING','READY') AND expires_at<=now() AND cart_id IS NULL THEN 'EXPIRED' ELSE status END=$3)`
	if err = tx.QueryRow(ctx, "SELECT count(*)"+where, org, branch, status).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := tx.Query(ctx, "SELECT id::text"+where+" ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $4", org, branch, status, (page-1)*20)
	if err != nil {
		return result, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return result, err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	for _, id := range ids {
		value, err := readOrder(ctx, tx, org, id, false)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, value)
	}
	return result, nil
}
func (service *Service) Transition(ctx context.Context, user, org, id string, input TransitionInput) (Order, error) {
	tx, actor, err := service.authorized(ctx, user, org, "online_orders.manage")
	if err != nil {
		return Order{}, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(id) || !text(input.Message, 1000, false) {
		return Order{}, ErrInput
	}
	current, err := readOrder(ctx, tx, org, id, false)
	if err != nil {
		return current, err
	}
	if !branchAllowed(actor, current.BranchID) {
		return Order{}, organization.ErrDenied
	}
	if current.Revision != input.Revision || current.CartID != nil || !canTransition(current.Status, input.Status) {
		return Order{}, ErrConflict
	}
	if (input.Status == "REJECTED" || input.Status == "CANCELLED") && !text(input.Message, 1000, true) {
		return Order{}, ErrInput
	}
	if input.Status == "PREPARING" || input.Status == "READY" {
		shop := Settings{TerminalID: current.TerminalID, BranchID: current.BranchID}
		if err = tx.QueryRow(ctx, "SELECT stock_location_id::text FROM online_orders WHERE organization_id=$1 AND id=$2", org, id).Scan(&shop.LocationID); err != nil {
			return current, err
		}
		if err = saleSource(ctx, tx, org, shop); err != nil {
			return current, err
		}
		for _, line := range current.Items {
			value, err := product(ctx, tx, org, shop, line.VariantID)
			if err != nil {
				return current, err
			}
			var enough bool
			if err = tx.QueryRow(ctx, "SELECT $1::numeric>=$2::numeric", value.Available, line.Quantity).Scan(&enough); err != nil {
				return current, err
			}
			if !value.Saleable || !enough {
				return current, ErrStock
			}
		}
	}
	if _, err = tx.Exec(ctx, "UPDATE online_orders SET status=$3,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2", org, id, input.Status); err != nil {
		return current, dbError(err)
	}
	if _, err = tx.Exec(ctx, "INSERT INTO online_order_events(organization_id,order_id,status,message,actor_id) VALUES($1,$2,$3,$4,$5)", org, id, input.Status, input.Message, user); err != nil {
		return current, err
	}
	if err = organization.RecordAudit(ctx, tx, org, user, "online_order."+input.Status, id); err != nil {
		return current, err
	}
	result, err := readOrder(ctx, tx, org, id, false)
	if err != nil {
		return result, err
	}
	return result, dbError(tx.Commit(ctx))
}
