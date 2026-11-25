BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE storefront_ratings (
 organization_id uuid NOT NULL,
 order_id uuid NOT NULL,
 rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
 PRIMARY KEY (organization_id, order_id),
 FOREIGN KEY (organization_id, order_id) REFERENCES online_orders(organization_id, id)
);

ALTER TABLE storefront_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE storefront_ratings FORCE ROW LEVEL SECURITY;
CREATE POLICY storefront_rating_read ON storefront_ratings FOR SELECT TO smartpos_runtime
 USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY storefront_rating_insert ON storefront_ratings FOR INSERT TO smartpos_runtime
 WITH CHECK (
  organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  AND EXISTS (
   SELECT 1 FROM public.online_orders doc
   WHERE doc.organization_id = storefront_ratings.organization_id
     AND doc.id = storefront_ratings.order_id AND doc.status = 'COMPLETED'
  )
 );
REVOKE ALL ON storefront_ratings FROM PUBLIC, smartpos_runtime;
GRANT SELECT, INSERT ON storefront_ratings TO smartpos_runtime;

CREATE OR REPLACE FUNCTION storefront_directory() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=off AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'slug',visible.slug,'name',visible.name,'accepting_orders',visible.accepting_orders,
  'business_type',visible.business_type,'delivery_enabled',visible.delivery_enabled,
  'average_rating',reviews.average_rating,'review_count',reviews.review_count
 ) ORDER BY visible.name,visible.slug),'[]'::jsonb)
 FROM (
  SELECT shop.organization_id,shop.slug,shop.name,shop.accepting_orders,shop.delivery_enabled,org.business_type
  FROM public.storefronts shop JOIN public.organizations org ON org.id=shop.organization_id
  WHERE shop.published AND org.status='ACTIVE' ORDER BY shop.name,shop.slug LIMIT 100
 ) visible
 CROSS JOIN LATERAL (
  SELECT round(avg(rating),1) AS average_rating,count(*) AS review_count
  FROM public.storefront_ratings WHERE organization_id=visible.organization_id
 ) reviews;
$$;

COMMIT;
