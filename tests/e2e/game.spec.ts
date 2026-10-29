import { expect, test } from '@playwright/test';

test('partida real: inicializa WASM, conserva manos y juega una tierra', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.route('**/api.scryfall.com/**', (route) => route.abort());

  await page.goto('/?autostart');
  await expect(page.getByRole('heading', { name: /Tu mano/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.metrics')).toContainText('Motor');

  // Mulligan window for both seats, with safe handoff.
  for (let i = 0; i < 2; i++) {
    const keep = page.getByRole('button', { name: 'Conservar mano' });
    if (await keep.isVisible().catch(() => false)) {
      await keep.click();
      const ready = page.getByRole('button', { name: 'Estoy listo' });
      if (await ready.isVisible().catch(() => false)) await ready.click();
    }
  }

  // Opponent hidden information must not leak names into the DOM.
  await expect(page.locator('.rival-hand .mini-back')).toHaveCount(7);
  await expect(page.locator('.rival-hand')).not.toContainText(/Forest|Lightning|Island|Mountain/);

  // Select a land in hand and execute the engine-provided legal action.
  const forest = page.locator('.hand-scroll [role="button"]:has-text("Forest")').first();
  await expect(forest).toBeVisible();
  await forest.click();
  const play = page.getByRole('button', { name: 'Jugar tierra: Forest' });
  await expect(play).toBeVisible();
  await play.click();
  await expect(page.locator('.battlefield [role="button"]:has-text("Forest")').first()).toBeVisible({ timeout: 15_000 });

  // Priority can be passed through the real engine.
  const pass = page.getByRole('button', { name: 'Pasar prioridad' });
  await expect(pass).toBeVisible();
  await pass.click();
  await expect(page.locator('.metrics')).toContainText('objetos');

  const critical = errors.filter((e) => !/scryfall|Failed to load resource|net::/i.test(e));
  expect(critical).toEqual([]);
});
