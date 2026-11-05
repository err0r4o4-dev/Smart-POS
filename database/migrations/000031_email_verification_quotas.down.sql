BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE auth_rate_limits IN ACCESS EXCLUSIVE MODE;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM auth_rate_limits WHERE scope IN ('EMAIL_VERIFY','EMAIL_RESEND')) THEN
  RAISE EXCEPTION 'cannot roll back email verification rate-limit scopes while auth history uses them' USING ERRCODE='23514';
 END IF;
END $$;

ALTER TABLE auth_rate_limits DROP CONSTRAINT auth_rate_limits_scope_check;
ALTER TABLE auth_rate_limits ADD CONSTRAINT auth_rate_limits_scope_check
 CHECK (scope IN ('LOGIN','REGISTER','FORGOT','RESET',
                  'storefront.quote','storefront.order','storefront.track',
                  'storefront.payment.checkout','storefront.payment.recover','storefront.payment.status'));

COMMIT;
