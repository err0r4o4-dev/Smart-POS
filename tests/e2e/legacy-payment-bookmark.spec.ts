import { expect, test } from '@playwright/test';

const legacy = '/manage/settings/storefront/payments?source=bookmark#details';
const sandbox =
  '/api/v1/organizations/test-restaurant/storefront/payment-sandbox';
const organization = { id: 'test-restaurant', name: 'Test restaurant' };

for (const width of [360, 390, 768, 1280]) {
  test.describe(`Legacy payment bookmark at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 768 });

    for (const allowed of [true, false]) {
      test(
        allowed ? 'opens authorized settings' : 'denies missing permission',
        async ({ page, baseURL }) => {
          const origin = new URL(baseURL!).origin;
          const calls: string[] = [];
          const unexpected: string[] = [];
          const responses: Record<string, unknown> = {
            '/api/v1/auth/me': {
              user: {
                id: 'test-owner',
                display_name: 'Test Owner',
                email: 'owner@example.test',
                email_verified: true,
                status: 'ACTIVE',
              },
              csrf_token: 'synthetic-csrf',
            },
            '/api/v1/organizations': [organization],
            '/api/v1/organizations/test-restaurant/context': {
              organization,
              membership: { role: 'OWNER', status: 'ACTIVE' },
              branches: [{ id: 'test-branch', name: 'Test branch' }],
              permissions: allowed ? ['storefront.manage'] : [],
            },
            '/api/v1/organizations/test-restaurant/restaurant/setup': {
              completed: true,
              readiness: { ready: true, incomplete: [] },
              steps: [],
            },
            [sandbox]: {
              provider: 'stripe',
              mode: 'test',
              configured: false,
              amount_minor: 2000,
              currency: 'thb',
              customer_checkout_enabled: false,
            },
          };
          await page.route('**/*', async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== origin) return route.abort();
            if (!url.pathname.startsWith('/api/')) return route.continue();
            calls.push(url.pathname);
            if (
              request.method() !== 'GET' ||
              !Object.hasOwn(responses, url.pathname)
            ) {
              unexpected.push(`${request.method()} ${url.pathname}`);
              return route.abort();
            }
            return route.fulfill({ json: { data: responses[url.pathname] } });
          });
          await page.goto(legacy);
          if (allowed) {
            await expect(page).toHaveURL(
              new URL('/settings/payments?source=bookmark#details', origin)
                .href,
            );
            await expect.poll(() => calls).toContain(sandbox);
            await expect(
              page.getByRole('heading', { level: 1, name: /Stripe/ }),
            ).toBeVisible();
          } else {
            await expect(page).toHaveURL(new URL('/403', origin).href);
            await expect(page.getByText(/403/)).toBeVisible();
            expect(calls).not.toContain(sandbox);
          }
          expect(unexpected).toEqual([]);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
        },
      );
    }
  });
}
