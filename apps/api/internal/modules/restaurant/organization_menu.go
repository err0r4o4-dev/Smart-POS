package restaurant

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
)

func readOrganizationMenu(ctx context.Context, tx pgx.Tx, org string, state *SetupState) (bool, int, error) {
	var saved bool
	err := tx.QueryRow(ctx, "SELECT menu_saved FROM restaurant_profiles WHERE organization_id=$1", org).Scan(&saved)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, 0, dbError(err)
	}
	categories, items := []map[string]any{}, []map[string]any{}
	rows, err := tx.Query(ctx, `SELECT category.id::text,category.name FROM restaurant_menu_categories menu
	 JOIN categories category ON category.organization_id=menu.organization_id AND category.id=menu.category_id
	 WHERE menu.organization_id=$1 AND category.status='ACTIVE' ORDER BY category.name,category.id`, org)
	if err != nil {
		return false, 0, dbError(err)
	}
	for rows.Next() {
		var id, name string
		if err = rows.Scan(&id, &name); err != nil {
			rows.Close()
			return false, 0, err
		}
		categories = append(categories, map[string]any{"id": id, "name": name})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return false, 0, err
	}
	rows, err = tx.Query(ctx, `SELECT product.id::text,variant.id::text,variant.sku,category.id::text,product.name,category.name,variant.selling_price::text
	 FROM restaurant_menu_items menu
	 JOIN product_variants variant ON variant.organization_id=menu.organization_id AND variant.product_id=menu.product_id AND variant.id=menu.variant_id
	 JOIN products product ON product.organization_id=menu.organization_id AND product.id=menu.product_id
	 JOIN restaurant_menu_categories registered ON registered.organization_id=product.organization_id AND registered.category_id=product.category_id
	 JOIN categories category ON category.organization_id=registered.organization_id AND category.id=registered.category_id
	 WHERE menu.organization_id=$1 AND product.status='ACTIVE' AND variant.status='ACTIVE' AND category.status='ACTIVE'
	 ORDER BY product.name,variant.id`, org)
	if err != nil {
		return false, 0, dbError(err)
	}
	for rows.Next() {
		var productID, variantID, sku, categoryID, name, category, price string
		if err = rows.Scan(&productID, &variantID, &sku, &categoryID, &name, &category, &price); err != nil {
			rows.Close()
			return false, 0, err
		}
		items = append(items, map[string]any{"product_id": productID, "variant_id": variantID, "sku": sku, "category_id": categoryID, "name": name, "category": category, "price": price})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return false, 0, err
	}
	state.Menu = map[string]any{"categories": categories, "items": items}
	return saved, len(items), nil
}

func saveOrganizationMenu(ctx context.Context, authorization *organization.Authorization, org, user string, input SetupMenuInput) error {
	tx := authorization.Tx
	var currency string
	if err := tx.QueryRow(ctx, "SELECT currency FROM organizations WHERE id=$1", org).Scan(&currency); err != nil {
		return dbError(err)
	}
	var unit string
	err := tx.QueryRow(ctx, setupMenuUnitLookupSQL, org, setupDefaultUnitCode).Scan(&unit)
	if errors.Is(err, pgx.ErrNoRows) {
		if err = authorization.Recheck(ctx); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, setupDefaultUnitInsertSQL, org, setupDefaultUnitCode, setupDefaultUnitName); err != nil {
			return dbError(err)
		}
		err = tx.QueryRow(ctx, setupMenuUnitLookupSQL, org, setupDefaultUnitCode).Scan(&unit)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrConflict
		}
	}
	if err != nil {
		return dbError(err)
	}
	categoryIDs := map[string]string{}
	for _, category := range input.Categories {
		var id string
		if category.ID != "" {
			err = tx.QueryRow(ctx, `SELECT category.id::text FROM restaurant_menu_categories menu
			 JOIN categories category ON category.organization_id=menu.organization_id AND category.id=menu.category_id
			 WHERE menu.organization_id=$1 AND menu.category_id=$2 AND category.status='ACTIVE'`, org, category.ID).Scan(&id)
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrInput
			}
			if err == nil {
				var shared bool
				err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM products product WHERE product.organization_id=$1 AND product.category_id=$2
				 AND NOT EXISTS(SELECT 1 FROM restaurant_menu_items menu WHERE menu.organization_id=product.organization_id AND menu.product_id=product.id))`, org, id).Scan(&shared)
				if err == nil && shared {
					return ErrConflict
				}
				if err == nil {
					err = authorization.Recheck(ctx)
				}
				if err == nil {
					_, err = tx.Exec(ctx, "UPDATE categories SET name=$3,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2", org, id, category.Name)
				}
			}
		} else {
			err = tx.QueryRow(ctx, `SELECT category.id::text FROM restaurant_menu_categories menu
			 JOIN categories category ON category.organization_id=menu.organization_id AND category.id=menu.category_id
			 WHERE menu.organization_id=$1 AND lower(btrim(category.name))=lower($2) AND category.status='ACTIVE'`, org, category.Name).Scan(&id)
			if errors.Is(err, pgx.ErrNoRows) {
				if err = authorization.Recheck(ctx); err != nil {
					return err
				}
				err = tx.QueryRow(ctx, "INSERT INTO categories(organization_id,name,status) VALUES($1,$2,'ACTIVE') RETURNING id::text", org, category.Name).Scan(&id)
				if err == nil {
					err = authorization.Recheck(ctx)
				}
				if err == nil {
					_, err = tx.Exec(ctx, "INSERT INTO restaurant_menu_categories(organization_id,category_id) VALUES($1,$2)", org, id)
				}
			}
		}
		if err != nil {
			return dbError(err)
		}
		categoryIDs[category.Name] = id
	}
	seen := map[string]bool{}
	for _, item := range input.Items {
		category := categoryIDs[item.Category]
		if item.CategoryID != "" && item.CategoryID != category {
			return ErrInput
		}
		var variant, product, sku string
		if item.VariantID != "" {
			err = tx.QueryRow(ctx, `SELECT variant.id::text,variant.product_id::text,variant.sku FROM product_variants variant
			 JOIN restaurant_menu_items menu ON menu.organization_id=variant.organization_id AND menu.variant_id=variant.id AND menu.product_id=variant.product_id
			 WHERE variant.organization_id=$1 AND variant.id=$2 AND variant.status='ACTIVE'`, org, item.VariantID).Scan(&variant, &product, &sku)
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrInput
			}
			if err == nil && ((item.ProductID != "" && item.ProductID != product) || (item.SKU != "" && item.SKU != sku)) {
				return ErrInput
			}
		} else {
			sku = setupMenuSKU(item)
			err = tx.QueryRow(ctx, "SELECT id::text,product_id::text FROM product_variants WHERE organization_id=$1 AND sku=$2", org, sku).Scan(&variant, &product)
		}
		if errors.Is(err, pgx.ErrNoRows) {
			if err = authorization.Recheck(ctx); err != nil {
				return err
			}
			err = tx.QueryRow(ctx, "INSERT INTO products(organization_id,name,category_id,status,created_by,updated_by) VALUES($1,$2,$3,'ACTIVE',$4,$4) RETURNING id::text", org, item.Name, category, user).Scan(&product)
			if err == nil {
				err = authorization.Recheck(ctx)
			}
			if err == nil {
				err = tx.QueryRow(ctx, `INSERT INTO product_variants(organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency,status)
				 VALUES($1,$2,$3,$4,$5,0,$6::numeric,$7,'ACTIVE') RETURNING id::text`, org, product, sku, item.Name, unit, item.Price, currency).Scan(&variant)
			}
			if err == nil {
				err = authorization.Recheck(ctx)
			}
			if err == nil {
				_, err = tx.Exec(ctx, "INSERT INTO restaurant_menu_items(organization_id,product_id,variant_id) VALUES($1,$2,$3)", org, product, variant)
			}
		} else if err == nil {
			var exclusive bool
			err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM restaurant_menu_items menu
			 JOIN products product ON product.organization_id=menu.organization_id AND product.id=menu.product_id
			 JOIN product_variants variant ON variant.organization_id=menu.organization_id AND variant.id=menu.variant_id
			 JOIN units unit ON unit.organization_id=variant.organization_id AND unit.id=variant.unit_id
			 WHERE menu.organization_id=$1 AND menu.product_id=$2 AND menu.variant_id=$3 AND product.status='ACTIVE'
			 AND variant.status='ACTIVE' AND variant.currency=$4 AND unit.status='ACTIVE' AND unit.unit_type='COUNT'
			 AND NOT EXISTS(SELECT 1 FROM product_variants sibling WHERE sibling.organization_id=menu.organization_id AND sibling.product_id=menu.product_id AND sibling.id<>menu.variant_id))`, org, product, variant, currency).Scan(&exclusive)
			if err == nil && !exclusive {
				return ErrConflict
			}
			if err == nil {
				err = authorization.Recheck(ctx)
			}
			if err == nil {
				_, err = tx.Exec(ctx, "UPDATE products SET name=$3,category_id=$4,revision=revision+1,updated_by=$5,updated_at=now() WHERE organization_id=$1 AND id=$2", org, product, item.Name, category, user)
			}
			if err == nil {
				err = authorization.Recheck(ctx)
			}
			if err == nil {
				_, err = tx.Exec(ctx, "UPDATE product_variants SET name=$3,selling_price=$4::numeric,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2", org, variant, item.Name, item.Price)
			}
		}
		if err != nil {
			return dbError(err)
		}
		if seen[variant] {
			return ErrInput
		}
		seen[variant] = true
	}
	if err = authorization.Recheck(ctx); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, "UPDATE restaurant_profiles SET menu_saved=true WHERE organization_id=$1", org)
	return dbError(err)
}
