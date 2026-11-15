BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM restaurant_profiles)
    OR EXISTS(SELECT 1 FROM restaurant_dining_zones)
    OR EXISTS(SELECT 1 FROM restaurant_dining_tables)
    OR EXISTS(SELECT 1 FROM restaurant_setup_commands) THEN
  RAISE EXCEPTION 'Restaurant setup data exists; use forward recovery';
 END IF;
END $$;

DROP TABLE restaurant_setup_commands;
DROP TABLE restaurant_dining_tables;
DROP TABLE restaurant_dining_zones;
DROP TABLE restaurant_profiles;

COMMIT;
