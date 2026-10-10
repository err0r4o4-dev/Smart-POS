package customers

import (
	"context"
	"encoding/json"
)

const historySQL = `WITH linked AS (
 SELECT sale.* FROM sales sale WHERE sale.organization_id=$1 AND sale.customer_id=$2 AND ($4 OR sale.branch_id=ANY($3::uuid[])) AND ($5::uuid IS NULL OR sale.branch_id=$5)
), activity AS (
 SELECT sale.id,CASE WHEN checkout.adjustment_id IS NULL THEN 'SALE' ELSE 'REPLACEMENT' END kind,sale.sale_number number,sale.status,sale.completed_at occurred_at,sale.branch_id,sale.branch_name,sale.id sale_id,NULL::uuid return_id,checkout.adjustment_id,
 sale.grand_total amount,payment.amount paid,0::numeric refunded,0::numeric pending_refund,payment.credit_amount return_credit
 FROM linked sale JOIN sale_payments payment ON payment.organization_id=sale.organization_id AND payment.sale_id=sale.id JOIN pos_checkouts checkout ON checkout.organization_id=sale.organization_id AND checkout.id=sale.checkout_id
 UNION ALL
 SELECT returned.id,'RETURN',returned.number,returned.status,COALESCE(returned.completed_at,returned.created_at),sale.branch_id,sale.branch_name,sale.id,returned.id,adjustment.id,returned.amount,0,0,0,returned.amount
 FROM linked sale JOIN customer_returns returned ON returned.organization_id=sale.organization_id AND returned.original_sale_id=sale.id LEFT JOIN sale_adjustments adjustment ON adjustment.organization_id=returned.organization_id AND adjustment.linked_return_id=returned.id
 UNION ALL
 SELECT refund.id,'REFUND',returned.number,refund.status,COALESCE(refund.confirmed_at,refund.reported_at,refund.created_at),sale.branch_id,sale.branch_name,sale.id,returned.id,adjustment.id,refund.amount,0,CASE WHEN refund.status='CONFIRMED' THEN refund.amount ELSE 0 END,CASE WHEN refund.status<>'CONFIRMED' THEN refund.amount ELSE 0 END,0
 FROM linked sale JOIN customer_returns returned ON returned.organization_id=sale.organization_id AND returned.original_sale_id=sale.id JOIN customer_refunds refund ON refund.organization_id=returned.organization_id AND refund.return_id=returned.id LEFT JOIN sale_adjustments adjustment ON adjustment.organization_id=returned.organization_id AND adjustment.linked_return_id=returned.id
 UNION ALL
 SELECT adjustment.id,adjustment.kind,adjustment.number,adjustment.status,COALESCE(adjustment.completed_at,adjustment.created_at),sale.branch_id,sale.branch_name,sale.id,adjustment.linked_return_id,adjustment.id,adjustment.net_difference,0,0,0,adjustment.return_credit
 FROM linked sale JOIN sale_adjustments adjustment ON adjustment.organization_id=sale.organization_id AND adjustment.original_sale_id=sale.id
), filtered AS (SELECT * FROM activity WHERE ($6::timestamptz IS NULL OR occurred_at>=$6) AND ($7::timestamptz IS NULL OR occurred_at<=$7)) `

type History struct {
	Page
	Summary struct {
		Purchases     int    `json:"purchases"`
		Replacements  int    `json:"replacements"`
		Paid          string `json:"paid"`
		Refunded      string `json:"refunded"`
		PendingRefund string `json:"pending_refund"`
		NetCollected  string `json:"net_collected"`
	} `json:"summary"`
}

func (service *Service) History(ctx context.Context, user, org, id string, filters Filter) (History, error) {
	result := History{Page: Page{Items: []json.RawMessage{}}}
	if !UUID.MatchString(id) || filters.validate() != nil {
		return result, ErrInput
	}
	result.Page.Page = filters.Page
	result.PageSize = filters.PageSize
	tx, actor, err := service.begin(ctx, user, org, "customers.history.read", filters)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	if _, err = read(ctx, tx, actor, org, id); err != nil {
		return result, err
	}
	args := []any{org, id, actor.BranchIDs, actor.Role == "OWNER", nullable(filters.BranchID), nullable(filters.From), nullable(filters.To)}
	err = tx.QueryRow(ctx, historySQL+`SELECT count(*),count(*) FILTER(WHERE kind='SALE'),count(*) FILTER(WHERE kind='REPLACEMENT'),COALESCE(sum(paid),0)::numeric(18,2)::text,COALESCE(sum(refunded),0)::numeric(18,2)::text,COALESCE(sum(pending_refund),0)::numeric(18,2)::text,COALESCE(sum(paid-refunded),0)::numeric(18,2)::text FROM filtered`, args...).Scan(&result.Total, &result.Summary.Purchases, &result.Summary.Replacements, &result.Summary.Paid, &result.Summary.Refunded, &result.Summary.PendingRefund, &result.Summary.NetCollected)
	if err != nil {
		return result, err
	}
	args = append(args, filters.PageSize, (filters.Page-1)*filters.PageSize)
	rows, err := tx.Query(ctx, historySQL+`SELECT to_jsonb(item)||jsonb_build_object('amount',amount::numeric(18,2)::text,'paid',paid::numeric(18,2)::text,'refunded',refunded::numeric(18,2)::text,'pending_refund',pending_refund::numeric(18,2)::text,'return_credit',return_credit::numeric(18,2)::text) FROM filtered item ORDER BY occurred_at DESC,id,kind LIMIT $8 OFFSET $9`, args...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		var data []byte
		if err = rows.Scan(&data); err != nil {
			return result, err
		}
		items = append(items, json.RawMessage(data))
	}
	result.Items = items
	return result, rows.Err()
}
func (service *Service) Audit(ctx context.Context, user, org, id string, filters Filter) (Page, error) {
	result := Page{Items: []json.RawMessage{}, Page: filters.Page, PageSize: filters.PageSize}
	if !UUID.MatchString(id) || filters.validate() != nil {
		return result, ErrInput
	}
	tx, actor, err := service.begin(ctx, user, org, "customers.history.read", Filter{})
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)
	if _, err = read(ctx, tx, actor, org, id); err != nil {
		return result, err
	}
	where := " FROM organization_audit_events WHERE organization_id=$1 AND object_id=$2 AND event_type LIKE 'customers.%'"
	if err = tx.QueryRow(ctx, "SELECT count(*)"+where, org, id).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := tx.Query(ctx, "SELECT jsonb_build_object('id',id,'actor_id',actor_id,'event_type',event_type,'created_at',created_at)"+where+" ORDER BY created_at DESC,id LIMIT $3 OFFSET $4", org, id, filters.PageSize, (filters.Page-1)*filters.PageSize)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		var data []byte
		if err = rows.Scan(&data); err != nil {
			return result, err
		}
		items = append(items, json.RawMessage(data))
	}
	result.Items = items
	return result, rows.Err()
}
