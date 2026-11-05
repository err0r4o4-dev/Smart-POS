import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const apiRoot = fileURLToPath(new URL('../apps/api/', import.meta.url));
const migrations = fileURLToPath(
  new URL('../database/migrations/', import.meta.url),
);
const task = 'single-store';
const suffix = randomBytes(6).toString('hex');
const name = `smartpos-single-store-check-${suffix}`;
const password = randomBytes(32).toString('hex');
const database = 'smartpos_single_store_acceptance';
const upgradeDatabase = 'smartpos_single_store_upgrade';
const port = 15514;
let networkID = '';
let containerID = '';

const redact = (value) =>
  String(value ?? '').replaceAll(password, '[redacted-fixture-password]');
function run(program, args, options = {}) {
  try {
    return execFileSync(program, args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (error) {
    throw new Error(
      redact(`${program} failed: ${error.stderr ?? ''}\n${error.stdout ?? ''}`),
    );
  }
}
async function assertFreeLoopbackPort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', () =>
      reject(
        new Error(
          'Port 15514 is in use; refusing to reuse any existing database.',
        ),
      ),
    );
    probe.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
}
function ownsContainer() {
  return (
    /^[a-f0-9]{64}$/.test(containerID) &&
    run('docker', [
      'inspect',
      '--format',
      '{{index .Config.Labels "smartpos.task"}}',
      containerID,
    ]) === task &&
    run('docker', [
      'inspect',
      '--format',
      '{{index .Config.Labels "smartpos.task-instance"}}',
      containerID,
    ]) === suffix
  );
}
function ownsNetwork() {
  return (
    /^[a-f0-9]{64}$/.test(networkID) &&
    run('docker', [
      'network',
      'inspect',
      '--format',
      '{{index .Labels "smartpos.task"}}',
      networkID,
    ]) === task &&
    run('docker', [
      'network',
      'inspect',
      '--format',
      '{{index .Labels "smartpos.task-instance"}}',
      networkID,
    ]) === suffix
  );
}

try {
  await assertFreeLoopbackPort();
  for (const image of ['postgres:17-alpine', 'migrate/migrate:v4.18.3'])
    run('docker', ['image', 'inspect', '--format', '{{.Id}}', image]);
  networkID = run('docker', [
    'network',
    'create',
    '--label',
    `smartpos.task=${task}`,
    '--label',
    `smartpos.task-instance=${suffix}`,
    name,
  ]);
  if (!/^[a-f0-9]{64}$/.test(networkID))
    throw new Error('Unexpected task network identity.');
  containerID = run('docker', [
    'run',
    '--detach',
    '--rm',
    '--pull',
    'never',
    '--name',
    `${name}-db`,
    '--label',
    `smartpos.task=${task}`,
    '--label',
    `smartpos.task-instance=${suffix}`,
    '--network',
    name,
    '--tmpfs',
    '/var/lib/postgresql/data',
    '--publish',
    `127.0.0.1:${port}:5432`,
    '--env',
    'POSTGRES_USER=smartpos_dev',
    '--env',
    `POSTGRES_DB=${database}`,
    '--env',
    `POSTGRES_PASSWORD=${password}`,
    'postgres:17-alpine',
  ]);
  if (!ownsContainer())
    throw new Error('Unexpected task database identity; refusing to continue.');
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      run('docker', [
        'exec',
        containerID,
        'pg_isready',
        '-U',
        'smartpos_dev',
        '-d',
        database,
      ]);
      ready = true;
      break;
    } catch {
      await setTimeout(200);
    }
  }
  if (!ready) throw new Error('Ephemeral PostgreSQL did not become ready.');
  const migrationArgs = (target, ...command) => [
    'run',
    '--rm',
    '--pull',
    'never',
    '--network',
    name,
    '--mount',
    `type=bind,source=${migrations},target=/migrations,readonly`,
    'migrate/migrate:v4.18.3',
    '-path',
    '/migrations',
    '-database',
    `postgres://smartpos_dev:${password}@${name}-db:5432/${target}?sslmode=disable`,
    ...command,
  ];
  const sql = (target, statement) =>
    run(
      'docker',
      [
        'exec',
        '-i',
        containerID,
        'psql',
        '-X',
        '-q',
        '-A',
        '-t',
        '-U',
        'smartpos_dev',
        '-d',
        target,
        '-v',
        'ON_ERROR_STOP=1',
        '-v',
        'VERBOSITY=verbose',
      ],
      { input: statement, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  run('docker', migrationArgs(database, 'up', '27'));
  if (sql(database, 'SELECT version,dirty FROM schema_migrations') !== '27|f')
    throw new Error(
      'Expected clean migration version 27 before upgrade acceptance.',
    );
  // Clone only this invocation's fresh version 27 database, inside its tmpfs container.
  sql('postgres', `CREATE DATABASE ${upgradeDatabase} TEMPLATE ${database}`);
  sql(
    upgradeDatabase,
    `
BEGIN;
INSERT INTO users(id,email,email_normalized,password_hash,display_name) VALUES
 ('28000000-0000-4000-8000-000000000001','upgrade-fixture@example.test','upgrade-fixture@example.test','$argon2id$fixture','Upgrade fixture');
INSERT INTO organizations(id,name,code) VALUES ('28000000-0000-4000-8000-000000000010','Upgrade fixture','UPGRADE28');
INSERT INTO organization_memberships(organization_id,user_id,role) VALUES ('28000000-0000-4000-8000-000000000010','28000000-0000-4000-8000-000000000001','OWNER');
INSERT INTO branches(id,organization_id,code,name) VALUES ('28000000-0000-4000-8000-000000000011','28000000-0000-4000-8000-000000000010','MAIN','Main');
SELECT set_config('app.organization_id','28000000-0000-4000-8000-000000000010',true);
SELECT set_config('app.user_id','28000000-0000-4000-8000-000000000001',true);
INSERT INTO units(id,organization_id,code,name,unit_type) VALUES ('28000000-0000-4000-8000-000000000012','28000000-0000-4000-8000-000000000010','PCS','Pieces','COUNT');
INSERT INTO products(id,organization_id,name,created_by,updated_by) VALUES ('28000000-0000-4000-8000-000000000013','28000000-0000-4000-8000-000000000010','Fixture','28000000-0000-4000-8000-000000000001','28000000-0000-4000-8000-000000000001');
INSERT INTO product_variants(id,organization_id,product_id,sku,name,unit_id,cost_price,selling_price,currency) VALUES ('28000000-0000-4000-8000-000000000014','28000000-0000-4000-8000-000000000010','28000000-0000-4000-8000-000000000013','UPGRADE','Fixture','28000000-0000-4000-8000-000000000012',1,2,'THB');
INSERT INTO stock_locations(id,organization_id,branch_id,code,name,type,created_by,updated_by) VALUES ('28000000-0000-4000-8000-000000000015','28000000-0000-4000-8000-000000000010','28000000-0000-4000-8000-000000000011','MAIN','Main','SALES_FLOOR','28000000-0000-4000-8000-000000000001','28000000-0000-4000-8000-000000000001');
INSERT INTO pos_terminals(id,organization_id,branch_id,stock_location_id,code,name) VALUES ('28000000-0000-4000-8000-000000000016','28000000-0000-4000-8000-000000000010','28000000-0000-4000-8000-000000000011','28000000-0000-4000-8000-000000000015','MAIN','Main');
INSERT INTO storefronts(organization_id,slug,name,terminal_id) VALUES ('28000000-0000-4000-8000-000000000010','upgrade-fixture','Upgrade fixture','28000000-0000-4000-8000-000000000016');
INSERT INTO inventory_operations(id,organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES ('28000000-0000-4000-8000-000000000017','28000000-0000-4000-8000-000000000010','28000000-0000-4000-8000-000000000001','SQL','28000000-0000-4000-8000-000000000017',repeat('a',64));
INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES ('28000000-0000-4000-8000-000000000010','28000000-0000-4000-8000-000000000011','28000000-0000-4000-8000-000000000015','28000000-0000-4000-8000-000000000014','OPENING_BALANCE',10,'28000000-0000-4000-8000-000000000017','INITIAL','28000000-0000-4000-8000-000000000001');
INSERT INTO online_orders(id,organization_id,branch_id,terminal_id,stock_location_id,status,customer_name,contact_phone,store_name,estimated_total,access_hash,request_fingerprint) VALUES
 ('28000000-0000-4000-8000-000000000020','28000000-0000-4000-8000-000000000010','28000000-0000-4000-8000-000000000011','28000000-0000-4000-8000-000000000016','28000000-0000-4000-8000-000000000015','PENDING','Live fixture','000','Fixture',2,repeat('a',64),repeat('b',64)),
 ('28000000-0000-4000-8000-000000000021','28000000-0000-4000-8000-000000000010','28000000-0000-4000-8000-000000000011','28000000-0000-4000-8000-000000000016','28000000-0000-4000-8000-000000000015','CANCELLED','Historical fixture','000','Fixture',2,repeat('c',64),repeat('d',64));
INSERT INTO online_order_items(organization_id,order_id,variant_id,product_name,variant_name,sku,unit,quantity,unit_price,line_total)
 SELECT organization_id,id,'28000000-0000-4000-8000-000000000014','Fixture','Fixture','UPGRADE','PCS',1,2,2 FROM online_orders;
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;`,
  );
  const snapshot = () =>
    sql(
      upgradeDatabase,
      `SELECT jsonb_build_object(
    'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM online_orders o),
    'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY order_id) FROM online_order_items i),
    'movements',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM stock_movements m))`,
    );
  const before = snapshot();
  if (
    !before.includes('Live fixture') ||
    !before.includes('Historical fixture')
  )
    throw new Error('Upgrade fixtures missing before guard check.');
  let refusal = '';
  try {
    const migration28 = readFileSync(
      new URL(
        '../database/migrations/000028_online_ingredient_reservations.up.sql',
        import.meta.url,
      ),
      'utf8',
    );
    sql(upgradeDatabase, migration28);
  } catch (error) {
    refusal = error.message;
  }
  if (
    !refusal.includes('23514') ||
    !refusal.includes(
      'drain or reconcile live online orders before ingredient reservation migration',
    )
  )
    throw new Error(
      `Migration 28 did not refuse the live order as expected: ${refusal}`,
    );
  if (
    snapshot() !== before ||
    sql(upgradeDatabase, 'SELECT version,dirty FROM schema_migrations') !==
      '27|f' ||
    sql(
      upgradeDatabase,
      "SELECT to_regclass('public.online_order_stock_items') IS NULL",
    ) !== 't'
  )
    throw new Error(
      'Migration 28 refusal changed fixture data, schema, or migration version.',
    );
  console.log(
    'PASS: migration 28 refuses live orders atomically and preserves version 27 data.',
  );
  let migratorRefusal = '';
  try {
    run('docker', migrationArgs(upgradeDatabase, 'goto', '29'));
  } catch (error) {
    migratorRefusal = error.message;
  }
  if (
    !migratorRefusal.includes(
      'drain or reconcile live online orders before ingredient reservation migration',
    ) ||
    sql(upgradeDatabase, 'SELECT version,dirty FROM schema_migrations') !==
      '28|t' ||
    snapshot() !== before ||
    sql(
      upgradeDatabase,
      "SELECT to_regclass('public.online_order_stock_items') IS NULL",
    ) !== 't'
  )
    throw new Error(
      'Official migrator refusal did not preserve data and leave dirty version 28.',
    );
  // Only the disposable clone is forced back after verifying rollback above.
  run('docker', migrationArgs(upgradeDatabase, 'force', '27'));
  if (
    sql(upgradeDatabase, 'SELECT version,dirty FROM schema_migrations') !==
      '27|f' ||
    snapshot() !== before
  )
    throw new Error('Disposable upgrade clone recovery failed.');
  console.log(
    'PASS: official migrator refusal leaves dirty version 28; disposable clone recovered to version 27.',
  );
  sql(
    upgradeDatabase,
    `BEGIN;
    SELECT set_config('app.organization_id','28000000-0000-4000-8000-000000000010',true);
    UPDATE online_orders SET status='CANCELLED',revision=revision+1 WHERE id='28000000-0000-4000-8000-000000000020';
    COMMIT;`,
  );
  const drained = snapshot();
  run('docker', migrationArgs(upgradeDatabase, 'goto', '28'));
  if (
    sql(upgradeDatabase, 'SELECT version,dirty FROM schema_migrations') !==
      '28|f' ||
    snapshot() !== drained ||
    sql(
      upgradeDatabase,
      "SELECT to_regclass('public.online_order_stock_items') IS NOT NULL",
    ) !== 't'
  )
    throw new Error(
      'Official upgrade did not retain drained and historical order data.',
    );
  const rerun = spawnSync(
    'docker',
    migrationArgs(upgradeDatabase, 'goto', '28'),
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (
    rerun.status !== 0 ||
    !/no change/i.test(`${rerun.stdout}\n${rerun.stderr}`)
  )
    throw new Error(
      redact(
        `Upgrade rerun did not report no change: ${rerun.error ?? ''}\n${rerun.stderr ?? ''}\n${rerun.stdout ?? ''}`,
      ),
    );
  if (
    sql(upgradeDatabase, 'SELECT version,dirty FROM schema_migrations') !==
      '28|f' ||
    snapshot() !== drained
  )
    throw new Error(
      'Upgrade rerun changed migration version or historical data.',
    );
  console.log(
    'PASS: official 27-to-28 upgrade retains historical orders; rerun is unchanged.',
  );
  sql(
    upgradeDatabase,
    `INSERT INTO auth_rate_limits(scope,key_hash,attempts,window_end)
    SELECT scope,decode(repeat('28',32),'hex'),3,'2099-01-01T00:00:00Z'::timestamptz
    FROM unnest(ARRAY['LOGIN','REGISTER','FORGOT','RESET','storefront.quote','storefront.order','storefront.track']) AS scope;`,
  );
  const authSnapshot = () =>
    sql(
      upgradeDatabase,
      `SELECT COALESCE(jsonb_agg(to_jsonb(rate) ORDER BY scope,encode(key_hash,'hex')),'[]'::jsonb) FROM auth_rate_limits rate`,
    );
  const originalAuthRows = authSnapshot();
  const paymentScopesSQL = `INSERT INTO auth_rate_limits(scope,key_hash,attempts,window_end)
    SELECT scope,decode(repeat('29',32),'hex'),1,'2099-01-01T00:00:00Z'::timestamptz
    FROM unnest(ARRAY['storefront.payment.checkout','storefront.payment.recover','storefront.payment.status']) AS scope;`;
  let schemaRefusal = '';
  try {
    sql(upgradeDatabase, `BEGIN; ${paymentScopesSQL} ROLLBACK;`);
  } catch (error) {
    schemaRefusal = error.message;
  }
  if (
    !schemaRefusal.includes('23514') ||
    !schemaRefusal.includes('auth_rate_limits_scope_check') ||
    authSnapshot() !== originalAuthRows
  )
    throw new Error(
      'Version 28 did not reproduce the payment rate-limit scope constraint failure.',
    );
  console.log(
    'RED: version 28 rejects customer payment rate-limit scopes with SQLSTATE 23514.',
  );
  run('docker', migrationArgs(upgradeDatabase, 'goto', '29'));
  if (
    sql(upgradeDatabase, 'SELECT version,dirty FROM schema_migrations') !==
      '29|f' ||
    authSnapshot() !== originalAuthRows ||
    snapshot() !== drained
  )
    throw new Error(
      'Migration 29 changed existing auth rows or order history.',
    );
  sql(
    upgradeDatabase,
    `BEGIN;
    ${paymentScopesSQL}
    UPDATE auth_rate_limits SET attempts=attempts+1,window_end='2099-01-02T00:00:00Z'
    WHERE key_hash=decode(repeat('29',32),'hex') AND scope IN ('storefront.payment.checkout','storefront.payment.recover','storefront.payment.status');
    DO $$ BEGIN
      IF (SELECT count(*) FROM auth_rate_limits WHERE key_hash=decode(repeat('29',32),'hex') AND attempts=2 AND window_end='2099-01-02T00:00:00Z'::timestamptz)<>3 THEN
        RAISE EXCEPTION 'payment scope inserts or updates failed';
      END IF;
    END $$;
    COMMIT;`,
  );
  const paymentAuthRows = authSnapshot();
  let unknownScopeRefusal = '';
  try {
    sql(
      upgradeDatabase,
      "INSERT INTO auth_rate_limits(scope,key_hash,attempts,window_end) VALUES ('storefront.payment.bogus',decode(repeat('30',32),'hex'),1,'2099-01-01T00:00:00Z')",
    );
  } catch (error) {
    unknownScopeRefusal = error.message;
  }
  if (
    !unknownScopeRefusal.includes('23514') ||
    !unknownScopeRefusal.includes('auth_rate_limits_scope_check') ||
    authSnapshot() !== paymentAuthRows
  )
    throw new Error(
      'Migration 29 did not reject the unknown scope atomically.',
    );
  console.log(
    'PASS: migration 29 preserves existing auth rows; all three payment scopes insert/update; unknown scope rejected with SQLSTATE 23514.',
  );
  let downRefusal = '';
  try {
    run('docker', migrationArgs(upgradeDatabase, 'down', '1'));
  } catch (error) {
    downRefusal = error.message;
  }
  if (
    !downRefusal.includes(
      'cannot roll back payment rate-limit scopes while auth history uses them',
    ) ||
    sql(upgradeDatabase, 'SELECT version,dirty FROM schema_migrations') !==
      '28|t' ||
    authSnapshot() !== paymentAuthRows ||
    snapshot() !== drained
  )
    throw new Error(
      'Migration 29 down did not refuse atomically while preserving auth history.',
    );
  run('docker', migrationArgs(upgradeDatabase, 'force', '29'));
  if (
    sql(upgradeDatabase, 'SELECT version,dirty FROM schema_migrations') !==
      '29|f' ||
    authSnapshot() !== paymentAuthRows
  )
    throw new Error('Disposable migration 29 down-refusal recovery failed.');
  console.log(
    'PASS: migration 29 down refuses new-scope auth history atomically; dirty version 28 recovered only in disposable clone.',
  );
  if (
    sql(
      upgradeDatabase,
      `WITH removed AS (
    DELETE FROM auth_rate_limits WHERE key_hash=decode(repeat('29',32),'hex')
    AND scope IN ('storefront.payment.checkout','storefront.payment.recover','storefront.payment.status') RETURNING 1
  ) SELECT count(*) FROM removed`,
    ) !== '3' ||
    authSnapshot() !== originalAuthRows
  )
    throw new Error(
      'Task payment-scope fixture cleanup changed existing auth history.',
    );
  run('docker', migrationArgs(upgradeDatabase, 'down', '1'));
  if (
    sql(upgradeDatabase, 'SELECT version,dirty FROM schema_migrations') !==
      '28|f' ||
    authSnapshot() !== originalAuthRows ||
    snapshot() !== drained
  )
    throw new Error(
      'Migration 29 down changed existing auth rows or order history.',
    );
  let restoredScopeRefusal = '';
  try {
    sql(upgradeDatabase, `BEGIN; ${paymentScopesSQL} ROLLBACK;`);
  } catch (error) {
    restoredScopeRefusal = error.message;
  }
  if (
    !restoredScopeRefusal.includes('23514') ||
    !restoredScopeRefusal.includes('auth_rate_limits_scope_check') ||
    authSnapshot() !== originalAuthRows
  )
    throw new Error(
      'Migration 29 down failed to restore the version 28 scope whitelist.',
    );
  run('docker', migrationArgs(upgradeDatabase, 'goto', '29'));
  sql(upgradeDatabase, `BEGIN; ${paymentScopesSQL} ROLLBACK;`);
  const finalRerun = spawnSync(
    'docker',
    migrationArgs(upgradeDatabase, 'goto', '29'),
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (
    finalRerun.status !== 0 ||
    !/no change/i.test(`${finalRerun.stdout}\n${finalRerun.stderr}`) ||
    sql(upgradeDatabase, 'SELECT version,dirty FROM schema_migrations') !==
      '29|f' ||
    authSnapshot() !== originalAuthRows ||
    snapshot() !== drained
  )
    throw new Error(
      redact(
        `Migration 29 down/up/rerun changed auth rows or order history: ${finalRerun.error ?? ''}\n${finalRerun.stderr ?? ''}\n${finalRerun.stdout ?? ''}`,
      ),
    );
  console.log(
    'PASS: migration 29 down-to-28/up-to-29 and no-change rerun preserve existing auth rows and order history.',
  );
  run('docker', migrationArgs(database, 'up'));
  run('docker', migrationArgs(database, 'up'));
  console.log(
    'PASS: official migrations and no-change rerun applied only to new task-owned tmpfs PostgreSQL.',
  );
  run('docker', [
    'exec',
    containerID,
    'psql',
    '-U',
    'smartpos_dev',
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    "CREATE TABLE single_store_acceptance_marker(marker text NOT NULL); INSERT INTO single_store_acceptance_marker VALUES ('ephemeral-single-store'); GRANT SELECT ON single_store_acceptance_marker TO smartpos_runtime;",
  ]);
  const testOutput = run(
    'go',
    [
      'test',
      '-count=1',
      '-v',
      './internal/modules/storefront',
      '-run',
      '^(TestSingleStoreIsolatedDatabase|TestCustomerPaymentRateLimitScopesIsolatedDatabase)$',
    ],
    {
      cwd: apiRoot,
      timeout:
        process.env.SMARTPOS_RESTAURANT_BROWSER === '1' ? 300_000 : 120_000,
      env: {
        ...process.env,
        SMARTPOS_SINGLE_STORE_TEST_DSN: `postgres://smartpos_dev:${password}@127.0.0.1:${port}/${database}?sslmode=disable`,
      },
    },
  );
  console.log(redact(testOutput));
} catch (error) {
  console.error(redact(error.message));
  process.exitCode = 1;
} finally {
  try {
    if (ownsContainer()) {
      run('docker', ['stop', containerID]);
      console.log(
        'CLEANUP: stopped only task-owned tmpfs PostgreSQL; its disposable fixtures were removed.',
      );
    }
  } catch (error) {
    console.error(redact(error.message));
    process.exitCode = 1;
  }
  try {
    if (ownsNetwork()) {
      run('docker', ['network', 'rm', networkID]);
      console.log('CLEANUP: removed only task-owned test network.');
    }
  } catch (error) {
    console.error(redact(error.message));
    process.exitCode = 1;
  }
}
