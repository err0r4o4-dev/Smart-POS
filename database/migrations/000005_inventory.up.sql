BEGIN;
CREATE TABLE stock_locations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), branch_id uuid NOT NULL,
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,79}$'), name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 type text NOT NULL CHECK(type IN ('WAREHOUSE','SALES_FLOOR','SHELF','QUARANTINE','DAMAGED','IN_TRANSIT')),
 parent_location_id uuid, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')), description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),
 is_system boolean NOT NULL DEFAULT false, revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES users(id), updated_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,branch_id,id), UNIQUE(organization_id,branch_id,code), CHECK(parent_location_id IS DISTINCT FROM id),
 CHECK((type='IN_TRANSIT')=is_system), FOREIGN KEY(organization_id,branch_id) REFERENCES branches(organization_id,id),
 FOREIGN KEY(organization_id,branch_id,parent_location_id) REFERENCES stock_locations(organization_id,branch_id,id)
);
CREATE INDEX stock_location_list_idx ON stock_locations(organization_id,branch_id,status,type);
CREATE TABLE inventory_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), actor_id uuid NOT NULL REFERENCES users(id),
 operation text NOT NULL, idempotency_key uuid NOT NULL, fingerprint text NOT NULL CHECK(length(fingerprint)=64), result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,id), UNIQUE(organization_id,actor_id,operation,idempotency_key)
);
CREATE TABLE inventory_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 kind text NOT NULL CHECK(kind IN ('ADJUSTMENT','COUNT','TRANSFER')), status text NOT NULL,
 branch_id uuid NOT NULL, location_id uuid NOT NULL, destination_branch_id uuid, destination_location_id uuid, transit_location_id uuid,
 adjustment_type text CHECK(adjustment_type IN ('INCREASE','DECREASE','CORRECTION')),
 reason_code text NOT NULL CHECK(length(btrim(reason_code)) BETWEEN 1 AND 100), notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 assigned_to uuid REFERENCES users(id), created_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id), posted_by uuid REFERENCES users(id), dispatched_by uuid REFERENCES users(id), received_by uuid REFERENCES users(id),
 snapshot_at timestamptz, approved_at timestamptz, posted_at timestamptz, dispatched_at timestamptz, received_at timestamptz,
 revision bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,branch_id,location_id) REFERENCES stock_locations(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,destination_branch_id,destination_location_id) REFERENCES stock_locations(organization_id,branch_id,id),
 FOREIGN KEY(organization_id,branch_id,transit_location_id) REFERENCES stock_locations(organization_id,branch_id,id),
 CHECK((kind='TRANSFER' AND destination_branch_id IS NOT NULL AND destination_location_id IS NOT NULL AND destination_location_id<>location_id AND adjustment_type IS NULL) OR (kind<>'TRANSFER' AND destination_branch_id IS NULL AND destination_location_id IS NULL AND transit_location_id IS NULL)),
 CHECK((kind='ADJUSTMENT' AND adjustment_type IS NOT NULL AND status IN ('DRAFT','PENDING_APPROVAL','APPROVED','POSTED','REJECTED','CANCELLED')) OR (kind='COUNT' AND adjustment_type IS NULL AND status IN ('IN_PROGRESS','SUBMITTED','APPROVED','POSTED','CANCELLED')) OR (kind='TRANSFER' AND status IN ('DRAFT','PENDING_APPROVAL','APPROVED','DISPATCHED','RECEIVED','CANCELLED')))
);
CREATE INDEX inventory_document_list_idx ON inventory_documents(organization_id,kind,branch_id,status,created_at DESC);
CREATE INDEX inventory_document_destination_idx ON inventory_documents(organization_id,destination_branch_id,kind);
CREATE TABLE inventory_document_items (
 organization_id uuid NOT NULL, document_id uuid NOT NULL, variant_id uuid NOT NULL,
 quantity numeric(18,3) NOT NULL CHECK(quantity>=0), expected_quantity numeric(18,3) CHECK(expected_quantity>=0), balance_version bigint,
 counted_quantity numeric(18,3) CHECK(counted_quantity>=0), counted_by uuid REFERENCES users(id), counted_at timestamptz,
 PRIMARY KEY(organization_id,document_id,variant_id), FOREIGN KEY(organization_id,document_id) REFERENCES inventory_documents(organization_id,id),
 FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id)
);
CREATE TABLE stock_balances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, branch_id uuid NOT NULL, location_id uuid NOT NULL, variant_id uuid NOT NULL,
 quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK(quantity>=0), version bigint NOT NULL DEFAULT 0 CHECK(version>=0), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,location_id,variant_id), UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,branch_id,location_id) REFERENCES stock_locations(organization_id,branch_id,id), FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id)
);
CREATE INDEX stock_balance_branch_idx ON stock_balances(organization_id,branch_id,variant_id);
CREATE TABLE stock_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, branch_id uuid NOT NULL, location_id uuid NOT NULL, variant_id uuid NOT NULL,
 movement_type text NOT NULL CHECK(movement_type IN ('OPENING_BALANCE','ADJUSTMENT_IN','ADJUSTMENT_OUT','COUNT_CORRECTION','TRANSFER_IN','TRANSFER_OUT','TRANSFER_DISPATCH','TRANSFER_RECEIVE')),
 quantity_delta numeric(18,3) NOT NULL CHECK(quantity_delta<>0), quantity_before numeric(18,3) NOT NULL CHECK(quantity_before>=0), quantity_after numeric(18,3) NOT NULL CHECK(quantity_after>=0),
 operation_id uuid NOT NULL, document_id uuid, reason_code text NOT NULL CHECK(length(btrim(reason_code)) BETWEEN 1 AND 100), performed_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), CHECK(quantity_after=quantity_before+quantity_delta), UNIQUE(organization_id,operation_id,location_id,variant_id),
 FOREIGN KEY(organization_id,branch_id,location_id) REFERENCES stock_locations(organization_id,branch_id,id), FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id),
 FOREIGN KEY(organization_id,operation_id) REFERENCES inventory_operations(organization_id,id), FOREIGN KEY(organization_id,document_id) REFERENCES inventory_documents(organization_id,id)
);
CREATE INDEX stock_movement_identity_idx ON stock_movements(organization_id,location_id,variant_id,created_at,id);
CREATE INDEX stock_movement_branch_idx ON stock_movements(organization_id,branch_id,created_at DESC);
CREATE UNIQUE INDEX stock_opening_unique ON stock_movements(organization_id,location_id,variant_id) WHERE movement_type='OPENING_BALANCE';
CREATE TABLE inventory_reorder_points (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, branch_id uuid NOT NULL, variant_id uuid NOT NULL,
 minimum_quantity numeric(18,3) NOT NULL CHECK(minimum_quantity>=0), target_quantity numeric(18,3) NOT NULL CHECK(target_quantity>=minimum_quantity),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')), updated_by uuid NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,branch_id,variant_id), FOREIGN KEY(organization_id,branch_id) REFERENCES branches(organization_id,id), FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id)
);
CREATE FUNCTION inventory_apply_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previous numeric(18,3); location_status text; unit_type text;
BEGIN
 IF NEW.organization_id IS DISTINCT FROM nullif(current_setting('app.organization_id',true),'')::uuid OR NEW.performed_by IS DISTINCT FROM nullif(current_setting('app.user_id',true),'')::uuid THEN RAISE EXCEPTION 'inventory context mismatch' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_operations WHERE organization_id=NEW.organization_id AND id=NEW.operation_id AND actor_id=NEW.performed_by AND result IS NULL) THEN RAISE EXCEPTION 'invalid inventory operation' USING ERRCODE='23514'; END IF;
 SELECT status INTO location_status FROM public.stock_locations WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id AND id=NEW.location_id;
 IF location_status IS DISTINCT FROM 'ACTIVE' THEN RAISE EXCEPTION 'inactive stock location' USING ERRCODE='23514'; END IF;
 SELECT unit.unit_type INTO unit_type FROM public.product_variants variant JOIN public.units unit ON unit.organization_id=variant.organization_id AND unit.id=variant.unit_id WHERE variant.organization_id=NEW.organization_id AND variant.id=NEW.variant_id;
 IF unit_type IS NULL OR (unit_type IN ('COUNT','PACKAGING') AND NEW.quantity_delta<>trunc(NEW.quantity_delta)) THEN RAISE EXCEPTION 'invalid unit precision' USING ERRCODE='23514'; END IF;
 IF NEW.movement_type='OPENING_BALANCE' AND (NEW.quantity_delta<=0 OR EXISTS(SELECT 1 FROM public.stock_movements WHERE organization_id=NEW.organization_id AND location_id=NEW.location_id AND variant_id=NEW.variant_id)) THEN RAISE EXCEPTION 'opening history exists' USING ERRCODE='23514'; END IF;
 INSERT INTO public.stock_balances(organization_id,branch_id,location_id,variant_id) VALUES(NEW.organization_id,NEW.branch_id,NEW.location_id,NEW.variant_id) ON CONFLICT(organization_id,location_id,variant_id) DO NOTHING;
 SELECT quantity INTO previous FROM public.stock_balances WHERE organization_id=NEW.organization_id AND location_id=NEW.location_id AND variant_id=NEW.variant_id FOR UPDATE;
 NEW.quantity_before:=previous; NEW.quantity_after:=previous+NEW.quantity_delta;
 IF NEW.quantity_after<0 THEN RAISE EXCEPTION 'insufficient stock' USING ERRCODE='23514'; END IF;
 UPDATE public.stock_balances SET quantity=NEW.quantity_after,version=version+1,updated_at=now() WHERE organization_id=NEW.organization_id AND location_id=NEW.location_id AND variant_id=NEW.variant_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION inventory_apply_movement() FROM PUBLIC;
CREATE TRIGGER inventory_post BEFORE INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION inventory_apply_movement();
CREATE FUNCTION inventory_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable inventory ledger' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION inventory_immutable() FROM PUBLIC;
CREATE TRIGGER inventory_no_rewrite BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
CREATE FUNCTION inventory_catalog_unit_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.unit_id<>OLD.unit_id AND EXISTS(SELECT 1 FROM stock_movements WHERE organization_id=OLD.organization_id AND variant_id=OLD.id) THEN RAISE EXCEPTION 'stock history reserves unit' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION inventory_catalog_unit_guard() FROM PUBLIC;
CREATE TRIGGER inventory_variant_unit BEFORE UPDATE OF unit_id ON product_variants FOR EACH ROW EXECUTE FUNCTION inventory_catalog_unit_guard();
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['stock_locations','inventory_operations','inventory_documents','inventory_document_items','stock_balances','stock_movements','inventory_reorder_points'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY inventory_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON stock_locations,inventory_operations,inventory_documents,inventory_document_items,inventory_reorder_points TO smartpos_runtime;
GRANT SELECT,INSERT ON stock_movements TO smartpos_runtime;
GRANT SELECT ON stock_balances TO smartpos_runtime;
COMMIT;
