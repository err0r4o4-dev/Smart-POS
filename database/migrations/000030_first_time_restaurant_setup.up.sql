BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE email_verification_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash)=32),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 CHECK (expires_at>created_at),
 CHECK (used_at IS NULL OR used_at>=created_at)
);
CREATE UNIQUE INDEX email_verification_active_user_idx ON email_verification_tokens(user_id) WHERE used_at IS NULL;
CREATE INDEX email_verification_expiry_idx ON email_verification_tokens(expires_at) WHERE used_at IS NULL;

ALTER TABLE restaurant_tables ADD CONSTRAINT restaurant_tables_branch_identity UNIQUE (organization_id,branch_id,id);
ALTER TABLE restaurant_settings
 ADD COLUMN qr_ordering_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN kitchen_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN auto_confirm_orders boolean NOT NULL DEFAULT false,
 ADD COLUMN table_qr_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE restaurant_setup_progress (
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED')),
 current_step smallint NOT NULL DEFAULT 1 CHECK(current_step BETWEEN 1 AND 6),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 completed_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id),
 UNIQUE (organization_id,branch_id),
 FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id),
 CHECK ((status='COMPLETED')=(completed_at IS NOT NULL)),
 CHECK (status<>'COMPLETED' OR current_step=6)
);

CREATE TABLE restaurant_setup_steps (
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 step smallint NOT NULL CHECK(step BETWEEN 1 AND 6),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETED')),
 completed_at timestamptz,
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,branch_id,step),
 FOREIGN KEY (organization_id,branch_id) REFERENCES restaurant_setup_progress(organization_id,branch_id),
 CHECK ((status='COMPLETED')=(completed_at IS NOT NULL))
);

CREATE TABLE restaurant_service_modes (
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN ('DINE_IN','TAKEAWAY','DELIVERY')),
 enabled boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,branch_id,mode),
 FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id)
);

CREATE TABLE restaurant_zones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
 sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 10000),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id,id),
 UNIQUE (organization_id,branch_id,id),
 UNIQUE (organization_id,branch_id,code),
 FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id)
);
CREATE INDEX restaurant_zone_list_idx ON restaurant_zones(organization_id,branch_id,status,sort_order,code);

CREATE TABLE restaurant_table_zones (
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 table_id uuid NOT NULL,
 zone_id uuid NOT NULL,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,branch_id,table_id),
 FOREIGN KEY (organization_id,branch_id,table_id) REFERENCES restaurant_tables(organization_id,branch_id,id) ON DELETE CASCADE,
 FOREIGN KEY (organization_id,branch_id,zone_id) REFERENCES restaurant_zones(organization_id,branch_id,id) ON DELETE CASCADE
);
CREATE INDEX restaurant_table_zones_zone_idx ON restaurant_table_zones(organization_id,branch_id,zone_id,table_id);

CREATE TABLE restaurant_payment_settings (
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 method text NOT NULL CHECK(method IN ('CASH','QR_MANUAL','BANK_TRANSFER_MANUAL','CARD')),
 enabled boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,branch_id,method),
 FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id),
 CHECK(method<>'CARD' OR enabled=false)
);

CREATE TABLE restaurant_charge_settings (
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 vat_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK(vat_rate BETWEEN 0 AND 100 AND vat_rate=round(vat_rate,2)),
 service_charge_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK(service_charge_rate BETWEEN 0 AND 100 AND service_charge_rate=round(service_charge_rate,2)),
 charge_mode text NOT NULL DEFAULT 'ADDED_TO_SUBTOTAL' CHECK(charge_mode='ADDED_TO_SUBTOTAL'),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,branch_id),
 FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id)
);

CREATE TABLE restaurant_trials (
 organization_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED','ACTIVE','EXPIRED','CONVERTED')),
 trial_days integer NOT NULL DEFAULT 30 CHECK(trial_days BETWEEN 1 AND 365),
 started_at timestamptz,
 ends_at timestamptz,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id),
 UNIQUE (organization_id,branch_id),
 FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id),
 CHECK ((started_at IS NULL)=(ends_at IS NULL)),
 CHECK (ends_at IS NULL OR ends_at>started_at),
 CHECK (status='NOT_STARTED' OR started_at IS NOT NULL),
 CHECK (status='NOT_STARTED' OR ends_at IS NOT NULL)
);

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['restaurant_setup_progress','restaurant_setup_steps','restaurant_service_modes','restaurant_zones','restaurant_table_zones','restaurant_payment_settings','restaurant_charge_settings','restaurant_trials'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('DROP POLICY IF EXISTS restaurant_scope ON %I',table_name);
  EXECUTE format('CREATE POLICY restaurant_scope ON %I USING (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid) WITH CHECK (organization_id=nullif(current_setting(''app.organization_id'',true),'''')::uuid)',table_name);
 END LOOP;
END $$;

GRANT SELECT,INSERT,UPDATE ON email_verification_tokens TO smartpos_runtime;
GRANT SELECT,INSERT,UPDATE ON restaurant_setup_progress,restaurant_setup_steps,restaurant_service_modes,restaurant_zones,restaurant_table_zones,restaurant_payment_settings,restaurant_charge_settings,restaurant_trials TO smartpos_runtime;

COMMIT;
