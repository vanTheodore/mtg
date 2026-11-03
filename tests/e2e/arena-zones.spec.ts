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

test('el orden visual CSS y el DOM espejan ambos asientos en Arena', async ({ page }) => {
  // Stress supplies two populated presentation-only seats. Apply the real
  // Arena CSS scope to the fixture; this would expose the obsolete order rules.
  await page.goto('/stress?hand=3&tokens=0&mirror=1');
  await page.locator('.stress').evaluate((element) => {
    element.classList.add('app');
    element.setAttribute('data-board-style', 'arena');
  });
  for (const [side, expectedFirst, expectedLast] of [
    ['player', 'creatures', 'middle'],
    ['opponent', 'middle', 'creatures']
  ] as const) {
    const field = page.locator(`section.battlefield[data-side="${side}"]`);
    await expect(field).toBeVisible();
    const zones = field.locator(':scope > [data-zone]');
    await expect(zones.first()).toHaveAttribute('data-zone', expectedFirst);
    await expect(zones.last()).toHaveAttribute('data-zone', expectedLast);
    await expect(field.locator('.row[data-zone="creatures"] [data-card-id]')).toHaveCount(4);
    await expect(field.locator('.row[data-zone="lands"] [data-card-id]')).toHaveCount(6);
    const locations = await field.evaluate((element) => {
      const creatures = element.querySelector<HTMLElement>(':scope > .row[data-zone="creatures"]');
      const middle = element.querySelector<HTMLElement>(':scope > .middle-permanents');
      if (!creatures || !middle) throw new Error('Missing populated mirrored zones');
      return {
        creaturesTop: creatures.getBoundingClientRect().top,
        middleTop: middle.getBoundingClientRect().top,
        creaturesOrder: getComputedStyle(creatures).order
      };
    });
    expect(locations.creaturesOrder).toBe('0');
    if (side === 'player') expect(locations.creaturesTop).toBeLessThan(locations.middleTop);
    else expect(locations.middleTop).toBeLessThan(locations.creaturesTop);
  }
});

test('Arena entrega toda la banda trasera a las tierras si el apoyo está vacío', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/stress?hand=3&tokens=0&mirror=1');
  for (const side of ['player', 'opponent']) {
    const battlefield = page.locator(`section.battlefield[data-side="${side}"]`);
    const middle = battlefield.locator('.middle-permanents');
    await expect(middle).toHaveClass(/single-lane/);
    await expect(middle.getByRole('group', { name: 'Zona de apoyo' })).toHaveCount(0);
    const lands = middle.locator('.row[data-zone="lands"] [data-card-id]');
    await expect(lands).toHaveCount(6);
    const metrics = await middle.evaluate((element) => {
      const lane = element.querySelector<HTMLElement>('.middle-lane');
      const cards = [...element.querySelectorAll<HTMLElement>('.row[data-zone="lands"] [data-card-id]')];
      if (!lane || cards.length !== 6) throw new Error('Missing six land cards');
      const tops = cards.map((card) => card.getBoundingClientRect().top);
      return {
        fullWidth: lane.getBoundingClientRect().width / element.getBoundingClientRect().width,
        rowTopSpread: Math.max(...tops) - Math.min(...tops)
      };
    });
    expect(metrics.fullWidth).toBeGreaterThan(0.95);
    expect(metrics.rowTopSpread).toBeLessThan(3);
  }
});
