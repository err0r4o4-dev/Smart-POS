BEGIN;

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
    email_normalized text NOT NULL UNIQUE CHECK (email_normalized = lower(btrim(email_normalized))),
    password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
    display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 100),
    status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
    email_verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    csrf_hash bytea NOT NULL CHECK (octet_length(csrf_hash) = 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
    last_used_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
);
CREATE INDEX auth_sessions_user_active_idx ON auth_sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE password_reset_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
    used_at timestamptz
);
CREATE INDEX password_reset_user_active_idx ON password_reset_tokens (user_id, expires_at) WHERE used_at IS NULL;

CREATE TABLE auth_audit_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    event_type text NOT NULL CHECK (event_type IN ('REGISTER', 'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'RESET_REQUEST', 'RESET_COMPLETE', 'SESSION_REVOKED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX auth_audit_events_user_time_idx ON auth_audit_events (user_id, created_at DESC);

CREATE TABLE auth_rate_limits (
    scope text NOT NULL CHECK (scope IN ('LOGIN', 'REGISTER', 'FORGOT', 'RESET')),
    key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
    attempts integer NOT NULL CHECK (attempts > 0),
    window_end timestamptz NOT NULL,
    PRIMARY KEY (scope, key_hash)
);
CREATE INDEX auth_rate_limits_window_idx ON auth_rate_limits (window_end);

COMMIT;
