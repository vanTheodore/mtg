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

/** Load a raw engine state emitted by Phase's GameScenario runner. */
async function startGameScenario(page: Page, id: string, strictHandoff = false) {
  await page.addInitScript((strict) => {
    localStorage.setItem('mesa:autoPass', 'off');
    localStorage.setItem('mesa:handoffMode', strict ? 'every' : 'turn');
  }, strictHandoff);
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto(`/?e2e-scenario=${id}`);
  await expect(page.locator('.hand-trigger'), `no se montó el estado GameScenario ${id}`).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.app')).toHaveAttribute('data-phase', 'PreCombatMain');
  await expect(page.locator('.app')).toHaveAttribute('data-viewer', '0');
}

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

/** Select a real player target directly from the board, avoiding a collapsed list. */
async function choosePlayerTarget(page: Page, playerNumber: number) {
  const target = page.getByRole('button', { name: new RegExp(`Elegir Jugador ${playerNumber} como objetivo`) });
  await expect(target, `Phase no publicó al Jugador ${playerNumber} como objetivo`).toBeVisible();
  await target.tap();
}

/** Pass one actual priority window through the rendered legal action. */
async function passPriority(page: Page) {
  const pass = page.locator('section[aria-label="Decisión pendiente"] button:visible').filter({ hasText: /^Pasar/ }).first();
  await expect(pass, 'Phase no publicó Pasar prioridad').toBeVisible();
  await pass.tap();
  await expect(page.locator('.app')).toHaveAttribute('data-busy', 'false');
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
  // Auto-pass OFF, and verified: it hides the priority window the scenarios act
  // in, and with it on a test races the engine — the CI run of 45592511329
  // measured exactly that, a control that appeared and was gone before the click
  // landed. Off, every window is answered on purpose by `waitForMain`.
  const autoPass = page.getByRole('checkbox', { name: 'Auto-pasar ventanas sin acciones' });
  await autoPass.uncheck();
  await expect(autoPass).not.toBeChecked();
}

/**
 * Advance to a main phase, deterministically.
 *
 * `data-waiting` is the *decision* the engine is asking for, not the step: it
 * reads `Priority` in every priority window of the turn, upkeep and main phase
 * alike. A CI run of 473c598 proved the consequence — the loop never recognised
 * a main phase, passed priority through the whole turn, hit `DiscardToHandSize`
 * and repeated. The step is published too (`data-phase`), and it is the step the
 * assertion reads.
 *
 * Auto-pass is off for these scenarios, so every window waits for us; nothing
 * moves behind the test's back. Fails — never skips — naming the windows it
 * went through.
 */
const MAIN_PHASES = ['PreCombatMain', 'PostCombatMain'];

async function waitForMain(page: Page, budget = 120_000) {
  const deadline = Date.now() + budget;
  const seen: string[] = [];
  const panel = page.locator('section[aria-label="Decisión pendiente"]');
  const state = () =>
    page.evaluate(() => {
      const app = document.querySelector('.app');
      const context = document.querySelector<HTMLElement>('[data-decision-context]');
      const line = document.querySelector('section[aria-label="Decisión pendiente"] .phase')?.textContent ?? '';
      const viewer = Number(app?.getAttribute('data-viewer') ?? -1);
      // DecisionContext publishes the engine's seats. The old regex read the
      // first «Jugador N» in the line, which is the active player, not always
      // the viewer; a strict handoff could swap the visible seat before the
      // helper measured it. «Main» means our own main phase, not that we also
      // hold priority in it: a response window belongs to the other seat.
      const active = Number(context?.getAttribute('data-active-player') ?? -1);
      const priority = Number(context?.getAttribute('data-priority-player') ?? -1);
      const viewerPriority = context?.getAttribute('data-viewer-priority') === 'true';
      const activeFromLine = /Jugador\s+(\d+)/.exec(line)?.[1];
      const mine = active >= 0
        ? active === viewer
        : activeFromLine === undefined
          ? viewerPriority
          : Number(activeFromLine) - 1 === viewer;
      return {
        waiting: app?.getAttribute('data-waiting') ?? 'desconocida',
        phase: app?.getAttribute('data-phase') ?? 'desconocida',
        viewer, active, priority, viewerPriority, mine,
        line: line.trim().replace(/\s+/g, ' ').slice(0, 120)
      };
    });
  while (Date.now() < deadline) {
    // A strict seat dialog makes the board inert; dismiss it before reading the
    // decision or trying to press one of its controls.
    await passSeat(page);
    const now = await state();
    // Our own main phase: in the opponent's we hold no priority and no card of
    // ours is legal, so returning there would only make the caller spin.
    if (MAIN_PHASES.includes(now.phase) && now.mine) return now.phase;
    const label = `${now.phase}/${now.waiting}${now.mine ? '' : ' (ajeno)'}`;
    if (!seen.includes(label)) seen.push(label);
    const keep = panel.locator('button:visible').filter({ hasText: /Conservar|^Mantener/ }).or(
      page.locator('button[aria-label*="Conservar"]')
    ).first();
    const pass = panel.locator('button:visible').filter({ hasText: /^Pasar/ }).first();
    if (await keep.count()) {
      await keep.tap({ timeout: 5_000 }).catch(() => {});
    } else if (now.waiting === 'DiscardToHandSize') {
      // CR 514.1 asks for an exact number of cards: mark that many, then confirm
      // with the prompt's own button — the count is the engine's, not ours.
      const prompt = page.locator('[data-discard="cleanup"]');
      if (await prompt.count()) {
        const cards = prompt.locator('li, button');
        const needed = (await prompt.innerText()).match(/\((\d+)\/(\d+)\)/);
        const count = needed ? Number(needed[2]) : 1;
        for (let i = 0; i < count; i += 1) await cards.nth(i).tap({ timeout: 5_000 }).catch(() => {});
        const confirm = prompt.locator('button.primary').first();
        if (await confirm.count()) await confirm.tap({ timeout: 5_000 }).catch(() => {});
      }
    } else if (await pass.count()) {
      await pass.tap({ timeout: 5_000 }).catch(() => {});
    }
    await page.waitForTimeout(120);
  }
  const last = await state();
  throw new Error(
    `no se llegó a una fase principal (ventanas vistas: ${seen.join(', ') || 'ninguna'}; ` +
    `último: ${last.phase}/${last.waiting}, viewer=${last.viewer}, activo=${last.active}, ` +
    `prioridad=${last.priority}, viewerPriority=${last.viewerPriority}, línea="${last.line}")`
  );
}

/**
 * Reach the state every scenario needs: a main phase, the sheet open on the
 * active seat's hand, and at least one published control.
 */
async function openScenarioSheet(page: Page) {
  await waitForMain(page);
  const trigger = page.locator('.hand-trigger');
  await expect(trigger).toBeVisible({ timeout: 60_000 });
  if (!(await page.locator('.hand-sheet').count())) await trigger.tap();
  await expect(page.locator('.hand-sheet')).toBeVisible();
  // An empty hand is not a scenario: the sheet must publish cards. Which control
  // each one gets is Phase's business — the scenario asserts its own card.
  await expect
    .poll(() => page.locator('.hand-sheet .sheet-cell').count(), { timeout: 30_000 })
    .toBeGreaterThan(0);
  // Settled: focus is inside the sheet, so a keyboard player is not stranded
  // outside every interactive region when the assertions start.
  await expect
    .poll(() => page.evaluate(() => !!document.activeElement?.closest('.hand-sheet')), { timeout: 5_000 })
    .toBe(true);
}

/**
 * Play one named card from the sheet, the way a player does: open the hand, find
 * the card by its published name, press its own action.
 *
 * It reaches a main phase first — a land is only legal there — and throws when
 * the card never becomes playable: a scenario whose precondition never arrived
 * did not reach its state, and that is a failure, never a skip.
 */
async function playCard(page: Page, name: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await openScenarioSheet(page);
    const cell = page.locator('.hand-sheet .sheet-cell').filter({ hasText: name }).first();
    await expect(cell, `el mazo determinista no ofreció ${name} en la mano`).toHaveCount(1, { timeout: 30_000 });
    const play = cell.locator('.sheet-play');
    if (await play.count()) {
      await play.tap();
      await expect(page.locator('.hand-sheet')).toBeHidden({ timeout: 30_000 });
      return;
    }
    // In hand but not legal in this window: leave the sheet and move the game on.
    await page.keyboard.press('Escape');
    const panel = page.locator('section[aria-label="Decisión pendiente"]');
    const pass = panel.locator('button:visible').filter({ hasText: /^Pasar/ }).first();
    if (await pass.count()) await pass.tap({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
  throw new Error(`${name} nunca llegó a ser jugable en una fase principal`);
}

test.describe('contrato de despacho (motor real, mazo determinista)', () => {
  test.use({ isMobile: true, viewport: { width: 390, height: 844 } });
  // Starting the deck (catalog packs + WASM) plus advancing to a real priority
  // window does not fit in Playwright's 120 s default on CI.
  test.beforeEach(() => test.setTimeout(420_000));

  test('lanzar desde la hoja ejecuta una acción legal del motor', async ({ page }) => {
    await startScenarioDeck(page);
    await openScenarioSheet(page);
    const applied = () => page.evaluate(() => Number(document.querySelector('.app')?.getAttribute('data-actions-applied') ?? -1));
    const handSection = page.locator('section[aria-label^="Tu mano"]');
    // A land is the one card whose play is legal in a main phase with no mana, so
    // the contract is measured on it: press its own control, and the engine —
    // not the test — says whether it happened.
    const cell = page.locator('.hand-sheet .sheet-cell').filter({ hasText: 'Mountain' }).first();
    await expect(cell, 'la hoja no ofreció la Mountain del mazo').toHaveCount(1);
    const playable = cell.locator('.sheet-play');
    await expect(playable).toHaveCount(1);

    const before = { applied: await applied(), hand: await handSection.locator('[data-card-id]').count() };
    await playable.scrollIntoViewIfNeeded();
    await playable.tap();

    await expect.poll(applied, { timeout: 30_000 }).toBe(before.applied + 1);
    await expect.poll(() => handSection.locator('[data-card-id]').count(), { timeout: 30_000 }).toBe(before.hand - 1);
    await expect(page.locator('.hand-sheet')).toBeHidden();
  });

  test('doble pulsación produce exactamente un despacho aceptado', async ({ page }) => {
    await startScenarioDeck(page);
    await openScenarioSheet(page);
    const applied = () => page.evaluate(() => Number(document.querySelector('.app')?.getAttribute('data-actions-applied') ?? -1));
    const handSection = page.locator('section[aria-label^="Tu mano"]');
    const playable = page.locator('.hand-sheet .sheet-cell').filter({ hasText: 'Mountain' }).first().locator('.sheet-play');
    await expect(playable).toHaveCount(1);
    const before = { applied: await applied(), hand: await handSection.locator('[data-card-id]').count() };
    await playable.dblclick({ delay: 0 });
    await expect(page.locator('.hand-sheet')).toBeHidden({ timeout: 30_000 });
    // Exactly one accepted dispatch: the engine's own counter moves by one, and
    // exactly one card left the hand.
    await expect.poll(applied, { timeout: 30_000 }).toBe(before.applied + 1);
    await expect.poll(() => handSection.locator('[data-card-id]').count()).toBe(before.hand - 1);
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
 * Each one starts from a Phase GameScenario fixture emitted by the native
 * runner, with its hand, phase and mana already arranged. There is no `skip`,
 * no draw loop and no fallback path: missing state/control/action is a failure.
 */
test.describe('escenarios deterministas (Phase GameScenario, motor real)', () => {
  test.use({ isMobile: true, viewport: { width: 390, height: 844 } });

  test('1 · lanzamiento con objetivo: elegirlo y ver el daño', async ({ page }) => {
    await startGameScenario(page, 'target-cast');
    await openScenarioSheet(page);
    const bolt = page.locator('.hand-sheet .sheet-cell').filter({ hasText: 'Lightning Bolt' }).first();
    await expect(bolt.locator('.sheet-play'), 'Phase no publicó el lanzamiento en el estado preparado').toHaveCount(1);
    const before = Number(await page.locator('[data-player-id="1"]').getAttribute('data-life'));
    await bolt.locator('.sheet-play').tap();

    const app = page.locator('.app');
    await expect(app).toHaveAttribute('data-waiting', 'TargetSelection');
    await choosePlayerTarget(page, 2);
    await expect(app).toHaveAttribute('data-waiting', 'Priority');
    await expect(page.locator('[data-player-id="0"] .mana-pool')).toHaveAttribute('aria-label', 'Maná disponible: 0');

    // Auto-pass is deliberately off in GameScenario tests. Let both players
    // receive and pass the real priority window so Phase resolves the stack.
    await passPriority(page);
    await expect(app).toHaveAttribute('data-viewer', '1');
    await passPriority(page);
    await expect
      .poll(async () => Number(await page.locator('[data-player-id="1"]').getAttribute('data-life')))
      .toBe(before - 3);
  });

  test('2 · pago manual: pagar el maná y completar el lanzamiento', async ({ page }) => {
    await startGameScenario(page, 'manual-payment');
    const handBefore = await page.locator('.hand-zone [data-card-id]').count();
    await openScenarioSheet(page);
    const bolt = page.locator('.hand-sheet .sheet-cell').filter({ hasText: 'Lightning Bolt' }).first();
    await expect(bolt).toHaveCount(1);
    await bolt.locator('[data-card-id]').first().click();
    const detail = page.locator('.sheet-detail');
    await expect(detail).toBeVisible();
    const manual = detail.locator('button').filter({ hasText: 'Elegir maná manualmente' });
    await expect(manual, 'la prueba requiere y no sustituye el modo de pago manual').toHaveCount(1);
    await manual.tap();

    const app = page.locator('.app');
    // CR 601.2c chooses targets before CR 601.2h pays costs.
    await expect(app).toHaveAttribute('data-waiting', 'TargetSelection');
    await choosePlayerTarget(page, 2);
    await expect(app).toHaveAttribute('data-waiting', 'ManaPayment');

    // One legal mana action is dispatched by session.selectObject itself.
    // Tapping the real Mountain must turn it and add red mana without a second,
    // redundant "Produce red" button.
    const mountain = page.locator('section.battlefield[data-side="player"] [data-card-id]').filter({ hasText: 'Mountain' }).first();
    await expect(mountain, 'el estado preparado no tiene su fuente real de maná').toHaveCount(1);
    await mountain.tap();
    await expect(mountain).toHaveClass(/tapped/);
    await expect(page.locator('[data-player-id="0"] [aria-label="Rojo: 1"]')).toBeVisible();
    await expect(app).toHaveAttribute('data-waiting', 'ManaPayment');

    const panel = page.locator('section[aria-label="Decisión pendiente"]');
    const confirm = panel.getByRole('button', { name: 'Confirmar pago' });
    await expect(confirm).toBeVisible();
    await confirm.tap();
    await expect(app).toHaveAttribute('data-waiting', 'Priority');
    await expect(page.locator('[data-player-id="0"] .mana-pool')).toHaveAttribute('aria-label', 'Maná disponible: 0');
    await expect.poll(() => page.locator('.hand-zone [data-card-id]').count()).toBe(handBefore - 1);
    await expect(page.locator('.sheet-error')).toHaveCount(0);
  });

  test('3 · cancelación real: la carta vuelve a la mano y el estado se restaura', async ({ page }) => {
    await startGameScenario(page, 'cancel-cast');
    const handBefore = await page.locator('.hand-zone [data-card-id]').count();
    const appliedBefore = Number(await page.locator('.app').getAttribute('data-actions-applied'));
    await openScenarioSheet(page);
    const bolt = page.locator('.hand-sheet .sheet-cell').filter({ hasText: 'Lightning Bolt' }).first();
    await bolt.locator('[data-card-id]').first().click();
    const manual = page.locator('.sheet-detail button').filter({ hasText: 'Elegir maná manualmente' });
    await expect(manual).toHaveCount(1);
    await manual.tap();
    const app = page.locator('.app');
    await expect(app).toHaveAttribute('data-waiting', 'TargetSelection');
    await choosePlayerTarget(page, 2);
    await expect(app).toHaveAttribute('data-waiting', 'ManaPayment');

    const panel = page.locator('section[aria-label="Decisión pendiente"]');
    const cancel = panel.locator('button').filter({ hasText: 'Cancelar lanzamiento' });
    await expect(cancel, 'Phase no publicó la cancelación del lanzamiento').toHaveCount(1);
    await cancel.tap();
    await expect.poll(() => page.locator('.hand-zone [data-card-id]').count()).toBe(handBefore);
    await expect.poll(async () => Number(await page.locator('.app').getAttribute('data-actions-applied'))).toBeGreaterThan(appliedBefore);
    await expect(panel).not.toContainText(/Cancelar lanzamiento/);
    const mountain = page.locator('section.battlefield[data-side="player"] [data-card-id]').filter({ hasText: 'Mountain' }).first();
    await expect(mountain).not.toHaveClass(/tapped/);
    await expect(page.locator('[data-player-id="0"] .mana-pool')).toHaveAttribute('aria-label', 'Maná disponible: 0');
  });

  test('5 · cambio de asiento mientras hoja y detalle están abiertos: comparar identificadores', async ({ page }) => {
    await startGameScenario(page, 'privacy-handoff', true);
    const viewerBefore = await page.locator('.app').getAttribute('data-viewer');
    await openScenarioSheet(page);
    const oldIds = await page.locator('.hand-sheet [data-card-id]').evaluateAll((cards) =>
      cards.map((card) => card.getAttribute('data-card-id'))
    );
    expect(oldIds, 'el estado GameScenario no preparó la mano privada inicial').toEqual([expect.any(String)]);
    const card = page.locator('.hand-sheet .sheet-cell').filter({ hasText: 'Lightning Bolt' }).first().locator('[data-card-id]').first();
    await card.click();
    await expect(page.locator('.hand-sheet')).toBeVisible();
    await expect(page.locator('.sheet-detail'), 'el cambio debe comenzar con el detalle abierto').toBeVisible();

    // This test-only signal dispatches a genuine Phase PassPriority through the
    // app session while both presentation layers are open. The delayed E2E worker
    // makes the in-flight state observable; strict handoff then covers the new
    // seat and prevents either old hand content or its detail from leaking.
    await page.evaluate(() => window.dispatchEvent(new Event('mesa:e2e-pass-priority')));
    await expect(page.locator('.app')).toHaveAttribute('data-busy', 'true', { timeout: 5_000 });
    await expect(page.locator('.hand-sheet')).toBeVisible();
    await expect(page.locator('.sheet-detail'), 'el detalle debe seguir visible mientras el pase está en vuelo').toBeVisible();
    await expect(page.locator('.app')).toHaveAttribute('data-viewer', '0');
    await expect(page.locator('.app')).toHaveAttribute('data-viewer', '1', { timeout: 15_000 });
    expect(await page.locator('.app').getAttribute('data-viewer')).not.toBe(viewerBefore);
    await expect(page.locator('.handoff'), 'el cambio real debe activar el handoff estricto').toBeVisible();
    await expect(page.locator('.hand-sheet'), 'la mano anterior debe quedar cubierta en el handoff').toHaveCount(0);
    await expect(page.locator('.sheet-detail'), 'el detalle anterior no debe sobrevivir al cambio').toHaveCount(0);
    await passSeat(page);
    await openScenarioSheet(page);
    const newIds = await page.locator('.hand-sheet [data-card-id]').evaluateAll((cards) =>
      cards.map((item) => item.getAttribute('data-card-id'))
    );
    expect(newIds.length, 'el asiento nuevo no publicó sus cartas').toBeGreaterThan(0);
    expect(newIds.filter((id) => oldIds.includes(id)), 'la hoja mostró una identidad de carta del asiento anterior').toEqual([]);
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
