BEGIN;

SET LOCAL row_security=off;
LOCK TABLE online_orders,online_order_items,online_payment_attempts IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(
  SELECT 1 FROM online_orders doc WHERE doc.status IN ('PENDING','PREPARING','READY')
  AND (doc.expires_at>statement_timestamp() OR doc.cart_id IS NOT NULL OR EXISTS(
   SELECT 1 FROM online_payment_attempts attempt WHERE attempt.organization_id=doc.organization_id
   AND attempt.order_id=doc.id AND NOT attempt.stock_hold_released))
 ) THEN
  RAISE EXCEPTION 'drain or reconcile live online orders before ingredient reservation migration' USING ERRCODE='23514';
 END IF;
END $$;

CREATE TABLE online_order_stock_items (
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL,
 menu_variant_id uuid NOT NULL,
 stock_variant_id uuid NOT NULL,
 quantity numeric(18,3) NOT NULL CHECK(quantity>0),
 unit_id uuid NOT NULL,
 recipe_id uuid,
 recipe_revision bigint,
 PRIMARY KEY(organization_id,order_id,menu_variant_id,stock_variant_id),
 FOREIGN KEY(organization_id,order_id,menu_variant_id) REFERENCES online_order_items(organization_id,order_id,variant_id),
 FOREIGN KEY(organization_id,stock_variant_id) REFERENCES product_variants(organization_id,id),
 FOREIGN KEY(organization_id,unit_id) REFERENCES units(organization_id,id),
 FOREIGN KEY(organization_id,recipe_id) REFERENCES restaurant_recipes(organization_id,id),
 CHECK((recipe_id IS NULL)=(recipe_revision IS NULL)),
 CHECK(recipe_revision>0),
 CHECK(recipe_id IS NOT NULL OR (stock_variant_id=menu_variant_id AND quantity=1.000))
);
CREATE INDEX online_order_stock_variant ON online_order_stock_items(organization_id,stock_variant_id,order_id);
ALTER TABLE online_order_stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_order_stock_items FORCE ROW LEVEL SECURITY;
CREATE POLICY online_stock_scope ON online_order_stock_items
 USING(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid)
 WITH CHECK(organization_id=nullif(current_setting('app.organization_id',true),'')::uuid);
GRANT SELECT ON online_order_stock_items TO smartpos_runtime;

CREATE FUNCTION online_order_snapshot_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE doc public.online_orders; recipe public.restaurant_recipes;
BEGIN
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
  RAISE EXCEPTION 'ingredient snapshot context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 SELECT * INTO STRICT doc FROM public.online_orders WHERE organization_id=NEW.organization_id AND id=NEW.order_id;
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
CREATE TRIGGER online_order_stock_snapshot AFTER INSERT ON online_order_items
 FOR EACH ROW EXECUTE FUNCTION online_order_snapshot_stock();
REVOKE ALL ON FUNCTION online_order_snapshot_stock() FROM PUBLIC;

CREATE FUNCTION online_stock_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'online ingredient snapshots are immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER online_stock_snapshot_frozen BEFORE UPDATE OR DELETE ON online_order_stock_items
 FOR EACH ROW EXECUTE FUNCTION online_stock_snapshot_immutable();
REVOKE ALL ON FUNCTION online_stock_snapshot_immutable() FROM PUBLIC;

CREATE FUNCTION online_stock_variant_unit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.unit_id IS DISTINCT FROM OLD.unit_id AND EXISTS(
  SELECT 1 FROM online_order_stock_items WHERE organization_id=OLD.organization_id AND stock_variant_id=OLD.id
 ) THEN RAISE EXCEPTION 'variant unit is frozen by an online ingredient snapshot' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_stock_variant_unit BEFORE UPDATE OF unit_id ON product_variants
 FOR EACH ROW EXECUTE FUNCTION online_stock_variant_unit_guard();
REVOKE ALL ON FUNCTION online_stock_variant_unit_guard() FROM PUBLIC;

CREATE FUNCTION storefront_order_stock_requirements(requested_org uuid,requested_order uuid)
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
 WHERE requested_org=nullif(current_setting('app.organization_id',true),'')::uuid
 GROUP BY requirement.variant_id;
$$;
REVOKE ALL ON FUNCTION storefront_order_stock_requirements(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storefront_order_stock_requirements(uuid,uuid) TO smartpos_runtime;

CREATE FUNCTION storefront_order_stock_quantity(requested_org uuid,requested_order uuid,requested_variant uuid)
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
 WHERE requested_org=nullif(current_setting('app.organization_id',true),'')::uuid;
$$;
REVOKE ALL ON FUNCTION storefront_order_stock_quantity(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storefront_order_stock_quantity(uuid,uuid,uuid) TO smartpos_runtime;

CREATE FUNCTION storefront_reserved_stock_quantity(requested_org uuid,requested_location uuid,requested_variant uuid,excluded_cart uuid,excluded_order uuid)
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
 WHERE doc.organization_id=requested_org AND doc.stock_location_id=requested_location
 AND requested_org=nullif(current_setting('app.organization_id',true),'')::uuid
 AND doc.stock_reserved AND public.storefront_order_live(doc.organization_id,doc.id)
 AND (excluded_cart IS NULL OR doc.cart_id IS DISTINCT FROM excluded_cart)
 AND (excluded_order IS NULL OR doc.id<>excluded_order);
$$;
REVOKE ALL ON FUNCTION storefront_reserved_stock_quantity(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storefront_reserved_stock_quantity(uuid,uuid,uuid,uuid,uuid) TO smartpos_runtime;

CREATE OR REPLACE FUNCTION storefront_reserved_quantity(requested_org uuid,requested_location uuid,requested_variant uuid,excluded_cart uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT public.storefront_reserved_stock_quantity(requested_org,requested_location,requested_variant,excluded_cart,NULL);
$$;

CREATE FUNCTION storefront_reserved_quantity_for_order(requested_org uuid,requested_location uuid,requested_variant uuid,excluded_order uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT public.storefront_reserved_stock_quantity(requested_org,requested_location,requested_variant,NULL,excluded_order);
$$;
REVOKE ALL ON FUNCTION storefront_reserved_quantity_for_order(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storefront_reserved_quantity_for_order(uuid,uuid,uuid,uuid) TO smartpos_runtime;

CREATE OR REPLACE FUNCTION online_reservation_consistency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE doc public.online_orders; item record;
BEGIN
 SELECT * INTO doc FROM public.online_orders WHERE organization_id=NEW.organization_id AND id=NEW.id;
 IF doc.stock_reserved AND public.storefront_order_live(doc.organization_id,doc.id) THEN
  FOR item IN SELECT variant_id FROM public.storefront_order_stock_requirements(doc.organization_id,doc.id) ORDER BY variant_id LOOP
   IF public.storefront_reserved_quantity(doc.organization_id,doc.stock_location_id,item.variant_id)>public.storefront_sellable_quantity(doc.organization_id,doc.stock_location_id,item.variant_id) THEN
    RAISE EXCEPTION 'insufficient stock for reservation' USING ERRCODE='23514';
   END IF;
  END LOOP;
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION inventory_reservation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE consumed_cart uuid; reserved numeric; safe_after numeric;
BEGIN
 IF NEW.quantity_delta>=0 THEN RETURN NEW; END IF;
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
  RAISE EXCEPTION 'reservation movement context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF NEW.movement_type='SALE' AND EXISTS(
  SELECT 1 FROM public.sales sale WHERE sale.organization_id=NEW.organization_id AND sale.id=NEW.sale_id
  AND NEW.operation_id IS DISTINCT FROM sale.inventory_operation_id
 ) THEN RAISE EXCEPTION 'sale inventory operation mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.quality_recalls WHERE organization_id=NEW.organization_id AND variant_id=NEW.variant_id AND (batch_id IS NULL OR batch_id=NEW.batch_id))
 OR (NEW.batch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.product_batches WHERE organization_id=NEW.organization_id AND id=NEW.batch_id AND status='ACTIVE' AND (expires_on IS NULL OR expires_on>(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date))) THEN
  RETURN NEW;
 END IF;
 IF NEW.movement_type='SALE' THEN
  SELECT sale.cart_id INTO consumed_cart FROM public.sales sale
  JOIN public.online_orders doc ON doc.organization_id=sale.organization_id AND doc.cart_id=sale.cart_id
  WHERE sale.organization_id=NEW.organization_id AND sale.id=NEW.sale_id AND doc.status='READY'
  AND doc.stock_location_id=NEW.location_id
  AND public.storefront_order_stock_quantity(doc.organization_id,doc.id,NEW.variant_id)=-NEW.quantity_delta;
 END IF;
 reserved:=public.storefront_reserved_quantity(NEW.organization_id,NEW.location_id,NEW.variant_id,consumed_cart);
 safe_after:=public.storefront_sellable_quantity(NEW.organization_id,NEW.location_id,NEW.variant_id);
 IF safe_after<reserved THEN RAISE EXCEPTION 'stock is reserved for online orders' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION pos_sale_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pos_checkouts WHERE organization_id=NEW.organization_id AND id=NEW.checkout_id AND status='COMPLETED' AND total=NEW.grand_total AND cashier_id=NEW.cashier_id AND cart_id=NEW.cart_id AND shift_id=NEW.shift_id)
 OR NOT EXISTS(SELECT 1 FROM pos_carts WHERE organization_id=NEW.organization_id AND id=NEW.cart_id AND status='COMPLETED' AND cashier_id=NEW.cashier_id)
 OR NOT EXISTS(SELECT 1 FROM register_shifts WHERE organization_id=NEW.organization_id AND id=NEW.shift_id AND cashier_id=NEW.cashier_id)
 OR NOT EXISTS(SELECT 1 FROM inventory_operations WHERE organization_id=NEW.organization_id AND id=NEW.inventory_operation_id AND result IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM sale_payments payment JOIN pos_checkouts checkout ON checkout.organization_id=payment.organization_id AND checkout.id=payment.checkout_id WHERE payment.organization_id=NEW.organization_id AND payment.sale_id=NEW.id AND payment.checkout_id=NEW.checkout_id AND payment.amount=NEW.grand_total AND ROW(payment.method,payment.received,payment.change,payment.reference,payment.confirmed_by,payment.confirmed_at)=ROW(checkout.method,checkout.received,checkout.change,checkout.reference,checkout.confirmed_by,checkout.confirmed_at))
 OR NOT EXISTS(SELECT 1 FROM receipts WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)
 OR COALESCE((SELECT sum(line_total) FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id),0)<>NEW.grand_total
 OR NOT EXISTS(SELECT 1 FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)
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
   SELECT variant_id,stock_location_id,sum(quantity) AS quantity FROM expected_raw GROUP BY variant_id,stock_location_id
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
