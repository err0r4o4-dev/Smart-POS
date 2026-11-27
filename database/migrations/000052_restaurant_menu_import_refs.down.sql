BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL row_security = off;

LOCK TABLE restaurant_menu_import_refs IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM restaurant_menu_import_refs) THEN
  RAISE EXCEPTION 'Menu import references exist; preserve them and use forward recovery' USING ERRCODE = '23514';
 END IF;
END $$;

DROP TABLE restaurant_menu_import_refs;

COMMIT;
