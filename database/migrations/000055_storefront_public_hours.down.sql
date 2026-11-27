BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE storefronts IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM storefronts WHERE opening_hours IS NOT NULL OR
  category_codes && ARRAY['southern-thai','northern-thai','seafood','breakfast','asian']) THEN
  RAISE EXCEPTION 'Cannot roll back storefront profile metadata while new hours or categories exist';
 END IF;
END $$;

ALTER TABLE storefronts DROP COLUMN opening_hours,
 DROP CONSTRAINT storefront_food_categories_valid,
 ADD CONSTRAINT storefront_food_categories_valid CHECK (
  cardinality(category_codes) <= 8
  AND (cardinality(category_codes) = 0 OR array_ndims(category_codes) = 1)
  AND array_position(CASE WHEN array_ndims(category_codes) = 1 THEN category_codes ELSE '{}'::text[] END, NULL) IS NULL
  AND category_codes <@ ARRAY['made-to-order','noodles','isan','fried','drinks','desserts','healthy','snacks']
 );

COMMIT;
