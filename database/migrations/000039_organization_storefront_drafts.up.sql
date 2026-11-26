BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE storefronts
 ALTER COLUMN terminal_id DROP NOT NULL,
 ADD COLUMN source_kind text NOT NULL DEFAULT 'LEGACY_POS'
  CHECK (source_kind IN ('LEGACY_POS','RESTAURANT')),
 ADD COLUMN restaurant_organization_id uuid GENERATED ALWAYS AS
  (CASE WHEN source_kind='RESTAURANT' THEN organization_id END) STORED
  REFERENCES restaurant_profiles(organization_id),
 ADD CONSTRAINT storefront_source_identity CHECK (
  (source_kind='LEGACY_POS' AND terminal_id IS NOT NULL)
  OR (source_kind='RESTAURANT' AND terminal_id IS NULL
   AND online_terminal_id IS NULL AND NOT published AND NOT accepting_orders)
 );

CREATE FUNCTION storefront_source_kind_guard() RETURNS trigger
 LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.source_kind IS DISTINCT FROM OLD.source_kind THEN
  RAISE EXCEPTION 'storefront source kind is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER storefront_source_kind BEFORE UPDATE OF source_kind ON storefronts
 FOR EACH ROW EXECUTE FUNCTION storefront_source_kind_guard();
REVOKE ALL ON FUNCTION storefront_source_kind_guard() FROM PUBLIC;

COMMIT;
