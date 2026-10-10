BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 12 AND NOT dirty) THEN
    RAISE EXCEPTION 'migration not ready';
  END IF;
END $$;

INSERT INTO organizations (id, name, code) VALUES
('00000000-0000-4000-8000-000000000001', 'Synthetic test organization A', 'SQL-FOUNDATION-A'),
('00000000-0000-4000-8000-000000000002', 'Synthetic test organization B', 'SQL-FOUNDATION-B');
INSERT INTO users(id,email,email_normalized,password_hash,display_name) VALUES
('00000000-0000-4000-8000-000000000020','foundation-owner@example.test','foundation-owner@example.test','$argon2id$fixture','Synthetic owner');
INSERT INTO organization_memberships(organization_id,user_id,role) VALUES
('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000020','OWNER'),
('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020','OWNER');
SET CONSTRAINTS ALL IMMEDIATE;
INSERT INTO branches (id, organization_id, code, name) VALUES
('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'MAIN', 'Synthetic branch A'),
('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002', 'MAIN', 'Synthetic branch B');

DO $$
BEGIN
  BEGIN
    INSERT INTO branches (id, organization_id, code, name) VALUES
    ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000001', 'MAIN', 'Duplicate');
    RAISE EXCEPTION 'duplicate branch code accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO branches (id, organization_id, code, name) VALUES
    ('00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000099', 'OTHER', 'Invalid tenant');
    RAISE EXCEPTION 'missing tenant accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;

CREATE ROLE smartpos_phase0_verification NOLOGIN;
GRANT SELECT, INSERT ON organizations, branches TO smartpos_phase0_verification;
GRANT SELECT ON organization_memberships TO smartpos_phase0_verification;
SET LOCAL ROLE smartpos_phase0_verification;

DO $$
BEGIN
  IF (SELECT count(*) FROM organizations) <> 0 OR (SELECT count(*) FROM branches) <> 0 THEN
    RAISE EXCEPTION 'missing tenant context must deny all reads';
  END IF;
END $$;

SELECT set_config('app.organization_id', '00000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM organizations) <> 1 OR (SELECT count(*) FROM branches) <> 1 THEN
    RAISE EXCEPTION 'tenant scoped read failed';
  END IF;
  IF EXISTS (SELECT 1 FROM branches WHERE organization_id <> '00000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'cross tenant read leaked';
  END IF;
  BEGIN
    INSERT INTO branches (id, organization_id, code, name) VALUES
    ('00000000-0000-4000-8000-000000000015', '00000000-0000-4000-8000-000000000002', 'DENIED', 'Cross tenant');
    RAISE EXCEPTION 'cross tenant write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;
ROLLBACK;
