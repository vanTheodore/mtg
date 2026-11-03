import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('fixture de visibilidad sin violaciones axe críticas', async ({ page }) => {
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/stress?hand=7&tokens=4');
  await expect(page.getByTestId('stress-page')).toBeVisible();
  // A visible card must expose its printed face in the same order to
  // assistive technology, even when its artwork fails. Compare the actual
  // visible fields instead of innerText of the whole button: innerText also
  // includes hidden/clipped decoration, line wraps, and CSS layout text.
  const card = page.locator('[data-card-id="1001"]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-image-state', 'error');
  const printed = await card.evaluate((element) => {
    const selectors = ['.fallback-name', '.fallback-cost', '.fallback-type', '.art-status', '.fallback-text', '.fallback-pt'];
    const fragments = selectors
      .map((selector) => element.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim())
      .filter((value): value is string => !!value);
    return { fragments, accessibleName: element.getAttribute('aria-label')?.replace(/\s+/g, ' ').trim() ?? '' };
  });
  expect(printed.fragments).toContain('Grizzly Bears');
  expect(printed.fragments).toContain('Sin conexión con el servicio de imágenes');
  expect(printed.fragments.length).toBeGreaterThanOrEqual(5);
  let offset = 0;
  for (const fragment of printed.fragments) {
    const at = printed.accessibleName.indexOf(fragment, offset);
    expect(at, `Texto visible ausente o desordenado en nombre accesible: ${fragment}`).toBeGreaterThanOrEqual(offset);
    offset = at + fragment.length;
  }
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(serious).toEqual([]);
});
