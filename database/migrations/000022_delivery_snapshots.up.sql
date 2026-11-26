BEGIN;

ALTER TABLE storefronts ADD COLUMN delivery_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN shipping_fee numeric(18,2) NOT NULL DEFAULT 0 CHECK(shipping_fee BETWEEN 0 AND 999999.99);
ALTER TABLE online_orders ADD COLUMN fulfillment text NOT NULL DEFAULT 'PICKUP' CHECK(fulfillment IN ('PICKUP','DELIVERY')),
 ADD COLUMN shipping_fee numeric(18,2) NOT NULL DEFAULT 0 CHECK(shipping_fee BETWEEN 0 AND 999999.99),
 ADD COLUMN delivery_address text NOT NULL DEFAULT '' CHECK(length(delivery_address)<=2000),
 ADD CHECK((fulfillment='DELIVERY' AND length(btrim(delivery_address))>0) OR (fulfillment='PICKUP' AND shipping_fee=0 AND delivery_address=''));

CREATE FUNCTION online_delivery_snapshot_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.fulfillment,NEW.shipping_fee,NEW.delivery_address) IS DISTINCT FROM ROW(OLD.fulfillment,OLD.shipping_fee,OLD.delivery_address) THEN
  RAISE EXCEPTION 'delivery snapshots are immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.fulfillment='DELIVERY' AND NEW.cart_id IS NOT NULL THEN
  RAISE EXCEPTION 'delivery must post through shipment' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_delivery_snapshot BEFORE INSERT OR UPDATE ON online_orders FOR EACH ROW EXECUTE FUNCTION online_delivery_snapshot_guard();
REVOKE ALL ON FUNCTION online_delivery_snapshot_guard() FROM PUBLIC;

CREATE OR REPLACE FUNCTION online_order_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE doc online_orders; count_items integer; item_total numeric;
BEGIN
 SELECT * INTO doc FROM online_orders WHERE organization_id=NEW.organization_id AND id=NEW.id;
 SELECT count(*),sum(line_total) INTO count_items,item_total FROM online_order_items WHERE organization_id=doc.organization_id AND order_id=doc.id;
 IF count_items NOT BETWEEN 1 AND 100 OR item_total+doc.shipping_fee IS DISTINCT FROM doc.estimated_total THEN
  RAISE EXCEPTION 'online order snapshots inconsistent' USING ERRCODE='23514';
 END IF;
 IF doc.status='COMPLETED' THEN
  IF doc.fulfillment<>'PICKUP' OR doc.cart_id IS NULL OR NOT EXISTS(SELECT 1 FROM sales WHERE organization_id=doc.organization_id AND id=doc.sale_id AND cart_id=doc.cart_id AND branch_id=doc.branch_id AND terminal_id=doc.terminal_id) OR EXISTS(
   (SELECT variant_id,quantity FROM online_order_items WHERE organization_id=doc.organization_id AND order_id=doc.id EXCEPT SELECT variant_id,quantity FROM sale_items WHERE organization_id=doc.organization_id AND sale_id=doc.sale_id)
   UNION ALL
   (SELECT variant_id,quantity FROM sale_items WHERE organization_id=doc.organization_id AND sale_id=doc.sale_id EXCEPT SELECT variant_id,quantity FROM online_order_items WHERE organization_id=doc.organization_id AND order_id=doc.id)
  ) THEN RAISE EXCEPTION 'online order sale inconsistent' USING ERRCODE='23514'; END IF;
 ELSIF doc.cart_id IS NOT NULL AND EXISTS(SELECT 1 FROM sales WHERE organization_id=doc.organization_id AND cart_id=doc.cart_id) THEN
  RAISE EXCEPTION 'linked sale must complete online order' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;

COMMIT;
