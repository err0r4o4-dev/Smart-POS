import { spawnSync } from 'node:child_process';
import { adjustmentsFixture } from './adjustments-fixtures.mjs';

export function assertCustomerEnvironment() {
  const database = process.env.AUTH_TEST_DATABASE ?? '';
  if (!/^smartpos_phase53_phase54_[a-z0-9_]+$/.test(database))
    throw new Error('Customer acceptance requires explicit Phase54 scratch DB');
  const result = spawnSync(
    'docker',
    [
      'compose',
      '-p',
      'smartpos-auth-test',
      'exec',
      '-T',
      '-e',
      `PHASE54_EXPECTED_DATABASE=${database}`,
      'api',
      'sh',
      '-c',
      'case "$DATABASE_URL" in *"@postgres:5432/$PHASE54_EXPECTED_DATABASE?"*|*"@postgres:5432/$PHASE54_EXPECTED_DATABASE") exit 0;; *) exit 1;; esac',
    ],
    { encoding: 'utf8' },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      'Isolated API database target does not match the approved Phase54 scratch DB',
    );
}
export async function customersFixture() {
  assertCustomerEnvironment();
  return adjustmentsFixture();
}
