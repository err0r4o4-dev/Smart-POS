BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

DO $$
DECLARE check_result record;
BEGIN
 IF current_database() !~ '^smartpos_phase53_[a-z0-9_]+$' THEN
  RAISE EXCEPTION 'Pricing reconciliation requires an isolated Phase53 database';
 END IF;
 FOR check_result IN
  WITH ledger AS (
   SELECT organization_id,location_id,variant_id,sum(quantity_delta) AS quantity
   FROM stock_movements GROUP BY organization_id,location_id,variant_id
  ), checks AS (
   SELECT 'stock balance versus ledger' AS name,count(*) AS violations
   FROM stock_balances balance FULL JOIN ledger USING(organization_id,location_id,variant_id)
   WHERE COALESCE(balance.quantity,0)<>COALESCE(ledger.quantity,0)
   UNION ALL
   SELECT 'Sale gross discount net allocations',count(*) FROM sales sale
   WHERE sale.subtotal<>COALESCE((SELECT sum(gross_total) FROM sale_items WHERE organization_id=sale.organization_id AND sale_id=sale.id),0)
    OR sale.discount_total<>COALESCE((SELECT sum(discount_total) FROM sale_items WHERE organization_id=sale.organization_id AND sale_id=sale.id),0)
    OR sale.grand_total<>COALESCE((SELECT sum(line_total) FROM sale_items WHERE organization_id=sale.organization_id AND sale_id=sale.id),0)
   UNION ALL
   SELECT 'one settlement and exact consideration',count(*) FROM sales sale
   WHERE (SELECT count(*) FROM sale_payments WHERE organization_id=sale.organization_id AND sale_id=sale.id)<>1
    OR sale.grand_total<>COALESCE((SELECT sum(amount+credit_amount) FROM sale_payments WHERE organization_id=sale.organization_id AND sale_id=sale.id),0)
   UNION ALL
   SELECT 'promotion committed usage and limits',count(*) FROM promotions promotion
   WHERE promotion.used<>(SELECT count(*) FROM promotion_redemptions WHERE organization_id=promotion.organization_id AND promotion_id=promotion.id)
    OR (promotion.usage_limit>0 AND promotion.used>promotion.usage_limit)
   UNION ALL
   SELECT 'discount redemption and approval allocation',count(*) FROM sales sale
   WHERE sale.discount_total<>COALESCE((SELECT sum(discount) FROM promotion_redemptions WHERE organization_id=sale.organization_id AND sale_id=sale.id),0)
    +COALESCE((SELECT amount FROM discount_approvals WHERE organization_id=sale.organization_id AND id::text=sale.pricing_snapshot->>'approval_id' AND status='CONSUMED'),0)
   UNION ALL
   SELECT 'zero payable NONE no financial money',count(*) FROM sales sale
   JOIN sale_payments payment ON payment.organization_id=sale.organization_id AND payment.sale_id=sale.id
   WHERE (sale.grand_total=0)<>(payment.method='NONE')
    OR (payment.method='NONE' AND (payment.amount<>0 OR payment.received<>0 OR payment.change<>0 OR payment.credit_amount<>0))
   UNION ALL
   SELECT 'Sale checkout pricing snapshot equality',count(*) FROM sales sale
   JOIN pos_checkouts checkout ON checkout.organization_id=sale.organization_id AND checkout.id=sale.checkout_id
   WHERE sale.pricing_snapshot<>checkout.pricing_snapshot
   UNION ALL
   SELECT 'every physical Sale item deducted',count(*) FROM sale_items item
   WHERE -item.quantity<>COALESCE((SELECT sum(quantity_delta) FROM stock_movements WHERE organization_id=item.organization_id AND sale_id=item.sale_id AND variant_id=item.variant_id AND location_id=item.stock_location_id AND movement_type='SALE'),0)
  ) SELECT * FROM checks
 LOOP
  IF check_result.violations<>0 THEN
   RAISE EXCEPTION '%: % violations',check_result.name,check_result.violations;
  END IF;
  RAISE NOTICE 'PASS: %; zero violations',check_result.name;
 END LOOP;
END $$;

SELECT (SELECT count(*) FROM sales) AS sales,
 (SELECT count(*) FROM sale_items) AS sale_lines,
 (SELECT count(*) FROM stock_movements) AS stock_movements,
 (SELECT count(*) FROM promotion_redemptions) AS redemptions;
COMMIT;
