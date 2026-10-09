import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const base = process.env.AUTH_TEST_URL || 'http://localhost:18088';
const project = process.env.AUTH_TEST_PROJECT || 'smartpos-auth-test';
if (
  !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base) ||
  project !== 'smartpos-auth-test'
) {
  throw new Error(
    'Authentication tests require the isolated local auth-test stack',
  );
}

const email = `auth-${randomUUID()}@example.test`;
const oldPassword = `Old-password-${randomUUID()}`;
const newPassword = `New-password-${randomUUID()}`;

async function send(path, body, cookie = '', csrf = '', origin = base) {
  const response = await fetch(`${base}/api/v1/auth/${path}`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] || '',
  };
}

async function current(cookie) {
  const response = await fetch(`${base}/api/v1/auth/me`, {
    headers: { Cookie: cookie },
  });
  return { status: response.status, body: await response.json() };
}

function mailpit(path) {
  const content = execFileSync(
    'docker',
    [
      'compose',
      '-p',
      project,
      'exec',
      '-T',
      'api',
      'wget',
      '-qO-',
      `http://mailpit:8025${path}`,
    ],
    { encoding: 'utf8' },
  );
  return JSON.parse(content);
}

async function resetToken() {
  const response = await send('forgot-password', { email });
  assert.equal(response.status, 202);
  const messages = mailpit('/api/v1/messages').messages;
  const message = messages.find((item) =>
    item.To?.some((recipient) => recipient.Address === email),
  );
  assert.ok(message, 'reset message not delivered');
  const body = mailpit(
    `/api/v1/message/${encodeURIComponent(message.ID)}`,
  ).Text;
  const match = body.match(/reset-password\?token=([A-Za-z0-9_-]+)/);
  assert.ok(match, 'reset link missing');
  return match[1];
}

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
assert.equal(
  (await send('login', { email, password: newPassword })).status,
  200,
);

const expired = await resetToken();
const hash = createHash('sha256').update(expired).digest('hex');
execFileSync(
  'docker',
  [
    'compose',
    '-p',
    project,
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'smartpos_dev',
    '-d',
    'smartpos',
    '-q',
    '-c',
    `UPDATE password_reset_tokens SET expires_at=now()-interval '1 minute' WHERE token_hash=decode('${hash}','hex')`,
  ],
  { stdio: 'ignore' },
);
assert.equal(
  (await send('reset-password', { token: expired, password: oldPassword }))
    .status,
  400,
);
console.log(
  'PASS: isolated registration, login, persistence, CSRF/origin, logout, reset, revocation, replay and expiry',
);
