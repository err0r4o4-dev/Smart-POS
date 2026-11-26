BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE auth_mfa_factors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    secret_key_id text NOT NULL CHECK (length(btrim(secret_key_id)) BETWEEN 1 AND 100 AND secret_key_id=btrim(secret_key_id)),
    secret_ciphertext bytea NOT NULL CHECK (octet_length(secret_ciphertext)=49),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    activated_at timestamptz,
    revoked_at timestamptz,
    last_step bigint NOT NULL DEFAULT -1 CHECK (last_step >= -1),
    UNIQUE (user_id,id),
    CHECK (expires_at>created_at),
    CHECK (activated_at IS NULL OR (activated_at>=created_at AND activated_at<expires_at AND last_step>=0)),
    CHECK (revoked_at IS NULL OR revoked_at>=created_at)
);
CREATE UNIQUE INDEX auth_mfa_factors_current_user_idx ON auth_mfa_factors(user_id) WHERE revoked_at IS NULL;

CREATE TABLE auth_mfa_recovery_codes (
    user_id uuid NOT NULL,
    factor_id uuid NOT NULL,
    code_hash bytea NOT NULL CHECK (octet_length(code_hash)=32),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    used_at timestamptz,
    PRIMARY KEY (user_id,factor_id,code_hash),
    FOREIGN KEY (user_id,factor_id) REFERENCES auth_mfa_factors(user_id,id) ON DELETE RESTRICT,
    CHECK (used_at IS NULL OR used_at>=created_at)
);

ALTER TABLE auth_sessions
    ADD COLUMN mfa_factor_id uuid,
    ADD COLUMN mfa_verified_at timestamptz,
    ADD CONSTRAINT auth_sessions_mfa_factor_fk FOREIGN KEY (user_id,mfa_factor_id) REFERENCES auth_mfa_factors(user_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT auth_sessions_mfa_assurance_check CHECK (
        (mfa_factor_id IS NULL AND mfa_verified_at IS NULL) OR
        (mfa_factor_id IS NOT NULL AND mfa_verified_at IS NOT NULL AND mfa_verified_at>=created_at AND mfa_verified_at<expires_at)
    );

ALTER TABLE auth_audit_events DROP CONSTRAINT auth_audit_events_event_type_check;
ALTER TABLE auth_audit_events ADD CONSTRAINT auth_audit_events_event_type_check
    CHECK (event_type IN ('REGISTER','LOGIN_SUCCESS','LOGIN_FAILURE','LOGOUT','RESET_REQUEST','RESET_COMPLETE','SESSION_REVOKED',
                         'MFA_ENROLLMENT_STARTED','MFA_ENABLED','MFA_CHALLENGE'));
ALTER TABLE auth_rate_limits DROP CONSTRAINT auth_rate_limits_scope_check;
ALTER TABLE auth_rate_limits ADD CONSTRAINT auth_rate_limits_scope_check
    CHECK (scope IN ('LOGIN','REGISTER','FORGOT','RESET','EMAIL_VERIFY','EMAIL_RESEND','MFA_ENROLL','MFA_VERIFY',
                     'storefront.quote','storefront.order','storefront.track',
                     'storefront.payment.checkout','storefront.payment.recover','storefront.payment.status'));

GRANT SELECT,INSERT ON auth_mfa_factors,auth_mfa_recovery_codes TO smartpos_runtime;
GRANT UPDATE (activated_at,revoked_at,last_step) ON auth_mfa_factors TO smartpos_runtime;
GRANT UPDATE (used_at) ON auth_mfa_recovery_codes TO smartpos_runtime;

COMMIT;
