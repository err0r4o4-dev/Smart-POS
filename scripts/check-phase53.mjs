import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

if (!/^smartpos_phase53_[a-z0-9_]+$/.test(process.env.AUTH_TEST_DATABASE ?? ''))
  throw new Error(
    'Phase 5.3 acceptance requires an explicit isolated scratch DB',
  );
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
  'browser',
];
const results = [];
mkdirSync('.local', { recursive: true });
for (const name of suites) {
  const started = Date.now();
  console.log(`START ${name} ${new Date().toISOString()}`);
  const args =
    name === 'browser'
      ? ['scripts/check-auth.mjs', '--workers=1']
      : [`tests/integration/${name}.mjs`];
  const result = spawnSync(process.execPath, args, {
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 8_000_000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  writeFileSync(`.local/phase53-${name}.log`, output);
  const status = result.error || result.status !== 0 ? 'FAILED' : 'PASSED';
  results.push({ name, status, seconds: (Date.now() - started) / 1000 });
  console.log(output.trim());
  console.log(`RESULT ${name} ${status} ${results.at(-1).seconds}s`);
  writeFileSync(
    '.local/phase53-regression-results.json',
    JSON.stringify(results, null, 2),
  );
}
process.exitCode = results.some((result) => result.status !== 'PASSED') ? 1 : 0;
