package storefront

import (
	"context"

	"github.com/jackc/pgx/v5"
)

func menuSaleSource(ctx context.Context, tx pgx.Tx, org string, shop Settings) error {
	var active bool
	err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM branches branch JOIN organizations organization ON organization.id=branch.organization_id WHERE branch.organization_id=$1 AND branch.id=$2 AND branch.status='ACTIVE' AND organization.status='ACTIVE')`, org, shop.BranchID).Scan(&active)
	if err != nil {
		return err
	}
	if !active {
		return ErrClosed
	}
	return nil
}

func orderSaleSource(ctx context.Context, tx pgx.Tx, org, order string, shop Settings) (Settings, error) {
	var policy string
	if err := tx.QueryRow(ctx, "SELECT stock_policy FROM online_orders WHERE organization_id=$1 AND id=$2 AND branch_id=$3", org, order, shop.BranchID).Scan(&policy); err != nil {
		return shop, dbError(err)
	}
	switch policy {
	case "MENU_ONLY":
		shop.LocationID = ""
		return shop, menuSaleSource(ctx, tx, org, shop)
	case "TRACKED":
		if err := tx.QueryRow(ctx, "SELECT stock_location_id::text FROM online_orders WHERE organization_id=$1 AND id=$2 AND branch_id=$3", org, order, shop.BranchID).Scan(&shop.LocationID); err != nil {
			return shop, dbError(err)
		}
		return shop, saleSource(ctx, tx, org, shop)
	default:
		return shop, ErrConflict
	}
}
