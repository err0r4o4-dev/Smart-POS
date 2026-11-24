BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE restaurant_menu_revisions (
    organization_id uuid NOT NULL REFERENCES restaurant_profiles (organization_id),
    revision bigint NOT NULL CHECK (revision > 0),
    actor_id uuid NOT NULL REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    before_state jsonb NOT NULL CHECK (jsonb_typeof(before_state) = 'object'),
    after_state jsonb NOT NULL CHECK (jsonb_typeof(after_state) = 'object'),
    idempotency_key uuid,
    fingerprint bytea CHECK (octet_length(fingerprint) = 32),
    CHECK ((idempotency_key IS NULL) = (fingerprint IS NULL)),
    PRIMARY KEY (organization_id, revision),
    UNIQUE (organization_id, actor_id, idempotency_key)
);

ALTER TABLE restaurant_menu_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_menu_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY restaurant_menu_revision_read ON restaurant_menu_revisions FOR SELECT
    USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY restaurant_menu_revision_append ON restaurant_menu_revisions FOR INSERT
    WITH CHECK (
        organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
        AND actor_id = nullif(current_setting('app.user_id', true), '')::uuid
    );

GRANT SELECT, INSERT ON restaurant_menu_revisions TO smartpos_runtime;

COMMIT;
