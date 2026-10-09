import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  authOrigin,
  authSQL,
  mailpit,
  mailIds,
  startAuthClient,
} from './auth-fixtures.mjs';

const clients = [];
const accounts = [];
async function account(label) {
  const source = await startAuthClient();
  clients.push(source);
  const email = `phase1b-${label}-${randomUUID()}@example.test`;
  const password = `Test-password-${randomUUID()}`;
  const user = { source, email, password, cookie: '', csrf: '', id: '' };
  const registered = await call(user, '/auth/register', 'POST', {
    email,
    password,
    display_name: `ทดสอบ ${label}`,
  });
  assert.equal(registered.status, 201, 'registration');
  const login = await call(user, '/auth/login', 'POST', { email, password });
  assert.equal(login.status, 200, 'login');
  user.cookie = login.cookie;
  user.csrf = login.data.csrf_token;
  user.id = login.data.user.id;
  accounts.push(user);
  return user;
}
async function call(user, path, method = 'GET', body, headers = {}) {
  const response = await fetch(`${user.source.proxy}/api/v1${path}`, {
    method,
    headers: {
      Origin: authOrigin,
      Connection: 'close',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(user.cookie ? { Cookie: user.cookie } : {}),
      ...(user.csrf ? { 'X-CSRF-Token': user.csrf } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  return {
    status: response.status,
    data: result.data,
    error: result.error,
    cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '',
  };
}
export function invitationToken(email, previous = []) {
  const message = mailpit('/api/v1/messages').messages.find(
    (item) =>
      !previous.includes(item.ID) &&
      item.To?.some((recipient) => recipient.Address === email),
  );
  const token =
    message &&
    mailpit(`/api/v1/message/${encodeURIComponent(message.ID)}`).Text.match(
      /#invitation=([A-Za-z0-9_-]+)/,
    )?.[1];
  if (!token) throw new Error('Invitation not delivered to isolated Mailpit');
  return token;
}
const input = (label) => ({
  name: `ร้าน ${label}`,
  code: `TEST-${randomUUID()}`,
  business_type: 'RETAIL',
  contact_email: '',
  contact_phone: '',
  address: '',
  branch: {
    name: 'สาขาหลัก',
    code: 'MAIN',
    address: '',
    phone: '',
    email: '',
    status: 'ACTIVE',
  },
});
async function expectStatus(user, path, method, body, status, headers) {
  const result = await call(user, path, method, body, headers);
  assert.equal(
    result.status,
    status,
    `${method} ${path}: ${result.error?.code ?? ''}`,
  );
  return result.data;
}
async function invite(owner, org, recipient, role, branchIDs) {
  const previous = mailIds(recipient.email);
  const invitation = await expectStatus(
    owner,
    `/organizations/${org}/invitations`,
    'POST',
    { email: recipient.email, role, branch_ids: branchIDs },
    201,
  );
  const token = invitationToken(recipient.email, previous);
  assert.equal('token' in invitation, false);
  assert.equal(
    authSQL(
      `SELECT octet_length(token_hash) FROM organization_invitations WHERE id='${invitation.id}'`,
    ),
    '32',
  );
  return { invitation, token };
}
try {
  const owner = await account('owner');
  const manager = await account('manager');
  const cashier = await account('cashier');
  const other = await account('other');
  const creation = input('A');
  const key = randomUUID();
  const orgA = await expectStatus(
    owner,
    '/organizations',
    'POST',
    creation,
    201,
    { 'Idempotency-Key': key },
  );
  assert.equal(orgA.membership.role, 'OWNER');
  assert.equal(orgA.branches.length, 1);
  assert.equal(orgA.branches[0].is_main, true);
  const replay = await expectStatus(
    owner,
    '/organizations',
    'POST',
    creation,
    201,
    { 'Idempotency-Key': key },
  );
  assert.equal(replay.organization.id, orgA.organization.id);
  await expectStatus(
    owner,
    '/organizations',
    'POST',
    { ...creation, name: 'changed' },
    409,
    { 'Idempotency-Key': key },
  );
  const orgB = await expectStatus(
    other,
    '/organizations',
    'POST',
    input('B'),
    201,
    { 'Idempotency-Key': randomUUID() },
  );
  const orgC = await expectStatus(
    owner,
    '/organizations',
    'POST',
    input('C'),
    201,
    { 'Idempotency-Key': randomUUID() },
  );
  const org = orgA.organization.id;
  const path = `/organizations/${org}`;
  await expectStatus(
    owner,
    `${path}/members/${orgA.membership.id}`,
    'PATCH',
    { role: 'OWNER', status: 'ACTIVE', branch_ids: ['invalid-branch'] },
    400,
  );
  const main = orgA.branches[0].id;
  const branch = await expectStatus(
    owner,
    `${path}/branches`,
    'POST',
    {
      name: 'สาขา 2',
      code: 'TWO',
      address: '',
      phone: '',
      email: '',
      status: 'ACTIVE',
    },
    201,
  );
  await expectStatus(
    owner,
    `${path}/branches`,
    'POST',
    {
      ...branch,
      id: undefined,
      organization_id: undefined,
      is_main: undefined,
    },
    409,
  );
  await expectStatus(
    owner,
    `${path}/branches/${main}`,
    'PATCH',
    { name: 'ไม่ผ่าน CSRF', code: 'MAIN' },
    403,
    { 'X-CSRF-Token': '' },
  );
  await expectStatus(
    owner,
    `${path}/branches`,
    'POST',
    { name: 'Bad', code: 'BAD' },
    403,
    { Origin: 'https://untrusted.example' },
  );
  const managerInvite = await invite(owner, org, manager, 'MANAGER', [main]);
  await expectStatus(
    other,
    '/invitations/accept',
    'POST',
    { token: managerInvite.token },
    404,
  );
  const managerContext = await expectStatus(
    manager,
    '/invitations/accept',
    'POST',
    { token: managerInvite.token },
    200,
  );
  assert.deepEqual(
    managerContext.branches.map((item) => item.id),
    [main],
  );
  await expectStatus(
    manager,
    '/invitations/accept',
    'POST',
    { token: managerInvite.token },
    404,
  );
  const cashierInvite = await invite(manager, org, cashier, 'CASHIER', [main]);
  const cashierContext = await expectStatus(
    cashier,
    '/invitations/accept',
    'POST',
    { token: cashierInvite.token },
    200,
  );
  const member = cashierContext.membership.id;
  await expectStatus(cashier, `${path}/members`, 'GET', undefined, 403);
  await expectStatus(cashier, `${path}/roles`, 'GET', undefined, 403);
  await expectStatus(
    manager,
    `${path}/branches/${branch.id}`,
    'GET',
    undefined,
    404,
  );
  await expectStatus(
    manager,
    `${path}/branches`,
    'POST',
    { name: 'Not allowed', code: 'NO' },
    403,
  );
  await expectStatus(
    manager,
    `${path}/members/${managerContext.membership.id}`,
    'PATCH',
    { role: 'OWNER', status: 'ACTIVE', branch_ids: [main] },
    403,
  );
  await expectStatus(
    manager,
    `${path}/members/${member}`,
    'PATCH',
    { role: 'OWNER', status: 'ACTIVE', branch_ids: [main] },
    403,
  );
  await expectStatus(
    manager,
    `${path}/invitations`,
    'POST',
    { email: other.email, role: 'CASHIER', branch_ids: [branch.id] },
    403,
  );
  await expectStatus(
    owner,
    `${path}/members/${member}`,
    'PATCH',
    { role: 'CASHIER', status: 'ACTIVE', branch_ids: [orgB.branches[0].id] },
    403,
  );
  for (const resource of [
    '',
    '/context',
    '/permissions',
    '/branches',
    '/members',
    '/invitations',
    '/roles',
    '/audit',
  ])
    await expectStatus(
      owner,
      `/organizations/${orgB.organization.id}${resource}`,
      'GET',
      undefined,
      404,
    );
  await expectStatus(
    owner,
    `/organizations/${orgB.organization.id}/branches`,
    'POST',
    { name: 'Cross tenant', code: 'NO' },
    404,
  );
  await expectStatus(
    owner,
    `${path}/members/${orgB.membership.id}`,
    'DELETE',
    undefined,
    404,
  );
  await expectStatus(
    owner,
    `${path}/members/${orgA.membership.id}`,
    'DELETE',
    undefined,
    409,
  );
  await expectStatus(
    owner,
    `${path}/members/${orgA.membership.id}`,
    'PATCH',
    { role: 'OWNER', status: 'SUSPENDED', branch_ids: [] },
    409,
  );
  await expectStatus(
    owner,
    `${path}/members/${orgA.membership.id}`,
    'PATCH',
    { role: 'CASHIER', status: 'ACTIVE', branch_ids: [main] },
    409,
  );
  await expectStatus(
    owner,
    `${path}/members/${member}`,
    'PATCH',
    { role: 'INVENTORY_STAFF', status: 'ACTIVE', branch_ids: [branch.id] },
    200,
  );
  const changed = await expectStatus(
    cashier,
    `${path}/context`,
    'GET',
    undefined,
    200,
  );
  assert.equal(changed.membership.role, 'INVENTORY_STAFF');
  assert.deepEqual(
    changed.branches.map((item) => item.id),
    [branch.id],
  );
  await expectStatus(
    manager,
    `${path}/members/${member}`,
    'GET',
    undefined,
    404,
  );
  await expectStatus(
    owner,
    `${path}/members/${member}`,
    'PATCH',
    { role: 'CASHIER', status: 'SUSPENDED', branch_ids: [main] },
    200,
  );
  await expectStatus(cashier, `${path}/context`, 'GET', undefined, 404);
  await expectStatus(
    owner,
    `${path}/members/${member}`,
    'PATCH',
    { role: 'CASHIER', status: 'ACTIVE', branch_ids: [main] },
    200,
  );
  await expectStatus(
    owner,
    `${path}/members/${member}`,
    'DELETE',
    undefined,
    200,
  );
  await expectStatus(cashier, `${path}/context`, 'GET', undefined, 404);
  const recreated = await invite(owner, org, cashier, 'CASHIER', [main]);
  await expectStatus(
    owner,
    `${path}/invitations/${recreated.invitation.id}`,
    'DELETE',
    undefined,
    200,
  );
  await expectStatus(
    cashier,
    '/invitations/accept',
    'POST',
    { token: recreated.token },
    404,
  );
  const expired = await invite(owner, org, cashier, 'CASHIER', [main]);
  authSQL(
    `UPDATE organization_invitations SET expires_at=now()-interval '1 minute' WHERE id='${expired.invitation.id}'`,
  );
  await expectStatus(
    cashier,
    '/invitations/accept',
    'POST',
    { token: expired.token },
    404,
  );
  const fresh = await invite(owner, org, cashier, 'CASHIER', [main]);
  const accepted = await Promise.all([
    call(cashier, '/invitations/accept', 'POST', { token: fresh.token }),
    call(cashier, '/invitations/accept', 'POST', { token: fresh.token }),
  ]);
  assert.deepEqual(accepted.map((item) => item.status).sort(), [200, 404]);
  assert.equal(
    authSQL(
      `SELECT count(*) FROM organization_memberships WHERE organization_id='${org}' AND user_id='${cashier.id}'`,
    ),
    '1',
  );
  const events = await expectStatus(
    owner,
    `${path}/audit`,
    'GET',
    undefined,
    200,
  );
  assert.ok(events.length >= 10);
  assert.ok(events.every((item) => /^[a-f0-9]{32}$/.test(item.request_id)));
  await expectStatus(
    owner,
    `${path}/branches/${main}`,
    'PATCH',
    { ...creation.branch, status: 'INACTIVE' },
    200,
  );
  const noBranch = await expectStatus(
    manager,
    `${path}/context`,
    'GET',
    undefined,
    200,
  );
  assert.equal(noBranch.branches.length, 0);
  assert.ok(!noBranch.permissions.includes('employee.read'));
  await expectStatus(manager, `${path}/members`, 'GET', undefined, 403);
  await expectStatus(manager, `${path}/roles`, 'GET', undefined, 403);
  await expectStatus(
    owner,
    `${path}/branches/${branch.id}`,
    'PATCH',
    { name: branch.name, code: branch.code, status: 'INACTIVE' },
    409,
  );
  await expectStatus(
    owner,
    `${path}/branches/${main}`,
    'PATCH',
    creation.branch,
    200,
  );
  const outageEmail = `smtp-outage-${randomUUID()}@example.test`;
  execFileSync(
    'docker',
    ['compose', '-p', 'smartpos-auth-test', 'stop', 'mailpit'],
    { stdio: 'ignore' },
  );
  try {
    await expectStatus(
      owner,
      `${path}/invitations`,
      'POST',
      { email: outageEmail, role: 'CASHIER', branch_ids: [main] },
      503,
    );
    assert.equal(
      authSQL(
        `SELECT count(*) FROM organization_invitations WHERE organization_id='${org}' AND email='${outageEmail}'`,
      ),
      '0',
    );
  } finally {
    execFileSync(
      'docker',
      ['compose', '-p', 'smartpos-auth-test', 'start', '--wait', 'mailpit'],
      { stdio: 'ignore' },
    );
  }
  await expectStatus(
    owner,
    `${path}/members/${managerContext.membership.id}`,
    'PATCH',
    { role: 'OWNER', status: 'ACTIVE', branch_ids: [] },
    200,
  );
  const removal = await Promise.all([
    call(owner, `${path}/members/${managerContext.membership.id}`, 'DELETE'),
    call(manager, `${path}/members/${orgA.membership.id}`, 'DELETE'),
  ]);
  assert.equal(removal.filter((item) => item.status === 200).length, 1);
  assert.equal(
    authSQL(
      `SELECT count(*) FROM organization_memberships WHERE organization_id='${org}' AND role='OWNER' AND status='ACTIVE'`,
    ),
    '1',
  );
  const organizationList = await expectStatus(
    owner,
    '/organizations',
    'GET',
    undefined,
    200,
  );
  assert.ok(organizationList.some((item) => item.id === orgC.organization.id));
  assert.ok(!organizationList.some((item) => item.id === orgB.organization.id));
  const log = execFileSync(
    'docker',
    ['compose', '-p', 'smartpos-auth-test', 'logs', '--no-color', 'api'],
    { encoding: 'utf8' },
  );
  for (const user of accounts) {
    assert.ok(!log.includes(user.password));
    assert.ok(!log.includes(user.cookie.split('=')[1]));
  }
  for (const item of [managerInvite, cashierInvite, recreated, expired, fresh])
    assert.ok(!log.includes(item.token));
  assert.equal(
    authSQL(
      "SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname='smartpos_runtime'",
    ),
    'f',
  );
  assert.equal(
    authSQL(
      `SELECT count(*) FROM organization_invitations WHERE token_hash=decode('${createHash('sha256').update(fresh.token).digest('hex')}','hex') AND accepted_at IS NOT NULL`,
    ),
    '1',
  );
  console.log(
    'PASS: organization onboarding/idempotency, branches, scoped manager policy, tenant isolation, CSRF/Origin, role changes, revocation, invitation expiry/replay/concurrency, last-owner concurrency, audits and sanitized logs',
  );
} finally {
  for (const source of clients) source.close();
}
