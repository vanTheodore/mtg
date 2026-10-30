import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Mesa 0.6 — the guided lesson, driven only through the interface.
 *
 * The test never imports the engine and never fabricates an action: it clicks
 * what a beginner would click and reads what the interface says. Legality is
 * always Phase's answer; this file only picks among the controls Mesa shows.
 */

const panel = (page: Page): Locator => page.locator('aside[aria-label="Lección"]');
const stepTitle = (page: Page): Locator => panel(page).locator('h2');
const focusedCard = (page: Page): Locator => page.locator('[data-tutorial-focus="true"]');
const shotsDir = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));

/** Open the lesson from the landing page and wait for the real engine. */
async function openLesson(page: Page): Promise<void> {
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/');
  const entry = page.getByRole('link', { name: 'Aprender a jugar' });
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page).toHaveURL(/\/aprender/);
  await expect(stepTitle(page)).toHaveText('Tu primera partida', { timeout: 30_000 });
  // The board is the engine's, not a mock: both seats are on the table.
  await expect(page.locator('section[aria-label="Jugador 1"]')).toBeVisible({ timeout: 180_000 });
  await expect(page.locator('section[aria-label="Jugador 2"]')).toContainText('20', { timeout: 30_000 });
}

/** The names of the cards in the learner's hand, in the order Mesa shows them. */
async function handNames(page: Page): Promise<string[]> {
  return page.locator('section[aria-label^="Tu mano"] [data-card-id] .fallback-name').allTextContents();
}

test('la lección se completa jugrando de verdad con el motor Phase', async ({ page }) => {
  test.setTimeout(420_000);
  await openLesson(page);

  // ── Paso 1: leer ───────────────────────────────────────────────────────────
  await panel(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(stepTitle(page)).toHaveText('Juega tu primera tierra');

  // ── Una acción inesperada no rompe la lección ─────────────────────────────
  const lions = page.locator('section[aria-label^="Tu mano"] [data-card-id]', { hasText: 'Savannah Lions' }).first();
  if (await lions.count()) {
    await lions.click();
    await expect(panel(page).locator('.message')).toContainText(/no es la carta que toca|todavía no puede|ahora no toca/i);
    await expect(stepTitle(page)).toHaveText('Juega tu primera tierra');
  }

  // ── Paso 2: jugar una tierra ──────────────────────────────────────────────
  await expect(focusedCard(page)).toBeVisible();
  await expect(focusedCard(page)).toContainText('Plains');
  await focusedCard(page).click();
  await expect(stepTitle(page)).toHaveText('Genera maná', { timeout: 30_000 });

  // ── Paso 3: generar maná ──────────────────────────────────────────────────
  await expect(focusedCard(page)).toBeVisible();
  await focusedCard(page).click();
  await expect(stepTitle(page)).toHaveText('Lanza una criatura', { timeout: 30_000 });
  // La reserva de maná del aprendiz muestra el maná que acaba de generar.
  await expect(panel(page).locator('.mana-pool .pip')).toHaveCount(1);
  await expect(panel(page).locator('.mana-pool .pip')).toHaveText('1');

  // ── El coste se enseña con pips ───────────────────────────────────────────
  await expect(panel(page).locator('.cost .pip.white')).toHaveCount(1);

  // Capturas del ancho que pide la fase (320, 375, 390, 768, 1440).
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 800 : 900 });
    await expect(panel(page)).toBeVisible();
    await page.screenshot({ path: `${shotsDir}tutorial-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── Paso 4: lanzar la criatura ────────────────────────────────────────────
  await expect(focusedCard(page)).toBeVisible();
  await focusedCard(page).click();
  await expect(stepTitle(page)).toHaveText('Fuerza y resistencia', { timeout: 60_000 });

  // ── Paso 5: entender fuerza y resistencia ─────────────────────────────────
  await panel(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(stepTitle(page)).toHaveText('Termina tu turno');

  // ── Paso 6: terminar el turno (el maniquí juega solo) ─────────────────────
  await panel(page).getByRole('button', { name: 'Terminar mi turno' }).click();
  await expect(stepTitle(page)).toHaveText('Ataca con tu criatura', { timeout: 90_000 });

  // ── Paso 7: atacar ────────────────────────────────────────────────────────
  await expect(focusedCard(page)).toBeVisible();
  await expect(focusedCard(page)).toContainText('Savannah Lions');
  await focusedCard(page).click();
  await expect(stepTitle(page)).toHaveText('El daño', { timeout: 60_000 });
  await expect(panel(page)).toContainText('18');

  // El maniquí recibió el daño; el aprendiz no lo recibió.
  await expect(page.locator('section[aria-label="Jugador 2"]')).toContainText('18');
  await expect(page.locator('section[aria-label="Jugador 1"]')).toContainText('20');
  await page.screenshot({ path: `${shotsDir}tutorial-combate-1440.png`, fullPage: true });

  // ── Paso 8: el daño ───────────────────────────────────────────────────────
  await panel(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(stepTitle(page)).toHaveText('¡Lo lograste!', { timeout: 30_000 });
  await expect(panel(page)).toContainText('Lo que ya sabes hacer');
  await page.screenshot({ path: `${shotsDir}tutorial-final-1440.png`, fullPage: true });

  // ── Repetir es determinista ───────────────────────────────────────────────
  const firstHand = await handNames(page);
  await panel(page).getByRole('button', { name: 'Repetir la lección' }).click();
  await expect(stepTitle(page)).toHaveText('Tu primera partida', { timeout: 180_000 });
  await expect(page.locator('section[aria-label="Jugador 2"]')).toContainText('20', { timeout: 60_000 });
  await panel(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(stepTitle(page)).toHaveText('Juega tu primera tierra', { timeout: 30_000 });
  expect(await handNames(page)).toEqual(firstHand);
});

test('la lección se puede usar con teclado y sinaxe grave', async ({ page }) => {
  test.setTimeout(300_000);
  await openLesson(page);

  // El botón principal se alcanza con el teclado y muestra el foco.
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName ?? '');
  expect(['BUTTON', 'A', 'INPUT', 'SELECT']).toContain(focused);

  await panel(page).getByRole('button', { name: 'Continuar' }).click();
  await expect(stepTitle(page)).toHaveText('Juega tu primera tierra');

  // La carta resaltada se puede activar con el teclado.
  const card = focusedCard(page);
  await card.focus();
  await expect(card).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(stepTitle(page)).toHaveText('Genera maná', { timeout: 30_000 });

  // La ayuda está disponible sin interrumpir la partida.
  await panel(page).getByRole('button', { name: 'Palabras nuevas' }).click();
  await expect(panel(page).locator('.glossary')).toBeVisible();
  await expect(panel(page).locator('.glossary')).toContainText('maná');
  await panel(page).getByRole('button', { name: 'Ver el repaso' }).click();
  await expect(panel(page).locator('.recap')).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
  expect(serious).toEqual([]);
});

test('la lección se ve entera en 320, 375, 390, 768 y 1440 px', async ({ page }) => {
  test.setTimeout(300_000);
  await openLesson(page);
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 800 : 900 });
    await expect(panel(page)).toBeVisible();
    await expect(stepTitle(page)).toBeVisible();
    // Sin desbordamiento horizontal.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    // La lección no tapa el tablero: los dos bloques no se superponen.
    const lesson = await panel(page).boundingBox();
    const board = await page.locator('main[aria-label="Tablero de la lección"]').boundingBox();
    expect(lesson).not.toBeNull();
    expect(board).not.toBeNull();
    const overlap =
      lesson!.x < board!.x + board!.width &&
      board!.x < lesson!.x + lesson!.width &&
      lesson!.y < board!.y + board!.height &&
      board!.y < lesson!.y + lesson!.height;
    expect(overlap).toBe(false);
  }
});
