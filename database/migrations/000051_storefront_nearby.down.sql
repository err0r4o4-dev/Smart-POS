BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DROP FUNCTION storefront_nearby(double precision, double precision, uuid);

LOCK TABLE auth_rate_limits IN ACCESS EXCLUSIVE MODE;
DELETE FROM auth_rate_limits WHERE scope='storefront.nearby';
ALTER TABLE auth_rate_limits DROP CONSTRAINT auth_rate_limits_scope_check;
ALTER TABLE auth_rate_limits ADD CONSTRAINT auth_rate_limits_scope_check
 CHECK (scope IN ('LOGIN','REGISTER','FORGOT','RESET','EMAIL_VERIFY','EMAIL_RESEND','MFA_ENROLL','MFA_VERIFY',
  'MFA_RECOVERY_START','MFA_RECOVERY_CONFIRM','storefront.quote','storefront.order','storefront.track',
  'storefront.payment.checkout','storefront.payment.recover','storefront.payment.status'));

COMMIT;
