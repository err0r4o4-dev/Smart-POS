BEGIN;
ALTER TABLE organizations ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE organizations ADD COLUMN code text NOT NULL DEFAULT '',
    ADD COLUMN business_type text NOT NULL DEFAULT 'RETAIL',
    ADD COLUMN contact_email text NOT NULL DEFAULT '',
    ADD COLUMN contact_phone text NOT NULL DEFAULT '',
    ADD COLUMN address text NOT NULL DEFAULT '',
    ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
    ADD COLUMN created_by uuid REFERENCES users(id),
    ADD COLUMN configuration jsonb NOT NULL DEFAULT '{"timezone":"Asia/Bangkok","locale":"th-TH"}';
UPDATE organizations SET code = id::text WHERE code = '';
ALTER TABLE organizations ADD CONSTRAINT organization_code_unique UNIQUE (code);
ALTER TABLE branches ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE branches ADD COLUMN address text NOT NULL DEFAULT '',
    ADD COLUMN phone text NOT NULL DEFAULT '', ADD COLUMN email text NOT NULL DEFAULT '',
    ADD COLUMN is_main boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX branch_main_unique ON branches(organization_id) WHERE is_main;
CREATE TABLE organization_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
    user_id uuid NOT NULL REFERENCES users(id),
    role text NOT NULL CHECK (role IN ('OWNER','MANAGER','CASHIER','INVENTORY_STAFF','PURCHASING_STAFF')),
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','REMOVED')),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id,user_id), UNIQUE (organization_id,id)
);
CREATE INDEX membership_user_idx ON organization_memberships(user_id,status);
CREATE TABLE branch_memberships (
    organization_id uuid NOT NULL, membership_id uuid NOT NULL, branch_id uuid NOT NULL,
    PRIMARY KEY (membership_id,branch_id),
    FOREIGN KEY (organization_id,membership_id) REFERENCES organization_memberships(organization_id,id),
    FOREIGN KEY (organization_id,branch_id) REFERENCES branches(organization_id,id)
);
CREATE TABLE organization_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
    email text NOT NULL, role text NOT NULL CHECK (role IN ('MANAGER','CASHIER','INVENTORY_STAFF','PURCHASING_STAFF')),
    branch_ids uuid[] NOT NULL CHECK (cardinality(branch_ids)>0),
    token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash)=32),
    invited_by uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL DEFAULT now()+interval '48 hours',
    accepted_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitation_org_idx ON organization_invitations(organization_id,created_at DESC);
CREATE UNIQUE INDEX invitation_pending_idx ON organization_invitations(organization_id,email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE TABLE organization_audit_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
    actor_id uuid NOT NULL REFERENCES users(id), event_type text NOT NULL, object_id uuid NOT NULL,
    branch_ids uuid[] NOT NULL DEFAULT '{}', request_id text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organization_audit_idx ON organization_audit_events(organization_id,created_at DESC);
CREATE TABLE organization_creation_requests (
    user_id uuid NOT NULL REFERENCES users(id), key uuid NOT NULL, fingerprint bytea NOT NULL,
    organization_id uuid NOT NULL REFERENCES organizations(id), PRIMARY KEY (user_id,key)
);
DROP POLICY organization_scope ON organizations;
CREATE POLICY organization_scope ON organizations
    USING (id = nullif(current_setting('app.organization_id',true),'')::uuid
        OR EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id=organizations.id
            AND m.user_id=nullif(current_setting('app.user_id',true),'')::uuid AND m.status='ACTIVE'))
    WITH CHECK (id = nullif(current_setting('app.organization_id',true),'')::uuid);
CREATE FUNCTION protect_organization_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant uuid;
BEGIN
    IF TG_TABLE_NAME='organizations' THEN tenant:=NEW.id; ELSE tenant:=NEW.organization_id; END IF;
    PERFORM 1 FROM organizations WHERE id=tenant FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM organization_memberships WHERE organization_id=tenant AND role='OWNER' AND status='ACTIVE') THEN
        RAISE EXCEPTION 'Organization requires an active owner' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER organization_owner_required AFTER INSERT ON organizations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION protect_organization_owner();
CREATE CONSTRAINT TRIGGER membership_owner_required AFTER INSERT OR UPDATE ON organization_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION protect_organization_owner();
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='smartpos_runtime') THEN
        CREATE ROLE smartpos_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
    END IF;
END $$;
GRANT USAGE ON SCHEMA public TO smartpos_runtime;
GRANT SELECT ON schema_migrations TO smartpos_runtime;
GRANT SELECT,INSERT,UPDATE ON users,auth_sessions,password_reset_tokens,auth_rate_limits TO smartpos_runtime;
GRANT SELECT,INSERT ON auth_audit_events TO smartpos_runtime;
GRANT SELECT,INSERT,UPDATE ON organizations,branches,organization_memberships,organization_invitations TO smartpos_runtime;
GRANT SELECT,INSERT,DELETE ON branch_memberships TO smartpos_runtime;
GRANT SELECT,INSERT ON organization_audit_events,organization_creation_requests TO smartpos_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO smartpos_runtime;
COMMIT;
