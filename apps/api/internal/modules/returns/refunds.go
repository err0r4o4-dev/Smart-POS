package returns

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
)

type refund struct {
	ID, Branch, ReturnID, Status, Amount, Reference, Method string
	ShiftID                                                 *string
	Revision                                                int64
}

func refundHeader(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, id string) (refund, error) {
	var value refund
	if !uuidPattern.MatchString(id) {
		return value, ErrInput
	}
	err := tx.QueryRow(ctx, "SELECT id::text,branch_id::text,return_id::text,status,amount::text,reference,COALESCE(method,''),shift_id::text,revision FROM customer_refunds WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, id).Scan(&value.ID, &value.Branch, &value.ReturnID, &value.Status, &value.Amount, &value.Reference, &value.Method, &value.ShiftID, &value.Revision)
	if err != nil {
		return value, dbError(err)
	}
	doc, err := header(ctx, tx, actor, org, value.ReturnID)
	if err != nil {
		return value, err
	}
	if actor.Role == "CASHIER" && doc.Creator != user {
		return value, organization.ErrDenied
	}
	return value, nil
}
func refundResult(ctx context.Context, tx pgx.Tx, org, id string) (json.RawMessage, error) {
	return raw(ctx, tx, `SELECT to_jsonb(refund)||jsonb_build_object('amount',refund.amount::text,'events',COALESCE((SELECT jsonb_agg(to_jsonb(event) ORDER BY event.created_at,event.id) FROM (SELECT * FROM refund_settlement_events WHERE organization_id=$1 AND refund_id=$2 ORDER BY created_at DESC,id DESC LIMIT 100) event),'[]'::jsonb),'cash_disbursement_id',(SELECT id FROM register_cash_disbursements WHERE organization_id=$1 AND refund_id=$2)) FROM customer_refunds refund WHERE organization_id=$1 AND id=$2`, org, id)
}
func (service *Service) Settle(ctx context.Context, user, org, id, action, key string, input SettlementInput) (json.RawMessage, error) {
	permission := "refunds.settlement.confirm"
	if action == "report" {
		permission = "refunds.settlement.report"
	}
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	value, err := refundHeader(ctx, tx, actor, user, org, id)
	if err != nil {
		return nil, err
	}
	if err = inventory.BranchScope(ctx, tx, actor, org, value.Branch, true); err != nil {
		return nil, dbError(err)
	}
	if !input.Acknowledged || !validText(input.Note, 2000, true) || !validText(input.Reference, 200, false) {
		return nil, ErrInput
	}
	op, cached, err := inventory.BeginOperation(ctx, tx, user, org, "customer-refund."+action, key, struct {
		ID    string
		Input SettlementInput
	}{id, input})
	if err != nil || cached != nil {
		return cached, dbError(err)
	}
	if input.Revision != value.Revision {
		return nil, ErrConflict
	}
	next := ""
	switch action {
	case "report":
		if value.Status != "PENDING_SETTLEMENT" {
			return nil, ErrConflict
		}
		if input.Method != "CASH_REFUND" && input.Method != "MANUAL_BANK_REFUND" && input.Method != "MANUAL_ORIGINAL_METHOD_REFUND" {
			return nil, ErrInput
		}
		if input.Method == "CASH_REFUND" {
			if input.ShiftID == nil || !uuidPattern.MatchString(*input.ShiftID) {
				return nil, ErrInput
			}
			var valid bool
			err = tx.QueryRow(ctx, `SELECT status='OPEN' AND branch_id=$3 AND cashier_id=$4 AND expected_cash-COALESCE((SELECT sum(amount) FROM customer_refunds WHERE organization_id=$1 AND shift_id=$2 AND status IN ('SETTLEMENT_REPORTED','RECONCILIATION_REQUIRED')),0)>=$5::numeric FROM register_shifts WHERE organization_id=$1 AND id=$2 FOR UPDATE`, org, *input.ShiftID, value.Branch, user, value.Amount).Scan(&valid)
			if err != nil {
				return nil, dbError(err)
			}
			if !valid {
				return nil, ErrConflict
			}
		} else if input.ShiftID != nil || !validText(input.Reference, 200, true) {
			return nil, ErrInput
		}
		next = "SETTLEMENT_REPORTED"
		_, err = tx.Exec(ctx, `UPDATE customer_refunds SET status=$3,method=$4,reference=$5,settlement_note=$6,shift_id=$7,reported_by=$8,reported_at=now(),revision=revision+1 WHERE organization_id=$1 AND id=$2`, org, id, next, input.Method, input.Reference, input.Note, input.ShiftID, user)
		value.Reference = input.Reference
	case "confirm", "reconcile":
		if input.Method != "" || input.Reference != "" || input.ShiftID != nil {
			return nil, ErrInput
		}
		if value.Status != "SETTLEMENT_REPORTED" && value.Status != "RECONCILIATION_REQUIRED" {
			return nil, ErrConflict
		}
		next = "RECONCILIATION_REQUIRED"
		if action == "confirm" {
			next = "CONFIRMED"
			if value.Method == "CASH_REFUND" {
				_, err = tx.Exec(ctx, "INSERT INTO register_cash_disbursements(organization_id,shift_id,refund_id,amount,actor_id) VALUES($1,$2,$3,$4,$5)", org, value.ShiftID, id, value.Amount, user)
				if err != nil {
					return nil, dbError(err)
				}
			}
		}
		_, err = tx.Exec(ctx, `UPDATE customer_refunds SET status=$3,settlement_note=$4,revision=revision+1,confirmed_by=CASE WHEN $3='CONFIRMED' THEN $5::uuid ELSE NULL END,confirmed_at=CASE WHEN $3='CONFIRMED' THEN now() ELSE NULL END WHERE organization_id=$1 AND id=$2`, org, id, next, input.Note, user)
	default:
		return nil, ErrInput
	}
	if err != nil {
		return nil, dbError(err)
	}
	_, err = tx.Exec(ctx, "INSERT INTO refund_settlement_events(organization_id,refund_id,action,actor_id,reference,note) VALUES($1,$2,$3,$4,$5,$6)", org, id, next, user, value.Reference, input.Note)
	if err != nil {
		return nil, dbError(err)
	}
	saved, err := refundResult(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, op, "refunds."+action, id, saved)
}
