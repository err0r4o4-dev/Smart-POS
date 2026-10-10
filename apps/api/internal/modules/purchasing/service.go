package purchasing

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"net/mail"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
)

type Service struct{ Organization *organization.Service }

func dbError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	var problem *pgconn.PgError
	if errors.As(err, &problem) {
		switch problem.Code {
		case "23505", "23514", "40001", "40P01", "22003":
			return ErrConflict
		case "23503", "22P02", "22007":
			return ErrInput
		case "42501":
			return organization.ErrDenied
		}
	}
	return err
}
func raw(ctx context.Context, tx pgx.Tx, query string, args ...any) (json.RawMessage, error) {
	var result []byte
	err := tx.QueryRow(ctx, query, args...).Scan(&result)
	return result, dbError(err)
}
func finish(ctx context.Context, tx pgx.Tx, user, org, op, event, id string, result json.RawMessage) (json.RawMessage, error) {
	if op != "" {
		if err := inventory.CompleteSale(ctx, tx, org, op, result); err != nil {
			return nil, err
		}
	}
	if err := organization.RecordAudit(ctx, tx, org, user, event, id); err != nil {
		return nil, err
	}
	return result, dbError(tx.Commit(ctx))
}
func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}
func checkRevision(ctx context.Context, tx pgx.Tx, org, table, id string, revision int64) error {
	if !uuidPattern.MatchString(id) {
		return ErrInput
	}
	var current int64
	err := tx.QueryRow(ctx, "SELECT revision FROM "+table+" WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, id).Scan(&current)
	if err != nil {
		return dbError(err)
	}
	if current != revision {
		return ErrConflict
	}
	return nil
}
func (service *Service) SaveSupplier(ctx context.Context, user, org, id string, input SupplierInput) (json.RawMessage, error) {
	permission := "supplier.create"
	if id != "" {
		permission = "supplier.update"
	}
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	if !codePattern.MatchString(input.Code) || !text(input.Name, 200, true) || !text(input.ContactPerson, 200, false) || !text(input.Email, 254, false) || !text(input.Phone, 80, false) || !text(input.Address, 2000, false) || !text(input.TaxIdentifier, 100, false) || !text(input.Notes, 2000, false) || !contains([]string{"ACTIVE", "INACTIVE", "ARCHIVED"}, input.Status) {
		return nil, ErrInput
	}
	if input.Email != "" {
		address, err := mail.ParseAddress(input.Email)
		if err != nil || address.Address != input.Email {
			return nil, ErrInput
		}
	}
	if input.Status == "ARCHIVED" && !contains(actor.Permissions, "supplier.archive") {
		return nil, organization.ErrDenied
	}
	if id != "" {
		if err = checkRevision(ctx, tx, org, "suppliers", id, input.Revision); err != nil {
			return nil, err
		}
		_, err = tx.Exec(ctx, `UPDATE suppliers SET code=$3,name=$4,contact_person=$5,email=$6,phone=$7,address=$8,tax_identifier=$9,notes=$10,status=$11,revision=revision+1,updated_by=$12,updated_at=now() WHERE organization_id=$1 AND id=$2`, org, id, input.Code, input.Name, input.ContactPerson, input.Email, input.Phone, input.Address, input.TaxIdentifier, input.Notes, input.Status, user)
	} else {
		err = tx.QueryRow(ctx, `INSERT INTO suppliers(organization_id,code,name,contact_person,email,phone,address,tax_identifier,notes,status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING id::text`, org, input.Code, input.Name, input.ContactPerson, input.Email, input.Phone, input.Address, input.TaxIdentifier, input.Notes, input.Status, user).Scan(&id)
	}
	if err != nil {
		return nil, dbError(err)
	}
	result, err := raw(ctx, tx, "SELECT to_jsonb(item) FROM suppliers item WHERE organization_id=$1 AND id=$2", org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, "", "supplier.saved", id, result)
}

type variantInfo struct{ Name, SKU, UnitID, UnitType, UnitName, Factor, PurchaseType string }

func conversion(ctx context.Context, tx pgx.Tx, org, variant, unit string) (variantInfo, error) {
	var item variantInfo
	if !uuidPattern.MatchString(variant) || !uuidPattern.MatchString(unit) {
		return item, ErrInput
	}
	var base *string
	err := tx.QueryRow(ctx, `SELECT product.name||' / '||variant.name,variant.sku,variant.unit_id::text,stock.unit_type,purchase.name,purchase.conversion_factor::text,purchase.unit_type,purchase.base_unit_id::text FROM product_variants variant JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id JOIN units stock ON stock.organization_id=variant.organization_id AND stock.id=variant.unit_id JOIN units purchase ON purchase.organization_id=variant.organization_id AND purchase.id=$3 WHERE variant.organization_id=$1 AND variant.id=$2 AND variant.status='ACTIVE' AND product.status='ACTIVE' AND stock.status='ACTIVE' AND purchase.status='ACTIVE'`, org, variant, unit).Scan(&item.Name, &item.SKU, &item.UnitID, &item.UnitType, &item.UnitName, &item.Factor, &item.PurchaseType, &base)
	if err != nil {
		return item, dbError(err)
	}
	if unit == item.UnitID {
		item.Factor = "1.000000"
	} else if base == nil || *base != item.UnitID {
		return item, ErrInput
	}
	return item, nil
}
func (service *Service) SaveProduct(ctx context.Context, user, org, supplier, id string, input ProductInput) (json.RawMessage, error) {
	tx, _, err := service.Organization.Authorized(ctx, user, org, "supplier.update")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(supplier) {
		return nil, ErrInput
	}
	var status string
	err = tx.QueryRow(ctx, "SELECT status FROM suppliers WHERE organization_id=$1 AND id=$2", org, supplier).Scan(&status)
	if err != nil {
		return nil, dbError(err)
	}
	if status != "ACTIVE" {
		return nil, ErrConflict
	}
	item, err := conversion(ctx, tx, org, input.VariantID, input.PurchaseUnitID)
	if err != nil {
		return nil, err
	}
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	minimum, err := decimal(input.Minimum, 3)
	if err != nil || minimum <= 0 {
		return nil, ErrInput
	}
	multiple, err := decimal(input.Multiple, 3)
	if err != nil || multiple <= 0 {
		return nil, ErrInput
	}
	if _, err = decimal(input.UnitCost, 2); err != nil || input.LeadTime < 0 || input.LeadTime > 3650 || !text(input.SupplierSKU, 100, false) || !contains([]string{"ACTIVE", "INACTIVE"}, input.Status) {
		return nil, ErrInput
	}
	for _, amount := range []int64{minimum, multiple} {
		base, err := convert(amount, item.Factor)
		if err != nil || ((item.PurchaseType == "COUNT" || item.PurchaseType == "PACKAGING") && amount%1000 != 0) {
			return nil, ErrInput
		}
		if err = inventory.ValidateQuantity(ctx, tx, org, input.VariantID, fixed(base, 3), true); err != nil {
			return nil, err
		}
	}
	if id != "" {
		if err = checkRevision(ctx, tx, org, "supplier_products", id, input.Revision); err != nil {
			return nil, err
		}
		changed, err := tx.Exec(ctx, `UPDATE supplier_products SET supplier_sku=$4,purchase_unit_id=$5,unit_cost=$6,minimum_order_quantity=$7,order_multiple=$8,lead_time_days=$9,is_preferred=$10,status=$11,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2 AND supplier_id=$3 AND variant_id=$12`, org, id, supplier, input.SupplierSKU, input.PurchaseUnitID, input.UnitCost, input.Minimum, input.Multiple, input.LeadTime, input.Preferred, input.Status, input.VariantID)
		if err != nil {
			return nil, dbError(err)
		}
		if changed.RowsAffected() != 1 {
			return nil, ErrConflict
		}
	} else {
		err = tx.QueryRow(ctx, `INSERT INTO supplier_products(organization_id,supplier_id,variant_id,purchase_unit_id,supplier_sku,unit_cost,minimum_order_quantity,order_multiple,lead_time_days,is_preferred,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id::text`, org, supplier, input.VariantID, input.PurchaseUnitID, input.SupplierSKU, input.UnitCost, input.Minimum, input.Multiple, input.LeadTime, input.Preferred, input.Status).Scan(&id)
		if err != nil {
			return nil, dbError(err)
		}
	}
	result, err := raw(ctx, tx, `SELECT to_jsonb(item)||jsonb_build_object('unit_cost',unit_cost::text,'minimum_order_quantity',minimum_order_quantity::text,'order_multiple',order_multiple::text) FROM supplier_products item WHERE organization_id=$1 AND id=$2`, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, "", "supplier.product.saved", id, result)
}
