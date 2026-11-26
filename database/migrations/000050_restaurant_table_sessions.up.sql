BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Private Dine-in sessions started from a native table QR. Only a digest of
-- the customer's proof is stored. qr_token_hash snapshots the table QR in
-- force at start, so a rotated QR invalidates its sessions on every path.
CREATE TABLE restaurant_table_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 table_id uuid NOT NULL,
 proof_digest text NOT NULL CHECK (proof_digest ~ '^[a-f0-9]{64}$'),
 qr_token_hash text NOT NULL CHECK (qr_token_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ENDED')),
 end_reason text CHECK (end_reason IN ('CUSTOMER','TABLE_CLOSED','QR_DISABLED','QR_ROTATED')),
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 ended_at timestamptz,
 CHECK (expires_at = created_at + interval '2 hours'),
 CHECK ((status = 'ENDED') = (ended_at IS NOT NULL)),
 CHECK ((status = 'ENDED') = (end_reason IS NOT NULL)),
 CHECK (ended_at IS NULL OR ended_at >= created_at),
 UNIQUE (organization_id, id),
 UNIQUE (organization_id, proof_digest),
 FOREIGN KEY (organization_id, table_id) REFERENCES restaurant_dining_tables(organization_id, id)
);
CREATE INDEX restaurant_table_sessions_active ON restaurant_table_sessions(organization_id, table_id, expires_at)
 WHERE status = 'ACTIVE';

ALTER TABLE restaurant_table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_table_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY restaurant_organization_scope ON restaurant_table_sessions
 USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
 WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON restaurant_table_sessions TO smartpos_runtime;

COMMIT;
