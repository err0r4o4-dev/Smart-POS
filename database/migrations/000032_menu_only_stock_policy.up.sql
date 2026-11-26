BEGIN;

-- Existing records retain TRACKED; writers select MENU_ONLY explicitly.
ALTER TABLE online_orders ADD COLUMN stock_policy text NOT NULL DEFAULT 'TRACKED' CHECK (stock_policy IN ('TRACKED','MENU_ONLY'));
ALTER TABLE pos_carts ADD COLUMN stock_policy text NOT NULL DEFAULT 'TRACKED' CHECK (stock_policy IN ('TRACKED','MENU_ONLY'));
ALTER TABLE sales ADD COLUMN stock_policy text NOT NULL DEFAULT 'TRACKED' CHECK (stock_policy IN ('TRACKED','MENU_ONLY'));

CREATE FUNCTION stock_policy_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.stock_policy IS DISTINCT FROM OLD.stock_policy THEN
  RAISE EXCEPTION 'stock policy is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_order_stock_policy_immutable BEFORE UPDATE OF stock_policy ON online_orders FOR EACH ROW EXECUTE FUNCTION stock_policy_immutable();
CREATE TRIGGER pos_cart_stock_policy_immutable BEFORE UPDATE OF stock_policy ON pos_carts FOR EACH ROW EXECUTE FUNCTION stock_policy_immutable();
REVOKE ALL ON FUNCTION stock_policy_immutable() FROM PUBLIC;

-- Linking may occur after cart creation; enforce the order policy on any linked sale.
CREATE FUNCTION online_order_sale_stock_policy_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc online_orders;
BEGIN
 SELECT * INTO doc FROM online_orders WHERE organization_id=NEW.organization_id AND id=NEW.id;
 IF doc.cart_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM sales sale WHERE sale.organization_id=doc.organization_id AND sale.cart_id=doc.cart_id
  AND sale.stock_policy IS DISTINCT FROM doc.stock_policy
 ) THEN RAISE EXCEPTION 'linked order stock policy mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER online_order_sale_stock_policy AFTER INSERT OR UPDATE ON online_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION online_order_sale_stock_policy_consistency();
REVOKE ALL ON FUNCTION online_order_sale_stock_policy_consistency() FROM PUBLIC;

-- Return and adjustment evidence remains financial-only for menu-only sales.
CREATE FUNCTION menu_only_return_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.disposition<>'NO_STOCK_RETURN' AND EXISTS (
  SELECT 1 FROM sales sale WHERE sale.organization_id=NEW.organization_id
  AND sale.id=NEW.original_sale_id AND sale.stock_policy='MENU_ONLY'
 ) THEN RAISE EXCEPTION 'menu-only return cannot restock' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER menu_only_return_item BEFORE INSERT ON customer_return_items FOR EACH ROW EXECUTE FUNCTION menu_only_return_item_guard();
REVOKE ALL ON FUNCTION menu_only_return_item_guard() FROM PUBLIC;

CREATE FUNCTION menu_only_return_movement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM customer_return_items item JOIN sales sale
   ON sale.organization_id=item.organization_id AND sale.id=item.original_sale_id
  WHERE item.organization_id=NEW.organization_id AND item.id=NEW.customer_return_item_id
   AND sale.stock_policy='MENU_ONLY'
 ) THEN RAISE EXCEPTION 'menu-only return cannot post stock' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER menu_only_return_movement BEFORE INSERT ON stock_movements FOR EACH ROW
 WHEN (NEW.customer_return_item_id IS NOT NULL) EXECUTE FUNCTION menu_only_return_movement_guard();
REVOKE ALL ON FUNCTION menu_only_return_movement_guard() FROM PUBLIC;


CREATE OR REPLACE FUNCTION online_order_snapshot_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE doc public.online_orders; recipe public.restaurant_recipes;
BEGIN
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
  RAISE EXCEPTION 'ingredient snapshot context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 SELECT * INTO STRICT doc FROM public.online_orders WHERE organization_id=NEW.organization_id AND id=NEW.order_id;
 IF doc.stock_policy='MENU_ONLY' THEN RETURN NEW; END IF;
 SELECT * INTO recipe FROM public.restaurant_recipes WHERE organization_id=NEW.organization_id
  AND branch_id=doc.branch_id AND menu_variant_id=NEW.variant_id AND status='ACTIVE' FOR SHARE;
 IF FOUND THEN
  INSERT INTO public.online_order_stock_items(organization_id,order_id,menu_variant_id,stock_variant_id,quantity,unit_id,recipe_id,recipe_revision)
  SELECT NEW.organization_id,NEW.order_id,NEW.variant_id,item.ingredient_variant_id,item.quantity,item.unit_id,recipe.id,recipe.revision
  FROM public.restaurant_recipe_items item WHERE item.organization_id=NEW.organization_id AND item.recipe_id=recipe.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'active recipe has no ingredients' USING ERRCODE='23514'; END IF;
 ELSE
  INSERT INTO public.online_order_stock_items(organization_id,order_id,menu_variant_id,stock_variant_id,quantity,unit_id)
  SELECT NEW.organization_id,NEW.order_id,NEW.variant_id,NEW.variant_id,1.000,unit_id
  FROM public.product_variants WHERE organization_id=NEW.organization_id AND id=NEW.variant_id;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION storefront_order_stock_requirements(requested_org uuid,requested_order uuid)
RETURNS TABLE(variant_id uuid,quantity numeric) LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT requirement.variant_id,sum(requirement.quantity)::numeric(18,3)
 FROM (
  SELECT snapshot.stock_variant_id AS variant_id,round(snapshot.quantity*item.quantity,3) AS quantity
  FROM public.online_order_stock_items snapshot JOIN public.online_order_items item
   ON item.organization_id=snapshot.organization_id AND item.order_id=snapshot.order_id AND item.variant_id=snapshot.menu_variant_id
  WHERE snapshot.organization_id=requested_org AND snapshot.order_id=requested_order
  UNION ALL
  SELECT item.variant_id,item.quantity FROM public.online_order_items item
  WHERE item.organization_id=requested_org AND item.order_id=requested_order AND NOT EXISTS(
   SELECT 1 FROM public.online_order_stock_items snapshot WHERE snapshot.organization_id=item.organization_id
   AND snapshot.order_id=item.order_id AND snapshot.menu_variant_id=item.variant_id)
 ) requirement
 JOIN public.online_orders doc ON doc.organization_id=requested_org AND doc.id=requested_order
 WHERE doc.stock_policy='TRACKED' AND requested_org=nullif(current_setting('app.organization_id',true),'')::uuid
 GROUP BY requirement.variant_id;
$$;

CREATE OR REPLACE FUNCTION storefront_order_stock_quantity(requested_org uuid,requested_order uuid,requested_variant uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(sum(requirement.quantity),0)::numeric(18,3)
 FROM (
  SELECT round(snapshot.quantity*item.quantity,3) AS quantity
  FROM public.online_order_stock_items snapshot JOIN public.online_order_items item
   ON item.organization_id=snapshot.organization_id AND item.order_id=snapshot.order_id AND item.variant_id=snapshot.menu_variant_id
  WHERE snapshot.organization_id=requested_org AND snapshot.order_id=requested_order AND snapshot.stock_variant_id=requested_variant
  UNION ALL
  SELECT item.quantity FROM public.online_order_items item
  WHERE item.organization_id=requested_org AND item.order_id=requested_order AND item.variant_id=requested_variant AND NOT EXISTS(
   SELECT 1 FROM public.online_order_stock_items snapshot WHERE snapshot.organization_id=item.organization_id
   AND snapshot.order_id=item.order_id AND snapshot.menu_variant_id=item.variant_id)
 ) requirement
 JOIN public.online_orders doc ON doc.organization_id=requested_org AND doc.id=requested_order
 WHERE doc.stock_policy='TRACKED' AND requested_org=nullif(current_setting('app.organization_id',true),'')::uuid;
$$;

CREATE OR REPLACE FUNCTION storefront_reserved_stock_quantity(requested_org uuid,requested_location uuid,requested_variant uuid,excluded_cart uuid,excluded_order uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(sum(requirement.quantity),0)::numeric(18,3)
 FROM (
  SELECT snapshot.organization_id,snapshot.order_id,round(snapshot.quantity*item.quantity,3) AS quantity
  FROM public.online_order_stock_items snapshot JOIN public.online_order_items item
   ON item.organization_id=snapshot.organization_id AND item.order_id=snapshot.order_id AND item.variant_id=snapshot.menu_variant_id
  WHERE snapshot.organization_id=requested_org AND snapshot.stock_variant_id=requested_variant
  UNION ALL
  SELECT item.organization_id,item.order_id,item.quantity FROM public.online_order_items item
  WHERE item.organization_id=requested_org AND item.variant_id=requested_variant AND NOT EXISTS(
   SELECT 1 FROM public.online_order_stock_items snapshot WHERE snapshot.organization_id=item.organization_id
   AND snapshot.order_id=item.order_id AND snapshot.menu_variant_id=item.variant_id)
 ) requirement JOIN public.online_orders doc ON doc.organization_id=requirement.organization_id AND doc.id=requirement.order_id
 WHERE doc.stock_policy='TRACKED' AND doc.organization_id=requested_org AND doc.stock_location_id=requested_location
 AND requested_org=nullif(current_setting('app.organization_id',true),'')::uuid
 AND doc.stock_reserved AND public.storefront_order_live(doc.organization_id,doc.id)
 AND (excluded_cart IS NULL OR doc.cart_id IS DISTINCT FROM excluded_cart)
 AND (excluded_order IS NULL OR doc.id<>excluded_order);
$$;

CREATE OR REPLACE FUNCTION pos_sale_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.stock_policy IS DISTINCT FROM COALESCE((SELECT doc.stock_policy FROM online_orders doc WHERE doc.organization_id=NEW.organization_id AND doc.cart_id=NEW.cart_id), (SELECT cart.stock_policy FROM pos_carts cart WHERE cart.organization_id=NEW.organization_id AND cart.id=NEW.cart_id))
 OR NOT EXISTS(SELECT 1 FROM pos_checkouts WHERE organization_id=NEW.organization_id AND id=NEW.checkout_id AND status='COMPLETED' AND total=NEW.grand_total AND cashier_id=NEW.cashier_id AND cart_id=NEW.cart_id AND shift_id=NEW.shift_id)
 OR NOT EXISTS(SELECT 1 FROM pos_carts WHERE organization_id=NEW.organization_id AND id=NEW.cart_id AND status='COMPLETED' AND cashier_id=NEW.cashier_id)
 OR NOT EXISTS(SELECT 1 FROM register_shifts WHERE organization_id=NEW.organization_id AND id=NEW.shift_id AND cashier_id=NEW.cashier_id)
 OR NOT EXISTS(SELECT 1 FROM inventory_operations WHERE organization_id=NEW.organization_id AND id=NEW.inventory_operation_id AND result IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM sale_payments payment JOIN pos_checkouts checkout ON checkout.organization_id=payment.organization_id AND checkout.id=payment.checkout_id WHERE payment.organization_id=NEW.organization_id AND payment.sale_id=NEW.id AND payment.checkout_id=NEW.checkout_id AND payment.amount+payment.credit_amount=NEW.grand_total AND payment.credit_amount=checkout.credit_amount AND ROW(payment.method,payment.received,payment.change,payment.reference,payment.confirmed_by,payment.confirmed_at)=ROW(checkout.method,checkout.received,checkout.change,checkout.reference,checkout.confirmed_by,checkout.confirmed_at))
 OR EXISTS(SELECT 1 FROM pos_checkouts checkout WHERE checkout.organization_id=NEW.organization_id AND checkout.id=NEW.checkout_id AND checkout.adjustment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sale_adjustments WHERE organization_id=NEW.organization_id AND id=checkout.adjustment_id AND kind='EXCHANGE' AND status='COMPLETED' AND replacement_sale_id=NEW.id))
 OR NOT EXISTS(SELECT 1 FROM receipts WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)
 OR COALESCE((SELECT sum(line_total) FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id),0)<>NEW.grand_total
 OR NOT EXISTS(SELECT 1 FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)
 OR (NEW.stock_policy='MENU_ONLY' AND EXISTS(SELECT 1 FROM stock_movements movement WHERE movement.organization_id=NEW.organization_id AND movement.sale_id=NEW.id))
 OR EXISTS(SELECT 1 FROM stock_movements movement WHERE movement.organization_id=NEW.organization_id
  AND movement.sale_id=NEW.id AND movement.operation_id<>NEW.inventory_operation_id)
 THEN RAISE EXCEPTION 'sale settlement mismatch' USING ERRCODE='23514'; END IF;

 IF EXISTS (
  WITH expected_raw AS (
   SELECT requirement.variant_id,doc.stock_location_id,requirement.quantity
   FROM online_orders doc CROSS JOIN LATERAL storefront_order_stock_requirements(doc.organization_id,doc.id) requirement
   WHERE doc.organization_id=NEW.organization_id AND doc.cart_id=NEW.cart_id
   UNION ALL
   SELECT item.variant_id,item.stock_location_id,sum(item.quantity)
   FROM sale_items item
   WHERE item.organization_id=NEW.organization_id AND item.sale_id=NEW.id
   AND NOT EXISTS(SELECT 1 FROM online_orders doc WHERE doc.organization_id=NEW.organization_id AND doc.cart_id=NEW.cart_id)
   AND NOT EXISTS(SELECT 1 FROM restaurant_recipes recipe WHERE recipe.organization_id=item.organization_id AND recipe.branch_id=item.branch_id AND recipe.menu_variant_id=item.variant_id AND recipe.status='ACTIVE')
   GROUP BY item.variant_id,item.stock_location_id
   UNION ALL
   SELECT recipe_item.ingredient_variant_id,item.stock_location_id,round(sum(recipe_item.quantity*item.quantity),3)
   FROM sale_items item JOIN restaurant_recipes recipe ON recipe.organization_id=item.organization_id
    AND recipe.branch_id=item.branch_id AND recipe.menu_variant_id=item.variant_id AND recipe.status='ACTIVE'
   JOIN restaurant_recipe_items recipe_item ON recipe_item.organization_id=recipe.organization_id AND recipe_item.recipe_id=recipe.id
   WHERE item.organization_id=NEW.organization_id AND item.sale_id=NEW.id
   AND NOT EXISTS(SELECT 1 FROM online_orders doc WHERE doc.organization_id=NEW.organization_id AND doc.cart_id=NEW.cart_id)
   GROUP BY recipe_item.ingredient_variant_id,item.stock_location_id
  ), expected AS (
   SELECT variant_id,stock_location_id,sum(quantity) AS quantity FROM expected_raw WHERE NEW.stock_policy='TRACKED' GROUP BY variant_id,stock_location_id
  ), actual AS (
   SELECT movement.variant_id,movement.location_id AS stock_location_id,sum(-movement.quantity_delta) AS quantity
   FROM stock_movements movement WHERE movement.organization_id=NEW.organization_id AND movement.sale_id=NEW.id
   AND movement.movement_type='SALE'
   GROUP BY movement.variant_id,movement.location_id
  )
  SELECT 1 FROM expected FULL OUTER JOIN actual USING(variant_id,stock_location_id)
  WHERE expected.quantity IS DISTINCT FROM actual.quantity
 ) THEN RAISE EXCEPTION 'sale inventory settlement mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

COMMIT;

