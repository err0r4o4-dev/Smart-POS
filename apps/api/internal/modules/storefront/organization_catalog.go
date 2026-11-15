package storefront

import (
	"context"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/pos"
)

func organizationProducts(ctx context.Context, tx pgx.Tx, org, search string, page int) (Page[Product], error) {
	result := Page[Product]{Items: []Product{}, Page: page, PageSize: 24}
	if !text(search, 100, false) || page < 1 || page > 10000 {
		return result, ErrInput
	}
	const source = ` FROM restaurant_menu_items menu
	 JOIN product_variants variant ON variant.organization_id=menu.organization_id AND variant.product_id=menu.product_id AND variant.id=menu.variant_id
	 JOIN products product ON product.organization_id=menu.organization_id AND product.id=menu.product_id
	 JOIN restaurant_menu_categories registered ON registered.organization_id=product.organization_id AND registered.category_id=product.category_id
	 JOIN categories category ON category.organization_id=registered.organization_id AND category.id=registered.category_id
	 JOIN units unit ON unit.organization_id=variant.organization_id AND unit.id=variant.unit_id
	 WHERE menu.organization_id=$1 AND ($2='' OR product.name ILIKE '%'||$2||'%' OR variant.name ILIKE '%'||$2||'%' OR variant.sku ILIKE '%'||$2||'%')`
	if err := tx.QueryRow(ctx, "SELECT count(*)"+source, org, search).Scan(&result.Total); err != nil {
		return result, dbError(err)
	}
	rows, err := tx.Query(ctx, `SELECT variant.id::text,product.name,variant.name,variant.sku,unit.name,unit.unit_type,variant.selling_price::text,
	 product.status='ACTIVE' AND variant.status='ACTIVE' AND category.status='ACTIVE' AND unit.status='ACTIVE' AND variant.currency='THB'
	 AND NOT EXISTS(SELECT 1 FROM quality_recalls recall WHERE recall.organization_id=menu.organization_id AND recall.variant_id=menu.variant_id AND recall.batch_id IS NULL)`+
		source+" ORDER BY product.name,variant.sku,variant.id LIMIT 24 OFFSET $3", org, search, (page-1)*24)
	if err != nil {
		return result, dbError(err)
	}
	defer rows.Close()
	for rows.Next() {
		item := Product{StockPolicy: "MENU_ONLY"}
		if err = rows.Scan(&item.VariantID, &item.ProductName, &item.VariantName, &item.SKU, &item.Unit, &item.UnitType, &item.UnitPrice, &item.Saleable); err != nil {
			return result, dbError(err)
		}
		_, priceError := pos.EstimateOnlineLine(item.UnitPrice, "1.000", item.UnitType)
		item.Saleable = item.Saleable && priceError == nil
		result.Items = append(result.Items, item)
	}
	return result, dbError(rows.Err())
}
