BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE restaurant_profiles (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id),
 location jsonb,
 profile_saved boolean NOT NULL DEFAULT false,
 services_saved boolean NOT NULL DEFAULT false,
 tables_saved boolean NOT NULL DEFAULT false,
 payments_saved boolean NOT NULL DEFAULT false,
 orders_saved boolean NOT NULL DEFAULT false,
 dine_in boolean NOT NULL DEFAULT false,
 takeaway boolean NOT NULL DEFAULT false,
 delivery boolean NOT NULL DEFAULT false,
 cash_enabled boolean NOT NULL DEFAULT false,
 bank_transfer_enabled boolean NOT NULL DEFAULT false,
 table_qr_enabled boolean NOT NULL DEFAULT false,
 qr_ordering_enabled boolean NOT NULL DEFAULT false,
 kitchen_enabled boolean NOT NULL DEFAULT false,
 auto_confirm_orders boolean NOT NULL DEFAULT false,
 vat_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK(vat_rate BETWEEN 0 AND 100),
 service_charge_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK(service_charge_rate BETWEEN 0 AND 100),
 closing_time time NOT NULL DEFAULT '22:00',
 timezone text NOT NULL DEFAULT 'Asia/Bangkok' CHECK(timezone='Asia/Bangkok'),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 completed_at timestamptz,
 trial_ends_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((completed_at IS NULL)=(trial_ends_at IS NULL)),
 CHECK (trial_ends_at IS NULL OR trial_ends_at>completed_at),
 CHECK (completed_at IS NULL OR (profile_saved AND services_saved AND tables_saved AND payments_saved AND orders_saved AND (dine_in OR takeaway OR delivery) AND (cash_enabled OR bank_transfer_enabled))),
 CHECK (location IS NULL OR COALESCE(
   jsonb_typeof(location)='object'
   AND jsonb_typeof(location->'latitude')='number'
   AND jsonb_typeof(location->'longitude')='number'
   AND (location->>'latitude')::numeric BETWEEN -90 AND 90
   AND (location->>'longitude')::numeric BETWEEN -180 AND 180
   AND location->'confirmed'='true'::jsonb
   AND jsonb_typeof(location->'address')='string'
   AND length(btrim(location->>'address')) BETWEEN 1 AND 1000
   AND jsonb_typeof(location->'details')='string'
   AND length(location->>'details')<=1000, false))
);

CREATE TABLE restaurant_dining_zones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES restaurant_profiles(organization_id),
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,code)
);

CREATE TABLE restaurant_dining_tables (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES restaurant_profiles(organization_id),
 zone_id uuid NOT NULL,
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),
 seats smallint NOT NULL CHECK(seats BETWEEN 1 AND 100),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
 qr_token_hash text NOT NULL UNIQUE CHECK(qr_token_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id),
 UNIQUE(organization_id,code),
 FOREIGN KEY(organization_id,zone_id) REFERENCES restaurant_dining_zones(organization_id,id)
);

CREATE TABLE restaurant_setup_commands (
 organization_id uuid NOT NULL REFERENCES organizations(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 operation text NOT NULL CHECK(operation IN ('profile','services','tables','payments','orders','complete')),
 idempotency_key uuid NOT NULL,
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 result jsonb CHECK(result IS NULL OR jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,actor_id,operation,idempotency_key)
);

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['restaurant_profiles','restaurant_dining_zones','restaurant_dining_tables','restaurant_setup_commands'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY restaurant_organization_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;

GRANT SELECT,INSERT,UPDATE ON restaurant_profiles,restaurant_dining_zones,restaurant_dining_tables,restaurant_setup_commands TO smartpos_runtime;

COMMIT;
