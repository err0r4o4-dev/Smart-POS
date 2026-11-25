BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL row_security = off;

LOCK TABLE platform_admins,platform_admin_audit_events IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM platform_admins) OR EXISTS (SELECT 1 FROM platform_admin_audit_events) THEN
        RAISE EXCEPTION 'Platform authority history exists; use forward recovery' USING ERRCODE='23514';
    END IF;
END $$;

DROP TABLE platform_admin_audit_events,platform_admins;
DROP FUNCTION platform_admin_audit_immutable();

COMMIT;
