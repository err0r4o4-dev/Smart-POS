package pricing

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/organization"
)

type Service struct{ Organization *organization.Service }

func dbError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	var problem *pgconn.PgError
	if errors.As(err, &problem) {
		switch problem.Code {
		case "23514", "23505", "40001", "40P01":
			return ErrConflict
		case "23503", "22P02", "22003":
			return ErrInput
		case "42501":
			return organization.ErrDenied
		}
	}
	return err
}
func Scope(ctx context.Context, tx pgx.Tx, actor organization.Member, org, branch string, write bool) error {
	if branch == "" {
		if write && actor.Role != "OWNER" {
			return organization.ErrDenied
		}
		return nil
	}
	if !UUID.MatchString(branch) {
		return ErrInput
	}
	if actor.Role != "OWNER" && !contains(actor.BranchIDs, branch) {
		return organization.ErrDenied
	}
	var active bool
	if err := tx.QueryRow(ctx, "SELECT status='ACTIVE' FROM branches WHERE organization_id=$1 AND id=$2", org, branch).Scan(&active); err != nil {
		return dbError(err)
	}
	if write && !active {
		return ErrConflict
	}
	return nil
}
func definitions(ctx context.Context, tx pgx.Tx, org, table string) ([]Definition, error) {
	column := "items"
	if table == "promotions" {
		column = "rule"
	}
	rows, err := tx.Query(ctx, "SELECT id::text,name,COALESCE(branch_id::text,''),status,revision,priority,starts_at,ends_at,"+column+" FROM "+table+" WHERE organization_id=$1 ORDER BY priority DESC,id", org)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Definition{}
	for rows.Next() {
		var item Definition
		var data []byte
		if err = rows.Scan(&item.ID, &item.Name, &item.BranchID, &item.Status, &item.Revision, &item.Priority, &item.StartsAt, &item.EndsAt, &data); err != nil {
			return nil, err
		}
		if table == "promotions" {
			err = json.Unmarshal(data, &item.Rule)
		} else {
			err = json.Unmarshal(data, &item.Items)
		}
		if err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}
func EffectivePrice(ctx context.Context, tx pgx.Tx, org, branch, variant, catalog string) (string, string, int64, error) {
	var price, id string
	var revision int64
	err := tx.QueryRow(ctx, `SELECT entry->>'unit_price',list.id::text,list.revision FROM price_lists list CROSS JOIN LATERAL jsonb_array_elements(list.items) entry WHERE list.organization_id=$1 AND (list.branch_id IS NULL OR list.branch_id=$2::uuid) AND list.status='ACTIVE' AND (list.starts_at IS NULL OR list.starts_at<=statement_timestamp()) AND (list.ends_at IS NULL OR list.ends_at>statement_timestamp()) AND entry->>'variant_id'=$3 ORDER BY (list.branch_id IS NOT NULL) DESC,list.priority DESC,list.id LIMIT 1`, org, branch, variant).Scan(&price, &id, &revision)
	if errors.Is(err, pgx.ErrNoRows) {
		return catalog, "", 0, nil
	}
	return price, id, revision, dbError(err)
}
func QuoteCart(ctx context.Context, tx pgx.Tx, org, branch string, inputs []Line) (Quote, error) {
	if len(inputs) > 100 {
		return Quote{}, ErrInput
	}
	lines := make([]Line, len(inputs))
	seen := map[string]bool{}
	for index, input := range inputs {
		if !UUID.MatchString(input.VariantID) || seen[input.VariantID] {
			return Quote{}, ErrInput
		}
		seen[input.VariantID] = true
		line := Line{VariantID: input.VariantID, Quantity: input.Quantity}
		err := tx.QueryRow(ctx, `SELECT variant.selling_price::text,COALESCE(product.category_id::text,'') FROM product_variants variant JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id WHERE variant.organization_id=$1 AND variant.id=$2`, org, input.VariantID).Scan(&line.CatalogPrice, &line.CategoryID)
		if err != nil {
			return Quote{}, dbError(err)
		}
		line.UnitPrice, line.PriceListID, line.PriceRevision, err = EffectivePrice(ctx, tx, org, branch, input.VariantID, line.CatalogPrice)
		if err != nil {
			return Quote{}, err
		}
		lines[index] = line
	}
	all, err := definitions(ctx, tx, org, "promotions")
	if err != nil {
		return Quote{}, err
	}
	var activeIDs []string
	rows, err := tx.Query(ctx, `SELECT id::text FROM promotions WHERE organization_id=$1 AND (branch_id IS NULL OR branch_id=$2::uuid) AND status='ACTIVE' AND (starts_at IS NULL OR starts_at<=statement_timestamp()) AND (ends_at IS NULL OR ends_at>statement_timestamp()) AND (usage_limit=0 OR used<usage_limit)`, org, branch)
	if err != nil {
		return Quote{}, err
	}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return Quote{}, err
		}
		activeIDs = append(activeIDs, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return Quote{}, err
	}
	eligible := []Definition{}
	for _, item := range all {
		if contains(activeIDs, item.ID) {
			eligible = append(eligible, item)
		}
	}
	return Evaluate(lines, eligible)
}
func (service *Service) List(ctx context.Context, user, org, table, id string) (any, error) {
	permission := "pricing.read"
	if table == "promotions" {
		permission = "promotions.read"
	}
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	values, err := definitions(ctx, tx, org, table)
	if err != nil {
		return nil, err
	}
	result := []Definition{}
	for _, item := range values {
		if actor.Role != "OWNER" && item.BranchID != "" && !contains(actor.BranchIDs, item.BranchID) {
			continue
		}
		if id != "" && item.ID == id {
			return item, nil
		}
		result = append(result, item)
	}
	if id != "" {
		return nil, ErrNotFound
	}
	return result, nil
}
func references(ctx context.Context, tx pgx.Tx, org string, input Definition) error {
	ids := []string{}
	for _, item := range input.Items {
		ids = append(ids, item.VariantID)
	}
	if input.Rule != nil {
		ids = append(ids, input.Rule.VariantIDs...)
		for _, id := range input.Rule.CategoryIDs {
			var exists bool
			if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM categories WHERE organization_id=$1 AND id=$2)", org, id).Scan(&exists); err != nil {
				return err
			}
			if !exists {
				return ErrInput
			}
		}
	}
	for _, id := range ids {
		var exists bool
		if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM product_variants WHERE organization_id=$1 AND id=$2)", org, id).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return ErrInput
		}
	}
	return nil
}
func (service *Service) Save(ctx context.Context, user, org, table, id string, input Definition) (Definition, error) {
	permission := "pricing.manage"
	promotion := table == "promotions"
	if promotion {
		permission = "promotions.manage"
	}
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	if err != nil {
		return Definition{}, err
	}
	defer tx.Rollback(ctx)
	if err = input.Validate(promotion); err != nil {
		return input, err
	}
	if err = Scope(ctx, tx, actor, org, input.BranchID, true); err != nil {
		return input, err
	}
	if err = references(ctx, tx, org, input); err != nil {
		return input, err
	}
	column := "items"
	var data []byte
	if promotion {
		column = "rule"
		data, _ = json.Marshal(input.Rule)
	} else {
		data, _ = json.Marshal(input.Items)
	}
	if id == "" {
		query := "INSERT INTO " + table + "(organization_id,branch_id,name,priority,starts_at,ends_at," + column + ",created_by"
		values := ") VALUES($1,nullif($2,'')::uuid,$3,$4,$5,$6,$7,$8"
		args := []any{org, input.BranchID, input.Name, input.Priority, input.StartsAt, input.EndsAt, data, user}
		if promotion {
			query += ",usage_limit"
			values += ",$9"
			args = append(args, input.Rule.UsageLimit)
		}
		err = tx.QueryRow(ctx, query+values+") RETURNING id::text", args...).Scan(&id)
	} else {
		if !UUID.MatchString(id) {
			return input, ErrInput
		}
		query := "UPDATE " + table + " SET name=$3,priority=$4,starts_at=$5,ends_at=$6," + column + "=$7,revision=revision+1"
		args := []any{org, id, input.Name, input.Priority, input.StartsAt, input.EndsAt, data, input.Revision, input.BranchID}
		if promotion {
			query += ",usage_limit=$10"
			args = append(args, input.Rule.UsageLimit)
		}
		tag, problem := tx.Exec(ctx, query+" WHERE organization_id=$1 AND id=$2 AND revision=$8 AND branch_id IS NOT DISTINCT FROM nullif($9,'')::uuid AND status='DRAFT'", args...)
		err = problem
		if err == nil && tag.RowsAffected() != 1 {
			return input, ErrConflict
		}
	}
	if err != nil {
		return input, dbError(err)
	}
	if err = organization.RecordAudit(ctx, tx, org, user, "pricing."+table+".saved", id); err != nil {
		return input, err
	}
	values, err := definitions(ctx, tx, org, table)
	if err != nil {
		return input, err
	}
	for _, value := range values {
		if value.ID == id {
			input = value
			break
		}
	}
	return input, dbError(tx.Commit(ctx))
}
func (service *Service) Transition(ctx context.Context, user, org, table, id, action string, revision int64) (Definition, error) {
	permission := "pricing.manage"
	if table == "promotions" {
		permission = "promotions.manage"
	}
	if action == "approve" {
		permission = "pricing.approve"
	}
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	if err != nil {
		return Definition{}, err
	}
	defer tx.Rollback(ctx)
	if !UUID.MatchString(id) {
		return Definition{}, ErrInput
	}
	values, err := definitions(ctx, tx, org, table)
	if err != nil {
		return Definition{}, err
	}
	var item Definition
	for _, value := range values {
		if value.ID == id {
			item = value
			break
		}
	}
	if item.ID == "" {
		return item, ErrNotFound
	}
	if err = Scope(ctx, tx, actor, org, item.BranchID, true); err != nil {
		return item, err
	}
	if item.Revision != revision {
		return item, ErrConflict
	}
	next := ""
	switch action {
	case "submit":
		if item.Status == "DRAFT" {
			next = "PENDING_APPROVAL"
		}
	case "approve":
		if item.Status == "PENDING_APPROVAL" {
			next = "APPROVED"
		}
	case "activate":
		if contains([]string{"APPROVED", "PAUSED"}, item.Status) {
			next = "ACTIVE"
		}
	case "pause":
		if item.Status == "ACTIVE" {
			next = "PAUSED"
		}
	}
	if next == "" {
		return item, ErrConflict
	}
	query := "UPDATE " + table + " SET status=$3,revision=revision+1"
	args := []any{org, id, next}
	if action == "approve" {
		query += ",approved_by=$4,approved_at=now()"
		args = append(args, user)
	}
	_, err = tx.Exec(ctx, query+" WHERE organization_id=$1 AND id=$2", args...)
	if err != nil {
		return item, dbError(err)
	}
	item.Status = next
	item.Revision++
	if err = organization.RecordAudit(ctx, tx, org, user, "pricing."+table+"."+action, id); err != nil {
		return item, err
	}
	return item, dbError(tx.Commit(ctx))
}
