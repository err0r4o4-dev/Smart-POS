package catalog

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/menurevision"
	"smartpos/api/internal/modules/organization"
)

func catalogMenuState(ctx context.Context, tx pgx.Tx, org, kind, id string) ([]byte, error) {
	var query string
	switch kind {
	case "products":
		query = `SELECT jsonb_build_object('product_id',p.id,'name',p.name,'category_id',p.category_id,'status',p.status)
		 FROM products p JOIN restaurant_menu_categories c ON c.organization_id=p.organization_id AND c.category_id=p.category_id
		 WHERE p.organization_id=$1 AND p.id=$2 AND EXISTS (
		   SELECT 1 FROM restaurant_menu_items m WHERE m.organization_id=p.organization_id AND m.product_id=p.id)`
	case "categories":
		query = `SELECT jsonb_build_object('category_id',c.id,'name',c.name,'status',c.status)
		 FROM categories c JOIN restaurant_menu_categories m ON m.organization_id=c.organization_id AND m.category_id=c.id
		 WHERE c.organization_id=$1 AND c.id=$2`
	case "units":
		query = `SELECT jsonb_build_object('unit_id',u.id,'name',u.name,'unit_type',u.unit_type,'status',u.status)
		 FROM units u WHERE u.organization_id=$1 AND u.id=$2 AND EXISTS (
		   SELECT 1 FROM restaurant_menu_items m
		   JOIN product_variants v ON v.organization_id=m.organization_id AND v.product_id=m.product_id AND v.id=m.variant_id
		   JOIN products p ON p.organization_id=m.organization_id AND p.id=m.product_id
		   JOIN restaurant_menu_categories c ON c.organization_id=p.organization_id AND c.category_id=p.category_id
		   WHERE m.organization_id=u.organization_id AND v.unit_id=u.id)`
	default:
		return nil, nil
	}
	var state []byte
	err := tx.QueryRow(ctx, "SELECT COALESCE(("+query+"), '{}'::jsonb)", org, id).Scan(&state)
	return state, err
}

func recordCatalogMenuChange(ctx context.Context, auth *organization.Authorization, org, user, kind, id string, before []byte) error {
	after, err := catalogMenuState(ctx, auth.Tx, org, kind, id)
	if err != nil {
		return err
	}
	return appendCatalogMenuChange(ctx, auth, org, user, before, after)
}

func importMenuState(ctx context.Context, tx pgx.Tx, org string, products []string) ([]byte, error) {
	var state []byte
	err := tx.QueryRow(ctx, `SELECT jsonb_build_object('items', COALESCE(jsonb_agg(jsonb_build_object(
	  'product_id',p.id,'product_name',p.name,'product_status',p.status,'category_id',p.category_id,
	  'variant_id',v.id,'sku',v.sku,'variant_name',v.name,'variant_status',v.status,
	  'unit_id',v.unit_id,'selling_price',v.selling_price::text) ORDER BY v.id), '[]'::jsonb))
	 FROM restaurant_menu_items m
	 JOIN products p ON p.organization_id=m.organization_id AND p.id=m.product_id
	 JOIN product_variants v ON v.organization_id=m.organization_id AND v.product_id=m.product_id AND v.id=m.variant_id
	 JOIN restaurant_menu_categories c ON c.organization_id=p.organization_id AND c.category_id=p.category_id
	 WHERE m.organization_id=$1 AND m.product_id=ANY($2::text[]::uuid[])`, org, products).Scan(&state)
	return state, err
}

func appendCatalogMenuChange(ctx context.Context, auth *organization.Authorization, org, user string, before, after []byte) error {
	if err := auth.Recheck(ctx); err != nil {
		return err
	}
	err := menurevision.AppendChange(ctx, auth.Tx, org, user, before, after)
	if errors.Is(err, menurevision.ErrExhausted) {
		return ErrConflict
	}
	return err
}
