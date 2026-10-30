import { expect, test } from '@playwright/test';

/**
 * Deck builder, end to end through Svelte controls only.
 *
 * Requires the real WASM artifact (`static/wasm/mtg_engine_wasm.wasm`, produced
 * by `bun run engine:build`) and Chromium; `bun run test:e2e` skips nothing, so
 * this runs in the CI browser job. It never imports `EngineClient` and never
 * fabricates actions: the assertions read what the engine reported on screen.
 */

const START_TIMEOUT = 120_000;

async function openBuilder(page: import('@playwright/test').Page) {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /^Mis mazos$|^Ocultar constructor$/ });
  await expect(toggle).toBeVisible();
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  const builder = page.getByTestId('deck-builder');
  await expect(builder).toBeVisible();
  return builder;
}

test('constructor: buscar, cantidades, guardar e importar un mazo', async ({ page }) => {
  const builder = await openBuilder(page);

  // Search is backed by the packs loaded from the catalog index.
  await builder.getByRole('searchbox').fill('lightning bolt');
  const results = builder.getByRole('list', { name: 'Resultados de búsqueda' });
  await expect(results.getByRole('listitem').first()).toContainText('Lightning Bolt');
  await builder.getByRole('button', { name: 'Añadir Lightning Bolt' }).click();
  await expect(page.getByTestId('deck-total')).toContainText('1 cartas');

  // Quantities are editable and the total follows.
  const quantity = builder.getByRole('spinbutton', { name: 'Cantidad de Lightning Bolt' });
  await quantity.fill('4');
  await expect(page.getByTestId('deck-total')).toContainText('4 cartas');

  // Import an Arena-style list: it replaces the editor contents.
  await builder.getByRole('button', { name: 'Importar lista' }).click();
  await builder.getByRole('textbox', { name: /Pega una lista/ }).fill('36 Mountain\n4 Lightning Bolt');
  await builder.getByRole('button', { name: 'Convertir lista' }).click();
  await expect(page.getByTestId('deck-total')).toContainText('40 cartas');

  await builder.getByRole('textbox', { name: 'Nombre del mazo' }).fill('Chispas propio');
  await builder.getByRole('button', { name: 'Guardar' }).click();
  await expect(builder.getByRole('status').first()).toContainText('guardado');
  await expect(builder.getByRole('region', { name: 'Mazos guardados' })).toContainText('Chispas propio');

  // Persistence: a reload keeps the saved deck.
  await page.reload();
  const reopened = await openBuilder(page);
  await expect(reopened.getByRole('region', { name: 'Mazos guardados' })).toContainText('Chispas propio');
});

test('constructor: jugar un mazo propio y leer lo que cargó el motor', async ({ page }) => {
  const builder = await openBuilder(page);

  await builder.getByRole('button', { name: 'Importar lista' }).click();
  await builder.getByRole('textbox', { name: /Pega una lista/ }).fill('24 Mountain\n16 Lightning Bolt');
  await builder.getByRole('button', { name: 'Convertir lista' }).click();
  await expect(page.getByTestId('deck-total')).toContainText('40 cartas');

  await builder.getByRole('button', { name: 'Jugar con este mazo' }).click();

  // The engine is the authority: the notice shows what it actually loaded.
  const notice = page.getByRole('status').filter({ hasText: 'cartas cargadas por asiento' });
  await expect(notice).toContainText('40 / 40', { timeout: START_TIMEOUT });
  await expect(notice).toContainText('El mazo se cargó completo');

  // A real game started: own hand is visible and the mode label names the deck.
  await expect(page.locator('section[aria-label^="Tu mano"] [data-card-id]').first()).toBeVisible({ timeout: 30_000 });
  // The deck got no explicit name in this test, so the default label is shown.
  await expect(page.locator('.seat.mode')).toContainText('Mi mazo');
});

test('constructor: una carta fuera del catálogo bloquea el inicio, no lo esconde', async ({ page }) => {
  const builder = await openBuilder(page);
  await builder.getByRole('button', { name: 'Importar lista' }).click();
  await builder.getByRole('textbox', { name: /Pega una lista/ }).fill('39 Mountain\n1 Black Lotus');
  await builder.getByRole('button', { name: 'Convertir lista' }).click();

  await expect(builder.getByRole('alert')).toContainText('Black Lotus');
  await expect(builder.getByRole('button', { name: 'Jugar con este mazo' })).toBeDisabled();
});
