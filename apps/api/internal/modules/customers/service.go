package customers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"

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
		case "23505", "23514", "40001", "40P01":
			return ErrConflict
		case "23503", "22P02", "22003":
			return ErrInput
		case "42501":
			return organization.ErrDenied
		}
	}
	return err
}
func has(values []string, value string) bool {
	for _, entry := range values {
		if entry == value {
			return true
		}
	}
	return false
}
func (service *Service) begin(ctx context.Context, user, org, permission string, filters Filter) (pgx.Tx, organization.Member, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	if err != nil {
		return nil, actor, err
	}
	if actor.Role != "OWNER" && len(actor.BranchIDs) == 0 || filters.BranchID != "" && actor.Role != "OWNER" && !has(actor.BranchIDs, filters.BranchID) {
		tx.Rollback(ctx)
		return nil, actor, organization.ErrDenied
	}
	if filters.BranchID != "" {
		var exists bool
		err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM branches WHERE organization_id=$1 AND id=$2)", org, filters.BranchID).Scan(&exists)
		if err != nil || !exists {
			tx.Rollback(ctx)
			if err != nil {
				return nil, actor, err
			}
			return nil, actor, ErrNotFound
		}
	}
	return tx, actor, nil
}
func finish(ctx context.Context, tx pgx.Tx, org, user, event, id string) error {
	if err := organization.RecordAudit(ctx, tx, org, user, event, id); err != nil {
		return err
	}
	return dbError(tx.Commit(ctx))
}
func fingerprint(input any) string {
	data, _ := json.Marshal(input)
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

const customerColumns = `item.id::text,item.code,item.name,item.phone,item.email,item.notes,item.marketing_consent,item.status,item.revision,item.created_at,item.updated_at,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',g.id,'code',g.code,'name',g.name,'status',g.status,'revision',g.revision,'member_count',(SELECT count(*) FROM customer_group_memberships members WHERE members.organization_id=g.organization_id AND members.group_id=g.id)) ORDER BY g.code) FROM customer_group_memberships m JOIN customer_groups g ON g.organization_id=m.organization_id AND g.id=m.group_id WHERE m.organization_id=item.organization_id AND m.customer_id=item.id),'[]'::jsonb)`

func scanCustomer(row pgx.Row, actor organization.Member) (Customer, error) {
	var item Customer
	var groups []byte
	err := row.Scan(&item.ID, &item.Code, &item.Name, &item.Phone, &item.Email, &item.Notes, &item.MarketingConsent, &item.Status, &item.Revision, &item.CreatedAt, &item.UpdatedAt, &groups)
	if err != nil {
		return item, dbError(err)
	}
	if err = json.Unmarshal(groups, &item.Groups); err != nil {
		return item, err
	}
	if !has(actor.Permissions, "customers.manage") {
		item.mask()
	}
	return item, nil
}
func read(ctx context.Context, tx pgx.Tx, actor organization.Member, org, id string) (Customer, error) {
	if !UUID.MatchString(id) {
		return Customer{}, ErrInput
	}
	return scanCustomer(tx.QueryRow(ctx, "SELECT "+customerColumns+" FROM customers item WHERE item.organization_id=$1 AND item.id=$2", org, id), actor)
}
func (service *Service) Get(ctx context.Context, user, org, id string) (Customer, error) {
	tx, actor, err := service.begin(ctx, user, org, "customers.read", Filter{})
	if err != nil {
		return Customer{}, err
	}
	defer tx.Rollback(ctx)
	return read(ctx, tx, actor, org, id)
}
func (service *Service) List(ctx context.Context, user, org string, filters Filter) (Page, error) {
	result := Page{Items: []Customer{}, Page: filters.Page, PageSize: filters.PageSize}
	if err := filters.validate(); err != nil {
		return result, err
	}
	result.Page = filters.Page
	result.PageSize = filters.PageSize
	tx, actor, err := service.begin(ctx, user, org, "customers.read", filters)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	where := ` FROM customers item WHERE item.organization_id=$1 AND ($2='' OR item.status=$2) AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM customer_group_memberships WHERE organization_id=item.organization_id AND customer_id=item.id AND group_id=$3)) AND ($4='' OR lower(item.code) LIKE $4 ESCAPE '\' OR lower(item.name) LIKE $4 ESCAPE '\' OR item.phone LIKE $4 ESCAPE '\' OR item.email LIKE $4 ESCAPE '\')`
	search := ""
	if filters.Search != "" {
		search = strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(strings.ToLower(strings.TrimSpace(filters.Search))) + "%"
	}
	args := []any{org, filters.Status, nullable(filters.GroupID), search}
	if err = tx.QueryRow(ctx, "SELECT count(*)"+where, args...).Scan(&result.Total); err != nil {
		return result, err
	}
	args = append(args, filters.PageSize, (filters.Page-1)*filters.PageSize)
	rows, err := tx.Query(ctx, "SELECT "+customerColumns+where+" ORDER BY item.created_at DESC,item.id LIMIT $5 OFFSET $6", args...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	items := []Customer{}
	for rows.Next() {
		item, problem := scanCustomer(rows, actor)
		if problem != nil {
			return result, problem
		}
		items = append(items, item)
	}
	result.Items = items
	return result, rows.Err()
}
func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}
func (service *Service) Save(ctx context.Context, user, org, id, key string, input Input) (Customer, error) {
	if input.normalize() != nil || input.Status != "ACTIVE" || id == "" && (!UUID.MatchString(key) || input.Revision != 0) || id != "" && (!UUID.MatchString(id) || input.Revision < 1) {
		return Customer{}, ErrInput
	}
	tx, actor, err := service.begin(ctx, user, org, "customers.manage", Filter{})
	if err != nil {
		return Customer{}, err
	}
	defer tx.Rollback(ctx)
	event := "customers.updated"
	if id == "" {
		hash := fingerprint(input)
		var previous string
		err = tx.QueryRow(ctx, "SELECT id::text,create_fingerprint FROM customers WHERE organization_id=$1 AND created_by=$2 AND create_key=$3", org, user, key).Scan(&id, &previous)
		if err == nil {
			if previous != hash {
				return Customer{}, ErrConflict
			}
			return read(ctx, tx, actor, org, id)
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return Customer{}, err
		}
		err = tx.QueryRow(ctx, `INSERT INTO customers(organization_id,code,name,phone,email,notes,marketing_consent,created_by,create_key,create_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text`, org, input.Code, input.Name, input.Phone, input.Email, input.Notes, input.MarketingConsent, user, key, hash).Scan(&id)
		event = "customers.created"
	} else {
		command, problem := tx.Exec(ctx, `UPDATE customers SET code=$3,name=$4,phone=$5,email=$6,notes=$7,marketing_consent=$8,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2 AND revision=$9 AND status='ACTIVE'`, org, id, input.Code, input.Name, input.Phone, input.Email, input.Notes, input.MarketingConsent, input.Revision)
		err = problem
		if err == nil && command.RowsAffected() != 1 {
			return Customer{}, ErrConflict
		}
	}
	if err != nil {
		return Customer{}, dbError(err)
	}
	item, err := read(ctx, tx, actor, org, id)
	if err != nil {
		return item, err
	}
	return item, finish(ctx, tx, org, user, event, id)
}
func (service *Service) Archive(ctx context.Context, user, org, id string, revision int64, group bool) (any, error) {
	permission, table, event := "customers.manage", "customers", "customers.archived"
	if group {
		permission, table, event = "customers.groups.manage", "customer_groups", "customers.group.archived"
	}
	if !UUID.MatchString(id) || revision < 1 {
		return nil, ErrInput
	}
	tx, actor, err := service.begin(ctx, user, org, permission, Filter{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	command, err := tx.Exec(ctx, "UPDATE "+table+" SET status='ARCHIVED',revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2 AND revision=$3 AND status='ACTIVE'", org, id, revision)
	if err != nil {
		return nil, dbError(err)
	}
	if command.RowsAffected() != 1 {
		return nil, ErrConflict
	}
	var result any
	if group {
		result, err = readGroup(ctx, tx, org, id)
	} else {
		result, err = read(ctx, tx, actor, org, id)
	}
	if err != nil {
		return nil, err
	}
	return result, finish(ctx, tx, org, user, event, id)
}
func ReadSelection(ctx context.Context, tx pgx.Tx, org, id string) (*Selection, error) {
	if id == "" {
		return nil, nil
	}
	if !UUID.MatchString(id) {
		return nil, ErrInput
	}
	var item Selection
	err := tx.QueryRow(ctx, "SELECT id::text,code,name,status FROM customers WHERE organization_id=$1 AND id=$2 FOR SHARE", org, id).Scan(&item.ID, &item.Code, &item.Name, &item.Status)
	return &item, dbError(err)
}
func ValidateSelection(ctx context.Context, tx pgx.Tx, actor organization.Member, org, id string) (*Selection, error) {
	if id == "" {
		return nil, nil
	}
	if !has(actor.Permissions, "customers.select") {
		return nil, organization.ErrDenied
	}
	item, err := ReadSelection(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	if item.Status != "ACTIVE" {
		return nil, ErrConflict
	}
	return item, nil
}
