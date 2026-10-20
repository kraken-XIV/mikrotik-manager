import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const body =
      path === '/api/auth/security-status'
        ? { warnings: [] }
        : path === '/api/auth/me'
          ? { id: 1, username: 'Theme browser fixture', role: 'viewer' }
          : path === '/api/settings'
            ? {}
            : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.route('**/socket.io/**', (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem(
      'mikrotik-auth',
      JSON.stringify({
        state: {
          token: 'fixture',
          user: { id: 1, username: 'Theme browser fixture', role: 'viewer' },
          isAuthenticated: true,
        },
        version: 0,
      }),
    );
  });
});

test('authenticated system-theme deep links follow OS changes without visiting Login', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('mikrotik-theme'))
      localStorage.setItem(
        'mikrotik-theme',
        JSON.stringify({
          state: { theme: 'system', accent: 'rose' },
          version: 0,
        }),
      );
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('html')).toHaveCSS('--accent', '#fb7185');
});

test('Appearance controls fit a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  const appearance = page
    .locator('.card')
    .filter({ has: page.getByRole('heading', { name: 'Appearance', exact: true }) });
  await appearance.scrollIntoViewIfNeeded();
  const fits = await appearance.evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(fits).toBe(true);
  for (const button of await appearance.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }

});

test('accent bubbles match the actual UI accent in Light, Dark and live System mode', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  const appearance = page.locator('.card').filter({
    has: page.getByRole('heading', { name: 'Appearance', exact: true }),
  });
  const labels = ['Blue', 'Violet', 'Emerald', 'Rose', 'Amber', 'Teal'];
  async function checkPalette() {
    for (const label of labels) {
      const bubble = appearance.getByRole('button', { name: `Accent colour: ${label}` });
      await bubble.click();
      const actualAccent = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--accent)';
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      });
      await expect(bubble).toHaveCSS('background-color', actualAccent);
      await expect(bubble).toHaveCSS('background-image', 'none');
      await expect(bubble).toHaveCSS('box-shadow', `${actualAccent} 0px 0px 0px 2px`);
    }
  }
  for (const mode of ['light', 'dark', 'system']) {
    await appearance.getByRole('button', { name: mode, exact: true }).click();
    await checkPalette();
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await checkPalette();
  await page.getByRole('button', { name: 'Theme and accent settings' }).click();
  const menu = page.getByRole('dialog', { name: 'Theme and accent', exact: true });
  const selected = menu.getByRole('button', { name: 'Accent colour: Teal' });
  await expect(selected).toHaveCSS('background-color', 'rgb(45, 212, 191)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(selected).toHaveCSS('background-color', 'rgb(15, 118, 110)');
});

test('custom colour picker persists, follows every mode and restores after choosing a preset', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  const appearance = page
    .locator('.card')
    .filter({ has: page.getByRole('heading', { name: 'Appearance', exact: true }) });
  const picker = appearance.getByLabel('Pick custom accent colour');
  const custom = appearance.getByRole('button', { name: 'Use custom accent' });
  await picker.fill('#ee8844');
  await expect(custom).toHaveAttribute('aria-pressed', 'true');
  await expect(picker).toHaveValue('#ee8844');
  const light = await page
    .locator('html')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--accent').trim());
  await appearance.getByRole('button', { name: 'dark', exact: true }).click();
  const dark = await page
    .locator('html')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--accent').trim());
  expect(dark).not.toBe(light);
  const applied = await custom
    .locator('span')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect(appearance.getByRole('button', { name: 'dark', exact: true })).toHaveCSS(
    'background-color',
    applied,
  );
  await page.reload();
  await expect(picker).toHaveValue('#ee8844');
  await expect(custom).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveCSS('--accent', dark);
  await appearance.getByRole('button', { name: 'system', exact: true }).click();
  await expect(page.locator('html')).toHaveCSS('--accent', light);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveCSS('--accent', dark);
  await appearance.getByRole('button', { name: 'Accent colour: Blue' }).click();
  await expect(custom).toHaveAttribute('aria-pressed', 'false');
  await custom.click();
  await expect(page.locator('html')).toHaveCSS('--accent', dark);
  await expect(picker).toHaveValue('#ee8844');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const control of [custom, picker]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
});
