BEGIN;
CREATE TABLE sale_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), branch_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('EXCHANGE','REVERSAL')), number text NOT NULL DEFAULT ('ADJ-'||gen_random_uuid()::text),
 original_sale_id uuid NOT NULL, linked_return_id uuid NOT NULL, replacement_sale_id uuid, terminal_id uuid,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','APPROVED','AWAITING_SETTLEMENT','RECONCILIATION_REQUIRED','COMPLETED','REJECTED','CANCELLED')),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 return_credit numeric(18,2) NOT NULL CHECK(return_credit>=0), replacement_total numeric(18,2) NOT NULL CHECK(replacement_total>=0),
 net_difference numeric(18,2) NOT NULL, replacement_items jsonb NOT NULL CHECK(jsonb_typeof(replacement_items)='array' AND jsonb_array_length(replacement_items)<=100),
 method text CHECK(method IN ('CASH','QR_MANUAL','BANK_TRANSFER_MANUAL','CASH_REFUND','MANUAL_BANK_REFUND','MANUAL_ORIGINAL_METHOD_REFUND','NONE')),
 shift_id uuid, reference text NOT NULL DEFAULT '' CHECK(length(reference)<=200), settlement_note text NOT NULL DEFAULT '' CHECK(length(settlement_note)<=2000),
 reported_by uuid REFERENCES users(id), reported_at timestamptz, approved_by uuid REFERENCES users(id), approved_at timestamptz,
 completed_by uuid REFERENCES users(id), completed_at timestamptz, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 failure_code text NOT NULL DEFAULT '', operation_id uuid,
 UNIQUE(organization_id,id), UNIQUE(organization_id,number), UNIQUE(organization_id,linked_return_id), UNIQUE(organization_id,replacement_sale_id),
 FOREIGN KEY(organization_id,branch_id,original_sale_id) REFERENCES sales(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,branch_id,linked_return_id) REFERENCES customer_returns(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,branch_id,replacement_sale_id) REFERENCES sales(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,branch_id,terminal_id) REFERENCES pos_terminals(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,shift_id) REFERENCES register_shifts(organization_id,id),
 FOREIGN KEY(organization_id,operation_id) REFERENCES inventory_operations(organization_id,id),
 CHECK(net_difference=replacement_total-return_credit), CHECK((reported_by IS NULL)=(reported_at IS NULL)),
 CHECK((approved_by IS NULL)=(approved_at IS NULL)),
 CHECK((status='COMPLETED')=(completed_by IS NOT NULL AND completed_at IS NOT NULL AND operation_id IS NOT NULL)),
 CHECK(status NOT IN ('APPROVED','AWAITING_SETTLEMENT','RECONCILIATION_REQUIRED','COMPLETED') OR approved_by IS NOT NULL),
 CHECK(kind<>'REVERSAL' OR (replacement_total=0 AND replacement_sale_id IS NULL AND replacement_items='[]'::jsonb)),
 CHECK(kind<>'EXCHANGE' OR (terminal_id IS NOT NULL AND replacement_total>0 AND jsonb_array_length(replacement_items)>0)),
 CHECK(reported_at IS NULL OR ((net_difference>0 AND method IN ('CASH','QR_MANUAL','BANK_TRANSFER_MANUAL')) OR (net_difference<0 AND method IN ('CASH_REFUND','MANUAL_BANK_REFUND','MANUAL_ORIGINAL_METHOD_REFUND')) OR (net_difference=0 AND method='NONE'))),
 CHECK(method NOT IN ('CASH','CASH_REFUND') OR shift_id IS NOT NULL), CHECK(method IN ('CASH','CASH_REFUND') OR shift_id IS NULL),
 CHECK(reported_at IS NULL OR method IN ('CASH','CASH_REFUND','NONE') OR length(btrim(reference))>0)
);
CREATE UNIQUE INDEX active_sale_reversal ON sale_adjustments(organization_id,original_sale_id) WHERE kind='REVERSAL' AND status NOT IN ('CANCELLED','REJECTED');
ALTER TABLE sale_adjustments ADD CONSTRAINT adjustment_acknowledgement CHECK ((reported_at IS NULL AND method IS NULL AND shift_id IS NULL AND status NOT IN ('AWAITING_SETTLEMENT','RECONCILIATION_REQUIRED','COMPLETED')) OR (reported_at IS NOT NULL AND method IS NOT NULL AND status IN ('AWAITING_SETTLEMENT','RECONCILIATION_REQUIRED','COMPLETED')));
CREATE INDEX adjustment_history ON sale_adjustments(organization_id,branch_id,created_at DESC,id);
CREATE INDEX adjustment_sale ON sale_adjustments(organization_id,original_sale_id,status);
CREATE TABLE adjustment_settlement_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, adjustment_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('ACKNOWLEDGED','RECONCILIATION_REQUIRED','COMPLETED')), actor_id uuid NOT NULL REFERENCES users(id),
 reference text NOT NULL, note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,adjustment_id) REFERENCES sale_adjustments(organization_id,id)
);
ALTER TABLE pos_checkouts ADD COLUMN adjustment_id uuid, ADD COLUMN credit_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK(credit_amount>=0 AND credit_amount<=total);
ALTER TABLE pos_checkouts ADD CONSTRAINT checkout_adjustment FOREIGN KEY(organization_id,adjustment_id) REFERENCES sale_adjustments(organization_id,id);
ALTER TABLE pos_checkouts DROP CONSTRAINT pos_checkouts_method_check, DROP CONSTRAINT pos_checkouts_check, DROP CONSTRAINT pos_checkouts_check1;
ALTER TABLE pos_checkouts ADD CHECK(method IN ('CASH','QR_MANUAL','BANK_TRANSFER_MANUAL','EXCHANGE_CREDIT')), ADD CHECK(received>=total-credit_amount), ADD CHECK(change=received-(total-credit_amount)), ADD CHECK((credit_amount=0 AND adjustment_id IS NULL AND method<>'EXCHANGE_CREDIT') OR (adjustment_id IS NOT NULL AND credit_amount>=0)), ADD CHECK(method<>'EXCHANGE_CREDIT' OR (credit_amount=total AND received=0 AND change=0));
ALTER TABLE sale_payments ADD COLUMN credit_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK(credit_amount>=0);
ALTER TABLE sale_payments DROP CONSTRAINT sale_payments_method_check, DROP CONSTRAINT sale_payments_amount_check;
ALTER TABLE sale_payments ADD CHECK(method IN ('CASH','QR_MANUAL','BANK_TRANSFER_MANUAL','EXCHANGE_CREDIT')), ADD CHECK(amount>=0), ADD CHECK(amount>0 OR (method='EXCHANGE_CREDIT' AND credit_amount>0 AND received=0 AND change=0));
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['sale_adjustments','adjustment_settlement_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY adjustment_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON sale_adjustments TO smartpos_runtime;
GRANT SELECT,INSERT ON adjustment_settlement_events TO smartpos_runtime;
CREATE TRIGGER adjustment_event_immutable BEFORE UPDATE OR DELETE ON adjustment_settlement_events FOR EACH ROW EXECUTE FUNCTION pos_immutable();
CREATE FUNCTION adjustment_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status IN ('COMPLETED','REJECTED','CANCELLED') OR NEW.revision<>OLD.revision+1
 OR ROW(NEW.organization_id,NEW.branch_id,NEW.kind,NEW.original_sale_id,NEW.number,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.organization_id,OLD.branch_id,OLD.kind,OLD.original_sale_id,OLD.number,OLD.created_by,OLD.created_at)
 OR (OLD.status<>'DRAFT' AND ROW(NEW.reason,NEW.linked_return_id,NEW.terminal_id,NEW.return_credit,NEW.replacement_total,NEW.net_difference,NEW.replacement_items) IS DISTINCT FROM ROW(OLD.reason,OLD.linked_return_id,OLD.terminal_id,OLD.return_credit,OLD.replacement_total,OLD.net_difference,OLD.replacement_items))
 OR (OLD.approved_at IS NOT NULL AND ROW(NEW.approved_by,NEW.approved_at) IS DISTINCT FROM ROW(OLD.approved_by,OLD.approved_at))
 OR (OLD.reported_at IS NOT NULL AND ROW(NEW.method,NEW.shift_id,NEW.reference,NEW.settlement_note,NEW.reported_by,NEW.reported_at) IS DISTINCT FROM ROW(OLD.method,OLD.shift_id,OLD.reference,OLD.settlement_note,OLD.reported_by,OLD.reported_at))
 OR NOT ((OLD.status='DRAFT' AND NEW.status IN ('DRAFT','PENDING_APPROVAL','CANCELLED')) OR (OLD.status='PENDING_APPROVAL' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status IN ('AWAITING_SETTLEMENT','CANCELLED','COMPLETED')) OR (OLD.status IN ('AWAITING_SETTLEMENT','RECONCILIATION_REQUIRED') AND NEW.status IN ('RECONCILIATION_REQUIRED','COMPLETED')))
 THEN RAISE EXCEPTION 'immutable adjustment or illegal transition' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER adjustment_guard BEFORE UPDATE ON sale_adjustments FOR EACH ROW EXECUTE FUNCTION adjustment_guard();
CREATE FUNCTION adjustment_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE doc sale_adjustments; BEGIN
 SELECT * INTO doc FROM sale_adjustments WHERE organization_id=NEW.organization_id AND id=NEW.id;
 IF NOT EXISTS(SELECT 1 FROM customer_returns WHERE organization_id=doc.organization_id AND id=doc.linked_return_id AND original_sale_id=doc.original_sale_id AND branch_id=doc.branch_id AND amount=doc.return_credit) THEN RAISE EXCEPTION 'invalid adjustment return linkage' USING ERRCODE='23514'; END IF;
 IF doc.status='COMPLETED' AND (
 doc.reported_at IS NULL OR NOT EXISTS(SELECT 1 FROM customer_returns WHERE organization_id=doc.organization_id AND id=doc.linked_return_id AND status='COMPLETED' AND inventory_operation_id=doc.operation_id)
 OR (doc.kind='EXCHANGE' AND ((SELECT count(*) FROM sale_items WHERE organization_id=doc.organization_id AND sale_id=doc.replacement_sale_id)<>jsonb_array_length(doc.replacement_items) OR EXISTS(SELECT 1 FROM jsonb_array_elements(doc.replacement_items) snapshot WHERE NOT EXISTS(SELECT 1 FROM sale_items item WHERE item.organization_id=doc.organization_id AND item.sale_id=doc.replacement_sale_id AND item.variant_id=(snapshot->>'variant_id')::uuid AND item.quantity=(snapshot->>'quantity')::numeric AND item.unit_price=(snapshot->>'unit_price')::numeric AND item.line_total=(snapshot->>'line_total')::numeric))))
 OR (doc.kind='EXCHANGE' AND NOT EXISTS(SELECT 1 FROM sales sale JOIN pos_checkouts checkout ON checkout.organization_id=sale.organization_id AND checkout.id=sale.checkout_id JOIN sale_payments payment ON payment.organization_id=sale.organization_id AND payment.sale_id=sale.id WHERE sale.organization_id=doc.organization_id AND sale.id=doc.replacement_sale_id AND checkout.adjustment_id=doc.id AND sale.grand_total=doc.replacement_total AND checkout.credit_amount=least(doc.return_credit,doc.replacement_total) AND payment.amount=greatest(doc.net_difference,0) AND (doc.net_difference<=0 OR payment.method=doc.method) AND (doc.method<>'CASH' OR sale.shift_id=doc.shift_id)))
 OR (doc.net_difference<0 AND NOT EXISTS(SELECT 1 FROM customer_refunds WHERE organization_id=doc.organization_id AND return_id=doc.linked_return_id AND amount=-doc.net_difference AND status='CONFIRMED' AND method=doc.method AND reference=doc.reference))
 OR (doc.net_difference>=0 AND EXISTS(SELECT 1 FROM customer_refunds WHERE organization_id=doc.organization_id AND return_id=doc.linked_return_id))
 OR NOT EXISTS(SELECT 1 FROM inventory_operations WHERE organization_id=doc.organization_id AND id=doc.operation_id AND result IS NOT NULL)
 OR (doc.kind='REVERSAL' AND (EXISTS(SELECT 1 FROM customer_returns WHERE organization_id=doc.organization_id AND original_sale_id=doc.original_sale_id AND id<>doc.linked_return_id AND status='COMPLETED') OR EXISTS(SELECT 1 FROM sale_items item WHERE item.organization_id=doc.organization_id AND item.sale_id=doc.original_sale_id AND NOT EXISTS(SELECT 1 FROM customer_return_items returned WHERE returned.organization_id=item.organization_id AND returned.return_id=doc.linked_return_id AND returned.original_sale_item_id=item.id AND returned.quantity=item.quantity))))
 ) THEN RAISE EXCEPTION 'adjustment posting mismatch' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER adjustment_consistency AFTER INSERT OR UPDATE ON sale_adjustments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION adjustment_consistency();
CREATE FUNCTION adjustment_shift_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status='CLOSED' AND EXISTS(SELECT 1 FROM sale_adjustments WHERE organization_id=NEW.organization_id AND shift_id=NEW.id AND reported_at IS NOT NULL AND status IN ('AWAITING_SETTLEMENT','RECONCILIATION_REQUIRED')) THEN RAISE EXCEPTION 'unresolved adjustment cash evidence' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER adjustment_shift_guard AFTER UPDATE ON register_shifts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION adjustment_shift_guard();
REVOKE ALL ON FUNCTION adjustment_guard(),adjustment_consistency(),adjustment_shift_guard() FROM PUBLIC;
CREATE OR REPLACE FUNCTION pos_sale_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pos_checkouts WHERE organization_id=NEW.organization_id AND id=NEW.checkout_id AND status='COMPLETED' AND total=NEW.grand_total AND cashier_id=NEW.cashier_id AND cart_id=NEW.cart_id AND shift_id=NEW.shift_id)
 OR NOT EXISTS(SELECT 1 FROM pos_carts WHERE organization_id=NEW.organization_id AND id=NEW.cart_id AND status='COMPLETED' AND cashier_id=NEW.cashier_id)
 OR NOT EXISTS(SELECT 1 FROM register_shifts WHERE organization_id=NEW.organization_id AND id=NEW.shift_id AND cashier_id=NEW.cashier_id)
 OR NOT EXISTS(SELECT 1 FROM inventory_operations WHERE organization_id=NEW.organization_id AND id=NEW.inventory_operation_id AND result IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM sale_payments payment JOIN pos_checkouts checkout ON checkout.organization_id=payment.organization_id AND checkout.id=payment.checkout_id WHERE payment.organization_id=NEW.organization_id AND payment.sale_id=NEW.id AND payment.checkout_id=NEW.checkout_id AND payment.amount+payment.credit_amount=NEW.grand_total AND payment.credit_amount=checkout.credit_amount AND ROW(payment.method,payment.received,payment.change,payment.reference,payment.confirmed_by,payment.confirmed_at)=ROW(checkout.method,checkout.received,checkout.change,checkout.reference,checkout.confirmed_by,checkout.confirmed_at))
 OR EXISTS(SELECT 1 FROM pos_checkouts checkout WHERE checkout.organization_id=NEW.organization_id AND checkout.id=NEW.checkout_id AND checkout.adjustment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sale_adjustments WHERE organization_id=NEW.organization_id AND id=checkout.adjustment_id AND kind='EXCHANGE' AND status='COMPLETED' AND replacement_sale_id=NEW.id))
 OR NOT EXISTS(SELECT 1 FROM receipts WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)
 OR COALESCE((SELECT sum(line_total) FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id),0)<>NEW.grand_total
 OR NOT EXISTS(SELECT 1 FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)
 OR EXISTS(SELECT 1 FROM sale_items item WHERE item.organization_id=NEW.organization_id AND item.sale_id=NEW.id AND NOT EXISTS(SELECT 1 FROM stock_movements movement WHERE movement.organization_id=item.organization_id AND movement.sale_id=item.sale_id AND movement.variant_id=item.variant_id AND movement.location_id=item.stock_location_id AND movement.operation_id=NEW.inventory_operation_id AND movement.quantity_delta=-item.quantity AND movement.movement_type='SALE'))
 OR (SELECT count(*) FROM stock_movements WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)<>(SELECT count(*) FROM sale_items WHERE organization_id=NEW.organization_id AND sale_id=NEW.id)
 THEN RAISE EXCEPTION 'sale inventory settlement mismatch' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION customer_return_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE doc customer_returns; BEGIN
 SELECT * INTO doc FROM customer_returns WHERE organization_id=NEW.organization_id AND id=NEW.id;
 IF doc.status IN ('PENDING_APPROVAL','APPROVED','COMPLETED') AND (NOT EXISTS(SELECT 1 FROM customer_return_items WHERE organization_id=doc.organization_id AND return_id=doc.id) OR doc.amount<>(SELECT sum(refund_amount) FROM customer_return_items WHERE organization_id=doc.organization_id AND return_id=doc.id)) THEN RAISE EXCEPTION 'return amount mismatch' USING ERRCODE='23514'; END IF;
 IF doc.status='COMPLETED' AND (
  (NOT EXISTS(SELECT 1 FROM sale_adjustments WHERE organization_id=doc.organization_id AND linked_return_id=doc.id) AND NOT EXISTS(SELECT 1 FROM customer_refunds WHERE organization_id=doc.organization_id AND return_id=doc.id AND amount=doc.amount)) OR EXISTS(SELECT 1 FROM sale_adjustments WHERE organization_id=doc.organization_id AND linked_return_id=doc.id AND status<>'COMPLETED')
  OR NOT EXISTS(SELECT 1 FROM inventory_operations WHERE organization_id=doc.organization_id AND id=doc.inventory_operation_id AND result IS NOT NULL)
  OR EXISTS(SELECT 1 FROM customer_return_items item JOIN sale_items sale ON sale.organization_id=item.organization_id AND sale.id=item.original_sale_item_id WHERE item.organization_id=doc.organization_id AND item.return_id=doc.id AND (
   (SELECT sum(prior.quantity) FROM customer_return_items prior JOIN customer_returns header ON header.organization_id=prior.organization_id AND header.id=prior.return_id WHERE prior.organization_id=item.organization_id AND prior.original_sale_item_id=item.original_sale_item_id AND header.status='COMPLETED')>sale.quantity
   OR (SELECT sum(prior.refund_amount) FROM customer_return_items prior JOIN customer_returns header ON header.organization_id=prior.organization_id AND header.id=prior.return_id WHERE prior.organization_id=item.organization_id AND prior.original_sale_item_id=item.original_sale_item_id AND header.status='COMPLETED')>sale.line_total
   OR (item.disposition<>'NO_STOCK_RETURN' AND NOT EXISTS(SELECT 1 FROM stock_movements WHERE organization_id=item.organization_id AND customer_return_item_id=item.id AND variant_id=item.variant_id AND location_id=item.destination_location_id AND quantity_delta=item.quantity AND operation_id=doc.inventory_operation_id))
   OR (item.disposition='NO_STOCK_RETURN' AND EXISTS(SELECT 1 FROM stock_movements WHERE organization_id=item.organization_id AND customer_return_item_id=item.id))
  ))) THEN RAISE EXCEPTION 'return posting mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION refund_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING_SETTLEMENT' OR NOT EXISTS(SELECT 1 FROM customer_returns WHERE organization_id=NEW.organization_id AND id=NEW.return_id AND status='APPROVED' AND NEW.amount=COALESCE((SELECT greatest(-net_difference,0) FROM sale_adjustments WHERE organization_id=NEW.organization_id AND linked_return_id=NEW.return_id),amount)) THEN RAISE EXCEPTION 'invalid refund source' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.status='CONFIRMED' OR (to_jsonb(NEW)-ARRAY['method','status','reference','settlement_note','shift_id','reported_by','reported_at','confirmed_by','confirmed_at','revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['method','status','reference','settlement_note','shift_id','reported_by','reported_at','confirmed_by','confirmed_at','revision'])
  OR (OLD.reported_at IS NOT NULL AND ROW(NEW.method,NEW.reference,NEW.shift_id,NEW.reported_by,NEW.reported_at) IS DISTINCT FROM ROW(OLD.method,OLD.reference,OLD.shift_id,OLD.reported_by,OLD.reported_at))
  OR NOT ((OLD.status='PENDING_SETTLEMENT' AND NEW.status='SETTLEMENT_REPORTED') OR (OLD.status IN ('SETTLEMENT_REPORTED','RECONCILIATION_REQUIRED') AND NEW.status IN ('CONFIRMED','RECONCILIATION_REQUIRED'))) THEN RAISE EXCEPTION 'immutable refund evidence' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
