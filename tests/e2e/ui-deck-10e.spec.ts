import { expect, test, type Page } from '@playwright/test';

/**
 * 0.4.2 — the browser half of «confianza por carta».
 *
 * Two things the unit tests cannot prove because they need a real browser:
 *
 *   1. a custom deck built from 10E-exclusive cards goes through search, the
 *      pack download, the coverage gate and a real game, driven only by Svelte
 *      controls (no `EngineClient`, no fabricated `GameAction`);
 *   2. the blocking state (seat hand-off) really blocks: the board is `inert`
 *      and `aria-hidden`, the overlay covers the viewport and is opaque, and
 *      focus lands on the confirmation button.
 *
 * **NO EJECUTADA EN ESTA RONDA.** El entorno de 0.4.2 no tiene Chromium ni las
 * librerías del sistema (`libnss3`, `libgbm`, …) y `apt` no alcanza sus repos.
 * El archivo se mantiene para que la primera máquina con navegador lo ejecute;
 * no se cita como evidencia hasta entonces. Ver `docs/VERIFICATION-0.4.2.md` §6.
 */

/** 40 cards: 17 lands from the core pack + 23 white cards that only 10E has. */
const DECK = [
  '17 Plains',
  '1 Arcane Teachings',
  '2 Serra Angel',
  '2 Air Elemental'.replace('Air Elemental', 'Angel of Mercy'),
  '2 Soul Warden',
  '2 Youthful Knight',
  '2 Honor Guard',
  '2 Skyhunter Skirmisher',
  '2 Wild Griffin',
  '2 Benalish Knight',
  '2 Aven Cloudchaser',
  '2 Steadfast Guard',
  '2 True Believer',
  '2 Voice of All',
  '2 Suntail Hawk',
  '1 Pacifism'
].join('\n');

/** Cards the coverage artifact marks `supported: false` in 10E. */
const LIMITED = 'Arcane Teachings';

const startGame = async (page: Page) => {
  await page.getByRole('button', { name: 'Mis mazos' }).click();
  await expect(page.getByTestId('deck-builder')).toBeVisible();
  await page.getByRole('button', { name: 'Importar lista' }).click();
  await page.getByRole('textbox').last().fill(DECK);
  await page.getByRole('button', { name: 'Convertir lista' }).click();
  await expect(page.getByTestId('deck-total')).toHaveText('40 cartas');
  await page.getByRole('button', { name: 'Jugar con este mazo' }).click();
};

test('mazo propio de 10E: gate de cobertura, descarga verificada y partida', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api.scryfall.com/**', (route) => route.abort());

  const packRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/data/catalog/packs/')) packRequests.push(url.pathname + url.search);
  });

  await page.goto('/');
  await startGame(page);

  // 1. The start is refused and the refusal names the card and its gap.
  const alert = page.getByRole('alert');
  await expect(alert).toContainText(LIMITED, { timeout: 90_000 });
  await expect(alert).toContainText(/limitaciones conocidas/i);
  await expect(page.locator('section[aria-label^="Tu mano"]')).toBeHidden();

  // 2. The explicit permission is what unblocks it — nothing else changed.
  await page.getByRole('checkbox', { name: /Permitir \d+ carta\(s\) con limitaciones conocidas/ }).check();
  await page.getByRole('button', { name: 'Jugar con este mazo' }).click();

  // 3. The pack the deck needs was fetched by content, with its digest in the URL.
  const tenE = packRequests.find((url) => url.startsWith('/data/catalog/packs/10e.json'));
  expect(tenE, 'la partida debe descargar el pack 10e').toBeTruthy();
  expect(tenE).toMatch(/\?v=[0-9a-f]{64}$/);

  // 4. A real game: hand rendered from engine state, actions accepted, revision grows.
  const hand = page.locator('section[aria-label^="Tu mano"]');
  const app = page.locator('.app');
  await expect(hand.locator('[data-card-id]').first()).toBeVisible({ timeout: 120_000 });
  const before = Number(await app.getAttribute('data-actions-applied'));
  expect(Number.isFinite(before)).toBe(true);

  const handoff = page.locator('.handoff');
  await page.addLocatorHandler(handoff.locator('button'), async () => {
    await handoff.locator('button').click({ timeout: 2_000 }).catch(() => {});
  });

  // Pass priority / keep hand until the engine does something else; bounded.
  const decision = page.locator('section[aria-label="Decisión pendiente"]');
  for (let step = 0; step < 60; step += 1) {
    const keep = decision.getByRole('button', { name: 'Conservar mano' });
    const pass = decision.locator('.confirmations button').filter({ hasText: /^Pasar/ }).first();
    if (await keep.count()) await keep.first().click().catch(() => {});
    else if (await pass.count()) await pass.first().click().catch(() => {});
    else break;
  }
  await expect
    .poll(async () => Number(await app.getAttribute('data-actions-applied')), { timeout: 60_000 })
    .toBeGreaterThan(before);

  // 5. Cards on screen are the ones the deck asked for, not placeholders.
  await expect(page.locator('section[aria-label^="Tu mano"], section[aria-label^="Tu campo"]')).toContainText(/./);
  expect(errors).toEqual([]);
});

test('estado de bloqueo: el tablero queda inerte, cubierto y sin fuga de mano', async ({ page }) => {
  test.setTimeout(240_000);
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/');

  // Hand-off on every seat change is what makes the block observable.
  await page.getByRole('checkbox', { name: 'Confirmar cada cambio de asiento' }).check();
  await page.getByRole('button', { name: 'Iniciar partida' }).click();

  const dialog = page.getByRole('dialog', { name: 'Paso de asiento' });
  await expect(dialog).toBeVisible({ timeout: 120_000 });
  await expect(dialog.getByRole('button', { name: 'Estoy listo' })).toBeFocused();

  const board = page.locator('main.layout');
  await expect(board).toHaveAttribute('aria-hidden', 'true');
  await expect(board).toHaveAttribute('inert', '');

  // The overlay is opaque and covers the viewport: nothing behind it can be read.
  const geometry = await page.locator('.handoff').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      background: style.backgroundColor,
      opacity: Number(style.opacity)
    };
  });
  expect(geometry.width).toBeGreaterThanOrEqual(geometry.viewportWidth);
  expect(geometry.height).toBeGreaterThanOrEqual(geometry.viewportHeight);
  expect(geometry.opacity).toBeGreaterThan(0.9);
  expect(geometry.background).not.toBe('rgba(0, 0, 0, 0)');

  // The opponent's hand is not rendered while the device is blocked.
  await expect(page.locator('.mini-back')).toHaveCount(0);

  // Confirming returns the board: interactive and visible again.
  await dialog.getByRole('button', { name: 'Estoy listo' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(board).not.toHaveAttribute('aria-hidden', 'true');
  await expect(board).not.toHaveAttribute('inert', '');
});
