BEGIN;

ALTER TABLE restaurant_profiles ADD COLUMN menu_saved boolean NOT NULL DEFAULT false;
ALTER TABLE restaurant_setup_commands DROP CONSTRAINT restaurant_setup_commands_operation_check;
ALTER TABLE restaurant_setup_commands ADD CONSTRAINT restaurant_setup_commands_operation_check
 CHECK(operation IN ('profile','services','tables','menu','payments','orders','complete'));

CREATE TABLE restaurant_menu_categories (
 organization_id uuid NOT NULL REFERENCES restaurant_profiles(organization_id),
 category_id uuid NOT NULL,
 PRIMARY KEY(organization_id,category_id),
 FOREIGN KEY(organization_id,category_id) REFERENCES categories(organization_id,id)
);

CREATE TABLE restaurant_menu_items (
 organization_id uuid NOT NULL REFERENCES restaurant_profiles(organization_id),
 product_id uuid NOT NULL,
 variant_id uuid NOT NULL,
 PRIMARY KEY(organization_id,variant_id),
 UNIQUE(organization_id,product_id),
 FOREIGN KEY(organization_id,product_id,variant_id) REFERENCES product_variants(organization_id,product_id,id)
);

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['restaurant_menu_categories','restaurant_menu_items'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY restaurant_menu_organization_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON restaurant_menu_categories,restaurant_menu_items TO smartpos_runtime;

COMMIT;
