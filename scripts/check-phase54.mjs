import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertCustomerEnvironment } from '../tests/integration/customers-fixtures.mjs';
if (
  !/^smartpos_phase53_phase54_[a-z0-9_]+$/.test(
    process.env.AUTH_TEST_DATABASE ?? '',
  )
)
  throw new Error('Phase54 acceptance requires explicit retained scratch DB');
assertCustomerEnvironment();
const suites = [
  'auth-flow',
  'organization-flow',
  'catalog-flow',
  'inventory-flow',
  'pos-flow',
  'pos-safety',
  'purchasing-flow',
  'purchasing-safety',
  'returns-flow',
  'returns-safety',
  'returns-shelves',
  'adjustments-flow',
  'adjustments-safety',
  'adjustments-boundaries',
  'pricing-flow',
  'pricing-safety',
  'customers-flow',
  'customers-safety',
  ...(process.argv.includes('--api-only') ? [] : ['browser']),
];
const results = [];
mkdirSync('.local', { recursive: true });
for (const name of suites) {
  const started = Date.now();
  console.log(`START ${name} ${new Date().toISOString()}`);
  const result = spawnSync(
    process.execPath,
    name === 'browser'
      ? ['scripts/check-auth.mjs', '--workers=1']
      : [`tests/integration/${name}.mjs`],
    { env: process.env, encoding: 'utf8', maxBuffer: 8_000_000 },
  );
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  writeFileSync(`.local/phase54-${name}.log`, output);
  const status = result.error || result.status !== 0 ? 'FAILED' : 'PASSED';
  results.push({ name, status, seconds: (Date.now() - started) / 1000 });
  console.log(output.trim());
  console.log(`RESULT ${name} ${status}`);
  writeFileSync(
    '.local/phase54-regression-results.json',
    JSON.stringify(results, null, 2),
  );
}
process.exitCode = results.some((result) => result.status !== 'PASSED') ? 1 : 0;
