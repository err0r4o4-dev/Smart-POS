package inventory

import (
	"context"
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
	_, err := tx.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by,customer_return_item_id,batch_id) VALUES($1,$2,$3,$4,'SALE_RETURN',$5,$6,$7,$8,$9,$10)`, org, branch, *destination, variant, amount, op, disposition, user, item, batch)
	return databaseError(err)
}
