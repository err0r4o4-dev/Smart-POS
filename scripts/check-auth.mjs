import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { startAuthClient } from '../tests/integration/auth-fixtures.mjs';

const require = createRequire(import.meta.url);
const client = await startAuthClient();
try {
  const result = spawnSync(
    process.execPath,
    [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        AUTH_E2E: '1',
        E2E_BASE_URL: 'http://localhost:18088',
        AUTH_TEST_PROXY: client.proxy,
      },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  client.close();
}
