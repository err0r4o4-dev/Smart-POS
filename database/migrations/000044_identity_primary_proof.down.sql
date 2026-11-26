BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL row_security = off;

LOCK TABLE auth_sessions IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM auth_sessions WHERE primary_verified_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Primary authentication proof exists; use forward recovery' USING ERRCODE='23514';
    END IF;
END $$;

ALTER TABLE auth_sessions DROP CONSTRAINT auth_sessions_primary_proof_check, DROP COLUMN primary_verified_at;

COMMIT;
