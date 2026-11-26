BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION storefront_directory() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=off AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('slug',slug,'name',name,'accepting_orders',accepting_orders) ORDER BY name,slug),'[]'::jsonb)
 FROM (SELECT shop.slug,shop.name,shop.accepting_orders FROM public.storefronts shop JOIN public.organizations org ON org.id=shop.organization_id WHERE shop.published AND org.status='ACTIVE' ORDER BY shop.name,shop.slug LIMIT 100) visible;
$$;
REVOKE ALL ON FUNCTION storefront_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storefront_directory() TO smartpos_runtime;

COMMIT;
