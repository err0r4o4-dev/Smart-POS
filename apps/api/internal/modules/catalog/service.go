package catalog

import (
	"context"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/organization"
	"strings"
)

type Service struct{ Organization *organization.Service }

func databaseError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	var problem *pgconn.PgError
	if errors.As(err, &problem) {
		switch problem.Code {
		case "23505", "23514", "40001", "40P01":
			return ErrConflict
		case "23503", "22P02", "22003":
			return ErrInput
		}
	}
	return err
}
func (service *Service) begin(ctx context.Context, user, org, permission string) (pgx.Tx, error) {
	tx, _, err := service.Organization.Authorized(ctx, user, org, permission)
	return tx, err
}
func finish(ctx context.Context, tx pgx.Tx, org, user, event, object string) error {
	if err := organization.RecordAudit(ctx, tx, org, user, event, object); err != nil {
		return err
	}
	return databaseError(tx.Commit(ctx))
}
func taxonomyKind(kind string) (string, error) {
	switch kind {
	case "categories":
		return "catalog.category.manage", nil
	case "brands":
		return "catalog.brand.manage", nil
	case "units":
		return "catalog.unit.manage", nil
	}
	return "", ErrNotFound
}
func reference(ctx context.Context, tx pgx.Tx, org, kind string, identifier *string) error {
	if identifier == nil {
		return nil
	}
	var found string
	err := tx.QueryRow(ctx, "SELECT id FROM "+kind+" WHERE organization_id=$1 AND id=$2 AND status='ACTIVE'", org, *identifier).Scan(&found)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInput
	}
	return databaseError(err)
}
func taxonomyColumns(kind string) string {
	columns := "id::text,organization_id::text,name,description,status,revision"
	if kind == "categories" {
		columns += ",parent_id::text"
	}
	if kind == "units" {
		columns += ",code,unit_type,base_unit_id::text,conversion_factor::text"
	}
	return columns
}
func readTaxonomy(row pgx.Row, kind string) (Taxonomy, error) {
	var item Taxonomy
	values := []any{&item.ID, &item.OrganizationID, &item.Name, &item.Description, &item.Status, &item.Revision}
	if kind == "categories" {
		values = append(values, &item.ParentID)
	}
	if kind == "units" {
		values = append(values, &item.Code, &item.UnitType, &item.BaseUnitID, &item.ConversionFactor)
	}
	err := row.Scan(values...)
	return item, databaseError(err)
}
func (service *Service) Taxonomies(ctx context.Context, user, org, kind string, filter Filter) (Page[Taxonomy], error) {
	result := Page[Taxonomy]{Items: []Taxonomy{}}
	if _, err := taxonomyKind(kind); err != nil {
		return result, err
	}
	if err := filter.validate(); err != nil {
		return result, err
	}
	tx, err := service.begin(ctx, user, org, "catalog.read")
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	where := " FROM " + kind + " WHERE organization_id=$1 AND name ILIKE $2 AND (($3='' AND status<>'ARCHIVED') OR status=$3)"
	if err = tx.QueryRow(ctx, "SELECT count(*)"+where, org, "%"+filter.Search+"%", filter.Status).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := tx.Query(ctx, "SELECT "+taxonomyColumns(kind)+where+" ORDER BY name,id LIMIT $4 OFFSET $5", org, "%"+filter.Search+"%", filter.Status, filter.PageSize, (filter.Page-1)*filter.PageSize)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		item, err := readTaxonomy(rows, kind)
		if err != nil {
			return result, err
		}
		result.Items = append(result.Items, item)
	}
	result.Page, result.PageSize = filter.Page, filter.PageSize
	return result, rows.Err()
}
func taxonomyRelations(ctx context.Context, tx pgx.Tx, org, kind, id string, input TaxonomyInput) error {
	if kind == "categories" && input.ParentID != nil {
		if err := reference(ctx, tx, org, kind, input.ParentID); err != nil {
			return err
		}
		var cycle bool
		err := tx.QueryRow(ctx, `WITH RECURSIVE ancestors AS (SELECT id,parent_id FROM categories WHERE organization_id=$1 AND id=$2 UNION SELECT c.id,c.parent_id FROM categories c JOIN ancestors a ON c.id=a.parent_id WHERE c.organization_id=$1) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id=$3::uuid)`, org, *input.ParentID, nullableID(id)).Scan(&cycle)
		if err != nil {
			return err
		}
		if cycle {
			return ErrConflict
		}
	}
	if kind == "units" && input.BaseUnitID != nil {
		if *input.BaseUnitID == id {
			return ErrInput
		}
		var baseType string
		var baseID *string
		err := tx.QueryRow(ctx, "SELECT unit_type,base_unit_id::text FROM units WHERE organization_id=$1 AND id=$2 AND status='ACTIVE'", org, *input.BaseUnitID).Scan(&baseType, &baseID)
		if err != nil {
			return ErrInput
		}
		if baseID != nil || (input.UnitType != "PACKAGING" && input.UnitType != baseType) {
			return ErrInput
		}
	}
	return nil
}
func nullableID(id string) any {
	if id == "" {
		return nil
	}
	return id
}
func (service *Service) SaveTaxonomy(ctx context.Context, user, org, kind, id string, input TaxonomyInput) (Taxonomy, error) {
	permission, err := taxonomyKind(kind)
	if err != nil {
		return Taxonomy{}, err
	}
	tx, err := service.begin(ctx, user, org, permission)
	if err != nil {
		return Taxonomy{}, err
	}
	defer tx.Rollback(ctx)
	if err = input.validate(kind); err != nil {
		return Taxonomy{}, err
	}
	if id != "" && (!uuidPattern.MatchString(id) || input.Revision < 1) {
		return Taxonomy{}, ErrInput
	}
	if err = taxonomyRelations(ctx, tx, org, kind, id, input); err != nil {
		return Taxonomy{}, err
	}
	if id != "" {
		current, err := readTaxonomy(tx.QueryRow(ctx, "SELECT "+taxonomyColumns(kind)+" FROM "+kind+" WHERE organization_id=$1 AND id=$2", org, id), kind)
		if err != nil {
			return Taxonomy{}, err
		}
		if current.Revision != input.Revision {
			return Taxonomy{}, ErrConflict
		}
		if kind == "units" && (current.Code != input.Code || current.UnitType != input.UnitType || !sameID(current.BaseUnitID, input.BaseUnitID) || current.ConversionFactor != decimalFactor(input.ConversionFactor)) {
			var used bool
			err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM product_variants WHERE organization_id=$1 AND unit_id=$2) OR EXISTS(SELECT 1 FROM units WHERE organization_id=$1 AND base_unit_id=$2)", org, id).Scan(&used)
			if err != nil {
				return Taxonomy{}, err
			}
			if used {
				return Taxonomy{}, ErrConflict
			}
		}
		if input.Status != "ACTIVE" {
			query := "SELECT EXISTS(SELECT 1 FROM products WHERE organization_id=$1 AND brand_id=$2 AND status<>'ARCHIVED')"
			if kind == "categories" {
				query = "SELECT EXISTS(SELECT 1 FROM products WHERE organization_id=$1 AND category_id=$2 AND status<>'ARCHIVED') OR EXISTS(SELECT 1 FROM categories WHERE organization_id=$1 AND parent_id=$2 AND status<>'ARCHIVED')"
			}
			if kind == "units" {
				query = "SELECT EXISTS(SELECT 1 FROM product_variants WHERE organization_id=$1 AND unit_id=$2 AND status<>'ARCHIVED') OR EXISTS(SELECT 1 FROM units WHERE organization_id=$1 AND base_unit_id=$2 AND status<>'ARCHIVED')"
			}
			var used bool
			if err = tx.QueryRow(ctx, query, org, id).Scan(&used); err != nil {
				return Taxonomy{}, err
			}
			if used {
				return Taxonomy{}, ErrConflict
			}
		}
	}
	args := []any{org, input.Name, input.Description, input.Status}
	extraColumns, extraValues, extraSet := "", "", ""
	if kind == "categories" {
		extraColumns = ",parent_id"
		extraValues = ",$5"
		extraSet = ",parent_id=$5"
		args = append(args, input.ParentID)
	}
	if kind == "units" {
		extraColumns = ",code,unit_type,base_unit_id,conversion_factor"
		extraValues = ",$5,$6,$7,$8"
		extraSet = ",code=$5,unit_type=$6,base_unit_id=$7,conversion_factor=$8"
		args = append(args, input.Code, input.UnitType, input.BaseUnitID, input.ConversionFactor)
	}
	query := "INSERT INTO " + kind + "(organization_id,name,description,status" + extraColumns + ") VALUES($1,$2,$3,$4" + extraValues + ") RETURNING " + taxonomyColumns(kind)
	if id != "" {
		args = append(args, id)
		query = fmt.Sprintf("UPDATE %s SET name=$2,description=$3,status=$4%s,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$%d RETURNING %s", kind, extraSet, len(args), taxonomyColumns(kind))
	}
	item, err := readTaxonomy(tx.QueryRow(ctx, query, args...), kind)
	if err != nil {
		return item, err
	}
	err = finish(ctx, tx, org, user, "catalog."+kind+".saved", item.ID)
	return item, err
}
func sameID(left, right *string) bool {
	return left == nil && right == nil || left != nil && right != nil && *left == *right
}
func decimalFactor(value string) string {
	parts := strings.SplitN(value, ".", 2)
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	return parts[0] + "." + fraction + strings.Repeat("0", 6-len(fraction))
}
