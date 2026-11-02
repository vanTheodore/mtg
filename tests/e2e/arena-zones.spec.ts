import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api.scryfall.com/**', route => route.abort());
});

test('Arena muestra criaturas hacia combate y tierras/apoyo en una banda común', async ({ page }) => {
  await page.goto('/stress?hand=3&tokens=12');
  const battlefield = page.locator('section.battlefield[data-side="player"]');
  await expect(battlefield).toBeVisible();
  const sections = battlefield.locator(':scope > [data-zone]');
  await expect(sections.first()).toHaveAttribute('data-zone', 'creatures');
  await expect(sections.last()).toHaveAttribute('data-zone', 'middle');
  const middle = battlefield.locator(':scope > .middle-permanents');
  await expect(middle.locator('.row[data-zone="lands"] [data-card-id]')).toHaveCount(6);
  await expect(battlefield.getByRole('button', { name: /Soldier Token × 12/ })).toBeVisible();

  // Switching to classic moves lands back into their original first row.
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('combobox', { name: 'Estilo del tablero' }).selectOption('classic');
  await expect(middle).toHaveCount(0);
  await expect(sections.first()).toHaveAttribute('data-zone', 'lands');
  await expect(battlefield.locator('[data-card-id]')).toHaveCount(10);
});

test('la agrupación de fichas sigue permitiendo elegir todas las unidades', async ({ page }) => {
  await page.goto('/stress?hand=3&tokens=12');
  const field = page.locator('section.battlefield[data-side="player"]');
  const toggle = field.getByRole('button', { name: /Soldier Token × 12/ });
  await toggle.click();
  await expect(field.locator('[data-card-id]')).toHaveCount(22); // 6 lands, 4 bears, 12 tokens
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});
