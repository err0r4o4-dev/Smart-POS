BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL row_security = off;

LOCK TABLE restaurant_profiles IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM restaurant_profiles WHERE pickup) THEN
  RAISE EXCEPTION 'Pickup configuration exists; use forward recovery';
 END IF;
END $$;

ALTER TABLE restaurant_profiles DROP CONSTRAINT restaurant_profiles_check2;
ALTER TABLE restaurant_profiles ADD CONSTRAINT restaurant_profiles_check2
 CHECK (completed_at IS NULL OR
  (profile_saved AND services_saved AND tables_saved AND payments_saved AND orders_saved
   AND (dine_in OR takeaway OR delivery) AND (cash_enabled OR bank_transfer_enabled)));
ALTER TABLE restaurant_profiles DROP COLUMN pickup;

COMMIT;
