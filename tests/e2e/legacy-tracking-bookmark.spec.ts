import { expect, test } from '@playwright/test';

const shop = '/shop/restaurant-a';
const tracking = '/api/v1/storefronts/restaurant-a/track';
const session = '/api/v1/auth/me';
const order = 'order-a';
const proof = 'b'.repeat(64);

for (const width of [360, 390, 1280]) {
  test.describe(`Legacy tracking bookmark at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 768 });

    for (const fragment of [false, true]) {
      test(
        fragment
          ? 'sends proof only in the tracking request body'
          : 'does not use query proof',
        async ({ page, baseURL }) => {
          const origin = new URL(baseURL!).origin;
          const requests: Array<{
            path: string;
            method: string;
            hasBodyProof: boolean;
            hasCookie: boolean;
            hasRefererProof: boolean;
          }> = [];
          await page.addInitScript(() => {
            localStorage.setItem('smartpos.language', 'en');
          });
          await page
            .context()
            .addCookies([
              { name: 'fixture_cookie', value: 'synthetic', url: origin },
            ]);
          await page.route('**/*', async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin !== origin) return route.abort();
            if (!url.pathname.startsWith('/api/')) return route.continue();
            const headers = await request.allHeaders();
            requests.push({
              path: url.pathname + url.search,
              method: request.method(),
              hasBodyProof:
                request.postData() ===
                JSON.stringify({ order_id: order, access_token: proof }),
              hasCookie: Boolean(headers.cookie),
              hasRefererProof: (headers.referer ?? '').includes(proof),
            });
            if (url.pathname === session && request.method() === 'GET') {
              return route.fulfill({
                status: 401,
                json: {
                  error: {
                    code: 'UNAUTHENTICATED',
                    message: 'Sign in required',
                  },
                },
              });
            }
            if (url.pathname !== tracking) return route.abort();
            return route.fulfill({
              status: 404,
              json: {
                error: { code: 'NOT_FOUND', message: 'Order not found' },
              },
            });
          });

          const suffix = fragment
            ? `?payment_return=1#access=${proof}`
            : `?source=bookmark&access=${proof}`;
          const documentResponse = await page.goto(
            `${shop}/track/${order}${suffix}`,
          );
          expect(await documentResponse?.headerValue('referrer-policy')).toBe(
            'no-referrer',
          );
          await expect(page).toHaveURL(
            `${origin}${shop}/orders/${order}${suffix}`,
          );
          await expect(
            page.getByRole('heading', { name: 'My order' }),
          ).toBeVisible();
          const orderRequests = () =>
            requests.filter(({ path }) => path !== session);
          if (fragment) {
            await expect(
              page.getByText('Order not found', { exact: true }),
            ).toBeVisible();
            expect(orderRequests()).toEqual([
              {
                path: tracking,
                method: 'POST',
                hasBodyProof: true,
                hasCookie: false,
                hasRefererProof: false,
              },
            ]);
          } else {
            await expect(
              page.getByText(/Incomplete tracking link/),
            ).toBeVisible();
            expect(orderRequests()).toEqual([]);
          }
          expect(requests.some(({ hasRefererProof }) => hasRefererProof)).toBe(
            false,
          );
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
        },
      );
    }
  });
}
