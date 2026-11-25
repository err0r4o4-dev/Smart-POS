import assert from 'node:assert/strict';
import {
  createCipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';

// Install only on a caller-confirmed disposable target. These waits prove that
// expiry is rechecked after business locks and distinguish commit from response.
export function seedOwnerMFALockFixtures(sql) {
  assert.equal(
    sql('SELECT marker FROM single_store_acceptance_marker;'),
    'ephemeral-single-store',
  );
  sql(`CREATE FUNCTION owner_mfa_test_wait() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.request_id IN ('owner-mfa-final-wait','owner-mfa-commit-wait') THEN
        PERFORM pg_advisory_xact_lock(430081);
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER owner_mfa_test_final_wait BEFORE INSERT ON organization_audit_events
      FOR EACH ROW WHEN (NEW.request_id='owner-mfa-final-wait')
      EXECUTE FUNCTION owner_mfa_test_wait();
    CREATE CONSTRAINT TRIGGER owner_mfa_test_commit_wait AFTER INSERT ON organization_audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.request_id='owner-mfa-commit-wait')
      EXECUTE FUNCTION owner_mfa_test_wait();
    CREATE FUNCTION setup_mfa_test_result_wait() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM pg_advisory_xact_lock(430082);
      RETURN NEW;
    END $$;
    CREATE TRIGGER setup_mfa_test_result_wait BEFORE UPDATE ON restaurant_setup_commands
      FOR EACH ROW WHEN (NEW.idempotency_key='b2000000-0000-4000-8000-000000000888'::uuid)
      EXECUTE FUNCTION setup_mfa_test_result_wait();
    CREATE TRIGGER retained_setup_mfa_test_result_wait BEFORE UPDATE ON inventory_operations
      FOR EACH ROW WHEN (NEW.idempotency_key='c2000000-0000-4000-8000-000000000888'::uuid)
      EXECUTE FUNCTION setup_mfa_test_result_wait();
    CREATE FUNCTION retained_setup_mfa_test_commit_fail() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'synthetic retained setup commit failure';
    END $$;
    CREATE CONSTRAINT TRIGGER retained_setup_mfa_test_commit_fail AFTER INSERT ON organization_audit_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.request_id='retained-setup-commit-fail')
      EXECUTE FUNCTION retained_setup_mfa_test_commit_fail();`);
}

// Administrator callback for the caller's confirmed task-owned disposable DB.
// These synthetic fixtures intentionally corrupt factors and reject MFA audits.
export function seedMFAFailureFixtures(sql) {
  assert.equal(
    sql('SELECT marker FROM single_store_acceptance_marker;'),
    'ephemeral-single-store',
  );
  const environment = { SMARTPOS_MFA_FAILURE_FIXTURES: '1' };
  const cases = [
    'expired',
    'unknown-key',
    'tampered',
    'confirm-audit',
    'challenge-audit',
    'begin-audit',
  ];
  for (const [index, scenario] of cases.entries()) {
    const user = randomUUID();
    const factor = randomUUID();
    const token = Buffer.alloc(32, index).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const csrf = createHash('sha256')
      .update('smartpos-csrf-v1:' + token)
      .digest('base64url');
    const csrfHash = createHash('sha256').update(csrf).digest('hex');
    environment[
      `SMARTPOS_MFA_FIXTURE_${scenario.toUpperCase().replaceAll('-', '_')}`
    ] = token;
    sql(`INSERT INTO users(id,email,email_normalized,password_hash,display_name,email_verified_at)
      SELECT '${user}','mfa-fixture-${scenario}@example.test','mfa-fixture-${scenario}@example.test',
      password_hash,'Synthetic failure fixture',clock_timestamp() FROM users LIMIT 1;
      INSERT INTO auth_sessions(user_id,token_hash,csrf_hash,expires_at)
      VALUES('${user}',decode('${tokenHash}','hex'),decode('${csrfHash}','hex'),now()+interval '1 hour');`);
    if (scenario === 'begin-audit') continue;
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 0x42), nonce);
    cipher.setAAD(
      Buffer.concat([
        Buffer.from('smartpos.mfa.totp.v1'),
        Buffer.from([user.length]),
        Buffer.from(user),
        Buffer.from([factor.length]),
        Buffer.from(factor),
      ]),
    );
    const ciphertext = Buffer.concat([
      Buffer.from([1]),
      nonce,
      cipher.update(Buffer.from('12345678901234567890')),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    if (scenario === 'tampered') ciphertext[ciphertext.length - 1] ^= 1;
    const old = scenario === 'expired' || scenario === 'challenge-audit';
    const created = old
      ? "clock_timestamp()-interval '10 minutes'"
      : 'clock_timestamp()';
    const expiry = old
      ? "clock_timestamp()-interval '5 minutes'"
      : "clock_timestamp()+interval '5 minutes'";
    const activated =
      scenario === 'challenge-audit'
        ? "clock_timestamp()-interval '9 minutes'"
        : 'NULL';
    const last =
      scenario === 'challenge-audit'
        ? 'floor(extract(epoch FROM clock_timestamp())/30)::bigint-1'
        : '-1';
    sql(`INSERT INTO auth_mfa_factors(id,user_id,secret_key_id,secret_ciphertext,created_at,expires_at,activated_at,last_step,enrollment_session_id)
      SELECT '${factor}','${user}','${scenario === 'unknown-key' ? 'unknown-key' : 'synthetic-key-v1'}',
      decode('${ciphertext.toString('hex')}','hex'),${created},${expiry},${activated},${last},id
      FROM auth_sessions WHERE user_id='${user}';`);
  }
  sql(`CREATE FUNCTION mfa_test_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.event_type IN ('MFA_ENROLLMENT_STARTED','MFA_ENABLED','MFA_CHALLENGE') THEN
        RAISE EXCEPTION 'synthetic MFA audit failure';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER mfa_test_audit BEFORE INSERT ON auth_audit_events
    FOR EACH ROW EXECUTE FUNCTION mfa_test_refuse_audit();`);
  return environment;
}
