BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE auth_external_identities, auth_google_flows IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM auth_external_identities) OR EXISTS (SELECT 1 FROM auth_google_flows) THEN
        RAISE EXCEPTION 'cannot roll back Google auth while identities or flows exist' USING ERRCODE = '23514';
    END IF;
END $$;

DROP TABLE auth_google_flows;
DROP TABLE auth_external_identities;

COMMIT;
