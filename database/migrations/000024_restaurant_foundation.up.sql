BEGIN;

CREATE TABLE restaurant_settings (
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 closing_time time NOT NULL DEFAULT '22:00',
 timezone text NOT NULL DEFAULT 'Asia/Bangkok' CHECK(length(btrim(timezone)) BETWEEN 1 AND 80),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,branch_id),
 FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id)
);

CREATE TABLE restaurant_tables (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),
 seats integer NOT NULL DEFAULT 2 CHECK(seats BETWEEN 1 AND 100),
 qr_token_hash text NOT NULL CHECK(qr_token_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,branch_id,code),
 UNIQUE(organization_id,qr_token_hash),
 FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id)
);
CREATE INDEX restaurant_table_list_idx ON restaurant_tables(organization_id,branch_id,status,code);

CREATE TABLE restaurant_recipes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 menu_variant_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,branch_id,menu_variant_id),
 FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id),
 FOREIGN KEY (organization_id,menu_variant_id) REFERENCES product_variants(organization_id,id)
);

CREATE TABLE restaurant_recipe_items (
 organization_id uuid NOT NULL,
 recipe_id uuid NOT NULL,
 ingredient_variant_id uuid NOT NULL,
 quantity numeric(18,3) NOT NULL CHECK(quantity>0),
 unit_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,recipe_id,ingredient_variant_id),
 FOREIGN KEY (organization_id,recipe_id) REFERENCES restaurant_recipes(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY (organization_id,ingredient_variant_id) REFERENCES product_variants(organization_id,id),
 FOREIGN KEY (organization_id,unit_id) REFERENCES units(organization_id,id),
 CHECK (quantity = round(quantity,3))
);

CREATE FUNCTION restaurant_protect_variant_unit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.unit_id IS DISTINCT FROM OLD.unit_id AND (
  EXISTS(SELECT 1 FROM restaurant_recipe_items WHERE organization_id=OLD.organization_id AND ingredient_variant_id=OLD.id)
  OR EXISTS(SELECT 1 FROM restaurant_recipes WHERE organization_id=OLD.organization_id AND menu_variant_id=OLD.id)
 ) THEN
  RAISE EXCEPTION 'variant unit is referenced by a restaurant recipe' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER restaurant_variant_unit_guard BEFORE UPDATE OF unit_id ON product_variants
 FOR EACH ROW EXECUTE FUNCTION restaurant_protect_variant_unit();

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['restaurant_settings','restaurant_recipes','restaurant_recipe_items','restaurant_tables'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('DROP POLICY IF EXISTS restaurant_scope ON %I', table_name);
  EXECUTE format('CREATE POLICY restaurant_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;

GRANT SELECT,INSERT,UPDATE ON restaurant_settings,restaurant_recipes,restaurant_recipe_items,restaurant_tables TO smartpos_runtime;
GRANT DELETE ON restaurant_recipe_items TO smartpos_runtime;

COMMIT;
