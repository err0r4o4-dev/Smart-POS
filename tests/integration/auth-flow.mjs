import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import {
  authOrigin,
  authSQL,
  latestToken,
  mailpit,
  mailIds,
  startAuthClient,
} from './auth-fixtures.mjs';

const base = authOrigin;
const clients = [];
async function clientFor(direct = false) {
  const client = await startAuthClient(direct);
  clients.push(client);
  return client;
}
const client = await clientFor();

const email = `auth-${randomUUID()}@example.test`;
const oldPassword = `Old-password-${randomUUID()}`;
const newPassword = `New-password-${randomUUID()}`;

async function send(
  path,
  body,
  cookie = '',
  csrf = '',
  origin = base,
  source = client,
  extraHeaders = {},
) {
  const response = await fetch(`${source.proxy}/api/v1/auth/${path}`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] || '',
    headers: response.headers,
  };
}

async function current(cookie) {
  const response = await fetch(`${client.proxy}/api/v1/auth/me`, {
    headers: { Cookie: cookie },
  });
  return { status: response.status, body: await response.json() };
}

async function resetToken() {
  const previousIDs = mailIds(email);
  const response = await send('forgot-password', { email });
  assert.equal(response.status, 202);
  assert.deepEqual(response.body, {
    data: {
      message:
        'If an eligible account exists, check your email for reset instructions.',
    },
  });
  return latestToken(email, previousIDs);
}

try {
  const registration = await send('register', {
    email,
    password: oldPassword,
    display_name: 'Integration User',
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.body.data.onboarding, 'PENDING_ORGANIZATION');
  assert.equal(
    (
      await send('register', {
        email,
        password: oldPassword,
        display_name: 'Duplicate',
      })
    ).status,
    409,
  );
  assert.equal(
    (await send('login', { email, password: 'invalid password' })).status,
    401,
  );
  const login = await send('login', { email, password: oldPassword });
  assert.equal(login.status, 200);
  assert.ok(login.cookie.includes('smartpos_session='));
  assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(login.headers.get('set-cookie'), /SameSite=Lax/i);
  assert.ok(
    login.headers
      .get('referrer-policy')
      .split(',')
      .every((value) => value.trim() === 'no-referrer'),
  );
  assert.ok(
    login.headers
      .get('content-security-policy')
      .includes("frame-ancestors 'none'"),
  );
  assert.equal((await current(login.cookie)).status, 200);
  assert.equal((await send('logout', {}, login.cookie)).status, 403);
  assert.equal(
    (
      await send(
        'logout',
        {},
        login.cookie,
        login.body.data.csrf_token,
        'http://not-allowed.invalid',
      )
    ).status,
    403,
  );
  assert.equal(
    (await send('logout', {}, login.cookie, login.body.data.csrf_token)).status,
    200,
  );
  assert.equal((await current(login.cookie)).status, 401);

  const next = await send('login', { email, password: oldPassword });
  assert.equal(next.status, 200);
  const token = await resetToken();
  assert.equal(
    (await send('reset-password', { token, password: newPassword })).status,
    200,
  );
  assert.equal((await current(next.cookie)).status, 401);
  assert.equal(
    (await send('reset-password', { token, password: newPassword })).status,
    400,
  );
  assert.equal(
    (await send('login', { email, password: oldPassword })).status,
    401,
  );
  const finalLogin = await send('login', { email, password: newPassword });
  assert.equal(finalLogin.status, 200);
  const sessionHash = createHash('sha256')
    .update(finalLogin.cookie.split('=')[1])
    .digest('hex');
  authSQL(
    `UPDATE auth_sessions SET created_at=now()-interval '24 hours 1 minute',expires_at=now()-interval '1 minute' WHERE token_hash=decode('${sessionHash}','hex')`,
  );
  assert.equal((await current(finalLogin.cookie)).status, 401);

  const expired = await resetToken();
  const hash = createHash('sha256').update(expired).digest('hex');
  authSQL(
    `UPDATE password_reset_tokens SET created_at=now()-interval '16 minutes',expires_at=now()-interval '1 minute' WHERE token_hash=decode('${hash}','hex')`,
  );
  assert.equal(
    (await send('reset-password', { token: expired, password: oldPassword }))
      .status,
    400,
  );
  console.log(
    'PASS: isolated registration, login, persistence, CSRF/origin, logout, reset, revocation, replay and expiry',
  );
  const unknown = await send('forgot-password', {
    email: `missing-${randomUUID()}@example.test`,
  });
  assert.equal(unknown.status, 202);
  assert.deepEqual(unknown.body, {
    data: {
      message:
        'If an eligible account exists, check your email for reset instructions.',
    },
  });

  for (const headers of [
    {},
    { 'X-Forwarded-For': '198.51.100.1' },
    { 'X-Real-IP': '203.0.113.1' },
    { 'X-Forwarded-For': '198.51.100.1, invalid', 'X-Real-IP': '203.0.113.2' },
  ]) {
    const denied = await send(
      'login',
      {
        email: `limited-${randomUUID()}@example.test`,
        password: 'invalid password',
      },
      '',
      '',
      base,
      client,
      headers,
    );
    assert.equal(denied.status, 429);
    assert.equal(denied.body.error.code, 'RATE_LIMITED');
    assert.equal(denied.headers.get('retry-after'), '600');
  }
  const bucketHash = createHash('sha256')
    .update(`LOGIN:ip:${client.ip}`)
    .digest('hex');
  assert.equal(
    authSQL(
      `SELECT attempts FROM auth_rate_limits WHERE scope='LOGIN' AND key_hash=decode('${bucketHash}','hex')`,
    ),
    '9',
  );

  const independent = await clientFor();
  assert.equal(
    (
      await send(
        'login',
        {
          email: `independent-${randomUUID()}@example.test`,
          password: 'invalid password',
        },
        '',
        '',
        base,
        independent,
      )
    ).status,
    401,
  );
  const sharedAccount = `shared-${randomUUID()}@example.test`;
  for (let attempt = 0; attempt < 4; attempt++) {
    assert.equal(
      (
        await send(
          'login',
          { email: sharedAccount, password: 'invalid password' },
          '',
          '',
          base,
          independent,
        )
      ).status,
      401,
    );
  }
  const another = await clientFor();
  assert.equal(
    (
      await send(
        'login',
        { email: sharedAccount, password: 'invalid password' },
        '',
        '',
        base,
        another,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await send(
        'login',
        { email: sharedAccount, password: 'invalid password' },
        '',
        '',
        base,
        another,
      )
    ).status,
    429,
  );
  assert.equal(
    (
      await send(
        'login',
        {
          email: `other-${randomUUID()}@example.test`,
          password: 'invalid password',
        },
        '',
        '',
        base,
        another,
      )
    ).status,
    401,
  );

  const direct = await clientFor(true);
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await send(
      'login',
      {
        email: `direct-${randomUUID()}@example.test`,
        password: 'invalid password',
      },
      '',
      '',
      base,
      direct,
      {
        'X-Forwarded-For': `198.51.100.${attempt + 1}`,
        'X-Real-IP': `203.0.113.${attempt + 1}`,
      },
    );
    assert.equal(response.status, attempt < 5 ? 401 : 429);
  }
  console.log(
    'PASS: Caddy spoofing denial, direct API spoofing denial, fixed IP/account limits, independent real clients and Retry-After',
  );

  try {
    const failureCheckStarted = new Date().toISOString();
    execFileSync(
      'docker',
      ['compose', '-p', 'smartpos-auth-test', 'stop', 'mailpit'],
      { stdio: 'ignore' },
    );
    const knownFailure = await send(
      'forgot-password',
      { email },
      '',
      '',
      base,
      independent,
    );
    const unknownFailure = await send(
      'forgot-password',
      { email: `smtp-missing-${randomUUID()}@example.test` },
      '',
      '',
      base,
      independent,
    );
    assert.equal(knownFailure.status, 202);
    assert.equal(unknownFailure.status, 202);
    assert.deepEqual(knownFailure.body, unknownFailure.body);
    let observedFailure = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const logs = execFileSync(
        'docker',
        [
          'compose',
          '-p',
          'smartpos-auth-test',
          'logs',
          '--no-color',
          '--since',
          failureCheckStarted,
          'api',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      for (const secret of [email, oldPassword, newPassword, token, expired])
        assert.ok(
          !logs.includes(secret),
          'API log exposed synthetic authentication data',
        );
      if (logs.includes('password reset processing failed')) {
        observedFailure = true;
        break;
      }
      await setTimeout(250);
    }
    assert.ok(observedFailure, 'SMTP failure was not recorded safely');
  } finally {
    execFileSync(
      'docker',
      ['compose', '-p', 'smartpos-auth-test', 'start', 'mailpit'],
      { stdio: 'ignore' },
    );
    let restored = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        mailpit('/api/v1/messages');
        restored = true;
        break;
      } catch {}
      await setTimeout(250);
    }
    assert.ok(restored, 'Isolated Mailpit was not restored');
  }
  console.log(
    'PASS: SMTP outage returns identical public responses, worker failures contain no auth secrets, Mailpit restored',
  );
} finally {
  for (const fixture of clients.reverse()) fixture.close();
}
