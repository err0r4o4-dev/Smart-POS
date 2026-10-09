package inventory

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
	"sort"
)

func SaleLocation(ctx context.Context, tx pgx.Tx, actor organization.Member, org, branch, id string) error {
	item, err := physical(ctx, tx, actor, org, id, true)
	if err != nil {
		return err
	}
	if item.BranchID != branch || !contains([]string{"WAREHOUSE", "SALES_FLOOR", "SHELF"}, item.Type) {
		return ErrConflict
	}
	return nil
}

func BeginSale(ctx context.Context, tx pgx.Tx, user, org, key string, input any) (string, error) {
	id, cached, err := operation(ctx, tx, user, org, "sale", key, input)
	if err == nil && cached != nil {
		return "", ErrConflict
	}
	return id, err
}

func PostSale(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, op, sale, branch, location string, items []Item) error {
	if err := SaleLocation(ctx, tx, actor, org, branch, location); err != nil {
		return err
	}
	sorted := append([]Item(nil), items...)
	sort.Slice(sorted, func(left, right int) bool { return sorted[left].VariantID < sorted[right].VariantID })
	for _, item := range sorted {
		amount, err := quantity(item.Quantity)
		if err != nil || amount <= 0 {
			return ErrInput
		}
		if err = validVariant(ctx, tx, org, item.VariantID, item.Quantity, true); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by,sale_id) VALUES($1,$2,$3,$4,'SALE',$5,$6,'POS_SALE',$7,$8)`, org, branch, location, item.VariantID, decimal(-amount), op, user, sale)
		if err != nil {
			return databaseError(err)
		}
	}
	return nil
}

func CompleteSale(ctx context.Context, tx pgx.Tx, org, op string, result json.RawMessage) error {
	_, err := tx.Exec(ctx, "UPDATE inventory_operations SET result=$3 WHERE organization_id=$1 AND id=$2 AND result IS NULL", org, op, []byte(result))
	return databaseError(err)
}
