import { expect, test } from '@playwright/test';

const shops = [
  {
    slug: 'yam',
    name: 'yam',
    accepting_orders: true,
    business_type: 'RESTAURANT',
  },
  {
    slug: 'closed',
    name: 'ร้านอาหารทดสอบชื่อยาวสำหรับตรวจการตัดบรรทัดบนหน้าจอมือถือ',
    accepting_orders: false,
    business_type: 'cafe',
  },
];

test.beforeEach(async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin || request.method() !== 'GET')
      return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/v1/storefronts') {
      return route.fulfill({ json: { data: shops } });
    }
    if (url.pathname === '/api/v1/auth/me') {
      return route.fulfill({
        status: 401,
        json: { error: { code: 'UNAUTHORIZED' } },
      });
    }
    return route.abort();
  });
});

for (const width of [320, 390, 540, 541, 767, 768, 1024, 1279, 1280, 1672]) {
  test('directory remains usable at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 941 });
    await page.goto('/shop');
    await expect(
      page.getByRole('heading', { name: 'yam', exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const sizes = await page.evaluate(() => {
      const fontSize = (selector: string) =>
        Number.parseFloat(
          getComputedStyle(document.querySelector(selector)!).fontSize,
        );
      return {
        title: fontSize('.shop-directory-hero h1'),
        store: fontSize('.shop-directory-store-copy h3'),
        search: fontSize('.shop-directory-search input'),
        header: document
          .querySelector('.storefront-header')!
          .getBoundingClientRect().height,
        targets: Array.from(
          document.querySelectorAll(
            '.shop-directory-view button, .language-switcher button, .shop-directory-type-toggle, .shop-directory-card > .button',
          ),
        ).map((element) => element.getBoundingClientRect().height),
      };
    });
    expect(sizes.title).toBeLessThanOrEqual(36);
    expect(sizes.store).toBe(16);
    expect(sizes.search).toBe(16);
    await expect(page.locator('.storefront-header-left > .tag')).toHaveCount(0);
    const detailSizes = await page.evaluate(() => ({
      description: Number.parseFloat(
        getComputedStyle(document.querySelector('.shop-directory-hero p')!)
          .fontSize,
      ),
      footer: Number.parseFloat(
        getComputedStyle(
          document.querySelector('.shop-directory-footer > small')!,
        ).fontSize,
      ),
      footerHeight: document
        .querySelector('.shop-directory-footer')!
        .getBoundingClientRect().height,
    }));
    expect(detailSizes.description).toBe(14);
    expect(detailSizes.footer).toBe(13);
    const footer = page.locator('.shop-directory-footer');
    await expect(footer.getByRole('navigation')).toBeVisible();
    await expect(footer.getByRole('navigation').getByRole('link')).toHaveCount(
      2,
    );
    await expect(footer).toContainText('VELOPOS · Smart POS Platform');
    await expect(
      footer.getByRole('link', { name: 'เงื่อนไขการให้บริการ' }),
    ).toBeVisible();
    await expect(
      footer.getByRole('link', { name: 'นโยบายความเป็นส่วนตัว' }),
    ).toBeVisible();
    const surfaces = await page.evaluate(() => {
      const shell = document.querySelector('.shop-directory-shell')!;
      const footer = document.querySelector('.shop-directory-footer')!;
      return {
        background: getComputedStyle(shell).backgroundImage,
        footerBackground: getComputedStyle(footer).backgroundColor,
        footerImage: getComputedStyle(footer).backgroundImage,
        headerImage: getComputedStyle(
          document.querySelector('.storefront-header')!,
        ).backgroundImage,
        headerBackground: getComputedStyle(
          document.querySelector('.storefront-header')!,
        ).backgroundColor,
        shellBottom: shell.getBoundingClientRect().bottom + window.scrollY,
        footerBottom: footer.getBoundingClientRect().bottom + window.scrollY,
        pageHeight: document.documentElement.scrollHeight,
      };
    });
    expect(surfaces.background).toContain(
      '/images/shop-directory-background.svg',
    );
    expect(surfaces.footerBackground).toBe('rgb(255, 255, 255)');
    expect(surfaces.headerImage).toBe('none');
    expect(surfaces.footerImage).toBe('none');
    const background = await page.request.get(
      '/images/shop-directory-background.svg',
    );
    expect(background.ok()).toBe(true);
    expect(background.headers()['content-type']).toContain('image/svg+xml');
    expect(surfaces.footerBackground).toBe(surfaces.headerBackground);
    expect(
      Math.abs(surfaces.shellBottom - surfaces.footerBottom),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(surfaces.pageHeight - surfaces.footerBottom),
    ).toBeLessThanOrEqual(1);
    if (width >= 768) expect(detailSizes.footerHeight).toBeLessThanOrEqual(64);
    expect(sizes.targets.every((height) => height >= 44)).toBe(true);
    if (width >= 1280) expect(sizes.header).toBeLessThanOrEqual(80);
    const toolbar = page.locator('.shop-directory-toolbar');
    const checkToolbarLayout = async () => {
      const [heading, search, filter, view] = await toolbar
        .locator(':scope > *')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const { x, y, width, height, bottom, right } =
              element.getBoundingClientRect();
            return {
              x,
              y,
              width,
              height,
              bottom,
              right,
              center: y + height / 2,
            };
          }),
        );
      expect(heading.bottom).toBeLessThanOrEqual(search.y);
      if (width >= 768) {
        expect(Math.abs(search.center - filter.center)).toBeLessThanOrEqual(1);
        expect(Math.abs(search.center - view.center)).toBeLessThanOrEqual(1);
        expect(search.right).toBeLessThanOrEqual(filter.x);
        expect(filter.right).toBeLessThanOrEqual(view.x);
        expect(search.width).toBeGreaterThan(filter.width);
      } else {
        expect(Math.abs(heading.center - view.center)).toBeLessThanOrEqual(1);
        expect(heading.right).toBeLessThanOrEqual(view.x);
        expect(view.bottom).toBeLessThanOrEqual(search.y);
        expect(search.bottom).toBeLessThanOrEqual(filter.y);
        expect(search.width).toBeGreaterThanOrEqual(
          (await toolbar.boundingBox())!.width - 1,
        );
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    };
    await checkToolbarLayout();
    const categoryToggle = page.getByRole('button', {
      name: 'ประเภทร้าน',
      exact: true,
    });
    await expect(categoryToggle).toHaveText('ประเภทร้าน');
    await categoryToggle.click();
    await page.getByRole('button', { name: 'คาเฟ่', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'yam', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: shops[1].name }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'ทั้งหมด', exact: true }).click();
    await categoryToggle.click();
    await expect(
      page.getByRole('group', { name: 'ประเภทร้าน', exact: true }),
    ).toBeHidden();
    await categoryToggle.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'คาเฟ่', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(categoryToggle).toBeFocused();
    await expect(categoryToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(
      page.getByRole('searchbox', { name: 'ค้นหาร้าน' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'มุมมองตาราง' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'English' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const main = await page.locator('main').boundingBox();
    expect(main!.width).toBeLessThanOrEqual(1120);
    const art = page.locator('.shop-directory-art');
    expect(
      await art.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
    ).toBe(true);
    for (const selector of [
      '.shop-directory-store-copy',
      '.shop-directory-hero-copy',
    ]) {
      for (const element of await page.locator(selector).all()) {
        expect(
          await element.evaluate(
            (node) => node.scrollWidth <= node.clientWidth + 1,
          ),
        ).toBe(true);
      }
    }
    await page.getByRole('button', { name: 'มุมมองตาราง' }).click();
    await expect(
      page.getByRole('list', { name: 'ร้านที่เผยแพร่' }),
    ).toHaveAttribute('data-view', 'grid');
    await expect(
      page.getByRole('heading', { name: shops[1].name }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: 'English' }).click();
    await expect(
      page.getByRole('button', { name: 'Shop type', exact: true }),
    ).toHaveText('Shop type');
    await checkToolbarLayout();
    if ([320, 768, 1672].includes(width)) {
      await page.screenshot({
        path: `.local/shop-directory/search-first-${width}.png`,
        fullPage: true,
      });
    }
  });
}

for (const width of [320, 768, 1440]) {
  test(`platform footer stays flush and usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/shop');
    await expect(
      page.getByRole('heading', { name: 'yam', exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const footer = page.locator('.shop-directory-footer');
    await footer.scrollIntoViewIfNeeded();
    const navigation = footer.getByRole('navigation');
    await navigation.getByRole('link').first().focus();
    await expect(navigation.getByRole('link').first()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(navigation.getByRole('link').last()).toBeFocused();
    const launcher = await page
      .getByRole('button', { name: /VELO Assistant/i })
      .boundingBox();
    for (const link of await footer.getByRole('link').all()) {
      const bounds = await link.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      const overlaps =
        bounds!.x < launcher!.x + launcher!.width &&
        bounds!.x + bounds!.width > launcher!.x &&
        bounds!.y < launcher!.y + launcher!.height &&
        bounds!.y + bounds!.height > launcher!.y;
      expect(overlaps).toBe(false);
    }
    await page.screenshot({
      path: `.local/shop-directory/platform-footer-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole('searchbox', { name: 'ค้นหาร้าน' })
      .fill('no-matching-store');
    await expect(
      page.getByRole('heading', { name: 'yam', exact: true }),
    ).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const bottomGap = await footer.evaluate((element) =>
      Math.abs(element.getBoundingClientRect().bottom - window.innerHeight),
    );
    expect(bottomGap).toBeLessThanOrEqual(1);
  });
}

test('search, view controls, language and menu work with keyboard', async ({
  page,
}) => {
  await page.goto('/shop');
  await expect(
    page.getByRole('heading', { name: 'yam', exact: true }),
  ).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'ค้นหาร้าน' });
  await search.fill(' YAM ');
  await expect(page.getByRole('heading', { name: shops[1].name })).toHaveCount(
    0,
  );
  await search.fill('missing');
  await expect(page.getByText('ไม่พบร้านที่ตรงกับคำค้น')).toBeVisible();
  await search.fill('');
  await expect(
    page.getByRole('link', { name: 'ดูหน้าร้าน' }).first(),
  ).toHaveAttribute('href', '/shop/yam');
  const grid = page.getByRole('button', { name: 'มุมมองตาราง' });
  await grid.focus();
  await page.keyboard.press('Enter');
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(
    page.getByRole('searchbox', { name: 'Search stores' }),
  ).toBeVisible();
  await expect(
    page.getByText('Choose a restaurant and start your order.'),
  ).toBeVisible();
  const menu = page.getByRole('button', { name: 'Shop type menu' });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  for (let index = 0; index < 4; index += 1) await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'All', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  const cafe = page.getByRole('button', { name: 'Cafe', exact: true });
  await expect(cafe).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(cafe).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('heading', { name: 'yam', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
});

test('velo assistant chat opens, renders reference layout and can be closed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/shop');
  await expect(
    page.getByRole('heading', { name: 'yam', exact: true }),
  ).toBeVisible();

  // Launcher button is visible
  const launcher = page.getByRole('button', { name: /VELO Assistant/i });
  await expect(launcher).toBeVisible();

  // Open the chat
  await launcher.click();

  const chatDialog = page.getByRole('dialog', { name: 'VELO Assistant' });
  await expect(chatDialog).toBeVisible();
  await expect(
    chatDialog.getByRole('heading', { name: 'VELO Assistant' }),
  ).toBeVisible();
  await expect(
    chatDialog.getByText('Ask about stores, menus, or orders'),
  ).toBeVisible();
  await expect(chatDialog.getByText('Online')).toBeVisible();

  // Check initial messages
  await expect(
    chatDialog.getByText(
      'Hi! I can help you find a restaurant or recommend dishes.',
    ),
  ).toBeVisible();
  await expect(
    chatDialog.getByText('Show me stores that are open now.'),
  ).toBeVisible();
  await expect(
    chatDialog.getByText('Here are stores that are open now:'),
  ).toBeVisible();

  // Open store card
  const yamCard = chatDialog.getByRole('link', { name: /yam/i });
  await expect(yamCard).toBeVisible();
  await expect(yamCard).toHaveAttribute('href', '/shop/yam');

  // Quick suggestions
  await expect(
    chatDialog.getByRole('button', { name: 'Open now' }),
  ).toBeVisible();
  await expect(
    chatDialog.getByRole('button', { name: 'Popular dishes' }),
  ).toBeVisible();
  await expect(
    chatDialog.getByRole('button', { name: 'Track order' }),
  ).toBeVisible();

  // Input area
  await expect(
    chatDialog.getByPlaceholder('Type your message...'),
  ).toBeVisible();

  // Save screenshot of open chat window for visual comparison
  await page.screenshot({
    path: '.local/shop-directory/assistant-chat-1440.png',
    fullPage: false,
  });

  // Close with minimize or close button
  await chatDialog
    .getByRole('button', { name: /Minimize chat|ย่อหน้าต่าง/i })
    .click();
  await expect(chatDialog).toHaveCount(0);
});
