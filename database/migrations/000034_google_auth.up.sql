BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE auth_external_identities (
    provider text NOT NULL CHECK (provider = 'google'),
    subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 255 AND subject = btrim(subject)),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject),
    UNIQUE (user_id, provider)
);

CREATE TABLE auth_google_flows (
    flow_hash bytea PRIMARY KEY CHECK (octet_length(flow_hash) = 32),
    state_hash bytea NOT NULL CHECK (octet_length(state_hash) = 32),
    nonce_hash bytea NOT NULL CHECK (octet_length(nonce_hash) = 32),
    pkce_verifier text NOT NULL CHECK (length(pkce_verifier) BETWEEN 43 AND 128),
    return_to text NOT NULL CHECK (return_to IN ('/workspace', '/setup')),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
    consumed_at timestamptz,
    pending_subject text CHECK (pending_subject IS NULL OR (length(btrim(pending_subject)) BETWEEN 1 AND 255 AND pending_subject = btrim(pending_subject))),
    pending_email text CHECK (pending_email IS NULL OR length(btrim(pending_email)) BETWEEN 3 AND 254),
    linked_at timestamptz,
    CHECK ((pending_subject IS NULL) = (pending_email IS NULL))
);

CREATE INDEX auth_google_flows_expires_at_idx ON auth_google_flows (expires_at);

GRANT SELECT, INSERT ON auth_external_identities TO smartpos_runtime;
GRANT SELECT, INSERT, DELETE ON auth_google_flows TO smartpos_runtime;
GRANT UPDATE (consumed_at, pending_subject, pending_email, linked_at) ON auth_google_flows TO smartpos_runtime;

COMMIT;
