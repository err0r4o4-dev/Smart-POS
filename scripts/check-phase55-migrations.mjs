import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const database =
  'smartpos_phase53_phase54_phase55_' + randomUUID().replaceAll('-', '_');
const env = {
  ...process.env,
  POSTGRES_DB: database,
  POSTGRES_PORT: '15432',
  API_PORT: '18080',
  WEB_PORT: '15173',
  GATEWAY_PORT: '18088',
  MAILPIT_PORT: '18025',
  PUBLIC_ORIGIN: 'http://localhost:18088',
  PROXY_SUBNET: '172.30.55.0/28',
  CADDY_PROXY_IP: '172.30.55.2',
  API_PROXY_IP: '172.30.55.3',
};
function docker(args, input) {
  const result = spawnSync(
    'docker',
    ['compose', '-p', 'smartpos-auth-test', ...args],
    { env, input, encoding: 'utf8', maxBuffer: 4_000_000 },
  );
  const output = (result.stdout + result.stderr).replace(
    /postgres:\/\/[^\s]+/g,
    '[REDACTED_DB_URL]',
  );
  if (result.error || result.status !== 0)
    throw new Error(output || result.error?.message);
  return result.stdout + result.stderr;
}
function sql(statement) {
  return docker(
    [
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'smartpos_dev',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    statement,
  ).trim();
}
docker([
  'exec',
  '-T',
  'postgres',
  'psql',
  '-U',
  'smartpos_dev',
  '-d',
  'postgres',
  '-v',
  'ON_ERROR_STOP=1',
  '-c',
  'CREATE DATABASE ' + database,
]);
console.log('Retained isolated database:', database);
for (let version = 1; version <= 12; version++) {
  const config = JSON.parse(docker(['config', '--format', 'json']));
  const command = config.services.migrate.command;
  const target = new URL(command[command.indexOf('-database') + 1]);
  if (target.hostname !== 'postgres' || target.pathname !== '/' + database)
    throw new Error('Unsafe migration target');
  docker([
    'run',
    '--no-deps',
    '--rm',
    'migrate',
    ...command.slice(0, -1),
    'up',
    '1',
  ]);
  if (sql('SELECT version,dirty FROM schema_migrations') !== version + '|f')
    throw new Error('Migration tracker mismatch');
  console.log('Migration', version, 'PASS');
}
if (!docker(['run', '--no-deps', '--rm', 'migrate']).includes('no change'))
  throw new Error('Migration rerun mismatch');
for (const table of [
  'loyalty_programs',
  'loyalty_accounts',
  'loyalty_ledger',
]) {
  if (
    sql(
      `SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='${table}'::regclass`,
    ) !== 't'
  )
    throw new Error('RLS missing: ' + table);
  if (
    sql(
      `SELECT has_table_privilege('smartpos_runtime','${table}','DELETE')`,
    ) !== 'f'
  )
    throw new Error('DELETE grant: ' + table);
  if (
    sql(
      `BEGIN;SET LOCAL ROLE smartpos_runtime;SELECT count(*) FROM ${table};ROLLBACK;`,
    )
      .split('\n')
      .filter((value) => /^\d+$/.test(value))
      .join() !== '0'
  )
    throw new Error('Unscoped read: ' + table);
}
for (const name of [
  'foundation',
  'identity',
  'organization',
  'catalog',
  'inventory',
  'returns',
  'adjustments',
  'customers',
  'loyalty',
]) {
  sql(readFileSync(`tests/integration/${name}.sql`, 'utf8'));
  console.log(`Rollback-only ${name} SQL PASS`);
}
console.log(
  'Fresh chain 1–12, rerun, FORCE RLS, runtime grants PASS; no existing DB migrated or deleted',
);
if (process.argv.includes('--start')) {
  docker(['up', '--no-deps', '--build', '-d', '--wait', 'api', 'web', 'caddy']);
  mkdirSync('.local', { recursive: true });
  writeFileSync(
    '.local/phase55-database.json',
    JSON.stringify({ database }, null, 2),
  );
  console.log('Isolated test gateway ready');
}
