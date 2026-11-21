import { expect, test, type Page } from '@playwright/test';

/**
 * El pie del teléfono.
 *
 * En un teléfono la mesa es una pantalla (M8) con tres piezas fijas en el borde
 * inferior: la decisión de Phase, la ficha de fase y el botón de la mano. Este
 * archivo mide que las tres se apilen sin taparse y que sigan respondiendo al
 * dedo, que es lo que la primera entrega de la barra de fases rompió.
 *
 * Medido antes de este arreglo, con la fixture de capturas y puntero táctil a
 * 390×844:
 *
 *   decisión   `y: 529…770`   (fija, 241 px)
 *   ficha      `y: 522…558`   en el flujo del tablero, **debajo** del panel:
 *                             `elementFromPoint` sobre la ficha devolvía el
 *                             panel, y su `aria-expanded` no se podía tocar
 *   mano       `y: 775…819`   (sticky)
 *
 * Ahora el pie es una pila —decisión arriba, ficha en medio, mano abajo— y la
 * ficha se aparta con `--phase-chip-h` en vez de con un número escrito a mano.
 *
 * La fixture es la misma que usan las capturas (`scripts/compare-boards-mesa-fixture.js`):
 * instala una instantánea de Phase en el `session` y el tablero real se pinta
 * sin motor. Eso hace que esta prueba mida maquetación, no el WASM, y por eso
 * puede correr en cualquier entorno.
 */
async function loadFixture(page: Page, { chip = true }: { chip?: boolean } = {}) {
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.route('**/cards.scryfall.io/**', (route) => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app');
  await page.addScriptTag({ path: 'scripts/compare-boards-mesa-fixture.js' });
  await page.waitForFunction('window.__mesaFixtureInstalled === true');
  // La ficha publica su alto medido cuando el navegador ya ha maquetado. En
  // horizontal no se dibuja a propósito, así que ahí se espera lo contrario.
  await expect(page.locator('.phase-chip .chip'))[chip ? 'toBeVisible' : 'toBeHidden']();
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

type FooterBox = { top: number; bottom: number };

async function footer(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string): FooterBox | null => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
    };
    const hit = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return 'missing';
      const rect = element.getBoundingClientRect();
      // Tres puntos y no uno: un borde tapado en la esquina sigue siendo un
      // borde que el dedo no alcanza.
      const points = [rect.top + 4, rect.top + rect.height / 2, rect.bottom - 4];
      return points.map((y) => {
        const target = document.elementFromPoint(rect.left + rect.width / 2, Math.min(y, innerHeight - 1));
        return target === element || element.contains(target) ? 'ok' : (target?.className?.toString() || target?.tagName || 'null');
      });
    };
    return {
      decision: box('section[aria-label="Decisión pendiente"]'),
      chip: box('.phase-chip'),
      hand: box('.hand-trigger'),
      decisionHit: hit('section[aria-label="Decisión pendiente"]'),
      chipHit: hit('.phase-chip'),
      handHit: hit('.hand-trigger'),
      // El alto del pie, publicado por la ficha, es con lo que se apartan el
      // panel y la reserva de la región.
      chipHeightVar: getComputedStyle(document.documentElement).getPropertyValue('--phase-chip-h').trim(),
      chipHeight: box('.phase-chip') ? box('.phase-chip')!.bottom - box('.phase-chip')!.top : 0,
      budgetBottom: getComputedStyle(document.querySelector<HTMLElement>('main.layout')!).paddingBottom,
      debt: document.documentElement.scrollHeight - innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth
    };
  });
}

for (const [width, height] of [[390, 844], [320, 800], [360, 640], [412, 915]] as const) {
  test.describe(`teléfono ${width}×${height}`, () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width, height } });

    test('la decisión, la ficha de fase y la mano se apilan sin taparse', async ({ page }) => {
      await loadFixture(page);
      const sample = await footer(page);
      const where = `${width}×${height}`;

      expect(sample.decision, `falta la decisión a ${where}`).not.toBeNull();
      expect(sample.chip, `falta la ficha de fase a ${where}`).not.toBeNull();
      expect(sample.hand, `falta el botón de la mano a ${where}`).not.toBeNull();

      const decision = sample.decision!;
      const chip = sample.chip!;
      const hand = sample.hand!;

      // Las tres dentro de la pantalla: un pie que se sale no es un pie.
      expect(decision.top, `la decisión empieza fuera de la vista a ${where}`).toBeGreaterThanOrEqual(0);
      expect(decision.bottom, `la decisión se sale por abajo a ${where}`).toBeLessThanOrEqual(height + 1);
      expect(chip.bottom, `la ficha se sale por abajo a ${where}`).toBeLessThanOrEqual(height + 1);
      expect(hand.bottom, `la mano se sale por abajo a ${where}`).toBeLessThanOrEqual(height + 1);

      // Apiladas, en este orden y sin solaparse. Los dos píxeles de holgura son
      // el redondeo de `Math.round` en los bordes, no un hueco real.
      expect(decision.bottom, `la decisión tapa la ficha a ${where}`).toBeLessThanOrEqual(chip.top + 2);
      expect(chip.bottom, `la ficha tapa la mano a ${where}`).toBeLessThanOrEqual(hand.top + 2);

      // Y responden al dedo en sus dos extremos, no sólo en el centro.
      expect(sample.decisionHit, `la decisión no responde a ${where}`).toEqual(['ok', 'ok', 'ok']);
      expect(sample.chipHit, `la ficha de fase no responde a ${where}`).toEqual(['ok', 'ok', 'ok']);
      expect(sample.handHit, `la mano no responde a ${where}`).toEqual(['ok', 'ok', 'ok']);

      // El alto del pie sale de una medida, no de un número escrito a mano.
      expect(sample.chipHeightVar, `la ficha no publica su alto a ${where}`).toBe(`${sample.chipHeight}px`);
      expect(sample.chipHeight, `la ficha no mide una línea a ${where}`).toBeLessThanOrEqual(40);
      // La región reserva decisión + ficha + mano: con eso ninguna carta queda
      // debajo del pie para siempre.
      expect(sample.debt, `el teléfono vuelve a ser un documento a ${where}`).toBe(0);
      expect(sample.horizontalOverflow, `desbordamiento horizontal a ${where}`).toBeLessThanOrEqual(1);
    });

    test('la hoja de paradas abre desde la ficha y llega al último paso', async ({ page }) => {
      await loadFixture(page);
      const where = `${width}×${height}`;

      const chip = page.locator('.phase-chip .chip');
      await chip.tap();
      const sheet = page.getByRole('dialog', { name: 'Paradas del turno' });
      await expect(sheet, `la hoja no abre a ${where}`).toBeVisible();
      await expect(sheet.locator('button.row')).toHaveCount(12);

      // La cabecera y los doce pasos caben o desplazan: lo que no puede pasar es
      // que un paso quede **fuera del diálogo** y sin forma de alcanzarlo.
      const rows = sheet.locator('ol.rows');
      const before = await rows.evaluate((element) => ({
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight
      }));
      expect(before.scrollHeight, `la lista no desplaza a ${where}`).toBeGreaterThanOrEqual(before.clientHeight);
      await rows.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect.poll(async () => rows.evaluate((element) => Math.round(element.scrollTop - (element.scrollHeight - element.clientHeight)))).toBe(0);

      const last = sheet.locator('button.row').last();
      await expect(last, `el último paso no se nombra a ${where}`).toContainText('Limpieza');
      const reachable = await last.evaluate((element) => {
        const dialog = element.closest('dialog')!.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          insideDialog: box.top >= dialog.top - 1 && box.bottom <= dialog.bottom + 1,
          answers: hit === element || element.contains(hit)
        };
      });
      expect(reachable.insideDialog, `el último paso se sale del diálogo a ${where}`).toBe(true);
      expect(reachable.answers, `el último paso no responde a ${where}`).toBe(true);

      // Escape cierra y devuelve el foco a la ficha, no al documento.
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await expect(chip).toBeFocused();
    });
  });
}

test.describe('teléfono girado 844×390', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });

  test('en horizontal la ficha no aparece y la decisión tiene su columna', async ({ page }) => {
    await loadFixture(page, { chip: false });
    // En horizontal manda la barra de doce pasos de la mesa y el panel es una
    // columna a la derecha: la ficha del teléfono no se dibuja.
    await expect(page.locator('.phase-chip')).toBeHidden();
    const sample = await footer(page);
    expect(sample.decision).not.toBeNull();
    expect(sample.decision!.top).toBeGreaterThanOrEqual(0);
    expect(sample.decision!.bottom).toBeLessThanOrEqual(390);
    expect(sample.debt).toBe(0);
    expect(sample.horizontalOverflow).toBeLessThanOrEqual(1);
  });
});
