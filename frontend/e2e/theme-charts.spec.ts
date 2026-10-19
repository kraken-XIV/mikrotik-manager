import { expect, test } from '@playwright/test';

test('actual traffic chart curve and legend track accents, including dark mode', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/interfaces')
      ? [{ name: 'ether1', disabled: false }]
      : path.includes('/metrics/interface/')
        ? [
            { time: '2026-10-19T10:00:00Z', rx: 120, tx: 70 },
            { time: '2026-10-19T10:01:00Z', rx: 240, tx: 50 },
          ]
        : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/e2e/fixtures/charts.html');
  await page.getByRole('combobox').selectOption('ether1');
  const curve = page.locator('.chart-series-a .recharts-line-curve');
  await expect(curve).toBeVisible();
  await page.getByRole('button', { name: 'Theme and accent settings' }).click();
  await page.getByRole('button', { name: 'Accent colour: Violet' }).click();
  await expect(curve).toHaveCSS('stroke', 'rgb(124, 58, 237)');
  await expect(
    page.locator('.recharts-legend-item-text').filter({ hasText: 'RX (download)' }),
  ).toHaveCSS('color', 'rgb(124, 58, 237)');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(curve).toHaveCSS('stroke', 'rgb(167, 139, 250)');
  // The separate TX series must retain its contrasting semantic colour.
  await expect(page.locator('.recharts-line').nth(1).locator('.recharts-line-curve')).toHaveCSS(
    'stroke',
    'rgb(16, 185, 129)',
  );
});
