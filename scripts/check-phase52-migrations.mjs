import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const scratch =
  'smartpos_phase52_acceptance_20261010_' + randomUUID().slice(0, 8);
const env = {
  ...process.env,
  POSTGRES_DB: scratch,
  POSTGRES_PORT: '15432',
  API_PORT: '18080',
  WEB_PORT: '15173',
  GATEWAY_PORT: '18088',
  MAILPIT_PORT: '18025',
  PUBLIC_ORIGIN: 'http://localhost:18088',
};
function docker(args, input) {
  const result = spawnSync(
    'docker',
    ['compose', '-p', 'smartpos-auth-test', ...args],
    { env, input, encoding: 'utf8', maxBuffer: 2_000_000 },
  );
  if (result.error || result.status !== 0) {
    console.error(
      (result.stdout + result.stderr).replace(
        /postgres:\/\/[^\s]+/g,
        '[REDACTED_DB_URL]',
      ),
    );
    throw new Error('Isolated migration command failed');
  }
  return result.stdout + result.stderr;
}
const config = JSON.parse(docker(['config', '--format', 'json']));
const command = config.services.migrate.command;
const user = config.services.postgres.environment.POSTGRES_USER;
const target = new URL(command[command.indexOf('-database') + 1]);
if (target.hostname !== 'postgres' || target.pathname !== '/' + scratch)
  throw new Error('Unsafe target');
function sql(database, statement) {
  return docker(
    [
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      user,
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    statement,
  ).trim();
}
const fingerprint =
  'SELECT version,dirty FROM schema_migrations; SELECT count(*) FROM sales; SELECT count(*) FROM users;';
const before = sql('smartpos', fingerprint);
sql('postgres', 'CREATE DATABASE ' + scratch);
console.log('Retained scratch:', scratch);
if (
  sql(scratch, "SELECT count(*) FROM pg_tables WHERE schemaname='public'") !==
  '0'
)
  throw new Error('Not fresh');
for (let version = 1; version <= 9; version++) {
  docker([
    'run',
    '--no-deps',
    '--rm',
    'migrate',
    ...command.slice(0, -1),
    'up',
    '1',
  ]);
  const tracker = sql(scratch, 'SELECT version,dirty FROM schema_migrations');
  if (tracker !== version + '|f')
    throw new Error('Unexpected version/dirty tracker');
  console.log('Migration', version, tracker);
}
if (
  !docker(['run', '--no-deps', '--rm', 'migrate', ...command]).includes(
    'no change',
  )
)
  throw new Error('Rerun mutated schema');
console.log('Rerun: no change');
for (const name of [
  'foundation',
  'identity',
  'organization',
  'catalog',
  'inventory',
  'returns',
  'adjustments',
]) {
  sql(scratch, readFileSync('tests/integration/' + name + '.sql', 'utf8'));
  console.log('Rollback-only SQL', name, 'PASS');
}
if (before !== sql('smartpos', fingerprint))
  throw new Error('Existing test DB changed');
console.log(
  'Existing isolated DB unchanged; primary not accessed; no database/volume deleted',
);
