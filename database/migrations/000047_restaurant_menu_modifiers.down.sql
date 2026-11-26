BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL row_security = off;

LOCK TABLE restaurant_menu_modifier_groups, restaurant_menu_modifier_options IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM restaurant_menu_modifier_groups)
       OR EXISTS (SELECT 1 FROM restaurant_menu_modifier_options) THEN
        RAISE EXCEPTION 'Restaurant menu modifier configuration exists; use forward recovery' USING ERRCODE = '23514';
    END IF;
END $$;

DROP TABLE restaurant_menu_modifier_options;
DROP TABLE restaurant_menu_modifier_groups;

COMMIT;
