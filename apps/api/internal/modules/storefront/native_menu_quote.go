package storefront

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/menurevision"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/pricing"
	"smartpos/api/internal/modules/restaurant"
)

type nativeMenuLineInput struct {
	VariantID string
	Quantity  string
	Choices   []restaurant.MenuModifierChoice
}

type nativeMenuLine struct {
	Line
	BasePrice string
	UnitType  string
	Category  string
	Options   []restaurant.PricedMenuModifier
}

type nativeMenuQuote struct {
	Revision       int64
	Items          []nativeMenuLine
	Subtotal       string
	ConfirmationID string
}

func priceNativeMenuLine(product Product, quantity string, extras restaurant.MenuModifierPricing) (nativeMenuLine, error) {
	if !product.Saleable {
		return nativeMenuLine{}, ErrStock
	}
	base, err := pricing.Decimal(product.UnitPrice, 2)
	if err != nil || base == 0 || extras.ExtraMinor < 0 || extras.ExtraMinor > pricing.Maximum-base {
		return nativeMenuLine{}, ErrInput
	}
	units, err := pricing.Decimal(quantity, 3)
	if err != nil {
		return nativeMenuLine{}, ErrInput
	}
	quantity = fmt.Sprintf("%d.%03d", units/1000, units%1000)
	price := money(base + extras.ExtraMinor)
	total, err := pos.EstimateOnlineLine(price, quantity, product.UnitType)
	if err != nil {
		return nativeMenuLine{}, ErrInput
	}
	return nativeMenuLine{
		Line: Line{VariantID: product.VariantID, ProductName: product.ProductName, VariantName: product.VariantName,
			SKU: product.SKU, Unit: product.Unit, Quantity: quantity, UnitPrice: price, LineTotal: money(total)},
		BasePrice: money(base), UnitType: product.UnitType, Options: extras.Options,
	}, nil
}

// quoteNativeMenu reads only menu pricing. The caller must scope the transaction
// and either hold the organization lock or provide a consistent read snapshot.
func quoteNativeMenu(ctx context.Context, tx pgx.Tx, org string, inputs []nativeMenuLineInput) (nativeMenuQuote, error) {
	if len(inputs) == 0 || len(inputs) > 100 {
		return nativeMenuQuote{}, ErrInput
	}
	result := nativeMenuQuote{Items: make([]nativeMenuLine, 0, len(inputs))}
	var subtotal int64
	for _, input := range inputs {
		id := strings.ToLower(input.VariantID)
		if !uuidPattern.MatchString(id) {
			return nativeMenuQuote{}, ErrInput
		}
		var product Product
		var category string
		err := tx.QueryRow(ctx, `SELECT v.id::text,p.name,v.name,v.sku,u.name,u.unit_type,v.selling_price::text,c.name,
		  p.status='ACTIVE' AND v.status='ACTIVE' AND c.status='ACTIVE' AND u.status='ACTIVE' AND v.currency='THB'
		  AND NOT EXISTS (SELECT 1 FROM quality_recalls r WHERE r.organization_id=m.organization_id AND r.variant_id=m.variant_id AND r.batch_id IS NULL)
		 FROM restaurant_menu_items m
		 JOIN products p ON p.organization_id=m.organization_id AND p.id=m.product_id
		 JOIN product_variants v ON v.organization_id=m.organization_id AND v.product_id=m.product_id AND v.id=m.variant_id
		 JOIN restaurant_menu_categories mc ON mc.organization_id=p.organization_id AND mc.category_id=p.category_id
		 JOIN categories c ON c.organization_id=mc.organization_id AND c.id=mc.category_id
		 JOIN units u ON u.organization_id=v.organization_id AND u.id=v.unit_id
		 WHERE m.organization_id=$1 AND m.variant_id=$2`, org, id).Scan(&product.VariantID, &product.ProductName,
			&product.VariantName, &product.SKU, &product.Unit, &product.UnitType, &product.UnitPrice, &category, &product.Saleable)
		if err != nil {
			return nativeMenuQuote{}, dbError(err)
		}
		if !product.Saleable {
			return nativeMenuQuote{}, ErrStock
		}
		extras, err := restaurant.PriceMenuModifierSelection(ctx, tx, org, id, input.Choices)
		if errors.Is(err, restaurant.ErrConflict) {
			return nativeMenuQuote{}, ErrQuote
		}
		if errors.Is(err, restaurant.ErrInput) {
			return nativeMenuQuote{}, ErrInput
		}
		if err != nil {
			return nativeMenuQuote{}, err
		}
		line, err := priceNativeMenuLine(product, input.Quantity, extras)
		if err != nil {
			return nativeMenuQuote{}, err
		}
		line.Category = category
		minor, err := pricing.Decimal(line.LineTotal, 2)
		if err != nil || minor > pricing.Maximum-subtotal {
			return nativeMenuQuote{}, ErrInput
		}
		subtotal += minor
		result.Items = append(result.Items, line)
	}
	if subtotal <= 0 {
		return nativeMenuQuote{}, ErrInput
	}
	revision, err := menurevision.Current(ctx, tx, org)
	if err != nil {
		return nativeMenuQuote{}, dbError(err)
	}
	result.Revision, result.Subtotal = revision, money(subtotal)
	// A different revision alone does not invalidate an unchanged selection.
	result.ConfirmationID = digest(struct {
		Version      string
		Organization string
		Items        []nativeMenuLine
		Subtotal     string
	}{"native-menu-v1", org, result.Items, result.Subtotal})
	return result, nil
}

// revalidateNativeMenuConfirmation compares menu pricing inside the checkout
// write transaction. The caller must already hold the organization lock and
// separately validate cart authority, fulfillment, and payment admission.
func revalidateNativeMenuConfirmation(ctx context.Context, tx pgx.Tx, org string, inputs []nativeMenuLineInput, confirmed string) (nativeMenuQuote, error) {
	if confirmed == "" {
		return nativeMenuQuote{}, ErrQuote
	}
	current, err := quoteNativeMenu(ctx, tx, org, inputs)
	switch {
	case errors.Is(err, ErrInput), errors.Is(err, ErrNotFound), errors.Is(err, ErrStock), errors.Is(err, ErrQuote):
		return nativeMenuQuote{}, ErrQuote
	case err != nil:
		return nativeMenuQuote{}, err
	case current.ConfirmationID != confirmed:
		return nativeMenuQuote{}, ErrQuote
	default:
		return current, nil
	}
}
