BEGIN;
DO $verify$
DECLARE table_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version=12 AND NOT dirty) THEN RAISE EXCEPTION 'business schema not ready'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='smartpos_runtime' AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'runtime bypasses RLS'; END IF;
  FOREACH table_name IN ARRAY ARRAY['customer_returns','customer_return_items','customer_refunds','refund_settlement_events','register_cash_disbursements'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=table_name::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'missing FORCE RLS on %',table_name; END IF;
    IF NOT has_table_privilege('smartpos_runtime',table_name,'SELECT') OR NOT has_table_privilege('smartpos_runtime',table_name,'INSERT') OR has_table_privilege('smartpos_runtime',table_name,'DELETE') OR has_table_privilege('smartpos_runtime',table_name,'TRUNCATE') THEN RAISE EXCEPTION 'unexpected runtime grants on %',table_name; END IF;
  END LOOP;
  IF has_table_privilege('smartpos_runtime','customer_return_items','UPDATE') OR has_table_privilege('smartpos_runtime','refund_settlement_events','UPDATE') OR has_table_privilege('smartpos_runtime','register_cash_disbursements','UPDATE') OR has_table_privilege('smartpos_runtime','stock_balances','UPDATE') THEN RAISE EXCEPTION 'mutable accounting projections'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='stock_movements'::regclass AND conname='stock_movements_customer_return_item_id_fkey') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='stock_movements'::regclass AND contype='f' AND pg_get_constraintdef(oid) LIKE '%customer_return_items%') THEN RAISE EXCEPTION 'missing return inventory reference'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname IN ('customer_return_consistency','business_return_movement','business_cash_disbursement','business_refund_insert','business_shift_accounting','refund_consistency') AND tgdeferrable AND tginitdeferred)<>6 THEN RAISE EXCEPTION 'missing deferred accounting checks'; END IF;
END $verify$;
SET LOCAL ROLE smartpos_runtime;
DO $verify$ BEGIN
  IF (SELECT count(*) FROM customer_returns)+(SELECT count(*) FROM customer_return_items)+(SELECT count(*) FROM customer_refunds)+(SELECT count(*) FROM refund_settlement_events)+(SELECT count(*) FROM register_cash_disbursements)<>0 THEN RAISE EXCEPTION 'missing-context RLS leaked'; END IF;
END $verify$;
SELECT set_config('app.organization_id','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
DO $verify$ BEGIN
  IF (SELECT count(*) FROM customer_returns)+(SELECT count(*) FROM customer_return_items)+(SELECT count(*) FROM customer_refunds)+(SELECT count(*) FROM refund_settlement_events)+(SELECT count(*) FROM register_cash_disbursements)<>0 THEN RAISE EXCEPTION 'mismatched tenant RLS leaked'; END IF;
END $verify$;
ROLLBACK;
