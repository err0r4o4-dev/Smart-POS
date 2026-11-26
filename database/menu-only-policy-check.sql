-- Run only against a confirmed task-owned disposable schema 32 database.
-- This checks metadata and isolated trigger behavior; it is not full settlement acceptance.
BEGIN;
DO $$
DECLARE table_name text; column_default text; definition text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['online_orders','pos_carts','sales'] LOOP
  SELECT pg_get_expr(d.adbin,d.adrelid) INTO column_default
  FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid=to_regclass('public.'||table_name) AND a.attname='stock_policy' AND a.attnotnull;
  IF column_default IS DISTINCT FROM '''TRACKED''::text' THEN
   RAISE EXCEPTION 'invalid stock policy default on %',table_name;
  END IF;
 END LOOP;
 SELECT pg_get_functiondef('public.storefront_order_stock_requirements(uuid,uuid)'::regprocedure) INTO definition;
 IF position('doc.stock_policy=''TRACKED''' IN definition)=0 OR position('NOT EXISTS' IN definition)=0 THEN
  RAISE EXCEPTION 'tracked fallback or policy guard missing';
 END IF;
END $$;

CREATE TEMP TABLE stock_policy_guard_probe (stock_policy text NOT NULL);
CREATE TRIGGER stock_policy_guard BEFORE UPDATE ON stock_policy_guard_probe FOR EACH ROW EXECUTE FUNCTION public.stock_policy_immutable();
INSERT INTO stock_policy_guard_probe VALUES ('TRACKED');
DO $$
BEGIN
 BEGIN
  UPDATE stock_policy_guard_probe SET stock_policy='MENU_ONLY';
  RAISE EXCEPTION 'policy mutation unexpectedly succeeded';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 IF (SELECT stock_policy FROM stock_policy_guard_probe) IS DISTINCT FROM 'TRACKED' THEN
  RAISE EXCEPTION 'policy changed';
 END IF;
END $$;

-- Temporary fixtures exercise the return guards without touching stored history.
SET LOCAL search_path=pg_temp,public;
CREATE TEMP TABLE sales (organization_id uuid, id uuid, stock_policy text);
CREATE TEMP TABLE customer_return_items (organization_id uuid, id uuid, original_sale_id uuid, disposition text);
CREATE TEMP TABLE stock_movements (organization_id uuid, customer_return_item_id uuid);
CREATE TRIGGER policy_return_item BEFORE INSERT ON customer_return_items FOR EACH ROW EXECUTE FUNCTION public.menu_only_return_item_guard();
CREATE TRIGGER policy_return_movement BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION public.menu_only_return_movement_guard();
INSERT INTO sales VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','MENU_ONLY'),
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','TRACKED');
INSERT INTO customer_return_items VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','NO_STOCK_RETURN'),
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000003','RESTOCK_SELLABLE');
INSERT INTO stock_movements VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005');
DO $$
BEGIN
 BEGIN
  INSERT INTO customer_return_items VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002','RESTOCK_SELLABLE');
  RAISE EXCEPTION 'menu-only restock disposition unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO stock_movements VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004');
  RAISE EXCEPTION 'menu-only return movement unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
ROLLBACK;
