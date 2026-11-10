import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const productionPolicy = readFileSync('infra/caddy/Caddyfile', 'utf8').match(
  /Content-Security-Policy "([^"]+)"/,
)![1];

for (const width of [320, 768, 1440]) {
  test(`four-step setup map and confirmation at ${width}px with isolated API`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const origin = new URL(baseURL!).origin;
    const organization = {
      id: 'org',
      name: 'Test restaurant',
      code: 'SHOP',
      business_type: 'RESTAURANT',
      status: 'ACTIVE',
      address: 'Bangkok',
      contact_email: '',
      contact_phone: '',
    };
    const modes = { dine_in: true, takeaway: true, delivery: false };
    let location:
      | {
          latitude: number;
          longitude: number;
          address: string;
          details: string;
          confirmed: boolean;
        }
      | undefined;
    const profiles: Record<string, unknown>[] = [];
    const tiles: string[] = [];
    let failTiles = width === 320;
    const state = () => ({
      organization_id: 'org',
      branch_id: 'branch',
      current_step: 'menu',
      completed: false,
      ready: Boolean(location),
      readiness: { ready: Boolean(location), incomplete: [] },
      steps: [],
      location,
      profile: { organization, service_modes: modes },
      services: modes,
      tables: {
        zones: [{ name: 'Main' }],
        tables: [{ name: 'One', zone: 'Main', seats: 4 }],
        qr_enabled: false,
      },
      menu: {
        categories: [{ name: 'Food' }],
        items: [{ name: 'Rice', category: 'Food', price: '50' }],
      },
    });
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (
            _success: unknown,
            failure: (error: { code: number }) => void,
          ) => failure({ code: 1 }),
        },
      });
    });
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.hostname === 'tile.openstreetmap.org') {
        tiles.push(url.pathname);
        if (failTiles) return route.abort();
        return route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
            'base64',
          ),
        });
      }
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) {
        if (
          process.env.SETUP_TEST_CSP === 'production' &&
          request.isNavigationRequest()
        ) {
          const response = await route.fetch();
          return route.fulfill({
            response,
            headers: {
              ...response.headers(),
              'content-security-policy': productionPolicy,
              'permissions-policy':
                'camera=(), microphone=(), geolocation=(self)',
              'referrer-policy': 'no-referrer',
            },
          });
        }
        return route.continue();
      }
      let data: unknown;
      if (url.pathname === '/api/v1/auth/me')
        data = {
          user: {
            id: 'user',
            email: 'owner@example.test',
            display_name: 'Owner',
            status: 'ACTIVE',
            email_verified: true,
          },
          csrf_token: 'mock-csrf',
        };
      else if (url.pathname === '/api/v1/organizations') data = [organization];
      else if (url.pathname === '/api/v1/organizations/org/context')
        data = {
          organization,
          membership: {
            role: 'OWNER',
            status: 'ACTIVE',
            branch_ids: ['branch'],
            permissions: [],
          },
          branches: [
            {
              id: 'branch',
              organization_id: 'org',
              name: 'Main',
              code: 'MAIN',
              status: 'ACTIVE',
              is_main: true,
            },
          ],
          permissions: [],
        };
      else if (
        url.pathname === '/api/v1/organizations/org/restaurant/setup/profile' &&
        request.method() === 'PUT'
      ) {
        const body = request.postDataJSON();
        profiles.push(body);
        location = body.location;
        data = state();
      } else if (
        url.pathname === '/api/v1/organizations/org/restaurant/setup' ||
        (request.method() === 'PUT' &&
          /\/setup\/(menu|payments|orders)$/.test(url.pathname))
      )
        data = state();
      else
        return route.fulfill({
          status: 404,
          json: { error: { message: 'Unexpected mock request' } },
        });
      return route.fulfill({ json: { data } });
    });
    await page.goto('/setup');
    await expect(
      page.getByRole('heading', { name: 'ตำแหน่งร้าน', exact: true }),
    ).toBeVisible();
    expect(tiles).toHaveLength(0);
    await expect(page.getByLabel('ละติจูด')).toBeEmpty();
    await expect(
      page.getByRole('button', { name: 'ยืนยันตำแหน่งร้าน' }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'ใช้ตำแหน่งปัจจุบัน' }).click();
    await expect(page.getByRole('alert')).toContainText('ตำแหน่ง');
    await page.getByRole('button', { name: 'เปิดแผนที่', exact: true }).click();
    const map = page.locator('.setup-location-map');
    if (width === 320) {
      await expect(page.getByRole('alert')).toContainText('แผนที่');
      failTiles = false;
      await page
        .getByRole('button', { name: 'ปิดแผนที่เพื่อเปิดใหม่' })
        .click();
      await page
        .getByRole('button', { name: 'เปิดแผนที่', exact: true })
        .click();
    }
    await expect(map.locator('.leaflet-control-zoom-in')).toBeVisible();
    await expect(map.getByText('OpenStreetMap', { exact: true })).toBeVisible();
    await expect.poll(() => tiles.length).toBeGreaterThan(0);
    await map.locator('.leaflet-control-zoom-in').focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => tiles.some((path) => path.startsWith('/14/')))
      .toBe(true);
    const pane = map.locator('.leaflet-map-pane');
    const beforePan = await pane.getAttribute('style');
    const box = (await map.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 40,
      box.y + box.height / 2 + 25,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect.poll(() => pane.getAttribute('style')).not.toBe(beforePan);
    await map.click({ position: { x: 100, y: 150 } });
    await expect(page.getByLabel('ละติจูด')).not.toBeEmpty();
    await expect(page.getByLabel('ลองจิจูด')).not.toBeEmpty();
    await page.getByLabel('ที่อยู่ร้าน', { exact: true }).fill('Bangkok');
    await page.getByRole('button', { name: 'ยืนยันตำแหน่งร้าน' }).click();
    await expect(page.getByRole('status')).toHaveText('ยืนยันตำแหน่งแล้ว');
    await map.click({ position: { x: 130, y: 170 } });
    await expect(page.getByRole('status')).not.toHaveText('ยืนยันตำแหน่งแล้ว');
    await page.getByRole('button', { name: 'ยืนยันตำแหน่งร้าน' }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`setup-map-${width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: /บันทึกและถัดไป/ }).click();
    await expect(
      page.getByRole('heading', { name: 'เมนูและรับเงิน', exact: true }),
    ).toBeVisible();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      branch_id: 'branch',
      location: { confirmed: true, address: 'Bangkok' },
    });
    await expect(page.getByLabel('VAT (%)', { exact: true })).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'เมนูและรับเงิน', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: /ย้อนกลับ/ }).click();
    await expect(page.getByRole('status')).toHaveText('ยืนยันตำแหน่งแล้ว');
    await expect(page.getByLabel('ละติจูด')).toHaveValue(
      String(location!.latitude),
    );
    await page
      .getByLabel('ที่อยู่ร้าน', { exact: true })
      .fill('Different entrance');
    await expect(page.getByRole('status')).not.toHaveText('ยืนยันตำแหน่งแล้ว');
    await page.getByRole('button', { name: /บันทึกและถัดไป/ }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'ตำแหน่งร้าน', exact: true }),
    ).toBeVisible();
    console.log(
      `Browser: ${page.context().browser()?.version()}; viewport ${width}x900; synthetic API and tiles only`,
    );
  });
}
