BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM restaurant_menu_items)
 OR EXISTS(SELECT 1 FROM restaurant_menu_categories)
 OR EXISTS(SELECT 1 FROM restaurant_setup_commands WHERE operation='menu')
 OR EXISTS(SELECT 1 FROM restaurant_profiles WHERE menu_saved) THEN
  RAISE EXCEPTION 'Restaurant menu data exists; use forward recovery';
 END IF;
END $$;
DROP TABLE restaurant_menu_items,restaurant_menu_categories;
ALTER TABLE restaurant_profiles DROP COLUMN menu_saved;
ALTER TABLE restaurant_setup_commands DROP CONSTRAINT restaurant_setup_commands_operation_check;
ALTER TABLE restaurant_setup_commands ADD CONSTRAINT restaurant_setup_commands_operation_check
 CHECK(operation IN ('profile','services','tables','payments','orders','complete'));
COMMIT;
