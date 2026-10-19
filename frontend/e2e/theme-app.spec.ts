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

test('Settings applies every surface scheme and preserves them on reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();
  const appearance = page
    .locator('.card')
    .filter({ has: page.getByRole('heading', { name: 'Appearance', exact: true }) });
  await appearance.getByRole('button', { name: 'dark', exact: true }).click();
  await appearance.getByRole('button', { name: 'Midnight', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'midnight');
  await expect(page.locator('html')).toHaveCSS('--surface', '#0b0d11');
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'midnight');
  await appearance.getByRole('button', { name: 'High contrast', exact: true }).click();
  await expect(page.locator('html')).toHaveCSS('--ink', '#ffffff');
  await appearance.getByRole('button', { name: 'light', exact: true }).click();
  await expect(page.locator('html')).toHaveCSS('--ink', '#000000');
  await appearance.getByRole('button', { name: 'Default', exact: true }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-scheme');
  expect(errors).toEqual([]);
});

test('authenticated system-theme deep links follow OS changes without visiting Login', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('mikrotik-theme'))
      localStorage.setItem(
        'mikrotik-theme',
        JSON.stringify({
          state: { theme: 'system', accent: 'rose', scheme: 'midnight' },
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
  await expect(page.locator('html')).toHaveCSS('--surface', '#0b0d11');
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

  await appearance.getByRole('button', { name: 'High contrast', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'high-contrast');
});

test('high-contrast muted text meets AA on the darkest card surface in both modes', async ({
  page,
}) => {
  await page.goto('/settings');
  const appearance = page
    .locator('.card')
    .filter({ has: page.getByRole('heading', { name: 'Appearance', exact: true }) });
  await appearance.getByRole('button', { name: 'High contrast', exact: true }).click();
  for (const mode of ['light', 'dark']) {
    await appearance.getByRole('button', { name: mode, exact: true }).click();
    const ratio = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const luminance = (hex: string) => {
        const rgb = hex
          .trim()
          .slice(1)
          .match(/../g)!
          .map((part) => {
            const value = parseInt(part, 16) / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const ink = luminance(css.getPropertyValue('--ink-4'));
      const surface = luminance(css.getPropertyValue('--surface-3'));
      return (Math.max(ink, surface) + 0.05) / (Math.min(ink, surface) + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
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
