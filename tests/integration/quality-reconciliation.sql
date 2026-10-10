BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $$ DECLARE result record; BEGIN
 IF current_database() !~ '^smartpos_phase53_phase54_phase55_phase56_[a-z0-9_]+$' THEN RAISE EXCEPTION 'Quality reconciliation requires isolated Phase56 database'; END IF;
 FOR result IN
  WITH split AS (SELECT organization_id,location_id,variant_id,sum(quantity) quantity FROM quality_stock_balances GROUP BY organization_id,location_id,variant_id),
  tracked_ledger AS (SELECT organization_id,location_id,variant_id,batch_id,sum(quantity_delta) quantity FROM stock_movements WHERE batch_id IS NOT NULL GROUP BY organization_id,location_id,variant_id,batch_id),
  checks AS (
   SELECT 'aggregate equals tracked plus untracked' name,count(*) violations FROM stock_balances balance FULL JOIN split USING(organization_id,location_id,variant_id) WHERE COALESCE(balance.quantity,0)<>COALESCE(split.quantity,0)
   UNION ALL SELECT 'tracked batch equals immutable movements',count(*) FROM quality_stock_balances balance FULL JOIN tracked_ledger ledger USING(organization_id,location_id,variant_id,batch_id) WHERE (balance.batch_id IS NOT NULL OR ledger.batch_id IS NOT NULL) AND COALESCE(balance.quantity,0)<>COALESCE(ledger.quantity,0)
   UNION ALL SELECT 'posted write off exactly once',count(*) FROM quality_write_offs doc WHERE doc.status='POSTED' AND (SELECT count(*) FROM stock_movements movement WHERE movement.organization_id=doc.organization_id AND movement.quality_write_off_id=doc.id AND movement.operation_id=doc.operation_id AND movement.batch_id IS NOT DISTINCT FROM doc.batch_id AND movement.location_id=doc.location_id AND movement.variant_id=doc.variant_id AND movement.quantity_delta=-doc.quantity AND movement.movement_type='ADJUSTMENT_OUT')<>1
   UNION ALL SELECT 'no unposted write off movement',count(*) FROM stock_movements movement JOIN quality_write_offs doc ON doc.organization_id=movement.organization_id AND doc.id=movement.quality_write_off_id WHERE doc.status<>'POSTED'
   UNION ALL SELECT 'sale lot equals inventory deduction',count(*) FROM sale_items item WHERE NOT EXISTS(SELECT 1 FROM stock_movements movement WHERE movement.organization_id=item.organization_id AND movement.sale_id=item.sale_id AND movement.variant_id=item.variant_id AND movement.location_id=item.stock_location_id AND movement.batch_id IS NOT DISTINCT FROM item.batch_id AND movement.quantity_delta=-item.quantity AND movement.movement_type='SALE')
   UNION ALL SELECT 'returned known lot matches original sale',count(*) FROM customer_return_items item JOIN sale_items sale ON sale.organization_id=item.organization_id AND sale.id=item.original_sale_item_id WHERE item.batch_id IS NOT NULL AND item.batch_id IS DISTINCT FROM sale.batch_id
   UNION ALL SELECT 'supplier return lot matches receipt',count(*) FROM purchasing_items line JOIN purchasing_documents doc ON doc.organization_id=line.organization_id AND doc.id=line.document_id JOIN purchasing_items receipt ON receipt.organization_id=line.organization_id AND receipt.id=line.parent_item_id WHERE doc.kind='RETURN' AND line.batch_id IS DISTINCT FROM receipt.batch_id
  ) SELECT * FROM checks
 LOOP
  IF result.violations<>0 THEN RAISE EXCEPTION '%: % violations',result.name,result.violations; END IF;
  RAISE NOTICE 'PASS quality reconciliation: %',result.name;
 END LOOP;
END $$;
ROLLBACK;
