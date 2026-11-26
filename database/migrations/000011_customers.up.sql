BEGIN;
CREATE TABLE customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'), name text NOT NULL DEFAULT '' CHECK(length(name)<=200),
 phone text NOT NULL DEFAULT '' CHECK(phone='' OR phone ~ '^\+?[0-9]{6,20}$'), email text NOT NULL DEFAULT '' CHECK(length(email)<=254 AND email=lower(email)),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000), marketing_consent boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES users(id), create_key uuid NOT NULL, create_fingerprint text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,code), UNIQUE(organization_id,created_by,create_key)
);
CREATE UNIQUE INDEX customer_phone_unique ON customers(organization_id,phone) WHERE phone<>'';
CREATE UNIQUE INDEX customer_email_unique ON customers(organization_id,email) WHERE email<>'';
CREATE INDEX customer_search_code ON customers(organization_id,code text_pattern_ops);
CREATE INDEX customer_search_name ON customers(organization_id,lower(name) text_pattern_ops);
CREATE INDEX customer_list ON customers(organization_id,status,created_at DESC,id);
CREATE TABLE customer_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'), name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')), revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES users(id), create_key uuid, create_fingerprint text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,code), UNIQUE(organization_id,created_by,create_key)
);
CREATE INDEX customer_group_list ON customer_groups(organization_id,status,created_at DESC,id);
CREATE TABLE customer_group_memberships (
 organization_id uuid NOT NULL, customer_id uuid NOT NULL, group_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,customer_id,group_id),
 FOREIGN KEY(organization_id,customer_id) REFERENCES customers(organization_id,id),
 FOREIGN KEY(organization_id,group_id) REFERENCES customer_groups(organization_id,id)
);
CREATE INDEX customer_group_members ON customer_group_memberships(organization_id,group_id,customer_id);
ALTER TABLE pos_carts ADD COLUMN customer_id uuid, ADD CONSTRAINT cart_customer_fk FOREIGN KEY(organization_id,customer_id) REFERENCES customers(organization_id,id);
ALTER TABLE pos_checkouts ADD COLUMN customer_id uuid, ADD COLUMN customer_code_snapshot text NOT NULL DEFAULT '', ADD CONSTRAINT checkout_customer_fk FOREIGN KEY(organization_id,customer_id) REFERENCES customers(organization_id,id), ADD CHECK((customer_id IS NULL)=(customer_code_snapshot=''));
ALTER TABLE sales ADD COLUMN customer_id uuid, ADD COLUMN customer_code_snapshot text NOT NULL DEFAULT '', ADD CONSTRAINT sale_customer_fk FOREIGN KEY(organization_id,customer_id) REFERENCES customers(organization_id,id), ADD CHECK((customer_id IS NULL)=(customer_code_snapshot=''));
CREATE INDEX sale_customer_history ON sales(organization_id,customer_id,completed_at DESC,id) WHERE customer_id IS NOT NULL;
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['customers','customer_groups','customer_group_memberships'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY customer_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON customers,customer_groups TO smartpos_runtime;
GRANT SELECT,INSERT,DELETE ON customer_group_memberships TO smartpos_runtime;
CREATE FUNCTION customer_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='ARCHIVED' OR NEW.organization_id<>OLD.organization_id OR NEW.id<>OLD.id OR NEW.revision<>OLD.revision+1
 OR ROW(NEW.created_by,NEW.create_key,NEW.create_fingerprint,NEW.created_at) IS DISTINCT FROM ROW(OLD.created_by,OLD.create_key,OLD.create_fingerprint,OLD.created_at)
 THEN RAISE EXCEPTION 'customer revision conflict' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_revision BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION customer_revision_guard();
CREATE TRIGGER customer_group_revision BEFORE UPDATE ON customer_groups FOR EACH ROW EXECUTE FUNCTION customer_revision_guard();
CREATE FUNCTION customer_membership_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM customers WHERE organization_id=NEW.organization_id AND id=NEW.customer_id AND status='ACTIVE')
 OR NOT EXISTS(SELECT 1 FROM customer_groups WHERE organization_id=NEW.organization_id AND id=NEW.group_id AND status='ACTIVE')
 THEN RAISE EXCEPTION 'inactive customer membership' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_membership_insert BEFORE INSERT ON customer_group_memberships FOR EACH ROW EXECUTE FUNCTION customer_membership_guard();
CREATE FUNCTION customer_sale_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pos_checkouts checkout JOIN pos_carts cart ON cart.organization_id=checkout.organization_id AND cart.id=checkout.cart_id
 WHERE checkout.organization_id=NEW.organization_id AND checkout.id=NEW.checkout_id AND cart.customer_id IS NOT DISTINCT FROM NEW.customer_id
 AND checkout.customer_id IS NOT DISTINCT FROM NEW.customer_id AND checkout.customer_code_snapshot=NEW.customer_code_snapshot
 AND (NEW.customer_id IS NULL OR checkout.adjustment_id IS NOT NULL OR EXISTS(SELECT 1 FROM customers WHERE organization_id=NEW.organization_id AND id=NEW.customer_id AND status='ACTIVE')))
 THEN RAISE EXCEPTION 'customer settlement mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_sale_insert BEFORE INSERT ON sales FOR EACH ROW EXECUTE FUNCTION customer_sale_guard();
CREATE FUNCTION customer_cart_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status IN ('COMPLETED','CANCELLED') OR (NEW.customer_id IS DISTINCT FROM OLD.customer_id AND
 (NEW.revision<>OLD.revision+1 OR EXISTS(SELECT 1 FROM pos_checkouts WHERE organization_id=OLD.organization_id AND cart_id=OLD.id AND status NOT IN ('CANCELLED','RESOLVED'))))
 THEN RAISE EXCEPTION 'immutable customer selection' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_cart_update BEFORE UPDATE ON pos_carts FOR EACH ROW EXECUTE FUNCTION customer_cart_guard();
CREATE FUNCTION customer_default_groups() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.created_by IS NULL THEN RETURN NEW; END IF;
 INSERT INTO customer_groups(organization_id,code,name,created_by) VALUES(NEW.id,'GENERAL','General',NEW.created_by),(NEW.id,'MEMBER','Member',NEW.created_by),(NEW.id,'VIP','VIP',NEW.created_by);
 RETURN NEW;
END $$;
CREATE TRIGGER customer_organization_groups AFTER INSERT ON organizations FOR EACH ROW EXECUTE FUNCTION customer_default_groups();
INSERT INTO customer_groups(organization_id,code,name,created_by) SELECT organization.id,defaults.code,defaults.name,organization.created_by FROM organizations organization CROSS JOIN (VALUES('GENERAL','General'),('MEMBER','Member'),('VIP','VIP')) defaults(code,name) WHERE organization.created_by IS NOT NULL;
REVOKE ALL ON FUNCTION customer_revision_guard(),customer_membership_guard(),customer_sale_guard(),customer_cart_guard(),customer_default_groups() FROM PUBLIC;
COMMIT;
