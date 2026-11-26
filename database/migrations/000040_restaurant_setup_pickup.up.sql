BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE restaurant_profiles ADD COLUMN pickup boolean NOT NULL DEFAULT false;
ALTER TABLE restaurant_profiles DROP CONSTRAINT restaurant_profiles_check2;
ALTER TABLE restaurant_profiles ADD CONSTRAINT restaurant_profiles_check2
 CHECK (completed_at IS NULL OR
  (profile_saved AND services_saved AND tables_saved AND payments_saved AND orders_saved
   AND (dine_in OR takeaway OR delivery OR pickup) AND (cash_enabled OR bank_transfer_enabled)));

COMMIT;
