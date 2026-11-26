BEGIN;

ALTER TABLE pos_checkouts ADD COLUMN prepaid_order_id uuid, ADD COLUMN prepaid_order_revision bigint;
ALTER TABLE pos_checkouts ADD FOREIGN KEY(organization_id,prepaid_order_id) REFERENCES online_payment_attempts(organization_id,order_id);
ALTER TABLE pos_checkouts ADD UNIQUE(organization_id,prepaid_order_id);
ALTER TABLE pos_checkouts ADD CHECK((method='ONLINE_STRIPE')=(prepaid_order_id IS NOT NULL)), ADD CHECK((prepaid_order_id IS NULL)=(prepaid_order_revision IS NULL)), ADD CHECK(prepaid_order_revision>0);

DO $$ DECLARE table_name text; constraint_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['pos_checkouts','sale_payments'] LOOP
  SELECT conname INTO STRICT constraint_name FROM pg_constraint
  WHERE conrelid=table_name::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%method = ANY%' AND pg_get_constraintdef(oid) LIKE '%QR_MANUAL%';
  EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',table_name,constraint_name);
  EXECUTE format('ALTER TABLE %I ADD CHECK(method IN (''CASH'',''QR_MANUAL'',''BANK_TRANSFER_MANUAL'',''EXCHANGE_CREDIT'',''NONE'',''ONLINE_STRIPE''))',table_name);
 END LOOP;
END $$;

CREATE FUNCTION online_prepaid_checkout_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE doc public.online_orders; attempt public.online_payment_attempts;
BEGIN
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 SELECT * INTO doc FROM public.online_orders WHERE organization_id=NEW.organization_id AND cart_id=NEW.cart_id;
 IF NEW.method<>'ONLINE_STRIPE' THEN
  IF EXISTS(SELECT 1 FROM public.online_payment_attempts WHERE organization_id=NEW.organization_id AND order_id=doc.id) THEN
   RAISE EXCEPTION 'payment-backed order cannot collect a second tender' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO attempt FROM public.online_payment_attempts WHERE organization_id=NEW.organization_id AND order_id=NEW.prepaid_order_id FOR SHARE;
 IF doc.id IS DISTINCT FROM NEW.prepaid_order_id OR doc.status NOT IN ('READY','COMPLETED')
 OR attempt.state IS DISTINCT FROM 'PAID' OR attempt.stock_hold_released OR attempt.session_id IS NULL OR attempt.payment_intent IS NULL
 OR ROW(NEW.branch_id,NEW.terminal_id,NEW.total,NEW.reference) IS DISTINCT FROM ROW(doc.branch_id,doc.terminal_id,doc.estimated_total,attempt.payment_intent)
 OR attempt.amount_minor<>NEW.total*100 OR attempt.currency<>'thb'
 OR NEW.status NOT IN ('CONFIRMED','COMPLETED') OR NEW.received<>NEW.total OR NEW.change<>0 OR NEW.credit_amount<>0 OR NEW.adjustment_id IS NOT NULL
 OR NEW.confirmed_by IS DISTINCT FROM NEW.cashier_id OR NEW.confirmed_at IS NULL OR NEW.confirmation_key IS DISTINCT FROM NEW.idempotency_key
 OR NEW.customer_id IS NOT NULL OR NEW.pricing_snapshot->>'discount' IS DISTINCT FROM '0.00'
 OR NEW.pricing_snapshot->>'total' IS DISTINCT FROM doc.estimated_total::text OR NEW.pricing_snapshot->>'subtotal' IS DISTINCT FROM doc.estimated_total::text
 OR NEW.pricing_snapshot ? 'loyalty' OR NEW.pricing_snapshot ? 'approval_id'
 OR jsonb_array_length(NEW.items)<>(SELECT count(*) FROM public.online_order_items WHERE organization_id=NEW.organization_id AND order_id=doc.id)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.items) item WHERE item->>'discount_total' IS DISTINCT FROM '0.00')
 OR NOT EXISTS(SELECT 1 FROM public.pos_carts cart JOIN public.pos_terminals terminal ON terminal.organization_id=cart.organization_id AND terminal.id=cart.terminal_id
  WHERE cart.organization_id=NEW.organization_id AND cart.id=NEW.cart_id AND cart.branch_id=doc.branch_id AND cart.terminal_id=doc.terminal_id AND cart.cashier_id=NEW.cashier_id AND terminal.stock_location_id=doc.stock_location_id)
 OR EXISTS((SELECT variant_id,quantity,unit_price,line_total FROM public.online_order_items WHERE organization_id=NEW.organization_id AND order_id=doc.id)
  EXCEPT SELECT variant_id,quantity,unit_price,line_total FROM jsonb_to_recordset(NEW.items) AS item(variant_id uuid,quantity numeric,unit_price numeric,line_total numeric))
 OR EXISTS((SELECT variant_id,quantity,unit_price,line_total FROM jsonb_to_recordset(NEW.items) AS item(variant_id uuid,quantity numeric,unit_price numeric,line_total numeric))
  EXCEPT SELECT variant_id,quantity,unit_price,line_total FROM public.online_order_items WHERE organization_id=NEW.organization_id AND order_id=doc.id)
 THEN RAISE EXCEPTION 'prepaid checkout evidence mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER online_prepaid_checkout BEFORE INSERT OR UPDATE ON pos_checkouts FOR EACH ROW EXECUTE FUNCTION online_prepaid_checkout_guard();

CREATE OR REPLACE FUNCTION online_order_payment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE attempt public.online_payment_attempts;
BEGIN
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 SELECT * INTO attempt FROM public.online_payment_attempts WHERE organization_id=NEW.organization_id AND order_id=NEW.id;
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('CANCELLED','REJECTED','EXPIRED') AND attempt.state IS NOT NULL AND attempt.state<>'EXPIRED' THEN
  RAISE EXCEPTION 'payment must be reconciled before releasing an order' USING ERRCODE='23514';
 END IF;
 IF attempt.state IS NOT NULL AND (NEW.cart_id IS NOT NULL AND NEW.cart_id IS DISTINCT FROM OLD.cart_id OR NEW.status='COMPLETED') THEN
  IF attempt.state<>'PAID' OR attempt.stock_hold_released OR NEW.cart_id IS NULL
  OR NEW.status NOT IN ('READY','COMPLETED') THEN
   RAISE EXCEPTION 'customer payments require prepaid settlement' USING ERRCODE='23514';
  END IF;
  IF NEW.status='COMPLETED' AND NOT EXISTS(SELECT 1 FROM public.sales sale JOIN public.pos_checkouts checkout ON checkout.organization_id=sale.organization_id AND checkout.id=sale.checkout_id
   WHERE sale.organization_id=NEW.organization_id AND sale.id=NEW.sale_id AND sale.cart_id=NEW.cart_id AND checkout.prepaid_order_id=NEW.id AND checkout.method='ONLINE_STRIPE' AND checkout.total=NEW.estimated_total) THEN
   RAISE EXCEPTION 'prepaid sale linkage mismatch' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('PREPARING','READY') AND NOT public.storefront_order_live(OLD.organization_id,OLD.id) THEN
  RAISE EXCEPTION 'expired order cannot resume fulfillment' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION online_prepaid_order_consistency() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE doc public.online_orders;
BEGIN
 SELECT * INTO doc FROM public.online_orders WHERE organization_id=NEW.organization_id AND id=NEW.id;
 IF doc.cart_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.online_payment_attempts WHERE organization_id=doc.organization_id AND order_id=doc.id)
 AND (doc.status<>'COMPLETED' OR doc.sale_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.pos_checkouts checkout JOIN public.sales sale ON sale.organization_id=checkout.organization_id AND sale.checkout_id=checkout.id
  WHERE checkout.organization_id=doc.organization_id AND checkout.prepaid_order_id=doc.id AND checkout.cart_id=doc.cart_id
  AND checkout.method='ONLINE_STRIPE' AND checkout.status='COMPLETED' AND sale.id=doc.sale_id AND sale.cart_id=doc.cart_id
  AND sale.grand_total=doc.estimated_total)) THEN
  RAISE EXCEPTION 'payment-backed cart requires atomic prepaid settlement' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER online_prepaid_order_consistent AFTER INSERT OR UPDATE ON online_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION online_prepaid_order_consistency();
REVOKE ALL ON FUNCTION online_prepaid_checkout_guard(),online_prepaid_order_consistency() FROM PUBLIC;

COMMIT;
