package catalog

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
)

const variantColumns = "id::text,organization_id::text,product_id::text,sku,name,attributes,unit_id::text,cost_price::text,selling_price::text,status,revision,currency"

func readVariant(row pgx.Row) (Variant, error) {
	item := Variant{Barcodes: []Barcode{}}
	err := row.Scan(&item.ID, &item.OrganizationID, &item.ProductID, &item.SKU, &item.Name, &item.Attributes, &item.UnitID, &item.CostPrice, &item.SellingPrice, &item.Status, &item.Revision, &item.Currency)
	return item, databaseError(err)
}
func variants(ctx context.Context, tx pgx.Tx, org, product string) ([]Variant, error) {
	items := []Variant{}
	rows, err := tx.Query(ctx, "SELECT "+variantColumns+" FROM product_variants WHERE organization_id=$1 AND product_id=$2 ORDER BY created_at,id", org, product)
	if err != nil {
		return items, err
	}
	for rows.Next() {
		item, err := readVariant(rows)
		if err != nil {
			rows.Close()
			return items, err
		}
		items = append(items, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return items, err
	}
	for index := range items {
		items[index].Barcodes, err = barcodes(ctx, tx, org, items[index].ID)
		if err != nil {
			return items, err
		}
	}
	return items, nil
}
func saveVariant(ctx context.Context, tx pgx.Tx, org, product, id string, input VariantInput) (Variant, error) {
	if err := input.validate(); err != nil {
		return Variant{}, err
	}
	if err := reference(ctx, tx, org, "units", &input.UnitID); err != nil {
		return Variant{}, err
	}
	var productStatus string
	if err := tx.QueryRow(ctx, "SELECT status FROM products WHERE organization_id=$1 AND id=$2", org, product).Scan(&productStatus); err != nil {
		return Variant{}, databaseError(err)
	}
	if productStatus == "ARCHIVED" {
		return Variant{}, ErrConflict
	}
	attributes, _ := json.Marshal(input.Attributes)
	var row pgx.Row
	if id == "" {
		var count int
		if err := tx.QueryRow(ctx, "SELECT count(*) FROM product_variants WHERE organization_id=$1 AND product_id=$2", org, product).Scan(&count); err != nil {
			return Variant{}, err
		}
		if count >= 100 {
			return Variant{}, ErrConflict
		}
		row = tx.QueryRow(ctx, "INSERT INTO product_variants(organization_id,product_id,sku,name,attributes,unit_id,cost_price,selling_price,status,currency) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,currency FROM organizations WHERE id=$1 RETURNING "+variantColumns, org, product, input.SKU, input.Name, attributes, input.UnitID, input.CostPrice, input.SellingPrice, input.Status)
	} else {
		current, err := readVariant(tx.QueryRow(ctx, "SELECT "+variantColumns+" FROM product_variants WHERE organization_id=$1 AND product_id=$2 AND id=$3", org, product, id))
		if err != nil {
			return Variant{}, err
		}
		if current.Revision != input.Revision || current.SKU != input.SKU {
			return Variant{}, ErrConflict
		}
		if productStatus == "ACTIVE" && current.Status == "ACTIVE" && input.Status != "ACTIVE" {
			var count int
			if err = tx.QueryRow(ctx, "SELECT count(*) FROM product_variants WHERE organization_id=$1 AND product_id=$2 AND status='ACTIVE'", org, product).Scan(&count); err != nil {
				return Variant{}, err
			}
			if count <= 1 {
				return Variant{}, ErrConflict
			}
		}
		row = tx.QueryRow(ctx, "UPDATE product_variants SET name=$4,attributes=$5,unit_id=$6,cost_price=$7,selling_price=$8,status=$9,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND product_id=$2 AND id=$3 RETURNING "+variantColumns, org, product, id, input.Name, attributes, input.UnitID, input.CostPrice, input.SellingPrice, input.Status)
	}
	item, err := readVariant(row)
	if err != nil {
		return item, err
	}
	item.Barcodes, err = barcodes(ctx, tx, org, item.ID)
	return item, err
}
func (service *Service) SaveVariant(ctx context.Context, user, org, product, id string, input VariantInput) (Variant, error) {
	permission := "catalog.update"
	if id == "" {
		permission = "catalog.create"
	}
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	if err != nil {
		return Variant{}, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(product) || (id != "" && !uuidPattern.MatchString(id)) {
		return Variant{}, ErrNotFound
	}
	if id != "" {
		current, err := readVariant(tx.QueryRow(ctx, "SELECT "+variantColumns+" FROM product_variants WHERE organization_id=$1 AND product_id=$2 AND id=$3", org, product, id))
		if err != nil {
			return Variant{}, err
		}
		if input.Status == "ARCHIVED" || current.Status == "ARCHIVED" {
			allowed := false
			for _, value := range actor.Permissions {
				if value == "catalog.archive" {
					allowed = true
				}
			}
			if !allowed {
				return Variant{}, organization.ErrDenied
			}
		}
	}
	item, err := saveVariant(ctx, tx, org, product, id, input)
	if err != nil {
		return item, err
	}
	err = finish(ctx, tx, org, user, "catalog.variant.saved", item.ID)
	return item, err
}
