BEGIN;
ALTER TABLE sale_items ADD CONSTRAINT sale_item_tenant_identity UNIQUE(organization_id,sale_id,id);
CREATE TABLE customer_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), branch_id uuid NOT NULL,
 original_sale_id uuid NOT NULL, number text NOT NULL DEFAULT ('RET-'||gen_random_uuid()::text),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','COMPLETED','CANCELLED')),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 amount numeric(18,2) NOT NULL CHECK(amount>=0), created_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id),
 completed_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz, completed_at timestamptz,
 inventory_operation_id uuid, UNIQUE(organization_id,id), UNIQUE(organization_id,branch_id,id), UNIQUE(organization_id,number),
 FOREIGN KEY(organization_id,branch_id,original_sale_id) REFERENCES sales(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,inventory_operation_id) REFERENCES inventory_operations(organization_id,id),
 CHECK((approved_by IS NULL)=(approved_at IS NULL)),
 CHECK((status='COMPLETED')=(completed_by IS NOT NULL AND completed_at IS NOT NULL AND inventory_operation_id IS NOT NULL)),
 CHECK(status NOT IN ('APPROVED','COMPLETED') OR approved_by IS NOT NULL)
);
CREATE INDEX customer_return_history ON customer_returns(organization_id,branch_id,created_at DESC,id);
CREATE INDEX customer_return_sale ON customer_returns(organization_id,original_sale_id,status);
CREATE TABLE customer_return_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, return_id uuid NOT NULL, original_sale_id uuid NOT NULL,
 original_sale_item_id uuid NOT NULL, variant_id uuid NOT NULL, branch_id uuid NOT NULL,
 quantity numeric(18,3) NOT NULL CHECK(quantity>0), original_unit_price numeric(18,2) NOT NULL CHECK(original_unit_price>0),
 original_paid_amount numeric(18,2) NOT NULL CHECK(original_paid_amount>=0), refund_amount numeric(18,2) NOT NULL CHECK(refund_amount>=0),
 disposition text NOT NULL CHECK(disposition IN ('RESTOCK_SELLABLE','QUARANTINE','DAMAGED','NO_STOCK_RETURN')),
 destination_location_id uuid, UNIQUE(organization_id,id), UNIQUE(organization_id,return_id,original_sale_item_id),
 FOREIGN KEY(organization_id,branch_id,return_id) REFERENCES customer_returns(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,original_sale_id,original_sale_item_id) REFERENCES sale_items(organization_id,sale_id,id),
 FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id),
 FOREIGN KEY(organization_id,branch_id,destination_location_id) REFERENCES stock_locations(organization_id,branch_id,id),
 CHECK((disposition='NO_STOCK_RETURN')=(destination_location_id IS NULL))
);
CREATE INDEX customer_return_item_sale ON customer_return_items(organization_id,original_sale_item_id,return_id);
CREATE TABLE customer_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, branch_id uuid NOT NULL, return_id uuid NOT NULL,
 amount numeric(18,2) NOT NULL CHECK(amount>=0), method text CHECK(method IN ('CASH_REFUND','MANUAL_BANK_REFUND','MANUAL_ORIGINAL_METHOD_REFUND')),
 status text NOT NULL DEFAULT 'PENDING_SETTLEMENT' CHECK(status IN ('PENDING_SETTLEMENT','SETTLEMENT_REPORTED','CONFIRMED','RECONCILIATION_REQUIRED')),
 reference text NOT NULL DEFAULT '' CHECK(length(reference)<=200), settlement_note text NOT NULL DEFAULT '' CHECK(length(settlement_note)<=2000),
 shift_id uuid, reported_by uuid REFERENCES users(id), reported_at timestamptz, confirmed_by uuid REFERENCES users(id), confirmed_at timestamptz,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,return_id),
 FOREIGN KEY(organization_id,branch_id,return_id) REFERENCES customer_returns(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,shift_id) REFERENCES register_shifts(organization_id,id),
 CHECK((status='PENDING_SETTLEMENT')=(reported_at IS NULL)), CHECK((reported_at IS NULL)=(reported_by IS NULL)),
 CHECK((status='CONFIRMED')=(confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)),
 CHECK(status='PENDING_SETTLEMENT' OR (method IS NOT NULL AND (method='CASH_REFUND' OR length(btrim(reference))>0))),
 CHECK((method='CASH_REFUND') IS NOT TRUE OR shift_id IS NOT NULL), CHECK(method='CASH_REFUND' OR shift_id IS NULL)
);
CREATE INDEX customer_refund_history ON customer_refunds(organization_id,branch_id,created_at DESC,id);
CREATE TABLE refund_settlement_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, refund_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('SETTLEMENT_REPORTED','CONFIRMED','RECONCILIATION_REQUIRED')),
 actor_id uuid NOT NULL REFERENCES users(id), reference text NOT NULL CHECK(length(reference)<=200), note text NOT NULL CHECK(length(note)<=2000),
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(organization_id,refund_id) REFERENCES customer_refunds(organization_id,id)
);
CREATE INDEX refund_event_history ON refund_settlement_events(organization_id,refund_id,created_at,id);
CREATE TABLE register_cash_disbursements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, shift_id uuid NOT NULL, refund_id uuid NOT NULL,
 amount numeric(18,2) NOT NULL CHECK(amount>=0), actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,refund_id), FOREIGN KEY(organization_id,shift_id) REFERENCES register_shifts(organization_id,id),
 FOREIGN KEY(organization_id,refund_id) REFERENCES customer_refunds(organization_id,id)
);
ALTER TABLE register_shifts ADD COLUMN cash_refunds numeric(18,2) NOT NULL DEFAULT 0 CHECK(cash_refunds>=0);
ALTER TABLE register_shifts DROP CONSTRAINT register_shifts_check;
ALTER TABLE register_shifts ADD CONSTRAINT shift_expected_cash CHECK(expected_cash=opening_cash+cash_sales-cash_refunds);
CREATE OR REPLACE FUNCTION pos_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='register_shifts' THEN
  IF OLD.status='CLOSED' OR (to_jsonb(NEW)-ARRAY['status','cash_sales','cash_refunds','expected_cash','counted_cash','difference','close_key','closed_by','closed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','cash_sales','cash_refunds','expected_cash','counted_cash','difference','close_key','closed_by','closed_at']) THEN RAISE EXCEPTION 'immutable shift identity' USING ERRCODE='42501'; END IF;
 ELSE
  IF OLD.status IN ('COMPLETED','CANCELLED','RESOLVED') OR (to_jsonb(NEW)-ARRAY['status','confirmation_key','confirmed_by','confirmed_at','reference','failure_code','resolution_note','resolved_by','resolved_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','confirmation_key','confirmed_by','confirmed_at','reference','failure_code','resolution_note','resolved_by','resolved_at'])
  OR (OLD.confirmed_at IS NOT NULL AND ROW(NEW.confirmation_key,NEW.confirmed_by,NEW.confirmed_at,NEW.reference) IS DISTINCT FROM ROW(OLD.confirmation_key,OLD.confirmed_by,OLD.confirmed_at,OLD.reference))
  OR (OLD.confirmed_at IS NOT NULL AND NEW.status IN ('AWAITING_PAYMENT','CANCELLED')) THEN RAISE EXCEPTION 'immutable payment evidence' USING ERRCODE='42501'; END IF;
 END IF; RETURN NEW;
END $$;
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check CHECK(movement_type IN ('OPENING_BALANCE','ADJUSTMENT_IN','ADJUSTMENT_OUT','COUNT_CORRECTION','TRANSFER_IN','TRANSFER_OUT','TRANSFER_DISPATCH','TRANSFER_RECEIVE','SALE','PURCHASE_RECEIVE','SUPPLIER_RETURN','SALE_RETURN'));
ALTER TABLE stock_movements ADD COLUMN customer_return_item_id uuid;
ALTER TABLE stock_movements ADD CONSTRAINT movement_customer_return FOREIGN KEY(organization_id,customer_return_item_id) REFERENCES customer_return_items(organization_id,id);
ALTER TABLE stock_movements ADD CONSTRAINT movement_customer_return_required CHECK((movement_type='SALE_RETURN')=(customer_return_item_id IS NOT NULL));
CREATE UNIQUE INDEX customer_return_post_once ON stock_movements(organization_id,customer_return_item_id) WHERE customer_return_item_id IS NOT NULL;
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['customer_returns','customer_return_items','customer_refunds','refund_settlement_events','register_cash_disbursements'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY business_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON customer_returns,customer_refunds TO smartpos_runtime;
GRANT SELECT,INSERT ON customer_return_items,refund_settlement_events,register_cash_disbursements TO smartpos_runtime;
CREATE FUNCTION customer_return_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='customer_returns' THEN
  IF OLD.status IN ('COMPLETED','REJECTED','CANCELLED') OR (to_jsonb(NEW)-ARRAY['status','revision','amount','approved_by','approved_at','completed_by','completed_at','inventory_operation_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','revision','amount','approved_by','approved_at','completed_by','completed_at','inventory_operation_id'])
  OR (OLD.status<>'DRAFT' AND NEW.amount<>OLD.amount)
  OR (OLD.approved_at IS NOT NULL AND ROW(NEW.approved_by,NEW.approved_at) IS DISTINCT FROM ROW(OLD.approved_by,OLD.approved_at))
  OR NOT ((OLD.status='DRAFT' AND NEW.status IN ('DRAFT','PENDING_APPROVAL','CANCELLED')) OR (OLD.status='PENDING_APPROVAL' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED')) OR (OLD.status='APPROVED' AND NEW.status IN ('COMPLETED','CANCELLED')))
  THEN RAISE EXCEPTION 'invalid return transition' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM customer_returns doc JOIN sale_items sale ON sale.organization_id=doc.organization_id AND sale.sale_id=doc.original_sale_id WHERE doc.organization_id=NEW.organization_id AND doc.id=NEW.return_id AND doc.status='DRAFT' AND doc.original_sale_id=NEW.original_sale_id AND sale.id=NEW.original_sale_item_id AND sale.variant_id=NEW.variant_id AND sale.unit_price=NEW.original_unit_price AND sale.line_total=NEW.original_paid_amount AND NEW.quantity<=sale.quantity AND NEW.refund_amount<=sale.line_total) THEN RAISE EXCEPTION 'invalid return item snapshot' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER customer_return_history BEFORE UPDATE ON customer_returns FOR EACH ROW EXECUTE FUNCTION customer_return_guard();
CREATE TRIGGER customer_return_item_insert BEFORE INSERT ON customer_return_items FOR EACH ROW EXECUTE FUNCTION customer_return_guard();
CREATE TRIGGER customer_return_item_immutable BEFORE UPDATE OR DELETE ON customer_return_items FOR EACH ROW EXECUTE FUNCTION pos_immutable();
CREATE FUNCTION customer_return_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE doc customer_returns; BEGIN
 SELECT * INTO doc FROM customer_returns WHERE organization_id=NEW.organization_id AND id=NEW.id;
 IF doc.status IN ('PENDING_APPROVAL','APPROVED','COMPLETED') AND (NOT EXISTS(SELECT 1 FROM customer_return_items WHERE organization_id=doc.organization_id AND return_id=doc.id) OR doc.amount<>(SELECT sum(refund_amount) FROM customer_return_items WHERE organization_id=doc.organization_id AND return_id=doc.id)) THEN RAISE EXCEPTION 'return amount mismatch' USING ERRCODE='23514'; END IF;
 IF doc.status='COMPLETED' AND (
  NOT EXISTS(SELECT 1 FROM customer_refunds WHERE organization_id=doc.organization_id AND return_id=doc.id AND amount=doc.amount)
  OR NOT EXISTS(SELECT 1 FROM inventory_operations WHERE organization_id=doc.organization_id AND id=doc.inventory_operation_id AND result IS NOT NULL)
  OR EXISTS(SELECT 1 FROM customer_return_items item JOIN sale_items sale ON sale.organization_id=item.organization_id AND sale.id=item.original_sale_item_id WHERE item.organization_id=doc.organization_id AND item.return_id=doc.id AND (
   (SELECT sum(prior.quantity) FROM customer_return_items prior JOIN customer_returns header ON header.organization_id=prior.organization_id AND header.id=prior.return_id WHERE prior.organization_id=item.organization_id AND prior.original_sale_item_id=item.original_sale_item_id AND header.status='COMPLETED')>sale.quantity
   OR (SELECT sum(prior.refund_amount) FROM customer_return_items prior JOIN customer_returns header ON header.organization_id=prior.organization_id AND header.id=prior.return_id WHERE prior.organization_id=item.organization_id AND prior.original_sale_item_id=item.original_sale_item_id AND header.status='COMPLETED')>sale.line_total
   OR (item.disposition<>'NO_STOCK_RETURN' AND NOT EXISTS(SELECT 1 FROM stock_movements WHERE organization_id=item.organization_id AND customer_return_item_id=item.id AND variant_id=item.variant_id AND location_id=item.destination_location_id AND quantity_delta=item.quantity AND operation_id=doc.inventory_operation_id))
   OR (item.disposition='NO_STOCK_RETURN' AND EXISTS(SELECT 1 FROM stock_movements WHERE organization_id=item.organization_id AND customer_return_item_id=item.id))
  ))) THEN RAISE EXCEPTION 'return posting mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER customer_return_consistency AFTER UPDATE ON customer_returns DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION customer_return_consistency();
CREATE FUNCTION customer_return_movement_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM customer_return_items item JOIN customer_returns doc ON doc.organization_id=item.organization_id AND doc.id=item.return_id JOIN stock_locations location ON location.organization_id=item.organization_id AND location.id=item.destination_location_id WHERE item.organization_id=NEW.organization_id AND item.id=NEW.customer_return_item_id AND doc.status='APPROVED' AND NEW.quantity_delta=item.quantity AND NEW.variant_id=item.variant_id AND NEW.branch_id=item.branch_id AND NEW.location_id=item.destination_location_id AND ((item.disposition='RESTOCK_SELLABLE' AND location.type IN ('WAREHOUSE','SHELF','SALES_FLOOR')) OR (item.disposition='QUARANTINE' AND location.type='QUARANTINE') OR (item.disposition='DAMAGED' AND location.type='DAMAGED'))) THEN RAISE EXCEPTION 'invalid returned stock disposition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_return_movement BEFORE INSERT ON stock_movements FOR EACH ROW WHEN (NEW.customer_return_item_id IS NOT NULL) EXECUTE FUNCTION customer_return_movement_guard();
CREATE FUNCTION refund_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING_SETTLEMENT' OR NOT EXISTS(SELECT 1 FROM customer_returns WHERE organization_id=NEW.organization_id AND id=NEW.return_id AND status='APPROVED' AND amount=NEW.amount) THEN RAISE EXCEPTION 'invalid refund source' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.status='CONFIRMED' OR (to_jsonb(NEW)-ARRAY['method','status','reference','settlement_note','shift_id','reported_by','reported_at','confirmed_by','confirmed_at','revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['method','status','reference','settlement_note','shift_id','reported_by','reported_at','confirmed_by','confirmed_at','revision'])
  OR (OLD.reported_at IS NOT NULL AND ROW(NEW.method,NEW.reference,NEW.shift_id,NEW.reported_by,NEW.reported_at) IS DISTINCT FROM ROW(OLD.method,OLD.reference,OLD.shift_id,OLD.reported_by,OLD.reported_at))
  OR NOT ((OLD.status='PENDING_SETTLEMENT' AND NEW.status='SETTLEMENT_REPORTED') OR (OLD.status IN ('SETTLEMENT_REPORTED','RECONCILIATION_REQUIRED') AND NEW.status IN ('CONFIRMED','RECONCILIATION_REQUIRED'))) THEN RAISE EXCEPTION 'immutable refund evidence' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER refund_history BEFORE INSERT OR UPDATE ON customer_refunds FOR EACH ROW EXECUTE FUNCTION refund_history_guard();
CREATE TRIGGER refund_event_immutable BEFORE UPDATE OR DELETE ON refund_settlement_events FOR EACH ROW EXECUTE FUNCTION pos_immutable();
CREATE TRIGGER cash_disbursement_immutable BEFORE UPDATE OR DELETE ON register_cash_disbursements FOR EACH ROW EXECUTE FUNCTION pos_immutable();
CREATE FUNCTION refund_cash_post() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.actor_id IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid OR NOT EXISTS(SELECT 1 FROM customer_refunds refund JOIN register_shifts shift ON shift.organization_id=refund.organization_id AND shift.id=refund.shift_id WHERE refund.organization_id=NEW.organization_id AND refund.id=NEW.refund_id AND refund.method='CASH_REFUND' AND refund.status IN ('SETTLEMENT_REPORTED','RECONCILIATION_REQUIRED') AND refund.shift_id=NEW.shift_id AND refund.amount=NEW.amount AND shift.branch_id=refund.branch_id AND shift.status='OPEN' AND shift.cashier_id=NEW.actor_id AND shift.expected_cash>=NEW.amount) THEN RAISE EXCEPTION 'invalid cash refund' USING ERRCODE='23514'; END IF;
 UPDATE register_shifts SET cash_refunds=cash_refunds+NEW.amount,expected_cash=expected_cash-NEW.amount WHERE organization_id=NEW.organization_id AND id=NEW.shift_id AND status='OPEN';
 RETURN NEW;
END $$;
CREATE TRIGGER refund_cash_post BEFORE INSERT ON register_cash_disbursements FOR EACH ROW EXECUTE FUNCTION refund_cash_post();
CREATE FUNCTION refund_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status='CONFIRMED' AND NEW.method='CASH_REFUND' AND NOT EXISTS(SELECT 1 FROM register_cash_disbursements WHERE organization_id=NEW.organization_id AND refund_id=NEW.id AND shift_id=NEW.shift_id AND amount=NEW.amount) THEN RAISE EXCEPTION 'cash refund missing accounting' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER refund_consistency AFTER UPDATE ON customer_refunds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION refund_consistency();
REVOKE ALL ON FUNCTION customer_return_guard(),customer_return_consistency(),customer_return_movement_guard(),refund_history_guard(),refund_cash_post(),refund_consistency() FROM PUBLIC;
CREATE FUNCTION business_posting_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='stock_movements' THEN
  IF NOT EXISTS(SELECT 1 FROM customer_return_items item JOIN customer_returns doc ON doc.organization_id=item.organization_id AND doc.id=item.return_id WHERE item.organization_id=NEW.organization_id AND item.id=NEW.customer_return_item_id AND doc.status='COMPLETED' AND doc.inventory_operation_id=NEW.operation_id) THEN RAISE EXCEPTION 'unfinished return movement' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='register_cash_disbursements' THEN
  IF NOT EXISTS(SELECT 1 FROM customer_refunds WHERE organization_id=NEW.organization_id AND id=NEW.refund_id AND status='CONFIRMED') THEN RAISE EXCEPTION 'unfinished cash refund' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='customer_refunds' THEN
  IF NOT EXISTS(SELECT 1 FROM customer_returns WHERE organization_id=NEW.organization_id AND id=NEW.return_id AND status='COMPLETED') THEN RAISE EXCEPTION 'unfinished return refund' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.cash_refunds<>COALESCE((SELECT sum(amount) FROM register_cash_disbursements WHERE organization_id=NEW.organization_id AND shift_id=NEW.id),0) OR (NEW.status='CLOSED' AND EXISTS(SELECT 1 FROM customer_refunds WHERE organization_id=NEW.organization_id AND shift_id=NEW.id AND status IN ('SETTLEMENT_REPORTED','RECONCILIATION_REQUIRED'))) THEN RAISE EXCEPTION 'cash refund accounting mismatch' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER business_return_movement AFTER INSERT ON stock_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.customer_return_item_id IS NOT NULL) EXECUTE FUNCTION business_posting_consistency();
CREATE CONSTRAINT TRIGGER business_cash_disbursement AFTER INSERT ON register_cash_disbursements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION business_posting_consistency();
CREATE CONSTRAINT TRIGGER business_refund_insert AFTER INSERT ON customer_refunds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION business_posting_consistency();
CREATE CONSTRAINT TRIGGER business_shift_accounting AFTER UPDATE ON register_shifts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION business_posting_consistency();
REVOKE ALL ON FUNCTION business_posting_consistency() FROM PUBLIC;
COMMIT;
