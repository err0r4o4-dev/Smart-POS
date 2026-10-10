SELECT 'loyalty_reward_sale',count(*) FROM sales sale
WHERE sale.pricing_snapshot ? 'loyalty' AND NOT EXISTS (
 SELECT 1 FROM loyalty_ledger ledger WHERE ledger.organization_id=sale.organization_id AND ledger.sale_id=sale.id
 AND ledger.kind='REDEEM' AND ledger.account_id::text=sale.pricing_snapshot->'loyalty'->>'account_id'
 AND ledger.points=-(sale.pricing_snapshot->'loyalty'->>'points')::bigint
);
SELECT 'loyalty_earning_snapshot',count(*) FROM loyalty_ledger
WHERE kind='EARN' AND points<>floor((snapshot->>'eligible_total')::numeric/(snapshot->>'spend')::numeric)*(snapshot->>'earn_points')::bigint;
SELECT 'loyalty_reversal_bounds',count(*) FROM loyalty_ledger original
WHERE kind IN ('EARN','REDEEM') AND abs(original.points)<(
 SELECT COALESCE(sum(abs(reversal.points)),0) FROM loyalty_ledger reversal
 WHERE reversal.organization_id=original.organization_id AND reversal.sale_id=original.sale_id
 AND reversal.kind=CASE original.kind WHEN 'EARN' THEN 'EARN_REVERSAL' ELSE 'REDEEM_REVERSAL' END
);
SELECT 'loyalty_completed_return',count(*) FROM loyalty_ledger ledger
JOIN customer_returns document ON document.organization_id=ledger.organization_id AND document.id=ledger.return_id
WHERE document.status<>'COMPLETED' OR document.original_sale_id<>ledger.sale_id;
SELECT 'loyalty_balance_limit',count(*) FROM (
 SELECT organization_id,account_id FROM loyalty_ledger GROUP BY organization_id,account_id HAVING abs(sum(points))>1000000000000
) invalid;
SELECT 'loyalty_duplicate_posting',count(*) FROM (
 SELECT organization_id,sale_id,return_id,operation_id,kind FROM loyalty_ledger
 GROUP BY organization_id,sale_id,return_id,operation_id,kind HAVING count(*)>1
) invalid;
