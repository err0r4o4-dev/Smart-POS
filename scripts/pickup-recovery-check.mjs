import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

// The caller must supply an administrator SQL connection to its owned disposable DB.
export function verifyPickupRecovery(sql) {
  const role = `pickup_recovery_${randomBytes(8).toString('hex')}`;
  const user = randomUUID();
  const org = randomUUID();
  const owner = sql(
    "SELECT quote_ident(pg_get_userbyid(relowner)) FROM pg_class WHERE oid='restaurant_profiles'::regclass;",
  );
  const down = readFileSync(
    new URL(
      '../database/migrations/000040_restaurant_setup_pickup.down.sql',
      import.meta.url,
    ),
    'utf8',
  );
  sql(`BEGIN;
    INSERT INTO users(id,email,email_normalized,password_hash,display_name) VALUES('${user}','${role}@example.test','${role}@example.test','$argon2id$fixture','Pickup recovery fixture');
    INSERT INTO organizations(id,name,code,business_type) VALUES('${org}','Pickup recovery fixture','${role.toUpperCase()}','RESTAURANT');
    INSERT INTO organization_memberships(organization_id,user_id,role) VALUES('${org}','${user}','OWNER');
    INSERT INTO restaurant_profiles(organization_id,created_by,updated_by,pickup) VALUES('${org}','${user}','${user}',true);
    COMMIT;
    CREATE ROLE ${role} NOSUPERUSER NOBYPASSRLS;
    GRANT CREATE ON SCHEMA public TO ${role};
    ALTER TABLE restaurant_profiles OWNER TO ${role};`);
  try {
    assert.match(
      sql(
        `SET ROLE ${role}; SELECT count(*) FROM restaurant_profiles WHERE pickup;`,
      ),
      /^(?:SET\n)?0$/,
      'FORCE RLS must hide the incomplete enabled fixture',
    );
    assert.throws(
      () => sql(`SET ROLE ${role}; ${down}`),
      /query would be affected by row-level security policy|Pickup configuration exists; use forward recovery/,
      'RLS-restricted owner must not discard Pickup',
    );
    assert.equal(
      sql(
        `SELECT EXISTS(SELECT 1 FROM restaurant_profiles WHERE organization_id='${org}' AND pickup AND completed_at IS NULL);`,
      ),
      't',
      'failed downgrade must retain incomplete Pickup',
    );
    assert.throws(
      () => sql(down),
      /Pickup configuration exists; use forward recovery/,
      'administrator must also refuse incomplete Pickup',
    );
    assert.equal(
      sql('SELECT EXISTS(SELECT 1 FROM restaurant_profiles WHERE pickup);'),
      't',
    );
  } finally {
    sql(
      `ALTER TABLE restaurant_profiles OWNER TO ${owner}; REVOKE CREATE ON SCHEMA public FROM ${role}; DROP ROLE ${role};`,
    );
  }
}
