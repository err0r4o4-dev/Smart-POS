import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeComposeLine, sanitizeMessage } from './log-format.mjs';

function parse(line, options) {
  const output = normalizeComposeLine(line, options);
  return output === null
    ? null
    : JSON.parse(output.slice(output.indexOf('|') + 1));
}

test('HTTP fields are first for API, AI, web, and gateway', () => {
  for (const service of ['api', 'ai', 'web', 'caddy']) {
    const entry = parse(
      `${service}-1 | ${JSON.stringify({ time: '2026-10-11T12:53:41Z', level: 'info', msg: 'handled request', method: 'POST', status: 200, path: '/api/v1/auth/login?token=private-query', request_id: 'abc', latency_ms: 2, headers: { cookie: 'private-cookie' }, body: 'private-body' })}`,
    );
    assert.deepEqual(Object.keys(entry).slice(0, 4), [
      'method',
      'status',
      'path',
      'request_id',
    ]);
    assert.equal(entry.path, '/api/v1/auth/login');
    assert.equal(entry.msg, 'http_request');
    assert.equal(entry.service, service === 'caddy' ? 'gateway' : service);
    assert.equal(entry.latency_ms, 2);
    assert.ok(!JSON.stringify(entry).includes('private-'));
  }
});

test('Caddy duration and response ID are normalized with fallback', () => {
  const entry = parse(
    'caddy-1 | {"level":"info","method":"GET","status":502,"path":"/api/v1/system","request_id":"","gateway_request_id":"gateway-id","duration":0.0325,"ts":1791723221}',
  );
  assert.equal(entry.request_id, 'gateway-id');
  assert.equal(entry.level, 'ERROR');
  assert.equal(entry.latency_ms, 33);
  assert.ok(entry.time.endsWith('Z'));
});

test('healthy probes can be shown, failures are never hidden', () => {
  for (const path of ['/health/live', '/health/ready']) {
    const healthy = `ai-1 | {"method":"GET","status":200,"path":"${path}"}`;
    assert.equal(parse(healthy), null);
    assert.equal(parse(healthy, { showHealth: true }).status, 200);
    assert.equal(
      parse(`api-1 | {"method":"GET","status":503,"path":"${path}"}`).level,
      'ERROR',
    );
  }
  assert.equal(
    parse('api-1 | {"method":"GET","status":404,"path":"/missing"}').level,
    'WARN',
  );
  assert.equal(
    parse('api-1 | {"method":"POST","status":200,"path":"/health/live"}')
      .status,
    200,
  );
});

test('non-HTTP events do not invent HTTP fields', () => {
  for (const service of [
    'postgres',
    'migrate',
    'mailpit',
    'api-check',
    'ai-check',
    'integration-check',
    'auth-integration-check',
  ]) {
    const entry = parse(`${service}-1 | service started`);
    assert.equal(entry.service, service);
    assert.equal(entry.msg, 'service started');
    assert.ok(!('method' in entry));
    assert.ok(!('status' in entry));
    assert.ok(!('request_id' in entry));
  }
});

test('native PostgreSQL messages retain severity, timestamp and PID', () => {
  const ready = parse(
    'postgres-1 | 2026-10-11 12:53:41.305 UTC [42] LOG: database system is ready to accept connections',
  );
  assert.equal(ready.event, 'database_ready');
  assert.equal(ready.pid, 42);
  assert.equal(ready.time, '2026-10-11T12:53:41.305Z');
  const error = parse(
    'postgres-1 | 2026-10-11 12:53:41.305 UTC [42] ERROR: connection failed',
  );
  assert.equal(error.level, 'ERROR');
  const detail = parse(
    'postgres-1 | 2026-10-11 12:53:41.305 UTC [42] DETAIL: Key (email)=(private@example.com) already exists.',
  );
  assert.equal(detail.msg, '[redacted database detail]');
});

test('migration and Mailpit logs are normalized', () => {
  assert.equal(parse('migrate-1 | no change').event, 'migration_no_change');
  const mail = parse(
    'mailpit-1 | {"level":"info","time":"2026-10-11T12:53:41Z","msg":"SMTP listening","address":":1025"}',
  );
  assert.equal(mail.level, 'INFO');
  assert.equal(mail.address, ':1025');
  const nativeMail = parse(
    'mailpit-1 | time="2026-10-11T12:53:41Z" level=warning msg="SMTP listener restarting" password="private-password"',
  );
  assert.equal(nativeMail.level, 'WARN');
  assert.equal(nativeMail.msg, 'SMTP listener restarting');
  assert.ok(!JSON.stringify(nativeMail).includes('private'));
  assert.equal(
    parse('migrate-1 | 4/u catalog (5ms)').event,
    'migration_applied',
  );
  assert.equal(
    parse('api-check-1 | FAIL smartpos/api/internal/transport').level,
    'ERROR',
  );
});

test('Docker timestamps are retained for plain logs and missing JSON times', () => {
  const entry = parse('migrate-1 | 2026-10-11T12:53:41.305123456Z no change');
  assert.equal(entry.time, '2026-10-11T12:53:41.305Z');
  assert.equal(
    parse('api-1 | 2026-10-11T12:53:41Z {"msg":"starting"}').time,
    '2026-10-11T12:53:41.000Z',
  );
});

test('credentials, query strings and database statements are redacted', () => {
  for (const message of [
    'password=private-password',
    'Authorization: Bearer private-token',
    'postgres://user:private-password@localhost/db',
    'https://example.com/reset?token=private-query',
    'SELECT private-column FROM customer',
    'DETAIL: private-detail',
    'contact private@example.com',
  ]) {
    assert.ok(!sanitizeMessage(message).includes('private'), message);
  }
});

test('runtime errors retain correlation and safe context but not private attributes', () => {
  const entry = parse(
    'api-1 | {"level":"ERROR","msg":"request panic","event":"request_panic","request_id":"abc","reason":"private-secret","password":"private-password","exit_code":1}',
  );
  assert.equal(entry.request_id, 'abc');
  assert.equal(entry.event, 'request_panic');
  assert.equal(entry.exit_code, 1);
  assert.ok(!JSON.stringify(entry).includes('private'));
});

test('malformed or non-object JSON and Compose diagnostics stay visible', () => {
  for (const line of [
    'api-1 | {broken',
    'ai-1 | null',
    'web-1 | [1,2]',
    'ai-1 | "ready"',
    'docker daemon connection failed',
  ]) {
    assert.ok(parse(line).msg);
  }
  assert.equal(parse('docker daemon connection failed').level, 'ERROR');
  assert.equal(normalizeComposeLine(''), null);
  assert.equal(parse('\u001b[32mapi-1\u001b[0m | started').service, 'api');
  assert.ok(parse('api-1 | {"ts":1e300,"msg":"bad timestamp"}').msg);
  assert.ok(
    !JSON.stringify(parse('api-1 | {"password":"private-malformed"')).includes(
      'private-malformed',
    ),
  );
});
