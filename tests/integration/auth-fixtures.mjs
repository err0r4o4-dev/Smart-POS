import { execFileSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

export const authOrigin = 'http://localhost:18088';
const project = 'smartpos-auth-test';
const testsDirectory = resolve('tests');

export function assertAuthEnvironment() {
  if (
    (process.env.AUTH_TEST_PROJECT &&
      process.env.AUTH_TEST_PROJECT !== project) ||
    (process.env.AUTH_TEST_URL && process.env.AUTH_TEST_URL !== authOrigin)
  ) {
    throw new Error(
      'Authentication checks only support the isolated local auth-test stack',
    );
  }
}

export async function startAuthClient(direct = false) {
  assertAuthEnvironment();
  const network = `${project}_${direct ? 'data' : 'edge'}`;
  const [configuration] = JSON.parse(
    execFileSync('docker', ['network', 'inspect', network], {
      encoding: 'utf8',
    }),
  );
  const [subnet, prefixText] = configuration.IPAM.Config.find((item) =>
    item.Subnet.includes('.'),
  ).Subnet.split('/');
  const prefix = Number(prefixText);
  if (prefix < 16 || prefix > 28)
    throw new Error('Unsupported isolated client subnet');
  const networkAddress = subnet
    .split('.')
    .reduce((value, octet) => value * 256 + Number(octet), 0);
  const allocated = new Set(
    Object.values(configuration.Containers ?? {}).map(
      (item) => item.IPv4Address.split('/')[0],
    ),
  );
  let ip;
  for (let attempt = 0; attempt < 32; attempt++) {
    const address = networkAddress + randomInt(2, 2 ** (32 - prefix) - 1);
    const candidate = [24, 16, 8, 0]
      .map((shift) => (address >>> shift) & 255)
      .join('.');
    if (allocated.has(candidate)) continue;
    const hashes = ['LOGIN', 'REGISTER', 'FORGOT', 'RESET'].map(
      (scope) =>
        `decode('${createHash('sha256').update(`${scope}:ip:${candidate}`).digest('hex')}','hex')`,
    );
    if (
      authSQL(
        `SELECT count(*) FROM auth_rate_limits WHERE window_end>now() AND key_hash IN (${hashes.join(',')})`,
      ) === '0'
    ) {
      ip = candidate;
      break;
    }
  }
  if (!ip)
    throw new Error('No unused isolated test client identity is available');
  const container = execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '--detach',
      '--pull',
      'never',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      '1000:1000',
      '--network',
      direct ? `${project}_edge` : network,
      ...(!direct ? ['--ip', ip] : []),
      '--publish',
      '127.0.0.1::8081',
      '--mount',
      `type=bind,source=${testsDirectory},target=/checks,readonly`,
      '--env',
      `AUTH_CLIENT_UPSTREAM=${direct ? 'api:8080' : 'caddy:8088'}`,
      'node:24-alpine',
      'node',
      '/checks/integration/auth-client.mjs',
    ],
    { encoding: 'utf8' },
  ).trim();
  if (!/^[a-f0-9]{64}$/.test(container))
    throw new Error('Invalid test container identity');
  const close = () =>
    execFileSync('docker', ['rm', '--force', container], { stdio: 'ignore' });
  try {
    if (direct)
      execFileSync(
        'docker',
        ['network', 'connect', '--ip', ip, network, container],
        { stdio: 'ignore' },
      );
    const binding = execFileSync('docker', ['port', container, '8081/tcp'], {
      encoding: 'utf8',
    }).trim();
    if (!/^127\.0\.0\.1:\d+$/.test(binding))
      throw new Error('Test client must bind loopback');
    const proxy = `http://${binding}`;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const response = await fetch(`${proxy}/health/live`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) return { proxy, ip, close };
      } catch {}
      await setTimeout(100);
    }
    throw new Error('Isolated authentication client did not become ready');
  } catch (error) {
    close();
    throw error;
  }
}

export function mailpit(path) {
  return JSON.parse(
    execFileSync(
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
    ),
  );
}

export function mailIds(email) {
  return mailpit('/api/v1/messages')
    .messages.filter((message) =>
      message.To?.some((recipient) => recipient.Address === email),
    )
    .map((message) => message.ID);
}

export async function latestToken(email, previousIDs) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const message = mailpit('/api/v1/messages').messages.find(
      (item) =>
        !previousIDs.includes(item.ID) &&
        item.To?.some((recipient) => recipient.Address === email),
    );
    if (message) {
      const token = mailpit(
        `/api/v1/message/${encodeURIComponent(message.ID)}`,
      ).Text.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1];
      if (!token) throw new Error('Reset link missing from test mailbox');
      return token;
    }
    await setTimeout(250);
  }
  throw new Error(
    'New reset message was not delivered within the bounded wait',
  );
}

export function authSQL(statement) {
  const database = process.env.AUTH_TEST_DATABASE ?? 'smartpos';
  if (
    database !== 'smartpos' &&
    !/^smartpos_phase53_[a-z0-9_]+$/.test(database)
  )
    throw new Error('Unsafe isolated test database');
  return execFileSync(
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
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();
}
