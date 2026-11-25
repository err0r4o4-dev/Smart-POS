BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE platform_admins (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    status text NOT NULL CHECK (status IN ('ACTIVE','REVOKED')),
    created_at timestamptz NOT NULL,
    granted_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CHECK (granted_at>=created_at AND updated_at>=granted_at),
    CHECK ((status='ACTIVE' AND revoked_at IS NULL) OR
           (status='REVOKED' AND revoked_at IS NOT NULL AND revoked_at>=granted_at AND revoked_at=updated_at))
);

CREATE TABLE platform_admin_audit_events (
    operation_id uuid PRIMARY KEY,
    target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    request_hash bytea NOT NULL CHECK (octet_length(request_hash)=32),
    action text NOT NULL CHECK (action IN ('GRANT','REVOKE')),
    was_active boolean NOT NULL,
    is_active boolean NOT NULL,
    changed boolean NOT NULL CHECK (changed=(was_active<>is_active)),
    database_principal text NOT NULL,
    session_principal text NOT NULL,
    operator_label text NOT NULL CHECK (length(operator_label) BETWEEN 1 AND 100),
    reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK (is_active=(action='GRANT'))
);
CREATE INDEX platform_admin_audit_target_time_idx ON platform_admin_audit_events(target_user_id,created_at);

CREATE FUNCTION platform_admin_audit_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
    RAISE EXCEPTION 'Platform authority audit is immutable' USING ERRCODE='23514';
END $$;
REVOKE ALL ON FUNCTION platform_admin_audit_immutable() FROM PUBLIC;
CREATE TRIGGER platform_admin_audit_immutable_row BEFORE UPDATE OR DELETE ON platform_admin_audit_events
FOR EACH ROW EXECUTE FUNCTION platform_admin_audit_immutable();
CREATE TRIGGER platform_admin_audit_immutable_truncate BEFORE TRUNCATE ON platform_admin_audit_events
FOR EACH STATEMENT EXECUTE FUNCTION platform_admin_audit_immutable();

REVOKE ALL ON platform_admins,platform_admin_audit_events FROM PUBLIC,smartpos_runtime;
GRANT SELECT ON platform_admins TO smartpos_runtime;

COMMIT;
