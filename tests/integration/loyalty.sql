BEGIN;
DO $$ DECLARE table_name text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version=12 AND NOT dirty) THEN RAISE EXCEPTION 'schema 12 required'; END IF;
 FOREACH table_name IN ARRAY ARRAY['loyalty_programs','loyalty_accounts','loyalty_ledger'] LOOP
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=table_name::regclass) THEN RAISE EXCEPTION 'loyalty RLS missing'; END IF;
  IF has_table_privilege('smartpos_runtime',table_name,'DELETE') THEN RAISE EXCEPTION 'excess loyalty grant'; END IF;
 END LOOP;
 IF has_table_privilege('smartpos_runtime','loyalty_ledger','UPDATE') OR has_table_privilege('smartpos_runtime','loyalty_ledger','TRUNCATE') THEN RAISE EXCEPTION 'mutable ledger grant'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='loyalty_ledger_immutable' AND tgrelid='loyalty_ledger'::regclass) THEN RAISE EXCEPTION 'ledger immutable guard missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='loyalty_sale_consistency' AND tgdeferrable AND tginitdeferred) THEN RAISE EXCEPTION 'sale loyalty consistency missing'; END IF;
END $$;
SET LOCAL ROLE smartpos_runtime;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM loyalty_programs) OR EXISTS(SELECT 1 FROM loyalty_accounts) OR EXISTS(SELECT 1 FROM loyalty_ledger) THEN RAISE EXCEPTION 'unscoped loyalty leak'; END IF;
END $$;
ROLLBACK;
