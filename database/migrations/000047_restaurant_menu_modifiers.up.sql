BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE restaurant_menu_modifier_groups (
    organization_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
    min_choices integer NOT NULL CHECK (min_choices >= 0),
    max_choices integer NOT NULL CHECK (max_choices >= min_choices),
    PRIMARY KEY (organization_id, variant_id, id),
    FOREIGN KEY (organization_id, variant_id)
        REFERENCES restaurant_menu_items (organization_id, variant_id)
);

CREATE TABLE restaurant_menu_modifier_options (
    organization_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    group_id uuid NOT NULL,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
    extra_price numeric NOT NULL CHECK (extra_price BETWEEN 0 AND 9999999999999999.99 AND scale(extra_price) <= 2),
    saleable boolean NOT NULL,
    PRIMARY KEY (organization_id, variant_id, group_id, id),
    FOREIGN KEY (organization_id, variant_id, group_id)
        REFERENCES restaurant_menu_modifier_groups (organization_id, variant_id, id)
);

ALTER TABLE restaurant_menu_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_menu_modifier_groups FORCE ROW LEVEL SECURITY;
CREATE POLICY restaurant_organization_scope ON restaurant_menu_modifier_groups
    USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
    WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE restaurant_menu_modifier_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_menu_modifier_options FORCE ROW LEVEL SECURITY;
CREATE POLICY restaurant_organization_scope ON restaurant_menu_modifier_options
    USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
    WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT SELECT ON restaurant_menu_modifier_groups, restaurant_menu_modifier_options TO smartpos_runtime;

COMMIT;
