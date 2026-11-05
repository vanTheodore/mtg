import { expect, test, type Page, type TestInfo } from '@playwright/test';
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

  const samples: Array<{ size: string; decision: { top: number; bottom: number }; debt: number; horizontalOverflow: number }> = [];
  for (const [width, height] of [[1440, 900], [1024, 768], [844, 390], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await settle(page);
    const sample = await page.evaluate(() => {
      const rect = document.querySelector<HTMLElement>('section[aria-label="Decisión pendiente"]')!.getBoundingClientRect();
      return {
        size: `${innerWidth}x${innerHeight}`,
        decision: { top: Math.round(rect.top), bottom: Math.round(rect.bottom) },
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
  }
  console.log('MESA_VIEWPORT_MATRIX_REAL ' + JSON.stringify(samples));
  await persist(testInfo, 'real-game-matrix', samples);

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
