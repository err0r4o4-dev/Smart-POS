import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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
  const migrationDSN = `postgres://smartpos_dev:${password}@${name}-db:5432/${database}?sslmode=disable`;
  run('docker', [
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
    migrationDSN,
    'up',
  ]);
  console.log(
    'PASS: official migrations applied only to new task-owned tmpfs PostgreSQL.',
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
      '^TestSingleStoreIsolatedDatabase$',
    ],
    {
      cwd: apiRoot,
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
