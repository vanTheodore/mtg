import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
});

test('la mano con 7 cartas se abre como abanico sin perder foco ni cartas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/stress?hand=7&tokens=0');
  const region = page.getByRole('region', { name: /Mano de prueba, 7 cartas/ });
  const fan = region; // role=region is the scroll container itself
  const cards = fan.locator('[data-card-id]');
  await expect(fan).toHaveClass(/fan/);
  await expect(cards).toHaveCount(7);

  const first = fan.locator('.hand-card').first();
  await expect.poll(() => first.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
  for (let i = 0; i < 7; i++) {
    await cards.nth(i).focus();
    await expect(cards.nth(i)).toBeFocused();
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('el modo clásico y la mano de 30 mantienen desplazamiento sin abanico', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/stress?hand=30&tokens=0');
  const region = page.getByRole('region', { name: /Mano de prueba, 30 cartas/ });
  const scroller = region; // role=region is the scroll container itself
  await expect(scroller).not.toHaveClass(/fan/);
  await expect(scroller.locator('[data-card-id]')).toHaveCount(30);

  await page.goto('/stress?hand=7&tokens=0');
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('combobox', { name: 'Estilo del tablero' }).selectOption('classic');
  const plain = page.getByRole('region', { name: /Mano de prueba, 7 cartas/ });
  await expect(plain).not.toHaveClass(/fan/);
  await expect(plain.locator('[data-card-id]')).toHaveCount(7);
});

test('a 320px las siete cartas siguen accesibles, ahora en la hoja de la mano', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/stress?hand=7&tokens=0');
  // UX-HAND: at 320px the hand is the full-screen sheet, not the inline strip.
  // The strip is still in the DOM (counts, aria list) but `inert`, so it must
  // not take focus; the cards are reachable in the sheet that replaced it.
  const region = page.getByRole('region', { name: /Mano de prueba, 7 cartas/ });
  await expect(region.locator('[data-card-id]')).toHaveCount(7);
  await page.locator('.hand-trigger').click();
  await expect(page.locator('.hand-sheet')).toBeVisible();
  const items = page.locator('.hand-sheet [data-card-id]');
  await expect(items).toHaveCount(7);
  for (let i = 0; i < 7; i++) {
    await items.nth(i).scrollIntoViewIfNeeded();
    await items.nth(i).focus();
    await expect(items.nth(i)).toBeFocused();
  }
  // No fan at this width on either surface: the sheet is a flat grid.
  const transform = await page.locator('.hand-sheet .sheet-cell').first().evaluate((el) => getComputedStyle(el).transform);
  expect(transform).toBe('none');
});
