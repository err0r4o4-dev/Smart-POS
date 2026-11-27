import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

export async function checkMarketBrowser(origin, shops) {
  const browser = await chromium.launch({
    executablePath: process.env.SMARTPOS_MARKET_RELEASE_BROWSER,
    args: ['--disable-background-networking'],
  });
  const covered = shops.find(shop => shop.cover_image_url && shop.settings.category_codes.includes('made-to-order'));
  const madeToOrder = shops.find(shop => shop.organization.code === 'MKT-NIT');
  const screenshot = name => fileURLToPath(new URL(
    `../../../.local/market-pilot/release-browser/${name}.png`, import.meta.url,
  ));
  const imageLoaded = image => expect.poll(() => image.evaluate(
    img => img.complete && img.naturalWidth > 0,
  )).toBe(true);
  const noOverflow = async page => {
    assert.ok(await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth + 1,
    ));
  };
  try {
    for (const width of [360, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 500 });
      page.setDefaultTimeout(8000);
      try {
        await page.route('**/*', route => new URL(route.request().url()).origin === origin
          ? route.continue() : route.abort());
        await page.goto(`${origin}/shop`);
        const card = shop => page.getByRole('article', { name: shop.settings.name, exact: true });
        const madeToOrderFilter = page.getByRole('button', { name: /\u0e2d\u0e32\u0e2b\u0e32\u0e23\u0e15\u0e32\u0e21\u0e2a\u0e31\u0e48\u0e07|Made.to.order/i });
        await madeToOrderFilter.click();
        await expect(page.locator('.landing-shop')).toHaveCount(2);
        const cover = card(covered).locator('.landing-shop-cover img');
        await cover.scrollIntoViewIfNeeded();
        await expect(cover).toHaveAttribute('src', covered.cover_image_url);
        await imageLoaded(cover);

        await expect(card(madeToOrder)).toBeVisible();
        await noOverflow(page);
        await page.screenshot({ path: screenshot(`directory-${width}`) });

        await card(covered).getByRole('link', { name: covered.settings.name, exact: true }).click();
        await expect(page.getByRole('heading', { name: covered.settings.name, exact: true })).toBeVisible();
        const hero = page.locator('.customer-store-cover img');
        await expect(hero).toHaveAttribute('src', covered.cover_image_url);
        await imageLoaded(hero);
        const menuImage = page.locator(`img[src="${covered.items[0].image_url}"]`);
        await menuImage.scrollIntoViewIfNeeded();
        await imageLoaded(menuImage);
        await noOverflow(page);
        await page.screenshot({ path: screenshot(`store-${width}`) });

        if (width === 390) {
          await page.route(`**${covered.cover_image_url}`, route =>
            route.fulfill({ status: 404, body: '' }));
          await page.reload();
          await expect(hero).toHaveAttribute('src', /^\/images\/customer\//);
          await imageLoaded(hero);
          await page.goto(origin);
          await expect(page.locator('.landing-shop img[src^="/images/market-sip-soi/v2/covers/"]').first()).toBeAttached();
        }
      } finally {
        await page.close();
      }
    }
    console.log(`Browser ${browser.version()}: discovery, category filtering, store covers, menu image, failed-cover fallback, and overflow checks at 360/390/1280 px.`);
  } finally {
    await browser.close();
  }
}
