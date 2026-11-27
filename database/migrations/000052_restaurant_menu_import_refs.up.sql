BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- B16 (approved 2026-11-25/26): durable Owner-defined reference per
-- restaurant and row kind. A reference binds exactly one native menu entity
-- and one entity has at most one reference per kind. Only the column that
-- matches the kind is set, and each points at a real row in the same
-- organization, so a reference can never address another restaurant.
CREATE TABLE restaurant_menu_import_refs (
 organization_id uuid NOT NULL REFERENCES restaurant_profiles(organization_id),
 row_kind text NOT NULL CHECK (row_kind IN ('CATEGORY','ITEM','GROUP','OPTION')),
 -- Explicit code point ranges, not locale-dependent POSIX classes, so the
 -- rule is identical on every database ctype. They are exactly the code
 -- points the Go validator rejects (Go unicode.IsSpace, categories Cc and Cf),
 -- exported by TestMenuImportRefRejectedRanges and compared in acceptance.
 ref text NOT NULL CHECK (
  char_length(ref) BETWEEN 1 AND 100
  AND ref !~ '[\u0001- \u007f- ­؀-؅؜۝܏࢐-࢑࣢ ᠎ -‏ -  -⁤⁦-⁯　﻿￹-￻\U000110bd\U000110cd\U00013430-\U0001343f\U0001bca0-\U0001bca3\U0001d173-\U0001d17a\U000e0001\U000e0020-\U000e007f]'
 ),
 category_id uuid,
 variant_id uuid,
 group_id uuid,
 option_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id, row_kind, ref),
 CHECK (
  (row_kind = 'CATEGORY' AND category_id IS NOT NULL AND variant_id IS NULL AND group_id IS NULL AND option_id IS NULL)
  OR (row_kind = 'ITEM' AND category_id IS NULL AND variant_id IS NOT NULL AND group_id IS NULL AND option_id IS NULL)
  OR (row_kind = 'GROUP' AND category_id IS NULL AND variant_id IS NOT NULL AND group_id IS NOT NULL AND option_id IS NULL)
  OR (row_kind = 'OPTION' AND category_id IS NULL AND variant_id IS NOT NULL AND group_id IS NOT NULL AND option_id IS NOT NULL)
 ),
 FOREIGN KEY (organization_id, category_id) REFERENCES restaurant_menu_categories(organization_id, category_id),
 FOREIGN KEY (organization_id, variant_id) REFERENCES restaurant_menu_items(organization_id, variant_id),
 FOREIGN KEY (organization_id, variant_id, group_id) REFERENCES restaurant_menu_modifier_groups(organization_id, variant_id, id),
 FOREIGN KEY (organization_id, variant_id, group_id, option_id) REFERENCES restaurant_menu_modifier_options(organization_id, variant_id, group_id, id)
);

-- At most one reference per entity. Partial indexes keep the uniqueness
-- separate per kind; NULL columns never collide.
CREATE UNIQUE INDEX restaurant_menu_import_refs_category ON restaurant_menu_import_refs (organization_id, category_id) WHERE row_kind = 'CATEGORY';
CREATE UNIQUE INDEX restaurant_menu_import_refs_item ON restaurant_menu_import_refs (organization_id, variant_id) WHERE row_kind = 'ITEM';
CREATE UNIQUE INDEX restaurant_menu_import_refs_group ON restaurant_menu_import_refs (organization_id, variant_id, group_id) WHERE row_kind = 'GROUP';
CREATE UNIQUE INDEX restaurant_menu_import_refs_option ON restaurant_menu_import_refs (organization_id, variant_id, group_id, option_id) WHERE row_kind = 'OPTION';
-- Non-partial indexes serve foreign-key checks when a parent menu row is
-- deleted or re-keyed; those checks do not filter by row_kind. The variant
-- index also serves the group and option foreign keys by prefix.
CREATE INDEX restaurant_menu_import_refs_category_fk ON restaurant_menu_import_refs (organization_id, category_id);
CREATE INDEX restaurant_menu_import_refs_variant_fk ON restaurant_menu_import_refs (organization_id, variant_id, group_id, option_id);

ALTER TABLE restaurant_menu_import_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_menu_import_refs FORCE ROW LEVEL SECURITY;
CREATE POLICY restaurant_organization_scope ON restaurant_menu_import_refs
 USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
 WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- No runtime write yet: the binding and apply commands, with their audit and
-- revision, arrive in a later reviewed slice. No UPDATE or DELETE grant.
REVOKE ALL ON restaurant_menu_import_refs FROM PUBLIC, smartpos_runtime;
GRANT SELECT ON restaurant_menu_import_refs TO smartpos_runtime;

COMMIT;
