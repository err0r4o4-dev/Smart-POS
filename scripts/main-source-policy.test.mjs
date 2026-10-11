import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from 'yaml';

const workflow = parse(
  readFileSync(
    new URL('../.github/workflows/main-source-policy.yml', import.meta.url),
    'utf8',
  ),
);
const job = workflow.jobs['main-source-policy'];
const scriptMatch = job.steps[0].run.match(
  /^node --input-type=module <<'NODE'\n([\s\S]*)\nNODE\n?$/,
);
assert.ok(scriptMatch, 'The test must execute the actual workflow policy');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runPolicy = new AsyncFunction(
  'process',
  'fetch',
  'AbortSignal',
  'console',
  scriptMatch[1],
);
const repositoryId = 1409242877;
const headSha = 'a'.repeat(40);

function pullRequest(number, options = {}) {
  return {
    number,
    state: options.state ?? 'open',
    base: {
      ref: options.baseRef ?? 'main',
      repo: { id: options.baseRepositoryId ?? repositoryId },
    },
    head: {
      ref: options.headRef ?? 'develop',
      sha: options.headSha ?? headSha,
      repo: options.deletedRepository
        ? null
        : { id: options.headRepositoryId ?? repositoryId },
    },
  };
}

async function evaluatePolicy(pages, options = {}) {
  const context = {
    env: {
      GH_TOKEN: 'test-token',
      REPOSITORY: 'err0r4o4-dev/Smart-POS',
      REPOSITORY_ID: String(repositoryId),
      HEAD_SHA: headSha,
      ...options.env,
    },
    exitCode: 0,
  };
  const requests = [];
  const messages = [];
  const fetchMock = async (url, requestOptions) => {
    requests.push({ url, requestOptions });
    if (options.networkError) {
      throw new Error('Network unavailable');
    }
    const page = Number(new URL(url).searchParams.get('page'));
    assert.ok(page <= pages.length, 'Unexpected pagination request');
    return {
      ok: !options.httpStatus,
      status: options.httpStatus ?? 200,
      json: async () => pages[page - 1],
    };
  };
  await runPolicy(context, fetchMock, AbortSignal, {
    log: (message) => messages.push(message),
    error: (message) => messages.push(message),
  });
  return { exitCode: context.exitCode, requests, messages };
}

test('trusted workflow uses only PR read permission and refreshes shared SHA checks', () => {
  assert.deepEqual(Object.keys(workflow.on), ['pull_request_target']);
  assert.deepEqual(workflow.on.pull_request_target.branches, ['main']);
  assert.ok(workflow.on.pull_request_target.types.includes('closed'));
  assert.deepEqual(workflow.permissions, { 'pull-requests': 'read' });
  assert.equal(
    workflow.concurrency.group,
    'main-source-policy-${{ github.event.pull_request.head.sha }}',
  );
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
  assert.equal(job.name, 'Main source policy');
  assert.equal(job.if, undefined);
  assert.equal(job.steps.length, 1);
  assert.equal(job.steps[0].uses, undefined);
});

test('develop from this repository passes and only reads the GitHub API', async () => {
  const result = await evaluatePolicy([[pullRequest(1)]]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.requests.length, 1);
  const { url, requestOptions } = result.requests[0];
  assert.equal(new URL(url).origin, 'https://api.github.com');
  assert.equal(new URL(url).searchParams.get('base'), 'main');
  assert.equal(new URL(url).searchParams.get('state'), 'open');
  assert.equal(requestOptions.method, undefined);
  assert.equal(requestOptions.headers.Authorization, 'Bearer test-token');
});

test('a non-develop branch is rejected', async () => {
  const result = await evaluatePolicy([
    [pullRequest(1, { headRef: 'feature/example' })],
  ]);
  assert.equal(result.exitCode, 1);
});

test('a valid PR cannot make a non-develop PR sharing its SHA pass', async () => {
  const result = await evaluatePolicy([
    [pullRequest(1), pullRequest(2, { headRef: 'feature/example' })],
  ]);
  assert.equal(result.exitCode, 1);
  assert.match(result.messages.join('\n'), /#2/);
});

test('develop from a fork sharing the same SHA is rejected', async () => {
  const result = await evaluatePolicy([
    [pullRequest(1), pullRequest(2, { headRepositoryId: 999999 })],
  ]);
  assert.equal(result.exitCode, 1);
});

test('closing the disallowed PR restores the valid PR check', async () => {
  const blocked = await evaluatePolicy([
    [pullRequest(1), pullRequest(2, { headRef: 'feature/example' })],
  ]);
  const restored = await evaluatePolicy([[pullRequest(1)]]);
  assert.equal(blocked.exitCode, 1);
  assert.equal(restored.exitCode, 0);
});

test('disallowed PRs with unrelated SHAs do not block develop', async () => {
  const result = await evaluatePolicy([
    [
      pullRequest(1),
      pullRequest(2, { headRef: 'feature/example', headSha: 'b'.repeat(40) }),
    ],
  ]);
  assert.equal(result.exitCode, 0);
});

test('pagination cannot hide a disallowed PR on a later page', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) =>
    pullRequest(index + 1),
  );
  const result = await evaluatePolicy([
    firstPage,
    [pullRequest(101, { headRef: 'feature/example' })],
  ]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.requests.length, 2);
  assert.match(result.messages.join('\n'), /#101/);
});

test('no matching open PR fails closed instead of publishing reusable success', async () => {
  const result = await evaluatePolicy([[]]);
  assert.equal(result.exitCode, 1);
});

test('GitHub API errors fail closed without exposing the token', async () => {
  const result = await evaluatePolicy([[]], { httpStatus: 403 });
  assert.equal(result.exitCode, 1);
  assert.match(result.messages.join('\n'), /HTTP 403/);
  assert.ok(!result.messages.join('\n').includes('test-token'));
});

test('network errors fail closed', async () => {
  const result = await evaluatePolicy([[]], { networkError: true });
  assert.equal(result.exitCode, 1);
});

test('malformed API responses fail closed', async () => {
  const result = await evaluatePolicy([{ unexpected: true }]);
  assert.equal(result.exitCode, 1);
});

test('deleted source repositories are rejected', async () => {
  const result = await evaluatePolicy([
    [pullRequest(1, { deletedRepository: true })],
  ]);
  assert.equal(result.exitCode, 1);
});

test('wrong target branch or target repository is rejected', async () => {
  for (const options of [
    { baseRef: 'develop' },
    { baseRepositoryId: 999999 },
  ]) {
    const result = await evaluatePolicy([[pullRequest(1, options)]]);
    assert.equal(result.exitCode, 1);
  }
});

test('closed PRs in an unexpected API response are rejected', async () => {
  const result = await evaluatePolicy([[pullRequest(1, { state: 'closed' })]]);
  assert.equal(result.exitCode, 1);
});

test('missing configuration is rejected before any API request', async () => {
  for (const env of [
    { GH_TOKEN: '' },
    { REPOSITORY: '' },
    { REPOSITORY_ID: '' },
    { HEAD_SHA: '' },
  ]) {
    const result = await evaluatePolicy([[]], { env });
    assert.equal(result.exitCode, 1);
    assert.equal(result.requests.length, 0);
  }
});
