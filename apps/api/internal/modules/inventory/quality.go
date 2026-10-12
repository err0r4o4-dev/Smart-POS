package inventory

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"strings"
	"time"
)

type BatchInput struct {
	VariantID      string  `json:"variant_id"`
	LotNumber      string  `json:"lot_number"`
	ManufacturedOn *string `json:"manufactured_on"`
	ExpiresOn      *string `json:"expires_on"`
	Status         string  `json:"status"`
	Reason         string  `json:"reason"`
	Revision       int64   `json:"revision"`
}

func QualityAvailability(ctx context.Context, tx pgx.Tx, org, location, variant string, batch *string, available *string, sellable *bool) error {
	return QualityAvailabilityForCart(ctx, tx, org, location, variant, batch, "", available, sellable)
}

func QualityAvailabilityForCart(ctx context.Context, tx pgx.Tx, org, location, variant string, batch *string, cart string, available *string, sellable *bool) error {
	if err := validateBatchReference(ctx, tx, org, variant, batch); err != nil {
		return err
	}
	var safe bool
	err := tx.QueryRow(ctx, `SELECT greatest(0.000,least(COALESCE((SELECT quantity FROM quality_stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3 AND batch_id IS NOT DISTINCT FROM $4::uuid),0.000),storefront_sellable_quantity($1,$2,$3)-storefront_reserved_quantity($1,$2,$3,nullif($5,'')::uuid)))::text,NOT EXISTS(SELECT 1 FROM quality_recalls WHERE organization_id=$1 AND variant_id=$3 AND (batch_id IS NULL OR batch_id=$4)) AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM product_batches WHERE organization_id=$1 AND variant_id=$3 AND id=$4 AND status='ACTIVE' AND (expires_on IS NULL OR expires_on>(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date)))`, org, location, variant, batch, cart).Scan(available, &safe)
	*sellable = *sellable && safe
	return databaseError(err)
}

func (input *BatchInput) validate() error {
	input.LotNumber = strings.TrimSpace(input.LotNumber)
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	if !uuidPattern.MatchString(input.VariantID) || !text(input.LotNumber, 100, true) || !text(input.Reason, 1000, true) || !contains([]string{"ACTIVE", "QUARANTINED"}, input.Status) {
		return ErrInput
	}
	for _, date := range []*string{input.ManufacturedOn, input.ExpiresOn} {
		if date != nil {
			if _, err := time.Parse("2006-01-02", *date); err != nil {
				return ErrInput
			}
		}
	}
	if input.ManufacturedOn != nil && input.ExpiresOn != nil && *input.ManufacturedOn > *input.ExpiresOn {
		return ErrInput
	}
	return nil
}

type RecallInput struct {
	VariantID string  `json:"variant_id"`
	BatchID   *string `json:"batch_id"`
	Reason    string  `json:"reason"`
}

type WriteOffInput struct {
	LocationID string  `json:"location_id"`
	VariantID  string  `json:"variant_id"`
	BatchID    *string `json:"batch_id"`
	Quantity   string  `json:"quantity"`
	Reason     string  `json:"reason"`
	Revision   int64   `json:"revision"`
}

func validateBatchReference(ctx context.Context, tx pgx.Tx, org, variant string, batch *string) error {
	if batch == nil {
		return nil
	}
	if !uuidPattern.MatchString(*batch) {
		return ErrInput
	}
	var id string
	err := tx.QueryRow(ctx, "SELECT id::text FROM product_batches WHERE organization_id=$1 AND variant_id=$2 AND id=$3", org, variant, *batch).Scan(&id)
	return databaseError(err)
}

func (service *Service) SaveBatch(ctx context.Context, user, org, id, key string, input BatchInput) (json.RawMessage, error) {
	permission := "quality.batch.create"
	if id != "" {
		permission = "quality.batch.manage"
	}
	tx, _, err := service.begin(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if err = input.validate(); err != nil {
		return nil, err
	}
	if err = validVariant(ctx, tx, org, input.VariantID, "0", false); err != nil {
		return nil, err
	}
	if id != "" && !uuidPattern.MatchString(id) {
		return nil, ErrInput
	}
	op, cached, err := operation(ctx, tx, user, org, "quality.batch."+id, key, input)
	if err != nil || cached != nil {
		return cached, err
	}
	if id == "" {
		err = tx.QueryRow(ctx, `INSERT INTO product_batches(organization_id,variant_id,lot_number,manufactured_on,expires_on,status,reason,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id::text`, org, input.VariantID, input.LotNumber, input.ManufacturedOn, input.ExpiresOn, input.Status, input.Reason, user).Scan(&id)
	} else {
		var changed string
		err = tx.QueryRow(ctx, `UPDATE product_batches SET status=$3,reason=$4,updated_by=$5,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2 AND revision=$6 AND variant_id=$7 AND lot_number=$8 AND manufactured_on IS NOT DISTINCT FROM $9::date AND expires_on IS NOT DISTINCT FROM $10::date RETURNING id::text`, org, id, input.Status, input.Reason, user, input.Revision, input.VariantID, input.LotNumber, input.ManufacturedOn, input.ExpiresOn).Scan(&changed)
		if err == pgx.ErrNoRows {
			return nil, ErrConflict
		}
	}
	if err != nil {
		return nil, databaseError(err)
	}
	result, err := raw(ctx, tx, "SELECT to_jsonb(batch) FROM product_batches batch WHERE organization_id=$1 AND id=$2", org, id)
	if err != nil {
		return nil, err
	}
	return complete(ctx, tx, user, org, op, "quality.batch.saved", id, result)
}

func (service *Service) CreateRecall(ctx context.Context, user, org, key string, input RecallInput) (json.RawMessage, error) {
	tx, _, err := service.begin(ctx, user, org, "quality.recall.manage")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(input.VariantID) || !text(input.Reason, 1000, true) {
		return nil, ErrInput
	}
	if err = validVariant(ctx, tx, org, input.VariantID, "0", false); err != nil {
		return nil, err
	}
	if err = validateBatchReference(ctx, tx, org, input.VariantID, input.BatchID); err != nil {
		return nil, err
	}
	op, cached, err := operation(ctx, tx, user, org, "quality.recall", key, input)
	if err != nil || cached != nil {
		return cached, err
	}
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO quality_recalls(organization_id,variant_id,batch_id,reason,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id::text`, org, input.VariantID, input.BatchID, input.Reason, user).Scan(&id)
	if err != nil {
		return nil, databaseError(err)
	}
	result, err := raw(ctx, tx, "SELECT to_jsonb(recall) FROM quality_recalls recall WHERE organization_id=$1 AND id=$2", org, id)
	if err != nil {
		return nil, err
	}
	return complete(ctx, tx, user, org, op, "quality.recall.activated", id, result)
}

func (service *Service) RequestWriteOff(ctx context.Context, user, org, key string, input WriteOffInput) (json.RawMessage, error) {
	tx, actor, err := service.begin(ctx, user, org, "quality.write_off.create")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !text(input.Reason, 1000, true) {
		return nil, ErrInput
	}
	place, err := physical(ctx, tx, actor, org, input.LocationID, true)
	if err != nil {
		return nil, err
	}
	amount, err := quantity(input.Quantity)
	if err != nil || amount <= 0 {
		return nil, ErrInput
	}
	if err = validVariant(ctx, tx, org, input.VariantID, input.Quantity, false); err != nil {
		return nil, err
	}
	if err = validateBatchReference(ctx, tx, org, input.VariantID, input.BatchID); err != nil {
		return nil, err
	}
	op, cached, err := operation(ctx, tx, user, org, "quality.write_off.request", key, input)
	if err != nil || cached != nil {
		return cached, err
	}
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO quality_write_offs(organization_id,branch_id,location_id,variant_id,batch_id,quantity,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text`, org, place.BranchID, input.LocationID, input.VariantID, input.BatchID, input.Quantity, input.Reason, user).Scan(&id)
	if err != nil {
		return nil, databaseError(err)
	}
	result, err := writeOffJSON(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return complete(ctx, tx, user, org, op, "quality.write_off.requested", id, result)
}

func writeOffJSON(ctx context.Context, tx pgx.Tx, org, id string) (json.RawMessage, error) {
	return raw(ctx, tx, "SELECT to_jsonb(doc)||jsonb_build_object('quantity',quantity::text) FROM quality_write_offs doc WHERE organization_id=$1 AND id=$2", org, id)
}

func (service *Service) ChangeWriteOff(ctx context.Context, user, org, id, action, key string, revision int64) (json.RawMessage, error) {
	if !uuidPattern.MatchString(id) || !contains([]string{"approve", "reject", "post"}, action) || revision < 1 {
		return nil, ErrInput
	}
	permission := "quality.write_off.approve"
	if action == "post" {
		permission = "quality.write_off.post"
	}
	tx, actor, err := service.begin(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var branch, location, variant, amount, status string
	var batch *string
	var current int64
	err = tx.QueryRow(ctx, "SELECT branch_id::text,location_id::text,variant_id::text,batch_id::text,quantity::text,status,revision FROM quality_write_offs WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, id).Scan(&branch, &location, &variant, &batch, &amount, &status, &current)
	if err != nil {
		return nil, databaseError(err)
	}
	if err = scope(ctx, tx, actor, org, branch, true); err != nil {
		return nil, err
	}
	op, cached, err := operation(ctx, tx, user, org, "quality.write_off."+action+"."+id, key, revision)
	if err != nil || cached != nil {
		return cached, err
	}
	if revision != current {
		return nil, ErrConflict
	}
	if action == "post" {
		if status != "APPROVED" {
			return nil, ErrConflict
		}
		if _, err = physical(ctx, tx, actor, org, location, true); err != nil {
			return nil, err
		}
		_, err = tx.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,batch_id,movement_type,quantity_delta,operation_id,reason_code,performed_by,quality_write_off_id) VALUES($1,$2,$3,$4,$5,'ADJUSTMENT_OUT',-$6::numeric,$7,'QUALITY_WRITE_OFF',$8,$9)`, org, branch, location, variant, batch, amount, op, user, id)
		if err != nil {
			return nil, databaseError(err)
		}
		_, err = tx.Exec(ctx, "UPDATE quality_write_offs SET status='POSTED',revision=revision+1,operation_id=$3,posted_by=$4,posted_at=now() WHERE organization_id=$1 AND id=$2", org, id, op, user)
	} else {
		if status != "PENDING_APPROVAL" {
			return nil, ErrConflict
		}
		next := "APPROVED"
		if action == "reject" {
			next = "REJECTED"
		}
		_, err = tx.Exec(ctx, "UPDATE quality_write_offs SET status=$3,revision=revision+1,approved_by=$4,approved_at=now() WHERE organization_id=$1 AND id=$2", org, id, next, user)
	}
	if err != nil {
		return nil, databaseError(err)
	}
	result, err := writeOffJSON(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return complete(ctx, tx, user, org, op, "quality.write_off."+action, id, result)
}

func (service *Service) ReadQuality(ctx context.Context, user, org, resource, branch, variant, location string, page int) (json.RawMessage, error) {
	tx, actor, err := service.begin(ctx, user, org, "quality.read")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if page < 1 || page > 10000 || variant != "" && !uuidPattern.MatchString(variant) || location != "" && !uuidPattern.MatchString(location) {
		return nil, ErrInput
	}
	if err = scope(ctx, tx, actor, org, branch, false); err != nil {
		return nil, err
	}
	var query string
	switch resource {
	case "lots":
		query = `SELECT COALESCE(jsonb_agg(data ORDER BY expires_on NULLS LAST,lot_number,id),'[]'::jsonb) FROM (SELECT id,expires_on,lot_number,to_jsonb(batch)||jsonb_build_object('history',COALESCE((SELECT jsonb_agg(jsonb_build_object('revision',operation.result->'revision','status',operation.result->>'status','reason',operation.result->>'reason','actor_id',operation.actor_id,'recorded_at',operation.result->>'updated_at') ORDER BY (operation.result->>'revision')::bigint) FROM inventory_operations operation WHERE operation.organization_id=batch.organization_id AND operation.operation LIKE 'quality.batch.%' AND operation.result->>'id'=batch.id::text),'[]'::jsonb)) data FROM product_batches batch WHERE organization_id=$1 AND ($3='' OR variant_id=nullif($3,'')::uuid) AND $2::uuid IS NOT NULL AND $4::text IS NOT NULL AND $6='lots' ORDER BY expires_on NULLS LAST,lot_number,id LIMIT 100 OFFSET $5) selected`
	case "batches", "expiry":
		query = `SELECT COALESCE(jsonb_agg(data ORDER BY expires_on NULLS LAST,lot_number,id),'[]'::jsonb) FROM (SELECT balance.id,batch.expires_on,COALESCE(batch.lot_number,'') lot_number,to_jsonb(balance)||jsonb_build_object('quantity',balance.quantity::text,'lot_number',batch.lot_number,'manufactured_on',batch.manufactured_on,'expires_on',batch.expires_on,'batch_status',batch.status,'batch_revision',batch.revision,'provenance',CASE WHEN batch.id IS NULL THEN 'UNTRACKED' ELSE 'RECORDED_LOT' END,'sellable',place.type IN ('WAREHOUSE','SALES_FLOOR','SHELF') AND place.status='ACTIVE' AND (batch.id IS NULL OR (batch.status='ACTIVE' AND (batch.expires_on IS NULL OR batch.expires_on>(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date))) AND NOT EXISTS(SELECT 1 FROM quality_recalls recall WHERE recall.organization_id=balance.organization_id AND recall.variant_id=balance.variant_id AND (recall.batch_id IS NULL OR recall.batch_id=balance.batch_id))) data FROM quality_stock_balances balance JOIN stock_locations place ON place.organization_id=balance.organization_id AND place.id=balance.location_id LEFT JOIN product_batches batch ON batch.organization_id=balance.organization_id AND batch.id=balance.batch_id WHERE balance.organization_id=$1 AND balance.branch_id=$2 AND ($3='' OR balance.variant_id=nullif($3,'')::uuid) AND ($4='' OR balance.location_id=nullif($4,'')::uuid) AND balance.quantity>0 AND ($6='batches' OR batch.expires_on<=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date+30) ORDER BY batch.expires_on NULLS LAST,batch.lot_number,balance.id LIMIT 100 OFFSET $5) selected`
	case "write-offs":
		query = `SELECT COALESCE(jsonb_agg(data ORDER BY created_at DESC,id),'[]'::jsonb) FROM (SELECT id,created_at,to_jsonb(doc)||jsonb_build_object('quantity',quantity::text) data FROM quality_write_offs doc WHERE organization_id=$1 AND branch_id=$2 AND ($3='' OR variant_id=nullif($3,'')::uuid) AND ($4='' OR location_id=nullif($4,'')::uuid) AND $6='write-offs' ORDER BY created_at DESC,id LIMIT 100 OFFSET $5) selected`
	case "recalls":
		query = `SELECT COALESCE(jsonb_agg(data ORDER BY created_at DESC,id),'[]'::jsonb) FROM (SELECT recall.id,recall.created_at,to_jsonb(recall)||jsonb_build_object('affected_locations',COALESCE((SELECT jsonb_agg(jsonb_build_object('location_id',balance.location_id,'batch_id',balance.batch_id,'quantity',balance.quantity::text)) FROM quality_stock_balances balance WHERE balance.organization_id=recall.organization_id AND balance.branch_id=$2 AND balance.variant_id=recall.variant_id AND (recall.batch_id IS NULL OR balance.batch_id=recall.batch_id) AND balance.quantity>0 AND ($4='' OR balance.location_id=nullif($4,'')::uuid)),'[]'::jsonb)) data FROM quality_recalls recall WHERE organization_id=$1 AND ($3='' OR variant_id=nullif($3,'')::uuid) AND $6='recalls' ORDER BY created_at DESC,id LIMIT 100 OFFSET $5) selected`
	default:
		return nil, ErrInput
	}
	result, err := raw(ctx, tx, query, org, branch, variant, location, (page-1)*100, resource)
	if err != nil {
		return nil, err
	}
	return result, databaseError(tx.Commit(ctx))
}
