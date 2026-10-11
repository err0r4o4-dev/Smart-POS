import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';

const read = (path) =>
  readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const base = parse(read('docker-compose.yml'));
const development = parse(read('docker-compose.dev.yml'));
const manifest = JSON.parse(read('package.json'));

test('development override only changes web and gateway', () => {
  assert.deepEqual(Object.keys(development.services).sort(), ['caddy', 'web']);
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

test('watch syncs source without host dependencies or environment files', () => {
  const watch = development.services.web.develop.watch;
  const source = watch.find((rule) => rule.path === './apps/web');
  assert.equal(source.action, 'sync');
  assert.equal(source.target, '/workspace/apps/web');
  assert.equal(source.initial_sync, true);
  for (const ignored of [
    'node_modules/',
    'dist/',
    '*.tsbuildinfo',
    '.env*',
    'package.json',
    'Dockerfile',
    'vite.config.ts',
  ]) {
    assert.ok(source.ignore.includes(ignored));
  }
  const config = watch.find(
    (rule) => rule.path === './apps/web/vite.config.ts',
  );
  assert.equal(config.action, 'sync+restart');
  assert.equal(config.initial_sync, true);
  assert.equal(config.target, '/workspace/apps/web/vite.config.ts');
  const contracts = watch.find(
    (rule) => rule.path === './packages/contracts/routes.json',
  );
  assert.equal(contracts.action, 'sync');
  assert.equal(contracts.initial_sync, true);
});

test('dependency and Dockerfile changes rebuild only the frontend', () => {
  const rebuilds = development.services.web.develop.watch
    .filter((rule) => rule.action === 'rebuild')
    .map((rule) => rule.path)
    .sort();
  assert.deepEqual(
    rebuilds,
    [
      './apps/web/Dockerfile',
      './apps/web/package.json',
      './package-lock.json',
      './package.json',
    ].sort(),
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

test('development startup never starts backend dependencies', () => {
  for (const name of ['stack:dev', 'stack:dev:up']) {
    assert.match(manifest.scripts[name], /--no-deps web caddy$/);
    assert.match(
      manifest.scripts[name],
      /-f docker-compose.yml -f docker-compose.dev.yml/,
    );
  }
  assert.match(
    manifest.scripts['stack:dev:watch'],
    /watch --no-up --prune=false web$/,
  );
  const dockerfile = read('apps/web/Dockerfile');
  const developmentStage = dockerfile.split('FROM node:24-alpine AS build')[0];
  assert.match(developmentStage, /FROM node:24-alpine AS development/);
  assert.match(developmentStage, /USER node/);
  assert.match(developmentStage, /RUN npm ci/);
  assert.match(developmentStage, /"--host", "0.0.0.0", "--port", "5173"/);
  assert.ok(dockerfile.includes('FROM caddy:2.10-alpine'));
  assert.ok(
    dockerfile.includes('COPY --from=build /workspace/apps/web/dist /srv'),
  );
});
