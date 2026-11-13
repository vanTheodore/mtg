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
