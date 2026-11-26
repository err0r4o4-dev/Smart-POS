BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM storefronts WHERE source_kind='RESTAURANT') THEN
  RAISE EXCEPTION 'Restaurant storefront data exists; use forward recovery';
 END IF;
END $$;

DROP TRIGGER storefront_source_kind ON storefronts;
DROP FUNCTION storefront_source_kind_guard();
ALTER TABLE storefronts
 DROP CONSTRAINT storefront_source_identity,
 DROP COLUMN restaurant_organization_id,
 DROP COLUMN source_kind,
 ALTER COLUMN terminal_id SET NOT NULL;

COMMIT;
