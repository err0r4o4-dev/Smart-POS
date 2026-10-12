package storefront

import (
	"context"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/pricing"
	"strings"
)

func product(ctx context.Context, tx pgx.Tx, org string, shop Settings, id string) (Product, error) {
	return productForOrder(ctx, tx, org, shop, id, "")
}
func productForOrder(ctx context.Context, tx pgx.Tx, org string, shop Settings, id, order string) (Product, error) {
	value, err := catalog.ReadSaleVariant(ctx, tx, org, id)
	if err != nil {
		if errors.Is(err, catalog.ErrNotFound) {
			return Product{}, ErrNotFound
		}
		return Product{}, err
	}
	result := Product{VariantID: id, ProductName: value.ProductName, VariantName: value.VariantName, SKU: value.SKU, Unit: value.Unit, UnitType: value.UnitType, Available: "0.000"}
	result.UnitPrice, _, _, err = pricing.EffectivePrice(ctx, tx, org, shop.BranchID, id, value.UnitPrice)
	if err != nil {
		return result, err
	}
	_, priceError := pos.EstimateOnlineLine(result.UnitPrice, "1.000", result.UnitType)
	result.Saleable = value.ProductStatus == "ACTIVE" && value.VariantStatus == "ACTIVE" && value.UnitStatus == "ACTIVE" && value.Currency == "THB" && priceError == nil
	err = tx.QueryRow(ctx, `SELECT COALESCE((SELECT published FROM storefront_products WHERE organization_id=$1 AND variant_id=$2),false),greatest(0.000,storefront_sellable_quantity($1,$3,$2)-storefront_reserved_quantity($1,$3,$2)+COALESCE((SELECT item.quantity FROM online_order_items item JOIN online_orders doc ON doc.organization_id=item.organization_id AND doc.id=item.order_id WHERE item.organization_id=$1 AND item.variant_id=$2 AND doc.id=nullif($4,'')::uuid AND doc.stock_location_id=$3 AND doc.stock_reserved AND storefront_order_live(doc.organization_id,doc.id)),0.000))::text`, org, id, shop.LocationID, order).Scan(&result.Published, &result.Available)
	return result, dbError(err)
}
func products(ctx context.Context, tx pgx.Tx, org string, shop Settings, search string, page int, public bool) (Page[Product], error) {
	result := Page[Product]{Items: []Product{}, Page: page, PageSize: 24}
	if !text(search, 100, false) || page < 1 || page > 10000 {
		return result, ErrInput
	}
	where := ` FROM product_variants variant JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id WHERE variant.organization_id=$1 AND ($2='' OR product.name ILIKE '%'||$2||'%' OR variant.name ILIKE '%'||$2||'%' OR variant.sku ILIKE '%'||$2||'%')`
	if public {
		where += ` AND product.status='ACTIVE' AND variant.status='ACTIVE' AND EXISTS(SELECT 1 FROM storefront_products listing WHERE listing.organization_id=variant.organization_id AND listing.variant_id=variant.id AND listing.published)`
	}
	if err := tx.QueryRow(ctx, "SELECT count(*)"+where, org, search).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := tx.Query(ctx, "SELECT variant.id::text"+where+" ORDER BY product.name,variant.sku,variant.id LIMIT 24 OFFSET $3", org, search, (page-1)*24)
	if err != nil {
		return result, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return result, err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	for _, id := range ids {
		value, err := product(ctx, tx, org, shop, id)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, value)
	}
	return result, nil
}
func (service *Service) Products(ctx context.Context, user, org, slug, search string, page int) (Page[Product], error) {
	var tx pgx.Tx
	var actor organization.Member
	var err error
	public := slug != ""
	if public {
		tx, org, err = service.public(ctx, slug, false)
	} else {
		tx, actor, err = service.authorized(ctx, user, org, "storefront.manage")
	}
	if err != nil {
		return Page[Product]{}, err
	}
	defer tx.Rollback(ctx)
	shop, err := settings(ctx, tx, org)
	if err != nil {
		return Page[Product]{}, err
	}
	if public && !shop.Published {
		return Page[Product]{}, ErrNotFound
	}
	if !public && !branchAllowed(actor, shop.BranchID) {
		return Page[Product]{}, organization.ErrDenied
	}
	return products(ctx, tx, org, shop, strings.TrimSpace(search), page, public)
}
func (service *Service) Publish(ctx context.Context, user, org, id string, input PublishInput) (Product, error) {
	tx, actor, err := service.authorized(ctx, user, org, "storefront.manage")
	if err != nil {
		return Product{}, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(id) {
		return Product{}, ErrInput
	}
	shop, err := settings(ctx, tx, org)
	if err != nil {
		return Product{}, err
	}
	if !branchAllowed(actor, shop.BranchID) {
		return Product{}, organization.ErrDenied
	}
	if shop.Revision != input.Revision {
		return Product{}, ErrConflict
	}
	value, err := product(ctx, tx, org, shop, id)
	if err != nil {
		return value, err
	}
	if input.Published && !value.Saleable {
		return value, ErrConflict
	}
	if _, err = tx.Exec(ctx, `INSERT INTO storefront_products(organization_id,variant_id,published) VALUES($1,$2,$3) ON CONFLICT(organization_id,variant_id) DO UPDATE SET published=excluded.published`, org, id, input.Published); err != nil {
		return value, dbError(err)
	}
	if _, err = tx.Exec(ctx, "UPDATE storefronts SET revision=revision+1,updated_at=now() WHERE organization_id=$1", org); err != nil {
		return value, err
	}
	if err = organization.RecordAudit(ctx, tx, org, user, "storefront.product.updated", id); err != nil {
		return value, err
	}
	value.Published = input.Published
	return value, dbError(tx.Commit(ctx))
}
func quote(ctx context.Context, tx pgx.Tx, org string, shop Settings, items []ItemInput) (Quote, error) {
	result := Quote{Items: []Line{}, Currency: "THB"}
	if !shop.Published || !shop.AcceptingOrders {
		return result, ErrClosed
	}
	if err := saleSource(ctx, tx, org, shop); err != nil {
		return result, err
	}
	if err := normalizeItems(items); err != nil {
		return result, err
	}
	var total int64
	for _, input := range items {
		value, err := product(ctx, tx, org, shop, input.VariantID)
		if err != nil {
			return result, err
		}
		if !value.Published || !value.Saleable {
			return result, ErrStock
		}
		amount, err := pos.EstimateOnlineLine(value.UnitPrice, input.Quantity, value.UnitType)
		if err != nil {
			return result, ErrInput
		}
		var enough bool
		if err = tx.QueryRow(ctx, "SELECT $1::numeric>=$2::numeric", value.Available, input.Quantity).Scan(&enough); err != nil {
			return result, dbError(err)
		}
		if !enough {
			return result, ErrStock
		}
		if total > 999999999999999999-amount {
			return result, ErrInput
		}
		total += amount
		result.Items = append(result.Items, Line{VariantID: input.VariantID, ProductName: value.ProductName, VariantName: value.VariantName, SKU: value.SKU, Unit: value.Unit, Quantity: input.Quantity, UnitPrice: value.UnitPrice, LineTotal: money(amount)})
	}
	if total <= 0 {
		return result, ErrInput
	}
	result.Total = money(total)
	result.ID = digest(struct {
		Revision int64
		Quote    Quote
	}{shop.Revision, result})
	return result, nil
}
func (service *Service) Quote(ctx context.Context, slug string, input QuoteInput) (Quote, error) {
	tx, org, err := service.public(ctx, slug, false)
	if err != nil {
		return Quote{}, err
	}
	defer tx.Rollback(ctx)
	shop, err := settings(ctx, tx, org)
	if err != nil {
		return Quote{}, err
	}
	result, err := quote(ctx, tx, org, shop, input.Items)
	if err != nil {
		return result, fmt.Errorf("quote: %w", err)
	}
	return result, nil
}
