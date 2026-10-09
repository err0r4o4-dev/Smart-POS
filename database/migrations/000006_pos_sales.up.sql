BEGIN;
CREATE TABLE pos_terminals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), branch_id uuid NOT NULL,
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,49}$'), name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 stock_location_id uuid NOT NULL, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,branch_id,id), UNIQUE(organization_id,branch_id,code),
 FOREIGN KEY(organization_id,branch_id) REFERENCES branches(organization_id,id),
 FOREIGN KEY(organization_id,branch_id,stock_location_id) REFERENCES stock_locations(organization_id,branch_id,id)
);
CREATE TABLE register_shifts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), branch_id uuid NOT NULL, terminal_id uuid NOT NULL,
 cashier_id uuid NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
 opening_cash numeric(18,2) NOT NULL CHECK(opening_cash>=0), cash_sales numeric(18,2) NOT NULL DEFAULT 0 CHECK(cash_sales>=0),
 expected_cash numeric(18,2) NOT NULL CHECK(expected_cash>=0), counted_cash numeric(18,2), difference numeric(18,2),
 open_key uuid NOT NULL, close_key uuid, closed_by uuid REFERENCES users(id), opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
 UNIQUE(organization_id,id), UNIQUE(organization_id,branch_id,terminal_id,id), UNIQUE(organization_id,cashier_id,open_key),
 FOREIGN KEY(organization_id,branch_id,terminal_id) REFERENCES pos_terminals(organization_id,branch_id,id),
 CHECK(expected_cash=opening_cash+cash_sales),
 CHECK((status='OPEN' AND counted_cash IS NULL AND difference IS NULL AND closed_by IS NULL AND closed_at IS NULL AND close_key IS NULL)
 OR (status='CLOSED' AND counted_cash>=0 AND difference=counted_cash-expected_cash AND closed_by IS NOT NULL AND closed_at IS NOT NULL AND close_key IS NOT NULL))
);
CREATE UNIQUE INDEX shift_active_terminal ON register_shifts(organization_id,terminal_id) WHERE status='OPEN';
CREATE UNIQUE INDEX shift_active_cashier ON register_shifts(organization_id,cashier_id) WHERE status='OPEN';
CREATE INDEX shift_history ON register_shifts(organization_id,branch_id,opened_at DESC,id);
CREATE TABLE pos_carts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), branch_id uuid NOT NULL, terminal_id uuid NOT NULL,
 cashier_id uuid NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','HELD','COMPLETED','CANCELLED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), create_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,branch_id,terminal_id,id), UNIQUE(organization_id,cashier_id,create_key),
 FOREIGN KEY(organization_id,branch_id,terminal_id) REFERENCES pos_terminals(organization_id,branch_id,id)
);
CREATE INDEX cart_owner ON pos_carts(organization_id,cashier_id,status,updated_at DESC);
CREATE TABLE pos_cart_items (
 organization_id uuid NOT NULL, cart_id uuid NOT NULL, variant_id uuid NOT NULL, quantity numeric(18,3) NOT NULL CHECK(quantity>0),
 unit_price numeric(18,2) NOT NULL CHECK(unit_price>0), PRIMARY KEY(organization_id,cart_id,variant_id),
 FOREIGN KEY(organization_id,cart_id) REFERENCES pos_carts(organization_id,id), FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id)
);
CREATE TABLE pos_checkouts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), branch_id uuid NOT NULL, terminal_id uuid NOT NULL,
 shift_id uuid NOT NULL, cart_id uuid NOT NULL, cashier_id uuid NOT NULL REFERENCES users(id), cart_revision bigint NOT NULL,
 idempotency_key uuid NOT NULL, fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 status text NOT NULL CHECK(status IN ('AWAITING_PAYMENT','CONFIRMED','COMPLETED','RECONCILIATION_REQUIRED','CANCELLED','RESOLVED')),
 method text NOT NULL CHECK(method IN ('CASH','QR_MANUAL','BANK_TRANSFER_MANUAL')), currency char(3) NOT NULL CHECK(currency='THB'),
 total numeric(18,2) NOT NULL CHECK(total>0), received numeric(18,2) NOT NULL CHECK(received>=total), change numeric(18,2) NOT NULL CHECK(change=received-total),
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 100),
 confirmation_key uuid, confirmed_by uuid REFERENCES users(id), confirmed_at timestamptz, reference text NOT NULL DEFAULT '' CHECK(length(reference)<=200),
 failure_code text NOT NULL DEFAULT '' CHECK(length(failure_code)<=80), resolution_note text NOT NULL DEFAULT '' CHECK(length(resolution_note)<=2000),
 resolved_by uuid REFERENCES users(id), resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,branch_id,terminal_id,id), UNIQUE(organization_id,cashier_id,idempotency_key),
 FOREIGN KEY(organization_id,branch_id,terminal_id,shift_id) REFERENCES register_shifts(organization_id,branch_id,terminal_id,id),
 FOREIGN KEY(organization_id,branch_id,terminal_id,cart_id) REFERENCES pos_carts(organization_id,branch_id,terminal_id,id),
 CHECK(method='CASH' OR change=0), CHECK((confirmed_by IS NULL)=(confirmed_at IS NULL)),
 CHECK(status NOT IN ('CONFIRMED','COMPLETED','RECONCILIATION_REQUIRED','RESOLVED') OR confirmed_at IS NOT NULL),
 CHECK(status<>'RESOLVED' OR (resolved_by IS NOT NULL AND resolved_at IS NOT NULL AND length(btrim(resolution_note))>0))
);
CREATE UNIQUE INDEX checkout_live_cart ON pos_checkouts(organization_id,cart_id) WHERE status NOT IN ('CANCELLED','RESOLVED');
CREATE INDEX checkout_shift_pending ON pos_checkouts(organization_id,shift_id,status);
CREATE TABLE sales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), branch_id uuid NOT NULL, terminal_id uuid NOT NULL,
 shift_id uuid NOT NULL, cart_id uuid NOT NULL, checkout_id uuid NOT NULL, cashier_id uuid NOT NULL REFERENCES users(id),
 sale_number text NOT NULL DEFAULT ('SAL-' || gen_random_uuid()::text), status text NOT NULL DEFAULT 'COMPLETED' CHECK(status='COMPLETED'),
 currency char(3) NOT NULL CHECK(currency='THB'), subtotal numeric(18,2) NOT NULL CHECK(subtotal>0), discount_total numeric(18,2) NOT NULL DEFAULT 0 CHECK(discount_total=0),
 tax_total numeric(18,2) NOT NULL DEFAULT 0 CHECK(tax_total=0), grand_total numeric(18,2) NOT NULL CHECK(grand_total=subtotal),
 payment_status text NOT NULL DEFAULT 'CONFIRMED' CHECK(payment_status='CONFIRMED'), inventory_operation_id uuid NOT NULL,
 store_name text NOT NULL, branch_name text NOT NULL, store_address text NOT NULL, terminal_name text NOT NULL, cashier_name text NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,id), UNIQUE(organization_id,branch_id,id), UNIQUE(organization_id,sale_number),
 UNIQUE(organization_id,cart_id), UNIQUE(organization_id,checkout_id), UNIQUE(organization_id,inventory_operation_id),
 FOREIGN KEY(organization_id,branch_id,terminal_id,shift_id) REFERENCES register_shifts(organization_id,branch_id,terminal_id,id),
 FOREIGN KEY(organization_id,branch_id,terminal_id,checkout_id) REFERENCES pos_checkouts(organization_id,branch_id,terminal_id,id),
 FOREIGN KEY(organization_id,branch_id,terminal_id,cart_id) REFERENCES pos_carts(organization_id,branch_id,terminal_id,id),
 FOREIGN KEY(organization_id,inventory_operation_id) REFERENCES inventory_operations(organization_id,id)
);
CREATE INDEX sale_history ON sales(organization_id,branch_id,completed_at DESC,id);
CREATE TABLE sale_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, sale_id uuid NOT NULL, variant_id uuid NOT NULL, stock_location_id uuid NOT NULL, branch_id uuid NOT NULL,
 product_name text NOT NULL, variant_name text NOT NULL, sku text NOT NULL, barcode text NOT NULL, unit text NOT NULL,
 quantity numeric(18,3) NOT NULL CHECK(quantity>0), unit_price numeric(18,2) NOT NULL CHECK(unit_price>0), line_total numeric(18,2) NOT NULL CHECK(line_total=round(quantity*unit_price,2)),
 UNIQUE(organization_id,sale_id,variant_id), FOREIGN KEY(organization_id,branch_id,sale_id) REFERENCES sales(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id), FOREIGN KEY(organization_id,branch_id,stock_location_id) REFERENCES stock_locations(organization_id,branch_id,id)
);
CREATE TABLE sale_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, sale_id uuid NOT NULL, checkout_id uuid NOT NULL,
 method text NOT NULL CHECK(method IN ('CASH','QR_MANUAL','BANK_TRANSFER_MANUAL')), status text NOT NULL CHECK(status='CONFIRMED'),
 amount numeric(18,2) NOT NULL CHECK(amount>0), received numeric(18,2) NOT NULL CHECK(received>=amount), change numeric(18,2) NOT NULL CHECK(change=received-amount),
 reference text NOT NULL, confirmed_by uuid NOT NULL REFERENCES users(id), confirmed_at timestamptz NOT NULL,
 UNIQUE(organization_id,sale_id), UNIQUE(organization_id,checkout_id), FOREIGN KEY(organization_id,sale_id) REFERENCES sales(organization_id,id),
 FOREIGN KEY(organization_id,checkout_id) REFERENCES pos_checkouts(organization_id,id), CHECK(method='CASH' OR change=0)
);
CREATE TABLE receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, sale_id uuid NOT NULL,
 receipt_number text NOT NULL DEFAULT ('RCP-' || gen_random_uuid()::text), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,sale_id), UNIQUE(organization_id,receipt_number), FOREIGN KEY(organization_id,sale_id) REFERENCES sales(organization_id,id)
);
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check CHECK(movement_type IN ('OPENING_BALANCE','ADJUSTMENT_IN','ADJUSTMENT_OUT','COUNT_CORRECTION','TRANSFER_IN','TRANSFER_OUT','TRANSFER_DISPATCH','TRANSFER_RECEIVE','SALE'));
ALTER TABLE stock_movements ADD COLUMN sale_id uuid;
ALTER TABLE stock_movements ADD CONSTRAINT movement_sale_fk FOREIGN KEY(organization_id,branch_id,sale_id) REFERENCES sales(organization_id,branch_id,id);
ALTER TABLE stock_movements ADD CONSTRAINT movement_sale_required CHECK((movement_type='SALE')=(sale_id IS NOT NULL));
CREATE INDEX movement_sale ON stock_movements(organization_id,sale_id) WHERE sale_id IS NOT NULL;
CREATE FUNCTION pos_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable POS history' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION pos_immutable() FROM PUBLIC;
CREATE TRIGGER sale_immutable BEFORE UPDATE OR DELETE ON sales FOR EACH ROW EXECUTE FUNCTION pos_immutable();
CREATE TRIGGER sale_item_immutable BEFORE UPDATE OR DELETE ON sale_items FOR EACH ROW EXECUTE FUNCTION pos_immutable();
CREATE TRIGGER sale_payment_immutable BEFORE UPDATE OR DELETE ON sale_payments FOR EACH ROW EXECUTE FUNCTION pos_immutable();
CREATE TRIGGER receipt_immutable BEFORE UPDATE OR DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION pos_immutable();
CREATE FUNCTION pos_settlement_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE payment_state text; BEGIN
 SELECT checkout.status INTO payment_state FROM sales sale JOIN pos_checkouts checkout ON checkout.organization_id=sale.organization_id AND checkout.id=sale.checkout_id WHERE sale.organization_id=NEW.organization_id AND sale.id=NEW.sale_id FOR SHARE OF checkout;
 IF payment_state IS NULL OR payment_state NOT IN ('CONFIRMED','RECONCILIATION_REQUIRED') THEN RAISE EXCEPTION 'cannot append to committed sale' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pos_settlement_insert_guard() FROM PUBLIC;
CREATE TRIGGER sale_item_insert_guard BEFORE INSERT ON sale_items FOR EACH ROW EXECUTE FUNCTION pos_settlement_insert_guard();
CREATE TRIGGER sale_payment_insert_guard BEFORE INSERT ON sale_payments FOR EACH ROW EXECUTE FUNCTION pos_settlement_insert_guard();
CREATE TRIGGER receipt_insert_guard BEFORE INSERT ON receipts FOR EACH ROW EXECUTE FUNCTION pos_settlement_insert_guard();
CREATE TRIGGER movement_sale_insert_guard BEFORE INSERT ON stock_movements FOR EACH ROW WHEN (NEW.sale_id IS NOT NULL) EXECUTE FUNCTION pos_settlement_insert_guard();
CREATE FUNCTION pos_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='register_shifts' THEN
  IF OLD.status='CLOSED' OR (to_jsonb(NEW)-ARRAY['status','cash_sales','expected_cash','counted_cash','difference','close_key','closed_by','closed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','cash_sales','expected_cash','counted_cash','difference','close_key','closed_by','closed_at']) THEN RAISE EXCEPTION 'immutable shift identity' USING ERRCODE='42501'; END IF;
 ELSE
  IF OLD.status IN ('COMPLETED','CANCELLED','RESOLVED') OR (to_jsonb(NEW)-ARRAY['status','confirmation_key','confirmed_by','confirmed_at','reference','failure_code','resolution_note','resolved_by','resolved_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','confirmation_key','confirmed_by','confirmed_at','reference','failure_code','resolution_note','resolved_by','resolved_at'])
  OR (OLD.confirmed_at IS NOT NULL AND ROW(NEW.confirmation_key,NEW.confirmed_by,NEW.confirmed_at,NEW.reference) IS DISTINCT FROM ROW(OLD.confirmation_key,OLD.confirmed_by,OLD.confirmed_at,OLD.reference))
  OR (OLD.confirmed_at IS NOT NULL AND NEW.status IN ('AWAITING_PAYMENT','CANCELLED')) THEN RAISE EXCEPTION 'immutable payment evidence' USING ERRCODE='42501'; END IF;
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pos_history_guard() FROM PUBLIC;
CREATE TRIGGER shift_history_guard BEFORE UPDATE ON register_shifts FOR EACH ROW EXECUTE FUNCTION pos_history_guard();
CREATE TRIGGER checkout_history_guard BEFORE UPDATE ON pos_checkouts FOR EACH ROW EXECUTE FUNCTION pos_history_guard();
CREATE FUNCTION pos_sale_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pos_checkouts WHERE organization_id=NEW.organization_id AND id=NEW.checkout_id AND status='COMPLETED' AND total=NEW.grand_total AND cashier_id=NEW.cashier_id AND cart_id=NEW.cart_id AND shift_id=NEW.shift_id)
 OR NOT EXISTS(SELECT 1 FROM pos_carts WHERE organization_id=NEW.organization_id AND id=NEW.cart_id AND status='COMPLETED' AND cashier_id=NEW.cashier_id)
 OR NOT EXISTS(SELECT 1 FROM register_shifts WHERE organization_id=NEW.organization_id AND id=NEW.shift_id AND cashier_id=NEW.cashier_id)
 OR NOT EXISTS(SELECT 1 FROM inventory_operations WHERE organization_id=NEW.organization_id AND id=NEW.inventory_operation_id AND result IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM sale_payments payment JOIN pos_checkouts checkout ON checkout.organization_id=payment.organization_id AND checkout.id=payment.checkout_id WHERE payment.organization_id=NEW.organization_id AND payment.sale_id=NEW.id AND payment.checkout_id=NEW.checkout_id AND payment.amount=NEW.grand_total AND ROW(payment.method,payment.received,payment.change,payment.reference,payment.confirmed_by,payment.confirmed_at)=ROW(checkout.method,checkout.received,checkout.change,checkout.reference,checkout.confirmed_by,checkout.confirmed_at))
 OR NOT EXISTS(SELECT 1 FROM receipts WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)
 OR COALESCE((SELECT sum(line_total) FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id),0)<>NEW.grand_total
 OR NOT EXISTS(SELECT 1 FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)
 OR EXISTS(SELECT 1 FROM sale_items item WHERE item.organization_id=NEW.organization_id AND item.sale_id=NEW.id AND NOT EXISTS(SELECT 1 FROM stock_movements movement WHERE movement.organization_id=item.organization_id AND movement.sale_id=item.sale_id AND movement.variant_id=item.variant_id AND movement.location_id=item.stock_location_id AND movement.operation_id=NEW.inventory_operation_id AND movement.quantity_delta=-item.quantity AND movement.movement_type='SALE'))
 OR (SELECT count(*) FROM stock_movements WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)<>(SELECT count(*) FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)
 THEN RAISE EXCEPTION 'sale inventory settlement mismatch' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pos_sale_consistency() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER sale_consistency AFTER INSERT ON sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pos_sale_consistency();
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['pos_terminals','register_shifts','pos_carts','pos_cart_items','pos_checkouts','sales','sale_items','sale_payments','receipts'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY pos_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON pos_terminals,register_shifts,pos_carts,pos_checkouts TO smartpos_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON pos_cart_items TO smartpos_runtime;
GRANT SELECT,INSERT ON sales,sale_items,sale_payments,receipts TO smartpos_runtime;
COMMIT;
