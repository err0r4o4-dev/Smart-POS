BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL row_security = off;

LOCK TABLE auth_mfa_factors,auth_mfa_recovery_codes,auth_sessions,auth_audit_events,auth_rate_limits IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM auth_mfa_factors)
       OR EXISTS (SELECT 1 FROM auth_mfa_recovery_codes)
       OR EXISTS (SELECT 1 FROM auth_sessions WHERE mfa_factor_id IS NOT NULL OR mfa_verified_at IS NOT NULL)
       OR EXISTS (SELECT 1 FROM auth_audit_events WHERE event_type IN ('MFA_ENROLLMENT_STARTED','MFA_ENABLED','MFA_CHALLENGE'))
       OR EXISTS (SELECT 1 FROM auth_rate_limits WHERE scope IN ('MFA_ENROLL','MFA_VERIFY')) THEN
        RAISE EXCEPTION 'MFA state exists; use forward recovery' USING ERRCODE='23514';
    END IF;
END $$;

ALTER TABLE auth_sessions
    DROP CONSTRAINT auth_sessions_mfa_factor_fk,
    DROP CONSTRAINT auth_sessions_mfa_assurance_check,
    DROP COLUMN mfa_factor_id,
    DROP COLUMN mfa_verified_at;
DROP TABLE auth_mfa_recovery_codes;
DROP TABLE auth_mfa_factors;

ALTER TABLE auth_audit_events DROP CONSTRAINT auth_audit_events_event_type_check;
ALTER TABLE auth_audit_events ADD CONSTRAINT auth_audit_events_event_type_check
    CHECK (event_type IN ('REGISTER','LOGIN_SUCCESS','LOGIN_FAILURE','LOGOUT','RESET_REQUEST','RESET_COMPLETE','SESSION_REVOKED'));
ALTER TABLE auth_rate_limits DROP CONSTRAINT auth_rate_limits_scope_check;
ALTER TABLE auth_rate_limits ADD CONSTRAINT auth_rate_limits_scope_check
    CHECK (scope IN ('LOGIN','REGISTER','FORGOT','RESET','EMAIL_VERIFY','EMAIL_RESEND',
                     'storefront.quote','storefront.order','storefront.track',
                     'storefront.payment.checkout','storefront.payment.recover','storefront.payment.status'));

COMMIT;
