package customers

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
)

const groupColumns = `item.id::text,item.code,item.name,item.status,item.revision,(SELECT count(*) FROM customer_group_memberships WHERE organization_id=item.organization_id AND group_id=item.id)`

func scanGroup(row pgx.Row) (Group, error) {
	var item Group
	err := row.Scan(&item.ID, &item.Code, &item.Name, &item.Status, &item.Revision, &item.MemberCount)
	return item, dbError(err)
}
func readGroup(ctx context.Context, tx pgx.Tx, org, id string) (Group, error) {
	return scanGroup(tx.QueryRow(ctx, "SELECT "+groupColumns+" FROM customer_groups item WHERE organization_id=$1 AND id=$2", org, id))
}
func (service *Service) Groups(ctx context.Context, user, org string, filters Filter) (Page, error) {
	if err := filters.validate(); err != nil {
		return Page{}, err
	}
	result := Page{Items: []Group{}, Page: filters.Page, PageSize: filters.PageSize}
	tx, _, err := service.begin(ctx, user, org, "customers.groups.read", filters)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	where := ` FROM customer_groups item WHERE organization_id=$1 AND ($2='' OR status=$2)`
	if err = tx.QueryRow(ctx, "SELECT count(*)"+where, org, filters.Status).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := tx.Query(ctx, "SELECT "+groupColumns+where+" ORDER BY item.code,item.id LIMIT $3 OFFSET $4", org, filters.Status, filters.PageSize, (filters.Page-1)*filters.PageSize)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	items := []Group{}
	for rows.Next() {
		item, problem := scanGroup(rows)
		if problem != nil {
			return result, problem
		}
		items = append(items, item)
	}
	result.Items = items
	return result, rows.Err()
}
func (service *Service) SaveGroup(ctx context.Context, user, org, id, key string, input Group) (Group, error) {
	if input.normalize() != nil || input.Status != "ACTIVE" || id == "" && (!UUID.MatchString(key) || input.Revision != 0) || id != "" && (!UUID.MatchString(id) || input.Revision < 1) {
		return Group{}, ErrInput
	}
	tx, _, err := service.begin(ctx, user, org, "customers.groups.manage", Filter{})
	if err != nil {
		return Group{}, err
	}
	defer tx.Rollback(ctx)
	event := "customers.group.updated"
	if id == "" {
		hash := fingerprint(struct{ Code, Name string }{input.Code, input.Name})
		var previous string
		err = tx.QueryRow(ctx, "SELECT id::text,create_fingerprint FROM customer_groups WHERE organization_id=$1 AND created_by=$2 AND create_key=$3", org, user, key).Scan(&id, &previous)
		if err == nil {
			if hash != previous {
				return Group{}, ErrConflict
			}
			return readGroup(ctx, tx, org, id)
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return Group{}, err
		}
		err = tx.QueryRow(ctx, "INSERT INTO customer_groups(organization_id,code,name,created_by,create_key,create_fingerprint) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text", org, input.Code, input.Name, user, key, hash).Scan(&id)
		event = "customers.group.created"
	} else {
		command, problem := tx.Exec(ctx, "UPDATE customer_groups SET code=$3,name=$4,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2 AND revision=$5 AND status='ACTIVE'", org, id, input.Code, input.Name, input.Revision)
		err = problem
		if err == nil && command.RowsAffected() != 1 {
			return Group{}, ErrConflict
		}
	}
	if err != nil {
		return Group{}, dbError(err)
	}
	item, err := readGroup(ctx, tx, org, id)
	if err != nil {
		return item, err
	}
	return item, finish(ctx, tx, org, user, event, id)
}

type MembershipInput struct {
	Revision      int64 `json:"revision"`
	GroupRevision int64 `json:"group_revision"`
	Present       bool  `json:"present"`
}

func (service *Service) Membership(ctx context.Context, user, org, id, groupID string, input MembershipInput) (Customer, error) {
	if !UUID.MatchString(id) || !UUID.MatchString(groupID) || input.Revision < 1 || input.GroupRevision < 1 {
		return Customer{}, ErrInput
	}
	tx, actor, err := service.begin(ctx, user, org, "customers.manage", Filter{})
	if err != nil {
		return Customer{}, err
	}
	defer tx.Rollback(ctx)
	if !has(actor.Permissions, "customers.groups.manage") {
		return Customer{}, organization.ErrDenied
	}
	customer, err := read(ctx, tx, actor, org, id)
	if err != nil {
		return customer, err
	}
	group, err := readGroup(ctx, tx, org, groupID)
	if err != nil {
		return customer, err
	}
	if customer.Revision != input.Revision || customer.Status != "ACTIVE" || group.Revision != input.GroupRevision || input.Present && group.Status != "ACTIVE" {
		return customer, ErrConflict
	}
	var present bool
	err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM customer_group_memberships WHERE organization_id=$1 AND customer_id=$2 AND group_id=$3)", org, id, groupID).Scan(&present)
	if err != nil {
		return customer, err
	}
	if present == input.Present {
		return customer, nil
	}
	if input.Present {
		_, err = tx.Exec(ctx, "INSERT INTO customer_group_memberships(organization_id,customer_id,group_id,created_by) VALUES($1,$2,$3,$4)", org, id, groupID, user)
	} else {
		_, err = tx.Exec(ctx, "DELETE FROM customer_group_memberships WHERE organization_id=$1 AND customer_id=$2 AND group_id=$3", org, id, groupID)
	}
	if err != nil {
		return customer, dbError(err)
	}
	if _, err = tx.Exec(ctx, "UPDATE customers SET revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2", org, id); err != nil {
		return customer, dbError(err)
	}
	if group.Status == "ACTIVE" {
		if _, err = tx.Exec(ctx, "UPDATE customer_groups SET revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2", org, groupID); err != nil {
			return customer, dbError(err)
		}
	}
	customer, err = read(ctx, tx, actor, org, id)
	if err != nil {
		return customer, err
	}
	return customer, finish(ctx, tx, org, user, "customers.membership.changed", id)
}
