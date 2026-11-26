BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $$ DECLARE result record; BEGIN
 IF current_database() !~ '^smartpos_phase53_phase54_phase55_phase56_[a-z0-9_]+$' THEN RAISE EXCEPTION 'Final reconciliation requires isolated schema13 DB'; END IF;
 FOR result IN
  WITH checks AS (
   SELECT 'register cash sales equal immutable sale payments' name,count(*) violations FROM register_shifts shift WHERE shift.cash_sales<>COALESCE((SELECT sum(payment.amount) FROM sales sale JOIN sale_payments payment ON payment.organization_id=sale.organization_id AND payment.sale_id=sale.id WHERE sale.organization_id=shift.organization_id AND sale.shift_id=shift.id AND payment.method='CASH'),0)
   UNION ALL SELECT 'register refunds equal immutable disbursements',count(*) FROM register_shifts shift WHERE shift.cash_refunds<>COALESCE((SELECT sum(amount) FROM register_cash_disbursements WHERE organization_id=shift.organization_id AND shift_id=shift.id),0)
   UNION ALL SELECT 'register exact expected cash and closed variance',count(*) FROM register_shifts shift WHERE expected_cash<>opening_cash+cash_sales-cash_refunds OR (status='CLOSED' AND (difference IS DISTINCT FROM counted_cash-expected_cash OR EXISTS(SELECT 1 FROM customer_refunds WHERE organization_id=shift.organization_id AND shift_id=shift.id AND status IN ('SETTLEMENT_REPORTED','RECONCILIATION_REQUIRED'))))
   UNION ALL SELECT 'confirmed cash refunds paid exactly once',count(*) FROM customer_refunds refund WHERE status='CONFIRMED' AND method='CASH_REFUND' AND (SELECT count(*) FROM register_cash_disbursements WHERE organization_id=refund.organization_id AND refund_id=refund.id AND shift_id=refund.shift_id AND amount=refund.amount)<>1
   UNION ALL SELECT 'no disbursement without confirmed cash refund',count(*) FROM register_cash_disbursements payment JOIN customer_refunds refund ON refund.organization_id=payment.organization_id AND refund.id=payment.refund_id WHERE refund.status<>'CONFIRMED' OR refund.method<>'CASH_REFUND' OR payment.amount<>refund.amount OR payment.shift_id<>refund.shift_id
   UNION ALL SELECT 'cumulative returned quantities and paid allocation bounded',count(*) FROM sale_items sale WHERE EXISTS(SELECT 1 FROM customer_return_items item JOIN customer_returns doc ON doc.organization_id=item.organization_id AND doc.id=item.return_id WHERE item.organization_id=sale.organization_id AND item.original_sale_item_id=sale.id AND doc.status='COMPLETED' GROUP BY item.original_sale_item_id HAVING sum(item.quantity)>sale.quantity OR sum(item.refund_amount)>sale.line_total)
   UNION ALL SELECT 'completed exchange has one exact replacement consideration',count(*) FROM sale_adjustments adjustment WHERE adjustment.kind='EXCHANGE' AND adjustment.status='COMPLETED' AND (SELECT count(*) FROM sales sale JOIN sale_payments payment ON payment.organization_id=sale.organization_id AND payment.sale_id=sale.id WHERE sale.organization_id=adjustment.organization_id AND sale.id=adjustment.replacement_sale_id AND sale.grand_total=adjustment.replacement_total AND payment.amount=greatest(adjustment.net_difference,0) AND payment.credit_amount=least(adjustment.return_credit,adjustment.replacement_total))<>1
   UNION ALL SELECT 'negative adjustments refund net only and nonnegative no payout',count(*) FROM sale_adjustments adjustment WHERE status='COMPLETED' AND ((net_difference<0 AND NOT EXISTS(SELECT 1 FROM customer_refunds WHERE organization_id=adjustment.organization_id AND return_id=adjustment.linked_return_id AND amount=-adjustment.net_difference AND status='CONFIRMED')) OR (net_difference>=0 AND EXISTS(SELECT 1 FROM customer_refunds WHERE organization_id=adjustment.organization_id AND return_id=adjustment.linked_return_id)))
  ) SELECT * FROM checks
 LOOP
  IF result.violations<>0 THEN RAISE EXCEPTION '%: % violations',result.name,result.violations; END IF;
  RAISE NOTICE 'PASS final reconciliation: %',result.name;
 END LOOP;
END $$;
ROLLBACK;
