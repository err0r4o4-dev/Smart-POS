import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  normalizeComposeLine,
  sanitizeMessage,
} from '../../scripts/log-format.mjs';

const script = `
set -eu
printf '%s' '<html>logging smoke fixture</html>' > /srv/index.html
printf '%s\n' '{' 'admin off' 'auto_https off' '}' ':8080 {' 'header X-Request-ID backend-request-id' 'respond /health/ready unavailable 503' 'respond ok 200' '}' > /tmp/api.Caddyfile
caddy run --config /tmp/api.Caddyfile > /tmp/api.log 2>&1 &
api_pid=$!
caddy run --config /etc/gateway.Caddyfile > /tmp/gateway.log 2>&1 &
gateway_pid=$!
caddy run --config /etc/web.Caddyfile > /tmp/web.log 2>&1 &
web_pid=$!
trap 'kill "$api_pid" "$gateway_pid" "$web_pid" 2>/dev/null || true' EXIT
ready=false
for attempt in $(seq 1 50); do
  if wget -q -O /dev/null http://127.0.0.1:8088/api/v1/system; then ready=true; break; fi
  sleep 0.1
done
if [ "$ready" != true ]; then cat /tmp/api.log /tmp/gateway.log /tmp/web.log; exit 1; fi
wget -q --header='Authorization: Bearer private-auth' --header='Cookie: session=private-cookie' -O /dev/null 'http://127.0.0.1:8088/api/v1/system?token=private-query'
wget -q -O /dev/null http://127.0.0.1:8088/health/ready || true
wget -q -O /dev/null 'http://127.0.0.1:8088/welcome?token=private-web-query'
wget -q -O /dev/null 'http://127.0.0.1:5173/assets/missing.js?token=private-web-query' || true
kill "$api_pid"
wait "$api_pid" || true
wget -q -O /dev/null http://127.0.0.1:8088/api/v1/system || true
sleep 0.2
printf '\nGATEWAY_LOGS\n'
cat /tmp/gateway.log
printf '\nWEB_LOGS\n'
cat /tmp/web.log
`;

const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--pull',
    'never',
    '--network',
    'none',
    '--read-only',
    '--tmpfs',
    '/tmp',
    '--tmpfs',
    '/config',
    '--tmpfs',
    '/data',
    '--tmpfs',
    '/srv',
    '--add-host',
    'api:127.0.0.1',
    '--add-host',
    'web:127.0.0.1',
    '--mount',
    `type=bind,source=${resolve('infra/caddy/Caddyfile')},target=/etc/gateway.Caddyfile,readonly`,
    '--mount',
    `type=bind,source=${resolve('apps/web/Caddyfile')},target=/etc/web.Caddyfile,readonly`,
    '--entrypoint',
    'sh',
    'caddy:2.10-alpine',
    '-c',
    script,
  ],
  { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 },
);

assert.ifError(result.error);
assert.equal(
  result.status,
  0,
  sanitizeMessage(
    `Isolated Caddy smoke container failed: ${result.stdout} ${result.stderr}`,
  ),
);
const sections = result.stdout.split(/GATEWAY_LOGS|WEB_LOGS/);
assert.equal(sections.length, 3);
for (const [index, prefix] of [
  [1, 'caddy-1'],
  [2, 'web-1'],
]) {
  const records = sections[index]
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line));
  const requests = records.filter(
    (record) =>
      record.logger?.startsWith('http.log.access') &&
      Number.isInteger(record.status),
  );
  assert.ok(requests.length > 0, `${prefix} did not emit access logs`);
  assert.ok(
    !sections[index].includes('private-'),
    `${prefix} leaked query or headers`,
  );
  for (const record of requests) {
    assert.equal(
      typeof record.method,
      'string',
      `missing method in ${record.logger}: ${Object.keys(record).join(',')}`,
    );
    assert.equal(typeof record.path, 'string');
    assert.ok(!('request' in record));
    assert.ok(!('resp_headers' in record));
    assert.ok(record.request_id || record.gateway_request_id);
    const output = normalizeComposeLine(
      `${prefix} | ${JSON.stringify(record)}`,
      { showHealth: true },
    );
    const entry = JSON.parse(output.slice(output.indexOf('|') + 1));
    assert.deepEqual(Object.keys(entry).slice(0, 4), [
      'method',
      'status',
      'path',
      'request_id',
    ]);
    if (prefix === 'caddy-1' && record.status === 502) {
      assert.equal(entry.request_id, record.gateway_request_id);
      assert.equal(entry.level, 'ERROR');
    } else if (prefix === 'caddy-1' && record.path !== '/welcome')
      assert.equal(record.request_id, 'backend-request-id');
  }
  if (prefix === 'caddy-1') {
    assert.ok(requests.some((record) => record.status === 503));
    assert.ok(requests.some((record) => record.status === 502));
    const gatewayWeb = requests.find((record) => record.path === '/welcome');
    assert.equal(gatewayWeb?.status, 200);
    const webRecords = sections[2]
      .split('\n')
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line));
    assert.ok(
      webRecords.some(
        (record) =>
          record.request_id === gatewayWeb.request_id &&
          record.path === '/welcome',
      ),
    );
  } else {
    assert.ok(requests.some((record) => record.status === 404));
    assert.ok(requests.some((record) => record.status === 200));
  }
}
console.log(
  'PASS: isolated gateway/web access logs, response IDs, statuses, ordering and private-data exclusion',
);
