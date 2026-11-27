BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE storefronts ADD COLUMN category_codes text[] NOT NULL DEFAULT '{}',
 ADD CONSTRAINT storefront_food_categories_valid CHECK (
  cardinality(category_codes) <= 8
  AND (cardinality(category_codes) = 0 OR array_ndims(category_codes) = 1)
  AND array_position(CASE WHEN array_ndims(category_codes) = 1 THEN category_codes ELSE '{}'::text[] END, NULL) IS NULL
  AND category_codes <@ ARRAY['made-to-order','noodles','isan','fried','drinks','desserts','healthy','snacks']
 );

CREATE OR REPLACE FUNCTION storefront_directory() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=off AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'slug',visible.slug,'name',visible.name,'accepting_orders',visible.accepting_orders,
  'category_codes',visible.category_codes,'delivery_enabled',visible.delivery_enabled,
  'average_rating',reviews.average_rating,'review_count',reviews.review_count
 ) ORDER BY visible.name,visible.slug),'[]'::jsonb)
 FROM (
  SELECT shop.organization_id,shop.slug,shop.name,shop.accepting_orders,shop.delivery_enabled,shop.category_codes
  FROM public.storefronts shop JOIN public.organizations org ON org.id=shop.organization_id
  WHERE shop.published AND org.status='ACTIVE' ORDER BY shop.name,shop.slug LIMIT 100
 ) visible
 CROSS JOIN LATERAL (
  SELECT round(avg(rating),1) AS average_rating,count(*) AS review_count
  FROM public.storefront_ratings WHERE organization_id=visible.organization_id
 ) reviews;
$$;

COMMIT;
