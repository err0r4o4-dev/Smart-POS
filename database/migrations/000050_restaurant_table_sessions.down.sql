BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL row_security = off;

LOCK TABLE restaurant_table_sessions IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM restaurant_table_sessions) THEN
  RAISE EXCEPTION 'Table session state exists; use forward recovery' USING ERRCODE = '23514';
 END IF;
END $$;

DROP TABLE restaurant_table_sessions;

COMMIT;
