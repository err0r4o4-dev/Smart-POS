BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE auth_rate_limits DROP CONSTRAINT auth_rate_limits_scope_check;
ALTER TABLE auth_rate_limits ADD CONSTRAINT auth_rate_limits_scope_check
 CHECK (scope IN ('LOGIN','REGISTER','FORGOT','RESET','EMAIL_VERIFY','EMAIL_RESEND','MFA_ENROLL','MFA_VERIFY',
  'MFA_RECOVERY_START','MFA_RECOVERY_CONFIRM','storefront.quote','storefront.order','storefront.track',
  'storefront.payment.checkout','storefront.payment.recover','storefront.payment.status','storefront.nearby'));

CREATE FUNCTION storefront_nearby(double precision, double precision, uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=off AS $$
 WITH published AS (
  SELECT shop.slug, shop.name, shop.accepting_orders, org.business_type,
   CASE WHEN shop.source_kind='RESTAURANT' THEN profile.location ELSE branch.setup_location END AS location
  FROM public.storefronts shop
  JOIN public.organizations org ON org.id=shop.organization_id
  LEFT JOIN public.restaurant_profiles profile ON profile.organization_id=shop.organization_id AND shop.source_kind='RESTAURANT'
  LEFT JOIN public.pos_terminals terminal ON terminal.organization_id=shop.organization_id
   AND terminal.id=COALESCE(shop.online_terminal_id,shop.terminal_id) AND shop.source_kind='LEGACY_POS'
  LEFT JOIN public.branches branch ON branch.organization_id=shop.organization_id AND branch.id=terminal.branch_id
  WHERE shop.published AND org.status='ACTIVE' AND ($3 IS NULL OR shop.organization_id=$3)
 ),
 distances AS (
  SELECT slug, name, accepting_orders, business_type,
   2 * 6371.0088 * asin(sqrt(least(1, greatest(0,
    power(sin(radians((location->>'latitude')::double precision - $1) / 2), 2)
    + cos(radians($1)) * cos(radians((location->>'latitude')::double precision))
    * power(sin(radians((location->>'longitude')::double precision - $2) / 2), 2)
   )))) AS distance_km
  FROM published
  WHERE location->'confirmed'='true'::jsonb
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'slug',slug,'name',name,'accepting_orders',accepting_orders,'business_type',business_type
 ) ORDER BY distance_km, name, slug),'[]'::jsonb)
 FROM distances WHERE distance_km <= 10;
$$;

REVOKE ALL ON FUNCTION storefront_nearby(double precision, double precision, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION storefront_nearby(double precision, double precision, uuid) TO smartpos_runtime;

COMMIT;
