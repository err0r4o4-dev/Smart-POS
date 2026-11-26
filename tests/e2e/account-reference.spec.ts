import { expect, test } from '@playwright/test';

test.use({ channel: process.env.E2E_BROWSER_CHANNEL });

for (const width of [320, 390, 767, 768, 1440]) {
  test(`account artwork and heading adapt at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/login');
    await page.getByRole('button', { name: 'ไทย', exact: true }).click();

    const illustration = page.locator('.login-visual-art');
    await expect(illustration).toBeVisible();
    await expect
      .poll(() =>
        illustration.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    const promo = page.locator('.login-visual-copy');
    if (width < 768) await expect(promo).toBeHidden();
    else await expect(promo).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'เข้าสู่ระบบ',
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  });
}

const accountPages = [
  { path: '/login', title: 'เข้าสู่ระบบ' },
  { path: '/register', title: 'สร้างบัญชี' },
  { path: '/forgot-password', title: 'ลืมรหัสผ่าน' },
];

test('account routes reuse the sign-in frame on desktop and mobile', async ({
  page,
}) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    async function frame(path: string) {
      await page.goto(path);
      return page.locator('.account-shell').evaluate((shell) => {
        const header = shell.querySelector('header')!;
        const grid = shell.querySelector('main')!;
        const card = shell.querySelector('.login-card')!;
        const art = shell.querySelector<HTMLImageElement>('.login-visual-art')!;
        return {
          background: getComputedStyle(shell).backgroundImage,
          headerWidth: header.getBoundingClientRect().width,
          gap: getComputedStyle(grid).gap,
          columns: getComputedStyle(grid).gridTemplateColumns,
          cardWidth: card.getBoundingClientRect().width,
          cardPadding: getComputedStyle(card).paddingInline,
          cardBackground: getComputedStyle(card).backgroundImage,
          artwork: art.getAttribute('src'),
        };
      });
    }
    const signIn = await frame('/login');
    for (const path of [
      '/register',
      '/verify-email',
      '/forgot-password',
      '/reset-password',
    ]) {
      expect(await frame(path), `${path} at ${width}px`).toEqual(signIn);
    }
  }
});

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname))
      return route.abort();
    if (url.pathname === '/api/v1/auth/google/config')
      return route.fulfill({ json: { data: { enabled: true } } });
    if (url.pathname.startsWith('/api/'))
      return route.fulfill({
        status: 401,
        json: { error: { message: 'Synthetic anonymous session' } },
      });
    return route.continue();
  });
});

for (const width of [390, 1440]) {
  test(`round trip to registration preserves the sign-in visual at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    const visual = page.locator('.login-visual');
    const artwork = visual.getByRole('img');
    const snapshot = async () => {
      await expect(artwork).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
        window.scrollTo(0, 0);
      });
      return {
        copyVisible: await visual.locator('.login-visual-copy').isVisible(),
        copy: await visual.locator('.login-visual-copy').textContent(),
        art: await artwork.boundingBox(),
      };
    };
    const signIn = await snapshot();
    await page.getByRole('link', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByLabel('Display name')).toBeVisible();
    await expect(visual).toBeVisible();
    await expect.poll(snapshot).toEqual(signIn);
    await page
      .getByRole('link', { name: 'Already have an account? Sign in' })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    await expect.poll(snapshot).toEqual(signIn);
  });
}

for (const width of [320, 390, 768, 1024, 1440]) {
  for (const account of accountPages) {
    test(
      'reference card ' + account.path + ' fits at ' + width + 'px',
      async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setViewportSize({ width, height: 900 });
        await page.goto(account.path);
        await page.getByRole('button', { name: 'ไทย', exact: true }).click();
        await expect(
          page.getByRole('heading', { name: account.title }),
        ).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const card = page.locator('.login-card');
        const cardBounds = await card.boundingBox();
        if (account.path === '/register' && (width === 390 || width === 768)) {
          const signIn = card.getByRole('link', {
            name: 'มีบัญชีแล้ว? เข้าสู่ระบบ',
          });
          const resend = card.getByRole('link', { name: /ส่งอีเมลอีกครั้ง/ });
          const signInBox = (await signIn.boundingBox())!;
          const resendBox = (await resend.boundingBox())!;
          expect(signInBox.width).toBeGreaterThan(100);
          expect(resendBox.y).toBeGreaterThanOrEqual(
            signInBox.y + signInBox.height,
          );
        }
        expect(cardBounds!.x).toBeGreaterThanOrEqual(0);
        expect(cardBounds!.x + cardBounds!.width).toBeLessThanOrEqual(width);
        expect(
          await card.evaluate((element) => element.scrollWidth),
        ).toBeLessThanOrEqual(
          await card.evaluate((element) => element.clientWidth),
        );
        for (const control of await card.locator('input, button, a').all()) {
          await control.scrollIntoViewIfNeeded();
          await expect(control).toBeVisible();
          const bounds = await control.boundingBox();
          expect(bounds!.x).toBeGreaterThanOrEqual(cardBounds!.x);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
            cardBounds!.x + cardBounds!.width,
          );
          expect(bounds!.height).toBeGreaterThanOrEqual(44);
        }
        const email = page.getByLabel('ที่อยู่อีเมล', { exact: true });
        await expect(email).toHaveValue('');
        await expect(card.locator('label[for="email"] svg')).toBeVisible();
        if (account.path !== '/forgot-password') {
          const toggle = page.getByRole('button', {
            name: 'แสดงรหัสผ่าน',
            exact: true,
          });
          await expect(toggle.locator('svg')).toBeVisible();
          await toggle.focus();
          await page.keyboard.press('Enter');
          await expect(
            page.getByLabel('รหัสผ่าน', { exact: true }),
          ).toHaveAttribute('type', 'text');
          await page.keyboard.press('Enter');
        }
        if (width === 1440 && account.path === '/login') {
          const scales = await page
            .locator('.login-shell')
            .evaluate((shell) => {
              const css = getComputedStyle(shell);
              const heading = shell.querySelector('#login-visual-title')!;
              return {
                contentWidth:
                  shell.clientWidth -
                  parseFloat(css.paddingInlineStart) -
                  parseFloat(css.paddingInlineEnd),
                layoutMax: parseFloat(
                  css.getPropertyValue('--layout-content-max'),
                ),
                headingSize: getComputedStyle(heading).fontSize,
                displaySize: css.getPropertyValue('--font-display').trim(),
              };
            });
          expect(scales.contentWidth).toBe(scales.layoutMax);
          expect(scales.headingSize).toBe(scales.displaySize);
        }
        await page
          .getByRole('button', { name: 'English', exact: true })
          .click();
        await expect(
          page.getByLabel('Email address', { exact: true }),
        ).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        if ([320, 768, 1440].includes(width)) {
          await page.getByRole('button', { name: 'ไทย', exact: true }).click();
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: testInfo.outputPath('reference.png'),
            fullPage: true,
          });
        }
        expect(errors).toEqual([]);
      },
    );
  }
}

for (const width of [390, 768, 900, 901, 1024, 1920]) {
  test(`register artwork stays clear of the form at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto('/register');
    await expect(page.locator('.login-card')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const artwork = page.locator('.login-illustration');
    const art = (await artwork.boundingBox())!;
    const card = (await page.locator('.login-card').boundingBox())!;
    if (width >= 768) {
      const heading = (await page.locator('.login-visual-copy').boundingBox())!;
      expect(art.x + art.width).toBeLessThanOrEqual(card.x);
      expect(art.y).toBeGreaterThanOrEqual(heading.y + heading.height);
    } else {
      expect(art.y + art.height).toBeLessThanOrEqual(card.y);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath('register-artwork.png'),
      fullPage: true,
    });
  });
}

for (const width of [901, 1024, 1920]) {
  for (const account of accountPages) {
    test(`account artwork blends into the canvas on ${account.path} at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1080 });
      await page.goto(account.path);
      await page.getByRole('button', { name: 'ไทย', exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      const edges = await page.locator('.login-visual').evaluate((element) => {
        const artwork = element
          .querySelector('.login-visual-art')!
          .getBoundingClientRect();
        return {
          left: artwork.left,
          right: artwork.right,
          bottom: artwork.bottom,
          top: artwork.top + 20,
          end: artwork.bottom - 10,
        };
      });
      const screenshot = await page.screenshot({
        path: testInfo.outputPath('account-decoration.png'),
        fullPage: true,
      });
      // Keep ribbons and other layers in both images, isolating the raster edge.
      await page.locator('.login-visual-art').evaluate((element) => {
        element.style.visibility = 'hidden';
      });
      const backdrop = await page.screenshot({ fullPage: true });
      const contrast = await page.evaluate(
        async ({ png, blank, edges }) => {
          async function decode(source: string) {
            const image = new Image();
            image.src = `data:image/png;base64,${source}`;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d')!;
            context.drawImage(image, 0, 0);
            return context.getImageData(0, 0, canvas.width, canvas.height);
          }
          const [art, background] = await Promise.all([
            decode(png),
            decode(blank),
          ]);
          function difference(x: number, y: number) {
            const index = (y * art.width + x) * 4;
            return Math.max(
              ...[0, 1, 2].map((channel) =>
                Math.abs(
                  art.data[index + channel] - background.data[index + channel],
                ),
              ),
            );
          }
          const contrast = { left: 0, right: 0, bottom: 0 };
          for (
            let vertical = Math.ceil(edges.top);
            vertical < edges.end;
            vertical++
          ) {
            for (const side of ['left', 'right'] as const) {
              const horizontal =
                Math.round(edges[side]) + (side === 'left' ? 2 : -2);
              contrast[side] = Math.max(
                contrast[side],
                difference(horizontal, vertical),
              );
            }
          }
          for (
            let horizontal = Math.ceil(edges.left) + 24;
            horizontal < edges.right - 24;
            horizontal++
          ) {
            const vertical = Math.round(edges.bottom);
            contrast.bottom = Math.max(
              contrast.bottom,
              difference(horizontal, vertical - 2),
            );
          }
          return contrast;
        },
        {
          png: screenshot.toString('base64'),
          blank: backdrop.toString('base64'),
          edges,
        },
      );
      expect(contrast.left).toBeLessThanOrEqual(8);
      expect(contrast.right).toBeLessThanOrEqual(8);
      expect(contrast.bottom).toBeLessThanOrEqual(8);
    });
  }
}

for (const width of [320, 768, 901, 1024, 1440, 1920]) {
  test(`register artwork stays aligned when the form grows at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.route('**/api/v1/auth/register', (route) =>
      route.fulfill({
        status: 503,
        json: { error: { message: 'Synthetic dependency failure' } },
      }),
    );
    await page.setViewportSize({ width, height: 768 });
    await page.goto('/register');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    const artwork = page.locator('.login-illustration');
    const card = page.locator('.login-card');
    const originalArtwork = (await artwork.boundingBox())!;
    const originalCard = (await card.boundingBox())!;
    const longName = 'Synthetic Person '.repeat(6).slice(0, 100);
    const longEmail = `${'person'.repeat(10)}@${'example'.repeat(7)}.test`;
    const password = 'synthetic-password-'.repeat(6);
    await page.getByLabel('Display name').fill(longName);
    await page.getByLabel('Email address', { exact: true }).fill(longEmail);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password').fill(password);
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await expect(page.getByRole('alert')).toHaveText(
      /Could not confirm the result/,
    );
    await page.addStyleTag({
      content: '.login-card .auth-error { font-size: 200%; }',
    });
    await expect(page.getByLabel('Display name')).toHaveValue(longName);
    await expect(page.getByLabel('Email address', { exact: true })).toHaveValue(
      longEmail,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    const expandedCard = (await card.boundingBox())!;
    expect(expandedCard.height).toBeGreaterThan(originalCard.height + 30);
    const expandedArtwork = (await artwork.boundingBox())!;
    expect(
      Math.abs(expandedArtwork.height - originalArtwork.height),
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(expandedArtwork.y - originalArtwork.y)).toBeLessThanOrEqual(
      1,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const image = (await page.locator('.login-visual-art').boundingBox())!;
    const panel = (await page.locator('.login-panel').boundingBox())!;
    if (width >= 768) {
      const copy = (await page.locator('.login-visual-copy').boundingBox())!;
      expect(image.y).toBeGreaterThanOrEqual(copy.y + copy.height);
      expect(image.x + image.width).toBeLessThanOrEqual(panel.x);
    } else {
      expect(panel.y).toBeGreaterThanOrEqual(image.y + image.height);
    }
    await page.screenshot({
      path: testInfo.outputPath('register-tall-form.png'),
      fullPage: true,
    });
    await page
      .getByRole('link', { name: 'Already have an account? Sign in' })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('link', { name: 'Already have an account? Sign in' }),
    ).toBeInViewport();
  });
}

test('pending sign-in names its action and recovers without losing input', async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/auth/login', async (route) => {
    await pending;
    await route.fulfill({
      status: 401,
      json: { error: { message: 'Invalid email or password' } },
    });
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/login');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page
    .getByLabel('Email address', { exact: true })
    .fill('person@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  try {
    await expect(
      page.getByLabel('Email address', { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Signing in…', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Sign in with Google' }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByRole('alert')).toHaveText(
    /Check your email and password/,
  );
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue(
    'person@example.test',
  );
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(
    'synthetic-password',
  );
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeEnabled();
});

test('registration keeps the verification and resend step in the shared card', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/register', (route) =>
    route.fulfill({
      json: {
        data: {
          id: 'synthetic-user',
          email: 'person@example.test',
          display_name: 'Person',
          email_verified: false,
          status: 'ACTIVE',
          onboarding: 'PENDING_ORGANIZATION',
        },
      },
    }),
  );
  await page.route('**/api/v1/auth/email/resend', (route) =>
    route.fulfill({ json: { data: { message: 'Accepted' } } }),
  );
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/register');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('Display name').fill('Person');
  await page
    .getByLabel('Email address', { exact: true })
    .fill('person@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByLabel('Confirm password').fill('synthetic-password');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Verify your email' }),
  ).toBeVisible();
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue(
    'person@example.test',
  );
  await page.getByRole('button', { name: 'Resend verification email' }).click();
  await expect(page.getByRole('status')).toHaveText(/eligible account/);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});

test('recovery preserves the email through an error and a successful retry', async ({
  page,
}) => {
  let attempts = 0;
  await page.route('**/api/v1/auth/forgot-password', (route) => {
    attempts += 1;
    return route.fulfill(
      attempts === 1
        ? {
            status: 503,
            json: { error: { message: 'Recovery temporarily unavailable' } },
          }
        : {
            json: {
              data: {
                message:
                  'If an eligible account exists, a reset link has been sent.',
              },
            },
          },
    );
  });
  await page.goto('/forgot-password');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  const email = page.getByLabel('Email address', { exact: true });
  await email.fill('person@example.test');
  await page.getByRole('button', { name: 'Request reset link' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    /Could not confirm the result/,
  );
  await expect(email).toHaveValue('person@example.test');
  await page.getByRole('button', { name: 'Request reset link' }).click();
  await expect(page.getByRole('status')).toHaveText(/eligible account/);
  await expect(email).toHaveValue('person@example.test');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(attempts).toBe(2);
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 640, height: 450 },
  { width: 1280, height: 600 },
]) {
  for (const account of accountPages) {
    test(
      'short viewport ' +
        account.path +
        ' at ' +
        viewport.width +
        'x' +
        viewport.height,
      async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(account.path);
        await page
          .getByRole('button', { name: 'English', exact: true })
          .click();
        const email = page.getByLabel('Email address', { exact: true });
        await email.fill('person@example.test');
        const submit = page.locator('button[type="submit"]').first();
        await submit.scrollIntoViewIfNeeded();
        await expect(submit).toBeInViewport();
        await expect(email).toHaveValue('person@example.test');
        const focusable = page.locator('.login-card').getByRole('link').last();
        await focusable.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(focusable).toBeFocused();
        await expect(focusable).toBeInViewport();
        expect(
          await focusable.evaluate(
            (element) => getComputedStyle(element).outlineStyle,
          ),
        ).not.toBe('none');
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(viewport.width);
      },
    );
  }
}
