package pricing

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
	"strings"
)

type ApprovalInput struct {
	CartID          string `json:"cart_id"`
	Revision        int64  `json:"revision"`
	PricingRevision string `json:"pricing_revision"`
	Amount          string `json:"amount"`
	Reason          string `json:"reason"`
}

func approvalResult(ctx context.Context, tx pgx.Tx, org, id string) (json.RawMessage, error) {
	var data []byte
	err := tx.QueryRow(ctx, `SELECT to_jsonb(item)||jsonb_build_object('amount',amount::text) FROM discount_approvals item WHERE organization_id=$1 AND id=$2`, org, id).Scan(&data)
	return data, dbError(err)
}
func cartBasis(ctx context.Context, tx pgx.Tx, org, cart string) (string, string, int64, Quote, error) {
	var branch, user, status string
	var revision int64
	err := tx.QueryRow(ctx, "SELECT branch_id::text,cashier_id::text,revision,status FROM pos_carts WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, cart).Scan(&branch, &user, &revision, &status)
	if err != nil {
		return "", "", 0, Quote{}, dbError(err)
	}
	if status != "ACTIVE" {
		return "", "", 0, Quote{}, ErrConflict
	}
	rows, err := tx.Query(ctx, "SELECT variant_id::text,quantity::text FROM pos_cart_items WHERE organization_id=$1 AND cart_id=$2 ORDER BY variant_id", org, cart)
	if err != nil {
		return "", "", 0, Quote{}, err
	}
	lines := []Line{}
	for rows.Next() {
		var line Line
		if err = rows.Scan(&line.VariantID, &line.Quantity); err != nil {
			rows.Close()
			return "", "", 0, Quote{}, err
		}
		lines = append(lines, line)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return "", "", 0, Quote{}, err
	}
	quote, err := QuoteCart(ctx, tx, org, branch, lines)
	return branch, user, revision, quote, err
}
func CurrentApprover(ctx context.Context, tx pgx.Tx, org, id string) error {
	if id == "" {
		return nil
	}
	var authorized bool
	err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM discount_approvals approval JOIN organization_memberships member ON member.organization_id=approval.organization_id AND member.user_id=approval.approved_by JOIN users account ON account.id=member.user_id JOIN branches branch ON branch.organization_id=approval.organization_id AND branch.id=approval.branch_id WHERE approval.organization_id=$1 AND approval.id=$2 AND member.status='ACTIVE' AND account.status='ACTIVE' AND branch.status='ACTIVE' AND (member.role='OWNER' OR (member.role='MANAGER' AND EXISTS(SELECT 1 FROM branch_memberships WHERE organization_id=member.organization_id AND membership_id=member.id AND branch_id=approval.branch_id))))`, org, id).Scan(&authorized)
	if err != nil {
		return err
	}
	if !authorized {
		return organization.ErrDenied
	}
	return nil
}
func ApplyApproval(ctx context.Context, tx pgx.Tx, org, branch, user, cart string, revision int64, id string, quote Quote) (Quote, error) {
	if id == "" {
		return quote, nil
	}
	if !UUID.MatchString(id) {
		return quote, ErrInput
	}
	if err := CurrentApprover(ctx, tx, org, id); err != nil {
		return quote, err
	}
	var amount string
	err := tx.QueryRow(ctx, `SELECT amount::text FROM discount_approvals WHERE organization_id=$1 AND id=$2 AND branch_id=$3 AND requested_by=$4 AND cart_id=$5 AND cart_revision=$6 AND pricing_revision=$7 AND status='APPROVED' AND expires_at>statement_timestamp() FOR UPDATE`, org, id, branch, user, cart, revision, quote.Revision).Scan(&amount)
	if err != nil {
		return quote, ErrConflict
	}
	cents, err := Decimal(amount, 2)
	if err != nil {
		return quote, err
	}
	return Manual(quote, id, cents)
}
func Redeem(ctx context.Context, tx pgx.Tx, org, sale string, quote Quote) error {
	for _, item := range quote.Promotions {
		data, _ := json.Marshal(item)
		if _, err := tx.Exec(ctx, "INSERT INTO promotion_redemptions(organization_id,promotion_id,sale_id,promotion_revision,discount,snapshot) VALUES($1,$2,$3,$4,$5,$6)", org, item.ID, sale, item.Revision, item.Discount, data); err != nil {
			return dbError(err)
		}
	}
	if quote.ApprovalID != "" {
		tag, err := tx.Exec(ctx, "UPDATE discount_approvals SET status='CONSUMED',revision=revision+1 WHERE organization_id=$1 AND id=$2 AND status='APPROVED' AND expires_at>statement_timestamp()", org, quote.ApprovalID)
		if err != nil {
			return dbError(err)
		}
		if tag.RowsAffected() != 1 {
			return ErrConflict
		}
	}
	return nil
}
func (service *Service) RequestApproval(ctx context.Context, user, org, key string, input ApprovalInput) (json.RawMessage, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, "discount.request")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	cents, err := Decimal(input.Amount, 2)
	if err != nil || cents == 0 || !UUID.MatchString(key) || !UUID.MatchString(input.CartID) || len(strings.TrimSpace(input.Reason)) == 0 || len(input.Reason) > 2000 || strings.ContainsAny(input.Reason, "\x00\r\n") {
		return nil, ErrInput
	}
	branch, cashier, revision, quote, err := cartBasis(ctx, tx, org, input.CartID)
	if err != nil {
		return nil, err
	}
	if cashier != user {
		return nil, organization.ErrDenied
	}
	if err = Scope(ctx, tx, actor, org, branch, true); err != nil {
		return nil, err
	}
	total, _ := Decimal(quote.Total, 2)
	if revision != input.Revision || quote.Revision != input.PricingRevision || cents > total {
		return nil, ErrConflict
	}
	var id, previous, status string
	var alive bool
	err = tx.QueryRow(ctx, "SELECT id::text,fingerprint,status,expires_at>statement_timestamp() FROM discount_approvals WHERE organization_id=$1 AND requested_by=$2 AND idempotency_key=$3", org, user, key).Scan(&id, &previous, &status, &alive)
	if err == nil {
		if previous != Hash(input) || !alive {
			return nil, ErrConflict
		}
		if status == "APPROVED" {
			if err = CurrentApprover(ctx, tx, org, id); err != nil {
				return nil, err
			}
		}
		return approvalResult(ctx, tx, org, id)
	}
	if err != pgx.ErrNoRows {
		return nil, err
	}
	err = tx.QueryRow(ctx, "INSERT INTO discount_approvals(organization_id,branch_id,cart_id,cart_revision,pricing_revision,amount,reason,requested_by,idempotency_key,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text", org, branch, input.CartID, revision, quote.Revision, input.Amount, input.Reason, user, key, Hash(input)).Scan(&id)
	if err != nil {
		return nil, dbError(err)
	}
	result, err := approvalResult(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	if err = organization.RecordAudit(ctx, tx, org, user, "pricing.discount.requested", id); err != nil {
		return nil, err
	}
	return result, dbError(tx.Commit(ctx))
}
func (service *Service) Approvals(ctx context.Context, user, org string) ([]json.RawMessage, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, "discount.read")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `SELECT to_jsonb(item)||jsonb_build_object('amount',amount::text) FROM discount_approvals item WHERE organization_id=$1 AND ($2='OWNER' OR branch_id=ANY($3::uuid[])) AND ($2<>'CASHIER' OR requested_by=$4) ORDER BY created_at DESC,id LIMIT 200`, org, actor.Role, actor.BranchIDs, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []json.RawMessage{}
	for rows.Next() {
		var data []byte
		if err = rows.Scan(&data); err != nil {
			return nil, err
		}
		result = append(result, json.RawMessage(data))
	}
	return result, rows.Err()
}
func (service *Service) Decide(ctx context.Context, user, org, id, action string, revision int64) (json.RawMessage, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, "discount.approve")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !UUID.MatchString(id) {
		return nil, ErrInput
	}
	var branch, cart, pricingRevision, status string
	var cartRevision, current int64
	var alive bool
	err = tx.QueryRow(ctx, "SELECT branch_id::text,cart_id::text,cart_revision,pricing_revision,status,revision,expires_at>statement_timestamp() FROM discount_approvals WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, id).Scan(&branch, &cart, &cartRevision, &pricingRevision, &status, &current, &alive)
	if err != nil {
		return nil, dbError(err)
	}
	if err = Scope(ctx, tx, actor, org, branch, true); err != nil {
		return nil, err
	}
	if status != "PENDING" || current != revision || !alive {
		return nil, ErrConflict
	}
	if action == "approve" {
		_, _, actual, quote, err := cartBasis(ctx, tx, org, cart)
		if err != nil {
			return nil, err
		}
		if actual != cartRevision || quote.Revision != pricingRevision {
			return nil, ErrConflict
		}
		status = "APPROVED"
	} else if action == "reject" {
		status = "REJECTED"
	} else {
		return nil, ErrInput
	}
	_, err = tx.Exec(ctx, "UPDATE discount_approvals SET status=$3,revision=revision+1,approved_by=$4,approved_at=now() WHERE organization_id=$1 AND id=$2", org, id, status, user)
	if err != nil {
		return nil, dbError(err)
	}
	result, err := approvalResult(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	if err = organization.RecordAudit(ctx, tx, org, user, "pricing.discount."+action, id); err != nil {
		return nil, err
	}
	return result, dbError(tx.Commit(ctx))
}
