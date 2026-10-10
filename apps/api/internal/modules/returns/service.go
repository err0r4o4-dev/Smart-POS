package returns

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"math/big"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
)

type Service struct{ Organization *organization.Service }

func dbError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, inventory.ErrNotFound) {
		return ErrNotFound
	}
	if errors.Is(err, inventory.ErrInput) {
		return ErrInput
	}
	if errors.Is(err, inventory.ErrConflict) {
		return ErrConflict
	}
	var problem *pgconn.PgError
	if errors.As(err, &problem) {
		switch problem.Code {
		case "23505", "23514", "40001", "40P01", "22003":
			return ErrConflict
		case "23503", "22P02":
			return ErrInput
		case "42501":
			return organization.ErrDenied
		}
	}
	return err
}
func raw(ctx context.Context, tx pgx.Tx, query string, args ...any) (json.RawMessage, error) {
	var value []byte
	err := tx.QueryRow(ctx, query, args...).Scan(&value)
	return json.RawMessage(value), dbError(err)
}

type document struct {
	ID, Branch, Sale, Status, Creator string
	Revision                          int64
}

func header(ctx context.Context, tx pgx.Tx, actor organization.Member, org, id string) (document, error) {
	var value document
	if !uuidPattern.MatchString(id) {
		return value, ErrInput
	}
	err := tx.QueryRow(ctx, "SELECT id::text,branch_id::text,original_sale_id::text,status,created_by::text,revision FROM customer_returns WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, id).Scan(&value.ID, &value.Branch, &value.Sale, &value.Status, &value.Creator, &value.Revision)
	if err != nil {
		return value, dbError(err)
	}
	err = inventory.BranchScope(ctx, tx, actor, org, value.Branch, false)
	return value, dbError(err)
}
func saleScope(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, id string) (string, error) {
	if !uuidPattern.MatchString(id) {
		return "", ErrInput
	}
	var branch, cashier string
	err := tx.QueryRow(ctx, "SELECT branch_id::text,cashier_id::text FROM sales WHERE organization_id=$1 AND id=$2", org, id).Scan(&branch, &cashier)
	if err != nil {
		return "", dbError(err)
	}
	if actor.Role == "CASHIER" && cashier != user {
		return "", organization.ErrDenied
	}
	return branch, dbError(inventory.BranchScope(ctx, tx, actor, org, branch, false))
}
func result(ctx context.Context, tx pgx.Tx, org, id string) (json.RawMessage, error) {
	return raw(ctx, tx, `SELECT to_jsonb(doc)||jsonb_build_object('amount',doc.amount::text,'items',COALESCE((SELECT jsonb_agg(to_jsonb(item)||jsonb_build_object('quantity',item.quantity::text,'refund_amount',item.refund_amount::text,'original_unit_price',item.original_unit_price::text,'original_paid_amount',item.original_paid_amount::text,'product_name',sale.product_name,'sku',sale.sku,'movement_id',movement.id) ORDER BY item.id) FROM customer_return_items item JOIN sale_items sale ON sale.organization_id=item.organization_id AND sale.id=item.original_sale_item_id LEFT JOIN stock_movements movement ON movement.organization_id=item.organization_id AND movement.customer_return_item_id=item.id WHERE item.organization_id=doc.organization_id AND item.return_id=doc.id),'[]'::jsonb),'refund_id',(SELECT id FROM customer_refunds WHERE organization_id=doc.organization_id AND return_id=doc.id)) FROM customer_returns doc WHERE doc.organization_id=$1 AND doc.id=$2`, org, id)
}
func finish(ctx context.Context, tx pgx.Tx, user, org, op, event, id string, value json.RawMessage) (json.RawMessage, error) {
	if err := inventory.CompleteSale(ctx, tx, org, op, value); err != nil {
		return nil, dbError(err)
	}
	if err := organization.RecordAudit(ctx, tx, org, user, event, id); err != nil {
		return nil, err
	}
	return value, dbError(tx.Commit(ctx))
}
func prior(ctx context.Context, tx pgx.Tx, org, saleItem string) (string, string, error) {
	var quantity, amount string
	err := tx.QueryRow(ctx, `SELECT COALESCE(sum(item.quantity),0)::text,COALESCE(sum(item.refund_amount),0)::text FROM customer_return_items item JOIN customer_returns doc ON doc.organization_id=item.organization_id AND doc.id=item.return_id WHERE item.organization_id=$1 AND item.original_sale_item_id=$2 AND doc.status='COMPLETED'`, org, saleItem).Scan(&quantity, &amount)
	return quantity, amount, err
}
func (service *Service) Create(ctx context.Context, user, org, key string, input CreateInput) (json.RawMessage, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, "returns.create")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !validText(input.Reason, 2000, true) || len(input.Items) < 1 || len(input.Items) > 100 {
		return nil, ErrInput
	}
	branch, err := saleScope(ctx, tx, actor, user, org, input.SaleID)
	if err != nil {
		return nil, err
	}
	if err = inventory.BranchScope(ctx, tx, actor, org, branch, true); err != nil {
		return nil, dbError(err)
	}
	op, cached, err := inventory.BeginOperation(ctx, tx, user, org, "customer-return.create", key, input)
	if err != nil || cached != nil {
		return cached, dbError(err)
	}
	id, err := createDocument(ctx, tx, actor, user, org, branch, input)
	if err != nil {
		return nil, err
	}
	value, err := result(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, op, "returns.created", id, value)
}

func createDocument(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, branch string, input CreateInput) (string, error) {
	var err error
	var id string
	err = tx.QueryRow(ctx, "INSERT INTO customer_returns(organization_id,branch_id,original_sale_id,reason,amount,created_by) VALUES($1,$2,$3,$4,0,$5) RETURNING id::text", org, branch, input.SaleID, input.Reason, user).Scan(&id)
	if err != nil {
		return "", dbError(err)
	}
	seen := map[string]bool{}
	total := new(big.Int)
	for _, line := range input.Items {
		if line.BatchID != nil && (!uuidPattern.MatchString(*line.BatchID) || !line.BatchVerified || line.Disposition == "NO_STOCK_RETURN") {
			return "", ErrInput
		}
		if !uuidPattern.MatchString(line.SaleItemID) || seen[line.SaleItemID] {
			return "", ErrInput
		}
		seen[line.SaleItemID] = true
		var variant, sold, paid, price string
		var originalBatch *string
		err = tx.QueryRow(ctx, "SELECT variant_id::text,quantity::text,line_total::text,unit_price::text,batch_id::text FROM sale_items WHERE organization_id=$1 AND sale_id=$2 AND id=$3", org, input.SaleID, line.SaleItemID).Scan(&variant, &sold, &paid, &price, &originalBatch)
		if err != nil {
			return "", dbError(err)
		}
		if line.BatchID != nil && (originalBatch == nil || *originalBatch != *line.BatchID) {
			return "", ErrInput
		}
		if err = inventory.ValidateQuantity(ctx, tx, org, variant, line.Quantity, true); err != nil {
			return "", dbError(err)
		}
		returned, refunded, err := prior(ctx, tx, org, line.SaleItemID)
		if err != nil {
			return "", err
		}
		amount, err := allocation(sold, paid, returned, refunded, line.Quantity)
		if err != nil {
			return "", err
		}
		if err = inventory.ReturnLocation(ctx, tx, actor, org, branch, line.Destination, line.Disposition); err != nil {
			return "", dbError(err)
		}
		minor, _ := units(amount, 2)
		total.Add(total, minor)
		_, err = tx.Exec(ctx, `INSERT INTO customer_return_items(organization_id,return_id,original_sale_id,original_sale_item_id,variant_id,branch_id,quantity,original_unit_price,original_paid_amount,refund_amount,disposition,destination_location_id,batch_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, org, id, input.SaleID, line.SaleItemID, variant, branch, line.Quantity, price, paid, amount, line.Disposition, line.Destination, line.BatchID)
		if err != nil {
			return "", dbError(err)
		}
	}
	_, err = tx.Exec(ctx, "UPDATE customer_returns SET amount=$3 WHERE organization_id=$1 AND id=$2", org, id, fixed(total, 2))
	if err != nil {
		return "", dbError(err)
	}
	return id, nil
}
