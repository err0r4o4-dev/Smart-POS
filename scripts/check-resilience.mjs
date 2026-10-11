import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const project = process.env.RESILIENCE_COMPOSE_PROJECT;
const database = process.env.AUTH_TEST_DATABASE ?? '';
assert.equal(
  project,
  'smartpos-auth-test',
  'Resilience requires explicit isolated Compose project',
);
assert.match(
  database,
  /^smartpos_phase53_phase54_phase55_phase56_[a-z0-9_]+$/,
  'Resilience requires isolated schema13 DB',
);
const baseURL = 'http://127.0.0.1:18088';
const config = spawnSync(
  'docker',
  ['compose', '-p', project, 'config', '--format', 'json'],
  { encoding: 'utf8' },
);
assert.equal(config.status, 0, 'Cannot verify isolated Compose configuration');
assert.equal(
  JSON.parse(config.stdout).services.postgres.environment.POSTGRES_DB,
  database,
  'Refusing mismatched database target',
);
function compose(...args) {
  const result = spawnSync('docker', ['compose', '-p', project, ...args], {
    stdio: 'inherit',
  });
  assert.equal(result.status, 0, `docker compose ${args[0]} failed`);
}
async function expectStatus(path, status) {
  const response = await fetch(`${baseURL}${path}`, {
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(
    response.status,
    status,
    `${path}: expected ${status}, got ${response.status}`,
  );
  return response;
}
await expectStatus('/health/ready', 200);
try {
  compose('stop', 'ai');
  await expectStatus('/health/ready', 200);
  console.log('PASS: API readiness independent of AI outage');
} finally {
  compose('up', '--no-deps', '-d', '--wait', 'ai');
}
try {
  compose('stop', 'postgres');
  await expectStatus('/health/live', 200);
  const unavailable = await expectStatus('/health/ready', 503);
  const error = await unavailable.json();
  assert.equal(error.error.code, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(error.error.request_id, unavailable.headers.get('X-Request-ID'));
  console.log(
    'PASS: real database outage leaves live=200, ready=503 with standard error',
  );
} finally {
  compose('up', '--no-deps', '-d', '--wait', 'postgres');
}
await expectStatus('/health/ready', 200);
compose('stop', 'api');
const logs = spawnSync(
  'docker',
  ['compose', '-p', project, 'logs', '--no-color', '--tail', '15', 'api'],
  { encoding: 'utf8' },
);
try {
  assert.equal(logs.status, 0);
  assert.ok(
    logs.stdout.includes('server stopped gracefully'),
    'Missing graceful shutdown evidence',
  );
  console.log('PASS: Go graceful SIGTERM shutdown');
} finally {
  compose('up', '--no-deps', '-d', '--wait', 'api');
}
await expectStatus('/health/ready', 200);
console.log(
  'PASS: local stack restored after resilience checks; no data or volumes deleted',
);
