BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_user_id_id_key UNIQUE (user_id,id);
ALTER TABLE auth_mfa_factors
    ADD COLUMN enrollment_session_id uuid,
    ADD CONSTRAINT auth_mfa_factors_enrollment_session_fk
        FOREIGN KEY (user_id,enrollment_session_id) REFERENCES auth_sessions(user_id,id) ON DELETE RESTRICT;

COMMIT;
