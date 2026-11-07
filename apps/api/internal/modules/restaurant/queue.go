package restaurant

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

const queueQuery = `SELECT doc.id::text,ticket.queue_number,doc.number,
 CASE WHEN table_map.order_id IS NOT NULL THEN 'DINE_IN' ELSE doc.fulfillment END,
 doc.status,'',COALESCE(table_map.table_code,''),doc.created_at
 FROM online_orders doc
 LEFT JOIN restaurant_order_tables table_map ON table_map.organization_id=doc.organization_id AND table_map.order_id=doc.id
 LEFT JOIN restaurant_order_queue ticket ON ticket.organization_id=doc.organization_id AND ticket.branch_id=doc.branch_id AND ticket.order_id=doc.id
 LEFT JOIN restaurant_queue_periods period ON period.organization_id=ticket.organization_id AND period.branch_id=ticket.branch_id AND period.period_start=ticket.period_start
 WHERE doc.organization_id=$1 AND doc.branch_id=$2
 AND ((ticket.order_id IS NOT NULL AND ticket.period_start <= $5 AND period.period_end > $5)
 OR (ticket.order_id IS NULL AND doc.created_at >= $3 AND doc.created_at < $4))
 AND doc.status IN ('PENDING','PREPARING','READY')
 AND storefront_order_live(doc.organization_id,doc.id)
 AND EXISTS(SELECT 1 FROM online_payment_attempts payment WHERE payment.organization_id=doc.organization_id AND payment.order_id=doc.id AND payment.state='PAID')
 ORDER BY COALESCE(ticket.issued_at,doc.created_at),doc.id`

func queueNumber(number *int64, legacy string) string {
	if number == nil {
		return legacy
	}
	return fmt.Sprintf("%03d", *number)
}

func AssignQueueNumber(ctx context.Context, tx pgx.Tx, org, branch, order string) (string, error) {
	if !uuidPattern.MatchString(org) || !uuidPattern.MatchString(branch) || !uuidPattern.MatchString(order) {
		return "", ErrInput
	}
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('restaurant.queue:' || $1::text || ':' || $2::text,0))`, org, branch); err != nil {
		return "", dbError(err)
	}
	var number int64
	err := tx.QueryRow(ctx, `SELECT queue_number FROM restaurant_order_queue WHERE organization_id=$1 AND branch_id=$2 AND order_id=$3`, org, branch, order).Scan(&number)
	if err == nil {
		return queueNumber(&number, ""), nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", dbError(err)
	}
	var issuedAt time.Time
	if err = tx.QueryRow(ctx, `SELECT clock_timestamp() FROM online_orders WHERE organization_id=$1 AND branch_id=$2 AND id=$3`, org, branch, order).Scan(&issuedAt); err != nil {
		return "", dbError(err)
	}
	settings, err := readSettingsAt(ctx, tx, org, branch, issuedAt)
	if err != nil {
		return "", err
	}
	var previous BusinessPeriod
	err = tx.QueryRow(ctx, `SELECT period_start,period_end FROM restaurant_queue_periods WHERE organization_id=$1 AND branch_id=$2 ORDER BY period_start DESC LIMIT 1`, org, branch).Scan(&previous.Start, &previous.End)
	var last *BusinessPeriod
	if err == nil {
		last = &previous
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return "", dbError(err)
	}
	period, err := queuePeriod(issuedAt, settings, last)
	if err != nil {
		return "", err
	}
	err = tx.QueryRow(ctx, `INSERT INTO restaurant_queue_periods(organization_id,branch_id,period_start,period_end,last_number) VALUES($1,$2,$3,$4,1) ON CONFLICT(organization_id,branch_id,period_start) DO UPDATE SET last_number=restaurant_queue_periods.last_number+1 WHERE restaurant_queue_periods.period_end=EXCLUDED.period_end RETURNING last_number`, org, branch, period.Start, period.End).Scan(&number)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrConflict
	}
	if err != nil {
		return "", dbError(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO restaurant_order_queue(organization_id,branch_id,order_id,period_start,queue_number,issued_at) VALUES($1,$2,$3,$4,$5,$6)`, org, branch, order, period.Start, number, issuedAt); err != nil {
		return "", dbError(err)
	}
	return queueNumber(&number, ""), nil
}
