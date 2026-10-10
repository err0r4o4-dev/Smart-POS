BEGIN;
CREATE TABLE suppliers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,79}$'), name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 contact_person text NOT NULL DEFAULT '' CHECK(length(contact_person)<=200), email text NOT NULL DEFAULT '' CHECK(length(email)<=254), phone text NOT NULL DEFAULT '' CHECK(length(phone)<=80),
 address text NOT NULL DEFAULT '' CHECK(length(address)<=2000), tax_identifier text NOT NULL DEFAULT '' CHECK(length(tax_identifier)<=100), notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','ARCHIVED')), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES users(id), updated_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,code)
);
CREATE INDEX supplier_list_idx ON suppliers(organization_id,status,name);
CREATE TABLE supplier_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, supplier_id uuid NOT NULL, variant_id uuid NOT NULL, purchase_unit_id uuid NOT NULL,
 supplier_sku text NOT NULL DEFAULT '' CHECK(length(supplier_sku)<=100), unit_cost numeric(18,2) NOT NULL CHECK(unit_cost>=0),
 minimum_order_quantity numeric(18,3) NOT NULL DEFAULT 1 CHECK(minimum_order_quantity>0), order_multiple numeric(18,3) NOT NULL DEFAULT 1 CHECK(order_multiple>0),
 lead_time_days integer NOT NULL DEFAULT 0 CHECK(lead_time_days BETWEEN 0 AND 3650), is_preferred boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,supplier_id,variant_id),
 FOREIGN KEY(organization_id,supplier_id) REFERENCES suppliers(organization_id,id), FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id), FOREIGN KEY(organization_id,purchase_unit_id) REFERENCES units(organization_id,id)
);
CREATE UNIQUE INDEX preferred_supplier_idx ON supplier_products(organization_id,variant_id) WHERE is_preferred AND status='ACTIVE';
CREATE TABLE purchasing_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, branch_id uuid NOT NULL, supplier_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('ORDER','RECEIPT','RETURN')), number text NOT NULL DEFAULT gen_random_uuid()::text, status text NOT NULL DEFAULT 'DRAFT',
 parent_id uuid, location_id uuid, supplier_snapshot jsonb NOT NULL, currency text NOT NULL CHECK(currency='THB'), expected_delivery_date date,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000), total numeric(18,2) NOT NULL DEFAULT 0 CHECK(total>=0), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 inventory_operation_id uuid, created_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id), posted_by uuid REFERENCES users(id), issued_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz, issued_at timestamptz, posted_at timestamptz,
 UNIQUE(organization_id,id), UNIQUE(organization_id,branch_id,supplier_id,id), UNIQUE(organization_id,number),
 FOREIGN KEY(organization_id,branch_id) REFERENCES branches(organization_id,id), FOREIGN KEY(organization_id,supplier_id) REFERENCES suppliers(organization_id,id),
 FOREIGN KEY(organization_id,branch_id,supplier_id,parent_id) REFERENCES purchasing_documents(organization_id,branch_id,supplier_id,id),
 FOREIGN KEY(organization_id,branch_id,location_id) REFERENCES stock_locations(organization_id,branch_id,id), FOREIGN KEY(organization_id,inventory_operation_id) REFERENCES inventory_operations(organization_id,id),
 CHECK((kind='ORDER' AND parent_id IS NULL AND location_id IS NULL AND status IN ('DRAFT','PENDING_APPROVAL','APPROVED','ORDERED','PARTIALLY_RECEIVED','RECEIVED','CLOSED','REJECTED','CANCELLED')) OR
       (kind='RECEIPT' AND parent_id IS NOT NULL AND location_id IS NOT NULL AND status IN ('DRAFT','PENDING_REVIEW','APPROVED','POSTED','REJECTED','CANCELLED')) OR
       (kind='RETURN' AND parent_id IS NOT NULL AND location_id IS NOT NULL AND status IN ('DRAFT','PENDING_APPROVAL','APPROVED','DISPATCHED','REJECTED','CANCELLED'))),
 CHECK((status IN ('POSTED','DISPATCHED'))=(inventory_operation_id IS NOT NULL))
);
CREATE INDEX purchasing_list_idx ON purchasing_documents(organization_id,kind,branch_id,status,created_at DESC);
CREATE INDEX purchasing_parent_idx ON purchasing_documents(organization_id,parent_id,kind,status);
CREATE TABLE purchasing_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, document_id uuid NOT NULL, variant_id uuid NOT NULL, parent_item_id uuid,
 name_snapshot text NOT NULL, sku_snapshot text NOT NULL, purchase_unit_id uuid NOT NULL, inventory_unit_id uuid NOT NULL, unit_snapshot text NOT NULL,
 conversion_factor numeric(18,6) NOT NULL CHECK(conversion_factor>0), quantity numeric(18,3) NOT NULL CHECK(quantity>0), base_quantity numeric(18,3) NOT NULL CHECK(base_quantity>0),
 unit_cost numeric(18,2) NOT NULL CHECK(unit_cost>=0), line_total numeric(18,2) NOT NULL CHECK(line_total>=0), accepted_quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK(accepted_quantity>=0 AND accepted_quantity<=quantity),
 delivered_quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK(delivered_quantity>=0), rejected_quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK(rejected_quantity>=0), damaged_quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK(damaged_quantity>=0),
 reason text NOT NULL DEFAULT '' CHECK(length(reason)<=2000),
 UNIQUE(organization_id,id), UNIQUE(organization_id,document_id,variant_id),
 FOREIGN KEY(organization_id,document_id) REFERENCES purchasing_documents(organization_id,id), FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id),
 FOREIGN KEY(organization_id,purchase_unit_id) REFERENCES units(organization_id,id), FOREIGN KEY(organization_id,inventory_unit_id) REFERENCES units(organization_id,id), FOREIGN KEY(organization_id,parent_item_id) REFERENCES purchasing_items(organization_id,id),
 CHECK(base_quantity=quantity*conversion_factor), CHECK(damaged_quantity<=rejected_quantity)
);
CREATE TABLE purchasing_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, document_id uuid NOT NULL, action text NOT NULL, revision bigint NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL DEFAULT '' CHECK(length(reason)<=2000), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,document_id) REFERENCES purchasing_documents(organization_id,id)
);
CREATE INDEX purchasing_event_idx ON purchasing_events(organization_id,document_id,created_at);
CREATE TABLE shelves (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, branch_id uuid NOT NULL, stock_location_id uuid NOT NULL,
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,79}$'), name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200), zone text NOT NULL DEFAULT '' CHECK(length(zone)<=200),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=2000), status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','ARCHIVED')), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES users(id), updated_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,branch_id,id), UNIQUE(organization_id,stock_location_id), UNIQUE(organization_id,branch_id,code),
 FOREIGN KEY(organization_id,branch_id,stock_location_id) REFERENCES stock_locations(organization_id,branch_id,id)
);
CREATE INDEX shelf_list_idx ON shelves(organization_id,branch_id,status,zone);
CREATE TABLE shelf_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, shelf_id uuid NOT NULL,
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,79}$'), position integer NOT NULL CHECK(position BETWEEN 0 AND 10000),
 UNIQUE(organization_id,id), UNIQUE(organization_id,shelf_id,id), UNIQUE(organization_id,shelf_id,code),
 FOREIGN KEY(organization_id,shelf_id) REFERENCES shelves(organization_id,id)
);
CREATE TABLE shelf_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, shelf_id uuid NOT NULL, slot_id uuid NOT NULL, variant_id uuid NOT NULL,
 minimum_quantity numeric(18,3) NOT NULL CHECK(minimum_quantity>=0), target_quantity numeric(18,3) NOT NULL CHECK(target_quantity>=minimum_quantity), capacity_quantity numeric(18,3) NOT NULL CHECK(capacity_quantity>=target_quantity AND capacity_quantity>0),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 UNIQUE(organization_id,id), UNIQUE(organization_id,shelf_id,id), UNIQUE(organization_id,shelf_id,variant_id), UNIQUE(organization_id,slot_id),
 FOREIGN KEY(organization_id,shelf_id,slot_id) REFERENCES shelf_slots(organization_id,shelf_id,id), FOREIGN KEY(organization_id,variant_id) REFERENCES product_variants(organization_id,id)
);
CREATE TABLE replenishment_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, branch_id uuid NOT NULL, shelf_id uuid NOT NULL, assignment_id uuid NOT NULL,
 source_location_id uuid NOT NULL, quantity numeric(18,3) NOT NULL CHECK(quantity>0), status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED')),
 assigned_to uuid REFERENCES users(id), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), created_by uuid NOT NULL REFERENCES users(id), completed_by uuid REFERENCES users(id),
 transfer_id uuid, inventory_operation_id uuid, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(organization_id,id), UNIQUE(organization_id,transfer_id),
 FOREIGN KEY(organization_id,branch_id,shelf_id) REFERENCES shelves(organization_id,branch_id,id), FOREIGN KEY(organization_id,shelf_id,assignment_id) REFERENCES shelf_assignments(organization_id,shelf_id,id),
 FOREIGN KEY(organization_id,branch_id,source_location_id) REFERENCES stock_locations(organization_id,branch_id,id), FOREIGN KEY(organization_id,transfer_id) REFERENCES inventory_documents(organization_id,id),
 FOREIGN KEY(organization_id,inventory_operation_id) REFERENCES inventory_operations(organization_id,id),
 CHECK((status='COMPLETED')=(transfer_id IS NOT NULL AND inventory_operation_id IS NOT NULL AND completed_by IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE INDEX replenishment_list_idx ON replenishment_tasks(organization_id,branch_id,status,created_at DESC);
CREATE UNIQUE INDEX replenishment_open_idx ON replenishment_tasks(organization_id,assignment_id) WHERE status IN ('OPEN','ASSIGNED','IN_PROGRESS');
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check CHECK(movement_type IN ('OPENING_BALANCE','ADJUSTMENT_IN','ADJUSTMENT_OUT','COUNT_CORRECTION','TRANSFER_IN','TRANSFER_OUT','TRANSFER_DISPATCH','TRANSFER_RECEIVE','SALE','PURCHASE_RECEIVE','SUPPLIER_RETURN'));
ALTER TABLE stock_movements ADD COLUMN purchasing_document_id uuid;
ALTER TABLE stock_movements ADD FOREIGN KEY(organization_id,purchasing_document_id) REFERENCES purchasing_documents(organization_id,id);
ALTER TABLE stock_movements ADD CHECK((movement_type IN ('PURCHASE_RECEIVE','SUPPLIER_RETURN'))=(purchasing_document_id IS NOT NULL));
ALTER TABLE stock_movements ADD CHECK(purchasing_document_id IS NULL OR (sale_id IS NULL AND document_id IS NULL));
CREATE INDEX purchasing_movement_idx ON stock_movements(organization_id,purchasing_document_id) WHERE purchasing_document_id IS NOT NULL;
CREATE FUNCTION purchasing_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status IN ('POSTED','DISPATCHED','CLOSED','CANCELLED','REJECTED') THEN RAISE EXCEPTION 'immutable purchasing document' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER purchasing_no_rewrite BEFORE UPDATE OR DELETE ON purchasing_documents FOR EACH ROW EXECUTE FUNCTION purchasing_immutable();
CREATE FUNCTION purchasing_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE document purchasing_documents; BEGIN
 SELECT * INTO document FROM purchasing_documents WHERE organization_id=OLD.organization_id AND id=OLD.document_id;
 IF document.status<>'DRAFT' AND NOT (TG_OP='UPDATE' AND document.kind='ORDER' AND (to_jsonb(OLD)-'accepted_quantity')=(to_jsonb(NEW)-'accepted_quantity')) THEN RAISE EXCEPTION 'immutable purchasing terms' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER purchasing_item_no_rewrite BEFORE UPDATE OR DELETE ON purchasing_items FOR EACH ROW EXECUTE FUNCTION purchasing_item_guard();
CREATE FUNCTION purchasing_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE document purchasing_documents; BEGIN
 IF TG_TABLE_NAME='stock_movements' THEN
  IF NEW.purchasing_document_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO document FROM purchasing_documents WHERE organization_id=NEW.organization_id AND id=NEW.purchasing_document_id;
 ELSE SELECT * INTO document FROM purchasing_documents WHERE organization_id=NEW.organization_id AND id=NEW.id; END IF;
 IF document.status IN ('POSTED','DISPATCHED') THEN
  IF NOT EXISTS(SELECT 1 FROM purchasing_items WHERE organization_id=document.organization_id AND document_id=document.id) OR
   EXISTS(SELECT 1 FROM purchasing_items item WHERE item.organization_id=document.organization_id AND item.document_id=document.id AND NOT EXISTS(
    SELECT 1 FROM stock_movements movement WHERE movement.organization_id=document.organization_id AND movement.purchasing_document_id=document.id AND movement.operation_id=document.inventory_operation_id
     AND movement.location_id=document.location_id AND movement.branch_id=document.branch_id AND movement.variant_id=item.variant_id
     AND movement.movement_type=CASE document.kind WHEN 'RECEIPT' THEN 'PURCHASE_RECEIVE' ELSE 'SUPPLIER_RETURN' END
     AND movement.quantity_delta=CASE document.kind WHEN 'RECEIPT' THEN item.base_quantity ELSE -item.base_quantity END)) OR
   (SELECT count(*) FROM purchasing_items WHERE organization_id=document.organization_id AND document_id=document.id)<>(SELECT count(*) FROM stock_movements WHERE organization_id=document.organization_id AND purchasing_document_id=document.id)
  THEN RAISE EXCEPTION 'purchasing inventory mismatch' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='stock_movements' THEN RAISE EXCEPTION 'unposted purchasing movement' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER purchasing_inventory_consistency AFTER INSERT OR UPDATE ON purchasing_documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION purchasing_consistency();
CREATE CONSTRAINT TRIGGER inventory_purchasing_consistency AFTER INSERT ON stock_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION purchasing_consistency();
CREATE FUNCTION replenishment_consistency() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status='COMPLETED' AND NOT EXISTS(SELECT 1 FROM inventory_documents transfer JOIN inventory_document_items item ON item.organization_id=transfer.organization_id AND item.document_id=transfer.id
   JOIN shelves shelf ON shelf.organization_id=NEW.organization_id AND shelf.id=NEW.shelf_id JOIN shelf_assignments assignment ON assignment.organization_id=NEW.organization_id AND assignment.id=NEW.assignment_id
   WHERE transfer.organization_id=NEW.organization_id AND transfer.id=NEW.transfer_id AND transfer.kind='TRANSFER' AND transfer.status='RECEIVED' AND transfer.branch_id=NEW.branch_id AND transfer.destination_branch_id=NEW.branch_id
    AND transfer.location_id=NEW.source_location_id AND transfer.destination_location_id=shelf.stock_location_id AND item.variant_id=assignment.variant_id AND item.quantity=NEW.quantity
    AND EXISTS(SELECT 1 FROM stock_movements WHERE organization_id=NEW.organization_id AND document_id=transfer.id AND operation_id=NEW.inventory_operation_id AND location_id=transfer.location_id AND variant_id=item.variant_id AND movement_type='TRANSFER_OUT' AND quantity_delta=-item.quantity)
    AND EXISTS(SELECT 1 FROM stock_movements WHERE organization_id=NEW.organization_id AND document_id=transfer.id AND operation_id=NEW.inventory_operation_id AND location_id=transfer.destination_location_id AND variant_id=item.variant_id AND movement_type='TRANSFER_IN' AND quantity_delta=item.quantity))
 THEN RAISE EXCEPTION 'replenishment transfer mismatch' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND OLD.status IN ('COMPLETED','CANCELLED') THEN RAISE EXCEPTION 'immutable replenishment' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER replenishment_guard BEFORE UPDATE ON replenishment_tasks FOR EACH ROW EXECUTE FUNCTION replenishment_consistency();
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['suppliers','supplier_products','purchasing_documents','purchasing_items','purchasing_events','shelves','shelf_slots','shelf_assignments','replenishment_tasks'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY purchasing_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION purchasing_immutable(),purchasing_item_guard(),purchasing_consistency(),replenishment_consistency() FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON suppliers,supplier_products,purchasing_documents,shelves,shelf_slots,shelf_assignments,replenishment_tasks TO smartpos_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON purchasing_items TO smartpos_runtime;
GRANT SELECT,INSERT ON purchasing_events TO smartpos_runtime;
COMMIT;
