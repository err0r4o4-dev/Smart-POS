BEGIN;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version=8 AND NOT dirty) THEN RAISE EXCEPTION 'schema not ready'; END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='smartpos_runtime' AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'runtime bypasses RLS'; END IF;
END $$;
INSERT INTO users(id,email,email_normalized,password_hash,display_name) VALUES
('10000000-0000-4000-8000-000000000001','organization-sql@example.test','organization-sql@example.test','$argon2id$fixture','SQL owner');
INSERT INTO organizations(id,name,code) VALUES
('10000000-0000-4000-8000-000000000010','SQL A','SQL-ORG-A'),
('10000000-0000-4000-8000-000000000020','SQL B','SQL-ORG-B');
INSERT INTO organization_memberships(id,organization_id,user_id,role) VALUES
('10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','OWNER'),
('10000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000001','OWNER');
INSERT INTO branches(id,organization_id,code,name) VALUES
('10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000010','MAIN','SQL A branch'),
('10000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000020','MAIN','SQL B branch');
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
    BEGIN
        INSERT INTO organization_memberships(organization_id,user_id,role) VALUES('10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','OWNER');
        RAISE EXCEPTION 'duplicate membership accepted';
    EXCEPTION WHEN unique_violation THEN NULL; END;
    BEGIN
        INSERT INTO branch_memberships(organization_id,membership_id,branch_id) VALUES('10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000022');
        RAISE EXCEPTION 'cross tenant FK accepted';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN
        UPDATE organization_memberships SET status='SUSPENDED' WHERE id='10000000-0000-4000-8000-000000000011';
        RAISE EXCEPTION 'last owner suspended';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE organization_memberships SET role='CASHIER' WHERE id='10000000-0000-4000-8000-000000000011';
        RAISE EXCEPTION 'last owner demoted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        INSERT INTO organizations(id,name,code) VALUES('10000000-0000-4000-8000-000000000030','Orphan','SQL-ORPHAN');
        RAISE EXCEPTION 'ownerless organization accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SET LOCAL ROLE smartpos_runtime;
DO $$ BEGIN
    IF (SELECT count(*) FROM organizations)>0 OR (SELECT count(*) FROM branches)>0 THEN RAISE EXCEPTION 'unset tenant RLS leaked'; END IF;
END $$;
SELECT set_config('app.organization_id','10000000-0000-4000-8000-000000000010',true);
DO $$ BEGIN
    IF (SELECT count(*) FROM branches)<>1 THEN RAISE EXCEPTION 'branch RLS not scoped'; END IF;
    BEGIN
        UPDATE branches SET name='Forged' WHERE organization_id='10000000-0000-4000-8000-000000000020';
        IF FOUND THEN RAISE EXCEPTION 'cross tenant update accepted'; END IF;
    END;
END $$;
RESET ROLE;
ROLLBACK;
