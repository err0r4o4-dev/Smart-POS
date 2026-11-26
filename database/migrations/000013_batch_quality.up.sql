BEGIN;
CREATE TABLE product_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), variant_id uuid NOT NULL,
 lot_number text NOT NULL CHECK(length(btrim(lot_number)) BETWEEN 1 AND 100), manufactured_on date, expires_on date,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','QUARANTINED')),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES users(id), updated_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,variant_id,id), UNIQUE(organization_id,variant_id,lot_number),
 FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id),
 CHECK(manufactured_on IS NULL OR expires_on IS NULL OR manufactured_on<=expires_on)
);
CREATE INDEX quality_batch_expiry_idx ON product_batches(organization_id,expires_on,id);
CREATE TABLE quality_recalls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), variant_id uuid NOT NULL, batch_id uuid,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000), created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id),
 FOREIGN KEY(organization_id,variant_id,batch_id) REFERENCES product_batches(organization_id,variant_id,id)
);
CREATE INDEX quality_recall_scope_idx ON quality_recalls(organization_id,variant_id,batch_id);
CREATE TABLE quality_stock_balances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, branch_id uuid NOT NULL, location_id uuid NOT NULL, variant_id uuid NOT NULL, batch_id uuid,
 quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK(quantity>=0), version bigint NOT NULL DEFAULT 0 CHECK(version>=0), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE NULLS NOT DISTINCT(organization_id,location_id,variant_id,batch_id),
 FOREIGN KEY(organization_id,branch_id,location_id) REFERENCES stock_locations(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id),
 FOREIGN KEY(organization_id,variant_id,batch_id) REFERENCES product_batches(organization_id,variant_id,id)
);
INSERT INTO quality_stock_balances(organization_id,branch_id,location_id,variant_id,quantity,version)
 SELECT organization_id,branch_id,location_id,variant_id,quantity,version FROM stock_balances;
ALTER TABLE stock_movements ADD COLUMN batch_id uuid,
 ADD FOREIGN KEY(organization_id,variant_id,batch_id) REFERENCES product_batches(organization_id,variant_id,id);
CREATE INDEX quality_movement_batch_idx ON stock_movements(organization_id,batch_id,created_at,id);
ALTER TABLE inventory_document_items ADD COLUMN batch_id uuid,
 ADD FOREIGN KEY(organization_id,variant_id,batch_id) REFERENCES product_batches(organization_id,variant_id,id);
ALTER TABLE purchasing_items ADD COLUMN batch_id uuid,
 ADD FOREIGN KEY(organization_id,variant_id,batch_id) REFERENCES product_batches(organization_id,variant_id,id);
ALTER TABLE pos_cart_items ADD COLUMN batch_id uuid,
 ADD FOREIGN KEY(organization_id,variant_id,batch_id) REFERENCES product_batches(organization_id,variant_id,id);
ALTER TABLE sale_items ADD COLUMN batch_id uuid,
 ADD FOREIGN KEY(organization_id,variant_id,batch_id) REFERENCES product_batches(organization_id,variant_id,id);
ALTER TABLE customer_return_items ADD COLUMN batch_id uuid,
 ADD FOREIGN KEY(organization_id,variant_id,batch_id) REFERENCES product_batches(organization_id,variant_id,id);
ALTER TABLE replenishment_tasks ADD COLUMN batch_id uuid,
 ADD FOREIGN KEY(organization_id,batch_id) REFERENCES product_batches(organization_id,id);
CREATE TABLE quality_write_offs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), branch_id uuid NOT NULL, location_id uuid NOT NULL, variant_id uuid NOT NULL, batch_id uuid,
 quantity numeric(18,3) NOT NULL CHECK(quantity>0), reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000),
 status text NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK(status IN ('PENDING_APPROVAL','APPROVED','POSTED','REJECTED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id), posted_by uuid REFERENCES users(id),
 operation_id uuid, created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz, posted_at timestamptz,
 UNIQUE(organization_id,id), FOREIGN KEY(organization_id,branch_id,location_id) REFERENCES stock_locations(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id),
 FOREIGN KEY(organization_id,variant_id,batch_id) REFERENCES product_batches(organization_id,variant_id,id),
 FOREIGN KEY(organization_id,operation_id) REFERENCES inventory_operations(organization_id,id),
 CHECK((status='POSTED')=(operation_id IS NOT NULL AND posted_by IS NOT NULL AND posted_at IS NOT NULL)),
 CHECK(status NOT IN ('APPROVED','POSTED') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX quality_write_off_list_idx ON quality_write_offs(organization_id,branch_id,status,created_at,id);
ALTER TABLE stock_movements ADD COLUMN quality_write_off_id uuid,
 ADD FOREIGN KEY(organization_id,quality_write_off_id) REFERENCES quality_write_offs(organization_id,id);
CREATE UNIQUE INDEX quality_write_off_post_idx ON stock_movements(organization_id,quality_write_off_id) WHERE quality_write_off_id IS NOT NULL;
CREATE FUNCTION quality_batch_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid OR NEW.updated_by IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid THEN RAISE EXCEPTION 'quality context mismatch' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.variant_id<>OLD.variant_id OR NEW.lot_number<>OLD.lot_number OR NEW.manufactured_on IS DISTINCT FROM OLD.manufactured_on OR NEW.expires_on IS DISTINCT FROM OLD.expires_on OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'batch identity immutable or stale revision' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER quality_batch_revision BEFORE INSERT OR UPDATE ON product_batches FOR EACH ROW EXECUTE FUNCTION quality_batch_guard();
CREATE FUNCTION quality_apply_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previous numeric(18,3); batch_status text; expiry date; target_type text; original_batch uuid;
BEGIN
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid OR NEW.performed_by IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid THEN RAISE EXCEPTION 'quality context mismatch' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 SELECT type INTO target_type FROM public.stock_locations WHERE organization_id=NEW.organization_id AND id=NEW.location_id;
 IF (NEW.movement_type='COUNT_CORRECTION' OR EXISTS(SELECT 1 FROM public.inventory_documents WHERE organization_id=NEW.organization_id AND id=NEW.document_id AND adjustment_type='CORRECTION')) AND EXISTS(SELECT 1 FROM public.quality_stock_balances WHERE organization_id=NEW.organization_id AND location_id=NEW.location_id AND variant_id=NEW.variant_id AND batch_id IS NOT NULL AND quantity>0) THEN RAISE EXCEPTION 'aggregate correction cannot overwrite tracked batches' USING ERRCODE='23514'; END IF;
 IF NEW.quantity_delta<0 AND NEW.movement_type IN ('TRANSFER_OUT','TRANSFER_DISPATCH','TRANSFER_RECEIVE') AND EXISTS(SELECT 1 FROM public.inventory_documents doc JOIN public.stock_locations source ON source.organization_id=doc.organization_id AND source.id=doc.location_id JOIN public.stock_locations destination ON destination.organization_id=doc.organization_id AND destination.id=doc.destination_location_id WHERE doc.organization_id=NEW.organization_id AND doc.id=NEW.document_id AND source.type IN ('DAMAGED','QUARANTINE') AND destination.type IN ('WAREHOUSE','SHELF','SALES_FLOOR')) THEN RAISE EXCEPTION 'non sellable source cannot be released by transfer' USING ERRCODE='23514'; END IF;
 IF NEW.batch_id IS NOT NULL THEN
  SELECT status,expires_on INTO batch_status,expiry FROM public.product_batches WHERE organization_id=NEW.organization_id AND variant_id=NEW.variant_id AND id=NEW.batch_id FOR SHARE;
  IF batch_status IS NULL THEN RAISE EXCEPTION 'foreign batch' USING ERRCODE='23503'; END IF;
 END IF;
 IF NEW.movement_type='SALE' OR (NEW.movement_type='SALE_RETURN' AND target_type IN ('WAREHOUSE','SALES_FLOOR','SHELF')) THEN
  IF (NEW.batch_id IS NOT NULL AND (batch_status<>'ACTIVE' OR expiry<= (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date)) OR EXISTS(SELECT 1 FROM public.quality_recalls WHERE organization_id=NEW.organization_id AND variant_id=NEW.variant_id AND (batch_id IS NULL OR batch_id=NEW.batch_id)) THEN RAISE EXCEPTION 'non sellable stock' USING ERRCODE='23514'; END IF;
  IF NEW.movement_type='SALE_RETURN' THEN
   SELECT sale.batch_id INTO original_batch FROM public.customer_return_items item JOIN public.sale_items sale ON sale.organization_id=item.organization_id AND sale.id=item.original_sale_item_id WHERE item.organization_id=NEW.organization_id AND item.id=NEW.customer_return_item_id;
   IF original_batch IS DISTINCT FROM NEW.batch_id THEN RAISE EXCEPTION 'return batch must be explicitly verified' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF NEW.quality_write_off_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.quality_write_offs WHERE organization_id=NEW.organization_id AND id=NEW.quality_write_off_id AND status='APPROVED' AND location_id=NEW.location_id AND variant_id=NEW.variant_id AND batch_id IS NOT DISTINCT FROM NEW.batch_id AND quantity=-NEW.quantity_delta AND NEW.movement_type='ADJUSTMENT_OUT') THEN RAISE EXCEPTION 'invalid approved write off' USING ERRCODE='23514'; END IF;
 IF NEW.movement_type='SUPPLIER_RETURN' AND NOT EXISTS(SELECT 1 FROM public.purchasing_items line JOIN public.purchasing_items original ON original.organization_id=line.organization_id AND original.id=line.parent_item_id WHERE line.organization_id=NEW.organization_id AND line.document_id=NEW.purchasing_document_id AND line.variant_id=NEW.variant_id AND original.batch_id IS NOT DISTINCT FROM NEW.batch_id AND line.batch_id IS NOT DISTINCT FROM NEW.batch_id) THEN RAISE EXCEPTION 'supplier return must match receipt batch' USING ERRCODE='23514'; END IF;
 IF NEW.movement_type='SALE_RETURN' AND NEW.batch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customer_return_items line JOIN public.sale_items original ON original.organization_id=line.organization_id AND original.id=line.original_sale_item_id WHERE line.organization_id=NEW.organization_id AND line.id=NEW.customer_return_item_id AND original.batch_id=NEW.batch_id) THEN RAISE EXCEPTION 'cannot invent returned lot identity' USING ERRCODE='23514'; END IF;
 INSERT INTO public.quality_stock_balances(organization_id,branch_id,location_id,variant_id,batch_id) VALUES(NEW.organization_id,NEW.branch_id,NEW.location_id,NEW.variant_id,NEW.batch_id) ON CONFLICT(organization_id,location_id,variant_id,batch_id) DO NOTHING;
 SELECT quantity INTO previous FROM public.quality_stock_balances WHERE organization_id=NEW.organization_id AND location_id=NEW.location_id AND variant_id=NEW.variant_id AND batch_id IS NOT DISTINCT FROM NEW.batch_id FOR UPDATE;
 IF previous+NEW.quantity_delta<0 THEN RAISE EXCEPTION 'insufficient selected batch or untracked stock' USING ERRCODE='23514'; END IF;
 UPDATE public.quality_stock_balances SET quantity=previous+NEW.quantity_delta,version=version+1,updated_at=now() WHERE organization_id=NEW.organization_id AND location_id=NEW.location_id AND variant_id=NEW.variant_id AND batch_id IS NOT DISTINCT FROM NEW.batch_id;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_quality BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION quality_apply_movement();
CREATE FUNCTION quality_reconcile_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF (SELECT quantity FROM public.stock_balances WHERE organization_id=NEW.organization_id AND location_id=NEW.location_id AND variant_id=NEW.variant_id) IS DISTINCT FROM (SELECT sum(quantity) FROM public.quality_stock_balances WHERE organization_id=NEW.organization_id AND location_id=NEW.location_id AND variant_id=NEW.variant_id) THEN RAISE EXCEPTION 'batch aggregate mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER quality_conservation AFTER INSERT ON stock_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION quality_reconcile_movement();
CREATE FUNCTION quality_write_off_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('POSTED','REJECTED') OR NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.branch_id<>OLD.branch_id OR NEW.location_id<>OLD.location_id OR NEW.variant_id<>OLD.variant_id OR NEW.batch_id IS DISTINCT FROM OLD.batch_id OR NEW.quantity<>OLD.quantity OR NEW.reason<>OLD.reason OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR (OLD.status='APPROVED' AND (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at)) OR NOT ((OLD.status='PENDING_APPROVAL' AND NEW.status IN ('APPROVED','REJECTED')) OR (OLD.status='APPROVED' AND NEW.status='POSTED')) THEN RAISE EXCEPTION 'invalid write off transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER quality_write_off_revision BEFORE UPDATE ON quality_write_offs FOR EACH ROW EXECUTE FUNCTION quality_write_off_guard();
CREATE TRIGGER quality_recall_immutable BEFORE UPDATE OR DELETE ON quality_recalls FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE FUNCTION quality_recall_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid OR NEW.created_by IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid THEN RAISE EXCEPTION 'recall context mismatch' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 RETURN NEW;
END $$;
CREATE TRIGGER quality_recall_activation BEFORE INSERT ON quality_recalls FOR EACH ROW EXECUTE FUNCTION quality_recall_guard();
CREATE FUNCTION quality_write_off_consistency() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.quality_write_offs doc WHERE doc.organization_id=NEW.organization_id AND doc.id=NEW.id AND doc.status='POSTED' AND NOT EXISTS(SELECT 1 FROM public.stock_movements movement WHERE movement.organization_id=doc.organization_id AND movement.quality_write_off_id=doc.id AND movement.operation_id=doc.operation_id AND movement.location_id=doc.location_id AND movement.variant_id=doc.variant_id AND movement.batch_id IS NOT DISTINCT FROM doc.batch_id AND movement.quantity_delta=-doc.quantity)) THEN RAISE EXCEPTION 'write off movement missing' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER quality_write_off_posted AFTER INSERT OR UPDATE ON quality_write_offs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION quality_write_off_consistency();
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['product_batches','quality_recalls','quality_stock_balances','quality_write_offs'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY quality_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION quality_batch_guard(),quality_apply_movement(),quality_reconcile_movement(),quality_write_off_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION quality_recall_guard(),quality_write_off_consistency() FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON product_batches,quality_write_offs TO smartpos_runtime;
GRANT SELECT,INSERT ON quality_recalls TO smartpos_runtime;
GRANT SELECT ON quality_stock_balances TO smartpos_runtime;
COMMIT;
