BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DROP TABLE restaurant_trials;
DROP TABLE restaurant_charge_settings;
DROP TABLE restaurant_payment_settings;
DROP TABLE restaurant_table_zones;
DROP TABLE restaurant_zones;
DROP TABLE restaurant_service_modes;
DROP TABLE restaurant_setup_steps;
DROP TABLE restaurant_setup_progress;

ALTER TABLE restaurant_settings
 DROP COLUMN table_qr_enabled,
 DROP COLUMN auto_confirm_orders,
 DROP COLUMN kitchen_enabled,
 DROP COLUMN qr_ordering_enabled;
ALTER TABLE restaurant_tables DROP CONSTRAINT restaurant_tables_branch_identity;

DROP TABLE email_verification_tokens;

COMMIT;
