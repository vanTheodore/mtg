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

test('lo que no se queda arriba va al fondo en scry y al cementerio en surveil', async ({ page }) => {
  await page.goto('/ux?scene=scry');
  const scry = page.locator('[data-scry-prompt]');
  await expect(scry).toBeVisible();
  await expect(scry.locator('strong')).toHaveText('Adivinar 3 (scry)');
  await expect(scry).toContainText('al fondo de la biblioteca');
  await expect(scry).toContainText('CR 701.22a');

  // Nothing kept yet: the confirm says everything goes down.
  await expect(scry.locator('.kept')).toContainText('Nada se queda arriba');
  const confirm = scry.getByRole('button', { name: /^Confirmar/ });
  await expect(confirm).toHaveText('Confirmar: todo va al fondo de la biblioteca');

  // Keeping two, and the order is the answer: the first kept card is the new top.
  await scry.getByRole('button', { name: /^Shock/ }).click();
  await scry.getByRole('button', { name: /^Llanowar Elves/ }).click();
  await expect(confirm).toHaveText('Confirmar: Shock → Llanowar Elves');
  await scry.getByRole('button', { name: 'Subir Llanowar Elves' }).click();
  await expect(confirm).toHaveText('Confirmar: Llanowar Elves → Shock');
  await expect(scry.getByRole('button', { name: 'Subir Llanowar Elves' })).toBeDisabled();
  await scry.getByRole('button', { name: 'Quitar Shock de arriba' }).click();
  await expect(confirm).toHaveText('Confirmar: Llanowar Elves');

  // Surveil: same block, different destination — and it says so.
  await page.goto('/ux?scene=surveil');
  const surveil = page.locator('[data-scry-prompt]');
  await expect(surveil.locator('strong')).toHaveText('Vigilar 2 (surveil)');
  await expect(surveil).toContainText('al cementerio');
  await expect(surveil).toContainText('CR 701.25a');
  await expect(surveil.getByRole('button', { name: /^Confirmar/ })).toHaveText('Confirmar: todo va al cementerio');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('tripular y montar suman la aportación que publica el motor, no el poder impreso', async ({ page }) => {
  await page.goto('/ux?scene=crew');
  const crew = page.locator('[data-tap-power]');
  await expect(crew).toBeVisible();
  await expect(crew.locator('strong')).toHaveText('Tripular · Smogbelcher Chariot');
  // Crew 3 with a 2, a 2 and a 1: the threshold is the engine's, the sum is shown.
  await expect(crew).toContainText('hasta sumar 3');
  await expect(crew.locator('[data-tap-total]')).toContainText('Sumas 0 de 3');
  // The confirm button keeps its place and changes its label with the pick.
  const board = crew.locator('button.primary');
  await expect(board).toBeDisabled();

  // One creature is not enough, and the block says how much is missing.
  await crew.getByRole('button', { name: /^Elvish Mystic/ }).click();
  await expect(crew.locator('[data-tap-total]')).toContainText('Sumas 1 de 3');
  await expect(crew.locator('[data-tap-total]')).not.toContainText('suficiente');
  await expect(board).toBeDisabled();

  // The pick reaches the threshold and only then can be confirmed.
  await crew.getByRole('button', { name: /^Grizzly Bears/ }).click();
  await expect(crew.locator('[data-tap-total]')).toContainText('Sumas 3 de 3 · suficiente');
  await expect(board).toBeEnabled();
  await expect(board).toHaveText('Tripular: Elvish Mystic + Grizzly Bears');
  // Selected rows are marked, not just coloured.
  await expect(crew.getByRole('button', { name: /^Grizzly Bears/ })).toHaveAttribute('aria-pressed', 'true');

  // Saddle is the same block with another keyword and another action.
  await page.goto('/ux?scene=saddle');
  const saddle = page.locator('[data-tap-power]');
  await expect(saddle.locator('strong')).toHaveText('Montar · Ornery Tumblewagg');
  await expect(saddle).toContainText('hasta sumar 2');
  // The distinction the block has to carry: mounting is not crewing.
  await expect(saddle).toContainText('Es montar, no tripular');
  await expect(saddle).toContainText('CR 702.171a');
  await expect(saddle.locator('[data-tap-total]')).toContainText('Sumas 0 de 2');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('mover contadores no puede sacar del origen más de los que hay', async ({ page }) => {
  await page.goto('/ux?scene=moveCounters');
  const block = page.locator('[data-move-counters]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Mover contadores · Forgotten Ancient');
  await expect(block).toContainText('nunca puedes mover más de los que hay');
  await expect(block).toContainText('CR 122.5');
  // The pool is the ceiling, and it is the engine's.
  await expect(block.locator('[data-move-available]')).toContainText('3 de +1/+1');
  await expect(block.locator('[data-move-remaining="P1P1"]')).toHaveText('3');
  // Moving nothing is legal: the text says "may move any number".
  const confirm = block.locator('button.primary');
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText('Confirmar sin mover nada');

  // Two to one creature, one to another: the pool empties and the + stops.
  await block.getByRole('button', { name: 'Añadir un +1/+1 a Grizzly Bears (Jugador 1)' }).click();
  await block.getByRole('button', { name: 'Añadir un +1/+1 a Grizzly Bears (Jugador 1)' }).click();
  await expect(block.locator('[data-move-remaining="P1P1"]')).toHaveText('1');
  await expect(confirm).toHaveText('Mover: 2 +1/+1 a Grizzly Bears (Jugador 1)');
  await block.getByRole('button', { name: 'Añadir un +1/+1 a Elvish Mystic' }).click();
  await expect(block.locator('[data-move-remaining="P1P1"]')).toHaveText('0');
  // The ceiling is per counter type, so it stops every row at once.
  await expect(block.getByRole('button', { name: 'Añadir un +1/+1 a Grizzly Bears (Jugador 2)' })).toBeDisabled();
  await expect(confirm).toHaveText('Mover: 2 +1/+1 a Grizzly Bears (Jugador 1) · 1 +1/+1 a Elvish Mystic');

  // Taking one back frees the pool again.
  await block.getByRole('button', { name: 'Quitar un +1/+1 a Grizzly Bears (Jugador 1)' }).click();
  await expect(block.locator('[data-move-remaining="P1P1"]')).toHaveText('1');
  await expect(block.getByRole('button', { name: 'Añadir un +1/+1 a Grizzly Bears (Jugador 2)' })).toBeEnabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('cambiar los objetivos de un hechizo: cada posición con su pozo', async ({ page }) => {
  await page.goto('/ux?scene=retarget');
  const block = page.locator('[data-retarget]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Cambiar objetivos · Frost Breath');
  // CR 115.7a: each target changes only to another legal target.
  await expect(block).toContainText('CR 115.7a');
  const first = block.locator('[data-retarget-position="0"]');
  const second = block.locator('[data-retarget-position="1"]');
  await expect(first).toHaveCount(1);
  // Two same-name permanents on the same side: the controller alone does not tell
  // them apart, so the engine's id does.
  await expect(first.locator('.declared')).toHaveText('Grizzly Bears (Jugador 2) · #200');
  await expect(second.locator('.declared')).toHaveText('Grizzly Bears (Jugador 2) · #201');

  // "All" keeps every target by default, and that is a legal submission.
  const confirm = block.locator('button.primary');
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText('Dejar los objetivos como están');
  await expect(first.getByRole('button', { name: 'Dejar como está' })).toHaveAttribute('aria-pressed', 'true');
  // The declared target is not among its own alternatives: keeping it is the default.
  await expect(first.getByRole('button', { name: /Grizzly Bears/ })).toHaveCount(0);

  // One position changed; the other stays until it is touched.
  await first.getByRole('button', { name: 'Savannah Lions' }).click();
  await expect(first.getByRole('button', { name: 'Savannah Lions' })).toHaveAttribute('aria-pressed', 'true');
  await expect(block.locator('[data-retarget-changed]')).toHaveText('Confirmar 1 de 2 cambios');
  await second.getByRole('button', { name: 'Elvish Mystic' }).click();
  await expect(block.locator('[data-retarget-changed]')).toHaveText('Confirmar 2 de 2 cambios');

  // A position can go back to its declared target without losing the other pick.
  await first.getByRole('button', { name: 'Dejar como está' }).click();
  await expect(block.locator('[data-retarget-changed]')).toHaveText('Confirmar 1 de 2 cambios');
  await expect(second.getByRole('button', { name: 'Elvish Mystic' })).toHaveAttribute('aria-pressed', 'true');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('cambiar «el» objetivo: una elección, y no puedes dejarlo igual', async ({ page }) => {
  await page.goto('/ux?scene=retargetSingle');
  const block = page.locator('[data-retarget]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Cambiar objetivos · Lightning Bolt');
  await expect(block).toContainText('no puedes dejarlo como está');
  await expect(block.locator('[data-retarget-position]')).toHaveCount(1);
  // Only "single" forbids keeping, and the engine rejects a null here.
  await expect(block.getByRole('button', { name: 'Dejar como está' })).toHaveCount(0);

  const confirm = block.locator('button.primary');
  await expect(confirm).toBeDisabled();
  await expect(confirm).toHaveText('Elige un objetivo nuevo');

  // "Any target": the seats are legal alternatives, not only creatures.
  await block.getByRole('button', { name: 'Jugador 2', exact: true }).click();
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText('Cambiar a Jugador 2');
  // One target changes to one target: a second pick replaces the first.
  await block.getByRole('button', { name: 'Savannah Lions' }).click();
  await expect(confirm).toHaveText('Cambiar a Savannah Lions');
  await expect(block.getByRole('button', { name: 'Jugador 2', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(block.locator('button[aria-pressed="true"]')).toHaveCount(1);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('elegir permanentes: el conjunto es «esos», y no elegir también es respuesta', async ({ page }) => {
  await page.goto('/ux?scene=chooseObjects');
  const block = page.locator('[data-choose-objects]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Elegir permanentes');
  // CR 608.2c: the selection is the set the rest of the effect calls «those».
  await expect(block).toContainText('CR 608.2c');
  await expect(block).toContainText('cualquier número');
  await expect(block.locator('[data-choose-count]')).toHaveText('Elegidos 0 · mínimo 0 · sin tope');

  // "Any number" includes none: the answer is legal as it stands.
  const confirm = block.locator('button.primary');
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText('Confirmar sin elegir ninguno');

  // Every eligible object is a toggle, and the count follows the picks.
  const row = (name: string) => block.getByRole('button', { name: new RegExp(`^${name}`) });
  await row('Grizzly Bears').click();
  await expect(row('Grizzly Bears')).toHaveAttribute('aria-pressed', 'true');
  await expect(block.locator('[data-choose-count]')).toHaveText('Elegidos 1 · mínimo 0 · sin tope');
  await expect(confirm).toHaveText('Confirmar uno elegido');
  await row('Savannah Lions').click();
  await row('Elvish Mystic').click();
  await expect(block.locator('[data-choose-count]')).toHaveText('Elegidos 3 · mínimo 0 · sin tope');
  await expect(confirm).toHaveText('Confirmar 3 elegidos');
  // The window is the eligible set, so nothing is left to disable.
  await expect(block.locator('button.row[aria-pressed="true"]')).toHaveCount(3);

  // Untoggling is how a pick is undone — no separate "clear".
  await row('Savannah Lions').click();
  await expect(block.locator('[data-choose-count]')).toHaveText('Elegidos 2 · mínimo 0 · sin tope');
  await expect(confirm).toHaveText('Confirmar 2 elegidos');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el receptor del daño: una elección que puede ser un jugador, y no es un objetivo', async ({ page }) => {
  await page.goto('/ux?scene=chooseObjectsRecipient');
  const block = page.locator('[data-choose-objects]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Elegir el receptor del daño');
  // CR 115.10a: the recipient is chosen while the instruction is applied, so it
  // is a choice and not a target — no ward, hexproof or protection involved.
  await expect(block).toContainText('CR 115.10a');
  await expect(block).toContainText('no es un objetivo');
  await expect(block).toHaveAttribute('data-choose-recipient', 'true');
  // A seat is eligible here and nowhere else.
  await expect(block.locator('.kind', { hasText: 'Jugador' })).toHaveCount(2);

  const confirm = block.locator('button.primary');
  await expect(confirm).toBeDisabled();
  await expect(confirm).toHaveText('Elige uno');

  await block.getByRole('button', { name: /^Jugador 2/ }).click();
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText('Confirmar uno elegido');
  await expect(block.locator('[data-choose-count]')).toHaveText('Elegidos 1 · mínimo 1 · hasta 1');
  // `max == 1`: with the pick made, the other rows cannot hold a second one.
  await expect(block.getByRole('button', { name: /^Grizzly Bears \(Jugador 2\)/ })).toBeDisabled();
  await expect(block.getByRole('button', { name: /^Jugador 1/ })).toBeDisabled();

  // Releasing the pick reopens the window.
  await block.getByRole('button', { name: /^Jugador 2/ }).click();
  await expect(confirm).toBeDisabled();
  await expect(block.getByRole('button', { name: /^Jugador 1/ })).toBeEnabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('proliferar: cualquiera que ya lleve contadores, y ninguno también vale', async ({ page }) => {
  await page.goto('/ux?scene=proliferate');
  const block = page.locator('[data-proliferate]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Proliferar');
  // CR 701.34a: another counter of each kind already there.
  await expect(block).toContainText('CR 701.34a');
  await expect(block.locator('[data-proliferate-count]')).toHaveText('Elegidos 0 de 4');
  // A player is a legal pick here — poison and energy are counters too.
  await expect(block.locator('.kind', { hasText: 'Jugador' })).toHaveCount(2);

  const confirm = block.locator('button.primary');
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText('Confirmar sin proliferar nada');

  await block.getByRole('button', { name: /^Chandra, Torch of Defiance/ }).click();
  await expect(block.locator('[data-proliferate-count]')).toHaveText('Elegidos 1 de 4');
  await expect(confirm).toHaveText('Proliferar 1 elegido');
  await block.getByRole('button', { name: /^Jugador 2/ }).click();
  await expect(block.locator('[data-proliferate-count]')).toHaveText('Elegidos 2 de 4');
  await expect(confirm).toHaveText('Proliferar 2 elegidos');
  // Untoggling is the undo, and the answer stays legal at zero.
  await block.getByRole('button', { name: /^Chandra, Torch of Defiance/ }).click();
  await block.getByRole('button', { name: /^Jugador 2/ }).click();
  await expect(confirm).toHaveText('Confirmar sin proliferar nada');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('viaje en el tiempo: la misma lista, primero quitar y después poner', async ({ page }) => {
  await page.goto('/ux?scene=timeTravelRemove');
  const block = page.locator('[data-time-travel]');
  await expect(block).toBeVisible();
  // CR 701.56a: the phase is the screen — same rows, opposite verb.
  await expect(block.locator('strong')).toHaveText('Viaje en el tiempo · quitar contadores');
  await expect(block).toContainText('CR 701.56a');
  await expect(block).toHaveAttribute('data-time-travel-phase', 'remove');
  await expect(block.locator('[data-time-travel-count]')).toHaveText('Elegidos 0 de 2');
  const confirm = block.locator('button.primary');
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText('Confirmar sin quitar ninguno');

  await block.getByRole('button', { name: /^Ancestral Vision/ }).click();
  await expect(confirm).toHaveText('Quitar un contador a 1 elegido');
  await expect(block.getByRole('button', { name: /^Ancestral Vision/ }).locator('.tick')).toHaveText('−');
  // Suspended cards live in exile: the row says where the object is.
  await expect(block.locator('.zone', { hasText: 'Exilio' })).toHaveCount(2);

  // The add half is the same list without the object just chosen.
  await page.goto('/ux?scene=timeTravelAdd');
  const add = page.locator('[data-time-travel]');
  await expect(add.locator('strong')).toHaveText('Viaje en el tiempo · poner contadores');
  await expect(add).toHaveAttribute('data-time-travel-phase', 'add');
  await expect(add.locator('[data-time-travel-count]')).toHaveText('Elegidos 0 de 1');
  await expect(add).toContainText('no las dos cosas');
  await expect(add.getByRole('button', { name: /^Ancestral Vision/ })).toHaveCount(0);
  await expect(add.locator('button.primary')).toHaveText('Confirmar sin poner ninguno');
  await add.getByRole('button', { name: /^Lotus Bloom/ }).click();
  await expect(add.locator('button.primary')).toHaveText('Poner un contador en 1 elegido');
  await expect(add.getByRole('button', { name: /^Lotus Bloom/ }).locator('.tick')).toHaveText('+');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('conservar uno de cada tipo: una ranura por categoría, y vacía si no hay candidatos', async ({ page }) => {
  await page.goto('/ux?scene=category');
  const block = page.locator('[data-category-choice]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toContainText('Cataclysm');
  // CR 101.4: keep one permanent of each type, sacrifice the rest.
  await expect(block).toContainText('CR 101.4');
  await expect(block.locator('[data-category-group]')).toHaveCount(4);
  // An empty category is not a missing pick: the engine wants a null there.
  await expect(block.locator('[data-category-empty]')).toContainText('Sin candidatos en un tipo');
  const enchantment = block.locator('[data-category-group="Enchantment"]');
  await expect(enchantment).toContainText('Nada que conservar de este tipo.');
  await expect(enchantment.locator('[data-category-pick]')).toHaveCount(0);

  const confirm = block.locator('button.primary');
  await expect(confirm).toBeDisabled();
  await expect(confirm).toHaveText('Elige uno de cada tipo con candidatos');

  // Three categories have candidates, so three picks unlock the answer.
  await block.locator('[data-category-group="Artifact"]').getByRole('button', { name: 'Bonesplitter' }).click();
  await expect(confirm).toBeDisabled();
  const creature = block.locator('[data-category-group="Creature"]');
  await creature.getByRole('button', { name: 'Savannah Lions' }).click();
  await expect(confirm).toBeDisabled();
  // One pick per category: a second one replaces, it does not add.
  await creature.getByRole('button', { name: 'Elvish Mystic' }).click();
  await expect(creature.locator('button[aria-pressed="true"]')).toHaveCount(1);
  await expect(creature.getByRole('button', { name: 'Elvish Mystic' })).toHaveAttribute('aria-pressed', 'true');

  await block.locator('[data-category-group="Land"]').getByRole('button', { name: 'Forest (Jugador 1) · #102' }).click();
  await expect(confirm).toBeEnabled();
  // The prompt comes back once per player in APNAP order.
  await expect(confirm).toHaveText('Conservar 3 y sacrificar el resto · después elige el Jugador 2');

  // Releasing a pick closes the answer again.
  await block.locator('[data-category-group="Land"]').getByRole('button', { name: 'Forest (Jugador 1) · #102' }).click();
  await expect(confirm).toBeDisabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('conservar por todos: el mismo bloque elige de la mesa del rival', async ({ page }) => {
  await page.goto('/ux?scene=categoryForAll');
  const block = page.locator('[data-category-choice]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toContainText('Tragic Arrogance');
  // CR 101.4: `ControllerForAll` — the caster picks for every player.
  await expect(block).toContainText('Eliges tú por todos los jugadores');
  await expect(block).toContainText('Jugador 2');
  await expect(block.locator('[data-category-group]')).toHaveCount(4);

  // Two same-name permanents on the same side, so the id is what separates them.
  const creature = block.locator('[data-category-group="Creature"]');
  await expect(creature.getByRole('button', { name: 'Grizzly Bears (Jugador 2) · #200' })).toHaveCount(1);
  await creature.getByRole('button', { name: 'Grizzly Bears (Jugador 2) · #200' }).click();
  await block.locator('[data-category-group="Artifact"]').getByRole('button', { name: 'Bonesplitter' }).click();
  await block.locator('[data-category-group="Planeswalker"]').getByRole('button', { name: 'Chandra, Torch of Defiance' }).click();

  const confirm = block.locator('button.primary');
  await expect(confirm).toBeEnabled();
  // No other player is left to choose: this was the only round.
  await expect(confirm).toHaveText('Conservar 3 y sacrificar el resto');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('copiar la elegida: el orden es la regla, y se ve en la lista', async ({ page }) => {
  await page.goto('/ux?scene=copyChosen');
  const block = page.locator('[data-copy-chosen]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Copiar una criatura elegida');
  // CR 707.2: index 0 is copied, the second pick only scales the copy.
  await expect(block).toContainText('CR 707.2');
  await expect(block).toContainText('El orden es la regla');
  await expect(block.locator('[data-copy-chosen-scale]')).toContainText('contadores de +1/+1 como fuerza');
  await expect(block).toContainText('CR 208.1');

  const confirm = block.locator('button.primary');
  await expect(confirm).toBeDisabled();
  await expect(confirm).toHaveText('Elige la criatura que se copia');
  await expect(block.locator('.pick')).toHaveCount(0);

  // The first pick is the one copied.
  await block.locator('[data-copy-chosen-pick="101"]').click();
  await expect(block.locator('.pick')).toHaveCount(1);
  await expect(block.locator('.pick').first()).toContainText('1º');
  await expect(block.locator('.pick').first()).toContainText('Savannah Lions');
  await expect(block.locator('.pick').first()).toContainText('se copia');
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText('Copiar 1 criatura');

  // The second only scales, and reaching `max` closes the list.
  await block.locator('[data-copy-chosen-pick="100"]').click();
  await expect(block.locator('.pick')).toHaveCount(2);
  await expect(block.locator('.pick').nth(1)).toContainText('2º');
  await expect(block.locator('.pick').nth(1)).toContainText('escala la copia');
  await expect(confirm).toHaveText('Copiar la 1ª y escalar con la 2ª');
  await expect(block.locator('[data-copy-chosen-pick="105"]')).toBeDisabled();

  // Removing the first re-ranks the rest: the only honest way to fix an order.
  await block.locator('[data-copy-chosen-pick="101"]').click();
  await expect(block.locator('.pick')).toHaveCount(1);
  await expect(block.locator('.pick').first()).toContainText('Grizzly Bears');
  await expect(block.locator('.pick').first()).toContainText('se copia');
  await expect(confirm).toHaveText('Copiar 1 criatura');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('copiar del vecino: el pozo es su mesa y la elección espera a todos', async ({ page }) => {
  await page.goto('/ux?scene=copyChosenNeighbor');
  const block = page.locator('[data-copy-chosen]');
  await expect(block).toBeVisible();
  // CR 102.1: the pool comes from the seat-neighbour's battlefield.
  await expect(block).toContainText('vecino de la izquierda');
  await expect(block).toContainText('CR 102.1');
  // CR 101.4: nothing is applied until the whole APNAP set is collected.
  await expect(block.locator('[data-copy-chosen-earlier]')).toContainText('Jugador 2: Savannah Lions');
  await expect(block).toContainText('CR 101.4');
  await expect(block).toHaveAttribute('data-copy-chosen-scope', 'left');

  // Two same-name permanents on the same side: the id separates them.
  await expect(block.locator('[data-copy-chosen-pick="200"]')).toContainText('Grizzly Bears (Jugador 2) · #200');
  await block.locator('[data-copy-chosen-pick="200"]').click();
  await expect(block.locator('button.primary')).toHaveText('Copiar 1 criatura');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('conservar por fuerza: lo que se mide es la suma, no cuántas', async ({ page }) => {
  await page.goto('/ux?scene=keepPower');
  const block = page.locator('[data-keep-power]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Conservar criaturas · hasta 4 de fuerza');
  // CR 107.1c: the window is combined power.
  await expect(block).toContainText('CR 107.1c');
  const total = block.locator('[data-keep-power-total]');
  await expect(total).toHaveText('Fuerza elegida 0 de 4 · quedan 4');

  const confirm = block.locator('button.primary');
  // Zero is legal, and it sacrifices everything: the button says so.
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText('Confirmar sin conservar ninguna');

  await block.locator('[data-keep-power-object="100"]').click();
  await expect(total).toHaveText('Fuerza elegida 2 de 4 · quedan 2');
  await block.locator('[data-keep-power-object="101"]').click();
  await expect(total).toHaveText('Fuerza elegida 4 de 4 · quedan 0');
  // 2 + 2 + 1 would be 5: the creature that overflows is the one that closes.
  await expect(block.locator('[data-keep-power-object="105"]')).toBeDisabled();
  await expect(confirm).toHaveText('Conservar 2 criaturas (suma 4) y sacrificar el resto · después elige el Jugador 2');

  // Freeing one power point reopens the creature that only costs one.
  await block.locator('[data-keep-power-object="100"]').click();
  await expect(total).toHaveText('Fuerza elegida 2 de 4 · quedan 2');
  await expect(block.locator('[data-keep-power-object="105"]')).toBeEnabled();
  await block.locator('[data-keep-power-object="105"]').click();
  await expect(total).toHaveText('Fuerza elegida 3 de 4 · quedan 1');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('conservar por fuerza para todos: el tope se aplica a la mesa del rival', async ({ page }) => {
  await page.goto('/ux?scene=keepPowerForAll');
  const block = page.locator('[data-keep-power]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Conservar criaturas · hasta 3 de fuerza');
  // CR 101.4: one player keeps for everyone in scope.
  await expect(block).toContainText('Eliges tú por todos los jugadores');
  await expect(block).toContainText('Jugador 2');
  await expect(block).toHaveAttribute('data-keep-power-cap', '3');

  await block.locator('[data-keep-power-object="200"]').click();
  await expect(block.locator('[data-keep-power-total]')).toHaveText('Fuerza elegida 2 de 3 · quedan 1');
  // The second one costs 2 and only 1 is left, so it cannot be kept.
  await expect(block.locator('[data-keep-power-object="201"]')).toBeDisabled();
  // No other player is left to choose.
  await expect(block.locator('button.primary')).toHaveText('Conservar 1 criatura (suma 2) y sacrificar el resto');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('conservar exactos: el número es del motor y bloquea el candidato de más', async ({ page }) => {
  await page.goto('/ux?scene=keepExact');
  const block = page.locator('[data-keep-exact]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Conservar exactamente 3');
  await expect(block).toHaveAttribute('data-keep-exact-required', '3');
  // CR 609.3: the number arrives capped; the block states the pool but derives nothing.
  await expect(block.locator('[data-keep-exact-pool]')).toHaveText(
    'Hay 5 candidatos y el número ya viene recortado a lo que se puede hacer (CR 609.3).'
  );
  await expect(block.locator('[data-keep-exact-count]')).toHaveText('Elegidos 0 de 3');
  // With no keeper mark owed there is no counter line, and no line is invented.
  await expect(block.locator('[data-keep-exact-counter]')).toHaveCount(0);

  const confirm = block.locator('button.primary');
  // Unlike the total-power window, zero is not an answer here: the count is exact.
  await expect(confirm).toBeDisabled();
  const ready = block.locator('[data-keep-exact-ready]');
  await expect(ready).toHaveAttribute('data-keep-exact-ready', 'false');
  await expect(confirm).toHaveText('Elige 3 más');

  await block.locator('[data-keep-exact-object="100"]').click();
  await expect(block.locator('[data-keep-exact-count]')).toHaveText('Elegidos 1 de 3');
  await block.locator('[data-keep-exact-object="101"]').click();
  await expect(confirm).toHaveText('Elige uno más');
  await block.locator('[data-keep-exact-object="105"]').click();
  await expect(block.locator('[data-keep-exact-count]')).toHaveText('Elegidos 3 de 3');
  await expect(ready).toHaveAttribute('data-keep-exact-ready', 'true');
  await expect(confirm).toHaveText('Conservar 3 y sacrificar el resto · después elige el Jugador 2');
  // The fourth and fifth candidates can no longer be added: exactly three.
  await expect(block.locator('[data-keep-exact-object="102"]')).toBeDisabled();
  await expect(block.locator('[data-keep-exact-object="340"]')).toBeDisabled();

  // Releasing one reopens every candidate, because the ceiling is a count.
  await block.locator('[data-keep-exact-object="101"]').click();
  await expect(ready).toHaveAttribute('data-keep-exact-ready', 'false');
  await expect(confirm).toHaveText('Elige uno más');
  await expect(block.locator('[data-keep-exact-object="340"]')).toBeEnabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('conservar exactos con voto: el contador se anuncia antes del sacrificio', async ({ page }) => {
  await page.goto('/ux?scene=keepExactVow');
  const block = page.locator('[data-keep-exact]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Conservar exactamente 1');
  await expect(block).toHaveAttribute('data-keep-exact-required', '1');
  // CR 122.1: the keeper mark is placed before the rest is sacrificed, so it is
  // announced with the choice. The counter keeps the engine's own word, `vow`.
  await expect(block.locator('[data-keep-exact-counter]')).toHaveText(
    'Cada permanente conservado recibe un contador de vow antes de que se sacrifique el resto (CR 122.1).'
  );
  await expect(block).toContainText('CR 701.21a');

  const confirm = block.locator('button.primary');
  await expect(confirm).toHaveText('Elige uno más');
  await block.locator('[data-keep-exact-object="105"]').click();
  await expect(block.locator('[data-keep-exact-count]')).toHaveText('Elegidos 1 de 1');
  await expect(confirm).toHaveText('Conservar 1 y sacrificar el resto · después elige el Jugador 2');
  // Exactly one: the other two creatures stay out and cannot be added.
  await expect(block.locator('[data-keep-exact-object="100"]')).toBeDisabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('quitar contadores: sin tope, el único límite es lo que hay de cada tipo', async ({ page }) => {
  await page.goto('/ux?scene=removeCounters');
  const block = page.locator('[data-remove-counters]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Quitar contadores · Counter Bearer');
  await expect(block).toHaveAttribute('data-remove-cap', 'none');
  // CR 107.1c: "any number" — no cap is published, and the block does not invent one.
  await expect(block.locator('[data-remove-cap-line]')).toHaveText(
    'Sin tope: el texto no limita cuántos, sólo los que hay (CR 107.1c).'
  );
  await expect(block).toContainText('En el origen hay 3 de +1/+1 · 2 de carga.');
  await expect(block.locator('[data-remove-total]')).toHaveText('Quitas 0');

  const confirm = block.locator('button.primary');
  // Zero counters is a legal choice, and the button says it instead of looking broken.
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText('No quitar ninguno');
  await expect(block.getByRole('button', { name: 'Quitar uno menos de +1/+1' })).toBeDisabled();

  const more = (type: string) => block.getByRole('button', { name: `Quitar uno más de ${type}` });
  await more('+1/+1').click();
  await expect(block.locator('[data-remove-count="P1P1"]')).toHaveText('1 de 3');
  await expect(block.locator('[data-remove-total]')).toHaveText('Quitas 1');
  await expect(confirm).toHaveText('Quitar 1 contador: 1 +1/+1');
  await more('+1/+1').click();
  await more('+1/+1').click();
  // The per-kind ceiling is what the source actually carries.
  await expect(more('+1/+1')).toBeDisabled();
  await more('carga').click();
  await expect(block.locator('[data-remove-total]')).toHaveText('Quitas 4');
  await expect(confirm).toHaveText('Quitar 4 contadores: 3 +1/+1 · 1 carga');

  await block.getByRole('button', { name: 'Quitar uno menos de +1/+1' }).click();
  await expect(block.locator('[data-remove-total]')).toHaveText('Quitas 3');
  await expect(more('+1/+1')).toBeEnabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('quitar contadores con tope: el presupuesto es uno y lo comparten todos los tipos', async ({ page }) => {
  await page.goto('/ux?scene=removeCountersCapped');
  const block = page.locator('[data-remove-counters]');
  await expect(block).toBeVisible();
  // CR 608.2d + CR 107.3a: Hex Parasite's announced X bounds the total, not each kind.
  await expect(block).toHaveAttribute('data-remove-cap', '2');
  await expect(block.locator('[data-remove-cap-line]')).toHaveText('Tope 2 en total · quedan 2');
  await expect(block.locator('[data-remove-total]')).toHaveText('Quitas 0 de 2');

  const more = (type: string) => block.getByRole('button', { name: `Quitar uno más de ${type}` });
  await more('+1/+1').click();
  await expect(block.locator('[data-remove-cap-line]')).toHaveText('Tope 2 en total · quedan 1');
  await more('+1/+1').click();
  // The budget is spent, so no kind can add — even the one that still has counters.
  await expect(block.locator('[data-remove-cap-line]')).toHaveText('Tope 2 en total · quedan 0');
  await expect(more('carga')).toBeDisabled();
  await expect(more('+1/+1')).toBeDisabled();
  await expect(block.locator('button.primary')).toHaveText('Quitar 2 contadores: 2 +1/+1');

  // Freeing one budget point reopens every kind that still carries counters.
  await block.getByRole('button', { name: 'Quitar uno menos de +1/+1' }).click();
  await expect(more('carga')).toBeEnabled();
  await more('carga').click();
  await expect(block.locator('button.primary')).toHaveText('Quitar 2 contadores: 1 +1/+1 · 1 carga');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('objetivos de la copia: la ranura actual admite objetivo nuevo o dejarlo como está', async ({ page }) => {
  await page.goto('/ux?scene=copyRetarget');
  const block = page.locator('[data-copy-retarget]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Copia · Cambiar objetivos · Shock');
  await expect(block).toHaveAttribute('data-copy-mode', 'retarget');
  await expect(block).toHaveAttribute('data-copy-slot', '0');
  await expect(block).toHaveAttribute('data-copy-slots', '1');
  // CR 707.10c: the walk is one position, and what it holds may stay.
  await expect(block.locator('[data-copy-progress]')).toHaveText('Objetivo 1 de 1');
  await expect(block.locator('[data-copy-current]')).toHaveText(
    'Ahora apunta a Grizzly Bears (Jugador 2), y puede quedarse así (CR 707.10c).'
  );
  // No decided prefix yet, so no progress list is invented.
  await expect(block.locator('[data-copy-picks]')).toHaveCount(0);
  // The alternatives are the engine's list, plus the option to keep the current one.
  await expect(block.locator('[data-copy-candidate]')).toHaveCount(3);
  await expect(block.locator('[data-copy-candidate="2"]')).toHaveText('Jugador 2');
  await expect(block.locator('[data-copy-keep]')).toHaveText('Dejarlo en Grizzly Bears (Jugador 2)');
  // CR 707.10c: keeping the whole rest is offered, and only because the engine says so.
  await expect(block).toHaveAttribute('data-copy-keep-rest', 'true');
  await expect(block.locator('[data-copy-keep-rest]')).toHaveText('Dejar el resto como está');
  // An announcement-only permission has no business here.
  await expect(block.locator('[data-copy-decline]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la copia anuncia: nada que conservar, la ranura opcional se declina y lo elegido se ve', async ({ page }) => {
  await page.goto('/ux?scene=copyAnnounce');
  const block = page.locator('[data-copy-retarget]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Copia · Anunciar objetivos · Frost Breath');
  await expect(block).toHaveAttribute('data-copy-mode', 'announce');
  await expect(block).toHaveAttribute('data-copy-slot', '1');
  await expect(block).toHaveAttribute('data-copy-slots', '2');
  // CR 707.12: a freshly cast copy announces its own targets.
  await expect(block).toContainText('no hereda los del hechizo original');
  await expect(block.locator('[data-copy-progress]')).toHaveText('Objetivo 2 de 2');
  // The decided prefix is visible, with the label the block gives that target.
  await expect(block.locator('[data-copy-picks] li')).toHaveText('Objetivo 1: Grizzly Bears (Jugador 2) · #200');
  // CR 115.6: "up to two" makes this slot declinable, and the block says it in words.
  await expect(block.locator('[data-copy-current]')).toHaveText(
    'Esta ranura es opcional: puedes no elegir objetivo (CR 115.6).'
  );
  await expect(block.locator('[data-copy-decline]')).toHaveText('No elegir objetivo para esta ranura');
  // Nothing to keep in an announcement, and no "keep the rest" either.
  await expect(block.locator('[data-copy-keep]')).toHaveCount(0);
  await expect(block).toHaveAttribute('data-copy-keep-rest', 'false');
  await expect(block.locator('[data-copy-keep-rest]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('votación: el voto con nombre se emite en una sesión, no en una pregunta suelta', async ({ page }) => {
  await page.goto('/ux?scene=vote');
  const block = page.locator('[data-vote]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Votación · Emissary Green');
  await expect(block).toHaveAttribute('data-vote-kind', 'named');
  await expect(block).toHaveAttribute('data-vote-visibility', 'open');
  await expect(block).toHaveAttribute('data-vote-remaining', '1');
  // CR 101.4 + CR 701.38d: whose ballot it is, and who votes after.
  await expect(block.locator('[data-vote-turn]')).toHaveText('Te toca votar, Jugador 1. Después vota el Jugador 2.');
  await expect(block.locator('[data-vote-tallies]')).toHaveText('Todavía no ha votado nadie.');
  // The options are the engine's labels; the answer is the canonical word.
  await expect(block.locator('[data-vote-choice="profit"]')).toContainText('Profit');
  await expect(block.locator('[data-vote-choice="security"]')).toContainText('Security');
  await expect(block.locator('[data-vote-tally="0"]')).toHaveText('0');
  // Nothing to list yet, so no ballot ledger is drawn.
  await expect(block.locator('[data-vote-ballots]')).toHaveCount(0);
  await expect(block.locator('[data-vote-secret]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('votación sobre permanentes: el recuento va por índice y se ve quién votó qué', async ({ page }) => {
  await page.goto('/ux?scene=voteObject');
  const block = page.locator('[data-vote]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText("Votación · Council's Judgment");
  // CR 701.38b: an object-pool ballot is answered by index, because names repeat.
  await expect(block).toHaveAttribute('data-vote-kind', 'object');
  await expect(block.locator('[data-vote-turn]')).toHaveText('Te toca votar, Jugador 1.');
  await expect(block.locator('[data-vote-tallies]')).toHaveText('1 voto emitido.');
  await expect(block.locator('[data-vote-index="0"]')).toContainText('Grizzly Bears');
  await expect(block.locator('[data-vote-tally="0"]')).toHaveText('1');
  await expect(block.locator('[data-vote-tally="1"]')).toHaveText('0');
  // The ledger names the seat that already voted, and for what.
  await expect(block.locator('[data-vote-ballots] li')).toHaveText('Jugador 2: Grizzly Bears');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('quién explora: el orden lo elige el jugador, un permanente por paso', async ({ page }) => {
  await page.goto('/ux?scene=explore');
  const block = page.locator('[data-explore]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Explorar');
  // CR 701.44d: the three Merfolk are one queue and one choice.
  await expect(block).toHaveAttribute('data-explore-queue', '3');
  await expect(block.locator('[data-explore-remaining]')).toHaveText(
    'Quedan 3 permanentes por explorar, y el orden lo eliges tú (CR 701.44d).'
  );
  await expect(block.locator('[data-explore-object]')).toHaveCount(3);
  await expect(block.locator('[data-explore-object="392"]')).toHaveText('Rootwater Matriarch');
  // CR 701.44a is stated, not asked: the engine owns the reveal that follows.
  await expect(block).toContainText('CR 701.44a');
  await expect(block).toContainText('un contador +1/+1');
  // Every candidate is this player's, so there is no foreign queue to show.
  await expect(block.locator('[data-explore-others]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('explorar entre dos jugadores: la cola es más larga que lo que puedes elegir', async ({ page }) => {
  await page.goto('/ux?scene=exploreShared');
  const block = page.locator('[data-explore]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-explore-queue', '4');
  // CR 101.4: each player orders their own, so two of the four are not this player's.
  await expect(block.locator('[data-explore-remaining]')).toHaveText(
    'Quedan 4 permanentes por explorar; 2 de ellos los elige su controlador (CR 101.4).'
  );
  await expect(block.locator('[data-explore-object]')).toHaveCount(2);
  // Same name on both sides: the controller is what tells the rows apart.
  await expect(block.locator('[data-explore-object="390"]')).toHaveText('Merfolk Looter (Jugador 1)');
  await expect(block.locator('[data-explore-others]')).toHaveText(
    'En cola para otros jugadores: Merfolk Looter (Jugador 2) · Rootwater Commando (Jugador 2)'
  );

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('separar en dos montones: sólo se elige el A, y el B es lo que queda', async ({ page }) => {
  await page.goto('/ux?scene=pilePartition');
  const block = page.locator('[data-separate-piles]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-pile-stage', 'partition');
  // CR 700.3: the pool is named by the engine's own pile_source.
  await expect(block).toContainText('Son permanentes del campo de batalla (CR 700.3).');
  await expect(block.locator('[data-pile-chooser]')).toHaveText(
    'Después elige un montón el Jugador 2 (CR 700.3).'
  );
  // CR 700.3d: an empty pile A is a real answer and the button says what it does.
  await expect(block.locator('[data-pile-piles]')).toHaveText(
    'Montón A: nada · Montón B: Grizzly Bears · Savannah Lions · Elvish Mystic'
  );
  await expect(block.locator('button.primary')).toHaveText('Dejar todo en el montón B');

  await block.locator('[data-pile-object="101"]').click();
  await expect(block.locator('[data-pile-object="101"]')).toHaveAttribute('data-pile-picked', 'true');
  // CR 700.3a: pile B is derived, never chosen.
  await expect(block.locator('[data-pile-piles]')).toHaveText(
    'Montón A: Savannah Lions · Montón B: Grizzly Bears · Elvish Mystic'
  );
  await expect(block.locator('button.primary')).toHaveText('Separar en dos montones (1 y 2)');

  await block.locator('[data-pile-object="100"]').click();
  await block.locator('[data-pile-object="105"]').click();
  await expect(block.locator('button.primary')).toHaveText('Dejar todo en el montón A');

  // Untoggling puts it back in B.
  await block.locator('[data-pile-object="100"]').click();
  await expect(block.locator('[data-pile-piles]')).toHaveText(
    'Montón A: Savannah Lions · Elvish Mystic · Montón B: Grizzly Bears'
  );

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('elegir un montón: el que se queda con el efecto, con lo que hay en cada uno', async ({ page }) => {
  await page.goto('/ux?scene=pileChoice');
  const block = page.locator('[data-separate-piles]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-pile-stage', 'choice');
  // CR 700.3: the chooser is told whose partition it is.
  await expect(block.locator('[data-pile-subject]')).toHaveText('Separó el Jugador 2.');
  await expect(block.locator('[data-pile-side="A"]')).toContainText('Montón A · 1');
  await expect(block.locator('[data-pile-side="B"]')).toContainText('Montón B · 1');
  // Two candidates with the same name: the id is what separates the piles.
  await expect(block.locator('[data-pile-side="A"]')).toContainText('Grizzly Bears (Jugador 2) · #200');
  await expect(block.locator('[data-pile-side="B"]')).toContainText('Grizzly Bears (Jugador 2) · #201');
  // One subject only, so there is no queue to announce.
  await expect(block.locator('[data-pile-more]')).toHaveCount(0);
  // The partition stage's controls have no business here.
  await expect(block.locator('[data-pile-object]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('milagro: la primera carta del turno se revela, y revelarla no la lanza', async ({ page }) => {
  await page.goto('/ux?scene=miracle');
  const block = page.locator('[data-miracle]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-miracle-object', '395');
  await expect(block.locator('strong')).toHaveText('Milagro · Terminus');
  // CR 702.94a: it is the FIRST card drawn this turn, and that is why it is offered.
  await expect(block).toContainText('Terminus es la primera carta que robas este turno');
  await expect(block.locator('[data-miracle-cost]')).toHaveText('Coste de milagro: {W}');
  // The printed cost is a different number; the offer does not replace it silently.
  await expect(block.locator('[data-miracle-printed]')).toHaveText('Coste impreso: {4}{W}{W}');
  // CR 608.2g: accepting reveals; the cast is a later prompt.
  await expect(block.locator('[data-miracle-reveal-hint]')).toContainText('todavía no la lanza');
  await expect(block.locator('[data-miracle-reveal-hint]')).toContainText('CR 608.2g');
  await expect(block.locator('button.primary')).toHaveText('Revelar y lanzarla por {W}');
  await expect(block.locator('button.ghost')).toHaveText('Dejarla en la mano');
  // Declining spends the offer: miracle only looks at the first card of the turn.
  await expect(block.locator('[data-miracle-decline-hint]')).toContainText('la oferta se gasta');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('lanzar: la oferta de milagro es el lanzamiento, no la revelación', async ({ page }) => {
  await page.goto('/ux?scene=castOffer');
  const block = page.locator('[data-cast-offer]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-cast-shape', 'miracle');
  await expect(block.locator('[data-cast-subject]')).toHaveText('Terminus');
  // CR 702.94a: the latched cost is the one the offer carries.
  await expect(block.locator('[data-cast-rule]')).toContainText('CR 702.94a');
  await expect(block.locator('[data-cast-cost]')).toHaveText('Coste de milagro: {W}');
  await expect(block.locator('button.primary')).toHaveText('Lanzarla por {W}');
  // Declining here is not the reveal's decline: the trigger is already spent.
  await expect(block.locator('button.ghost')).toHaveText('Dejarla en la mano');
  await expect(block.locator('[data-cast-decline-hint]')).toContainText('el disparo de milagro se gasta');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('lanzar: en cascada, el declinar manda la carta y las falladas al fondo', async ({ page }) => {
  await page.goto('/ux?scene=castOfferCascade');
  const block = page.locator('[data-cast-offer]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-cast-shape', 'cascade');
  await expect(block.locator('[data-cast-subject]')).toHaveText('Lightning Bolt');
  // CR 702.85a: the gate is the source's mana value, published by the engine.
  await expect(block.locator('[data-cast-gate]')).toHaveText('El hechizo que la provoca tiene valor de maná 4.');
  await expect(block.locator('button.primary')).toHaveText('Lanzarla sin pagar');
  await expect(block.locator('button.ghost')).toHaveText('Al fondo de la biblioteca');
  await expect(block.locator('[data-cast-decline-hint]')).toContainText(
    'Al declinar, Lightning Bolt y las 2 cartas exiliadas van al fondo en orden aleatorio: 3 en total'
  );

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('lanzar: la ventana gratuita lista candidatas, su presupuesto y cómo cerrarla', async ({ page }) => {
  await page.goto('/ux?scene=castOfferWindow');
  const block = page.locator('[data-cast-offer]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-cast-shape', 'freeWindow');
  await expect(block.locator('[data-cast-subject]')).toHaveText('Ventana de lanzamiento gratuito');
  // CR 608.2c: the window publishes both bounds, and they are read apart.
  await expect(block.locator('[data-cast-budget]')).toHaveText('Quedan 2 lanzamientos · 4 de valor de maná disponibles.');
  await expect(block.locator('[data-cast-candidate="396"]')).toHaveText('Lanzar Shock sin pagar');
  await expect(block.locator('[data-cast-candidate="397"]')).toHaveText('Lanzar Giant Growth sin pagar');
  // Closing the window is the decline, and it says what it does.
  await expect(block.locator('button.ghost')).toHaveText('Terminar la ventana');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('fusionar: se elige la copia concreta, no el nombre de la carta', async ({ page }) => {
  await page.goto('/ux?scene=meld');
  const block = page.locator('[data-meld]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-meld-choices', '2');
  await expect(block.locator('strong')).toHaveText('Fusión · Brisela, Voice of Nightmares');
  // CR 701.42: the fixed half and how many partners the engine offers.
  await expect(block.locator('[data-meld-pair]')).toHaveText(
    'Mitad fija: Bruna, the Fading Light · 2 parejas posibles.'
  );
  // Two copies, one name: the id is what tells them apart.
  await expect(block.locator('[data-meld-choice="406"]')).toHaveText(
    'Fusionar con Gisela, the Broken Blade (Jugador 1) · #406'
  );
  await expect(block.locator('[data-meld-choice="407"]')).toHaveText(
    'Fusionar con Gisela, the Broken Blade (Jugador 1) · #407'
  );
  // CR 701.42b: choosing does not guarantee the meld.
  await expect(block.locator('[data-meld-canonical]')).toContainText('después comprueba');
  await expect(block.locator('[data-meld-canonical]')).toContainText('CR 701.42b');
  // The result enters normally here, so there is no attack destination to announce.
  await expect(block.locator('[data-meld-attacking]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la fusión entra atacando: se elige el destino entre los que publica Phase', async ({ page }) => {
  await page.goto('/ux?scene=meldAttack');
  const block = page.locator('[data-meld-attack]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-meld-attack-targets', '2');
  // CR 508.4: the card that enters is the melded identity, not the half.
  await expect(block.locator('strong')).toHaveText('Entra atacando · Brisela, Voice of Nightmares');
  await expect(block.locator('[data-meld-attack-count]')).toHaveText('Hay 2 destinos posibles.');
  await expect(block.locator('[data-meld-attack-target="Player:1"]')).toHaveText('Atacar a Jugador 2');
  await expect(block.locator('[data-meld-attack-target="Planeswalker:205"]')).toHaveText(
    'Atacar a Chandra, Torch of Defiance'
  );
  // CR 508.4a: a destination that goes stale leaves it tapped but not attacking.
  await expect(block.locator('[data-meld-attack-stale]')).toContainText('CR 508.4a');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('«resolver todo» pide el consentimiento del asiento y no promete lo que no ve', async ({ page }) => {
  await page.goto('/ux?scene=resolveAll');
  const block = page.locator('[data-resolve-all]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-resolve-all-representative', '0');
  await expect(block).toHaveAttribute('data-resolve-all-epoch', '3');
  await expect(block.locator('strong')).toHaveText('¿Autorizas resolver todo?');
  // CR 117.3d + CR 117.4: who is bound by a «resolve all» proposal.
  await expect(block.locator('[data-resolve-all-rule]')).toContainText('CR 117.3d');
  await expect(block.locator('[data-resolve-all-rule]')).toContainText('CR 117.4');
  // The run is server-private: the block says so instead of inventing participants.
  await expect(block.locator('[data-resolve-all-private]')).toContainText('no puede decir');
  await expect(block).toHaveAttribute('data-resolve-all-offers', 'both');
  await expect(block.locator('[data-resolve-all-grant]')).toHaveText('Sí, resolver todo');
  await expect(block.locator('[data-resolve-all-decline]')).toHaveText('No, seguir paso a paso');
  await expect(block.locator('[data-resolve-all-epoch-note]')).toContainText('Época 3');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('una propuesta que ya no admite respuestas no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=resolveAllStale');
  const block = page.locator('[data-resolve-all]');
  await expect(block).toBeVisible();
  // The prompt outlives the run: the engine offers no envelope, so there is
  // nothing to click — and the block explains why instead of disabling a guess.
  await expect(block).toHaveAttribute('data-resolve-all-offers', 'none');
  await expect(block.locator('button')).toHaveCount(0);
  await expect(block.locator('[data-resolve-all-waiting]')).toContainText('época 3');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un paso de enderezar guardado por una versión anterior dice que se reanuda desde el principio', async ({ page }) => {
  await page.goto('/ux?scene=untapResume');
  const block = page.locator('[data-untap-choice]');
  await expect(block).toBeVisible();
  // CR 502.1: `progress` is serialized unconditionally, so its value is a fact
  // about the writer — and «before» changes what the answer resumes.
  await expect(block).toHaveAttribute('data-untap-choice-progress', 'before-turn-based-actions');
  await expect(block).toHaveAttribute('data-untap-choice-declined', '0');
  await expect(block.locator('[data-untap-choice-resume]')).toContainText('desde');
  await expect(block.locator('[data-untap-choice-resume]')).toContainText('su primera acción');
  await expect(block.locator('[data-untap-choice-so-far]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('«no enderezar» se pregunta permanente a permanente y recuerda lo ya dejado girado', async ({ page }) => {
  await page.goto('/ux?scene=untapChoice');
  const block = page.locator('[data-untap-choice]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-untap-choice-object', '417');
  await expect(block).toHaveAttribute('data-untap-choice-pending', '1');
  await expect(block).toHaveAttribute('data-untap-choice-declined', '2');
  await expect(block).toHaveAttribute('data-untap-choice-progress', 'after-turn-based-actions');
  await expect(block.locator('strong')).toHaveText('Enderezar · Vedalken Shackles');
  // CR 502.3: the untap step is the active player's, one permanent at a time.
  await expect(block.locator('[data-untap-choice-rule]')).toContainText('CR 502.3');
  await expect(block.locator('[data-untap-choice-count]')).toHaveText('Es el último permanente por decidir en este paso.');
  await expect(block.locator('[data-untap-choice-so-far]')).toContainText('Smoke, Chandra, Torch of Defiance');
  // Both answers are the engine's, and neither is a guess.
  await expect(block.locator('[data-untap-choice-yes]')).toHaveText('Enderezar Vedalken Shackles');
  await expect(block.locator('[data-untap-choice-no]')).toHaveText('Dejarlo girado');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un tope de enderezar exige elegir cuáles y no deja pasar del tope', async ({ page }) => {
  await page.goto('/ux?scene=untapSubset');
  const block = page.locator('[data-untap-subset]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-untap-subset-group', '3');
  await expect(block).toHaveAttribute('data-untap-subset-max', '1');
  await expect(block.locator('strong')).toHaveText('Enderezar hasta 1 de 3');
  await expect(block.locator('[data-untap-subset-rule]')).toContainText('CR 502.3');
  // An empty answer is legal, so the confirm button starts usable.
  const confirmButton = block.locator('[data-untap-subset-confirm]');
  await expect(confirmButton).toHaveText('No enderezar ninguno');
  await expect(confirmButton).toBeEnabled();

  const options = block.locator('button[aria-pressed]');
  await expect(options).toHaveCount(3);
  await options.first().click();
  // At the cap the other options close, and the confirm names the pick.
  await expect(block).toHaveAttribute('data-untap-subset-chosen', '1');
  await expect(options.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(options.nth(1)).toBeDisabled();
  await expect(options.nth(2)).toBeDisabled();
  await expect(confirmButton).toHaveText('Enderezar Forest');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('exertar se decide criatura a criatura y la respuesta no nombra la habilidad', async ({ page }) => {
  await page.goto('/ux?scene=exert');
  const block = page.locator('[data-exert]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-exert-attacker', '100');
  await expect(block).toHaveAttribute('data-exert-pending', '1');
  await expect(block).toHaveAttribute('data-exert-permission', 'published');
  await expect(block.locator('strong')).toHaveText('Exertar · Grizzly Bears');
  // CR 508.1g + CR 701.43b: paying the optional cost means a skipped untap.
  await expect(block.locator('[data-exert-rule]')).toContainText('CR 508.1g');
  await expect(block.locator('[data-exert-rule]')).toContainText('CR 701.43b');
  await expect(block.locator('[data-exert-count]')).toContainText('Savannah Lions');
  // The occurrence stays the engine's: the block says so instead of printing ids.
  await expect(block.locator('[data-exert-permission-note]')).toContainText('encarnación y ocurrencia');
  await expect(block.locator('[data-exert-accept]')).toHaveText('Exertar Grizzly Bears');
  await expect(block.locator('[data-exert-decline]')).toHaveText('No exertar');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('alistar ofrece el conjunto del motor con su fuerza y deja rechazar', async ({ page }) => {
  await page.goto('/ux?scene=enlist');
  const block = page.locator('[data-enlist]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-enlist-attacker', '100');
  await expect(block).toHaveAttribute('data-enlist-eligible', '2');
  await expect(block).toHaveAttribute('data-enlist-pending', '1');
  await expect(block).toHaveAttribute('data-enlist-power', '2');
  await expect(block.locator('strong')).toHaveText('Alistar · Grizzly Bears');
  await expect(block.locator('[data-enlist-rule]')).toContainText('CR 702.154a');
  // The engine already applied power, tapped and attacking; the block shows the
  // power it published and does not compute the bonus.
  await expect(block.locator('[data-enlist-count]')).toContainText('1 instancia');
  await expect(block.locator('[data-enlist-option]')).toHaveCount(2);
  await expect(block.locator('[data-enlist-option]').first()).toContainText('fuerza 2');
  await expect(block.locator('[data-enlist-option]').nth(1)).toContainText('fuerza 1');
  // Declining is a move, not a dead end.
  await expect(block.locator('[data-enlist-decline]')).toBeEnabled();
  await expect(block.locator('[data-enlist-decline]')).toHaveText('No alistar');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un coste de sacrificar pide exactamente lo que publica y no deja confirmar antes', async ({ page }) => {
  await page.goto('/ux?scene=payCost');
  const block = page.locator('[data-pay-cost]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-pay-cost-kind', 'sacrifice');
  await expect(block).toHaveAttribute('data-pay-cost-resume', 'spell');
  await expect(block).toHaveAttribute('data-pay-cost-count', '2');
  await expect(block).toHaveAttribute('data-pay-cost-min', '2');
  await expect(block.locator('strong')).toHaveText('Sacrificar como coste');
  // CR 701.21a: sacrificing is the cost, not an effect.
  await expect(block.locator('[data-pay-cost-rule]')).toContainText('CR 701.21a');
  await expect(block.locator('[data-pay-cost-contract]')).toHaveText('Elige exactamente 2 objetos de los 3 publicados.');

  const confirmButton = block.locator('[data-pay-cost-confirm]');
  await expect(confirmButton).toBeDisabled();
  const options = block.locator('[data-pay-cost-object]');
  await expect(options).toHaveCount(3);
  await options.nth(0).click();
  await expect(confirmButton).toBeDisabled();
  await expect(confirmButton).toHaveText('Confirmar 1 objeto');
  await options.nth(2).click();
  await expect(block).toHaveAttribute('data-pay-cost-chosen', '2');
  await expect(confirmButton).toBeEnabled();
  // At the ceiling the third option closes instead of overflowing the answer.
  await expect(options.nth(1)).toBeDisabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('CR 400.2: el coste del rival llega sin candidatos y con marcadores', async ({ page }) => {
  await page.goto('/ux?scene=payCostHidden');
  const block = page.locator('[data-pay-cost]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-pay-cost-kind', 'exile-from-zone');
  await expect(block).toHaveAttribute('data-pay-cost-choices', '0');
  await expect(block).toHaveAttribute('data-pay-cost-hidden', '2');
  // The seat is not this viewer's, so nothing here is clickable.
  await expect(block.locator('[data-pay-cost-other]')).toContainText('Jugador 2');
  await expect(block.locator('[data-pay-cost-placeholders]')).toContainText('marcador vacío');
  await expect(block.locator('[data-pay-cost-redacted]')).toContainText('CR 400.2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un coste por fuerza total apaga el botón hasta que la suma llega al umbral', async ({ page }) => {
  await page.goto('/ux?scene=payCostAggregate');
  const block = page.locator('[data-pay-cost]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-pay-cost-kind', 'tap-creatures');
  await expect(block).toHaveAttribute('data-pay-cost-min', '0');
  await expect(block.locator('[data-pay-cost-contract]')).toContainText('fuerza ≥ 4');
  const confirmButton = block.locator('[data-pay-cost-confirm]');
  // CR 208.1 needs a number: with nothing tapped the sum is 0 and the button is dead.
  await expect(block.locator('[data-pay-cost-power]')).toHaveText('Fuerza elegida 0 de 4 · todavía no llega al umbral.');
  await expect(confirmButton).toBeDisabled();
  const options = block.locator('[data-pay-cost-object]');
  await options.nth(2).click();
  await expect(block.locator('[data-pay-cost-power]')).toHaveText('Fuerza elegida 1 de 4 · todavía no llega al umbral.');
  await expect(confirmButton).toBeDisabled();
  await options.nth(0).click();
  await expect(block.locator('[data-pay-cost-power]')).toHaveText('Fuerza elegida 3 de 4 · todavía no llega al umbral.');
  await expect(confirmButton).toBeDisabled();
  await options.nth(1).click();
  await expect(block.locator('[data-pay-cost-power]')).toHaveText('Fuerza elegida 5 de 4.');
  await expect(confirmButton).toBeEnabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el maná frigio se responde símbolo a símbolo y sólo cierra con todos', async ({ page }) => {
  await page.goto('/ux?scene=phyrexian');
  const block = page.locator('[data-phyrexian]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-phyrexian-shards', '3');
  await expect(block).toHaveAttribute('data-phyrexian-answered', '0');
  await expect(block.locator('strong')).toHaveText('Maná frigio · Dismember');
  // CR 107.4f: one decision per symbol, taken at payment time.
  await expect(block.locator('[data-phyrexian-rule]')).toContainText('CR 107.4f');
  const confirmButton = block.locator('[data-phyrexian-confirm]');
  await expect(confirmButton).toBeDisabled();
  // The engine's per-shard verdict closes the impossible side of each row.
  await expect(block.locator('[data-phyrexian-life="1"]')).toBeDisabled();
  await expect(block.locator('[data-phyrexian-mana="2"]')).toBeDisabled();
  await expect(block.locator('[data-phyrexian-mana-only="1"]')).toHaveText('sólo maná');
  await expect(block.locator('[data-phyrexian-life-only="2"]')).toHaveText('sólo vidas');

  await block.locator('[data-phyrexian-mana="0"]').click();
  await block.locator('[data-phyrexian-life="2"]').click();
  await expect(block).toHaveAttribute('data-phyrexian-answered', '2');
  // A partial vector is not an answer.
  await expect(confirmButton).toBeDisabled();
  await block.locator('[data-phyrexian-mana="1"]').click();
  await expect(block).toHaveAttribute('data-phyrexian-answered', '3');
  await expect(confirmButton).toBeEnabled();
  await expect(block.locator('[data-phyrexian-total]')).toHaveText('Pagas 2 vidas y el resto con maná.');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el impuesto de ataque muestra el precio fijado, la banda y las dos respuestas', async ({ page }) => {
  await page.goto('/ux?scene=combatTax');
  const block = page.locator('[data-combat-tax]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-combat-tax-context', 'attacking');
  await expect(block).toHaveAttribute('data-combat-tax-creatures', '2');
  await expect(block).toHaveAttribute('data-combat-tax-pending', 'attack');
  await expect(block).toHaveAttribute('data-combat-tax-bands', '1');
  await expect(block.locator('strong')).toHaveText('Impuesto de ataque');
  // CR 508.1d + CR 508.1h: the quote is locked; declining discards the whole proposal.
  await expect(block.locator('[data-combat-tax-rule]')).toContainText('CR 508.1d');
  await expect(block.locator('[data-combat-tax-rule]')).toContainText('CR 508.1h');
  // Norn's Annex publishes `{W/P}` (`PhyrexianWhite`). A missing pip would be a second price.
  await expect(block.locator('[data-combat-tax-total] .pip.phyrexian')).toHaveText(['W/P', 'W/P']);
  await expect(block.locator('[data-combat-tax-total] .sr-only')).toContainText('blanco o 2 vidas');
  await expect(block.locator('.row')).toHaveCount(2);
  await expect(block.locator('.row').first()).toContainText('Grizzly Bears');
  await expect(block.locator('.row').nth(1)).toContainText('Savannah Lions');
  await expect(block.locator('[data-combat-tax-pending-list]')).toContainText('Grizzly Bears → Jugador 2');
  await expect(block.locator('[data-combat-tax-pending-list]')).toContainText('Savannah Lions → Chandra, Torch of Defiance');
  await expect(block.locator('[data-combat-tax-pending-list]')).toContainText('1 banda');
  await expect(block.locator('[data-combat-tax-pending-list]')).toContainText('CR 702.22c');
  await expect(block.locator('[data-combat-tax-consequence]')).toContainText('descarta la declaración entera');
  // The consequence and the button must not share a selector: strict mode would see two.
  await expect(block.locator('[data-combat-tax-decline]')).toHaveCount(1);
  await expect(block.locator('[data-combat-tax-accept]')).toHaveText('Pagar y completar la declaración');
  await expect(block.locator('[data-combat-tax-decline]')).toHaveText('Rechazar y volver a declarar');
  await expect(block.locator('[data-combat-tax-accept]')).toBeEnabled();
  await expect(block.locator('[data-combat-tax-decline]')).toBeEnabled();
  await expect(block.locator('[data-combat-tax-other]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el impuesto de bloqueo ajeno se ve y no se puede tocar', async ({ page }) => {
  await page.goto('/ux?scene=combatTaxBlock');
  const block = page.locator('[data-combat-tax]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-combat-tax-context', 'blocking');
  await expect(block).toHaveAttribute('data-combat-tax-creatures', '1');
  await expect(block).toHaveAttribute('data-combat-tax-pending', 'block');
  await expect(block).toHaveAttribute('data-combat-tax-bands', '0');
  await expect(block.locator('strong')).toHaveText('Impuesto de bloqueo');
  await expect(block.locator('[data-combat-tax-rule]')).toContainText('CR 509.1d');
  await expect(block.locator('[data-combat-tax-total] .pip.generic')).toHaveText('2');
  // Two creatures share a name; the controller is what separates them.
  await expect(block.locator('[data-combat-tax-pending-list]')).toContainText(
    'Grizzly Bears (Jugador 2) bloquea a Grizzly Bears (Jugador 1)'
  );
  await expect(block.locator('[data-combat-tax-other]')).toContainText('Jugador 2');
  await expect(block.locator('[data-combat-tax-other]')).toContainText('CR 400.2');
  await expect(block.locator('[data-combat-tax-accept]')).toHaveCount(0);
  await expect(block.locator('[data-combat-tax-decline]')).toHaveCount(0);
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('potenciar muestra el coste vivo, las dos respuestas y la cancelación', async ({ page }) => {
  await page.goto('/ux?scene=optionalCost');
  const block = page.locator('[data-optional-cost]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-optional-cost-shape', 'kicker');
  await expect(block).toHaveAttribute('data-optional-cost-origin', 'kicker');
  await expect(block).toHaveAttribute('data-optional-cost-repeatable', 'false');
  await expect(block).toHaveAttribute('data-optional-cost-kicked', '0');
  await expect(block).toHaveAttribute('data-optional-cost-options', '2');
  await expect(block.locator('strong')).toHaveText('Potenciar · Goblin Bushwhacker');
  await expect(block.locator('[data-optional-cost-rule]')).toContainText('CR 702.33a');
  await expect(block.locator('[data-optional-cost-live] .pip')).toHaveText('R');
  await expect(block.locator('[data-optional-cost-pay]')).toHaveAttribute('data-optional-cost-pay', '0');
  await expect(block.locator('[data-optional-cost-pay]')).toHaveText('Pagar {R}');
  await expect(block.locator('[data-optional-cost-decline]')).toHaveAttribute('data-optional-cost-decline', '1');
  await expect(block.locator('[data-optional-cost-decline]')).toHaveText('No pagar');
  await expect(block.locator('[data-optional-cost-option]')).toHaveCount(0);
  await expect(block.locator('[data-optional-cost-cancel]')).toHaveText('Cancelar el lanzamiento');
  await expect(block.locator('[data-optional-cost-cancel-note]')).toContainText('CR 601.2i');
  await expect(block.locator('[data-optional-cost-other]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el multikicker ya pagado dice cuántas veces y que puede volver a preguntar', async ({ page }) => {
  await page.goto('/ux?scene=optionalCostMulti');
  const block = page.locator('[data-optional-cost]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-optional-cost-repeatable', 'true');
  await expect(block).toHaveAttribute('data-optional-cost-kicked', '2');
  await expect(block.locator('strong')).toHaveText('Potenciar · Everflowing Chalice');
  await expect(block.locator('[data-optional-cost-times]')).toHaveText('Ya pagado 2 veces.');
  await expect(block.locator('[data-optional-cost-again]')).toContainText('CR 702.33c');
  await expect(block.locator('[data-optional-cost-live] .pip.generic')).toHaveText('2');
  await expect(block.locator('[data-optional-cost-pay]')).toHaveText('Pagar {2}');
  await expect(block.locator('[data-optional-cost-decline]')).toHaveCount(1);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('elegir un coste no ofrece rechazarlos todos, y cada botón es su índice', async ({ page }) => {
  await page.goto('/ux?scene=optionalCostChoice');
  const block = page.locator('[data-optional-cost]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-optional-cost-shape', 'choice');
  await expect(block).toHaveAttribute('data-optional-cost-alternative', 'false');
  await expect(block).toHaveAttribute('data-optional-cost-options', '3');
  await expect(block.locator('strong')).toHaveText('Elige un coste · Dusk Mangler');
  await expect(block.locator('[data-optional-cost-rule]')).toContainText('exactamente una');
  await expect(block.locator('[data-optional-cost-decline]')).toHaveCount(0);
  await expect(block.locator('[data-optional-cost-pay]')).toHaveCount(0);
  const options = block.locator('[data-optional-cost-option]');
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toHaveAttribute('data-optional-cost-option', '0');
  await expect(options.nth(0)).toHaveText('Sacrificar 1 criatura que controlas');
  await expect(options.nth(1)).toHaveAttribute('data-optional-cost-option', '1');
  await expect(options.nth(1)).toHaveText('Descartar 1 carta');
  await expect(options.nth(2)).toHaveAttribute('data-optional-cost-option', '2');
  await expect(options.nth(2)).toHaveText('4 vidas');
  await expect(block.locator('[data-optional-cost-cancel]')).toHaveCount(1);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el coste alternativo ofrece {0} y el coste impreso, sin botón de no pagar', async ({ page }) => {
  await page.goto('/ux?scene=optionalCostAlt');
  const block = page.locator('[data-optional-cost]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-optional-cost-alternative', 'true');
  await expect(block.locator('strong')).toHaveText('Coste alternativo · Test Zombie');
  await expect(block.locator('[data-optional-cost-rule]')).toContainText('CR 118.9');
  await expect(block.locator('[data-optional-cost-decline]')).toHaveCount(0);
  const options = block.locator('[data-optional-cost-option]');
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toHaveText('{0}');
  await expect(options.nth(1).locator('.pip.generic')).toHaveText('6');
  await expect(options.nth(1)).toHaveAttribute('data-optional-cost-option', '1');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el regalo se promete, no se paga como maná, y nombra la carta', async ({ page }) => {
  await page.goto('/ux?scene=optionalCostGift');
  const block = page.locator('[data-optional-cost]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-optional-cost-origin', 'gift');
  await expect(block).toHaveAttribute('data-optional-cost-gift', 'card');
  await expect(block.locator('strong')).toHaveText('Regalo · Coiling Rebirth');
  await expect(block.locator('[data-optional-cost-rule]')).toContainText('CR 702.174a');
  await expect(block.locator('[data-optional-cost-gift-kind]')).toContainText('roba una carta');
  await expect(block.locator('[data-optional-cost-live]')).toContainText('{0}');
  await expect(block.locator('[data-optional-cost-pay]')).toHaveText('Prometer el regalo');
  await expect(block.locator('[data-optional-cost-decline]')).toHaveText('No prometer');
  await expect(block.locator('[data-optional-cost-pay]')).toHaveAttribute('data-optional-cost-pay', '0');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el coste adicional ajeno se ve y no se puede tocar', async ({ page }) => {
  await page.goto('/ux?scene=optionalCostAway');
  const block = page.locator('[data-optional-cost]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-optional-cost-shape', 'kicker');
  await expect(block.locator('[data-optional-cost-other]')).toContainText('Jugador 2');
  await expect(block.locator('[data-optional-cost-other]')).toContainText('CR 400.2');
  await expect(block.locator('[data-optional-cost-pay]')).toHaveCount(0);
  await expect(block.locator('[data-optional-cost-decline]')).toHaveCount(0);
  await expect(block.locator('[data-optional-cost-cancel]')).toHaveCount(0);
  await expect(block.locator('button')).toHaveCount(0);
  await expect(block.locator('[data-optional-cost-live] .pip')).toHaveText('R');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el descuento de Defiler muestra las vidas, el maná y el límite de color', async ({ page }) => {
  await page.goto('/ux?scene=defiler');
  const block = page.locator('[data-defiler]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-defiler-life', '2');
  await expect(block).toHaveAttribute('data-defiler-reach', 'colored');
  await expect(block.locator('strong')).toHaveText('Descuento de Defiler · Grizzly Bears');
  await expect(block.locator('[data-defiler-rule]')).toContainText('CR 601.2b');
  await expect(block.locator('[data-defiler-price]')).toContainText('2 vidas');
  await expect(block.locator('[data-defiler-price] .pip')).toHaveText('G');
  await expect(block.locator('[data-defiler-reach-note]')).toContainText('no pasa al genérico');
  await expect(block.locator('[data-defiler-pay]')).toHaveAttribute('data-defiler-pay', '0');
  await expect(block.locator('[data-defiler-pay]')).toHaveText('Pagar 2 vidas y reducir el coste');
  await expect(block.locator('[data-defiler-decline]')).toHaveAttribute('data-defiler-decline', '1');
  await expect(block.locator('[data-defiler-decline]')).toHaveText('Seguir con el coste original');
  await expect(block.locator('[data-defiler-cancel]')).toHaveText('Cancelar el lanzamiento');
  await expect(block.locator('[data-defiler-other]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el descuento ajeno, con el alcance omitido, se ve y no se toca', async ({ page }) => {
  await page.goto('/ux?scene=defilerAway');
  const block = page.locator('[data-defiler]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-defiler-reach', 'spill');
  await expect(block).toHaveAttribute('data-defiler-life', '2');
  await expect(block.locator('[data-defiler-reach-note]')).toContainText('SpillsToGeneric');
  await expect(block.locator('[data-defiler-price] .pip.generic')).toHaveText('1');
  await expect(block.locator('[data-defiler-price] .pip.green')).toHaveText('G');
  await expect(block.locator('[data-defiler-other]')).toContainText('Jugador 2');
  await expect(block.locator('[data-defiler-other]')).toContainText('CR 400.2');
  await expect(block.locator('[data-defiler-pay]')).toHaveCount(0);
  await expect(block.locator('[data-defiler-decline]')).toHaveCount(0);
  await expect(block.locator('[data-defiler-cancel]')).toHaveCount(0);
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('elegir de una zona pide exactamente una y no deja confirmar antes', async ({ page }) => {
  await page.goto('/ux?scene=zoneChoice');
  const block = page.locator('[data-zone-choice]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-zone-choice-count', '1');
  await expect(block).toHaveAttribute('data-zone-choice-up-to', 'false');
  await expect(block).toHaveAttribute('data-zone-choice-constraint', 'none');
  await expect(block.locator('strong')).toHaveText('Elegir cartas · Test Spell');
  await expect(block.locator('[data-zone-choice-rule]')).toContainText('exactamente 1');
  await expect(block.locator('[data-zone-choice-confirm]')).toBeDisabled();
  await block.locator('[data-zone-choice-card="396"]').click();
  await expect(block.locator('[data-zone-choice-card="396"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(block.locator('[data-zone-choice-confirm]')).toBeEnabled();
  await expect(block.locator('[data-zone-choice-confirm]')).toHaveText('Confirmar (1/1)');
  await expect(block.locator('[data-zone-choice-other]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('los tipos distintos apagan el confirmar cuando la asignación no cabe', async ({ page }) => {
  await page.goto('/ux?scene=zoneChoiceTypes');
  const block = page.locator('[data-zone-choice]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-zone-choice-up-to', 'true');
  await expect(block).toHaveAttribute('data-zone-choice-constraint', 'distinct-types');
  await expect(block).toHaveAttribute('data-zone-choice-role', 'produce');
  await expect(block.locator('[data-zone-choice-reciprocal]')).toContainText('publica el conjunto');
  await expect(block.locator('[data-zone-choice-confirm]')).toHaveText('No elegir ninguna');
  await expect(block.locator('[data-zone-choice-confirm]')).toBeEnabled();
  await block.locator('[data-zone-choice-card="353"]').click();
  await block.locator('[data-zone-choice-card="396"]').click();
  await expect(block.locator('[data-zone-choice-confirm]')).toBeDisabled();
  await block.locator('[data-zone-choice-card="396"]').click();
  await block.locator('[data-zone-choice-card="341"]').click();
  await expect(block.locator('[data-zone-choice-confirm]')).toBeEnabled();
  await expect(block.locator('[data-zone-choice-confirm]')).toHaveText('Confirmar (2/2)');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la zona ajena se ve redactada y no se puede tocar', async ({ page }) => {
  await page.goto('/ux?scene=zoneChoiceAway');
  const block = page.locator('[data-zone-choice]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-zone-choice-hidden', '3');
  await expect(block).toHaveAttribute('data-zone-choice-cards', '3');
  await expect(block.locator('[data-zone-choice-hidden-slot]')).toHaveCount(3);
  await expect(block.locator('[data-zone-choice-other]')).toContainText('Jugador 2');
  await expect(block.locator('[data-zone-choice-other]')).toContainText('CR 400.2');
  await expect(block.locator('[data-zone-choice-card]')).toHaveCount(0);
  await expect(block.locator('[data-zone-choice-confirm]')).toHaveCount(0);
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('elegir una cara sólo ofrece las acciones que publicó el motor', async ({ page }) => {
  await page.goto('/ux?scene=modalFace');
  const block = page.locator('[data-modal-face]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Elige una cara');
  await expect(block.locator('[data-modal-face-rule]')).toHaveText('Elige qué cara jugar o lanzar.');
  await expect(block.locator('[data-modal-face-front]')).toHaveAttribute('data-modal-face-front', 'false');
  await expect(block.locator('[data-modal-face-front]')).toContainText('Lanzar Valki, God of Lies');
  await expect(block.locator('[data-modal-face-front]')).toContainText('Frontal');
  await expect(block.locator('[data-modal-face-back]')).toHaveAttribute('data-modal-face-back', 'true');
  await expect(block.locator('[data-modal-face-back]')).toContainText('Lanzar Tibalt, Cosmic Impostor');
  await expect(block.locator('[data-modal-face-back]')).toContainText('Trasera');
  await expect(block.locator('[data-modal-face-cancel]')).toHaveCount(0);
  await expect(block.locator('[data-modal-face-other]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('una resolución ofrece la cara publicada, el coste añadido y cancelar', async ({ page }) => {
  await page.goto('/ux?scene=modalFaceOne');
  const block = page.locator('[data-modal-face]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-modal-face-payment', 'Manual');
  await expect(block.locator('[data-modal-face-front]')).toHaveCount(0);
  await expect(block.locator('[data-modal-face-back]')).toContainText('Lanzar Tibalt, Cosmic Impostor');
  await expect(block.locator('[data-modal-face-cost]')).toContainText('añade este maná');
  await expect(block.locator('[data-modal-face-cost] .pip.generic')).toHaveText('2');
  await expect(block.locator('[data-modal-face-mode]')).toContainText('Manual');
  await expect(block.locator('[data-modal-face-cancel]')).toHaveText('Cancelar');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la cara ajena se nombra como jugar y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=modalFaceAway');
  const block = page.locator('[data-modal-face]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-modal-face-faces]')).toContainText('Jugar Barkchannel Pathway');
  await expect(block.locator('[data-modal-face-faces]')).toContainText('Jugar Tidechannel Pathway');
  await expect(block.locator('[data-modal-face-other]')).toContainText('Jugador 2');
  await expect(block.locator('[data-modal-face-front]')).toHaveCount(0);
  await expect(block.locator('[data-modal-face-back]')).toHaveCount(0);
  await expect(block.locator('[data-modal-face-cancel]')).toHaveCount(0);
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la sobrecarga ofrece las dos vías publicadas y no inventa cancelar', async ({ page }) => {
  await page.goto('/ux?scene=altCast');
  const block = page.locator('[data-alt-cast]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-alt-cast-keyword', 'Overload');
  await expect(block.locator('strong')).toHaveText('Elegir coste de lanzamiento · Cyclonic Rift');
  await expect(block.locator('[data-alt-cast-rule]')).toContainText('CR 702.96a');
  await expect(block.locator('[data-alt-cast-normal]')).toContainText('Lanzar normalmente');
  await expect(block.locator('[data-alt-cast-alternative]')).toContainText('Lanzar con Sobrecarga');
  await expect(block.locator('[data-alt-cast-cancel]')).toHaveCount(0);
  await expect(block.locator('[data-alt-cast-other]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('emerger nombra el sacrificio que publicó el motor, no un filtro', async ({ page }) => {
  await page.goto('/ux?scene=altCastEmerge');
  const block = page.locator('[data-alt-cast]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-alt-cast-keyword', 'Emerge');
  await expect(block.locator('[data-alt-cast-rule]')).toContainText('una criatura');
  await expect(block.locator('[data-alt-cast-rule]')).not.toContainText('permanente que cumpla');
  await expect(block.locator('[data-alt-cast-alternative]')).toContainText('Lanzar con Emerger');
  await expect(block.locator('[data-alt-cast-alternative]')).toContainText('una criatura');
  await expect(block.locator('[data-alt-cast-alternative]')).not.toContainText('Sacrificar');
  await expect(block.locator('[data-alt-cast-normal]')).toBeVisible();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('una vía que el motor no publicó no se reconstruye', async ({ page }) => {
  await page.goto('/ux?scene=altCastOne');
  const block = page.locator('[data-alt-cast]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-alt-cast-payment', 'Manual');
  await expect(block.locator('[data-alt-cast-mode]')).toContainText('Manual');
  await expect(block.locator('[data-alt-cast-normal]')).toBeVisible();
  await expect(block.locator('[data-alt-cast-alternative]')).toHaveCount(0);
  await expect(block.locator('[data-alt-cast-cancel]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el coste alternativo ajeno se ve y no se toca', async ({ page }) => {
  await page.goto('/ux?scene=altCastAway');
  const block = page.locator('[data-alt-cast]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-alt-cast-other]')).toContainText('Jugador 2');
  await expect(block.locator('[data-alt-cast-other]')).toContainText('CR 400.2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('una variante cuyo índice no está publicado no es un botón', async ({ page }) => {
  await page.goto('/ux?scene=castVariant');
  const block = page.locator('[data-cast-variant]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-cast-variant-count', '3');
  await expect(block.locator('strong')).toHaveText('Elegir lanzamiento · Wear');
  await expect(block.locator('[data-cast-variant-option="0"]')).toContainText('Lanzar normalmente Wear');
  await expect(block.locator('[data-cast-variant-option="1"]')).toHaveCount(0);
  await expect(block.locator('[data-cast-variant-option="2"]')).toContainText('Lanzar con Fusión Wear');
  await expect(block.locator('[data-cast-variant-cancel]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el permiso de cementerio nombra la fuente y el coste añadido', async ({ page }) => {
  await page.goto('/ux?scene=castVariantAuth');
  const block = page.locator('[data-cast-variant]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-cast-variant-option="0"]')).toContainText("Lanzar desde el cementerio Healer's Hawk");
  await expect(block.locator('[data-cast-variant-option="0"] [data-cast-variant-authority]')).toContainText('mediante Lurrus of the Dream-Den');
  await expect(block.locator('[data-cast-variant-option="0"] [data-cast-variant-authority]')).toContainText('además: 2 vidas');
  await expect(block.locator('[data-cast-variant-option="0"] [data-cast-variant-authority]')).toContainText('una vez este turno');
  await expect(block.locator('[data-cast-variant-option="1"]')).toContainText('Lanzar con Flashback');
  await expect(block.locator('[data-cast-variant-option="1"] [data-cast-variant-authority]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la variante ajena se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=castVariantAway');
  const block = page.locator('[data-cast-variant]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-cast-variant-faces]')).toContainText('Lanzar normalmente Wear');
  await expect(block.locator('[data-cast-variant-faces]')).toContainText('Tear');
  await expect(block.locator('[data-cast-variant-faces]')).toContainText('Lanzar con Fusión Wear');
  await expect(block.locator('[data-cast-variant-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un tipo que la carta tiene y el motor no publicó no es un botón', async ({ page }) => {
  await page.goto('/ux?scene=typeSlot');
  const block = page.locator('[data-type-slot]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-type-slot-count', '2');
  await expect(block).toHaveAttribute('data-type-slot-permission', 'yes');
  await expect(block.locator('strong')).toHaveText('Elegir ranura de tipo · Dryad Arbor');
  await expect(block.locator('[data-type-slot-source]')).toContainText('mediante Lurrus of the Dream-Den');
  await expect(block.locator('[data-type-slot-option="Land"]')).toContainText('Tierra');
  await expect(block.locator('[data-type-slot-option="Creature"]')).toContainText('Criatura');
  await expect(block.locator('[data-type-slot-land]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('jugar una tierra no trae un permiso de cementerio', async ({ page }) => {
  await page.goto('/ux?scene=typeSlotLand');
  const block = page.locator('[data-type-slot]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-type-slot-permission', 'no');
  await expect(block.locator('[data-type-slot-land]')).toContainText('CR 305.1');
  await expect(block.locator('[data-type-slot-option="Land"]')).toHaveCount(1);
  await expect(block.locator('[data-type-slot-option="Creature"]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la ranura ajena se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=typeSlotAway');
  const block = page.locator('[data-type-slot]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-type-slot-faces]')).toContainText('Tierra');
  await expect(block.locator('[data-type-slot-faces]')).toContainText('Criatura');
  await expect(block.locator('[data-type-slot-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('empalmar ofrece las cartas publicadas y el no empalmar publicado', async ({ page }) => {
  await page.goto('/ux?scene=splice');
  const block = page.locator('[data-splice]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-splice-count', '2');
  await expect(block.locator('strong')).toHaveText('Empalmar · Glacial Ray');
  await expect(block.locator('[data-splice-card="438"]')).toContainText('Empalmar Peer Through Depths');
  await expect(block.locator('[data-splice-card="439"]')).toContainText('Empalmar Reach Through Mists');
  await expect(block.locator('[data-splice-decline]')).toContainText('No empalmar');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('una carta oculta no se empalma y el declinar ausente no es un botón', async ({ page }) => {
  await page.goto('/ux?scene=spliceHidden');
  const block = page.locator('[data-splice]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-splice-hidden', '1');
  await expect(block.locator('[data-splice-hidden-note]')).toContainText('1 carta oculta');
  await expect(block.locator('[data-splice-card="438"]')).toHaveCount(1);
  await expect(block.locator('[data-splice-card="0"]')).toHaveCount(0);
  await expect(block.locator('[data-splice-decline]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el empalme ajeno se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=spliceAway');
  const block = page.locator('[data-splice]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-splice-faces]')).toContainText('Peer Through Depths');
  await expect(block.locator('[data-splice-faces]')).toContainText('Reach Through Mists');
  await expect(block.locator('[data-splice-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('los dos lados publicados de una mutación son botones, y nombran quién pone el nombre', async ({ page }) => {
  await page.goto('/ux?scene=mutate');
  const block = page.locator('[data-mutate]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-mutate-count', '2');
  await expect(block.locator('strong')).toHaveText('Mutar · Gemrazer sobre Llanowar Elves');
  await expect(block.locator('[data-mutate-side="Top"]')).toContainText('Poner encima');
  await expect(block.locator('[data-mutate-side="Bottom"]')).toContainText('Poner debajo');
  await expect(block.locator('[data-mutate-note="Top"]')).toContainText('el nombre lo pone Gemrazer');
  await expect(block.locator('[data-mutate-note="Bottom"]')).toContainText('el nombre lo conserva Llanowar Elves');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un lado que el motor no publicó no es un botón', async ({ page }) => {
  await page.goto('/ux?scene=mutateOne');
  const block = page.locator('[data-mutate]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-mutate-count', '1');
  await expect(block.locator('[data-mutate-side="Top"]')).toHaveCount(1);
  await expect(block.locator('[data-mutate-side="Bottom"]')).toHaveCount(0);
  await expect(block.locator('[data-mutate-note="Bottom"]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la mutación ajena se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=mutateAway');
  const block = page.locator('[data-mutate]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-mutate-faces]')).toContainText('Poner encima');
  await expect(block.locator('[data-mutate-faces]')).toContainText('Poner debajo');
  await expect(block.locator('[data-mutate-faces]')).toContainText('Gemrazer');
  await expect(block.locator('[data-mutate-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('cifrar ofrece los anfitriones publicados y el no cifrar publicado', async ({ page }) => {
  await page.goto('/ux?scene=cipher');
  const block = page.locator('[data-cipher]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-cipher-count', '2');
  await expect(block.locator('strong')).toHaveText('Cifrar · Hidden Strings');
  await expect(block.locator('[data-cipher-host="443"]')).toContainText('Cifrar en Invisible Stalker');
  await expect(block.locator('[data-cipher-host="444"]')).toContainText('Cifrar en Tormented Soul');
  await expect(block.locator('[data-cipher-decline]')).toContainText('No cifrar');
  await expect(block.locator('[data-cipher-decline-note]')).toContainText('cementerio de su propietario');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('una criatura oculta no se cifra y el declinar ausente no es un botón', async ({ page }) => {
  await page.goto('/ux?scene=cipherHidden');
  const block = page.locator('[data-cipher]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-cipher-hidden', '1');
  await expect(block.locator('[data-cipher-hidden-note]')).toContainText('1 criatura oculta');
  await expect(block.locator('[data-cipher-host="443"]')).toHaveCount(1);
  await expect(block.locator('[data-cipher-host="0"]')).toHaveCount(0);
  await expect(block.locator('[data-cipher-decline]')).toHaveCount(0);
  await expect(block.locator('[data-cipher-decline-note]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el cifrado ajeno se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=cipherAway');
  const block = page.locator('[data-cipher]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-cipher-faces]')).toContainText('Invisible Stalker');
  await expect(block.locator('[data-cipher-faces]')).toContainText('Tormented Soul');
  await expect(block.locator('[data-cipher-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un total de reducción es botón sólo si el motor publicó esa elección', async ({ page }) => {
  await page.goto('/ux?scene=costOrder');
  const block = page.locator('[data-cost-order]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-cost-order-count', '2');
  await expect(block.locator('strong')).toHaveText("Elegir coste fijado · Altar's Reap");
  await expect(block.locator('[data-cost-order-reductions]')).toContainText('Thunderscape Familiar');
  await expect(block.locator('[data-cost-order-reductions]')).toContainText('sólo maná de color');
  await expect(block.locator('[data-cost-order-outcome="0"]')).toContainText('Fijar {R}');
  await expect(block.locator('[data-cost-order-note="0"]')).toContainText('Primero Morophon, the Boundless, luego Thunderscape Familiar');
  await expect(block.locator('[data-cost-order-hybrid="0"]')).toContainText('Anuncia {W}');
  await expect(block.locator('[data-cost-order-outcome="1"]')).toContainText('Fijar {1}{R}{U}');
  await expect(block.locator('[data-cost-order-hybrid="1"]')).toContainText('No anuncia el híbrido');
  await expect(block.locator('[data-cost-order-cancel]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un total que el motor no publicó no es un botón', async ({ page }) => {
  await page.goto('/ux?scene=costOrderOne');
  const block = page.locator('[data-cost-order]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-cost-order-count', '2');
  await expect(block.locator('[data-cost-order-outcome="0"]')).toHaveCount(1);
  await expect(block.locator('[data-cost-order-outcome="1"]')).toHaveCount(0);
  await expect(block.locator('[data-cost-order-note="1"]')).toHaveCount(0);
  await expect(block.locator('[data-cost-order-cancel]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la orden ajena se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=costOrderAway');
  const block = page.locator('[data-cost-order]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-cost-order-faces]')).toContainText('{R}');
  await expect(block.locator('[data-cost-order-faces]')).toContainText('{1}{R}{U}');
  await expect(block.locator('[data-cost-order-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el pago al resolver conserva el índice del motor y el no pagar publicado', async ({ page }) => {
  await page.goto('/ux?scene=resPay');
  const block = page.locator('[data-res-pay]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-res-pay-count', '2');
  await expect(block.locator('strong')).toHaveText('Elegir un pago opcional · Fire Covenant');
  await expect(block.locator('[data-res-pay-option="0"]')).toContainText('Pagar 2 vidas');
  await expect(block.locator('[data-res-pay-option="2"]')).toContainText('Pagar Sacrificar 1 criatura que controlas');
  await expect(block.locator('[data-res-pay-option="1"]')).toHaveCount(0);
  await expect(block.locator('[data-res-pay-decline]')).toContainText('No pagar');
  await expect(block.locator('[data-res-pay-decline-note]')).toContainText('sin esa rama');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un índice no publicado no es botón y el declinar ausente tampoco', async ({ page }) => {
  await page.goto('/ux?scene=resPayOne');
  const block = page.locator('[data-res-pay]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-res-pay-option="0"]')).toHaveCount(1);
  await expect(block.locator('[data-res-pay-option="2"]')).toHaveCount(0);
  await expect(block.locator('[data-res-pay-decline]')).toHaveCount(0);
  await expect(block.locator('[data-res-pay-decline-note]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el pago ajeno se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=resPayAway');
  const block = page.locator('[data-res-pay]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-res-pay-faces]')).toContainText('Pagar 2 vidas');
  await expect(block.locator('[data-res-pay-faces]')).toContainText('Pagar Sacrificar 1 criatura que controlas');
  await expect(block.locator('[data-res-pay-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el destinatario es un oponente publicado, y el orden no se reordena', async ({ page }) => {
  await page.goto('/ux?scene=gift');
  const block = page.locator('[data-gift-recipient]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-gift-recipient-purpose', 'gift');
  await expect(block).toHaveAttribute('data-gift-recipient-count', '2');
  await expect(block.locator('strong')).toHaveText('Elegir destinatario del regalo');
  await expect(block.locator('[data-gift-recipient-spell]')).toHaveText('Generous Gift');
  await expect(block.locator('[data-gift-recipient-gift]')).toContainText('roba una carta');
  const options = block.locator('[data-gift-recipient-option]');
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toHaveAttribute('data-gift-recipient-option', '2');
  await expect(options.nth(0)).toContainText('Jugador 3');
  await expect(options.nth(1)).toHaveAttribute('data-gift-recipient-option', '1');
  await expect(block.locator('[data-gift-recipient-cancel]')).toContainText('Cancelar lanzamiento');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un oponente no publicado no es botón y el cancelar ausente tampoco', async ({ page }) => {
  await page.goto('/ux?scene=giftOne');
  const block = page.locator('[data-gift-recipient]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-gift-recipient-option]')).toHaveCount(1);
  await expect(block.locator('[data-gift-recipient-option="1"]')).toContainText('Jugador 2');
  await expect(block.locator('[data-gift-recipient-option="2"]')).toHaveCount(0);
  await expect(block.locator('[data-gift-recipient-cancel]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el coste de efecto nombra las vidas y no inventa un regalo', async ({ page }) => {
  await page.goto('/ux?scene=giftCost');
  const block = page.locator('[data-gift-recipient]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-gift-recipient-purpose', 'effect-cost');
  await expect(block.locator('strong')).toHaveText('Elegir a quién afecta el coste');
  await expect(block.locator('[data-gift-recipient-spell]')).toHaveText('Generous Gift');
  await expect(block.locator('[data-gift-recipient-cost]')).toContainText('gana 3 vidas');
  await expect(block.locator('[data-gift-recipient-gift]')).toHaveCount(0);
  await expect(block.locator('[data-gift-recipient-option]')).toHaveCount(2);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el regalo ajeno se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=giftAway');
  const block = page.locator('[data-gift-recipient]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-gift-recipient-faces]')).toContainText('Jugador 3');
  await expect(block.locator('[data-gift-recipient-faces]')).toContainText('Jugador 2');
  await expect(block.locator('[data-gift-recipient-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('arriba o abajo son los booleanos que publicó el motor', async ({ page }) => {
  await page.goto('/ux?scene=topBottom');
  const block = page.locator('[data-top-bottom]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-top-bottom-side', 'top');
  await expect(block.locator('strong')).toHaveText('Elegir posición en la biblioteca');
  await expect(block.locator('[data-top-bottom-card]')).toHaveText('Banishing Light');
  await expect(block.locator('[data-top-bottom-top]')).toContainText('Arriba de la biblioteca');
  await expect(block.locator('[data-top-bottom-bottom]')).toContainText('Abajo de la biblioteca');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la segunda desde arriba no se relabela como la cima', async ({ page }) => {
  await page.goto('/ux?scene=topBottomNth');
  const block = page.locator('[data-top-bottom]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-top-bottom-side', 'nth');
  await expect(block.locator('[data-top-bottom-top]')).toContainText('La segunda desde arriba');
  await expect(block.locator('[data-top-bottom-top]')).not.toContainText('Arriba de la biblioteca');
  await expect(block.locator('[data-top-bottom-bottom]')).toHaveCount(1);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el fondo no publicado no es botón', async ({ page }) => {
  await page.goto('/ux?scene=topBottomOne');
  const block = page.locator('[data-top-bottom]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-top-bottom-top]')).toHaveCount(1);
  await expect(block.locator('[data-top-bottom-bottom]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la posición ajena se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=topBottomAway');
  const block = page.locator('[data-top-bottom]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-top-bottom-faces]')).toContainText('Arriba de la biblioteca');
  await expect(block.locator('[data-top-bottom-faces]')).toContainText('Abajo de la biblioteca');
  await expect(block.locator('[data-top-bottom-other-seat]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el oponente del choque es un jugador publicado, y el orden no se reordena', async ({ page }) => {
  await page.goto('/ux?scene=clash');
  const block = page.locator('[data-clash]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-clash-count', '2');
  await expect(block.locator('strong')).toHaveText('Elegir oponente del choque');
  const options = block.locator('[data-clash-option]');
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toHaveAttribute('data-clash-option', '2');
  await expect(options.nth(0)).toContainText('Jugador 3');
  await expect(options.nth(1)).toHaveAttribute('data-clash-option', '1');
  // CR 701.30b: the engine publishes no cancel for this window, so none is drawn.
  await expect(block.locator('button')).toHaveCount(2);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un oponente del choque no publicado no es botón', async ({ page }) => {
  await page.goto('/ux?scene=clashOne');
  const block = page.locator('[data-clash]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-clash-option]')).toHaveCount(1);
  await expect(block.locator('[data-clash-option="2"]')).toContainText('Jugador 3');
  await expect(block.locator('[data-clash-option="1"]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el choque ajeno se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=clashAway');
  const block = page.locator('[data-clash]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-clash-faces]')).toContainText('Jugador 3');
  await expect(block.locator('[data-clash-faces]')).toContainText('Jugador 2');
  await expect(block.locator('[data-clash-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la carta del choque se coloca con los mismos booleanos de la biblioteca', async ({ page }) => {
  await page.goto('/ux?scene=clashPlace');
  const block = page.locator('[data-clash-placement]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-clash-placement-remaining', '1');
  await expect(block.locator('strong')).toHaveText('Colocar la carta del choque');
  await expect(block.locator('[data-clash-placement-card]')).toHaveText('Grizzly Bears');
  await expect(block.locator('[data-clash-placement-top]')).toContainText('Arriba de la biblioteca');
  await expect(block.locator('[data-clash-placement-bottom]')).toContainText('Abajo de la biblioteca');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('una carta oculta del choque no se nombra y el booleano ausente no es botón', async ({ page }) => {
  await page.goto('/ux?scene=clashPlaceHidden');
  const block = page.locator('[data-clash-placement]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-clash-placement-card]')).toHaveCount(0);
  // CR 701.30c: only the bottom was published; the top is not reconstructed.
  await expect(block.locator('[data-clash-placement-bottom]')).toHaveCount(1);
  await expect(block.locator('[data-clash-placement-top]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la colocación ajena del choque se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=clashPlaceAway');
  const block = page.locator('[data-clash-placement]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-clash-placement-card]')).toHaveText('Grizzly Bears');
  await expect(block.locator('[data-clash-placement-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el ajuste entre partidas imprime el suelo y el tope que publicó el motor', async ({ page }) => {
  await page.goto('/ux?scene=sideboard');
  const block = page.locator('[data-sideboard]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-sideboard-min', '60');
  await expect(block).toHaveAttribute('data-sideboard-max', '15');
  await expect(block.locator('strong')).toHaveText('Ajustar el mazo entre partidas');
  await expect(block.locator('[data-sideboard-score]')).toContainText('Partida 2');
  await expect(block.locator('[data-sideboard-score]')).toContainText('Jugador 1 1');
  await expect(block.locator('[data-sideboard-bounds]')).toContainText('al menos 60 cartas');
  await expect(block.locator('[data-sideboard-bounds]')).toContainText('hasta 15 cartas');
  // CR 100.2b: the counts are the published submission's own lists.
  await expect(block.locator('[data-sideboard-main]')).toContainText('28 cartas');
  await expect(block.locator('[data-sideboard-side]')).toContainText('3 cartas');
  await expect(block.locator('[data-sideboard-submit]')).toContainText('Entregar este mazo');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un formato sin banquillo lo dice y no pide un cambio uno a uno', async ({ page }) => {
  await page.goto('/ux?scene=sideboardNoSide');
  const block = page.locator('[data-sideboard]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-sideboard-max', '0');
  await expect(block.locator('[data-sideboard-bounds]')).toContainText('no tiene banquillo');
  // CR 100.4a: the published submission is still the one action.
  await expect(block.locator('[data-sideboard-submit]')).toHaveCount(1);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el ajuste ajeno se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=sideboardAway');
  const block = page.locator('[data-sideboard]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-sideboard-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('jugar o robar son los booleanos que publicó el motor', async ({ page }) => {
  await page.goto('/ux?scene=playDraw');
  const block = page.locator('[data-play-draw]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Elige si juegas o robas');
  await expect(block.locator('[data-play-draw-score]')).toContainText('Marcador');
  await expect(block.locator('[data-play-draw-play]')).toContainText('Jugar primero');
  await expect(block.locator('[data-play-draw-draw]')).toContainText('Robar primero');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('robar no reconstruye el jugar que el cable no publicó', async ({ page }) => {
  await page.goto('/ux?scene=playDrawDraw');
  const block = page.locator('[data-play-draw]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-play-draw-draw]')).toHaveCount(1);
  await expect(block.locator('[data-play-draw-play]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la elección ajena de jugar o robar se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=playDrawAway');
  const block = page.locator('[data-play-draw]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toContainText('Jugador 2');
  await expect(block.locator('[data-play-draw-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el fondo del estruendo empieza en el orden del motor y se puede mover', async ({ page }) => {
  await page.goto('/ux?scene=bottomRipple');
  const block = page.locator('[data-bottom-order]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-bottom-order-kind', 'ripple');
  await expect(block).toHaveAttribute('data-bottom-order-count', '2');
  await expect(block.locator('strong')).toHaveText('Ordenar el fondo del estruendo');
  await expect(block.locator('[data-bottom-order-rule]')).toContainText('estruendo era de 4');
  const rows = block.locator('[data-bottom-order-row]');
  await expect(rows).toHaveCount(2);
  // CR 702.60a: the pile starts as the engine's order, not sorted by name.
  await expect(rows.nth(0)).toHaveAttribute('data-bottom-order-row', '531');
  await expect(rows.nth(0)).toContainText('Reach Through Mists');
  await expect(rows.nth(1)).toHaveAttribute('data-bottom-order-row', '532');
  // The first row cannot move earlier and the last cannot move later.
  await expect(block.locator('[data-bottom-order-earlier="531"]')).toBeDisabled();
  await expect(block.locator('[data-bottom-order-later="532"]')).toBeDisabled();
  await expect(block.locator('[data-bottom-order-submit]')).toContainText('este orden');

  // Moving keeps both published cards and changes only their order.
  await block.locator('[data-bottom-order-later="531"]').click();
  await expect(rows.nth(0)).toHaveAttribute('data-bottom-order-row', '532');
  await expect(block.locator('[data-bottom-order-earlier="532"]')).toBeDisabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('las otras dos ventanas de fondo conservan su propio motivo', async ({ page }) => {
  await page.goto('/ux?scene=bottomReveal');
  let block = page.locator('[data-bottom-order]');
  await expect(block).toHaveAttribute('data-bottom-order-kind', 'reveal-until');
  await expect(block.locator('strong')).toHaveText('Ordenar el fondo de lo revelado');
  // Only Ripple carries a count; the other two never print one.
  await expect(block.locator('[data-bottom-order-rule]')).not.toContainText('estruendo era de');

  await page.goto('/ux?scene=bottomDig');
  block = page.locator('[data-bottom-order]');
  await expect(block).toHaveAttribute('data-bottom-order-kind', 'dig');
  await expect(block.locator('strong')).toHaveText('Ordenar el fondo de lo mirado');
  await expect(block.locator('[data-bottom-order-rule]')).toContainText('CR 701.20e');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('una pila vacía no inventa cartas ni deja enviar', async ({ page }) => {
  await page.goto('/ux?scene=bottomEmpty');
  const block = page.locator('[data-bottom-order]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-bottom-order-count', '0');
  await expect(block.locator('[data-bottom-order-row]')).toHaveCount(0);
  await expect(block.locator('[data-bottom-order-submit]')).toBeDisabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el orden ajeno se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=bottomAway');
  const block = page.locator('[data-bottom-order]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-bottom-order-faces]')).toContainText('Reach Through Mists');
  await expect(block.locator('[data-bottom-order-faces]')).toContainText('Peer Through Depths');
  await expect(block.locator('[data-bottom-order-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('una copia elige entre los permanentes que publica Phase, con su techo de maná', async ({ page }) => {
  await page.goto('/ux?scene=copyTarget');
  const block = page.locator('[data-copy-target]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-copy-target-purpose', 'copy');
  await expect(block).toHaveAttribute('data-copy-target-count', '3');
  // CR 707.2: the clone is named as the object that is entering, not as a result.
  await expect(block.locator('strong')).toHaveText('¿Qué permanente copia Mockingbird?');
  await expect(block).toContainText('CR 707.2');
  // CR 707.9: copying does not target, so the list is the engine's, unfiltered.
  await expect(block).toContainText('CR 707.9');
  await expect(block).toHaveAttribute('data-copy-target-ceiling', '4');
  await expect(block.locator('[data-copy-target-ceiling-note]')).toContainText('techo de valor de maná 4');
  for (const [id, name] of [
    ['100', 'Grizzly Bears'],
    ['101', 'Savannah Lions'],
    ['105', 'Elvish Mystic']
  ]) {
    await expect(block.locator(`[data-copy-target-option="${id}"]`)).toContainText(name);
  }
  // The candidate reads like a card: the board's own Spanish type line and cost.
  await expect(block.locator('[data-copy-target-option="100"]')).toContainText('Criatura');
  await expect(block.locator('[data-copy-target-option="100"]')).toContainText('{1}{G}');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('las fichas copian a un permanente y no se anuncia un techo que la carta no imprime', async ({ page }) => {
  await page.goto('/ux?scene=copyTargetToken');
  const block = page.locator('[data-copy-target]');
  await expect(block).toBeVisible();
  // CR 707.1: the chosen permanent is the copy source — nothing is transformed.
  await expect(block).toHaveAttribute('data-copy-target-purpose', 'tokenSource');
  await expect(block.locator('strong')).toHaveText('¿De qué permanente son copia las fichas?');
  await expect(block).toContainText('CR 707.1');
  // No printed ceiling means no ceiling line at all.
  await expect(block).toHaveAttribute('data-copy-target-ceiling', '');
  await expect(block.locator('[data-copy-target-ceiling-note]')).toHaveCount(0);
  await expect(block.locator('[data-copy-target-option="101"]')).toBeVisible();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('los reemplazos que escriben el mismo dato se eligen uno por paso', async ({ page }) => {
  await page.goto('/ux?scene=replacement');
  const block = page.locator('[data-replacement]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-replacement-kind', 'order');
  await expect(block).toHaveAttribute('data-replacement-count', '2');
  await expect(block.locator('strong')).toHaveText('¿Qué reemplazo se aplica ahora?');
  // CR 616.1e: the engine applies the chosen one and asks again — one pick per step.
  await expect(block.locator('[data-replacement-rule]')).toContainText('CR 616.1e');
  await expect(block.locator('[data-replacement-rule]')).toContainText('CR 616.1f');
  await expect(block.locator('[data-replacement-again]')).toContainText('volver a preguntar');
  // CR 616.1f: this collision is last-write-wins, and the engine is the one saying it.
  await expect(block).toHaveAttribute('data-replacement-decides', 'last');
  await expect(block.locator('[data-replacement-compose]')).toContainText('el último reemplazo que se aplique decide');
  await expect(block.locator('[data-replacement-option="0"]')).toContainText('Kalitas, Traitor of Ghet');
  await expect(block.locator('[data-replacement-option="1"]')).toContainText('Rest in Peace');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);

  // The same window with composing effects must not name a winner.
  await page.goto('/ux?scene=replacementCompose');
  const compose = page.locator('[data-replacement]');
  await expect(compose).toHaveAttribute('data-replacement-decides', 'compose');
  await expect(compose.locator('[data-replacement-compose]')).toContainText('se componen');
  await expect(compose.locator('[data-replacement-compose]')).not.toContainText('el último reemplazo');
});

test('un reemplazo opcional es una rama, no un orden que se arrastre', async ({ page }) => {
  await page.goto('/ux?scene=replacementOptional');
  const block = page.locator('[data-replacement]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-replacement-kind', 'optional');
  await expect(block.locator('strong')).toHaveText('Un reemplazo opcional');
  // Both branches name the same source: the choice is accept or decline.
  await expect(block.locator('[data-replacement-option="0"]')).toContainText('Life from the Loam');
  await expect(block.locator('[data-replacement-option="1"]')).toContainText('Robar la carta con normalidad');
  // CR 616.1e wording and the re-prompt note belong to the ordering shape only.
  await expect(block.locator('[data-replacement-rule]')).not.toContainText('aplicables al mismo suceso');
  await expect(block.locator('[data-replacement-again]')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el permanente que entra atacando nombra sus tres tipos de destino', async ({ page }) => {
  await page.goto('/ux?scene=entryAttack');
  const block = page.locator('[data-entry-attack]');
  await expect(block).toBeVisible();
  // CR 508.4: the permanent is the real one —no frozen meld context— and the name
  // comes from the battlefield, not from a published result.
  await expect(block).toHaveAttribute('data-entry-attack-targets', '3');
  await expect(block.locator('strong')).toHaveText('Entra atacando · Ninja of the Deep Hours');
  await expect(block.locator('[data-entry-attack-count]')).toHaveText('Hay 3 destinos posibles.');
  await expect(block.locator('[data-entry-attack-target="Player:1"]')).toHaveText('Atacar a Jugador 2');
  await expect(block.locator('[data-entry-attack-target="Planeswalker:205"]')).toHaveText(
    'Atacar a Chandra, Torch of Defiance'
  );
  // CR 310.5: a battle is a legal destination too.
  await expect(block.locator('[data-entry-attack-target="Battle:409"]')).toHaveText(
    'Atacar a Invasion of Kamigawa'
  );
  await expect(block).toContainText('CR 310.5');
  // CR 508.4a: a destination that goes stale leaves it tapped and attacking, with no defender.
  await expect(block.locator('[data-entry-attack-stale]')).toContainText('CR 508.4a');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('revelar cualquier número admite un conjunto y también ninguna carta', async ({ page }) => {
  await page.goto('/ux?scene=revealAny');
  const block = page.locator('[data-reveal-prompt]');
  await expect(block).toBeVisible();
  // CR 107.1c: the engine's `AnyNumber` is not the single pick, and it says so.
  await expect(block).toContainText('cualquier número');
  const confirm = block.locator('button.primary');
  // Zero is a legal subset, so the answer is ready before anything is marked.
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText('Revelar ninguna');
  const cards = block.locator('button.card');
  await cards.nth(0).click();
  await cards.nth(2).click();
  await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.nth(2)).toHaveAttribute('aria-pressed', 'true');
  // Marking does not replace: the subset grows.
  await expect(confirm).toHaveText('Revelar 2 cartas');
  await cards.nth(0).click();
  await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await expect(confirm).toHaveText('Revelar 1 carta');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el mantenimiento acumulativo cobra la instrucción una vez por contador', async ({ page }) => {
  await page.goto('/ux?scene=unlessRepeat');
  const block = page.locator('[data-unless-prompt]');
  await expect(block).toBeVisible();
  // CR 702.24a: the printed cost times the age-counter count, not a new amount.
  await expect(block.locator('strong')).toHaveText('Paga {1} × 3');
  await expect(block).toContainText('CR 702.24a');
  await expect(block.getByRole('button', { name: 'Pagar {1} × 3' })).toBeVisible();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el reparto no puede sobrar, faltar ni dejar un objetivo anunciado con nada', async ({ page }) => {
  await page.goto('/ux?scene=distribute');
  const block = page.locator('[data-distribute]');
  await expect(block).toBeVisible();
  await expect(block.locator('strong')).toHaveText('Reparto de 5 puntos de daño');
  // CR 608.2d: candidates may be left out, but everything is divided.
  await expect(block).toContainText('puedes dejar fuera a los demás');
  await expect(block).toContainText('CR 608.2d');
  const confirm = block.locator('button.primary');
  await expect(confirm).toBeDisabled();
  await expect(confirm).toHaveText('Reparto incompleto');
  await expect(block.locator('[data-distribute-total]')).toContainText('Repartido 0 de 5 · falta 5');

  // Three to one target, two to another: the sum is what unlocks the answer.
  for (let i = 0; i < 3; i += 1) await block.getByRole('button', { name: 'Añadir uno a Grizzly Bears (Jugador 1)' }).click();
  await expect(block.locator('[data-distribute-total]')).toContainText('Repartido 3 de 5 · falta 2');
  await expect(confirm).toBeDisabled();
  for (let i = 0; i < 2; i += 1) await block.getByRole('button', { name: 'Añadir uno a Savannah Lions' }).click();
  await expect(block.locator('[data-distribute-total]')).toContainText('Repartido 5 de 5');
  await expect(confirm).toBeEnabled();
  // Two permanents share the name, so the row names its controller.
  await expect(confirm).toHaveText('Repartir: Grizzly Bears (Jugador 1) 3 · Savannah Lions 2');
  // Nobody can hand out more than is left.
  await expect(block.getByRole('button', { name: 'Añadir uno a Grizzly Bears (Jugador 1)' })).toBeDisabled();
  // Taking one back is possible and takes the answer back with it.
  await block.getByRole('button', { name: 'Quitar uno a Grizzly Bears (Jugador 1)' }).click();
  await expect(confirm).toBeDisabled();
  await expect(block.locator('[data-distribute-total]')).toContainText('falta 1');

  // Announce-time division: every target must receive at least one (CR 601.2d).
  await page.goto('/ux?scene=distributeAnnounced');
  const announced = page.locator('[data-distribute]');
  await expect(announced.locator('strong')).toHaveText('Reparto de 4 puntos de daño');
  await expect(announced).toContainText('cada uno recibe al menos 1');
  await expect(announced).toContainText('CR 601.2d');
  const all = announced.locator('button.primary');
  for (let i = 0; i < 4; i += 1) await announced.getByRole('button', { name: 'Añadir uno a Grizzly Bears' }).click();
  await expect(announced.locator('[data-distribute-total]')).toContainText('1 objetivo sin nada');
  await expect(all).toBeDisabled();
  await all.scrollIntoViewIfNeeded();
  await expect(all).toHaveText('Reparto inválido');
  await announced.getByRole('button', { name: 'Quitar uno a Grizzly Bears' }).click();
  await announced.getByRole('button', { name: 'Añadir uno a Savannah Lions' }).click();
  await expect(announced.locator('[data-distribute-total]')).toContainText('Repartido 4 de 4');
  await expect(all).toBeEnabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('los objetivos múltiples respetan la ventana del motor', async ({ page }) => {
  await page.goto('/ux?scene=multiTarget');
  const block = page.locator('[data-multi-target]');
  await expect(block).toBeVisible();
  // The spell that asks is named from the ability's attribution, not guessed.
  await expect(block.locator('strong')).toHaveText('Objetivos · Frost Breath');
  // "Up to two" starts at zero: declining is a legal submission.
  await expect(block).toContainText('Elige hasta 2 objetivos');
  await expect(block).toContainText('ninguno es una respuesta legal');
  const confirm = block.locator('button.primary');
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText('Confirmar sin objetivos');

  // One target, then the second: the count is the engine's window.
  await block.getByRole('button', { name: 'Grizzly Bears', exact: true }).click();
  await expect(block.locator('[data-multi-count]')).toContainText('Elegidos 1 de 2');
  await expect(confirm).toHaveText('Confirmar 1 objetivo: Grizzly Bears');
  await block.getByRole('button', { name: 'Savannah Lions', exact: true }).click();
  await expect(block.locator('[data-multi-count]')).toContainText('el máximo');
  // The set follows the engine's list, not the click order.
  await expect(confirm).toHaveText('Confirmar 2 objetivos: Grizzly Bears + Savannah Lions');
  // At the maximum the rest stops accepting; the picked ones still toggle off.
  const third = block.getByRole('button', { name: 'Elvish Mystic', exact: true });
  await expect(third).toBeDisabled();
  await block.getByRole('button', { name: 'Grizzly Bears', exact: true }).click();
  await expect(third).toBeEnabled();
  await expect(block.locator('[data-multi-count]')).toContainText('Elegidos 1 de 2');

  // A fixed count is the other half of the rule: one short is not an answer.
  await page.goto('/ux?scene=multiTargetExact');
  const exact = page.locator('[data-multi-target]');
  await expect(exact.locator('strong')).toHaveText('Objetivos · Grusilda, Monster Masher');
  await expect(exact).toContainText('Elige exactamente 2 objetivos');
  const fixed = exact.locator('button.primary');
  await expect(fixed).toBeDisabled();
  await expect(fixed).toHaveText('Faltan 2 objetivos');
  await expect(exact.locator('[data-multi-count]')).toContainText('faltan 2');
  await exact.getByRole('button', { name: 'Llanowar Elves', exact: true }).click();
  await expect(fixed).toBeDisabled();
  // A short set is not offered: the button names what is missing.
  await expect(fixed).toHaveText('Falta 1 objetivo');
  await expect(exact.locator('[data-multi-count]')).toContainText('faltan 1');
  await exact.getByRole('button', { name: 'Grizzly Bears', exact: true }).click();
  await expect(fixed).toBeEnabled();
  await expect(fixed).toHaveText('Confirmar 2 objetivos: Llanowar Elves + Grizzly Bears');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la estación gira una criatura, no suma varias, y deja cancelar', async ({ page }) => {
  await page.goto('/ux?scene=station');
  const station = page.locator('[data-station-prompt]');
  await expect(station).toBeVisible();
  await expect(station.locator('strong')).toHaveText('Estación · Entropic Battlecruiser');
  // The distinction with crew: one creature, and its power is the count.
  await expect(station).toContainText('Es una criatura, no una suma');
  await expect(station).toContainText('CR 702.184a');
  // No invented counter count: the printed power is not the engine's number.
  await expect(station).toContainText('puede no ser la fuerza impresa');
  // Exactly the candidates Phase published, one answer each.
  await expect(station.locator('button.row')).toHaveCount(3);
  await expect(station.getByRole('button', { name: 'Savannah Lions' })).toBeEnabled();
  // Backing out is legal while the prompt is open: nothing has been paid yet.
  await expect(station.getByRole('button', { name: 'Cancelar: no girar nada' })).toBeEnabled();
  await expect(station).toContainText('CR 602.2b');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('equipar ofrece exactamente los permanentes que acepta Phase', async ({ page }) => {
  await page.goto('/ux?scene=equip');
  const equip = page.locator('[data-equip-prompt]');
  await expect(equip).toBeVisible();
  await expect(equip.locator('strong')).toHaveText('Equipar · Bonesplitter');
  await expect(equip).toContainText('CR 702.6a');
  // `valid_targets` lists two creatures; the block does not add a third.
  await expect(equip.locator('button.row')).toHaveCount(2);
  await expect(equip.getByRole('button', { name: 'Savannah Lions' })).toBeEnabled();
  await expect(equip.getByRole('button', { name: 'Elvish Mystic' })).toBeEnabled();
  await expect(equip.getByRole('button', { name: 'Grizzly Bears' })).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la tirada elige quién decide, no quién empieza', async ({ page }) => {
  await page.goto('/ux?scene=startingPlayer');
  const prompt = page.locator('[data-starting-player]');
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('strong')).toHaveText('La tirada decide quién elige');
  // The rule the block has to carry: winning the roll gives the choice, not the turn.
  await expect(prompt).toContainText('No decide la tirada');
  // The seats are the engine's, one answer each, and the chooser is marked.
  await expect(prompt.locator('button.row')).toHaveCount(2);
  await expect(prompt.getByRole('button', { name: 'Empieza Jugador 1 (tú)' })).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Empieza Jugador 2' })).toBeVisible();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la guardia pide el permanente, no pregunta otra vez si se paga', async ({ page }) => {
  await page.goto('/ux?scene=ward');
  const prompt = page.locator('[data-ward-sacrifice]');
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('strong')).toHaveText('Guardia · sacrificar');
  // The pay decision is already made: there is no "no pago" among the options.
  await expect(prompt.getByRole('button', { name: 'No pagar' })).toHaveCount(0);
  await expect(prompt).toContainText('Ya pagas la guardia');
  // Exactly the permanents Phase listed, nothing else.
  await expect(prompt.locator('button.row')).toHaveCount(2);
  await expect(prompt.getByRole('button', { name: 'Savannah Lions' })).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Elvish Mystic' })).toBeVisible();

  await page.goto('/ux?scene=wardPower');
  const threshold = page.locator('[data-ward-sacrifice]');
  await expect(threshold.locator('[data-ward-threshold]')).toHaveText(
    'El coste pide permanentes cuyo poder total llegue a 3. Phase propone un conjunto; la mesa no arma otro (CR 118.12a).'
  );
  // One set, with its total shown for the player's benefit.
  await expect(threshold.locator('button.row')).toHaveCount(1);
  await expect(threshold.getByRole('button', { name: /^Grizzly Bears \+ Elvish Mystic/ })).toContainText('poder total 3');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el tributo lo decide un oponente, y las dos respuestas se distinguen', async ({ page }) => {
  await page.goto('/ux?scene=tribute');
  const prompt = page.locator('[data-tribute]');
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('strong')).toHaveText('Tributo · Fanatic of Xenagos');
  // The rule the block has to carry: the controller does not choose.
  await expect(prompt).toContainText('un oponente suyo decide si se paga');
  await expect(prompt).toContainText('El controlador no elige');
  // The count is the engine's, and it says what paying means.
  await expect(prompt.locator('[data-tribute-count]')).toHaveText(
    'Pagar el tributo es poner 1 contador +1/+1 sobre Fanatic of Xenagos.'
  );
  await expect(prompt.getByRole('button', { name: 'Pagar el tributo: 1 contador +1/+1' })).toBeEnabled();
  await expect(prompt.getByRole('button', { name: 'No pagar' })).toBeEnabled();
  // Declining is a distinct outcome, not "nothing happens".
  await expect(prompt.locator('[data-tribute-decline-hint]')).toContainText('CR 702.104b');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('el coste disyuntivo pregunta cuál se paga, y deja no pagar', async ({ page }) => {
  await page.goto('/ux?scene=branches');
  const prompt = page.locator('[data-unless-branch]');
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('strong')).toHaveText('¿Qué pagas?');
  // Each branch is named by the engine's own kind and count.
  await expect(prompt.getByRole('button', { name: 'Sacrificar 1 permanente' })).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Descartar 1 carta' })).toBeVisible();
  // The consequence of not paying is the engine's sentence.
  await expect(prompt).toContainText('pierde 3 vidas');

  const pay = prompt.getByRole('button', { name: /^Pagar/ });
  await expect(pay).toBeDisabled();
  await prompt.getByRole('button', { name: 'Descartar 1 carta' }).click();
  await expect(pay).toHaveText('Pagar: Descartar 1 carta');
  await expect(prompt.getByRole('button', { name: 'No pagar' })).toBeEnabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la ficha elige destinatario entre las criaturas que entraron', async ({ page }) => {
  await page.goto('/ux?scene=host');
  const prompt = page.locator('[data-token-host]');
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('strong')).toHaveText('¿Dónde entra la ficha? · Grizzly Bears');
  // The engine's own note: a choice, not a target, so nothing is filtered out.
  await expect(prompt).toContainText('Es una elección, no un objetivo');
  await expect(prompt.locator('button.row')).toHaveCount(2);

  const confirm = prompt.getByRole('button', { name: /^Confirmar destinatario$|^Poner la ficha en/ });
  await expect(confirm).toBeDisabled();
  await prompt.getByRole('button', { name: 'Savannah Lions' }).click();
  await expect(confirm).toHaveText('Poner la ficha en Savannah Lions');
  await prompt.getByRole('button', { name: 'Elvish Mystic' }).click();
  await expect(confirm).toHaveText('Poner la ficha en Elvish Mystic');
  await expect(prompt.getByRole('button', { name: 'Savannah Lions' })).toHaveAttribute('aria-pressed', 'false');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('emparejar ofrece pareja y también no emparejar', async ({ page }) => {
  await page.goto('/ux?scene=pair');
  const prompt = page.locator('[data-pair-prompt]');
  await expect(prompt).toBeVisible();
  // CR 702.95a: the block names the creature that is pairing.
  await expect(prompt.locator('strong')).toHaveText('Emparejar · Grizzly Bears');
  await expect(prompt.locator('button.card')).toHaveCount(2);

  const confirm = prompt.getByRole('button', { name: /^Confirmar pareja$|^Emparejar con/ });
  const decline = prompt.getByRole('button', { name: 'No emparejar' });
  // CR 608.2d: nothing picked yet is not a dead end — declining is an answer.
  await expect(confirm).toBeDisabled();
  await expect(decline).toBeEnabled();

  // One partner only: a second pick replaces the first.
  await prompt.getByRole('button', { name: /^Savannah Lions/ }).click();
  await expect(confirm).toHaveText('Emparejar con Savannah Lions');
  await prompt.getByRole('button', { name: /^Elvish Mystic/ }).click();
  await expect(confirm).toHaveText('Emparejar con Elvish Mystic');
  await expect(prompt.getByRole('button', { name: /^Savannah Lions/ })).toHaveAttribute('aria-pressed', 'false');
  // Clicking the picked one again releases it.
  await prompt.getByRole('button', { name: /^Elvish Mystic/ }).click();
  await expect(confirm).toBeDisabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un «a menos que pagues» dice el coste y lo que pasa si no pagas', async ({ page }) => {
  await page.goto('/ux?scene=unless');
  const prompt = page.locator('[data-unless-prompt]');
  await expect(prompt).toBeVisible();
  // CR 118.12: the cost and the consequence are the engine's, not the UI's.
  await expect(prompt.locator('strong')).toHaveText('Paga {3}');
  await expect(prompt).toContainText('Si no pagas: contrarrestar el hechizo.');
  // No multi-player poll here, so no count of remaining seats.
  await expect(prompt).not.toContainText('se le pregunta');

  // Declining is a real answer with its own button, not a missing action.
  await expect(prompt.getByRole('button', { name: 'Pagar {3}' })).toBeEnabled();
  await expect(prompt.getByRole('button', { name: 'No pagar' })).toBeEnabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('revelar es una carta sola y la negativa tiene su propio botón', async ({ page }) => {
  await page.goto('/ux?scene=reveal');
  const prompt = page.locator('[data-reveal-prompt]');
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('strong')).toHaveText('Revelar de la mano');
  await expect(prompt).toContainText('Elige una carta para revelar, o no reveles.');

  const rows = prompt.locator('button.card');
  await expect(rows).toHaveCount(3);
  const confirm = prompt.getByRole('button', { name: /^Confirmar$|^Revelar/ });
  // Nothing picked: the reveal cannot be confirmed, but declining is available.
  await expect(confirm).toBeDisabled();
  await expect(prompt.getByRole('button', { name: 'No revelar' })).toBeEnabled();

  // One card only: a second pick replaces the first, it does not add to it.
  // `^` keeps the rows apart from the confirm button, which reads «Revelar X».
  await prompt.getByRole('button', { name: /^Mountain/ }).click();
  await expect(confirm).toHaveText('Revelar Mountain');
  await prompt.getByRole('button', { name: /^Shock/ }).click();
  await expect(confirm).toHaveText('Revelar Shock');
  await expect(prompt.getByRole('button', { name: /^Mountain/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(prompt.getByRole('button', { name: /^Shock/ })).toHaveAttribute('aria-pressed', 'true');
  // Clicking the picked card again clears it.
  await prompt.getByRole('button', { name: /^Shock/ }).click();
  await expect(confirm).toBeDisabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un «puedes» de otro jugador dice de quién es la fuente y a quién le toca', async ({ page }) => {
  await page.goto('/ux?scene=opponent');
  const prompt = page.locator('[data-optional-effect]');
  await expect(prompt).toBeVisible();
  // CR 608.2d: the same action, the other question. Naming the source is not
  // enough — the block has to say the source is not yours.
  await expect(prompt.locator('strong')).toHaveText('Otro jugador te pregunta · Chandra, Torch of Defiance');
  await expect(prompt).toContainText('Puedes sacrificar una tierra.');
  await expect(prompt).toContainText('La fuente no es tuya: la decisión sí.');
  // The engine publishes who is left (APNAP order), so the block can say it.
  await expect(prompt).toContainText('después queda 1 jugador');

  // CR 603.5 does not apply here: no key, so no memory boxes.
  await expect(prompt.getByRole('checkbox')).toHaveCount(0);
  await expect(prompt.getByRole('button', { name: 'Sí, resolverlo' })).toBeEnabled();
  await expect(prompt.getByRole('button', { name: 'No' })).toBeEnabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('una cantidad se escribe dentro de la ventana del motor y no se recorta', async ({ page }) => {
  await page.goto('/ux?scene=pay');
  const prompt = page.locator('[data-pay-amount]');
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('strong')).toHaveText('Elige una cantidad · Grizzly Bears');
  await expect(prompt).toContainText('Entre 1 y 4');

  const field = prompt.getByRole('spinbutton', { name: 'Cantidad' });
  const commit = prompt.getByRole('button', { name: /^Pagar/ });
  // The box opens at the engine's minimum, and that is already committable.
  await expect(field).toHaveValue('1');
  await expect(commit).toHaveText('Pagar 1 vida');
  await expect(commit).toBeEnabled();

  // Over the window: the entry is refused, not clamped to 4.
  await field.fill('9');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(prompt).toContainText('Escribe un número entre 1 y 4.');
  await expect(prompt.getByRole('button', { name: /^Pagar/ })).toBeDisabled();
  // The steppers stay usable while the entry is refused and recover into range.
  await prompt.getByRole('button', { name: 'Restar uno a la cantidad' }).click();
  await expect(field).toHaveValue('4');
  await expect(commit).toHaveText('Pagar 4 vida');

  await prompt.getByRole('button', { name: 'Cantidad al máximo' }).click();
  await expect(field).toHaveValue('4');
  await field.fill('2');
  await expect(commit).toHaveText('Pagar 2 vida');
  await commit.click();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un «puedes» pregunta una vez y puede dejar de preguntar', async ({ page }) => {
  await page.goto('/ux?scene=optional');
  const prompt = page.locator('[data-optional-effect]');
  await expect(prompt).toBeVisible();
  // The wording is the engine's, not a paraphrase of the card.
  await expect(prompt).toContainText('Puedes robar una carta.');
  await expect(prompt.locator('strong')).toHaveText('Puedes · Grizzly Bears');

  // Two answers, both reachable.
  const yes = prompt.getByRole('button', { name: 'Sí, resolverlo' });
  const no = prompt.getByRole('button', { name: 'No' });
  await expect(yes).toBeEnabled();
  await expect(no).toBeEnabled();

  // CR 603.5: the boxes exist because the prompt carries a memory key.
  const remember = prompt.getByRole('checkbox', { name: /No volver a preguntar/ });
  const sameCard = prompt.getByRole('checkbox', { name: /esta misma carta/ });
  await expect(remember).not.toBeChecked();
  await expect(sameCard).not.toBeChecked();

  // The wider scope implies remembering, and dropping that one clears it.
  await sameCard.check();
  await expect(remember).toBeChecked();
  await remember.uncheck();
  await expect(sameCard).not.toBeChecked();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('mirar cartas dice qué se guarda y adónde va el resto', async ({ page }) => {
  await page.goto('/ux?scene=dig');
  const prompt = page.locator('[data-dig-prompt]');
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('strong').first()).toHaveText('Mira 3 cartas');

  // The destination is part of the decision, not decoration.
  await expect(prompt).toContainText('Lo que guardas va a tu mano; el resto van al cementerio.');

  const rows = prompt.locator('button.card');
  await expect(rows).toHaveCount(3);
  // CR 701.20e: the card that does not pass the filter is shown, not keepable.
  await expect(prompt.getByRole('button', { name: /Shock/ })).toBeDisabled();
  await expect(prompt.getByRole('button', { name: /Shock/ })).toContainText('No encaja');

  const confirm = prompt.getByRole('button', { name: /^Guardar/ });
  await expect(confirm).toHaveText('Guardar (0/1)');
  await expect(confirm).toBeDisabled();

  await prompt.getByRole('button', { name: /Llanowar Elves/ }).click();
  await expect(confirm).toHaveText('Guardar (1/1)');
  await expect(confirm).toBeEnabled();
  await expect(prompt.getByRole('button', { name: /Llanowar Elves/ })).toHaveAttribute('aria-pressed', 'true');

  // One card only: a second cannot join, and untucking frees the slot.
  await prompt.getByRole('button', { name: /Grizzly Bears/ }).click();
  await expect(confirm).toHaveText('Guardar (1/1)');
  await prompt.getByRole('button', { name: /Llanowar Elves/ }).click();
  await expect(confirm).toHaveText('Guardar (0/1)');
  await expect(confirm).toBeDisabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('una búsqueda ofrece las cartas que publica el motor y no otras', async ({ page }) => {
  await page.goto('/ux?scene=search');
  const prompt = page.locator('[data-search-prompt]');
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('strong')).toHaveText('Buscar en la biblioteca');

  // Only the cards Phase published: four, named, with their type line.
  // The row's own text is its accessible name — overriding it would hide the
  // type line and the cost from a screen reader.
  const rows = prompt.locator('button.card');
  await expect(rows).toHaveCount(4);
  await expect(prompt).toContainText('Llanowar Elves');
  await expect(prompt).toContainText('Elf Druid');
  await expect(prompt).not.toContainText('Carta 999');

  // A quantity search demands exactly what it asked for.
  await expect(prompt).toContainText('Phase pide exactamente 1');
  const confirm = prompt.getByRole('button', { name: /Confirmar búsqueda/ });
  await expect(confirm).toHaveText('Confirmar búsqueda (0/1)');
  await expect(confirm).toBeDisabled();

  await prompt.getByRole('button', { name: /Llanowar Elves/ }).click();
  await expect(prompt.getByRole('button', { name: /Llanowar Elves/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(confirm).toHaveText('Confirmar búsqueda (1/1)');
  await expect(confirm).toBeEnabled();

  // The window is one: a second card cannot join, and un-ticking frees it.
  await prompt.getByRole('button', { name: /Grizzly Bears/ }).click();
  await expect(confirm).toHaveText('Confirmar búsqueda (1/1)');
  await prompt.getByRole('button', { name: /Llanowar Elves/ }).click();
  await expect(confirm).toHaveText('Confirmar búsqueda (0/1)');
  await expect(confirm).toBeDisabled();

  // The found cards are revealed before the sweep continues (CR 701.23a).
  await expect(prompt).toContainText('se revelan');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un hechizo modal elige sus modos dentro de la ventana del motor', async ({ page }) => {
  await page.goto('/ux?scene=modeChoice');
  const prompt = page.locator('[data-mode-choice]');
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('Elige 2 modos');
  await expect(prompt).toContainText('Selesnya Charm');

  const rows = prompt.getByRole('button', { name: /La criatura objetivo|Ganas 3 vidas/ });
  await expect(rows).toHaveCount(3);
  // CR 700.2a: the mode Phase rules out is offered but not selectable.
  const refused = prompt.getByRole('button', { name: /Ganas 3 vidas/ });
  await expect(refused).toBeDisabled();
  await expect(refused).toContainText('Ya no disponible');

  const confirm = prompt.getByRole('button', { name: /Confirmar modos/ });
  await expect(confirm).toHaveText('Confirmar modos (0/2)');
  await expect(confirm).toBeDisabled();

  // Two modes fill the window; a third is refused, and each row says so.
  await prompt.getByRole('button', { name: /\+2\/\+2/ }).click();
  await expect(confirm).toHaveText('Confirmar modos (1/2)');
  await expect(confirm).toBeDisabled();
  await prompt.getByRole('button', { name: /vigilancia/ }).click();
  await expect(confirm).toHaveText('Confirmar modos (2/2)');
  await expect(confirm).toBeEnabled();
  await expect(prompt.getByRole('button', { name: /\+2\/\+2/ })).toHaveAttribute('aria-pressed', 'true');

  // Un-ticking frees a slot again.
  await prompt.getByRole('button', { name: /\+2\/\+2/ }).click();
  await expect(prompt.getByRole('button', { name: /\+2\/\+2/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(confirm).toHaveText('Confirmar modos (1/2)');

  // The selection can be cleared in one press.
  await prompt.getByRole('button', { name: 'Limpiar' }).click();
  await expect(confirm).toHaveText('Confirmar modos (0/2)');

  // A modal spell is cancellable at this step (CR 601.2b).
  await expect(prompt.getByRole('button', { name: 'Cancelar' })).toBeVisible();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('los disparos simultáneos se ordenan del último al primero', async ({ page }) => {
  await page.goto('/ux?scene=triggerOrder');
  const prompt = page.locator('[data-trigger-order]');
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('.edge').first()).toHaveText('Se resuelven al final');
  await expect(prompt.locator('.edge').last()).toHaveText('Se resuelve primero');
  await expect(prompt.getByRole('button', { name: 'Confirmar orden' })).toBeEnabled();

  // The list opens in the engine's order, one row per trigger and no extra.
  const rows = prompt.getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Soul Warden');
  await expect(rows.nth(2)).toContainText('Dina, Soul Steeper');
  await expect(rows.nth(0)).toContainText('Ganas 1 vida.');

  // Ends are pinned: nothing moves above the first row or below the last.
  await expect(prompt.getByRole('button', { name: 'Subir Soul Warden' })).toBeDisabled();
  await expect(prompt.getByRole('button', { name: 'Bajar Dina, Soul Steeper' })).toBeDisabled();

  // Moving a row swaps it with its neighbour and leaves the rest untouched.
  await prompt.getByRole('button', { name: "Bajar Soul Warden" }).click();
  await expect(rows.nth(0)).toContainText("Ajani's Pridemate");
  await expect(rows.nth(1)).toContainText('Soul Warden');
  await expect(rows.nth(2)).toContainText('Dina, Soul Steeper');
  // The row keeps the number the engine gave it: the player can follow it.
  await expect(rows.nth(1).locator('.number')).toHaveText('1');

  // Keyboard: the row buttons are real buttons, so Tab + Enter is enough.
  await prompt.getByRole('button', { name: 'Bajar Soul Warden' }).focus();
  await page.keyboard.press('Enter');
  await expect(rows.nth(2)).toContainText('Soul Warden');
  await expect(prompt.getByRole('button', { name: 'Bajar Soul Warden' })).toBeDisabled();

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la X se anuncia dentro de la ventana que publica el motor', async ({ page }) => {
  await page.goto('/ux?scene=chooseX');
  const prompt = page.locator('[data-x-prompt]');
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('strong')).toHaveText('Elegir X · Fireball');
  // The window is Phase's; the block only repeats it.
  await expect(prompt).toContainText('Máximo 5');

  const field = prompt.getByRole('spinbutton', { name: 'Valor de X' });
  await expect(field).toHaveValue('0');
  await expect(prompt.getByRole('button', { name: 'Restar uno a X' })).toBeDisabled();
  await expect(prompt.getByRole('button', { name: 'Confirmar X = 0' })).toBeEnabled();

  // The steppers move inside the window, and the cost follows the value.
  await prompt.getByRole('button', { name: 'Sumar uno a X' }).click();
  await expect(field).toHaveValue('1');
  await prompt.getByRole('button', { name: 'X al máximo' }).click();
  await expect(field).toHaveValue('5');
  await expect(prompt).toContainText('Coste con X = 5: {6}{R}');
  await expect(prompt.getByRole('button', { name: 'Sumar uno a X' })).toBeDisabled();

  // Out of range is refused, not coerced: no value, no cost, no dispatch.
  await field.fill('99');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(prompt.getByRole('button', { name: /^Confirmar X$/ })).toBeDisabled();
  await expect(prompt.getByRole('status')).toHaveText('Escribe un número entre 0 y 5.');
  await expect(prompt).not.toContainText('Coste con');

  // The refused entry is also the state axe has to agree with: a red border
  // alone would not announce anything, and an unlabelled number box would be a
  // serious violation in its own right.
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);

  // Typing a multi-digit entry is not clamped keystroke by keystroke.
  await field.fill('1');
  await field.fill('12');
  await expect(field).toHaveValue('12');
  await expect(field).toHaveAttribute('aria-invalid', 'true');

  // Arrow keys step and recover into the window; Enter is the confirm.
  await field.focus();
  await page.keyboard.press('ArrowDown');
  await expect(field).toHaveValue('5');
  await expect(field).toHaveAttribute('aria-invalid', 'false');
  await expect(prompt.getByRole('button', { name: 'Confirmar X = 5' })).toBeEnabled();
  await expect(prompt.getByRole('button', { name: 'Cancelar' })).toBeVisible();
});

test('la limpieza conserva el bloque que busca la partida completa', async ({ page }) => {
  // `ui-game.spec.ts` drives a whole game and finds this prompt by its
  // accessible name, so the cleanup block announces the rule and not the
  // count of that particular turn. Its count still comes from the engine.
  await page.goto('/ux?scene=cleanup');
  const prompt = page.locator('[aria-label="Descartar hasta siete cartas"]');
  await expect(prompt).toBeVisible();
  await expect(prompt.locator('strong')).toHaveText('Descartar 2 cartas');
  await expect(prompt).toHaveAttribute('data-discard', 'cleanup');

  const confirm = prompt.getByRole('button', { name: /Confirmar descarte/ });
  await expect(confirm).toHaveText('Confirmar descarte (0/2)');
  await expect(confirm).toBeDisabled();

  const hand = page.locator('.hand-zone [data-card-id]');
  await hand.nth(0).click();
  await hand.nth(1).click();
  await expect(confirm).toHaveText('Confirmar descarte (2/2)');
  await expect(confirm).toBeEnabled();
  await expect(page.getByRole('button', { name: /^No descartar/ })).toHaveCount(0);
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

// ── Pasada 67: ChooseRingBearer, ChooseLegend, BattleProtectorChoice ─────────

test('el portador del Anillo se elige entre los candidatos publicados, en su orden', async ({ page }) => {
  await page.goto('/ux?scene=ringBearer');
  const block = page.locator('[data-exact-candidate]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-exact-candidate-kind', 'ring-bearer');
  await expect(block).toHaveAttribute('data-exact-candidate-count', '2');
  await expect(block.locator('strong')).toHaveText('Elegir portador del Anillo');
  await expect(block.locator('[data-exact-candidate-rule]')).toContainText('CR 701.54a');

  const options = block.locator('[data-exact-candidate-option]');
  await expect(options).toHaveCount(2);
  // The wire's order, not the label's: the ids are what the engine published.
  await expect(options.nth(0)).toHaveAttribute('data-exact-candidate-option', '333');
  await expect(options.nth(1)).toHaveAttribute('data-exact-candidate-option', '334');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un candidato que legal.actions no publicó no es un botón', async ({ page }) => {
  await page.goto('/ux?scene=ringBearerOne');
  const block = page.locator('[data-exact-candidate]');
  await expect(block).toHaveAttribute('data-exact-candidate-count', '1');
  await expect(block.locator('[data-exact-candidate-option]')).toHaveCount(1);
  await expect(block.locator('[data-exact-candidate-option="334"]')).toHaveCount(0);
});

test('el portador ajeno se nombra y no ofrece botones', async ({ page }) => {
  await page.goto('/ux?scene=ringBearerAway');
  const block = page.locator('[data-exact-candidate]');
  await expect(block).toBeVisible();
  await expect(block.locator('[data-exact-candidate-faces] li')).toHaveCount(2);
  await expect(block.locator('[data-exact-candidate-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la regla de leyendas nombra el legendario con el nombre que vino del cable', async ({ page }) => {
  await page.goto('/ux?scene=legend');
  const block = page.locator('[data-exact-candidate]');
  await expect(block).toHaveAttribute('data-exact-candidate-kind', 'legend');
  await expect(block.locator('strong')).toHaveText('Elegir qué Gisela, the Broken Blade se queda');
  await expect(block.locator('[data-exact-candidate-rule]')).toContainText('CR 704.5j');
  const options = block.locator('[data-exact-candidate-option]');
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toContainText('Gisela, the Broken Blade');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('la leyenda ajena la resuelve su controlador y no se pulsa desde aquí', async ({ page }) => {
  await page.goto('/ux?scene=legendAway');
  const block = page.locator('[data-exact-candidate]');
  await expect(block.locator('[data-exact-candidate-other]')).toContainText('Jugador 2');
  await expect(block.locator('button')).toHaveCount(0);
});

test('el protector de la batalla es un asiento publicado, y la batalla se nombra', async ({ page }) => {
  await page.goto('/ux?scene=protoProtector');
  const block = page.locator('[data-exact-candidate]');
  await expect(block).toHaveAttribute('data-exact-candidate-kind', 'battle-protector');
  await expect(block).toHaveAttribute('data-exact-candidate-count', '2');
  await expect(block.locator('strong')).toHaveText('Elegir protector de la batalla');
  await expect(block.locator('[data-exact-candidate-battle]')).toContainText('Invasion of Kamigawa');
  const options = block.locator('[data-exact-candidate-option]');
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toContainText('Jugador 1');
  await expect(options.nth(1)).toContainText('Jugador 2');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('un protector no publicado no es un botón, y el ajeno no se pulsa', async ({ page }) => {
  await page.goto('/ux?scene=protoOne');
  const one = page.locator('[data-exact-candidate]');
  await expect(one.locator('[data-exact-candidate-option]')).toHaveCount(1);
  await expect(one.locator('[data-exact-candidate-option="1"]')).toHaveCount(0);

  await page.goto('/ux?scene=protoAway');
  const away = page.locator('[data-exact-candidate]');
  await expect(away.locator('button')).toHaveCount(0);
  await expect(away.locator('[data-exact-candidate-other]')).toContainText('Jugador 2');
});

// ── Pasada 67: ChooseDungeon y ChooseDungeonRoom ─────────────────────────────

test('la dungeon se elige con el nombre que el motor imprimió, sin tabla propia', async ({ page }) => {
  await page.goto('/ux?scene=dungeon');
  const block = page.locator('[data-dungeon]');
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('data-dungeon-kind', 'dungeon');
  await expect(block).toHaveAttribute('data-dungeon-count', '2');
  await expect(block.locator('strong')).toHaveText('Elegir dungeon');
  await expect(block.locator('[data-dungeon-rule]')).toContainText('CR 701.49a');
  const options = block.locator('[data-dungeon-option]');
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toContainText('Lost Mine of Phandelver');
  await expect(options.nth(1)).toContainText('Dungeon of the Mad Mage');
  // CR 309.4a: the entry room comes from the preview, not from a client table.
  await expect(options.nth(0)).toContainText('Cave Entrance');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('una dungeon no publicada no es un botón, y la ajena no se pulsa', async ({ page }) => {
  await page.goto('/ux?scene=dungeonOne');
  const one = page.locator('[data-dungeon]');
  await expect(one.locator('[data-dungeon-option]')).toHaveCount(1);
  await expect(one.locator('[data-dungeon-option="Dungeon of the Mad Mage"]')).toHaveCount(0);

  await page.goto('/ux?scene=dungeonAway');
  const away = page.locator('[data-dungeon]');
  await expect(away.locator('button')).toHaveCount(0);
  await expect(away.locator('[data-dungeon-other]')).toContainText('Jugador 2');
});

test('la habitación de la dungeon se elige por el índice que publicó el motor', async ({ page }) => {
  await page.goto('/ux?scene=dungeonRoom');
  const block = page.locator('[data-dungeon]');
  await expect(block).toHaveAttribute('data-dungeon-kind', 'room');
  await expect(block).toHaveAttribute('data-dungeon-count', '2');
  await expect(block.locator('strong')).toHaveText('Elegir habitación');
  await expect(block.locator('[data-dungeon-name]')).toContainText('Lost Mine of Phandelver');
  const options = block.locator('[data-dungeon-room]');
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toHaveAttribute('data-dungeon-room', '1');
  await expect(options.nth(0)).toContainText('Cave Entrance');
  await expect(options.nth(1)).toHaveAttribute('data-dungeon-room', '2');

  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
});

test('una habitación no publicada no es un botón, y la ajena no se pulsa', async ({ page }) => {
  await page.goto('/ux?scene=dungeonRoomOne');
  const one = page.locator('[data-dungeon]');
  await expect(one.locator('[data-dungeon-room]')).toHaveCount(1);
  await expect(one.locator('[data-dungeon-room="2"]')).toHaveCount(0);

  await page.goto('/ux?scene=dungeonRoomAway');
  const away = page.locator('[data-dungeon]');
  await expect(away.locator('button')).toHaveCount(0);
});
