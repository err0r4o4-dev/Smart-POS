package catalog

import (
	"context"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
)

const productColumns = `p.id::text,p.organization_id::text,p.name,p.description,p.category_id::text,p.brand_id::text,p.status,p.revision,COALESCE(c.name,''),COALESCE(b.name,''),p.created_by::text,p.updated_by::text,p.created_at,p.updated_at`
const productFrom = ` FROM products p LEFT JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id LEFT JOIN brands b ON b.organization_id=p.organization_id AND b.id=p.brand_id`

func readProduct(row pgx.Row) (Product, error) {
	item := Product{Variants: []Variant{}}
	err := row.Scan(&item.ID, &item.OrganizationID, &item.Name, &item.Description, &item.CategoryID, &item.BrandID, &item.Status, &item.Revision, &item.CategoryName, &item.BrandName, &item.CreatedBy, &item.UpdatedBy, &item.CreatedAt, &item.UpdatedAt)
	return item, databaseError(err)
}
func productBy(ctx context.Context, tx pgx.Tx, org, id string) (Product, error) {
	if !uuidPattern.MatchString(id) {
		return Product{}, ErrNotFound
	}
	item, err := readProduct(tx.QueryRow(ctx, "SELECT "+productColumns+productFrom+" WHERE p.organization_id=$1 AND p.id=$2", org, id))
	if err != nil {
		return item, err
	}
	item.Variants, err = variants(ctx, tx, org, id)
	return item, err
}
func (service *Service) Product(ctx context.Context, user, org, id string) (Product, error) {
	tx, err := service.begin(ctx, user, org, "catalog.read")
	if err != nil {
		return Product{}, err
	}
	defer tx.Rollback(ctx)
	return productBy(ctx, tx, org, id)
}
func (service *Service) Products(ctx context.Context, user, org string, filter Filter) (Page[Product], error) {
	result := Page[Product]{Items: []Product{}}
	if err := filter.validate(); err != nil {
		return result, err
	}
	tx, err := service.begin(ctx, user, org, "catalog.read")
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	where := ` WHERE p.organization_id=$1 AND (($3='' AND p.status<>'ARCHIVED') OR p.status=$3) AND ($4::uuid IS NULL OR p.category_id=$4) AND ($5::uuid IS NULL OR p.brand_id=$5) AND (p.name ILIKE $2 OR EXISTS(SELECT 1 FROM product_variants v WHERE v.organization_id=p.organization_id AND v.product_id=p.id AND (v.sku ILIKE $2 OR EXISTS(SELECT 1 FROM product_barcodes z WHERE z.organization_id=v.organization_id AND z.variant_id=v.id AND z.code ILIKE $2))))`
	args := []any{org, "%" + filter.Search + "%", filter.Status, nullableID(filter.CategoryID), nullableID(filter.BrandID)}
	if err = tx.QueryRow(ctx, "SELECT count(*)"+productFrom+where, args...).Scan(&result.Total); err != nil {
		return result, err
	}
	order := map[string]string{"name": "p.name,p.id", "-name": "p.name DESC,p.id", "updated": "p.updated_at,p.id", "-updated": "p.updated_at DESC,p.id"}[filter.Sort]
	args = append(args, filter.PageSize, (filter.Page-1)*filter.PageSize)
	rows, err := tx.Query(ctx, "SELECT "+productColumns+productFrom+where+" ORDER BY "+order+" LIMIT $6 OFFSET $7", args...)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		item, err := readProduct(rows)
		if err != nil {
			rows.Close()
			return result, err
		}
		result.Items = append(result.Items, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return result, err
	}
	for index := range result.Items {
		result.Items[index].Variants, err = variants(ctx, tx, org, result.Items[index].ID)
		if err != nil {
			return result, err
		}
	}
	result.Page, result.PageSize = filter.Page, filter.PageSize
	return result, nil
}
func productReferences(ctx context.Context, tx pgx.Tx, org string, input ProductInput) error {
	if err := reference(ctx, tx, org, "categories", input.CategoryID); err != nil {
		return err
	}
	return reference(ctx, tx, org, "brands", input.BrandID)
}
func createProduct(ctx context.Context, tx pgx.Tx, user, org string, input CreateInput) (Product, error) {
	if err := input.ProductInput.validate(); err != nil {
		return Product{}, err
	}
	if len(input.Variants) < 1 || len(input.Variants) > 100 || input.Status == "ARCHIVED" {
		return Product{}, ErrInput
	}
	active := false
	for index := range input.Variants {
		if err := input.Variants[index].validate(); err != nil {
			return Product{}, err
		}
		active = active || input.Variants[index].Status == "ACTIVE"
	}
	if input.Status == "ACTIVE" && !active {
		return Product{}, ErrInput
	}
	if err := productReferences(ctx, tx, org, input.ProductInput); err != nil {
		return Product{}, err
	}
	var id string
	err := tx.QueryRow(ctx, "INSERT INTO products(organization_id,name,description,category_id,brand_id,status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id::text", org, input.Name, input.Description, input.CategoryID, input.BrandID, input.Status, user).Scan(&id)
	if err != nil {
		return Product{}, databaseError(err)
	}
	for _, variant := range input.Variants {
		if _, err = saveVariant(ctx, tx, org, id, "", variant); err != nil {
			return Product{}, err
		}
	}
	return productBy(ctx, tx, org, id)
}
func (service *Service) CreateProduct(ctx context.Context, user, org string, input CreateInput) (Product, error) {
	tx, err := service.begin(ctx, user, org, "catalog.create")
	if err != nil {
		return Product{}, err
	}
	defer tx.Rollback(ctx)
	item, err := createProduct(ctx, tx, user, org, input)
	if err != nil {
		return item, err
	}
	err = finish(ctx, tx, org, user, "catalog.product.created", item.ID)
	return item, err
}
func (service *Service) UpdateProduct(ctx context.Context, user, org, id string, input ProductInput) (Product, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, "catalog.update")
	if err != nil {
		return Product{}, err
	}
	defer tx.Rollback(ctx)
	current, err := productBy(ctx, tx, org, id)
	if err != nil {
		return Product{}, err
	}
	if current.Status == "ARCHIVED" || input.Status == "ARCHIVED" {
		permitted := false
		for _, value := range actor.Permissions {
			if value == "catalog.archive" {
				permitted = true
			}
		}
		if !permitted {
			return Product{}, organization.ErrDenied
		}
	}
	if err = input.validate(); err != nil {
		return Product{}, err
	}
	if input.Revision != current.Revision {
		return Product{}, ErrConflict
	}
	if input.Status == "ACTIVE" {
		active := false
		for _, variant := range current.Variants {
			active = active || variant.Status == "ACTIVE"
		}
		if !active {
			return Product{}, ErrConflict
		}
	}
	if err = productReferences(ctx, tx, org, input); err != nil {
		return Product{}, err
	}
	_, err = tx.Exec(ctx, "UPDATE products SET name=$3,description=$4,category_id=$5,brand_id=$6,status=$7,revision=revision+1,updated_by=$8,updated_at=now() WHERE organization_id=$1 AND id=$2", org, id, input.Name, input.Description, input.CategoryID, input.BrandID, input.Status, user)
	if err != nil {
		return Product{}, databaseError(err)
	}
	item, err := productBy(ctx, tx, org, id)
	if err != nil {
		return item, err
	}
	err = finish(ctx, tx, org, user, "catalog.product.updated", id)
	return item, err
}
