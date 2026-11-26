package catalog

import (
	"context"
	"github.com/jackc/pgx/v5"
)

type SaleVariant struct {
	VariantID     string `json:"variant_id"`
	ProductName   string `json:"product_name"`
	VariantName   string `json:"variant_name"`
	SKU           string `json:"sku"`
	Barcode       string `json:"barcode"`
	Unit          string `json:"unit"`
	UnitType      string `json:"unit_type"`
	UnitPrice     string `json:"unit_price"`
	Currency      string `json:"currency"`
	ProductStatus string `json:"product_status"`
	VariantStatus string `json:"variant_status"`
	UnitStatus    string `json:"unit_status"`
}

func ReadSaleVariant(ctx context.Context, tx pgx.Tx, org, id string) (SaleVariant, error) {
	var item SaleVariant
	err := tx.QueryRow(ctx, `SELECT variant.id::text,product.name,variant.name,variant.sku,COALESCE((SELECT code FROM product_barcodes WHERE organization_id=variant.organization_id AND variant_id=variant.id ORDER BY is_primary DESC,created_at,id LIMIT 1),''),unit.name,unit.unit_type,variant.selling_price::text,variant.currency,product.status,variant.status,unit.status FROM product_variants variant JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id JOIN units unit ON unit.organization_id=variant.organization_id AND unit.id=variant.unit_id WHERE variant.organization_id=$1 AND variant.id=$2`, org, id).Scan(&item.VariantID, &item.ProductName, &item.VariantName, &item.SKU, &item.Barcode, &item.Unit, &item.UnitType, &item.UnitPrice, &item.Currency, &item.ProductStatus, &item.VariantStatus, &item.UnitStatus)
	return item, databaseError(err)
}

func SearchSaleVariants(ctx context.Context, tx pgx.Tx, org, search, barcode, category string, limit, offset int) ([]string, int, error) {
	where := ` FROM product_variants variant JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id WHERE variant.organization_id=$1 AND ($2='' OR product.name ILIKE '%'||$2||'%' OR variant.name ILIKE '%'||$2||'%' OR variant.sku ILIKE '%'||$2||'%') AND ($3='' OR EXISTS(SELECT 1 FROM product_barcodes WHERE organization_id=variant.organization_id AND variant_id=variant.id AND code=$3)) AND ($4='' OR product.category_id=nullif($4,'')::uuid)`
	var total int
	if err := tx.QueryRow(ctx, "SELECT count(*)"+where, org, search, barcode, category).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := tx.Query(ctx, "SELECT variant.id::text"+where+" ORDER BY product.name,variant.sku,variant.id LIMIT $5 OFFSET $6", org, search, barcode, category, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, 0, err
		}
		ids = append(ids, id)
	}
	return ids, total, rows.Err()
}
