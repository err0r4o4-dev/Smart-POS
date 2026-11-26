BEGIN;

ALTER TABLE branches ADD COLUMN setup_location jsonb;

ALTER TABLE branches ADD CONSTRAINT branches_setup_location_valid CHECK (
  setup_location IS NULL OR COALESCE(
    jsonb_typeof(setup_location) = 'object'
    AND jsonb_typeof(setup_location->'latitude') = 'number'
    AND jsonb_typeof(setup_location->'longitude') = 'number'
    AND (setup_location->>'latitude')::numeric BETWEEN -90 AND 90
    AND (setup_location->>'longitude')::numeric BETWEEN -180 AND 180
    AND setup_location->'confirmed' = 'true'::jsonb
    AND jsonb_typeof(setup_location->'address') = 'string'
    AND length(btrim(setup_location->>'address')) BETWEEN 1 AND 1000
    AND jsonb_typeof(setup_location->'details') = 'string'
    AND length(setup_location->>'details') <= 1000,
    false
  )
);

COMMIT;
