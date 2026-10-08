import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const baseURL = 'http://127.0.0.1:8088';
function compose(...args) {
  const result = spawnSync('docker', ['compose', ...args], {
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
  compose('up', '-d', '--wait', 'ai');
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
  compose('up', '-d', '--wait', 'postgres');
}
await expectStatus('/health/ready', 200);
compose('stop', 'api');
const logs = spawnSync(
  'docker',
  ['compose', 'logs', '--no-color', '--tail', '15', 'api'],
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
  compose('up', '-d', '--wait', 'api');
}
await expectStatus('/health/ready', 200);
console.log(
  'PASS: local stack restored after resilience checks; no data or volumes deleted',
);
