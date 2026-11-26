BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $$ DECLARE check_result record; BEGIN
 IF current_database() !~ '^smartpos_phase53_phase54_phase55_[a-z0-9_]+$' THEN
  RAISE EXCEPTION 'Loyalty reconciliation requires explicit Phase55 scratch DB';
 END IF;
 FOR check_result IN
SELECT 'loyalty_reward_sale' AS name,count(*) AS violations FROM sales sale
WHERE sale.pricing_snapshot ? 'loyalty' AND NOT EXISTS (
 SELECT 1 FROM loyalty_ledger ledger WHERE ledger.organization_id=sale.organization_id AND ledger.sale_id=sale.id
 AND ledger.kind='REDEEM' AND ledger.account_id::text=sale.pricing_snapshot->'loyalty'->>'account_id'
 AND ledger.points=-(sale.pricing_snapshot->'loyalty'->>'points')::bigint
)
UNION ALL
SELECT 'loyalty_earning_snapshot',count(*) FROM loyalty_ledger
WHERE kind='EARN' AND points<>floor((snapshot->>'eligible_total')::numeric/(snapshot->>'spend')::numeric)*(snapshot->>'earn_points')::bigint
UNION ALL
SELECT 'loyalty_reversal_bounds',count(*) FROM loyalty_ledger original
WHERE kind IN ('EARN','REDEEM') AND abs(original.points)<(
 SELECT COALESCE(sum(abs(reversal.points)),0) FROM loyalty_ledger reversal
 WHERE reversal.organization_id=original.organization_id AND reversal.sale_id=original.sale_id
 AND reversal.kind=CASE original.kind WHEN 'EARN' THEN 'EARN_REVERSAL' ELSE 'REDEEM_REVERSAL' END
)
UNION ALL
SELECT 'loyalty_completed_return',count(*) FROM loyalty_ledger ledger
JOIN customer_returns document ON document.organization_id=ledger.organization_id AND document.id=ledger.return_id
WHERE document.status<>'COMPLETED' OR document.original_sale_id<>ledger.sale_id
UNION ALL
SELECT 'loyalty_full_return',count(*) FROM loyalty_ledger original
WHERE original.kind IN ('EARN','REDEEM') AND NOT EXISTS (
 SELECT 1 FROM sale_items line WHERE line.organization_id=original.organization_id AND line.sale_id=original.sale_id
 AND line.quantity>COALESCE((SELECT sum(item.quantity) FROM customer_return_items item
 JOIN customer_returns document ON document.organization_id=item.organization_id AND document.id=item.return_id
 WHERE item.organization_id=line.organization_id AND item.original_sale_item_id=line.id AND document.status='COMPLETED'),0)
) AND abs(original.points)<>(SELECT COALESCE(sum(abs(reversal.points)),0) FROM loyalty_ledger reversal
 WHERE reversal.organization_id=original.organization_id AND reversal.sale_id=original.sale_id
 AND reversal.kind=CASE original.kind WHEN 'EARN' THEN 'EARN_REVERSAL' ELSE 'REDEEM_REVERSAL' END)
UNION ALL
SELECT 'loyalty_duplicate_posting',count(*) FROM (
 SELECT organization_id,sale_id,return_id,operation_id,kind FROM loyalty_ledger
 GROUP BY organization_id,sale_id,return_id,operation_id,kind HAVING count(*)>1
) invalid
 LOOP
  IF check_result.violations<>0 THEN RAISE EXCEPTION '%: % violations',check_result.name,check_result.violations; END IF;
  RAISE NOTICE 'PASS: %; zero violations',check_result.name;
 END LOOP;
END $$;
COMMIT;
