package storefront

import (
	"context"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/pricing"
)

func (service *Service) QuoteOrganization(ctx context.Context, user, org string, input QuoteInput) (Quote, error) {
	authorization, err := service.Organization.AuthorizeMFA(ctx, user, org, "storefront.manage")
	if err != nil {
		return Quote{}, dbError(err)
	}
	tx := authorization.Tx
	defer tx.Rollback(ctx)
	if input.TableToken != "" {
		return Quote{}, ErrInput
	}
	shop, readError := settings(ctx, tx, org)
	if err = ctx.Err(); err != nil {
		return Quote{}, err
	}
	if err = authorization.Recheck(ctx); err != nil {
		return Quote{}, err
	}
	if readError != nil {
		return Quote{}, readError
	}
	result, quoteError := organizationQuote(ctx, tx, org, shop, input.Items, input.Fulfillment)
	if err = ctx.Err(); err != nil {
		return Quote{}, err
	}
	if err = authorization.Recheck(ctx); err != nil {
		return Quote{}, err
	}
	if quoteError != nil {
		return Quote{}, quoteError
	}
	return result, nil
}

func organizationQuote(ctx context.Context, tx pgx.Tx, org string, shop Settings, items []ItemInput, mode string) (Quote, error) {
	mode = fulfillmentMode(mode)
	result := Quote{Items: []Line{}, Currency: "THB", Fulfillment: mode, ShippingFee: "0.00"}
	if mode != "PICKUP" && mode != "DELIVERY" {
		return result, ErrInput
	}
	if mode == "DELIVERY" && !shop.DeliveryEnabled {
		return result, ErrClosed
	}
	if shop.TerminalID != "" || shop.OnlineTerminalID != "" || shop.BranchID != "" || shop.LocationID != "" {
		return result, ErrConflict
	}
	var source string
	if err := tx.QueryRow(ctx, "SELECT source_kind FROM storefronts WHERE organization_id=$1", org).Scan(&source); err != nil {
		return result, dbError(err)
	}
	if source != "RESTAURANT" {
		return result, ErrConflict
	}
	items = append([]ItemInput(nil), items...)
	if err := normalizeItems(items); err != nil {
		return result, err
	}
	ids := make([]string, len(items))
	for index, item := range items {
		ids[index] = item.VariantID
	}
	rows, err := tx.Query(ctx, `SELECT variant.id::text,product.name,variant.name,variant.sku,unit.name,unit.unit_type,variant.selling_price::text,
	 product.status='ACTIVE' AND variant.status='ACTIVE' AND category.status='ACTIVE' AND unit.status='ACTIVE' AND variant.currency='THB'
	 AND NOT EXISTS(SELECT 1 FROM quality_recalls recall WHERE recall.organization_id=menu.organization_id AND recall.variant_id=menu.variant_id AND recall.batch_id IS NULL)
	 FROM restaurant_menu_items menu
	 JOIN product_variants variant ON variant.organization_id=menu.organization_id AND variant.product_id=menu.product_id AND variant.id=menu.variant_id
	 JOIN products product ON product.organization_id=menu.organization_id AND product.id=menu.product_id
	 JOIN restaurant_menu_categories registered ON registered.organization_id=product.organization_id AND registered.category_id=product.category_id
	 JOIN categories category ON category.organization_id=registered.organization_id AND category.id=registered.category_id
	 JOIN units unit ON unit.organization_id=variant.organization_id AND unit.id=variant.unit_id
	 WHERE menu.organization_id=$1 AND menu.variant_id=ANY($2::uuid[])`, org, ids)
	if err != nil {
		return result, dbError(err)
	}
	defer rows.Close()
	products := make(map[string]Product, len(items))
	for rows.Next() {
		var item Product
		if err = rows.Scan(&item.VariantID, &item.ProductName, &item.VariantName, &item.SKU, &item.Unit, &item.UnitType, &item.UnitPrice, &item.Saleable); err != nil {
			return result, dbError(err)
		}
		products[item.VariantID] = item
	}
	if err = rows.Err(); err != nil {
		return result, dbError(err)
	}
	var total int64
	for _, input := range items {
		value, exists := products[input.VariantID]
		if !exists {
			return result, ErrNotFound
		}
		if !value.Saleable {
			return result, ErrStock
		}
		amount, problem := pos.EstimateOnlineLine(value.UnitPrice, input.Quantity, value.UnitType)
		if problem != nil || total > 999999999999999999-amount {
			return result, ErrInput
		}
		total += amount
		result.Items = append(result.Items, Line{VariantID: value.VariantID, ProductName: value.ProductName, VariantName: value.VariantName, SKU: value.SKU, Unit: value.Unit, Quantity: input.Quantity, UnitPrice: value.UnitPrice, LineTotal: money(amount)})
	}
	if total <= 0 {
		return result, ErrInput
	}
	result.Subtotal = money(total)
	if mode == "DELIVERY" {
		fee, problem := pricing.Decimal(shop.ShippingFee, 2)
		if problem != nil || total > 99999999-fee {
			return result, ErrInput
		}
		result.ShippingFee = money(fee)
		total += fee
	}
	result.Total = money(total)
	result.ID = digest(struct {
		Organization string
		Revision     int64
		Quote        Quote
	}{org, shop.Revision, result})
	return result, nil
}
