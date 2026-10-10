package inventory

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
)

func ReturnLocation(ctx context.Context, tx pgx.Tx, actor organization.Member, org, branch string, destination *string, disposition string) error {
	if disposition == "NO_STOCK_RETURN" {
		if destination != nil {
			return ErrInput
		}
		return nil
	}
	if destination == nil || !contains([]string{"RESTOCK_SELLABLE", "QUARANTINE", "DAMAGED"}, disposition) {
		return ErrInput
	}
	value, err := physical(ctx, tx, actor, org, *destination, true)
	if err != nil {
		return err
	}
	if value.BranchID != branch {
		return ErrConflict
	}
	if disposition == "RESTOCK_SELLABLE" && !contains([]string{"WAREHOUSE", "SALES_FLOOR", "SHELF"}, value.Type) {
		return ErrConflict
	}
	if disposition == "QUARANTINE" && value.Type != "QUARANTINE" {
		return ErrConflict
	}
	if disposition == "DAMAGED" && value.Type != "DAMAGED" {
		return ErrConflict
	}
	return nil
}
func PostCustomerReturn(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, op, branch, item, variant, amount string, destination *string, disposition string, batch *string) error {
	if err := ReturnLocation(ctx, tx, actor, org, branch, destination, disposition); err != nil {
		return err
	}
	if err := validVariant(ctx, tx, org, variant, amount, true); err != nil {
		return err
	}
	if disposition == "NO_STOCK_RETURN" {
		return nil
	}
	if disposition == "RESTOCK_SELLABLE" {
		var eligible bool
		err := tx.QueryRow(ctx, `SELECT shelf.status='ACTIVE' AND EXISTS(
 SELECT 1 FROM shelf_assignments assignment
 LEFT JOIN stock_balances balance ON balance.organization_id=assignment.organization_id AND balance.location_id=shelf.stock_location_id AND balance.variant_id=assignment.variant_id
 WHERE assignment.organization_id=shelf.organization_id AND assignment.shelf_id=shelf.id AND assignment.variant_id=$4 AND assignment.status='ACTIVE'
 AND COALESCE(balance.quantity,0)+$5::numeric<=assignment.capacity_quantity)
 FROM shelves shelf WHERE shelf.organization_id=$1 AND shelf.branch_id=$2 AND shelf.stock_location_id=$3`, org, branch, *destination, variant, amount).Scan(&eligible)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return databaseError(err)
		}
		if err == nil && !eligible {
			return ErrConflict
		}
	}
	_, err := tx.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by,customer_return_item_id,batch_id) VALUES($1,$2,$3,$4,'SALE_RETURN',$5,$6,$7,$8,$9,$10)`, org, branch, *destination, variant, amount, op, disposition, user, item, batch)
	return databaseError(err)
}
