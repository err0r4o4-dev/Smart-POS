BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL row_security = off;

LOCK TABLE auth_mfa_pending_recoveries, auth_audit_events, auth_rate_limits IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM auth_mfa_pending_recoveries)
       OR EXISTS (SELECT 1 FROM auth_audit_events WHERE event_type IN ('MFA_RECOVERY_STARTED','MFA_RECOVERY_COMPLETED'))
       OR EXISTS (SELECT 1 FROM auth_rate_limits WHERE scope IN ('MFA_RECOVERY_START','MFA_RECOVERY_CONFIRM')) THEN
        RAISE EXCEPTION 'TOTP recovery state exists; use forward recovery' USING ERRCODE='23514';
    END IF;
END $$;

DROP TABLE auth_mfa_pending_recoveries;
ALTER TABLE auth_audit_events DROP CONSTRAINT auth_audit_events_event_type_check;
ALTER TABLE auth_audit_events ADD CONSTRAINT auth_audit_events_event_type_check
    CHECK (event_type IN ('REGISTER','LOGIN_SUCCESS','LOGIN_FAILURE','LOGOUT','RESET_REQUEST','RESET_COMPLETE','SESSION_REVOKED',
                         'MFA_ENROLLMENT_STARTED','MFA_ENABLED','MFA_CHALLENGE'));
ALTER TABLE auth_rate_limits DROP CONSTRAINT auth_rate_limits_scope_check;
ALTER TABLE auth_rate_limits ADD CONSTRAINT auth_rate_limits_scope_check
    CHECK (scope IN ('LOGIN','REGISTER','FORGOT','RESET','EMAIL_VERIFY','EMAIL_RESEND','MFA_ENROLL','MFA_VERIFY',
                     'storefront.quote','storefront.order','storefront.track',
                     'storefront.payment.checkout','storefront.payment.recover','storefront.payment.status'));

COMMIT;
