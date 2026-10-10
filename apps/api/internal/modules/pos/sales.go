package pos

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"log/slog"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/loyalty"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pricing"
)

func settle(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org string, item Checkout) (string, error) {
	var credit, external string
	var adjustment *string
	if err := tx.QueryRow(ctx, "SELECT credit_amount::text,(total-credit_amount)::text,adjustment_id::text FROM pos_checkouts WHERE organization_id=$1 AND id=$2", org, item.ID).Scan(&credit, &external, &adjustment); err != nil {
		return "", err
	}
	value, err := terminal(ctx, tx, actor, org, item.TerminalID, true)
	if err != nil {
		return "", err
	}
	shift, err := ownShift(ctx, tx, org, value.ID, user)
	if err != nil || shift != item.ShiftID {
		return "", ErrConflict
	}
	cart, err := cartHeader(ctx, tx, actor, user, org, item.CartID)
	if err != nil {
		return "", err
	}
	var revision int64
	if err = tx.QueryRow(ctx, "SELECT cart_revision FROM pos_checkouts WHERE organization_id=$1 AND id=$2", org, item.ID).Scan(&revision); err != nil {
		return "", err
	}
	if cart.Status != "ACTIVE" || cart.Revision != revision {
		return "", ErrConflict
	}
	if err = revalidate(ctx, tx, org, item); err != nil {
		return "", err
	}
	if err = validateReward(ctx, tx, actor, org, item); err != nil {
		return "", err
	}
	movements := []inventory.Item{}
	for _, snapshot := range item.Items {
		current, err := variant(ctx, tx, org, value.StockLocationID, snapshot.VariantID, snapshot.Quantity, snapshot.UnitPrice)
		if err != nil {
			return "", err
		}
		if !current.Saleable {
			return "", ErrConflict
		}
		if current.PriceChanged {
			return "", ErrPrice
		}
		quantity, _ := scaled(current.Quantity, 3)
		stock, _ := scaled(current.Available, 3)
		if stock < quantity {
			return "", ErrStock
		}
		movements = append(movements, inventory.Item{VariantID: snapshot.VariantID, Quantity: snapshot.Quantity})
	}
	op, err := inventory.BeginSale(ctx, tx, user, org, item.ID, item.Items)
	if err != nil {
		return "", dbError(err)
	}
	var sale string
	quoteData, _ := json.Marshal(item.Pricing)
	err = tx.QueryRow(ctx, `INSERT INTO sales(organization_id,branch_id,terminal_id,shift_id,cart_id,checkout_id,cashier_id,currency,subtotal,grand_total,inventory_operation_id,store_name,branch_name,store_address,terminal_name,cashier_name,discount_total,pricing_snapshot,customer_id,customer_code_snapshot)
 SELECT $1,$2,$3,$4,$5,$6,$7,'THB',$12,$8,$9,organization.name,branch.name,CASE WHEN branch.address<>'' THEN branch.address ELSE organization.address END,$10,$11,$13,$14,$15,$16 FROM organizations organization JOIN branches branch ON branch.organization_id=organization.id AND branch.id=$2 WHERE organization.id=$1 RETURNING id::text`, org, item.BranchID, item.TerminalID, item.ShiftID, item.CartID, item.ID, user, item.Total, op, value.Name, actor.DisplayName, item.Pricing.Subtotal, item.Pricing.Discount, quoteData, item.CustomerID, item.CustomerCode).Scan(&sale)
	if err != nil {
		return "", dbError(err)
	}
	for _, snapshot := range item.Items {
		_, err = tx.Exec(ctx, `INSERT INTO sale_items(organization_id,sale_id,variant_id,stock_location_id,branch_id,product_name,variant_name,sku,barcode,unit,quantity,unit_price,line_total,discount_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, org, sale, snapshot.VariantID, value.StockLocationID, item.BranchID, snapshot.ProductName, snapshot.VariantName, snapshot.SKU, snapshot.Barcode, snapshot.Unit, snapshot.Quantity, snapshot.UnitPrice, snapshot.LineTotal, snapshot.DiscountTotal)
		if err != nil {
			return "", dbError(err)
		}
	}
	if err = inventory.PostSale(ctx, tx, actor, user, org, op, sale, item.BranchID, value.StockLocationID, movements); err != nil {
		return "", dbError(err)
	}
	if err = pricing.Redeem(ctx, tx, org, sale, item.Pricing); err != nil {
		return "", dbError(err)
	}
	if err = loyalty.PostSale(ctx, tx, user, org, sale); err != nil {
		return "", dbError(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO sale_payments(organization_id,sale_id,checkout_id,method,status,amount,credit_amount,received,change,reference,confirmed_by,confirmed_at) SELECT organization_id,$3,id,method,'CONFIRMED',total-credit_amount,credit_amount,received,change,reference,confirmed_by,confirmed_at FROM pos_checkouts WHERE organization_id=$1 AND id=$2`, org, item.ID, sale)
	if err != nil {
		return "", dbError(err)
	}
	if _, err = tx.Exec(ctx, "INSERT INTO receipts(organization_id,sale_id) VALUES($1,$2)", org, sale); err != nil {
		return "", dbError(err)
	}
	if item.Method == "CASH" {
		_, err = tx.Exec(ctx, "UPDATE register_shifts SET cash_sales=cash_sales+$3::numeric,expected_cash=expected_cash+$3::numeric WHERE organization_id=$1 AND id=$2 AND status='OPEN'", org, item.ShiftID, external)
		if err != nil {
			return "", dbError(err)
		}
	}
	if _, err = tx.Exec(ctx, "UPDATE pos_carts SET status='COMPLETED',revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2", org, item.CartID); err != nil {
		return "", err
	}
	if _, err = tx.Exec(ctx, "UPDATE pos_checkouts SET status='COMPLETED',failure_code='' WHERE organization_id=$1 AND id=$2", org, item.ID); err != nil {
		return "", err
	}
	result, _ := json.Marshal(map[string]string{"sale_id": sale, "checkout_id": item.ID})
	if err = inventory.CompleteSale(ctx, tx, org, op, result); err != nil {
		return "", err
	}
	if adjustment == nil {
		if _, err = tx.Exec(ctx, "SET CONSTRAINTS sale_consistency,pricing_sale_consistency IMMEDIATE"); err != nil {
			return "", dbError(err)
		}
	}
	return sale, nil
}

func (service *Service) CompleteCheckout(ctx context.Context, user, org, id string) (Checkout, error) {
	tx, actor, err := service.begin(ctx, user, org, "pos.checkout")
	if err != nil {
		return Checkout{}, err
	}
	defer tx.Rollback(ctx)
	item, err := checkout(ctx, tx, actor, user, org, id)
	if err != nil {
		return item, err
	}
	if item.CashierID != user || !allowed(actor.Permissions, paymentPermission(item.Method)) {
		return item, organization.ErrDenied
	}
	if item.Status == "COMPLETED" {
		if err = pricing.CurrentApprover(ctx, tx, org, item.Pricing.ApprovalID); err != nil {
			return item, err
		}
		return item, nil
	}
	if !allowed([]string{"CONFIRMED", "RECONCILIATION_REQUIRED"}, item.Status) {
		return item, ErrPending
	}
	if _, err = tx.Exec(ctx, "SAVEPOINT sale_posting"); err != nil {
		return item, err
	}
	sale, problem := settle(ctx, tx, actor, user, org, item)
	if problem != nil {
		slog.Warn("POS settlement requires reconciliation", "checkout_id", item.ID, "reason", problem.Error())
		if _, err = tx.Exec(ctx, "ROLLBACK TO SAVEPOINT sale_posting"); err != nil {
			return item, err
		}
		code := "SALE_POSTING_FAILED"
		if errors.Is(problem, ErrStock) {
			code = "INSUFFICIENT_STOCK"
		}
		if errors.Is(problem, ErrPrice) {
			code = "PRICE_CHANGED"
		}
		if errors.Is(problem, ErrCustomer) {
			code = "CUSTOMER_UNAVAILABLE"
		}
		_, err = tx.Exec(ctx, "UPDATE pos_checkouts SET status='RECONCILIATION_REQUIRED',failure_code=$3 WHERE organization_id=$1 AND id=$2", org, id, code)
		if err != nil {
			return item, dbError(err)
		}
		result, err := checkout(ctx, tx, actor, user, org, id)
		if err != nil {
			return result, err
		}
		return result, finish(ctx, tx, org, user, "pos.checkout.reconciliation_required", id)
	}
	if _, err = tx.Exec(ctx, "RELEASE SAVEPOINT sale_posting"); err != nil {
		return item, err
	}
	result, err := checkout(ctx, tx, actor, user, org, id)
	if err != nil {
		return result, err
	}
	return result, finish(ctx, tx, org, user, "pos.sale.completed", sale)
}

func saleResult(ctx context.Context, tx pgx.Tx, org, id string) (json.RawMessage, error) {
	return raw(ctx, tx, `SELECT to_jsonb(sale)||jsonb_build_object('subtotal',sale.subtotal::text,'discount_total',sale.discount_total::text,'tax_total',sale.tax_total::text,'grand_total',sale.grand_total::text,
 'items',COALESCE((SELECT jsonb_agg(to_jsonb(item)||jsonb_build_object('quantity',item.quantity::text,'unit_price',item.unit_price::text,'line_total',item.line_total::text) ORDER BY item.sku) FROM sale_items item WHERE item.organization_id=sale.organization_id AND item.sale_id=sale.id),'[]'::jsonb),
 'payment',(SELECT to_jsonb(payment)||jsonb_build_object('amount',payment.amount::text,'credit_amount',payment.credit_amount::text,'received',payment.received::text,'change',payment.change::text) FROM sale_payments payment WHERE payment.organization_id=sale.organization_id AND payment.sale_id=sale.id),
 'receipt',(SELECT to_jsonb(receipt) FROM receipts receipt WHERE receipt.organization_id=sale.organization_id AND receipt.sale_id=sale.id),
 'movements',COALESCE((SELECT jsonb_agg(to_jsonb(movement)||jsonb_build_object('quantity_delta',movement.quantity_delta::text,'quantity_before',movement.quantity_before::text,'quantity_after',movement.quantity_after::text)) FROM stock_movements movement WHERE movement.organization_id=sale.organization_id AND movement.sale_id=sale.id),'[]'::jsonb),
 'adjustments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'number',number,'status',status,'net_difference',net_difference::text)) FROM sale_adjustments WHERE organization_id=sale.organization_id AND (original_sale_id=sale.id OR replacement_sale_id=sale.id)),'[]'::jsonb), 'returns',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'number',number,'status',status)) FROM customer_returns WHERE organization_id=sale.organization_id AND original_sale_id=sale.id),'[]'::jsonb), 'audit',COALESCE((SELECT jsonb_agg(to_jsonb(event) ORDER BY created_at) FROM organization_audit_events event WHERE event.organization_id=sale.organization_id AND event.object_id IN (sale.id,sale.checkout_id)),'[]'::jsonb)) FROM sales sale WHERE organization_id=$1 AND id=$2`, org, id)
}
func (service *Service) Sale(ctx context.Context, user, org, id string, receipt bool) (json.RawMessage, error) {
	permission := "sales.read"
	if receipt {
		permission = "receipts.read"
	}
	tx, actor, err := service.begin(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(id) {
		return nil, ErrInput
	}
	if receipt {
		if err = tx.QueryRow(ctx, "SELECT sale_id::text FROM receipts WHERE organization_id=$1 AND id=$2", org, id).Scan(&id); err != nil {
			return nil, dbError(err)
		}
	}
	var branch, cashier string
	err = tx.QueryRow(ctx, "SELECT branch_id::text,cashier_id::text FROM sales WHERE organization_id=$1 AND id=$2", org, id).Scan(&branch, &cashier)
	if err != nil {
		return nil, dbError(err)
	}
	if err = scope(ctx, tx, actor, org, branch, false); err != nil {
		return nil, err
	}
	if actor.Role == "CASHIER" && cashier != user {
		return nil, organization.ErrDenied
	}
	return saleResult(ctx, tx, org, id)
}
