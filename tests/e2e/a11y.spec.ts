import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('fixture de visibilidad sin violaciones axe críticas', async ({ page }) => {
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/stress?hand=7&tokens=4');
  await expect(page.getByTestId('stress-page')).toBeVisible();
  // The printed face is now its own accessible name. This verifies that
  // browser-computed accessibility includes all information a user sees,
  // including art failures; no handwritten aria-label can drift out of sync.
  const card = page.locator('[data-card-id="1001"]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-image-state', 'error');
  await expect(card).not.toHaveAttribute('aria-label');
  // The compact face suppresses long printed rules at <=132px. Its name
  // describes visible fields; its accessible description preserves the rules.
  await expect(card).toHaveAccessibleName(/Grizzly Bears.*Criatura.*Sin conexión con el servicio de imágenes.*2[/]2/);
  await expect(card).toHaveAccessibleDescription(/Una criatura sencilla/);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(serious).toEqual([]);
});
