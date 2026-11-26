BEGIN;

ALTER TABLE online_orders ADD COLUMN stock_reserved boolean NOT NULL DEFAULT false;
ALTER TABLE online_orders ALTER COLUMN stock_reserved SET DEFAULT true;
CREATE INDEX online_reservation_source ON online_orders(organization_id,stock_location_id)
 WHERE stock_reserved AND status IN ('PENDING','PREPARING','READY');

CREATE FUNCTION storefront_reserved_quantity(requested_org uuid, requested_location uuid, requested_variant uuid, excluded_cart uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(sum(item.quantity),0)::numeric(18,3)
 FROM public.online_orders doc JOIN public.online_order_items item ON item.organization_id=doc.organization_id AND item.order_id=doc.id
 WHERE doc.organization_id=requested_org AND doc.stock_location_id=requested_location AND item.variant_id=requested_variant
 AND doc.stock_reserved AND doc.status IN ('PENDING','PREPARING','READY')
 AND (doc.expires_at>statement_timestamp() OR doc.cart_id IS NOT NULL)
 AND (excluded_cart IS NULL OR doc.cart_id IS DISTINCT FROM excluded_cart);
$$;

CREATE FUNCTION storefront_sellable_quantity(requested_org uuid, requested_location uuid, requested_variant uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(sum(balance.quantity),0)::numeric(18,3)
 FROM public.quality_stock_balances balance
 LEFT JOIN public.product_batches batch ON batch.organization_id=balance.organization_id AND batch.id=balance.batch_id
 WHERE balance.organization_id=requested_org AND balance.location_id=requested_location AND balance.variant_id=requested_variant
 AND (batch.id IS NULL OR (batch.status='ACTIVE' AND (batch.expires_on IS NULL OR batch.expires_on>(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date)))
 AND NOT EXISTS(SELECT 1 FROM public.quality_recalls recall WHERE recall.organization_id=balance.organization_id AND recall.variant_id=balance.variant_id AND (recall.batch_id IS NULL OR recall.batch_id=balance.batch_id));
$$;
REVOKE ALL ON FUNCTION storefront_reserved_quantity(uuid,uuid,uuid,uuid),storefront_sellable_quantity(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storefront_reserved_quantity(uuid,uuid,uuid,uuid),storefront_sellable_quantity(uuid,uuid,uuid) TO smartpos_runtime;

CREATE FUNCTION online_reservation_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
  RAISE EXCEPTION 'reservation context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF (TG_OP='INSERT' AND NOT NEW.stock_reserved) OR (TG_OP='UPDATE' AND NEW.stock_reserved IS DISTINCT FROM OLD.stock_reserved) THEN
  RAISE EXCEPTION 'reservation mode is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_reservation_identity BEFORE INSERT OR UPDATE ON online_orders FOR EACH ROW EXECUTE FUNCTION online_reservation_guard();

CREATE FUNCTION online_reservation_consistency() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE doc public.online_orders; item record;
BEGIN
 SELECT * INTO doc FROM public.online_orders WHERE organization_id=NEW.organization_id AND id=NEW.id;
 IF doc.stock_reserved AND doc.status IN ('PENDING','PREPARING','READY') AND (doc.expires_at>statement_timestamp() OR doc.cart_id IS NOT NULL) THEN
  FOR item IN SELECT variant_id FROM public.online_order_items WHERE organization_id=doc.organization_id AND order_id=doc.id ORDER BY variant_id LOOP
   IF public.storefront_reserved_quantity(doc.organization_id,doc.stock_location_id,item.variant_id)>public.storefront_sellable_quantity(doc.organization_id,doc.stock_location_id,item.variant_id) THEN
    RAISE EXCEPTION 'insufficient stock for reservation' USING ERRCODE='23514';
   END IF;
  END LOOP;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER online_reservation_consistent AFTER INSERT OR UPDATE ON online_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION online_reservation_consistency();

CREATE FUNCTION inventory_reservation_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE consumed_cart uuid; reserved numeric; safe_after numeric;
BEGIN
 IF NEW.quantity_delta>=0 THEN RETURN NEW; END IF;
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
  RAISE EXCEPTION 'reservation movement context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.quality_recalls WHERE organization_id=NEW.organization_id AND variant_id=NEW.variant_id AND (batch_id IS NULL OR batch_id=NEW.batch_id))
 OR (NEW.batch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.product_batches WHERE organization_id=NEW.organization_id AND id=NEW.batch_id AND status='ACTIVE' AND (expires_on IS NULL OR expires_on>(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date))) THEN
  RETURN NEW;
 END IF;
 IF NEW.movement_type='SALE' THEN
  SELECT sale.cart_id INTO consumed_cart FROM public.sales sale
  JOIN public.online_orders doc ON doc.organization_id=sale.organization_id AND doc.cart_id=sale.cart_id
  JOIN public.online_order_items item ON item.organization_id=doc.organization_id AND item.order_id=doc.id AND item.variant_id=NEW.variant_id
  WHERE sale.organization_id=NEW.organization_id AND sale.id=NEW.sale_id AND doc.status='READY'
  AND doc.stock_location_id=NEW.location_id AND item.quantity=-NEW.quantity_delta;
 END IF;
 reserved:=public.storefront_reserved_quantity(NEW.organization_id,NEW.location_id,NEW.variant_id,consumed_cart);
 safe_after:=public.storefront_sellable_quantity(NEW.organization_id,NEW.location_id,NEW.variant_id);
 IF safe_after<reserved THEN RAISE EXCEPTION 'stock is reserved for online orders' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_reservation BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION inventory_reservation_guard();
REVOKE ALL ON FUNCTION online_reservation_guard(),online_reservation_consistency(),inventory_reservation_guard() FROM PUBLIC;

COMMIT;
