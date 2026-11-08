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

test('la barra de fases marca la parada y la conserva entre recargas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ux?scene=idle');

  const bar = page.getByRole('region', { name: 'Fases y paradas' });
  await expect(bar).toBeVisible();
  // Twelve steps, exactly the ones the turn track groups.
  await expect(bar.getByRole('button', { name: /· parada en/ })).toHaveCount(12);
  await expect(bar.getByRole('button', { name: 'Principal · parada en Principal 1' })).toHaveAttribute('aria-current', 'step');

  const block = bar.getByRole('button', { name: 'Bloquear · parada en Declarar bloqueadoras' });
  await expect(block).toHaveAttribute('aria-pressed', 'false');
  await block.click();
  await expect(block).toHaveAttribute('aria-pressed', 'true');
  await expect(bar).toContainText('Parada en Declarar bloqueadoras');
  expect(await page.evaluate(() => localStorage.getItem('mesa:stops'))).toBe('{"DeclareBlockers":true}');

  await page.reload();
  await expect(page.getByRole('region', { name: 'Fases y paradas' })
    .getByRole('button', { name: 'Bloquear · parada en Declarar bloqueadoras' })).toHaveAttribute('aria-pressed', 'true');

  // Keyboard reaches and releases it, and the dock stops announcing a stop.
  await page.getByRole('button', { name: 'Bloquear · parada en Declarar bloqueadoras' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Bloquear · parada en Declarar bloqueadoras' })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('mesa:stops'))).toBe('{}');
});

test('en el teléfono la ficha de fase sustituye a la barra y abre las paradas en una hoja', async ({ page }) => {
  // At 390 px the twelve-chip bar spent 84 px of the screen and every chip was a
  // 30 px target. The chip is one line; the sheet is where the stops live.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ux?scene=idle');

  const chip = page.locator('.phase-chip .chip');
  await expect(chip).toBeVisible();
  await expect(page.locator('.stop-bar')).toBeHidden();
  await expect(chip).toContainText('Turno 4');
  await expect(chip).toContainText('Principal');
  await expect(chip).toContainText('Sin paradas');
  expect(await chip.evaluate((node) => Math.round(node.getBoundingClientRect().height))).toBeLessThanOrEqual(40);

  await chip.click();
  const sheet = page.getByRole('dialog', { name: 'Paradas del turno' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.row')).toHaveCount(12);
  // The row the engine reports as current is the one that takes the focus.
  await expect(sheet.getByRole('button', { name: /Principal 1/ })).toBeFocused();
  await expect(sheet.getByRole('button', { name: /Principal 1/ })).toHaveAttribute('aria-current', 'step');

  const row = sheet.getByRole('button', { name: /Declarar bloqueadoras/ });
  await expect(row).toHaveAttribute('aria-pressed', 'false');
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await expect(row).toContainText('Con parada');
  expect(await page.evaluate(() => localStorage.getItem('mesa:stops'))).toBe('{"DeclareBlockers":true}');

  const axe = await new AxeBuilder({ page }).include('dialog.phase-sheet').analyze();
  const serious = axe.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''));
  expect(serious.map((violation) => violation.id)).toEqual([]);

  // Escape closes the sheet and hands the focus back to the chip, not to the page.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paradas del turno' })).toHaveCount(0);
  await expect(chip).toBeFocused();
  await expect(chip).toContainText('Parada en 1 paso');
});

test('una parada en el paso actual aparece en el estado de la mesa', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ux?scene=idle');

  const dock = page.getByRole('group', { name: 'Estado de la mesa' });
  await expect(dock).not.toContainText('Parada');
  await page.getByRole('button', { name: 'Principal · parada en Principal 1' }).click();
  await expect(dock).toContainText('Parada');
});

test('el descarte de un efecto pide exactamente las cartas que publica el motor', async ({ page }) => {
  // `WaitingFor::DiscardChoice`: a discard effect (Mind Rot in the fixture) names
  // the eligible cards and how many of them it takes.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ux?scene=discard');

  const block = page.locator('[aria-label="Descartar 2 cartas"]');
  await expect(block).toBeVisible();
  await expect(block).toContainText('Elige exactamente esta cantidad');
  const confirm = block.getByRole('button', { name: /Confirmar descarte/ });
  await expect(confirm).toBeDisabled();

  const hand = page.locator('section.hand-zone [data-card-id]');
  await expect(hand).toHaveCount(3);
  await hand.nth(0).click();
  await expect(block.getByRole('button', { name: /Confirmar descarte/ })).toContainText('(1/2)');
  await expect(block.getByRole('button', { name: /Confirmar descarte/ })).toBeDisabled();
  await hand.nth(1).click();
  await expect(block.getByRole('button', { name: /Confirmar descarte/ })).toBeEnabled();
  // The marked cards are the ones on the table, not a private list.
  await expect(hand.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(hand.nth(2)).toHaveAttribute('aria-pressed', 'false');
  await expect(block).toContainText('Mountain');
  await expect(block).toContainText('Grizzly Bears');
  const axe = await new AxeBuilder({ page }).include('.center .prompt').analyze();
  expect(axe.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? '')).map((v) => v.id)).toEqual([]);
});

test('"descartar hasta N" admite no descartar nada', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ux?scene=discardUpTo');

  const block = page.locator('[aria-label="Descartar hasta 2 cartas"]');
  await expect(block).toBeVisible();
  await expect(block).toContainText('Puedes descartar menos, incluso ninguna');
  // CR 701.9b: zero is a legal answer, so the confirm button is live and says so.
  const none = block.getByRole('button', { name: /No descartar/ });
  await expect(none).toBeEnabled();
  const hand = page.locator('section.hand-zone [data-card-id]');
  await hand.nth(0).click();
  await expect(block.getByRole('button', { name: /Confirmar descarte/ })).toContainText('(1/2)');
  await expect(block.getByRole('button', { name: /Confirmar descarte/ })).toBeEnabled();
});

test('el selector de ataque se ancla al atacante y sólo ofrece los destinos del motor', async ({ page }) => {
  // The engine's per-attacker map in this fixture: 100 may aim at the seat or at
  // the rival planeswalker, 101 only at the seat.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ux?scene=attackers');

  const bear = page.locator('[data-card-id="100"]').first();
  await bear.click();
  const picker = page.getByRole('menu', { name: 'A quién ataca Grizzly Bears' });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('menuitemradio')).toHaveText(['Jugador 2', 'Chandra, Torch of Defiance']);
  // The first choice takes the focus: the picker is usable without a pointer.
  await expect(picker.getByRole('menuitemradio').first()).toBeFocused();

  // Placed from its measured box: a creature in the lower half must not push the
  // popover past the viewport (measured earlier: it opened at y 890 of 900).
  const box = await picker.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(8);
  expect(box!.y + box!.height).toBeLessThanOrEqual(900 - 8);

  await picker.getByRole('menuitemradio', { name: 'Jugador 2' }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('[data-card-id="100"]').first()).toBeFocused();

  // The draft is readable afterwards, and `Escape` still returns the focus.
  await bear.click();
  await expect(page.getByRole('menuitemradio', { name: 'Jugador 2' })).toHaveAttribute('aria-checked', 'true');
  const axe = await new AxeBuilder({ page }).include('.attack-picker').analyze();
  expect(axe.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? '')).map((v) => v.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: /A quién ataca/ })).toHaveCount(0);
  await expect(page.locator('[data-card-id="100"]').first()).toBeFocused();

  // A single legal defender needs no picker: the table assigns it directly.
  await page.locator('[data-card-id="101"]').first().click();
  await expect(page.getByRole('menu', { name: /A quién ataca/ })).toHaveCount(0);
});

test('el menú de acciones de una carta se abre con el teclado, lista lo que ofrece el motor y devuelve el foco', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ux?scene=idle');

  const card = page.locator('[data-card-id="100"]').first();
  await card.focus();
  await page.keyboard.press('Shift+F10');

  const menu = page.getByRole('menu', { name: 'Acciones de Grizzly Bears' });
  await expect(menu).toBeVisible();
  const items = menu.getByRole('menuitem');
  // The engine's action plus the two safe entries; nothing invented.
  await expect(items.filter({ hasText: 'Ampliar carta' })).toHaveCount(1);
  await expect(items.filter({ hasText: 'Quitar selección' })).toHaveCount(1);

  // Arrow keys move focus inside the menu.
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(card).toBeFocused();
});

test('el menú también se abre con el botón derecho y respeta un diálogo abierto', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ux?scene=idle');

  await page.locator('[data-card-id="100"]').first().click({ button: 'right' });
  await expect(page.getByRole('menu', { name: 'Acciones de Grizzly Bears' })).toBeVisible();
  await page.keyboard.press('Escape');

  // With a modal open the background menu must not open over it.
  await page.getByRole('button', { name: /Biblioteca 33 · Biblioteca de Jugador 1/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('la vista de asignación de daño nombra los repartos que propone Phase', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ux?scene=damage');

  const view = page.getByRole('region', { name: 'Asignación de daño de combate' });
  await expect(view).toBeVisible();
  await expect(view).toContainText('reparte 3');
  await expect(view).toContainText('mínimo letal 2');
  await expect(view.getByRole('button', { name: '2 a Grizzly Bears, 1 de exceso a Jugador 2' })).toBeVisible();
  await expect(view.getByRole('button', { name: 'Repartir como si no estuviera bloqueada' })).toBeVisible();
  // It says who proposed the numbers: the UI does not invent splits.
  await expect(view).toContainText('Las cantidades las propone Phase');

  const board = await new AxeBuilder({ page }).analyze();
  const serious = board.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''));
  expect(serious).toEqual([]);
});
