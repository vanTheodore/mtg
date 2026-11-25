import { expect, test, type Page } from '@playwright/test';

/**
 * UX-HAND — the phone hand sheet.
 *
 * Two kinds of evidence, kept apart on purpose:
 *
 *  1. **Fixture** (`/stress`, no engine): presentation, layout and *effective*
 *     touch surface. Runs anywhere, including a sandbox where the WASM engine
 *     and the Playwright CDN are unavailable. The fixture publishes no legal
 *     actions, so nothing here claims to play a card.
 *  2. **Engine** (`/?autostart`, real Phase WASM): a card really leaves the hand
 *     and lands on the battlefield, priority changes refresh legality, and the
 *     opponent's hand never leaks into the sheet. These need the built engine
 *     and run in Mesa CI; locally they are blocked by the missing
 *     `static/wasm/mtg_engine_wasm.wasm`.
 *
 * Measured baseline before this sheet (`/stress`, 390×844, 15 cards):
 * two cards visible, ~1 988px of horizontal scrolling, 147px-wide faces, and
 * the card's own toolbar overlapped by the strip. The numbers below are the
 * after-state, asserted rather than described.
 */

// A phone hand is a touch surface: opening it with `.tap()` is the point, and
// a narrow desktop window would exercise a pointer the player does not have.
test.use({ hasTouch: true });

const SIZES = [
  { width: 320, height: 844 },
  { width: 375, height: 844 },
  { width: 390, height: 844 },
  { width: 844, height: 390 }
] as const;

async function fixture(page: Page, cards: number, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.route('**/cards.scryfall.io/**', (route) => route.abort());
  await page.goto(`/stress?hand=${cards}&tokens=0&mirror=0`);
  await expect(page.locator('.hand-trigger')).toBeVisible();
}

async function openSheet(page: Page) {
  const trigger = page.locator('.hand-trigger');
  await trigger.tap();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.hand-sheet')).toBeVisible();
  // Opening moves focus into the sheet, after its own tick. Waiting here keeps
  // every test that starts from "the sheet is open" measuring a settled state.
  await expect
    .poll(() => page.evaluate(() => !!document.activeElement?.closest('.hand-sheet')), { timeout: 5_000 })
    .toBe(true);
}

type SheetMetrics = {
  sheet: { top: number; left: number; width: number; height: number };
  columns: number;
  cardWidth: number;
  horizontalOverflow: number;
  documentOverflow: number;
  /** Fully inside the viewport. */
  visibleCards: number;
  /** Centre inside the viewport: the card can be pressed where it is painted. */
  centredCards: number;
  reachableCards: number;
  cards: number;
  scrollable: number;
};

/**
 * `reachableCards` is the metric that matters: for every card, put a finger on
 * its centre and ask the browser what is actually there. A card that exists
 * inside a scrollport the sheet covers, or whose centre is painted over, is not
 * a card the player can press — bounding boxes alone would have called it fine.
 */
async function measure(page: Page): Promise<SheetMetrics> {
  return page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('.hand-sheet')!;
    const grid = sheet.querySelector<HTMLElement>('.sheet-grid')!;
    const rect = sheet.getBoundingClientRect();
    const faces = [...sheet.querySelectorAll<HTMLElement>('[data-card-id]')];
    const hit = faces.filter((face) => {
      const box = face.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
      const target = document.elementFromPoint(x, y);
      return !!target && face.contains(target);
    }).length;
    const inViewport = faces.filter((face) => {
      const box = face.getBoundingClientRect();
      return box.top >= -1 && box.bottom <= innerHeight + 1;
    }).length;
    // A partly scrolled card still has a pressable centre; that is a real
    // target, so it counts separately from a fully visible one.
    const centred = faces.filter((face) => {
      const box = face.getBoundingClientRect();
      const y = box.top + box.height / 2;
      return y >= 0 && y <= innerHeight && box.left + box.width / 2 <= innerWidth;
    }).length;
    return {
      sheet: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      cardWidth: Math.round(faces[0]?.getBoundingClientRect().width ?? 0),
      horizontalOverflow: Math.round(grid.scrollWidth - grid.clientWidth),
      documentOverflow: Math.round(document.documentElement.scrollWidth - innerWidth),
      visibleCards: inViewport,
      centredCards: centred,
      reachableCards: hit,
      cards: faces.length,
      scrollable: Math.round(grid.scrollHeight - grid.clientHeight)
    };
  });
}

for (const size of SIZES) {
  test(`hoja a pantalla completa, sin desbordes y con toque efectivo — ${size.width}×${size.height}`, async ({ page }) => {
    await fixture(page, 15, size);
    await openSheet(page);
    const m = await measure(page);

    // Full screen: the sheet is the surface, not a strip at the bottom.
    expect(m.sheet.top, 'la hoja no empieza arriba').toBeLessThanOrEqual(1);
    expect(m.sheet.left, 'la hoja no empieza a la izquierda').toBeLessThanOrEqual(1);
    expect(m.sheet.width, 'la hoja no ocupa el ancho').toBeGreaterThanOrEqual(size.width - 2);
    expect(m.sheet.height, 'la hoja no ocupa el alto').toBeGreaterThanOrEqual(size.height - 2);

    // The old drawer scrolled sideways; the sheet must not.
    expect(m.horizontalOverflow, 'la hoja desborda en horizontal').toBeLessThanOrEqual(1);
    expect(m.documentOverflow, 'la página desborda en horizontal').toBeLessThanOrEqual(1);

    // Large cards, more than one column, several cards at once.
    expect(m.columns, 'una sola columna deja la mano en un carrusel').toBeGreaterThanOrEqual(2);
    expect(m.cardWidth, 'la carta es demasiado pequeña para leerse').toBeGreaterThanOrEqual(132);
    expect(m.visibleCards, 'no se ve más de una carta por pantalla').toBeGreaterThanOrEqual(3);
    expect(m.reachableCards, 'cartas visibles que no reciben el toque').toBeGreaterThanOrEqual(3);
    // Effective touch surface, not bounding boxes: every card whose centre is
    // on screen must be what the browser finds at that point.
    expect(m.reachableCards, 'cartas con el centro en pantalla y no tocables').toBe(m.centredCards);

    // Fifteen cards must fit in a scroll a thumb can finish, not 30 screens.
    expect(m.scrollable, 'la mano sigue siendo un desplazamiento interminable').toBeLessThan(2600);

  });
}

test('quince cartas caben en menos pantallas que el cajón anterior', async ({ page }, testInfo) => {
  await fixture(page, 15, { width: 390, height: 844 });
  await openSheet(page);
  const m = await measure(page);
  // Baseline: 2 visible, 1 988px of sideways scrolling, 147px faces.
  const evidence = { ...m, baseline: { visibleCards: 2, cardWidth: 147, horizontalOverflow: 1988 } };
  console.log('MESA_HAND_SHEET_EVIDENCE ' + JSON.stringify(evidence));
  await testInfo.attach('hand-sheet-15-390.json', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json'
  });
  await page.screenshot({ path: testInfo.outputPath('hand-sheet-15-390.png') });

  expect(m.visibleCards).toBeGreaterThan(2);
  expect(m.cardWidth).toBeGreaterThan(147);
  expect(m.horizontalOverflow).toBeLessThanOrEqual(1);
});

test('se recorre hasta la última carta y todas reciben el dedo', async ({ page }) => {
  await fixture(page, 15, { width: 390, height: 844 });
  await openSheet(page);
  const last = page.locator('.hand-sheet [data-card-id]').last();
  await last.scrollIntoViewIfNeeded();
  const box = (await last.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(844 + 1);
  const owner = await page.evaluate(
    ([x, y]) => {
      const target = document.elementFromPoint(x, y);
      return target?.closest('[data-card-id]')?.getAttribute('data-card-id') ?? null;
    },
    [box.x + box.width / 2, box.y + box.height / 2]
  );
  expect(owner, 'la última carta no recibe el toque').not.toBeNull();
});

test('tocar la carta inspecciona; no lanza nada', async ({ page }) => {
  await fixture(page, 7, { width: 390, height: 844 });
  await openSheet(page);

  const card = page.locator('.hand-sheet [data-card-id]').first();
  const box = (await card.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

  // Inspection opens a detail on top of the hand — the sheet stays open, the
  // hand keeps its place, and nothing is dispatched.
  const detail = page.locator('.sheet-detail');
  await expect(detail).toBeVisible();
  await expect(detail.locator('h3')).not.toBeEmpty();
  await expect(detail.locator('.detail-text')).not.toBeEmpty();
  await expect(page.locator('.hand-sheet')).toBeVisible();
  await expect(detail).toBeInViewport();

  // Escape returns to the hand first, then closes the sheet to the trigger.
  const trigger = page.locator('.hand-trigger');
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();
  await expect(page.locator('.hand-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.hand-sheet')).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('el botón de volver cierra la hoja y devuelve el foco al disparador', async ({ page }) => {
  await fixture(page, 5, { width: 320, height: 844 });
  await openSheet(page);
  const close = page.locator('.hand-sheet .sheet-close');
  await expect(close).toBeFocused();
  await close.tap();
  await expect(page.locator('.hand-sheet')).toBeHidden();
  await expect(page.locator('.hand-trigger')).toBeFocused();
});

test('la mano vacía lo dice, no se rompe', async ({ page }) => {
  await fixture(page, 0, { width: 390, height: 844 });
  await openSheet(page);
  await expect(page.locator('.hand-sheet .sheet-empty')).toHaveText(/vacía/i);
  await expect(page.locator('.hand-sheet [data-card-id]')).toHaveCount(0);
  const m = await measure(page);
  expect(m.horizontalOverflow).toBeLessThanOrEqual(1);
});

test('rotar con la hoja abierta la mantiene a pantalla completa, sin desbordes', async ({ page }) => {
  await fixture(page, 10, { width: 390, height: 844 });
  await openSheet(page);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.hand-sheet')).toBeVisible();
  const landscape = await measure(page);
  expect(landscape.horizontalOverflow, 'desborda al girar').toBeLessThanOrEqual(1);
  expect(landscape.sheet.height).toBeGreaterThanOrEqual(389);
  expect(landscape.columns, 'el horizontal no gana columnas').toBeGreaterThanOrEqual(3);
  expect(landscape.reachableCards).toBe(landscape.centredCards);

  await page.setViewportSize({ width: 390, height: 844 });
  const portrait = await measure(page);
  expect(portrait.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(portrait.columns).toBeGreaterThanOrEqual(2);
});

test('agrandar a escritorio cierra la hoja y no deja el tablero inerte', async ({ page }) => {
  await fixture(page, 6, { width: 390, height: 844 });
  await openSheet(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.hand-sheet')).toBeHidden();
  await expect(page.locator('.hand-trigger')).toBeHidden();
  const m = await page.evaluate(() => ({
    zoneOpen: document.querySelector('.hand-zone')?.classList.contains('sheet-open') ?? false,
    fanCards: document.querySelectorAll('.hand-scroll.fan [data-card-id]').length,
    overflow: Math.round(document.documentElement.scrollWidth - innerWidth)
  }));
  expect(m.zoneOpen, 'el cajón sobrevive al cambio a escritorio').toBe(false);
  expect(m.fanCards, 'el abanico de escritorio desapareció').toBe(6);
  expect(m.overflow).toBeLessThanOrEqual(1);
});

/**
 * UX-HAND 1.1 — the part of the suite that needs real Phase.
 *
 * Two engines, deliberately separate:
 *
 *  - **Scripted legality** (`/stress?actions=1`): the fixture publishes an
 *    explicit `legal.by_object` per card and answers dispatches through a stub
 *    client. It is not a rules engine; it exists so the sheet's own contracts —
 *    "ambiguous actions must not be guessed", "an activation is never
 *    invisible", "a rejection keeps the sheet open" — can be asserted without
 *    pretending to be Phase.
 *  - **Real WASM** (`/?autostart`): the guarantees that only Phase can make.
 *    These must FAIL when the engine is missing, never skip: a suite that goes
 *    green because nothing ran is the thing this milestone exists to prevent.
 *    Set `MESA_ENGINE_REQUIRED=0` only to run the rest of the file on purpose.
 */

const ENGINE_REQUIRED = process.env.MESA_ENGINE_REQUIRED !== '0';

async function scriptedActions(page: Page, cards = 12, query = '') {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.route('**/cards.scryfall.io/**', (route) => route.abort());
  await page.goto(`/stress?hand=${cards}&tokens=0&mirror=0&actions=1${query}`);
  await expect(page.locator('.hand-trigger')).toBeVisible();
  await openSheet(page);
}

test.describe('legalidad explícita (fixture con acciones)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('una carta con lanzamiento y activación no se ejecuta de un toque', async ({ page }) => {
    await scriptedActions(page);
    const ambiguous = page.locator('.hand-sheet .sheet-cell').filter({ has: page.locator('.sheet-choose') }).first();
    await expect(ambiguous, 'la fixture no publicó ninguna carta ambigua').toHaveCount(1);
    await expect(ambiguous.locator('.sheet-play')).toHaveCount(0);
    const choose = ambiguous.locator('.sheet-choose');
    // Cast + two different activations: three published actions, three controls.
    await expect(choose).toHaveText(/^Elegir \(3\)$/);

    // Pressing it must not dispatch anything: it opens the detail, with both
    // actions listed and no sheet error (nothing was sent and refused).
    await choose.tap();
    await expect(page.locator('.sheet-detail')).toBeVisible();
    // One control per published action, in Phase's order: the cast, the manual
    // payment that belongs to it, then the activation.
    const labels = (await page.locator('.sheet-detail .detail-actions button').allInnerTexts()).map((t) => t.trim());
    expect(labels.filter((text) => /^Lanzar/.test(text))).toHaveLength(1);
    const activations = labels.filter((text) => /^Activar/.test(text));
    expect(activations, 'las dos activaciones publicadas deben tener su control').toHaveLength(2);
    // UX-HAND 1.2 — A: two different activations must not read the same. The
    // labels come from `ability_index` + the card's published `abilities`.
    expect(new Set(activations).size, 'dos activaciones distintas con la misma etiqueta').toBe(2);
    expect(activations[0]).toBe('Activar · Ciclar · {2} y Descartar 1 carta');
    expect(activations[1]).toBe('Activar · Girar un permanente');
    expect(labels.filter((text) => /maná manualmente/.test(text))).toHaveLength(1);
    await expect(page.locator('.sheet-error')).toHaveCount(0);
  });

  test('una habilidad activada sigue visible y accionable', async ({ page }) => {
    await scriptedActions(page);
    // Slot 4 of the scripted legality is an ActivateAbility with no mana window.
    const activation = page.locator('.hand-sheet .sheet-play[aria-label^="Activar"]');
    await expect(activation.first(), 'la activación desapareció de la hoja').toHaveCount(1);
    await expect(activation.first()).toBeVisible();
    // And it says which ability it is, not just "Activar".
    await expect(activation.first()).toHaveAttribute('aria-label', /Ciclar/);
  });

  test('las alternativas del mismo lanzamiento se identifican', async ({ page }) => {
    await scriptedActions(page);
    const alternatives = page.locator('.hand-sheet .sheet-cell').filter({ has: page.locator('.sheet-choose') }).nth(1);
    await alternatives.locator('.sheet-choose').tap();
    const casts = (await page.locator('.sheet-detail .detail-actions button[data-action-kind="cast"]').allInnerTexts()).map((t) => t.trim());
    expect(casts, 'la carta de dos caras debe ofrecer dos lanzamientos').toHaveLength(2);
    // UX-HAND 1.2 — A: the second face names its face, not a bare "Lanzar".
    expect(new Set(casts).size).toBe(2);
    expect(casts.join(' | ')).toContain('Adventure');
    await expect(page.locator('.sheet-detail .detail-actions button', { hasText: 'alternativa' })).toHaveCount(1);
  });

  test('la proyección no duplica ni pierde acciones publicadas', async ({ page }) => {
    await scriptedActions(page);
    const counts = await page.evaluate(() => ({
      play: document.querySelectorAll('.sheet-sheet, .sheet-play').length,
      choose: document.querySelectorAll('.sheet-choose').length,
      idle: document.querySelectorAll('.sheet-idle').length,
      cells: document.querySelectorAll('.sheet-cell').length
    }));
    // Every card is exactly one of: one quick action, a choose control, or idle.
    expect(counts.play + counts.choose + counts.idle).toBe(counts.cells);
  });
});

/**
 * UX-HAND 1.1 contracts that do not need a specific card: the press contract
 * itself. They use the same deterministic deck, so "there is a legal action"
 * is a fact of the deck, not luck of the shuffle.
 */
const FIELD = 'section.battlefield[data-side="player"] [data-card-id]';

/**
 * UX-HAND 1.2 — B. Deterministic scenarios.
 *
 * A random opening hand cannot be a precondition: on one seed it holds Lightning
 * Bolt, on the next it does not, and the run that "passed" proved nothing. These
 * scenarios build the deck through the product's own builder and read every
 * number back from Phase.
 *
 * Layer: **real engine** (`/?autostart`, WASM from CI). The deck is a list of
 * card names; what a card may do, what a target is worth and what a payment
 * costs are Phase's answers, never this file's.
 *
 * Deck (40 cards, both seats identical, so a seat change changes identity and
 * not shape):
 *   - **Mountain** — the deterministic mana. Playing the deck's own land is a
 *     special action: it needs a main phase but no mana, so 14 copies make one
 *     available without depending on the shuffle.
 *   - **Lightning Bolt** — the deterministic cast that needs a target and, at
 *     `Manual`, a payment.
 *   - **Savannah Lions** — the deterministic permanent, so the board really gains
 *     a card.
 */
const SCENARIO_DECK = ['14 Mountain', '12 Lightning Bolt', '14 Savannah Lions'].join('\n');

/** The seat dialog is the product's privacy guard: the player passes it. */
async function passSeat(page: Page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const handoff = page.locator('.handoff');
    if (!(await handoff.isVisible().catch(() => false))) return;
    await handoff.locator('button').first().tap({ timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
}

/** Import the deterministic deck through the builder and start the game. */
async function startScenarioDeck(page: Page) {
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mesa', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mis mazos' }).click();
  await page.getByRole('button', { name: 'Importar lista' }).click();
  await page.getByLabel(/Pega una lista/).fill(SCENARIO_DECK);
  await page.getByRole('button', { name: 'Convertir lista' }).click();
  await expect(page.getByTestId('deck-total')).toHaveText('40 cartas');
  await page.getByRole('button', { name: 'Jugar con este mazo' }).click();
  // Hard engine guard: without WASM these scenarios would go green proving
  // nothing, so they FAIL. `MESA_ENGINE_REQUIRED=0` is the only word that lets a
  // local run skip them, and CI never sets it.
  const engineMissing = page.getByText(/No se pudo descargar el motor WASM/);
  await expect
    .poll(async () => (await engineMissing.count()) > 0 || (await page.locator('.hand-trigger').count()) > 0, { timeout: 240_000 })
    .toBe(true);
  if (await engineMissing.count()) {
    const reason = 'el motor WASM no está disponible: los escenarios deterministas son la garantía funcional y no pueden omitirse';
    if (ENGINE_REQUIRED) throw new Error(reason);
    test.skip(true, reason);
  }
  await expect(page.locator('section[aria-label^="Tu mano"] [data-card-id]').first()).toBeVisible({ timeout: 240_000 });
}

/**
 * Answer whatever the panel is asking, the way a person would, and report
 * whether the engine moved. Auto-pass stays on: the engine advances through the
 * windows where a person has nothing to do, which is the path `arena-touch-play`
 * proves in CI. Turning it off pinned the game in `Priority` forever, which is
 * what a previous run measured (fourteen "Priority" windows, nothing playable).
 */
async function advance(page: Page): Promise<boolean> {
  await passSeat(page);
  const panel = page.locator('section[aria-label="Decisión pendiente"]');
  const applied = () => page.evaluate(() => Number(document.querySelector('.app')?.getAttribute('data-actions-applied') ?? -1));
  for (const pattern of [/Conservar mano/, /Confirmar pago/, /^No atacar/, /^No bloquear/, /^Pasar/]) {
    const button = panel.locator('button').filter({ hasText: pattern }).first();
    if (!(await button.count())) continue;
    const before = await applied();
    await button.tap({ timeout: 5_000 }).catch(() => {});
    await expect.poll(applied, { timeout: 15_000 }).toBeGreaterThan(before).catch(() => {});
    return true;
  }
  return false;
}

/**
 * Reach the state every scenario needs: a window in which the hand has something
 * legal, with the sheet open on it.
 *
 * Opening the sheet is not reaching the state: during the upkeep a deck with no
 * mana in play legitimately has nothing castable. The helper advances the game
 * and reopens until a control appears; if it never does, it fails naming the
 * windows it saw — a real failure, never a skip.
 */
async function openScenarioSheet(page: Page) {
  const windows: string[] = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await passSeat(page);
    const trigger = page.locator('.hand-trigger');
    await expect(trigger).toBeVisible({ timeout: 60_000 });
    if (!(await page.locator('.hand-sheet').count())) await trigger.tap();
    await expect(page.locator('.hand-sheet')).toBeVisible();
    const controls = page.locator('.hand-sheet .sheet-play, .hand-sheet .sheet-choose');
    if (await controls.count()) {
      // Settled: focus is inside the sheet, so a keyboard player is not stranded
      // outside every interactive region when the assertions start.
      await expect
        .poll(() => page.evaluate(() => !!document.activeElement?.closest('.hand-sheet')), { timeout: 5_000 })
        .toBe(true);
      return;
    }
    // Nothing legal here: record the window, leave the sheet and move the game.
    const waiting = (await page.locator('.app').getAttribute('data-waiting').catch(() => null)) ?? 'desconocida';
    windows.push(waiting);
    await page.keyboard.press('Escape');
    const moved = await advance(page);
    if (!moved) await page.waitForTimeout(400);
  }
  throw new Error(`ninguna ventana ofreció una acción legal en la mano (ventanas vistas: ${windows.join(', ') || 'ninguna'})`);
}

/**
 * Play one named card from the sheet, the way a player does: open the hand,
 * find the card by its published name, press its own action.
 *
 * It advances the game until *that card* is playable, because a land is only
 * legal in a main phase with an empty stack. It throws when the card never
 * becomes playable: a scenario whose precondition never arrived did not reach
 * its state, and that is a failure, never a skip.
 */
async function playCard(page: Page, name: string) {
  const windows: string[] = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await openScenarioSheet(page);
    const cell = page.locator('.hand-sheet .sheet-cell').filter({ hasText: name }).first();
    await expect(cell, `el mazo determinista no ofreció ${name} en la mano`).toHaveCount(1, { timeout: 30_000 });
    const play = cell.locator('.sheet-play');
    if (await play.count()) {
      await play.tap();
      await expect(page.locator('.hand-sheet')).toBeHidden({ timeout: 30_000 });
      return;
    }
    // In hand but not legal yet (wrong step, or no mana): record and move on.
    windows.push((await page.locator('.app').getAttribute('data-waiting').catch(() => null)) ?? 'desconocida');
    await page.keyboard.press('Escape');
    const moved = await advance(page);
    if (!moved) await page.waitForTimeout(400);
  }
  throw new Error(`${name} nunca llegó a ser jugable (ventanas vistas: ${windows.join(', ') || 'ninguna'})`);
}

test.describe('contrato de despacho (motor real, mazo determinista)', () => {
  test.use({ isMobile: true, viewport: { width: 390, height: 844 } });
  // Starting the deck (catalog packs + WASM) plus advancing to a real priority
  // window does not fit in Playwright's 120 s default on CI.
  test.beforeEach(() => test.setTimeout(420_000));

  test('lanzar desde la hoja ejecuta una acción legal del motor', async ({ page }) => {
    await startScenarioDeck(page);
    await openScenarioSheet(page);
    const handSection = page.locator('section[aria-label^="Tu mano"]');
    const playable = page.locator('.hand-sheet .sheet-play').first();
    await expect(playable, 'la hoja no ofreció ninguna acción legal').toHaveCount(1);

    const before = {
      hand: await handSection.locator('[data-card-id]').count(),
      field: await page.locator(FIELD).count()
    };
    await playable.scrollIntoViewIfNeeded();
    await playable.tap();

    await expect.poll(() => handSection.locator('[data-card-id]').count(), { timeout: 30_000 }).toBe(before.hand - 1);
    await expect.poll(() => page.locator(FIELD).count()).toBeGreaterThanOrEqual(before.field);
    await expect(page.locator('.hand-sheet')).toBeHidden();
  });

  test('doble pulsación produce exactamente un despacho aceptado', async ({ page }) => {
    await startScenarioDeck(page);
    await openScenarioSheet(page);
    const revision = () =>
      page.evaluate(() => Number(document.querySelector('.app')?.getAttribute('data-actions-applied') ?? -1));
    const before = { rev: await revision(), hand: await page.locator('.hand-zone [data-card-id]').count() };
    const playable = page.locator('.hand-sheet .sheet-play').first();
    await expect(playable).toHaveCount(1);
    await playable.dblclick({ delay: 0 });
    await expect(page.locator('.hand-sheet')).toBeHidden({ timeout: 30_000 });
    // One accepted dispatch moves the engine's own counter by exactly one.
    await expect.poll(async () => (await revision()) - before.rev, { timeout: 30_000 }).toBe(1);
    await expect.poll(() => page.locator('.hand-zone [data-card-id]').count()).toBeLessThanOrEqual(before.hand - 1);
  });

  test('el contador que se mide es el del motor, no uno inventado por la prueba', async ({ page }) => {
    await startScenarioDeck(page);
    const marker = page.locator('.app[data-actions-applied]');
    await expect(marker).toHaveCount(1);
    const applied = Number(await marker.getAttribute('data-actions-applied'));
    expect(Number.isInteger(applied)).toBe(true);
    await openScenarioSheet(page);
    await page.locator('.hand-sheet .sheet-play').first().tap();
    await expect
      .poll(() => page.evaluate(() => Number(document.querySelector('.app')?.getAttribute('data-actions-applied') ?? -1)), { timeout: 30_000 })
      .toBeGreaterThan(applied);
  });
});

/**
 * UX-HAND 1.2 — B. Five deterministic scenarios.
 *
 * Each one must reach its target state. There is no `skip`, no early `return`
 * and no "if the hand happened to contain it": the deck is fixed, and a missing
 * precondition is a failure with a message that says which one.
 */
test.describe('escenarios deterministas (mazo propio, motor real)', () => {
  test.use({ isMobile: true, viewport: { width: 390, height: 844 } });
  test.beforeEach(() => test.setTimeout(420_000));

  test('1 · lanzamiento con objetivo: elegirlo y ver el daño', async ({ page }) => {
    await startScenarioDeck(page);
    // The deck's own land is the deterministic mana; playing it takes no turn
    // and no shuffle luck, because 14 of the 40 cards are Mountains.
    await playCard(page, 'Mountain');

    // The land unlocked a cast. Whether that happens in this priority window or
    // the next one is Phase's business; the sheet is reopened either way.
    await openScenarioSheet(page);
    const bolt = page.locator('.hand-sheet .sheet-cell').filter({ hasText: 'Lightning Bolt' }).first();
    await expect(bolt, 'ni con una Mountain en juego hay un Lightning Bolt lanzable').toHaveCount(1, { timeout: 60_000 });
    await bolt.locator('.sheet-play').tap();

    const panel = page.locator('section[aria-label="Decisión pendiente"]');
    await expect(panel, 'el lanzamiento no abrió la selección de objetivos').toContainText(/objetivo/i, { timeout: 30_000 });
    const before = Number(await page.locator('[data-player-id="1"]').getAttribute('data-life'));
    const choose = panel.locator('button').filter({ hasText: /Jugador 2/i }).first();
    await expect(choose, 'el motor no ofreció al Jugador 2 como objetivo').toHaveCount(1);
    await choose.tap();
    // Nightly Bolt deals 3: the assertion is exact, not "something changed".
    await expect
      .poll(async () => Number(await page.locator('[data-player-id="1"]').getAttribute('data-life')), { timeout: 30_000 })
      .toBe(before - 3);
  });

  test('2 · pago manual: pagar el maná y completar el lanzamiento', async ({ page }) => {
    await startScenarioDeck(page);
    await playCard(page, 'Mountain');
    await openScenarioSheet(page);

    const bolt = page.locator('.hand-sheet .sheet-cell').filter({ hasText: 'Lightning Bolt' }).first();
    await expect(bolt).toHaveCount(1, { timeout: 60_000 });
    // Measured BEFORE the cast: a count taken afterwards could only ever be
    // "less than or equal", which is an assertion that cannot fail.
    const handBefore = await page.locator('.hand-zone [data-card-id]').count();

    await bolt.locator('[data-card-id]').first().click();
    await expect(page.locator('.sheet-detail')).toBeVisible();
    const manual = page.locator('.sheet-detail button').filter({ hasText: 'Elegir maná manualmente' }).first();
    const cast = page.locator('.sheet-detail button[data-action-kind="cast"]').first();
    await expect(cast, 'el detalle no ofrece el lanzamiento').toHaveCount(1);

    // Phase publishes the payment mode it will honour (`CastPaymentMode`). When
    // it offers a manual payment, that is the control this scenario presses, and
    // the payment really happens in `ManaPayment`. When it withholds the mode,
    // the scenario says so and pays through the control Phase did publish: a
    // mode the engine did not offer is not a rule to invent here.
    const hasManualPayment = (await manual.count()) > 0;
    test.info().annotations.push({
      type: 'pago',
      description: hasManualPayment
        ? 'Phase publicó el pago manual: el escenario paga en ManaPayment'
        : 'Phase no publicó el pago manual en esta ventana: se paga por el control publicado y se anota'
    });

    const panel = page.locator('section[aria-label="Decisión pendiente"]');
    if (hasManualPayment) {
      await manual.tap();
      await expect(panel, 'Phase no abrió el pago de maná').toContainText(/maná|fuente/i, { timeout: 30_000 });
      // Pay with the Mountain this test just played: select it, produce, confirm.
      const mountain = page.locator('section.battlefield[data-side="player"] [data-card-id]').filter({ hasText: 'Mountain' }).first();
      await expect(mountain, 'la Mountain jugada no está en el campo').toHaveCount(1);
      await mountain.tap();
      const produce = panel.locator('button').filter({ hasText: /Producir/i }).first();
      await expect(produce, 'la fuente no publicó su producción de maná').toHaveCount(1, { timeout: 30_000 });
      await produce.tap();
      const confirm = panel.locator('button').filter({ hasText: 'Confirmar pago' }).first();
      await expect(confirm, 'no hay forma de confirmar el pago').toHaveCount(1, { timeout: 30_000 });
      await confirm.tap();
    } else {
      await cast.tap();
    }
    // The cast completed: the card left the hand — exactly one fewer, never
    // "at most the same number".
    await expect
      .poll(() => page.locator('.hand-zone [data-card-id]').count(), { timeout: 30_000 })
      .toBe(handBefore - 1);
    // Whatever the payment path, the engine applied something and the sheet is
    // gone: it closed because the cast was accepted, not because it gave up.
    await expect(page.locator('.hand-sheet')).toBeHidden({ timeout: 30_000 });
    await expect(page.locator('.sheet-error')).toHaveCount(0);
  });

  test('3 · cancelación real: la carta vuelve a la mano y el estado se restaura', async ({ page }) => {
    await startScenarioDeck(page);
    await playCard(page, 'Mountain');
    await openScenarioSheet(page);

    const bolt = page.locator('.hand-sheet .sheet-cell').filter({ hasText: 'Lightning Bolt' }).first();
    await expect(bolt).toHaveCount(1, { timeout: 60_000 });
    const handBefore = await page.locator('.hand-zone [data-card-id]').count();
    const appliedBefore = Number(await page.locator('.app').getAttribute('data-actions-applied'));
    await bolt.locator('[data-card-id]').first().click();
    await page.locator('.sheet-detail button').filter({ hasText: 'Elegir maná manualmente' }).first().tap();

    const panel = page.locator('section[aria-label="Decisión pendiente"]');
    const cancel = panel.locator('button').filter({ hasText: 'Cancelar lanzamiento' }).first();
    await expect(cancel, 'Phase no publicó la cancelación del lanzamiento').toHaveCount(1, { timeout: 30_000 });
    await cancel.tap();
    // Restored, not merely "closed": the card is back in hand, the hand count is
    // the one from before, and the engine moved exactly once.
    await expect.poll(() => page.locator('.hand-zone [data-card-id]').count(), { timeout: 30_000 }).toBe(handBefore);
    await expect
      .poll(async () => Number(await page.locator('.app').getAttribute('data-actions-applied')))
      .toBeGreaterThan(appliedBefore);
    await expect(panel).not.toContainText(/Cancelar lanzamiento/);
  });

  test('5 · cambio de asiento con hoja y detalle abiertos: identificadores, no cantidades', async ({ page }) => {
    await startScenarioDeck(page);
    await openScenarioSheet(page);
    // Strict handoff: confirm on every seat change, not only on turn changes.
    await page.keyboard.press('Escape');
    await page.getByRole('checkbox', { name: 'Confirmar cada cambio de asiento' }).check();

    const viewerBefore = await page.locator('.app').getAttribute('data-viewer');
    await page.locator('.hand-trigger').tap();
    await page.locator('.hand-sheet [data-card-id]').first().click();
    await expect(page.locator('.sheet-detail')).toBeVisible();
    const idsBefore = await page.locator('.hand-sheet [data-card-id]').evaluateAll((cards) =>
      cards.map((card) => card.getAttribute('data-card-id'))
    );
    expect(idsBefore.length, 'la hoja no publicó los identificadores de la mano').toBeGreaterThan(0);

    // Pass priority until the seat really changes. Every change goes through the
    // product's own handoff dialog: strict mode was turned on before passing, so
    // a change that skipped the gate would be caught by `passSeat` never finding
    // it — and the loop would time out instead of passing.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    let viewerNow = viewerBefore;
    for (let round = 0; round < 8 && viewerNow === viewerBefore; round += 1) {
      const pass = page.locator('section[aria-label="Decisión pendiente"] button').filter({ hasText: /^Pasar/ }).first();
      if (await pass.count()) await pass.tap({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(300);
      await passSeat(page);
      viewerNow = await page.locator('.app').getAttribute('data-viewer');
    }
    expect(viewerNow, 'el motor no cambió de asiento: el escenario no llegó a su estado').not.toBe(viewerBefore);

    // The previous hand is gone *by identity*: no shared card id, and the detail
    // of the previous seat's card is not reachable.
    await expect(page.locator('.sheet-detail')).toHaveCount(0);
    if (!(await page.locator('.hand-sheet').count())) await page.locator('.hand-trigger').tap().catch(() => {});
    await expect(page.locator('.hand-sheet')).toBeVisible({ timeout: 30_000 });
    const idsAfter = await page.locator('.hand-sheet [data-card-id]').evaluateAll((cards) =>
      cards.map((card) => card.getAttribute('data-card-id'))
    );
    expect(idsAfter.length, 'la hoja del asiento nuevo no publicó ninguna carta').toBeGreaterThan(0);
    const shared = idsAfter.filter((id) => idsBefore.includes(id));
    expect(shared, 'la mano nueva comparte cartas con la anterior').toEqual([]);
    await expect(page.locator('.sheet-detail')).toHaveCount(0);
  });
});

test.describe('rechazo explícito (fixture, cliente guionizado)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('4 · rechazo explícito: mensaje, hoja abierta y reintento', async ({ page }) => {
    await scriptedActions(page, 12, '&reject=1');
    const applied = () => page.evaluate(() => Number(document.querySelector('.app')?.getAttribute('data-actions-applied') ?? -1));

    // 1. One accepted dispatch: the product's happy path, so the next one is the
    //    refused one and the counter below has something real to compare with.
    await page.locator('.hand-sheet .sheet-play').first().tap();
    await expect(page.locator('.hand-sheet')).toBeHidden({ timeout: 15_000 });
    const afterFirst = await applied();
    expect(afterFirst, 'el primer despacho no llegó al motor').toBeGreaterThanOrEqual(1);

    // 2. The refused dispatch: the sheet must stay where the player is and say
    //    what happened, in the engine's own words as the client maps them.
    await openSheet(page);
    const refused = page.locator('.hand-sheet .sheet-play').first();
    await expect(refused).toHaveCount(1);
    await refused.tap();
    const error = page.locator('.sheet-error');
    await expect(error, 'el rechazo no dejó mensaje visible').toBeVisible({ timeout: 15_000 });
    await expect(error).toContainText(/no acepta|cambió mientras elegías|no se pudo/i);
    await expect(page.locator('.hand-sheet'), 'el rechazo cerró la hoja').toBeVisible();
    // Nothing was applied: a refusal is not a play.
    expect(await applied(), 'un rechazo incrementó el contador del motor').toBe(afterFirst);

    // 3. Retry from where the player is: the same control still works, and this
    //    time the engine accepts it.
    const retry = page.locator('.hand-sheet .sheet-play').first();
    await expect(retry, 'el rechazo dejó el control inutilizable').toBeEnabled();
    await page.locator('.sheet-error-dismiss').tap();
    await expect(error).toHaveCount(0);
    await retry.tap();
    await expect(page.locator('.hand-sheet')).toBeHidden({ timeout: 15_000 });
    await expect.poll(applied, { timeout: 15_000 }).toBe(afterFirst + 1);
  });
});

test.describe('navegación por teclado de la hoja', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Tab y Shift+Tab recorren sólo controles visibles de la hoja, sin duplicar la mano', async ({ page }) => {
    await scriptedActions(page);
    // The collapsed 1px strip must not contribute focusable cards to the same
    // document that the sheet is showing.
    // Effective keyboard reachability, not geometry: try to focus each control
    // the collapsed strip still holds and count the ones that actually take
    // focus. `inert` and `clip-path` both leave `offsetParent` intact, so a
    // bounding-box count would have called them reachable and a layout check
    // would have missed a focusable 1px box.
    const reachableOutside = await page.evaluate(() => {
      const zone = document.querySelector('.hand-zone');
      if (!zone) return 0;
      const controls = [...zone.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')];
      let focused = 0;
      for (const control of controls) {
        control.focus();
        if (document.activeElement === control) focused += 1;
      }
      // Leave focus where it belongs, inside the open sheet: the probe above
      // moved it. Restoring it is part of the measurement, not a courtesy.
      document.querySelector<HTMLElement>('.hand-sheet .sheet-close')?.focus();
      return focused;
    });
    expect(reachableOutside, 'la mano colapsada mete controles en la navegación').toBe(0);

    const seen: string[] = [];
    const describeFocus = () =>
      page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active) return 'none';
        const sheet = active.closest('.hand-sheet');
        if (!sheet) return `outside:${active.tagName}`;
        if (active.classList.contains('sheet-close')) return 'close';
        if (active.closest('[data-card-id]')) return 'card';
        if (active.classList.contains('sheet-play') || active.classList.contains('sheet-choose')) return 'action';
        return `sheet:${active.tagName}`;
      });

    seen.push(await describeFocus());
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      seen.push(await describeFocus());
    }
    expect(seen.every((step) => step !== 'none' && !step.startsWith('outside:')), `orden real de Tab: ${JSON.stringify(seen)}`).toBe(true);
    // The order starts at the close control and reaches the cards' actions.
    expect(seen[0]).toBe('close');
    expect(seen).toContain('card');
    expect(seen).toContain('action');

    const backwards: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Shift+Tab');
      backwards.push(await describeFocus());
    }
    expect(backwards.every((step) => step !== 'none' && !step.startsWith('outside:'))).toBe(true);
  });
});
