import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createBoardDriver } from './support/board-driver.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Arena 1.0 — la matriz de tamaños, medida.
 *
 * El issue #42 pedía un tablero jugable, y "jugable" cambia con el tamaño de la
 * ventana. Antes de este trabajo, medido con `/?autostart` en Chromium:
 *
 *   | ventana     | deuda vertical del documento |
 *   | 1180×820    | 200 px                       |
 *   | 1024×768    | 486 px                       |
 *   | 844×390     | 880 px  (un teléfono girado) |
 *   | 740×360     | 901 px                       |
 *
 * Un teléfono en horizontal se trataba como un escritorio: la mano era un
 * abanico de 324 px en una pantalla de 390 y la decisión de Phase empezaba
 * fuera de la vista. Estas dos pruebas fijan lo que ahora se exige:
 *
 *   1. el fixture espejo (seis tierras + cuatro criaturas por asiento, mano de
 *      siete) nunca desborda en horizontal y no empeora respecto de los techos
 *      medidos aquí —que son el *peor caso* de un tablero lleno, no la meta;
 *   2. en una partida real la decisión de Phase **se ve entera sin desplazar**
 *      a 1440×900, 1024×768, 844×390 y 390×844, y el cajón de la mano sobrevive
 *      a un cambio de tamaño sin dejar el tablero inerte.
 */

const MATRIX = [
  { width: 1440, height: 900, ceiling: 8 },
  { width: 1280, height: 800, ceiling: 8 },
  { width: 1180, height: 820, ceiling: 40 },
  { width: 1024, height: 768, ceiling: 360 },
  { width: 844, height: 390, ceiling: 720 },
  { width: 740, height: 360, ceiling: 1050 },
  { width: 768, height: 1024, ceiling: 660 },
  { width: 390, height: 844, ceiling: 740 },
  { width: 320, height: 800, ceiling: 1200 }
] as const;

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function measure(page: Page, label: string) {
  return page.evaluate((size) => {
    const zone = document.querySelector<HTMLElement>('.hand-zone');
    const trigger = document.querySelector<HTMLElement>('.hand-trigger');
    return {
      size,
      viewport: { width: innerWidth, height: innerHeight },
      document: document.documentElement.scrollHeight,
      debt: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      handTriggerVisible: !!trigger && getComputedStyle(trigger).display !== 'none',
      handZoneHeight: zone ? Math.round(zone.getBoundingClientRect().height) : 0,
      handCards: document.querySelectorAll('.hand-zone [data-card-id]').length,
      fields: [...document.querySelectorAll<HTMLElement>('section.battlefield[data-side]')]
        .map((field) => ({ side: field.dataset.side, height: Math.round(field.getBoundingClientRect().height) })),
      cardWidth: Math.round(document.querySelector('.battlefield [data-card-id]')?.getBoundingClientRect().width ?? 0)
    };
  }, label);
}

async function persist(testInfo: TestInfo, label: string, data: unknown) {
  const dir = join(testInfo.project.outputDir, 'viewport-matrix');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${label}.json`);
  await writeFile(path, JSON.stringify(data, null, 2));
  await testInfo.attach(`${label}.json`, { path, contentType: 'application/json' });
}

test('matriz de tamaños: el fixture espejo no desborda ni retrocede', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/stress?hand=7&tokens=0&mirror=1');
  await expect(page.locator('.battlefield [data-card-id]').first()).toBeVisible();

  const samples: Array<Awaited<ReturnType<typeof measure>>> = [];
  for (const size of MATRIX) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await settle(page);
    const sample = await measure(page, `${size.width}x${size.height}`);
    samples.push(sample);

    const where = `${size.width}×${size.height}`;
    expect(sample.horizontalOverflow, `desbordamiento horizontal a ${where}`).toBeLessThanOrEqual(1);
    // Worst case for this fixture: every size keeps a legible card and a
    // reachable hand. The debt ceiling is a regression guard measured here,
    // not a goal: ten permanents per seat do not fit a 320px phone.
    expect(sample.debt, `deuda vertical peor que el techo medido a ${where}`).toBeLessThanOrEqual(size.ceiling);
    if (sample.handTriggerVisible) {
      const trigger = page.locator('.hand-trigger');
      const box = (await trigger.boundingBox())!;
      // A drawer handle is a touch target, not a caption.
      expect(box.height, `el botón de la mano es pequeño a ${where}`).toBeGreaterThanOrEqual(40);
      // Closed, the drawer is a floating affordance: it must not own a row of
      // the document (measured: 3px of border, not 24px of empty card area).
      expect(sample.handZoneHeight, `la mano cerrada reserva alto a ${where}`).toBeLessThan(20);
    } else {
      expect(sample.handCards, `la mano no está montada a ${where}`).toBeGreaterThan(0);
    }
    expect(sample.cardWidth, `carta ilegible a ${where}`).toBeGreaterThanOrEqual(70);
  }

  const evidence = { matrix: MATRIX, samples };
  console.log('MESA_VIEWPORT_MATRIX ' + JSON.stringify(samples));
  await persist(testInfo, 'fixture-matrix', evidence);

  // The two sizes that were already measured at 0 px (M1) must stay at 0.
  const wide = samples.find((sample) => sample.viewport.width === 1440)!;
  const laptop = samples.find((sample) => sample.viewport.width === 1280)!;
  expect(wide.debt).toBe(0);
  expect(laptop.debt).toBe(0);
});

test('partida real: la decisión se ve sin desplazar y el cajón sobrevive al cambio de tamaño', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/?autostart');
  const decision = page.locator('section[aria-label="Decisión pendiente"]');
  await expect(decision).toBeVisible({ timeout: 180_000 });

  const samples: Array<{
    size: string;
    decision: { top: number; bottom: number };
    panelScroll: number;
    buttons: number;
    lastButtonHit: boolean;
    debt: number;
    horizontalOverflow: number;
  }> = [];
  for (const [width, height] of [[1440, 900], [1024, 768], [844, 390], [740, 360], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await settle(page);
    const sample = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('section[aria-label="Decisión pendiente"]')!;
      const rect = panel.getBoundingClientRect();
      // M8: the panel itself never scrolls — only the Phase explanation inside
      // it does — so a legal button can't be parked outside the scrollport.
      const buttons = [...panel.querySelectorAll('button')];
      const last = buttons.at(-1);
      const box = last?.getBoundingClientRect();
      const hit = box
        ? document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        : null;
      return {
        size: `${innerWidth}x${innerHeight}`,
        decision: { top: Math.round(rect.top), bottom: Math.round(rect.bottom) },
        panelScroll: panel.scrollHeight - panel.clientHeight,
        buttons: buttons.length,
        lastButtonHit: last ? hit === last || last.contains(hit) : false,
        debt: Math.max(0, document.documentElement.scrollHeight - innerHeight),
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    samples.push(sample);

    const where = `${width}×${height}`;
    expect(sample.horizontalOverflow, `desbordamiento horizontal a ${where}`).toBeLessThanOrEqual(1);
    // The Phase prompt the player must answer is fully on the first screen.
    expect(sample.decision.top, `la decisión empieza fuera de la vista a ${where}`).toBeGreaterThanOrEqual(0);
    expect(sample.decision.bottom, `la decisión no cabe en la primera pantalla a ${where}`).toBeLessThanOrEqual(height);
    // ...and answering it must be physically possible: the panel hides no part
    // of itself (measured before M8: 8px of inner scroll at 844×390) and the
    // last legal button really is the element under its own centre. Both
    // landscape sizes failed that hit-test before the flex-column panel.
    // Where the phone/landscape shell is active the document must equal the
    // screen: the board scrolls inside its own region (M8).
    if (width <= 640 || height <= 520) {
      expect(sample.debt, `el teléfono vuelve a ser un documento a ${where}`).toBe(0);
    }
    expect(sample.panelScroll, `el panel oculta su propio contenido a ${where}`).toBe(0);
    expect(sample.buttons, `la decisión no ofrece ningún botón a ${where}`).toBeGreaterThan(0);
    expect(sample.lastButtonHit, `el último botón de la decisión no responde al puntero a ${where}`).toBe(true);
  }
  console.log('MESA_VIEWPORT_MATRIX_REAL ' + JSON.stringify(samples));
  await persist(testInfo, 'real-game-matrix', samples);

  // M9: en la banda intermedia (tablet) el tablero sigue desplazando como
  // documento, pero el HUD se queda pegado al borde inferior. La prueba tiene
  // que mirar las dos puntas del recorrido: medido a 1024×768 sin esto, al
  // llegar al final la decisión se había ido por arriba (y=-38..212) justo
  // cuando el jugador mira su propio campo, y al principio el botón de la mano
  // tapaba el último botón del panel (y=745–785 bajo un control de 724–768).
  for (const [width, height] of [[1024, 768], [768, 1024]] as const) {
    await page.setViewportSize({ width, height });
    await settle(page);
    for (const at of ['inicio', 'final'] as const) {
      await page.evaluate(
        (where) => scrollTo(0, where === 'final' ? document.documentElement.scrollHeight : 0),
        at
      );
      await settle(page);
      const sample = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('section[aria-label="Decisión pendiente"]')!;
        const box = panel.getBoundingClientRect();
        const buttons = [...panel.querySelectorAll('button')];
        const last = buttons.at(-1);
        const lb = last?.getBoundingClientRect();
        const hit = lb
          ? document.elementFromPoint(lb.x + lb.width / 2, Math.min(lb.y + lb.height / 2, innerHeight - 1))
          : null;
        const middle = panel.closest<HTMLElement>('.middle');
        const mr = middle?.getBoundingClientRect();
        const trigger = document.querySelector<HTMLElement>('.hand-trigger');
        const shown = trigger && getComputedStyle(trigger).display !== 'none';
        const tr = shown ? trigger!.getBoundingClientRect() : null;
        return {
          top: Math.round(box.top),
          bottom: Math.round(box.bottom),
          lastHit: lb ? hit === last || !!last?.contains(hit) : false,
          position: middle ? getComputedStyle(middle).position : null,
          middleBottom: mr ? Math.round(mr.bottom) : null,
          triggerTop: tr ? Math.round(tr.top) : null
        };
      });
      const where = `${width}×${height} (${at} del recorrido)`;
      expect(sample.top, `la decisión se escapa por arriba a ${where}`).toBeGreaterThanOrEqual(0);
      expect(sample.bottom, `la decisión se escapa por abajo a ${where}`).toBeLessThanOrEqual(height);
      expect(sample.lastHit, `el último botón no responde al puntero a ${where}`).toBe(true);
      expect(sample.position, `el HUD debería quedarse pegado a ${where}`).toBe('sticky');
      // El HUD pegado no puede comerse el botón de la mano: el jugador necesita
      // las dos cosas en la misma pantalla.
      if (sample.triggerTop !== null) {
        expect(sample.middleBottom!, `el HUD tapa el botón de la mano a ${where}`).toBeLessThanOrEqual(
          sample.triggerTop
        );
      }
    }
  }

  // M10: en la banda de tablet (641–1099 px) la página deja de ser un documento.
  // Al empezar la partida el tablero está casi vacío, así que aquí sólo se fija
  // lo que vale en cualquier estado: el documento mide la pantalla, la mesa
  // tiene su propia región que desplaza y la mano no se va por abajo. Las
  // propiedades que necesitan una mesa llena viven en la prueba siguiente.
  for (const [width, height] of [[1024, 768], [768, 1024]] as const) {
    await page.setViewportSize({ width, height });
    await settle(page);
    const where = `${width}×${height}`;
    const shape = await page.evaluate(() => {
      const region = document.querySelector<HTMLElement>('main.layout')!;
      const hand = document.querySelector<HTMLElement>('.hand-zone')!.getBoundingClientRect();
      const trigger = document.querySelector<HTMLElement>('.hand-trigger');
      const shown = trigger && getComputedStyle(trigger).display !== 'none';
      return {
        debt: Math.max(0, document.documentElement.scrollHeight - innerHeight),
        regionOverflow: getComputedStyle(region).overflowY,
        handTop: Math.round(hand.top),
        handBottom: Math.round(hand.bottom),
        triggerTop: shown ? Math.round(trigger!.getBoundingClientRect().top) : null,
        triggerBottom: shown ? Math.round(trigger!.getBoundingClientRect().bottom) : null
      };
    });
    expect(shape.debt, `la tablet vuelve a ser un documento a ${where}`).toBe(0);
    expect(shape.regionOverflow, `la mesa no tiene región propia a ${where}`).toBe('auto');
    expect(shape.handBottom, `la mano se va por abajo a ${where}`).toBeLessThanOrEqual(height);
    if (shape.triggerTop !== null) {
      expect(shape.triggerTop, `el botón de la mano se va por abajo a ${where}`).toBeGreaterThanOrEqual(0);
      expect(shape.triggerBottom!, `el botón de la mano no cabe a ${where}`).toBeLessThanOrEqual(height);
    } else {
      expect(shape.handTop, `el abanico de la mano se va por arriba a ${where}`).toBeGreaterThanOrEqual(0);
    }
  }

  // The drawer may only exist where the fan does not fit; it must open, take
  // focus, and close itself when the window grows again, or the board would
  // stay `inert` behind a trigger that is no longer rendered.
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page);
  const trigger = page.locator('.hand-trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.locator('#mesa-hand-sheet .hand-scroll')).toBeFocused();
  await expect(page.locator('main.layout')).toHaveAttribute('inert', '');

  // 1024×768 still matches the drawer condition (a tablet without vertical
  // room for the fan), so the window is grown past it: 1280×800 is where the
  // inline fan returns and the drawer must be gone by itself.
  await page.setViewportSize({ width: 1280, height: 800 });
  await settle(page);
  await expect(page.locator('.hand-zone')).not.toHaveClass(/sheet-open/);
  await expect(page.locator('main.layout')).not.toHaveAttribute('inert', '');
  await expect(page.locator('.hand-trigger')).toBeHidden();
});

/**
 * M10 — la tablet, con la partida empezada.
 *
 * La matriz de arriba corre en el `MulliganDecision`, donde el tablero está casi
 * vacío: medir ahí la deuda de una tablet es medir una pantalla vacía. Esta
 * prueba juega hasta tener la mano viva y permanentes en los dos campos
 * (medido: 5 cartas y 4+4 permanentes) y recién entonces mide. Antes de M10, en
 * ese estado, el documento medía 1346 px a 1024×768 (deuda 578) y 1593 a
 * 768×1024 (deuda 569), y el abanico de la mano nacía 244 px por debajo de la
 * pantalla.
 */
test('tablet con la mesa llena: el tablero desplaza dentro y la mano no se va de la pantalla', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/?autostart');
  await expect(page.locator('section[aria-label="Decisión pendiente"]')).toBeVisible({ timeout: 180_000 });
  const driver = createBoardDriver(page);

  const population = () => page.evaluate(() => ({
    hand: document.querySelectorAll('.hand-zone [data-card-id]').length,
    permanents: [...document.querySelectorAll<HTMLElement>('section.battlefield[data-side]')].map(
      (field) => field.querySelectorAll('[data-card-id]').length
    )
  }));
  let state = await population();
  for (let turn = 0; turn < 40; turn += 1) {
    if (state.hand >= 4 && state.permanents.every((count) => count >= 4)) break;
    await driver.settleSeat().catch(() => {});
    if (!(await driver.playPlayableCard().catch(() => false))) {
      await driver.answerAnyPrompt().catch(() => false);
    }
    state = await population();
  }
  test.skip(
    !(state.hand >= 4 && state.permanents.every((count) => count >= 4)),
    'la partida no llegó a un tablero con mano viva y permanentes en los dos campos'
  );

  const evidence: unknown[] = [];
  for (const [width, height] of [[1024, 768], [900, 700], [768, 1024], [641, 768]] as const) {
    const where = `${width}×${height}`;
    await page.setViewportSize({ width, height });
    await settle(page);
    const sample = await page.evaluate(() => {
      const region = document.querySelector<HTMLElement>('main.layout')!;
      region.scrollTop = 0;
      const app = document.querySelector<HTMLElement>('.app')!;
      const panel = document.querySelector<HTMLElement>('section[aria-label="Decisión pendiente"]')!;
      const hand = document.querySelector<HTMLElement>('.hand-zone')!.getBoundingClientRect();
      return {
        debt: Math.max(0, document.documentElement.scrollHeight - innerHeight),
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        appHeight: Math.round(app.getBoundingClientRect().height),
        regionClient: region.clientHeight,
        regionScroll: region.scrollHeight,
        regionMax: region.scrollHeight - region.clientHeight,
        handTop: Math.round(hand.top),
        handBottom: Math.round(hand.bottom),
        fieldHeights: [...document.querySelectorAll<HTMLElement>('section.battlefield[data-side]')].map(
          (field) => Math.round(field.getBoundingClientRect().height)
        ),
        minFieldCardWidth: Math.min(
          ...[...document.querySelectorAll<HTMLElement>('section.battlefield[data-side] [data-card-id]')].map(
            (card) => Math.round(card.getBoundingClientRect().width)
          )
        ),
        panelTop: Math.round(panel.getBoundingClientRect().top)
      };
    });
    expect(sample.debt, `el documento vuelve a crecer con la mesa llena a ${where}`).toBe(0);
    expect(sample.horizontalOverflow, `desbordamiento horizontal a ${where}`).toBeLessThanOrEqual(1);
    expect(sample.appHeight, `la aplicación no mide la pantalla a ${where}`).toBe(height);
    expect(sample.regionMax, `la mesa no tiene nada que desplazar a ${where}`).toBeGreaterThan(0);
    expect(sample.handBottom, `la mano se va por abajo a ${where}`).toBeLessThanOrEqual(height);
    expect(sample.handTop, `la mano se va por arriba a ${where}`).toBeGreaterThanOrEqual(0);
    // Las cartas no se encogen para que la deuda dé cero: son las mismas de la
    // banda (118/115/100 px) y siguen por encima del mínimo legible.
    expect(sample.minFieldCardWidth, `carta ilegible a ${where}`).toBeGreaterThanOrEqual(70);

    // Al final del recorrido: la decisión entera, su último botón y la última
    // carta del campo propio siguen respondiendo.
    const end = await page.evaluate(() => {
      const region = document.querySelector<HTMLElement>('main.layout')!;
      region.scrollTop = region.scrollHeight;
      // Se mide el desplazamiento ANTES de traer la carta a la vista: el
      // `scrollIntoView` mueve la región otra vez y falsearía el «llegó al
      // final».
      const scrollTop = Math.round(region.scrollTop);
      const regionMax = Math.round(region.scrollHeight - region.clientHeight);
      const panel = document.querySelector<HTMLElement>('section[aria-label="Decisión pendiente"]')!;
      const box = panel.getBoundingClientRect();
      const buttons = [...panel.querySelectorAll('button')].filter((button) => button.offsetParent !== null);
      const last = buttons.at(-1);
      const lb = last?.getBoundingClientRect();
      const hit = lb ? document.elementFromPoint(lb.x + lb.width / 2, Math.min(lb.y + lb.height / 2, innerHeight - 1)) : null;
      const own = document.querySelector<HTMLElement>('main.layout > .battlefield[data-side="player"], section.battlefield[data-side="player"]')!;
      const cards = [...own.querySelectorAll<HTMLElement>('[data-card-id]')].filter((card) => card.getBoundingClientRect().width > 0);
      const lastCard = cards.at(-1);
      let cardHit: boolean | null = null;
      if (lastCard) {
        lastCard.scrollIntoView({ block: 'center' });
        const cardBox = lastCard.getBoundingClientRect();
        const cardEl = document.elementFromPoint(cardBox.x + cardBox.width / 2, Math.min(cardBox.y + cardBox.height / 2, innerHeight - 1));
        cardHit = !!cardEl && (cardEl === lastCard || lastCard.contains(cardEl));
      }
      return {
        scrollTop,
        regionMax,
        panelTop: Math.round(box.top),
        panelBottom: Math.round(box.bottom),
        lastHit: lb ? hit === last || !!last?.contains(hit) : false,
        cardHit
      };
    });
    await settle(page);
    expect(end.scrollTop, `la región no llegó al final a ${where}`).toBe(end.regionMax);
    expect(end.panelTop, `la decisión se escapa por arriba a ${where}`).toBeGreaterThanOrEqual(0);
    expect(end.panelBottom, `la decisión se escapa por abajo a ${where}`).toBeLessThanOrEqual(height);
    expect(end.lastHit, `el último botón de la decisión no responde a ${where}`).toBe(true);
    expect(end.cardHit, `la última carta del campo propio no se puede tocar a ${where}`).toBe(true);
    evidence.push({ where, sample, end });
    await page.evaluate(() => { document.querySelector<HTMLElement>('main.layout')!.scrollTop = 0; });
    await settle(page);
  }
  console.log('MESA_VIEWPORT_TABLET ' + JSON.stringify(evidence));
  await persist(testInfo, 'tablet-band', evidence);
});
