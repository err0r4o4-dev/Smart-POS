BEGIN;

SET LOCAL row_security=off;
ALTER TABLE online_payment_attempts ADD COLUMN stock_hold_released boolean NOT NULL DEFAULT false;
DO $$
DECLARE tenant uuid; previous_context text:=current_setting('app.organization_id',true);
BEGIN
 FOR tenant IN SELECT DISTINCT organization_id FROM online_payment_attempts LOOP
  PERFORM set_config('app.organization_id',tenant::text,true);
  UPDATE online_payment_attempts attempt SET stock_hold_released=true,revision=revision+1,updated_at=now()
  WHERE attempt.organization_id=tenant AND (attempt.state='EXPIRED' OR EXISTS(
   SELECT 1 FROM online_orders doc WHERE doc.organization_id=attempt.organization_id AND doc.id=attempt.order_id
   AND doc.expires_at<=statement_timestamp() AND doc.cart_id IS NULL));
 END LOOP;
 PERFORM set_config('app.organization_id',COALESCE(previous_context,''),true);
END $$;

CREATE FUNCTION online_payment_hold_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF NEW.stock_hold_released THEN
   RAISE EXCEPTION 'payment hold starts unresolved' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NEW.stock_hold_released IS DISTINCT FROM OLD.stock_hold_released THEN
   RAISE EXCEPTION 'payment hold release is server derived and irreversible' USING ERRCODE='23514';
  END IF;
  NEW.stock_hold_released:=OLD.stock_hold_released OR NEW.state='EXPIRED';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_payment_attempt_eligibility BEFORE INSERT OR UPDATE ON online_payment_attempts FOR EACH ROW EXECUTE FUNCTION online_payment_hold_guard();

CREATE FUNCTION storefront_order_live(requested_org uuid, requested_order uuid, observed_at timestamptz DEFAULT statement_timestamp())
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(requested_org=nullif(current_setting('app.organization_id',true),'')::uuid,false) AND EXISTS(
  SELECT 1 FROM public.online_orders doc
  WHERE doc.organization_id=requested_org AND doc.id=requested_order AND doc.status IN ('PENDING','PREPARING','READY')
  AND (doc.expires_at>observed_at OR doc.cart_id IS NOT NULL OR EXISTS(
   SELECT 1 FROM public.online_payment_attempts attempt WHERE attempt.organization_id=doc.organization_id
   AND attempt.order_id=doc.id AND NOT attempt.stock_hold_released)));
$$;

CREATE OR REPLACE FUNCTION storefront_reserved_quantity(requested_org uuid, requested_location uuid, requested_variant uuid, excluded_cart uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT COALESCE(sum(item.quantity),0)::numeric(18,3)
 FROM public.online_orders doc JOIN public.online_order_items item ON item.organization_id=doc.organization_id AND item.order_id=doc.id
 WHERE doc.organization_id=requested_org AND doc.stock_location_id=requested_location AND item.variant_id=requested_variant
 AND doc.stock_reserved AND public.storefront_order_live(doc.organization_id,doc.id)
 AND (excluded_cart IS NULL OR doc.cart_id IS DISTINCT FROM excluded_cart);
$$;

CREATE OR REPLACE FUNCTION online_reservation_consistency() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE doc public.online_orders; item record;
BEGIN
 SELECT * INTO doc FROM public.online_orders WHERE organization_id=NEW.organization_id AND id=NEW.id;
 IF doc.stock_reserved AND public.storefront_order_live(doc.organization_id,doc.id) THEN
  FOR item IN SELECT variant_id FROM public.online_order_items WHERE organization_id=doc.organization_id AND order_id=doc.id ORDER BY variant_id LOOP
   IF public.storefront_reserved_quantity(doc.organization_id,doc.stock_location_id,item.variant_id)>public.storefront_sellable_quantity(doc.organization_id,doc.stock_location_id,item.variant_id) THEN
    RAISE EXCEPTION 'insufficient stock for reservation' USING ERRCODE='23514';
   END IF;
  END LOOP;
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION online_order_payment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('CANCELLED','REJECTED','EXPIRED')
 AND EXISTS(SELECT 1 FROM public.online_payment_attempts WHERE organization_id=NEW.organization_id AND order_id=NEW.id AND state<>'EXPIRED') THEN
  RAISE EXCEPTION 'payment must be reconciled before releasing an order' USING ERRCODE='23514';
 END IF;
 IF (NEW.cart_id IS NOT NULL AND NEW.cart_id IS DISTINCT FROM OLD.cart_id OR NEW.status='COMPLETED')
 AND EXISTS(SELECT 1 FROM public.online_payment_attempts WHERE organization_id=NEW.organization_id AND order_id=NEW.id) THEN
  RAISE EXCEPTION 'customer payments require prepaid settlement' USING ERRCODE='23514';
 END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('PREPARING','READY') AND NOT public.storefront_order_live(OLD.organization_id,OLD.id) THEN
  RAISE EXCEPTION 'expired order cannot resume fulfillment' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_order_payment BEFORE UPDATE ON online_orders FOR EACH ROW EXECUTE FUNCTION online_order_payment_guard();

CREATE OR REPLACE FUNCTION storefront_source_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid THEN
  RAISE EXCEPTION 'storefront source context mismatch' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.terminal_id IS DISTINCT FROM OLD.terminal_id OR NEW.online_terminal_id IS DISTINCT FROM OLD.online_terminal_id)
 AND EXISTS(SELECT 1 FROM public.online_orders WHERE organization_id=NEW.organization_id AND public.storefront_order_live(organization_id,id)) THEN
  RAISE EXCEPTION 'online source has live orders' USING ERRCODE='23514';
 END IF;
 IF NEW.online_terminal_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.pos_terminals front JOIN public.pos_terminals back ON back.organization_id=front.organization_id
  JOIN public.stock_locations location ON location.organization_id=back.organization_id AND location.id=back.stock_location_id
  WHERE front.organization_id=NEW.organization_id AND front.id=NEW.terminal_id AND back.id=NEW.online_terminal_id
  AND front.branch_id=back.branch_id AND front.stock_location_id<>back.stock_location_id
  AND location.branch_id=back.branch_id AND location.type='WAREHOUSE'
 ) THEN
  RAISE EXCEPTION 'online source must be a separate same-branch warehouse' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION online_payment_hold_guard(),online_order_payment_guard(),storefront_order_live(uuid,uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storefront_order_live(uuid,uuid,timestamptz) TO smartpos_runtime;

COMMIT;
