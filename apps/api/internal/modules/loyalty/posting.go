package loyalty

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/pricing"
)

func PostSale(ctx context.Context, tx pgx.Tx, user, org, sale string) error {
	var account, branch, total, spend, pointValue, program string
	var rate, revision int64
	err := tx.QueryRow(ctx, `SELECT account.id::text,sale.branch_id::text,sale.grand_total::text,program.spend::text,program.earn_points,program.point_value::text,program.id::text,program.revision FROM sales sale JOIN loyalty_accounts account ON account.organization_id=sale.organization_id AND account.customer_id=sale.customer_id JOIN loyalty_programs program ON program.organization_id=account.organization_id AND program.id=account.program_id JOIN customers customer ON customer.organization_id=account.organization_id AND customer.id=account.customer_id WHERE sale.organization_id=$1 AND sale.id=$2 AND account.status='ACTIVE' AND program.status='ACTIVE' AND customer.status='ACTIVE' FOR UPDATE OF account FOR SHARE OF program,customer`, org, sale).Scan(&account, &branch, &total, &spend, &rate, &pointValue, &program, &revision)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	var data []byte
	if err = tx.QueryRow(ctx, "SELECT pricing_snapshot FROM sales WHERE organization_id=$1 AND id=$2", org, sale).Scan(&data); err != nil {
		return err
	}
	var quote pricing.Quote
	if err = json.Unmarshal(data, &quote); err != nil {
		return err
	}
	if quote.Loyalty != nil {
		if quote.Loyalty.AccountID != account {
			return ErrConflict
		}
		rewardData, _ := json.Marshal(quote.Loyalty)
		if _, err = tx.Exec(ctx, `INSERT INTO loyalty_ledger(organization_id,account_id,branch_id,kind,points,sale_id,reason,snapshot,created_by) VALUES($1,$2,$3,'REDEEM',$4,$5,'Checkout reward discount',$6,$7)`, org, account, branch, -quote.Loyalty.Points, sale, rewardData, user); err != nil {
			return dbError(err)
		}
	}
	points, err := Earned(total, spend, rate)
	if err != nil {
		return err
	}
	snapshot, _ := json.Marshal(map[string]any{"program_id": program, "program_revision": revision, "spend": spend, "earn_points": rate, "point_value": pointValue, "eligible_total": total, "eligibility": "COMMITTED_SALE_NET_TOTAL", "returns": "CUMULATIVE_NET_PROPORTION", "spent_reversal": "DEBT_OFFSET_BY_FUTURE_EARNINGS"})
	_, err = tx.Exec(ctx, `INSERT INTO loyalty_ledger(organization_id,account_id,branch_id,kind,points,sale_id,reason,snapshot,created_by) VALUES($1,$2,$3,'EARN',$4,$5,'Committed sale earning',$6,$7)`, org, account, branch, points, sale, snapshot, user)
	return dbError(err)
}

func ReverseReturn(ctx context.Context, tx pgx.Tx, user, org, id string) error {
	var sale, branch string
	if err := tx.QueryRow(ctx, "SELECT original_sale_id::text,branch_id::text FROM customer_returns WHERE organization_id=$1 AND id=$2", org, id).Scan(&sale, &branch); err != nil {
		return err
	}
	var account string
	err := tx.QueryRow(ctx, `SELECT account_id::text FROM loyalty_ledger WHERE organization_id=$1 AND sale_id=$2 AND kind='EARN'`, org, sale).Scan(&account)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "SELECT 1 FROM loyalty_accounts WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, account); err != nil {
		return err
	}
	for _, kind := range []string{"EARN", "REDEEM"} {
		reversal := "EARN_REVERSAL"
		if kind == "REDEEM" {
			reversal = "REDEEM_REVERSAL"
		}
		var target, prior int64
		var snapshot []byte
		err = tx.QueryRow(ctx, `SELECT COALESCE(floor(abs(original.points)*CASE WHEN $4='EARN' THEN COALESCE((SELECT sum(item.refund_amount) FROM customer_return_items item JOIN customer_returns doc ON doc.organization_id=item.organization_id AND doc.id=item.return_id WHERE doc.organization_id=$1 AND doc.original_sale_id=$2 AND (doc.status='COMPLETED' OR doc.id=$3)),0)/NULLIF(sale.grand_total,0) ELSE COALESCE((SELECT sum(item.quantity*line.gross_total/line.quantity) FROM customer_return_items item JOIN customer_returns doc ON doc.organization_id=item.organization_id AND doc.id=item.return_id JOIN sale_items line ON line.organization_id=item.organization_id AND line.id=item.original_sale_item_id WHERE doc.organization_id=$1 AND doc.original_sale_id=$2 AND (doc.status='COMPLETED' OR doc.id=$3)),0)/NULLIF(sale.subtotal,0) END),0)::bigint,COALESCE((SELECT sum(abs(points)) FROM loyalty_ledger WHERE organization_id=$1 AND sale_id=$2 AND kind=$5),0)::bigint,original.snapshot FROM loyalty_ledger original JOIN sales sale ON sale.organization_id=original.organization_id AND sale.id=original.sale_id WHERE original.organization_id=$1 AND original.sale_id=$2 AND original.kind=$4`, org, sale, id, kind, reversal).Scan(&target, &prior, &snapshot)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		if target < prior {
			return ErrConflict
		}
		delta := prior - target
		if kind == "REDEEM" {
			delta = -delta
		}
		if _, err = tx.Exec(ctx, `INSERT INTO loyalty_ledger(organization_id,account_id,branch_id,kind,points,sale_id,return_id,reason,snapshot,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'Completed return points reversal',$8,$9)`, org, account, branch, reversal, delta, sale, id, snapshot, user); err != nil {
			return dbError(err)
		}
	}
	return nil
}
