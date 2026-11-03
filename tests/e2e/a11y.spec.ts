import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('fixture de visibilidad sin violaciones axe críticas', async ({ page }) => {
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/stress?hand=7&tokens=4');
  await expect(page.getByTestId('stress-page')).toBeVisible();
  // A full card label must include its visible text in DOM order, even
  // when an image fails and the printed mana/type/rules are visible.
  const card = page.locator('[data-card-id="1001"]');
  await expect(card).toBeVisible();
  await expect.poll(async () => {
    const text = await card.evaluate((node) => (node as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
    const label = (await card.getAttribute('aria-label'))?.replace(/\s+/g, ' ') ?? '';
    return label.includes(text);
  }, { timeout: 30_000 }).toBe(true);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(serious).toEqual([]);
});
