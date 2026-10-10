package inventory

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
	"sort"
)

func BeginOperation(ctx context.Context, tx pgx.Tx, user, org, name, key string, input any) (string, json.RawMessage, error) {
	return operation(ctx, tx, user, org, name, key, input)
}

func ValidateQuantity(ctx context.Context, tx pgx.Tx, org, variant, amount string, positive bool) error {
	return validVariant(ctx, tx, org, variant, amount, positive)
}

func BranchScope(ctx context.Context, tx pgx.Tx, actor organization.Member, org, branch string, write bool) error {
	return scope(ctx, tx, actor, org, branch, write)
}

func SupplyLocation(ctx context.Context, tx pgx.Tx, actor organization.Member, org, branch, id, kind string) error {
	item, err := physical(ctx, tx, actor, org, id, true)
	if err != nil {
		return err
	}
	if item.BranchID != branch || (kind == "RECEIPT" && item.Type != "WAREHOUSE") || (kind == "RETURN" && !contains([]string{"WAREHOUSE", "SHELF", "SALES_FLOOR", "DAMAGED", "QUARANTINE"}, item.Type)) {
		return ErrConflict
	}
	return nil
}

func PostSupply(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, op, document, branch, locationID, kind string, items []Item) error {
	if !contains([]string{"RECEIPT", "RETURN"}, kind) || len(items) == 0 || len(items) > 100 {
		return ErrInput
	}
	if err := SupplyLocation(ctx, tx, actor, org, branch, locationID, kind); err != nil {
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
		movement := "PURCHASE_RECEIVE"
		if kind == "RETURN" {
			movement = "SUPPLIER_RETURN"
			amount = -amount
		}
		_, err = tx.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by,purchasing_document_id) VALUES($1,$2,$3,$4,$5,$6,$7,$5,$8,$9)`, org, branch, locationID, item.VariantID, movement, decimal(amount), op, user, document)
		if err != nil {
			return databaseError(err)
		}
	}
	return nil
}

func (service *Service) Replenish(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, op, branch, source, destination, variant, amount string) (string, error) {
	if err := SupplyLocation(ctx, tx, actor, org, branch, source, "RECEIPT"); err != nil {
		return "", err
	}
	if err := SaleLocation(ctx, tx, actor, org, branch, destination); err != nil {
		return "", err
	}
	if source == destination {
		return "", ErrInput
	}
	if err := validVariant(ctx, tx, org, variant, amount, true); err != nil {
		return "", err
	}
	var id string
	err := tx.QueryRow(ctx, `INSERT INTO inventory_documents(organization_id,kind,status,branch_id,location_id,destination_branch_id,destination_location_id,reason_code,created_by,approved_by,approved_at) VALUES($1,'TRANSFER','APPROVED',$2,$3,$2,$4,'SHELF_REPLENISHMENT',$5,$5,now()) RETURNING id::text`, org, branch, source, destination, user).Scan(&id)
	if err != nil {
		return "", databaseError(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO inventory_document_items(organization_id,document_id,variant_id,quantity) VALUES($1,$2,$3,$4)`, org, id, variant, amount); err != nil {
		return "", databaseError(err)
	}
	doc := Document{ID: id, Kind: "TRANSFER", Status: "APPROVED", BranchID: branch, LocationID: source, DestinationBranchID: &branch, DestinationLocationID: &destination, Reason: "SHELF_REPLENISHMENT", CreatedBy: user}
	next, err := service.moveTransfer(ctx, tx, actor, user, org, op, doc, []storedItem{{VariantID: variant, Quantity: amount}}, "dispatch")
	if err != nil {
		return "", err
	}
	if next != "RECEIVED" {
		return "", ErrConflict
	}
	_, err = tx.Exec(ctx, `UPDATE inventory_documents SET status='RECEIVED',dispatched_by=$3,received_by=$3,dispatched_at=now(),received_at=now(),revision=revision+1 WHERE organization_id=$1 AND id=$2`, org, id, user)
	if err != nil {
		return "", databaseError(err)
	}
	return id, organization.RecordAudit(ctx, tx, org, user, "inventory.transfer.replenished", id)
}
