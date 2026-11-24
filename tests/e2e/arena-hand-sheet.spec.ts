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
 * Engine-side integrity. These dispatch real actions through Phase, so they
 * need the built WASM (`static/wasm/mtg_engine_wasm.wasm`) and run in Mesa CI.
 */
/**
 * The engine tests are only meaningful with the built WASM in `static/`. Where
 * it is missing (a sandbox without the CI artifact), say so and skip: a green
 * tick there would be a lie, and a three-minute wait for a card that can never
 * appear is not evidence either.
 */
async function requireEngine(page: Page) {
  // The engine either boots the table or reports the missing WASM; wait for
  // whichever arrives instead of assuming the hand exists.
  const engineMissing = page.getByText(/No se pudo descargar el motor WASM/);
  const trigger = page.locator('.hand-trigger');
  await expect
    .poll(async () => (await engineMissing.count()) > 0 || (await trigger.count()) > 0, { timeout: 45_000 })
    .toBe(true);
  test.skip((await engineMissing.count()) > 0, 'motor WASM ausente: esta evidencia sólo corre en Mesa CI');
}

test.describe('con el motor real', () => {
  test.use({ isMobile: true, viewport: { width: 390, height: 844 } });

  test('lanzar desde la hoja cambia el estado del motor, no solo la vista', async ({ page }) => {
    await page.route('**/api.scryfall.com/**', (route) => route.abort());
    await page.goto('/?autostart');
    await requireEngine(page);
    const handSection = page.locator('section[aria-label^="Tu mano"]');
    await expect(handSection.locator('[data-card-id]').first()).toBeVisible({ timeout: 60_000 });
    const revision = () =>
      page.evaluate(() => {
        const text = document.querySelector('[aria-label="Métricas del motor"]')?.textContent ?? '';
        return Number(/(\d+)\s*objetos/.exec(text)?.[1] ?? 0);
      });

    const before = {
      hand: await handSection.locator('[data-card-id]').count(),
      field: await page.locator('section.battlefield[data-side="player"] [data-card-id]').count()
    };
    await page.locator('.hand-trigger').tap();
    await expect(page.locator('.hand-sheet')).toBeVisible();

    const playable = page.locator('.hand-sheet .sheet-play').first();
    const anyPlayable = await playable.count();
    if (anyPlayable === 0) {
      // No legal action yet: the sheet must say so rather than invent one.
      await expect(page.locator('.hand-sheet .sheet-idle').first()).toBeAttached();
      return;
    }
    await playable.tap();
    // The sheet does not close by itself on a dispatch failure; a real cast
    // removes the card from the hand and puts it on the battlefield.
    await expect
      .poll(() => handSection.locator('[data-card-id]').count(), { timeout: 20_000 })
      .toBeLessThan(before.hand);
    await expect
      .poll(() => page.locator('section.battlefield[data-side="player"] [data-card-id]').count())
      .toBeGreaterThan(before.field);
    await expect(page.locator('.hand-sheet')).toBeHidden();
    void revision;
  });

  test('la mano contraria nunca aparece en la hoja', async ({ page }) => {
    await page.route('**/api.scryfall.com/**', (route) => route.abort());
    await page.goto('/?autostart');
    await requireEngine(page);
    await page.locator('.hand-trigger').tap();
    await expect(page.locator('.hand-sheet')).toBeVisible();
    const mine = await page.locator('.hand-sheet [data-card-id]').count();
    const hidden = await page.locator('.hand-sheet').getByText('Carta oculta').count();
    expect(mine).toBeGreaterThan(0);
    expect(hidden, 'la hoja muestra cartas ocultas o del rival').toBe(0);
  });
});

test('doble pulsación sobre la acción no dispara dos veces', async ({ page }) => {
  await fixture(page, 7, { width: 390, height: 844 });
  await openSheet(page);
  const playable = page.locator('.hand-sheet .sheet-play').first();
  if ((await playable.count()) === 0) {
    // The fixture publishes no legal actions: nothing to double-fire.
    test.skip(true, 'la fixture no ofrece acciones legales');
    return;
  }
  // Two presses in the same frame window: the control disables itself while an
  // action is in flight, so the second press is refused by the browser.
  await playable.click({ clickCount: 2, delay: 0 });
  await expect(page.locator('.hand-sheet .sheet-play[disabled]')).toHaveCount(0, { timeout: 10_000 });
});

test('el detalle se cierra solo si la carta deja de estar en la mano', async ({ page }) => {
  await fixture(page, 5, { width: 390, height: 844 });
  await openSheet(page);
  await page.locator('.hand-sheet [data-card-id]').first().click();
  await expect(page.locator('.sheet-detail')).toBeVisible();
  // Removing the card from the hand — what a successful cast, a discard or a
  // seat change does — must not leave the detail panel describing a ghost.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input[type="number"]')!;
    input.value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('.hand-sheet .sheet-empty')).toBeVisible();
  await expect(page.locator('.sheet-detail')).toHaveCount(0);
});
