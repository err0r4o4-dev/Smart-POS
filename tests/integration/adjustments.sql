BEGIN;
DO $$ DECLARE table_name text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version=9 AND NOT dirty) THEN RAISE EXCEPTION 'schema 9 required'; END IF;
 FOREACH table_name IN ARRAY ARRAY['sale_adjustments','adjustment_settlement_events'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=table_name::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'missing FORCE RLS'; END IF;
  IF NOT has_table_privilege('smartpos_runtime',table_name,'INSERT') OR has_table_privilege('smartpos_runtime',table_name,'DELETE') OR has_table_privilege('smartpos_runtime',table_name,'TRUNCATE') THEN RAISE EXCEPTION 'unsafe grants'; END IF;
 END LOOP;
 IF has_table_privilege('smartpos_runtime','adjustment_settlement_events','UPDATE') OR has_table_privilege('smartpos_runtime','stock_balances','UPDATE') THEN RAISE EXCEPTION 'mutable accounting'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgname IN ('adjustment_consistency','adjustment_shift_guard') AND tgdeferrable AND tginitdeferred)<>2 THEN RAISE EXCEPTION 'missing consistency guards'; END IF;
END $$;
SET LOCAL ROLE smartpos_runtime;
DO $$ BEGIN
 IF (SELECT count(*) FROM sale_adjustments)+(SELECT count(*) FROM adjustment_settlement_events)<>0 THEN RAISE EXCEPTION 'missing-context tenant leak'; END IF;
END $$;
SELECT set_config('app.organization_id','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM sale_adjustments)+(SELECT count(*) FROM adjustment_settlement_events)<>0 THEN RAISE EXCEPTION 'foreign-context tenant leak'; END IF;
END $$;
ROLLBACK;
