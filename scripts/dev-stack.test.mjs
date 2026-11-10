import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { normalizeComposeLine } from './log-format.mjs';

const read = (path) =>
  readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const base = parse(read('docker-compose.yml'));
const development = parse(read('docker-compose.dev.yml'));
const manifest = JSON.parse(read('package.json'));

function resolvePosixShell() {
  const candidates =
    process.platform === 'win32'
      ? [
          'C:/Program Files/Git/bin/sh.exe',
          'C:/Program Files/Git/usr/bin/sh.exe',
          'sh',
        ]
      : ['sh'];
  for (const candidate of candidates) {
    if (candidate !== 'sh' && !existsSync(candidate)) continue;
    const probe = spawnSync(
      candidate,
      ['-c', 'command -v sha256sum >/dev/null 2>&1'],
      { stdio: 'ignore' },
    );
    if (probe.status === 0) return candidate;
  }
  return null;
}

test('development override only changes api, web and gateway', () => {
  assert.deepEqual(Object.keys(development.services).sort(), [
    'api',
    'caddy',
    'web',
  ]);
  assert.equal(development.services.api.build.target, 'development');
  assert.equal(base.services.api.build.target, 'runtime');
  assert.equal(development.services.api.init, true);
  assert.equal(development.services.api.volumes, undefined);
  assert.equal(development.services.web.build.target, 'development');
  assert.equal(base.services.web.build.target, undefined);
  assert.equal(
    development.services.web.environment.SMARTPOS_HMR_CLIENT_PORT,
    '${GATEWAY_PORT:-8088}',
  );
  assert.equal(
    development.services.caddy.environment.GATEWAY_PORT,
    '${GATEWAY_PORT:-8088}',
  );
  assert.equal(
    development.services.web.environment.SMARTPOS_API_PROXY_TARGET,
    'http://api:8080',
  );
  assert.equal(development.services.web.volumes, undefined);
});

test('watch syncs web and api source without host dependencies or environment files', () => {
  const webWatch = development.services.web.develop.watch;
  const webSource = webWatch.find((rule) => rule.path === './apps/web');
  assert.equal(webSource.action, 'sync');
  assert.equal(webSource.target, '/workspace/apps/web');
  assert.equal(webSource.initial_sync, true);
  for (const ignored of [
    'node_modules/',
    'dist/',
    '*.tsbuildinfo',
    '.env*',
    'package.json',
    'Dockerfile',
    'vite.config.ts',
  ]) {
    assert.ok(webSource.ignore.includes(ignored));
  }
  const webConfig = webWatch.find(
    (rule) => rule.path === './apps/web/vite.config.ts',
  );
  assert.equal(webConfig.action, 'sync+restart');
  assert.equal(webConfig.initial_sync, true);
  assert.equal(webConfig.target, '/workspace/apps/web/vite.config.ts');
  const contracts = webWatch.find(
    (rule) => rule.path === './packages/contracts/routes.json',
  );
  assert.equal(contracts.action, 'sync');
  assert.equal(contracts.initial_sync, true);

  const apiWatch = development.services.api.develop.watch;
  const apiSource = apiWatch.find((rule) => rule.path === './apps/api');
  assert.equal(apiSource.action, 'sync');
  assert.equal(apiSource.target, '/src');
  assert.equal(apiSource.initial_sync, true);
  for (const ignored of [
    '.cache/',
    '.env*',
    'server',
    '*.exe',
    'Dockerfile',
    'go.mod',
    'go.sum',
    'scripts/dev-watch.sh',
  ]) {
    assert.ok(apiSource.ignore.includes(ignored));
  }
  const apiSupervisor = apiWatch.find(
    (rule) => rule.path === './apps/api/scripts/dev-watch.sh',
  );
  assert.equal(apiSupervisor.action, 'sync+restart');
  assert.equal(apiSupervisor.initial_sync, true);
  assert.equal(apiSupervisor.target, '/src/scripts/dev-watch.sh');
});

test('dependency and Dockerfile changes rebuild only affected development services', () => {
  const webRebuilds = development.services.web.develop.watch
    .filter((rule) => rule.action === 'rebuild')
    .map((rule) => rule.path)
    .sort();
  assert.deepEqual(
    webRebuilds,
    [
      './apps/web/Dockerfile',
      './apps/web/package.json',
      './package-lock.json',
      './package.json',
    ].sort(),
  );

  const apiRebuilds = development.services.api.develop.watch
    .filter((rule) => rule.action === 'rebuild')
    .map((rule) => rule.path)
    .sort();
  assert.deepEqual(
    apiRebuilds,
    ['./apps/api/Dockerfile', './apps/api/go.mod', './apps/api/go.sum'].sort(),
  );
});

test('development CSP is isolated and keeps gateway routing and headers', () => {
  const gateway = read('infra/caddy/Caddyfile');
  const expected = gateway
    .replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
    .replace(
      "connect-src 'self';",
      "connect-src 'self' ws://localhost:{$GATEWAY_PORT:8088} ws://127.0.0.1:{$GATEWAY_PORT:8088};",
    );
  assert.equal(read('infra/caddy/Caddyfile.dev'), expected);
  assert.deepEqual(base.services.caddy.volumes, [
    './infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro',
  ]);
  assert.deepEqual(development.services.caddy.volumes, [
    './infra/caddy/Caddyfile.dev:/etc/caddy/Caddyfile:ro',
  ]);
});

test('setup mapping allows only the tile host and same-origin GPS', () => {
  for (const path of ['infra/caddy/Caddyfile', 'infra/caddy/Caddyfile.dev']) {
    const gateway = read(path);
    assert.match(
      gateway,
      /img-src 'self' data: https:\/\/tile\.openstreetmap\.org;/,
    );
    assert.match(
      gateway,
      /Permissions-Policy "camera=\(\), microphone=\(\), geolocation=\(self\)"/,
    );
    assert.doesNotMatch(gateway, /img-src[^;]*\*/);
  }
});

test('development startup never starts database or migration dependencies', () => {
  for (const name of ['stack:dev', 'stack:dev:up']) {
    assert.match(manifest.scripts[name], /--no-deps api web caddy$/);
    assert.match(
      manifest.scripts[name],
      /-f docker-compose.yml -f docker-compose.dev.yml/,
    );
  }
  assert.match(
    manifest.scripts['stack:dev:watch'],
    /watch --no-up --prune=false api web$/,
  );

  const webDockerfile = read('apps/web/Dockerfile');
  const webDevStage = webDockerfile.split('FROM node:24-alpine AS build')[0];
  assert.match(webDevStage, /FROM node:24-alpine AS development/);
  assert.match(webDevStage, /USER node/);
  assert.match(webDevStage, /RUN npm ci/);
  assert.match(webDevStage, /"--host", "0.0.0.0", "--port", "5173"/);
  assert.ok(webDockerfile.includes('FROM caddy:2.10-alpine'));
  assert.ok(
    webDockerfile.includes('COPY --from=build /workspace/apps/web/dist /srv'),
  );

  const apiDockerfile = read('apps/api/Dockerfile');
  const apiDevStage = apiDockerfile
    .split('FROM base AS development')[1]
    ?.split('FROM base AS check')[0];
  assert.ok(apiDevStage, 'apps/api/Dockerfile must define a development stage');
  assert.match(apiDevStage, /USER app/);
  assert.match(apiDevStage, /GOCACHE=\/tmp\/go-build/);
  assert.match(
    apiDevStage,
    /go build -o \/tmp\/smartpos-server \.\/cmd\/server/,
  );
  assert.match(apiDevStage, /CMD \["sh", "\/src\/scripts\/dev-watch\.sh"\]/);
  assert.ok(apiDockerfile.includes('FROM base AS check'));
  assert.ok(apiDockerfile.includes('FROM alpine:3.23 AS runtime'));
});

test('api dev-watch rebuilds Go changes, survives errors and forwards SIGTERM', (t) => {
  const shell = resolvePosixShell();
  if (!shell) {
    t.skip('POSIX sh with sha256sum not available on host');
    return;
  }
  const scriptUrl = new URL(
    '../apps/api/scripts/dev-watch.sh',
    import.meta.url,
  );
  assert.ok(existsSync(scriptUrl), 'apps/api/scripts/dev-watch.sh must exist');

  const scratch = mkdtempSync(join(tmpdir(), 'smartpos-dev-watch-'));
  try {
    const posixScratch = scratch.replaceAll('\\', '/');
    const posixScript = fileURLToPath(scriptUrl).replaceAll('\\', '/');
    writeFileSync(join(scratch, 'main.go'), 'package main // v1\n', 'utf8');
    writeFileSync(
      join(scratch, 'fake-build.sh'),
      [
        '#!/bin/sh',
        'set -eu',
        'if grep -q "BROKEN" "$SMARTPOS_DEV_WATCH_SRC/main.go"; then',
        '  echo "main.go:1: syntax error" >&2',
        '  exit 1',
        'fi',
        'cat > "$SMARTPOS_DEV_WATCH_BIN.next" <<\'EOF\'',
        '#!/bin/sh',
        'printf "%s\\n" "$$" > "$TEST_PIDFILE.tmp"',
        'mv -f "$TEST_PIDFILE.tmp" "$TEST_PIDFILE"',
        'trap \'printf "stopped:%s\\n" "$$" >> "$TEST_STOPPED"; exit 0\' TERM INT',
        'while :; do',
        '  sleep 0.1 &',
        '  wait $! 2>/dev/null || true',
        'done',
        'EOF',
        'chmod +x "$SMARTPOS_DEV_WATCH_BIN.next"',
        '',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(scratch, 'harness.sh'),
      [
        '#!/bin/sh',
        'set -eu',
        `SRC="${posixScratch}/src"`,
        `BIN="${posixScratch}/server-bin"`,
        `LOG="${posixScratch}/watch.log"`,
        `export TEST_PIDFILE="${posixScratch}/child.pid"`,
        `export TEST_STOPPED="${posixScratch}/stopped.log"`,
        'trap \'status=$?; if [ "$status" -ne 0 ]; then cat "$LOG" >&2 2>/dev/null || true; fi\' EXIT',
        'mkdir -p "$SRC"',
        `cp "${posixScratch}/main.go" "$SRC/main.go"`,
        'export SMARTPOS_DEV_WATCH_SRC="$SRC"',
        'export SMARTPOS_DEV_WATCH_BIN="$BIN"',
        'export SMARTPOS_DEV_WATCH_INTERVAL="0.1"',
        'export SMARTPOS_DEV_WATCH_DEBOUNCE="0.05"',
        `export SMARTPOS_DEV_WATCH_BUILD_CMD="sh '${posixScratch}/fake-build.sh'"`,
        `sh "${posixScript}" >"$LOG" 2>&1 &`,
        'WATCH_PID=$!',
        'for _ in $(seq 1 40); do',
        '  [ -s "$TEST_PIDFILE" ] && break',
        '  sleep 0.1',
        'done',
        '[ -s "$TEST_PIDFILE" ]',
        'FIRST_PID=$(cat "$TEST_PIDFILE")',
        'echo "SECRET=1" > "$SRC/.env"',
        'sleep 0.35',
        'AFTER_ENV_PID=$(cat "$TEST_PIDFILE")',
        '[ "$FIRST_PID" = "$AFTER_ENV_PID" ]',
        'echo "package main // BROKEN" > "$SRC/main.go"',
        'for _ in $(seq 1 40); do',
        '  grep -q "dev_build_failed" "$LOG" && break',
        '  sleep 0.1',
        'done',
        'grep -q "dev_build_failed" "$LOG"',
        'kill -0 "$FIRST_PID"',
        'echo "package main // v2" > "$SRC/main.go"',
        'for _ in $(seq 1 40); do',
        '  CURRENT_PID=$(cat "$TEST_PIDFILE" 2>/dev/null || true)',
        '  if grep -q "dev_server_reloaded" "$LOG" && [ -n "$CURRENT_PID" ] && [ "$CURRENT_PID" != "$FIRST_PID" ]; then',
        '    break',
        '  fi',
        '  sleep 0.1',
        'done',
        'grep -q "dev_server_reloaded" "$LOG"',
        'SECOND_PID=$(cat "$TEST_PIDFILE")',
        '[ "$FIRST_PID" != "$SECOND_PID" ]',
        'grep -q "stopped:$FIRST_PID" "$TEST_STOPPED"',
        'kill -TERM "$WATCH_PID"',
        'wait "$WATCH_PID"',
        'grep -q "stopped:$SECOND_PID" "$TEST_STOPPED"',
        '',
      ].join('\n'),
      'utf8',
    );

    const result = spawnSync(shell, [`${posixScratch}/harness.sh`], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(
      result.status,
      0,
      `Supervisor harness failed (status=${result.status}):\nstdout=${result.stdout}\nstderr=${result.stderr}`,
    );

    const logLines = readFileSync(join(scratch, 'watch.log'), 'utf8')
      .trim()
      .split('\n');
    assert.ok(logLines.length >= 4);
    for (const line of logLines) {
      const normalized = normalizeComposeLine(`api-1 | ${line}`);
      assert.ok(normalized?.includes('"service":"api"'));
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
