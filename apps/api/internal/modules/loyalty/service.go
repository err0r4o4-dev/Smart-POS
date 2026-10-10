package loyalty

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"math/big"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pricing"
	"strings"
	"unicode/utf8"
)

type Service struct{ Organization *organization.Service }
type AccountInput struct {
	CustomerID string `json:"customer_id"`
	ProgramID  string `json:"program_id"`
	Status     string `json:"status"`
	Revision   int64  `json:"revision"`
}
type AdjustmentInput struct {
	Points   int64  `json:"points"`
	Reason   string `json:"reason"`
	BranchID string `json:"branch_id"`
}

func dbError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	var problem *pgconn.PgError
	if errors.As(err, &problem) {
		switch problem.Code {
		case "23505", "23514", "40001", "40P01", "22003":
			return ErrConflict
		case "23503", "22P02":
			return ErrInput
		case "42501":
			return organization.ErrDenied
		}
	}
	return err
}
func (service *Service) begin(ctx context.Context, user, org, permission string) (pgx.Tx, organization.Member, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	if err == nil && actor.Role != "OWNER" && len(actor.BranchIDs) == 0 {
		tx.Rollback(ctx)
		return nil, actor, organization.ErrDenied
	}
	return tx, actor, err
}
func raw(ctx context.Context, tx pgx.Tx, sql string, args ...any) (json.RawMessage, error) {
	var result []byte
	err := tx.QueryRow(ctx, sql, args...).Scan(&result)
	return result, dbError(err)
}
func finish(ctx context.Context, tx pgx.Tx, user, org, op, event, id string, result json.RawMessage) (json.RawMessage, error) {
	if err := organization.RecordAudit(ctx, tx, org, user, event, id); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, "UPDATE inventory_operations SET result=$3 WHERE organization_id=$1 AND id=$2", org, op, result); err != nil {
		return nil, err
	}
	return result, dbError(tx.Commit(ctx))
}

const accountJSON = `to_jsonb(account)||jsonb_build_object('customer_code',customer.code,'customer_name',customer.name,'program_name',program.name,'program_status',program.status,'balance',COALESCE((SELECT sum(points) FROM loyalty_ledger WHERE organization_id=account.organization_id AND account_id=account.id),0)::text,'available',GREATEST(0,COALESCE((SELECT sum(points) FROM loyalty_ledger WHERE organization_id=account.organization_id AND account_id=account.id),0)-COALESCE((SELECT sum((pricing_snapshot->'loyalty'->>'points')::bigint) FROM pos_checkouts WHERE organization_id=account.organization_id AND pricing_snapshot->'loyalty'->>'account_id'=account.id::text AND status NOT IN ('COMPLETED','CANCELLED','RESOLVED')),0))::text)`
const accountJoin = ` FROM loyalty_accounts account JOIN customers customer ON customer.organization_id=account.organization_id AND customer.id=account.customer_id JOIN loyalty_programs program ON program.organization_id=account.organization_id AND program.id=account.program_id `

func accountResult(ctx context.Context, tx pgx.Tx, org, id string) (json.RawMessage, error) {
	return raw(ctx, tx, "SELECT "+accountJSON+accountJoin+" WHERE account.organization_id=$1 AND account.id=$2", org, id)
}
func (service *Service) Read(ctx context.Context, user, org, resource, customer, branch string, page int) (json.RawMessage, error) {
	tx, actor, err := service.begin(ctx, user, org, "loyalty.read")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if page < 1 || page > 10000 || customer != "" && !pricing.UUID.MatchString(customer) || branch != "" && !pricing.UUID.MatchString(branch) {
		return nil, ErrInput
	}
	if branch != "" {
		if err = inventory.BranchScope(ctx, tx, actor, org, branch, false); err != nil {
			return nil, dbError(err)
		}
	}
	switch resource {
	case "programs":
		return raw(ctx, tx, `SELECT jsonb_build_object('items',COALESCE(jsonb_agg(to_jsonb(program)||jsonb_build_object('spend',spend::text,'point_value',point_value::text) ORDER BY created_at,id),'[]'::jsonb)) FROM loyalty_programs program WHERE organization_id=$1`, org)
	case "accounts":
		return raw(ctx, tx, "SELECT jsonb_build_object('items',COALESCE(jsonb_agg(item),'[]'::jsonb),'page',$3::int,'page_size',25,'total',(SELECT count(*) FROM loyalty_accounts WHERE organization_id=$1 AND ($2='' OR customer_id::text=$2))) FROM (SELECT "+accountJSON+" AS item"+accountJoin+" WHERE account.organization_id=$1 AND ($2='' OR customer_id::text=$2) ORDER BY account.created_at DESC,account.id LIMIT 25 OFFSET $4) entries", org, customer, page, (page-1)*25)
	case "history":
		return raw(ctx, tx, `SELECT jsonb_build_object('items',COALESCE(jsonb_agg(to_jsonb(entry)||jsonb_build_object('points',entry.points::text)),'[]'::jsonb),'page',$5::int,'page_size',25) FROM (SELECT ledger.* FROM loyalty_ledger ledger JOIN loyalty_accounts account ON account.organization_id=ledger.organization_id AND account.id=ledger.account_id WHERE ledger.organization_id=$1 AND ($2='' OR account.customer_id::text=$2) AND ($3='' OR ledger.branch_id::text=$3) AND ($4::boolean OR ledger.branch_id=ANY($6::uuid[])) ORDER BY ledger.created_at DESC,ledger.id DESC LIMIT 25 OFFSET $7) entry`, org, customer, branch, actor.Role == "OWNER", page, actor.BranchIDs, (page-1)*25)
	}
	return nil, ErrInput
}
func (service *Service) SaveProgram(ctx context.Context, user, org, id, key string, input ProgramInput) (json.RawMessage, error) {
	tx, _, err := service.begin(ctx, user, org, "loyalty.manage")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if err = input.validate(); err != nil || id != "" && !pricing.UUID.MatchString(id) {
		return nil, ErrInput
	}
	op, cached, err := inventory.BeginOperation(ctx, tx, user, org, "loyalty.program", key, struct {
		ID    string
		Input ProgramInput
	}{id, input})
	if err != nil || cached != nil {
		return cached, dbError(err)
	}
	if id == "" {
		if input.Revision != 0 {
			return nil, ErrInput
		}
		err = tx.QueryRow(ctx, `INSERT INTO loyalty_programs(organization_id,name,spend,earn_points,point_value,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`, org, input.Name, input.Spend, input.EarnPoints, input.PointValue, input.Status, user).Scan(&id)
	} else {
		tag, problem := tx.Exec(ctx, `UPDATE loyalty_programs SET name=$3,spend=$4,earn_points=$5,point_value=$6,status=$7,revision=revision+1 WHERE organization_id=$1 AND id=$2 AND revision=$8`, org, id, input.Name, input.Spend, input.EarnPoints, input.PointValue, input.Status, input.Revision)
		err = problem
		if err == nil && tag.RowsAffected() != 1 {
			return nil, ErrConflict
		}
	}
	if err != nil {
		return nil, dbError(err)
	}
	result, err := raw(ctx, tx, `SELECT to_jsonb(program)||jsonb_build_object('spend',spend::text,'point_value',point_value::text) FROM loyalty_programs program WHERE organization_id=$1 AND id=$2`, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, op, "loyalty.program.saved", id, result)
}
func (service *Service) SaveAccount(ctx context.Context, user, org, id, key string, input AccountInput) (json.RawMessage, error) {
	permission := "loyalty.enroll"
	if id != "" {
		permission = "loyalty.manage"
	}
	tx, _, err := service.begin(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if input.Status != "ACTIVE" && input.Status != "SUSPENDED" || !pricing.UUID.MatchString(input.CustomerID) || !pricing.UUID.MatchString(input.ProgramID) || id != "" && !pricing.UUID.MatchString(id) {
		return nil, ErrInput
	}
	op, cached, err := inventory.BeginOperation(ctx, tx, user, org, "loyalty.account", key, struct {
		ID    string
		Input AccountInput
	}{id, input})
	if err != nil || cached != nil {
		return cached, dbError(err)
	}
	if id == "" {
		if input.Revision != 0 || input.Status != "ACTIVE" {
			return nil, ErrInput
		}
		err = tx.QueryRow(ctx, `INSERT INTO loyalty_accounts(organization_id,customer_id,program_id,created_by) SELECT $1,customer.id,program.id,$4 FROM customers customer JOIN loyalty_programs program ON program.organization_id=customer.organization_id WHERE customer.organization_id=$1 AND customer.id=$2 AND customer.status='ACTIVE' AND program.id=$3 AND program.status='ACTIVE' FOR SHARE OF customer,program RETURNING id::text`, org, input.CustomerID, input.ProgramID, user).Scan(&id)
	} else {
		tag, problem := tx.Exec(ctx, `UPDATE loyalty_accounts SET status=$3,revision=revision+1 WHERE organization_id=$1 AND id=$2 AND customer_id=$4 AND program_id=$5 AND revision=$6`, org, id, input.Status, input.CustomerID, input.ProgramID, input.Revision)
		err = problem
		if err == nil && tag.RowsAffected() != 1 {
			return nil, ErrConflict
		}
	}
	if err != nil {
		return nil, dbError(err)
	}
	result, err := accountResult(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, op, "loyalty.account.saved", id, result)
}
func (service *Service) Adjust(ctx context.Context, user, org, id, key string, input AdjustmentInput) (json.RawMessage, error) {
	tx, actor, err := service.begin(ctx, user, org, "loyalty.adjust")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	input.Reason = strings.TrimSpace(input.Reason)
	if !pricing.UUID.MatchString(id) || input.Points == 0 || input.Points < -MaximumPoints || input.Points > MaximumPoints || !utf8.ValidString(input.Reason) || utf8.RuneCountInString(input.Reason) > 2000 || input.Reason == "" || strings.ContainsRune(input.Reason, 0) {
		return nil, ErrInput
	}
	if err = inventory.BranchScope(ctx, tx, actor, org, input.BranchID, true); err != nil {
		return nil, dbError(err)
	}
	op, cached, err := inventory.BeginOperation(ctx, tx, user, org, "loyalty.adjust", key, struct {
		ID    string
		Input AdjustmentInput
	}{id, input})
	if err != nil || cached != nil {
		return cached, dbError(err)
	}
	var status string
	if err = tx.QueryRow(ctx, "SELECT status FROM loyalty_accounts WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, id).Scan(&status); err != nil {
		return nil, dbError(err)
	}
	if status != "ACTIVE" {
		return nil, ErrConflict
	}
	if input.Points < 0 {
		var available string
		var result struct {
			Available string `json:"available"`
		}
		data, problem := accountResult(ctx, tx, org, id)
		if problem != nil {
			return nil, problem
		}
		if problem = json.Unmarshal(data, &result); problem != nil {
			return nil, problem
		}
		available = result.Available
		amount, ok := new(big.Int).SetString(available, 10)
		if !ok || amount.Cmp(big.NewInt(-input.Points)) < 0 {
			return nil, ErrConflict
		}
	}
	_, err = tx.Exec(ctx, `INSERT INTO loyalty_ledger(organization_id,account_id,branch_id,kind,points,operation_id,reason,snapshot,created_by) VALUES($1,$2,$3,'ADJUST',$4,$5,$6,'{}',$7)`, org, id, input.BranchID, input.Points, op, input.Reason, user)
	if err != nil {
		return nil, dbError(err)
	}
	result, err := accountResult(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, op, "loyalty.points.adjusted", id, result)
}
