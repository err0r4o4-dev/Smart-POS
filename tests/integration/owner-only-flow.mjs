// Requires two explicitly named, task-labelled disposable Docker containers.
// The DB must use tmpfs and the API must connect to that DB on their shared network.
// Run only after migrations and a published synthetic storefront have been prepared.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const instance = process.env.OWNER_ONLY_INSTANCE;
const dbID = process.env.OWNER_ONLY_DB_CONTAINER;
const apiID = process.env.OWNER_ONLY_API_CONTAINER;
const slug = process.env.OWNER_ONLY_SHOP_SLUG;
const database = 'smartpos_owner_only_acceptance';
if (
  !/^[a-f0-9]{12,32}$/.test(instance ?? '') ||
  !/^[a-f0-9]{64}$/.test(dbID ?? '') ||
  !/^[a-f0-9]{64}$/.test(apiID ?? '') ||
  !/^[a-z][a-z0-9-]{2,49}$/.test(slug ?? '')
) {
  throw new Error(
    'BLOCKED: set OWNER_ONLY_INSTANCE, full OWNER_ONLY_DB_CONTAINER and OWNER_ONLY_API_CONTAINER IDs, and OWNER_ONLY_SHOP_SLUG for the disposable fixture.',
  );
}
function docker(args, input) {
  // Do not expose inspect output or SQL inputs: they can contain credentials or sessions.
  try {
    return execFileSync('docker', args, {
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    }).trim();
  } catch {
    throw new Error(
      'Docker fixture operation failed; verify the isolated task containers and prerequisites.',
    );
  }
}
const inspect = (id) => JSON.parse(docker(['inspect', id]))[0];
const db = inspect(dbID);
const api = inspect(apiID);
for (const container of [db, api]) {
  assert.equal(
    container.State.Running,
    true,
    'fixture container must be running',
  );
  assert.equal(container.Config.Labels?.['smartpos.task'], 'owner-only');
  assert.equal(container.Config.Labels?.['smartpos.task-instance'], instance);
}
assert.ok(
  db.HostConfig.Tmpfs?.['/var/lib/postgresql/data'],
  'database storage must be tmpfs',
);
assert.equal(
  (db.Mounts ?? []).length,
  0,
  'database must not mount a retained volume',
);
const dbEnv = Object.fromEntries(
  db.Config.Env.map((entry) => {
    const i = entry.indexOf('=');
    return [entry.slice(0, i), entry.slice(i + 1)];
  }),
);
const apiEnv = Object.fromEntries(
  api.Config.Env.map((entry) => {
    const i = entry.indexOf('=');
    return [entry.slice(0, i), entry.slice(i + 1)];
  }),
);
assert.equal(dbEnv.POSTGRES_DB, database);
assert.equal(apiEnv.APP_ENV, 'development');
assert.ok(
  !apiEnv.SINGLE_STORE_ORGANIZATION_ID,
  'two-organization fixture requires multi-store mode',
);
const dsn = new URL(apiEnv.DATABASE_URL);
assert.equal(dsn.pathname, `/${database}`);
assert.equal(dsn.port || '5432', '5432');
const shared = Object.keys(db.NetworkSettings.Networks).filter(
  (name) => api.NetworkSettings.Networks[name],
);
assert.equal(shared.length, 1, 'API and DB must share one task network');
const network = JSON.parse(docker(['network', 'inspect', shared[0]]))[0];
assert.equal(network.Labels?.['smartpos.task'], 'owner-only');
assert.equal(network.Labels?.['smartpos.task-instance'], instance);
const dbNetwork = db.NetworkSettings.Networks[shared[0]];
assert.ok(
  [dbNetwork.IPAddress, ...(dbNetwork.Aliases ?? [])].includes(dsn.hostname),
  'API database must resolve to fixture container',
);
const bindings = api.NetworkSettings.Ports?.['8080/tcp'];
assert.equal(bindings?.length, 1);
assert.equal(bindings[0].HostIp, '127.0.0.1');
const base = `http://127.0.0.1:${Number(bindings[0].HostPort)}`;
assert.match(base, /^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/);
const origin = new URL(apiEnv.PUBLIC_ORIGIN);
assert.ok(
  origin.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(origin.hostname) &&
    origin.origin === apiEnv.PUBLIC_ORIGIN,
);
function sql(statement) {
  return docker(
    [
      'exec',
      '-i',
      dbID,
      'psql',
      '-U',
      dbEnv.POSTGRES_USER,
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    statement,
  );
}
const hash = (s) => createHash('sha256').update(s).digest('hex');
const roles = [
  'OWNER',
  'MANAGER',
  'CASHIER',
  'INVENTORY_STAFF',
  'PURCHASING_STAFF',
  'OTHER_OWNER',
  'SUSPENDED_OWNER',
  'REMOVED_OWNER',
  'REVOKED_OWNER',
];
const actors = Object.fromEntries(
  roles.map((role) => {
    const token = randomBytes(32).toString('base64url');
    return [
      role,
      {
        id: randomUUID(),
        membership: randomUUID(),
        token,
        csrf: createHash('sha256')
          .update(`smartpos-csrf-v1:${token}`)
          .digest('base64url'),
      },
    ];
  }),
);
const orgA = randomUUID(),
  orgB = randomUUID(),
  branchA = randomUUID(),
  branchB = randomUUID();
const seed = ['BEGIN;'];
for (const [role, actor] of Object.entries(actors)) {
  seed.push(
    `INSERT INTO users(id,email,email_normalized,password_hash,display_name) VALUES ('${actor.id}','${actor.id}@example.test','${actor.id}@example.test','$argon2id$fixture','${role}');`,
  );
  seed.push(
    `INSERT INTO auth_sessions(user_id,token_hash,csrf_hash,expires_at) VALUES ('${actor.id}',decode('${hash(actor.token)}','hex'),decode('${hash(actor.csrf)}','hex'),now()+interval '1 hour');`,
  );
}
for (const [org, branch, role] of [
  [orgA, branchA, 'OWNER'],
  [orgB, branchB, 'OTHER_OWNER'],
]) {
  seed.push(
    `INSERT INTO organizations(id,name,code,created_by) VALUES ('${org}','Fixture ${org}','${org}','${actors[role].id}');`,
  );
  seed.push(
    `INSERT INTO branches(id,organization_id,code,name,is_main) VALUES ('${branch}','${org}','MAIN','Fixture branch',true);`,
  );
}
for (const [role, actor] of Object.entries(actors)) {
  const org = role === 'OTHER_OWNER' ? orgB : orgA;
  const branch = role === 'OTHER_OWNER' ? branchB : branchA;
  const membershipRole = role.endsWith('OWNER') ? 'OWNER' : role;
  const membershipStatus =
    role === 'SUSPENDED_OWNER'
      ? 'SUSPENDED'
      : role === 'REMOVED_OWNER'
        ? 'REMOVED'
        : 'ACTIVE';
  seed.push(
    `INSERT INTO organization_memberships(id,organization_id,user_id,role,status) VALUES ('${actor.membership}','${org}','${actor.id}','${membershipRole}','${membershipStatus}');`,
  );
  seed.push(
    `INSERT INTO branch_memberships(organization_id,membership_id,branch_id) VALUES ('${org}','${actor.membership}','${branch}');`,
  );
}
seed.push(
  `INSERT INTO organization_audit_events(organization_id,actor_id,event_type,object_id) VALUES ('${orgA}','${actors.OWNER.id}','LEGACY_FIXTURE','${actors.MANAGER.membership}');`,
  `INSERT INTO organization_invitations(organization_id,email,role,branch_ids,token_hash,invited_by,accepted_at) VALUES ('${orgA}','legacy@example.test','MANAGER',ARRAY['${branchA}'::uuid],decode('${hash(randomUUID())}','hex'),'${actors.OWNER.id}',now());`,
  'COMMIT;',
);
sql(seed.join('\n'));
const snapshotSQL = `SELECT json_build_object('users',(SELECT json_agg(row_to_json(t) ORDER BY id) FROM (SELECT * FROM users WHERE id IN (${Object.values(
  actors,
)
  .map((a) => `'${a.id}'`)
  .join(
    ',',
  )})) t),'members',(SELECT json_agg(row_to_json(t) ORDER BY id) FROM (SELECT * FROM organization_memberships WHERE organization_id IN ('${orgA}','${orgB}')) t),'branches',(SELECT json_agg(row_to_json(t) ORDER BY membership_id,branch_id) FROM (SELECT * FROM branch_memberships WHERE organization_id IN ('${orgA}','${orgB}')) t),'invitations',(SELECT json_agg(row_to_json(t) ORDER BY id) FROM (SELECT * FROM organization_invitations WHERE organization_id IN ('${orgA}','${orgB}')) t),'history',(SELECT json_agg(row_to_json(t) ORDER BY id) FROM (SELECT * FROM organization_audit_events WHERE organization_id IN ('${orgA}','${orgB}')) t))::text;`;
const before = JSON.parse(sql(snapshotSQL));
assert.equal(before.users.length, 9);
assert.equal(before.members.length, 9);
assert.equal(before.history.length, 1);
assert.equal(before.invitations.length, 1);
async function request(actor, path, method = 'GET', body) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
    headers: {
      Origin: origin.origin,
      ...(actor
        ? {
            Cookie: `smartpos_session=${actor.token}`,
            'X-CSRF-Token': actor.csrf,
          }
        : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, data: json?.data };
}
async function status(actor, path, expected, method = 'GET', body) {
  const result = await request(actor, path, method, body);
  assert.equal(result.status, expected, `${method} ${path}`);
  return result.data;
}
const publicPaths = [
  '/storefronts',
  `/storefronts/${slug}`,
  `/storefronts/${slug}/products`,
];
const publicBefore = [];
for (const path of publicPaths)
  publicBefore.push(await status(null, path, 200));
const owner = actors.OWNER;
assert.ok(
  (await status(owner, '/organizations', 200)).some((item) => item.id === orgA),
);
assert.equal(
  (await status(owner, `/organizations/${orgA}/context`, 200)).membership.role,
  'OWNER',
);
assert.ok(
  (await status(owner, `/organizations/${orgA}/permissions`, 200)).includes(
    'organization.read',
  ),
);
await status(owner, `/organizations/${orgA}/branches`, 200);
const businessPaths = [
  'products',
  'pos/payment-methods',
  `restaurant/recipes?branch_id=${branchA}`,
];
for (const resource of businessPaths)
  await status(owner, `/organizations/${orgA}/${resource}`, 200);
for (const role of roles.slice(1, 5)) {
  assert.ok(
    !(await status(actors[role], '/organizations', 200)).some(
      (item) => item.id === orgA,
    ),
    `${role} list`,
  );
  for (const resource of ['context', 'permissions', 'branches', 'products'])
    await status(actors[role], `/organizations/${orgA}/${resource}`, 403);
  for (const resource of businessPaths)
    await status(actors[role], `/organizations/${orgA}/${resource}`, 403);
  await status(actors[role], `/organizations/${orgA}/branches`, 403, 'POST', {
    name: 'Denied branch',
    code: 'DENIED',
    address: '',
    phone: '',
    email: '',
    status: 'ACTIVE',
  });
}
for (const role of ['SUSPENDED_OWNER', 'REMOVED_OWNER']) {
  await status(actors[role], '/auth/me', 200);
  assert.ok(
    !(await status(actors[role], '/organizations', 200)).some(
      (item) => item.id === orgA,
    ),
  );
  for (const resource of ['context', ...businessPaths])
    await status(actors[role], `/organizations/${orgA}/${resource}`, 404);
}
const revoked = actors.REVOKED_OWNER;
await status(revoked, `/organizations/${orgA}/context`, 200);
await status(revoked, `/organizations/${orgA}/pos/payment-methods`, 200);
sql(
  `UPDATE organization_memberships SET role='MANAGER' WHERE id='${revoked.membership}';`,
);
try {
  await status(revoked, '/auth/me', 200);
  assert.ok(
    !(await status(revoked, '/organizations', 200)).some(
      (item) => item.id === orgA,
    ),
  );
  for (const resource of ['context', ...businessPaths])
    await status(revoked, `/organizations/${orgA}/${resource}`, 403);
} finally {
  sql(
    `UPDATE organization_memberships SET role='OWNER' WHERE id='${revoked.membership}';`,
  );
}
await status(null, '/organizations', 401);
await status(null, `/organizations/${orgA}/context`, 401);
for (const resource of ['context', 'permissions', 'branches', 'products']) {
  await status(owner, `/organizations/${orgB}/${resource}`, 404);
  await status(actors.OTHER_OWNER, `/organizations/${orgA}/${resource}`, 404);
}
const retired = [
  ['POST', '/invitations/accept', { token: 'fixture' }],
  ['GET', `/organizations/${orgA}/roles`],
  ['GET', `/organizations/${orgA}/members`],
  ['GET', `/organizations/${orgA}/members/${actors.MANAGER.membership}`],
  [
    'PATCH',
    `/organizations/${orgA}/members/${actors.MANAGER.membership}`,
    { role: 'OWNER', status: 'ACTIVE', branch_ids: [branchA] },
  ],
  ['DELETE', `/organizations/${orgA}/members/${actors.MANAGER.membership}`],
  ['GET', `/organizations/${orgA}/invitations`],
  [
    'POST',
    `/organizations/${orgA}/invitations`,
    { email: 'nobody@example.test', role: 'CASHIER', branch_ids: [branchA] },
  ],
  ['DELETE', `/organizations/${orgA}/invitations/${randomUUID()}`],
];
for (const [method, path, body] of retired)
  await status(owner, path, 404, method, body);
for (let i = 0; i < publicPaths.length; i++)
  assert.deepEqual(
    await status(null, publicPaths[i], 200),
    publicBefore[i],
    `public ${publicPaths[i]}`,
  );
assert.deepEqual(
  JSON.parse(sql(snapshotSQL)),
  before,
  'legacy users, memberships, branch assignments and audit history changed',
);
console.log(
  'PASS: owner access; legacy, suspended and removed roles denied; live role revocation; anonymous and cross-organization denial; retired endpoints; preserved fixture records and public storefront responses',
);
