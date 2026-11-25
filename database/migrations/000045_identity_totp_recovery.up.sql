BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE auth_mfa_pending_recoveries (
    user_id uuid PRIMARY KEY,
    session_id uuid NOT NULL,
    old_factor_id uuid NOT NULL,
    replacement_id uuid NOT NULL UNIQUE,
    recovery_hash bytea NOT NULL,
    secret_key_id text NOT NULL CHECK (length(btrim(secret_key_id)) BETWEEN 1 AND 100 AND secret_key_id=btrim(secret_key_id)),
    secret_ciphertext bytea NOT NULL CHECK (octet_length(secret_ciphertext)=49),
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL CHECK (expires_at>created_at),
    FOREIGN KEY (user_id,session_id) REFERENCES auth_sessions(user_id,id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id,old_factor_id,recovery_hash) REFERENCES auth_mfa_recovery_codes(user_id,factor_id,code_hash) ON DELETE RESTRICT
);
GRANT SELECT,INSERT,DELETE ON auth_mfa_pending_recoveries TO smartpos_runtime;

ALTER TABLE auth_audit_events DROP CONSTRAINT auth_audit_events_event_type_check;
ALTER TABLE auth_audit_events ADD CONSTRAINT auth_audit_events_event_type_check
    CHECK (event_type IN ('REGISTER','LOGIN_SUCCESS','LOGIN_FAILURE','LOGOUT','RESET_REQUEST','RESET_COMPLETE','SESSION_REVOKED',
                         'MFA_ENROLLMENT_STARTED','MFA_ENABLED','MFA_CHALLENGE','MFA_RECOVERY_STARTED','MFA_RECOVERY_COMPLETED'));
ALTER TABLE auth_rate_limits DROP CONSTRAINT auth_rate_limits_scope_check;
ALTER TABLE auth_rate_limits ADD CONSTRAINT auth_rate_limits_scope_check
    CHECK (scope IN ('LOGIN','REGISTER','FORGOT','RESET','EMAIL_VERIFY','EMAIL_RESEND','MFA_ENROLL','MFA_VERIFY',
                     'MFA_RECOVERY_START','MFA_RECOVERY_CONFIRM','storefront.quote','storefront.order','storefront.track',
                     'storefront.payment.checkout','storefront.payment.recover','storefront.payment.status'));

COMMIT;
