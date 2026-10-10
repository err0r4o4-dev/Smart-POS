BEGIN;
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['customers','customer_groups','customer_group_memberships'] LOOP
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=table_name::regclass) THEN RAISE EXCEPTION 'customer RLS missing'; END IF;
 END LOOP;
 IF has_table_privilege('smartpos_runtime','customers','DELETE') OR has_table_privilege('smartpos_runtime','customer_groups','DELETE') OR has_table_privilege('smartpos_runtime','customer_group_memberships','UPDATE') THEN RAISE EXCEPTION 'excess customer grants'; END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conname IN ('cart_customer_fk','checkout_customer_fk','sale_customer_fk'))<>3 THEN RAISE EXCEPTION 'customer tenant references missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='sales'::regclass AND tgname='sale_immutable') THEN RAISE EXCEPTION 'immutable sale guard missing'; END IF;
END $$;
SET LOCAL ROLE smartpos_runtime;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM customers) OR EXISTS(SELECT 1 FROM customer_groups) OR EXISTS(SELECT 1 FROM customer_group_memberships) THEN RAISE EXCEPTION 'customer no-context leak'; END IF;
END $$;
ROLLBACK;
