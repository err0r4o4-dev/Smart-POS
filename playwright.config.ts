import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8088',
    trace: 'retain-on-failure',
    ...(process.env.AUTH_TEST_PROXY
      ? {
          proxy: { server: process.env.AUTH_TEST_PROXY },
          launchOptions: { args: ['--proxy-bypass-list=<-loopback>'] },
        }
      : {}),
  },
});
