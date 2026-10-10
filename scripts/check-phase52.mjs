import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

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
];
const results = [];
mkdirSync('.local', { recursive: true });
for (const name of [...suites, 'browser']) {
  const started = Date.now();
  console.log(`START ${name} ${new Date().toISOString()}`);
  const args =
    name === 'browser'
      ? ['scripts/check-auth.mjs', '--workers=1']
      : [`tests/integration/${name}.mjs`];
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: process.env,
  });
  const status = result.error || result.status !== 0 ? 'FAILED' : 'PASSED';
  results.push({ name, status, seconds: (Date.now() - started) / 1000 });
  console.log(`RESULT ${name} ${status} ${results.at(-1).seconds}s`);
  writeFileSync(
    '.local/phase52-regression-results.json',
    JSON.stringify(results, null, 2),
  );
}
process.exitCode = results.some((result) => result.status !== 'PASSED') ? 1 : 0;
