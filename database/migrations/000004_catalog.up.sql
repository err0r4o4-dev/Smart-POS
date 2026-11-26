BEGIN;
CREATE TABLE categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200), description text NOT NULL DEFAULT '' CHECK (length(description)<=2000),
 parent_id uuid, status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id,id), CHECK (parent_id IS DISTINCT FROM id), FOREIGN KEY (organization_id,parent_id) REFERENCES categories(organization_id,id)
);
CREATE UNIQUE INDEX category_name_unique ON categories(organization_id,lower(btrim(name)));
CREATE TABLE brands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200), description text NOT NULL DEFAULT '' CHECK (length(description)<=2000),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')), revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id,id)
);
CREATE UNIQUE INDEX brand_name_unique ON brands(organization_id,lower(btrim(name)));
CREATE TABLE units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,49}$'),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200), description text NOT NULL DEFAULT '' CHECK (length(description)<=2000),
 unit_type text NOT NULL CHECK (unit_type IN ('COUNT','WEIGHT','VOLUME','PACKAGING')), base_unit_id uuid,
 conversion_factor numeric(18,6) NOT NULL DEFAULT 1 CHECK (conversion_factor>0), status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id,id), UNIQUE (organization_id,code), CHECK (base_unit_id IS DISTINCT FROM id), CHECK (base_unit_id IS NOT NULL OR conversion_factor=1),
 FOREIGN KEY (organization_id,base_unit_id) REFERENCES units(organization_id,id)
);
CREATE UNIQUE INDEX unit_name_unique ON units(organization_id,lower(btrim(name)));
CREATE TABLE products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200), description text NOT NULL DEFAULT '' CHECK (length(description)<=2000), category_id uuid, brand_id uuid,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')), revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 created_by uuid NOT NULL REFERENCES users(id), updated_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id,id), FOREIGN KEY (organization_id,category_id) REFERENCES categories(organization_id,id), FOREIGN KEY (organization_id,brand_id) REFERENCES brands(organization_id,id)
);
CREATE INDEX product_list_idx ON products(organization_id,status,name,id);
CREATE INDEX product_category_idx ON products(organization_id,category_id);
CREATE INDEX product_brand_idx ON products(organization_id,brand_id);
CREATE TABLE product_variants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), product_id uuid NOT NULL,
 sku text NOT NULL CHECK (sku ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'), name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
 attributes jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attributes)='object' AND octet_length(attributes::text)<=4000), unit_id uuid NOT NULL,
 cost_price numeric(18,2) NOT NULL CHECK (cost_price>=0), selling_price numeric(18,2) NOT NULL CHECK (selling_price>0), currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')), revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id,id), UNIQUE (organization_id,product_id,id), UNIQUE (organization_id,sku),
 FOREIGN KEY (organization_id,product_id) REFERENCES products(organization_id,id), FOREIGN KEY (organization_id,unit_id) REFERENCES units(organization_id,id)
);
CREATE INDEX variant_product_idx ON product_variants(organization_id,product_id);
CREATE TABLE product_barcodes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), variant_id uuid NOT NULL,
 code text NOT NULL CHECK (length(code) BETWEEN 1 AND 80 AND code ~ '^[ -~]+$'), symbology text NOT NULL CHECK (symbology IN ('EAN13','EAN8','UPCA','CODE128')),
 source text NOT NULL CHECK (source IN ('MANUFACTURER','INTERNAL','ALIAS')), is_primary boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id,code), CHECK (source<>'INTERNAL' OR (symbology='CODE128' AND code ~ '^SP-[A-F0-9]{32}$')),
 FOREIGN KEY (organization_id,variant_id) REFERENCES product_variants(organization_id,id)
);
CREATE UNIQUE INDEX barcode_primary_unique ON product_barcodes(organization_id,variant_id) WHERE is_primary;
CREATE INDEX barcode_variant_idx ON product_barcodes(organization_id,variant_id);
CREATE TABLE product_import_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), created_by uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'PREVIEW' CHECK (status IN ('PREVIEW','COMPLETED')), rows jsonb NOT NULL CHECK (jsonb_typeof(rows)='array'), result jsonb,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour', created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz,
 mode text CHECK (mode IN ('CREATE','SKIP','UPDATE')), UNIQUE (organization_id,id)
);
CREATE INDEX import_tenant_idx ON product_import_jobs(organization_id,created_at DESC);
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['categories','brands','units','products','product_variants','product_barcodes','product_import_jobs'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY catalog_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON categories,brands,units,products,product_variants,product_barcodes,product_import_jobs TO smartpos_runtime;
GRANT DELETE ON product_barcodes TO smartpos_runtime;
COMMIT;
