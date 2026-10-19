import { test, expect, type Page } from '@playwright/test';

/**
 * Theming e2e — the browser-level guarantee behind the unit tests.
 *
 * These run against the Vite dev server with every /api/* call intercepted,
 * so they are hermetic: no MikroTik devices, no backend, no database. What
 * they prove is the part unit tests in jsdom cannot: that the real browser
 * applies the classes and custom properties, that CSS custom properties
 * actually cascade into the rendered UI, and that the system scheme follows
 * Playwright's emulated colorScheme.
 */

const ACCENTS = [
  { id: 'Amber', value: '#b45309' },
  { id: 'Violet', value: '#7c3aed' },
  { id: 'Emerald', value: '#047857' },
  { id: 'Rose', value: '#e11d48' },
  { id: 'Teal', value: '#0f766e' },
] as const;

/** Answer the login page's two status calls (and anything else) quietly. */
async function mockApi(page: Page): Promise<void> {
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    }),
  );
}

async function openThemeMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Theme and accent settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Theme and accent' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Mikrotik Manager' })).toBeVisible();
});

test('defaults to light with no accent override', async ({ page }) => {
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);
  await expect(html).toHaveCSS('--accent', '#2563eb');
});

test('dark mode applies the .dark class and repaints', async ({ page }) => {
  await openThemeMenu(page);
  await page.getByRole('button', { name: 'Dark' }).click();
  const html = page.locator('html');
  await expect(html).toHaveClass(/dark/);
  // The stylesheet's dark accent — proof the cascade really switched schemes.
  await expect(html).toHaveCSS('--accent', '#60a5fa');
});

test('system mode follows the emulated OS colour scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  await openThemeMenu(page);
  await page.getByRole('button', { name: 'System' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  // Flip the OS without reloading — the whole point of 'system'.
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('choosing an accent rewrites the accent variables inline', async ({ page }) => {
  await openThemeMenu(page);
  for (const accent of ACCENTS) {
    await page.getByRole('button', { name: `Accent colour: ${accent.id}` }).click();
    const html = page.locator('html');
    await expect(html).toHaveCSS('--accent', accent.value);
    await expect(html).toHaveCSS('--accent-soft', /.+/);
  }
  // Back to Blue: the inline properties are removed, not painted blue.
  await page.getByRole('button', { name: 'Accent colour: Blue' }).click();
  await expect(page.locator('html')).toHaveCSS('--accent', '#2563eb');
});

test('theme and accent survive a reload (persisted, applied pre-render)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openThemeMenu(page);
  await page.getByRole('button', { name: 'System' }).click();
  await page.getByRole('button', { name: 'Accent colour: Emerald' }).click();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mikrotik Manager' })).toBeVisible();
  const html = page.locator('html');
  await expect(html).toHaveClass(/dark/);
  // System + emulated-dark resolves the accent's dark variant — the store
  // re-picks light/dark values from the preset, not just the accent id.
  await expect(html).toHaveCSS('--accent', '#34d399');
  // Reopening the menu shows the persisted selection, not the default.
  await openThemeMenu(page);
  await expect(page.getByRole('button', { name: 'System' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('the trigger reflects the current preference and Escape closes the menu', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Theme and accent settings' });
  await expect(trigger).toHaveAttribute('title', /Theme: light/);
  await openThemeMenu(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Theme and accent' })).toBeHidden();
  // Focus returns to the trigger — keyboard users are not stranded.
  await expect(trigger).toBeFocused();
});

test('keyboard entry focuses the selected option, and Tab can leave the popover', async ({
  page,
}) => {
  const trigger = page.getByRole('button', { name: 'Theme and accent settings' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Light', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Dark', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByLabel('Pick custom accent colour').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('dialog', { name: 'Theme and accent' })).toBeHidden();
});

test('invalid persisted preferences do not break theme controls after reload', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'mikrotik-theme',
      JSON.stringify({
        state: {
          theme: 'invalid',
          accent: { id: 'rose' },
          scheme: 'invalid',
          setTheme: false,
        },
        version: 0,
      }),
    ),
  );
  await page.reload();
  await openThemeMenu(page);
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('button', { name: 'Accent colour: Blue' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('shared picker keeps native colour selection open and applies a custom colour', async ({
  page,
}) => {
  await openThemeMenu(page);
  const dialog = page.getByRole('dialog', { name: 'Theme and accent', exact: true });
  const picker = dialog.getByLabel('Pick custom accent colour');
  await picker.focus();
  // Native colour windows can blur the document without a DOM focus target.
  await picker.dispatchEvent('focusout', { relatedTarget: null });
  await expect(dialog).toBeVisible();
  await picker.fill('#12abcd');
  await expect(dialog.getByRole('button', { name: 'Use custom accent' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('html')).toHaveCSS('--accent', /^#[0-9a-f]{6}$/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.reload();
  await openThemeMenu(page);
  await expect(picker).toHaveValue('#12abcd');
});

test('invalid persisted custom colour cannot inject CSS or replace its setter', async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'mikrotik-theme',
      JSON.stringify({
        state: {
          theme: 'light',
          accent: 'custom',
          customColor: '#fff; background: red',
          setCustomColor: false,
        },
        version: 0,
      }),
    ),
  );
  await page.reload();
  await expect(page.locator('html')).toHaveCSS('--accent', '#2563eb');
  await openThemeMenu(page);
  await page.getByLabel('Pick custom accent colour').fill('#334455');
  await expect(page.getByRole('button', { name: 'Use custom accent' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('mobile login picker stays above the logo and every colour control is clickable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openThemeMenu(page);
  for (const label of ['Blue', 'Violet', 'Emerald', 'Rose', 'Amber', 'Teal']) {
    const bubble = page.getByRole('button', { name: `Accent colour: ${label}` });
    const onTop = await bubble.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
      );
    });
    expect(onTop, `${label} must not be covered by the login logo`).toBe(true);
    await bubble.click();
  }
  await page.getByLabel('Pick custom accent colour').fill('#ff8800');
  await page.getByRole('button', { name: 'Use custom accent' }).click();
});
