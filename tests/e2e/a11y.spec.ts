import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('fixture de visibilidad sin violaciones axe críticas', async ({ page }) => {
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/stress?hand=7&tokens=4');
  await expect(page.getByTestId('stress-page')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(serious).toEqual([]);
});
