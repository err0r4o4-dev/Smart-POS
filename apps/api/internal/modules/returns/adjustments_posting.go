package returns

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"strings"
)

func (service *Service) TransitionAdjustment(ctx context.Context, user, org, kind, id, action, key string, input SettlementInput) (json.RawMessage, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permissionFor(kind, action))
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	doc, err := adjustmentHeader(ctx, tx, actor, user, org, kind, id)
	if err != nil {
		return nil, err
	}
	if err = inventory.BranchScope(ctx, tx, actor, org, doc.Branch, true); err != nil {
		return nil, dbError(err)
	}
	if action == "complete" && actor.Role == "CASHIER" && strings.HasPrefix(doc.Difference, "-") {
		return nil, organization.ErrDenied
	}
	if action != "confirm-settlement" && (input.Method != "" || input.Reference != "" || input.Note != "" || input.ShiftID != nil || input.Acknowledged) {
		return nil, ErrInput
	}
	op, cached, err := inventory.BeginOperation(ctx, tx, user, org, "adjustment."+kind+"."+action, key, struct {
		ID    string
		Input SettlementInput
	}{id, input})
	if err != nil || cached != nil {
		return cached, dbError(err)
	}
	if input.Revision != doc.Revision {
		return nil, ErrConflict
	}
	next := ""
	returnState := ""
	event := ""
	switch action {
	case "submit":
		if doc.Status != "DRAFT" {
			return nil, ErrConflict
		}
		next = "PENDING_APPROVAL"
		returnState = next
	case "approve":
		if doc.Status != "PENDING_APPROVAL" {
			return nil, ErrConflict
		}
		next = "APPROVED"
		returnState = next
	case "reject":
		if doc.Status != "PENDING_APPROVAL" {
			return nil, ErrConflict
		}
		next = "REJECTED"
		returnState = next
	case "cancel":
		if doc.Reporter != "" || !containsStatus(doc.Status, "DRAFT", "PENDING_APPROVAL", "APPROVED") {
			return nil, ErrConflict
		}
		next = "CANCELLED"
		returnState = next
	case "confirm-settlement":
		if doc.Status != "APPROVED" {
			return nil, ErrConflict
		}
		if err = acknowledgeAdjustment(ctx, tx, actor, user, org, doc, input); err != nil {
			return nil, err
		}
		event = "ACKNOWLEDGED"
	case "complete":
		if !containsStatus(doc.Status, "AWAITING_SETTLEMENT", "RECONCILIATION_REQUIRED") {
			return nil, ErrConflict
		}
		if doc.Reporter == "" {
			return nil, ErrConflict
		}
		if _, err = tx.Exec(ctx, "SAVEPOINT adjustment_posting"); err != nil {
			return nil, err
		}
		err = postAdjustment(ctx, tx, actor, user, org, op, doc)
		if err != nil {
			if _, rollbackErr := tx.Exec(ctx, "ROLLBACK TO SAVEPOINT adjustment_posting"); rollbackErr != nil {
				return nil, rollbackErr
			}
			if doc.Difference == "0.00" {
				return nil, adjustmentError(err)
			}
			next = "RECONCILIATION_REQUIRED"
			event = next
		} else {
			value, problem := adjustmentResult(ctx, tx, org, id)
			if problem != nil {
				return nil, problem
			}
			return value, dbError(tx.Commit(ctx))
		}
	default:
		return nil, ErrInput
	}
	if returnState != "" {
		_, err = tx.Exec(ctx, "UPDATE customer_returns SET status=$3,revision=revision+1,approved_by=CASE WHEN $3='APPROVED' THEN $4::uuid ELSE approved_by END,approved_at=CASE WHEN $3='APPROVED' THEN now() ELSE approved_at END WHERE organization_id=$1 AND id=$2", org, doc.ReturnID, returnState, user)
		if err != nil {
			return nil, dbError(err)
		}
	}
	if next != "" {
		_, err = tx.Exec(ctx, "UPDATE sale_adjustments SET status=$3,revision=revision+1,approved_by=CASE WHEN $4='approve' THEN $5::uuid ELSE approved_by END,approved_at=CASE WHEN $4='approve' THEN now() ELSE approved_at END,failure_code=CASE WHEN $3='RECONCILIATION_REQUIRED' THEN 'POSTING_CONFLICT' ELSE '' END WHERE organization_id=$1 AND id=$2", org, id, next, action, user)
		if err != nil {
			return nil, dbError(err)
		}
	}
	if event != "" {
		_, err = tx.Exec(ctx, "INSERT INTO adjustment_settlement_events(organization_id,adjustment_id,action,actor_id,reference,note) VALUES($1,$2,$3,$4,$5,$6)", org, id, event, user, input.Reference, input.Note)
		if err != nil {
			return nil, dbError(err)
		}
	}
	value, err := adjustmentResult(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, op, "adjustments."+action, id, value)
}
func containsStatus(value string, states ...string) bool {
	for _, status := range states {
		if value == status {
			return true
		}
	}
	return false
}
func acknowledgeAdjustment(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org string, doc adjustment, input SettlementInput) error {
	if !input.Acknowledged || !validText(input.Note, 2000, true) || !validText(input.Reference, 200, false) {
		return ErrInput
	}
	negative := strings.HasPrefix(doc.Difference, "-")
	if negative && actor.Role == "CASHIER" {
		return organization.ErrDenied
	}
	methods := []string{"CASH", "QR_MANUAL", "BANK_TRANSFER_MANUAL"}
	if negative {
		methods = []string{"CASH_REFUND", "MANUAL_BANK_REFUND", "MANUAL_ORIGINAL_METHOD_REFUND"}
	}
	if doc.Difference == "0.00" {
		methods = []string{"NONE"}
	}
	if !containsStatus(input.Method, methods...) {
		return ErrInput
	}
	if input.Method == "CASH" || input.Method == "CASH_REFUND" {
		if input.ShiftID == nil || !uuidPattern.MatchString(*input.ShiftID) {
			return ErrInput
		}
		var valid bool
		err := tx.QueryRow(ctx, `SELECT status='OPEN' AND branch_id=$3 AND cashier_id=$4 AND ($5::uuid IS NULL OR terminal_id=$5) AND ($6::numeric>=0 OR expected_cash-COALESCE((SELECT sum(amount) FROM customer_refunds WHERE organization_id=$1 AND shift_id=$2 AND status IN ('SETTLEMENT_REPORTED','RECONCILIATION_REQUIRED')),0)-COALESCE((SELECT sum(-net_difference) FROM sale_adjustments WHERE organization_id=$1 AND shift_id=$2 AND net_difference<0 AND reported_at IS NOT NULL AND status IN ('AWAITING_SETTLEMENT','RECONCILIATION_REQUIRED')),0)>=-$6::numeric) FROM register_shifts WHERE organization_id=$1 AND id=$2 FOR UPDATE`, org, *input.ShiftID, doc.Branch, user, nullable(doc.Terminal), doc.Difference).Scan(&valid)
		if err != nil {
			return dbError(err)
		}
		if !valid {
			return ErrConflict
		}
	} else if input.ShiftID != nil || input.Method != "NONE" && !validText(input.Reference, 200, true) {
		return ErrInput
	}
	_, err := tx.Exec(ctx, "UPDATE sale_adjustments SET status='AWAITING_SETTLEMENT',method=$3,shift_id=$4,reference=$5,settlement_note=$6,reported_by=$7,reported_at=now(),revision=revision+1 WHERE organization_id=$1 AND id=$2", org, doc.ID, input.Method, input.ShiftID, input.Reference, input.Note, user)
	return dbError(err)
}
func postAdjustment(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, op string, doc adjustment) error {
	if doc.Kind == "REVERSAL" {
		var adjusted bool
		err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM customer_returns WHERE organization_id=$1 AND original_sale_id=$2 AND status='COMPLETED')", org, doc.Sale).Scan(&adjusted)
		if err != nil {
			return err
		}
		if adjusted {
			return ErrConflict
		}
	}
	if doc.Shift != nil {
		if doc.Reporter != user {
			return organization.ErrDenied
		}
		var valid bool
		err := tx.QueryRow(ctx, "SELECT status='OPEN' AND branch_id=$3 AND cashier_id=$4 FROM register_shifts WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, *doc.Shift, doc.Branch, user).Scan(&valid)
		if err != nil {
			return dbError(err)
		}
		if !valid {
			return ErrConflict
		}
	}
	returned, err := header(ctx, tx, actor, org, doc.ReturnID)
	if err != nil {
		return err
	}
	if returned.Status != "APPROVED" {
		return ErrConflict
	}
	refundAmount := ""
	if strings.HasPrefix(doc.Difference, "-") {
		refundAmount = strings.TrimPrefix(doc.Difference, "-")
	}
	if err = post(ctx, tx, actor, user, org, op, returned, &refundAmount); err != nil {
		return err
	}
	var sale any
	if doc.Kind == "EXCHANGE" {
		saleID, err := pos.PostExchange(ctx, tx, actor, user, org, doc.ID, doc.Terminal, doc.Credit, doc.Method, doc.Reference, doc.Items)
		if err != nil {
			return adjustmentError(err)
		}
		sale = saleID
	}
	if refundAmount != "" {
		var refundID string
		if err = tx.QueryRow(ctx, "SELECT id::text FROM customer_refunds WHERE organization_id=$1 AND return_id=$2", org, doc.ReturnID).Scan(&refundID); err != nil {
			return err
		}
		value, err := refundHeader(ctx, tx, actor, user, org, refundID)
		if err != nil {
			return err
		}
		report := SettlementInput{Method: doc.Method, Reference: doc.Reference, Note: doc.Note, ShiftID: doc.Shift, Acknowledged: true}
		if _, err = applyRefundSettlement(ctx, tx, user, org, refundID, "report", report, value); err != nil {
			return err
		}
		value, err = refundHeader(ctx, tx, actor, user, org, refundID)
		if err != nil {
			return err
		}
		if _, err = applyRefundSettlement(ctx, tx, user, org, refundID, "confirm", SettlementInput{Note: doc.Note, Acknowledged: true}, value); err != nil {
			return err
		}
	}
	if _, err = tx.Exec(ctx, "UPDATE customer_returns SET status='COMPLETED',revision=revision+1,completed_by=$3,completed_at=now(),inventory_operation_id=$4 WHERE organization_id=$1 AND id=$2", org, doc.ReturnID, user, op); err != nil {
		return dbError(err)
	}
	if _, err = tx.Exec(ctx, "UPDATE sale_adjustments SET status='COMPLETED',revision=revision+1,replacement_sale_id=$3,completed_by=$4,completed_at=now(),operation_id=$5,failure_code='' WHERE organization_id=$1 AND id=$2", org, doc.ID, sale, user, op); err != nil {
		return dbError(err)
	}
	if _, err = tx.Exec(ctx, "INSERT INTO adjustment_settlement_events(organization_id,adjustment_id,action,actor_id,reference,note) VALUES($1,$2,'COMPLETED',$3,$4,$5)", org, doc.ID, user, doc.Reference, doc.Note); err != nil {
		return err
	}
	if err = organization.RecordAudit(ctx, tx, org, user, "adjustments.complete", doc.ID); err != nil {
		return err
	}
	evidence, err := adjustmentResult(ctx, tx, org, doc.ID)
	if err != nil {
		return err
	}
	if err = inventory.CompleteSale(ctx, tx, org, op, evidence); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, "SET CONSTRAINTS ALL IMMEDIATE")
	return dbError(err)
}
