BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE restaurant_availability (
    organization_id uuid PRIMARY KEY REFERENCES restaurant_profiles(organization_id),
    timezone text NOT NULL CHECK (length(timezone) BETWEEN 1 AND 255 AND timezone <> 'Local'),
    weekly_windows jsonb NOT NULL CHECK (jsonb_typeof(weekly_windows) = 'array'),
    global_pause boolean NOT NULL,
    dine_in_paused boolean NOT NULL,
    takeaway_paused boolean NOT NULL,
    pickup_paused boolean NOT NULL,
    delivery_paused boolean NOT NULL,
    revision bigint NOT NULL CHECK (revision > 0),
    updated_by uuid NOT NULL REFERENCES users(id),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE restaurant_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_availability FORCE ROW LEVEL SECURITY;
CREATE POLICY restaurant_organization_scope ON restaurant_availability
    USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
    WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON restaurant_availability TO smartpos_runtime;

COMMIT;
