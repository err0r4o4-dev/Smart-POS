package inventory

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/organization"
)

type Service struct{ Organization *organization.Service }

func databaseError(err error) error {
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
	return service.Organization.Authorized(ctx, user, org, permission)
}
func scope(ctx context.Context, tx pgx.Tx, actor organization.Member, org, branch string, write bool) error {
	if !uuidPattern.MatchString(branch) {
		return ErrInput
	}
	if actor.Role != "OWNER" && !contains(actor.BranchIDs, branch) {
		return organization.ErrDenied
	}
	var status string
	if err := tx.QueryRow(ctx, "SELECT status FROM branches WHERE organization_id=$1 AND id=$2", org, branch).Scan(&status); err != nil {
		return databaseError(err)
	}
	if write && status != "ACTIVE" {
		return ErrConflict
	}
	return nil
}

type LocationInput struct {
	BranchID    string  `json:"branch_id"`
	Code        string  `json:"code"`
	Name        string  `json:"name"`
	Type        string  `json:"type"`
	ParentID    *string `json:"parent_location_id"`
	Status      string  `json:"status"`
	Description string  `json:"description"`
	Revision    int64   `json:"revision"`
}
type Location struct {
	ID       string `json:"id"`
	BranchID string `json:"branch_id"`
	Type     string `json:"type"`
	Status   string `json:"status"`
	Revision int64  `json:"revision"`
	System   bool   `json:"is_system"`
}

func location(ctx context.Context, tx pgx.Tx, org, id string) (Location, error) {
	var item Location
	if !uuidPattern.MatchString(id) {
		return item, ErrInput
	}
	err := tx.QueryRow(ctx, "SELECT id::text,branch_id::text,type,status,revision,is_system FROM stock_locations WHERE organization_id=$1 AND id=$2", org, id).Scan(&item.ID, &item.BranchID, &item.Type, &item.Status, &item.Revision, &item.System)
	return item, databaseError(err)
}
func physical(ctx context.Context, tx pgx.Tx, actor organization.Member, org, id string, write bool) (Location, error) {
	item, err := location(ctx, tx, org, id)
	if err != nil {
		return item, err
	}
	if err = scope(ctx, tx, actor, org, item.BranchID, write); err != nil {
		return item, err
	}
	if write && (item.Status != "ACTIVE" || item.System) {
		return item, ErrConflict
	}
	return item, nil
}
func raw(ctx context.Context, tx pgx.Tx, query string, args ...any) (json.RawMessage, error) {
	var data []byte
	err := tx.QueryRow(ctx, query, args...).Scan(&data)
	return json.RawMessage(data), databaseError(err)
}
func operation(ctx context.Context, tx pgx.Tx, user, org, name, key string, input any) (string, json.RawMessage, error) {
	if !uuidPattern.MatchString(key) {
		return "", nil, ErrInput
	}
	encoded, err := json.Marshal(input)
	if err != nil {
		return "", nil, ErrInput
	}
	hashed := sha256.Sum256(encoded)
	fingerprint := hex.EncodeToString(hashed[:])
	var id, existing string
	var result []byte
	err = tx.QueryRow(ctx, "SELECT id::text,fingerprint,result FROM inventory_operations WHERE organization_id=$1 AND actor_id=$2 AND operation=$3 AND idempotency_key=$4", org, user, name, key).Scan(&id, &existing, &result)
	if err == nil {
		if fingerprint != existing || result == nil {
			return "", nil, ErrConflict
		}
		return id, json.RawMessage(result), nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", nil, err
	}
	err = tx.QueryRow(ctx, "INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,$3,$4,$5) RETURNING id::text", org, user, name, key, fingerprint).Scan(&id)
	return id, nil, databaseError(err)
}
func complete(ctx context.Context, tx pgx.Tx, user, org, op, event, object string, result json.RawMessage) (json.RawMessage, error) {
	if op != "" {
		if _, err := tx.Exec(ctx, "UPDATE inventory_operations SET result=$3 WHERE organization_id=$1 AND id=$2", org, op, []byte(result)); err != nil {
			return nil, err
		}
	}
	if err := organization.RecordAudit(ctx, tx, org, user, event, object); err != nil {
		return nil, err
	}
	return result, databaseError(tx.Commit(ctx))
}
func (service *Service) SaveLocation(ctx context.Context, user, org, id string, input LocationInput) (json.RawMessage, error) {
	tx, actor, err := service.begin(ctx, user, org, "inventory.location.manage")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if err = scope(ctx, tx, actor, org, input.BranchID, true); err != nil {
		return nil, err
	}
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	if !codePattern.MatchString(input.Code) || !text(input.Name, 200, true) || !text(input.Description, 2000, false) || !contains([]string{"ACTIVE", "INACTIVE"}, input.Status) || !contains([]string{"WAREHOUSE", "SALES_FLOOR", "SHELF", "QUARANTINE", "DAMAGED"}, input.Type) {
		return nil, ErrInput
	}
	if input.ParentID != nil {
		parent, err := physical(ctx, tx, actor, org, *input.ParentID, true)
		if err != nil {
			return nil, err
		}
		if parent.BranchID != input.BranchID || parent.ID == id {
			return nil, ErrInput
		}
		var cycle bool
		err = tx.QueryRow(ctx, `WITH RECURSIVE parents AS (SELECT id,parent_location_id FROM stock_locations WHERE organization_id=$1 AND id=$2 UNION SELECT child.id,child.parent_location_id FROM stock_locations child JOIN parents parent ON child.id=parent.parent_location_id WHERE child.organization_id=$1) SELECT EXISTS(SELECT 1 FROM parents WHERE id=nullif($3,'')::uuid)`, org, *input.ParentID, id).Scan(&cycle)
		if err != nil {
			return nil, err
		}
		if cycle {
			return nil, ErrConflict
		}
	}
	if id != "" {
		current, err := physical(ctx, tx, actor, org, id, false)
		if err != nil {
			return nil, err
		}
		if current.System || current.Revision != input.Revision || current.BranchID != input.BranchID {
			return nil, ErrConflict
		}
		var blocked bool
		err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM stock_movements WHERE organization_id=$1 AND location_id=$2) AND $3 OR $4 AND (EXISTS(SELECT 1 FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND quantity<>0) OR EXISTS(SELECT 1 FROM stock_locations WHERE organization_id=$1 AND parent_location_id=$2 AND status='ACTIVE') OR EXISTS(SELECT 1 FROM inventory_documents WHERE organization_id=$1 AND (location_id=$2 OR destination_location_id=$2) AND status NOT IN ('POSTED','RECEIVED','CANCELLED','REJECTED')))`, org, id, current.Type != input.Type, input.Status == "INACTIVE").Scan(&blocked)
		if err != nil {
			return nil, err
		}
		if blocked {
			return nil, ErrConflict
		}
		_, err = tx.Exec(ctx, "UPDATE stock_locations SET code=$3,name=$4,type=$5,parent_location_id=$6,status=$7,description=$8,revision=revision+1,updated_by=$9,updated_at=now() WHERE organization_id=$1 AND id=$2", org, id, input.Code, input.Name, input.Type, input.ParentID, input.Status, input.Description, user)
	} else {
		err = tx.QueryRow(ctx, "INSERT INTO stock_locations(organization_id,branch_id,code,name,type,parent_location_id,status,description,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id::text", org, input.BranchID, input.Code, input.Name, input.Type, input.ParentID, input.Status, input.Description, user).Scan(&id)
	}
	if err != nil {
		return nil, databaseError(err)
	}
	result, err := raw(ctx, tx, "SELECT to_jsonb(item) FROM stock_locations item WHERE organization_id=$1 AND id=$2", org, id)
	if err != nil {
		return nil, err
	}
	return complete(ctx, tx, user, org, "", "inventory.location.saved", id, result)
}
func validVariant(ctx context.Context, tx pgx.Tx, org, id, value string, active bool) error {
	amount, err := quantity(value)
	if err != nil {
		return err
	}
	var unitType, variantStatus, productStatus string
	err = tx.QueryRow(ctx, "SELECT unit.unit_type,variant.status,product.status FROM product_variants variant JOIN units unit ON unit.organization_id=variant.organization_id AND unit.id=variant.unit_id JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id WHERE variant.organization_id=$1 AND variant.id=$2", org, id).Scan(&unitType, &variantStatus, &productStatus)
	if err != nil {
		return databaseError(err)
	}
	if contains([]string{"COUNT", "PACKAGING"}, unitType) && amount%1000 != 0 {
		return ErrInput
	}
	if active && (variantStatus != "ACTIVE" || productStatus != "ACTIVE") {
		return ErrConflict
	}
	return nil
}
func postMovement(ctx context.Context, tx pgx.Tx, user, org, op, doc, loc, variant, kind, delta, reason string) error {
	result, err := tx.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,document_id,reason_code,performed_by) SELECT $1,branch_id,id,$3,$4,$5,$6,nullif($7,'')::uuid,$8,$9 FROM stock_locations WHERE organization_id=$1 AND id=$2`, org, loc, variant, kind, delta, op, doc, reason, user)
	if err != nil {
		return databaseError(err)
	}
	if result.RowsAffected() != 1 {
		return ErrNotFound
	}
	return nil
}
func (service *Service) Opening(ctx context.Context, user, org, key string, input Command) (json.RawMessage, error) {
	tx, actor, err := service.begin(ctx, user, org, "inventory.opening_balance.create")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if err = input.validate("OPENING"); err != nil {
		return nil, err
	}
	location, err := physical(ctx, tx, actor, org, input.LocationID, true)
	if err != nil {
		return nil, err
	}
	if input.BranchID != "" && input.BranchID != location.BranchID {
		return nil, ErrInput
	}
	op, cached, err := operation(ctx, tx, user, org, "opening", key, input)
	if err != nil || cached != nil {
		return cached, err
	}
	for _, item := range input.Items {
		if err = validVariant(ctx, tx, org, item.VariantID, item.Quantity, true); err != nil {
			return nil, err
		}
		if err = postMovement(ctx, tx, user, org, op, "", input.LocationID, item.VariantID, "OPENING_BALANCE", item.Quantity, input.ReasonCode); err != nil {
			return nil, err
		}
	}
	result := json.RawMessage(fmt.Sprintf(`{"id":%q,"status":"POSTED"}`, op))
	return complete(ctx, tx, user, org, op, "inventory.opening.posted", op, result)
}
