BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE auth_sessions ADD COLUMN primary_verified_at timestamptz,
    ADD CONSTRAINT auth_sessions_primary_proof_check CHECK (
        primary_verified_at IS NULL OR (isfinite(primary_verified_at) AND primary_verified_at<=created_at)
    );

COMMIT;
