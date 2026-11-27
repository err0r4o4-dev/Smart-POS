BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE storefronts DROP CONSTRAINT storefront_food_categories_valid,
 ADD CONSTRAINT storefront_food_categories_valid CHECK (
  cardinality(category_codes) <= 8
  AND (cardinality(category_codes) = 0 OR array_ndims(category_codes) = 1)
  AND array_position(CASE WHEN array_ndims(category_codes) = 1 THEN category_codes ELSE '{}'::text[] END, NULL) IS NULL
  AND category_codes <@ ARRAY['made-to-order','noodles','isan','fried','drinks','desserts','healthy','snacks',
    'southern-thai','northern-thai','seafood','breakfast','asian']
 ),
 ADD COLUMN opening_hours jsonb,
 ADD CONSTRAINT storefront_opening_hours_valid CHECK (
  opening_hours IS NULL OR (CASE WHEN jsonb_typeof(opening_hours) = 'object' THEN
   (opening_hours - ARRAY['opens','closes','closed_weekday','timezone'] = '{}'::jsonb
    AND jsonb_typeof(opening_hours->'opens') = 'string'
    AND jsonb_typeof(opening_hours->'closes') = 'string'
    AND opening_hours->>'opens' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND opening_hours->>'closes' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND (opening_hours->>'opens') COLLATE "C" < (opening_hours->>'closes') COLLATE "C"
    AND jsonb_typeof(opening_hours->'closed_weekday') = 'number'
    AND opening_hours->>'closed_weekday' IN ('0','1','2','3','4','5','6')
    AND opening_hours->>'timezone' = 'Asia/Bangkok') IS TRUE
   ELSE false END)
 );

COMMIT;
