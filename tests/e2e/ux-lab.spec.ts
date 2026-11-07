import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The UX lab is the only route that exercises the Phase line layer and the
 * zone viewer **without** the WASM engine, so it can be asserted in CI on its
 * own terms. It never claims to test rules: `/` and the engine specs do that.
 */
test.beforeEach(async ({ page }) => {
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
});

test('la capa de líneas dibuja objetivos y pila, y sólo cuando el motor los ofrece', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ux?scene=targets');

  const overlay = page.locator('.board-overlay');
  await expect(overlay).toBeVisible();
  const arcs = overlay.locator('.arc');
  await expect(arcs).toHaveCount(4); // 2 objetivos legales + 2 objetivos declarados en la pila
  const kinds = await arcs.evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute('data-kind')))]);
  expect(kinds).toEqual(expect.arrayContaining(['target', 'stack']));

  // Every path is a real quadratic curve with finite numbers: an invalid `d`
  // is silently not painted, which a screenshot review cannot catch.
  const geometry = await overlay.locator('path.stroke').evaluateAll((paths) => paths.map((path) => ({
    d: path.getAttribute('d') ?? '',
    dash: path.getAttribute('stroke-dasharray')
  })));
  for (const path of geometry) {
    expect(path.d).toMatch(/^M (-?[\d.]+) (-?[\d.]+) Q /);
    expect(path.d).not.toContain('NaN');
  }

  // The two layers bow in opposite directions instead of hiding each other.
  const [first, second] = geometry.slice(0, 2).map((path) => path.d);
  expect(first).not.toBe(second);

  // Decorative: it must never swallow a click meant for a card or a seat.
  await expect(overlay).toHaveAttribute('aria-hidden', 'true');
  const pointer = await overlay.evaluate((node) => getComputedStyle(node).pointerEvents);
  expect(pointer).toBe('none');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('el combate dibuja atacantes (el bloqueado a trazos) y bloqueos', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ux?scene=combat');

  const arcs = page.locator('.board-overlay .arc');
  await expect(arcs).toHaveCount(3); // 2 atacantes + 1 bloqueo
  await expect(page.locator('.board-overlay .arc[data-kind="attack"]')).toHaveCount(2);
  await expect(page.locator('.board-overlay .arc[data-kind="block"]')).toHaveCount(1);

  const dashes = await page.locator('.board-overlay .arc[data-kind="attack"] path.stroke')
    .evaluateAll((paths) => paths.map((path) => path.getAttribute('stroke-dasharray')));
  expect(dashes.filter((value) => value)).toHaveLength(1); // el atacante bloqueado

  // The committed blocks are read from Phase's `blocker_to_attacker`; the
  // ability to draw them is the visible half of that contract.
  const block = page.locator('.board-overlay .arc[data-kind="block"] path.stroke');
  await expect(block).toHaveCount(1);
});

test('sin decisiones de Phase no se inventa ninguna línea', async ({ page }) => {
  await page.goto('/ux?scene=idle');
  await expect(page.locator('.board-overlay')).toHaveCount(0);
});

test('una pila de zona abre su visor, se lee con teclado y devuelve el foco', async ({ page }) => {
  await page.goto('/ux?scene=combat');

  const pile = page.getByRole('button', { name: /Cementerio 2 · Cementerio de Jugador 1/ });
  await expect(pile).toBeVisible();
  await pile.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: /Cementerio · Jugador 1/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-card-id]')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: 'Cerrar cementerio' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(pile).toBeFocused();

  // The library is a count, never a reconstructed order.
  await page.getByRole('button', { name: /Biblioteca 33 · Biblioteca de Jugador 1/ }).click();
  const library = page.getByRole('dialog', { name: /Biblioteca · Jugador 1/ });
  await expect(library).toBeVisible();
  await expect(library.locator('[data-card-id]')).toHaveCount(0);
  await expect(library).toContainText('Phase no envía el orden de la biblioteca');
  await page.keyboard.press('Escape');
  await expect(library).toHaveCount(0);
});

test('el laboratorio y su visor no tienen violaciones axe críticas o serias', async ({ page }) => {
  await page.goto('/ux?scene=targets');
  await expect(page.locator('.board-overlay')).toBeVisible();

  const board = await new AxeBuilder({ page }).analyze();
  const seriousBoard = board.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''));
  expect(seriousBoard).toEqual([]);

  await page.getByRole('button', { name: /Cementerio 1 · Cementerio de Jugador 2/ }).click();
  const dialog = page.getByRole('dialog', { name: /Cementerio · Jugador 2/ });
  await expect(dialog).toBeVisible();
  // Native dialog: the rest of the page is inert while it is modal.
  const modal = await new AxeBuilder({ page }).analyze();
  const seriousModal = modal.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''));
  expect(seriousModal).toEqual([]);
});

for (const [width, height] of [[320, 800], [390, 844], [768, 1024]] as const) {
  test(`la capa y las pilas caben a ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/ux?scene=targets');
    await expect(page.locator('.board-overlay .arc')).toHaveCount(4);
    await expect(page.locator('[data-zone-pile]')).toHaveCount(6);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('el cromo de mesa nombra la prioridad, la mano y el paso, y el control conmuta el auto-paso', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ux?scene=idle');

  const dock = page.getByRole('group', { name: 'Estado de la mesa' });
  await expect(dock).toBeVisible();
  await expect(dock).toContainText('Tu prioridad');
  await expect(dock).toContainText('Mano 3');
  await expect(dock).toContainText('Principal 1');

  const control = dock.getByRole('button', { name: /Control total/ });
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  // The preference is the same one the top bar writes, not a second state.
  expect(await page.evaluate(() => localStorage.getItem('mesa:autoPass'))).toBe('off');

  await page.reload();
  await expect(page.getByRole('group', { name: 'Estado de la mesa' }).getByRole('button', { name: /Control total/ }))
    .toHaveAttribute('aria-pressed', 'true');
});

test('el aviso de flujo explica el auto-paso, se descarta y no vuelve', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ux?scene=idle');

  const tip = page.getByRole('complementary', { name: 'Consejo de flujo' });
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Los saltos de fase son automáticos');
  await expect(tip.getByRole('link', { name: 'Conocer el flujo' })).toHaveAttribute('href', '/aprender');

  await tip.getByRole('button', { name: 'Descartar' }).click();
  await expect(tip).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('mesa:coach:autoPass'))).toBe('off');

  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Consejo de flujo' })).toHaveCount(0);
});

test('la mano oculta del rival se dibuja en abanico y anuncia su recuento', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ux?scene=idle');

  const hand = page.getByRole('group', { name: 'Mano oculta de Jugador 2' });
  await expect(hand).toBeVisible();
  await expect(hand.locator('.mini-back')).toHaveCount(3);
  // The count is decoration: the group's label already says it is a hidden hand.
  await expect(hand.locator('.fan-count')).toHaveAttribute('aria-hidden', 'true');
  await expect(hand.locator('.fan-count')).toHaveText('3');
});
