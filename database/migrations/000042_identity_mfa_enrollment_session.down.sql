BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL row_security = off;

LOCK TABLE auth_mfa_factors,auth_sessions IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM auth_mfa_factors WHERE enrollment_session_id IS NOT NULL) THEN
        RAISE EXCEPTION 'MFA enrollment session state exists; use forward recovery' USING ERRCODE='23514';
    END IF;
END $$;

ALTER TABLE auth_mfa_factors DROP CONSTRAINT auth_mfa_factors_enrollment_session_fk, DROP COLUMN enrollment_session_id;
ALTER TABLE auth_sessions DROP CONSTRAINT auth_sessions_user_id_id_key;

COMMIT;
