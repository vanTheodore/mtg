import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { captureViewportEvidence } from './support/viewport-evidence.ts';

/**
 * Arena 1.0 — puerta de calidad permanente (M3 del issue #42).
 *
 * Cinco anchos, un solo guion, todas las formas de entrada que el producto
 * promete:
 *
 *   320 / 375 / 390   teléfono (táctil real: `hasTouch`, `isMobile`)
 *   768               tableta (táctil)
 *   1440              escritorio (ratón y teclado)
 *
 * En cada ancho se exige, en este orden:
 *
 *   1. navegación real a una ruta real (`/stress`, el fixture determinista);
 *   2. sin desbordamiento horizontal del documento;
 *   3. **ratón**: el `elementFromPoint` del centro de una carta cae en la carta
 *      (no en una herramienta encima ni en una capa invisible);
 *   4. **teclado**: se enfoca la carta, `Tab` llega a *su* `Ampliar`, `Enter`
 *      abre el diálogo y `Escape` lo cierra;
 *   5. **táctil** (anchos táctiles): `tap` sobre la herramienta abre el mismo
 *      diálogo;
 *   6. **axe-core**: cero violaciones `critical` o `serious`;
 *   7. evidencia: captura + JSON con `MESA_VIEWPORT_EVIDENCE`.
 *
 * Nada aquí simula reglas: el fixture es presentación y las acciones legales
 * siguen viniendo de Phase en `ui-deck-10e`.
 */

type Profile = {
  width: number;
  height: number;
  label: string;
  touch: boolean;
};

const PROFILES: Profile[] = [
  { width: 320, height: 800, label: 'teléfono 320×800', touch: true },
  { width: 375, height: 812, label: 'teléfono 375×812', touch: true },
  { width: 390, height: 844, label: 'teléfono 390×844', touch: true },
  { width: 768, height: 1024, label: 'tableta 768×1024', touch: true },
  { width: 1440, height: 900, label: 'escritorio 1440×900', touch: false }
];

/** The phone hand is a drawer; open it with the real button so the cards are
 *  on screen and touchable, exactly like a player would. */
async function showHand(page: Page) {
  const trigger = page.locator('.hand-trigger');
  if (!(await trigger.isVisible())) return;
  if ((await trigger.getAttribute('aria-expanded')) === 'true') return;
  await trigger.tap();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
}

async function persist(testInfo: TestInfo, label: string, data: unknown) {
  const dir = join(testInfo.project.outputDir, 'quality-gate');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${label}.json`);
  await writeFile(path, JSON.stringify(data, null, 2));
  await testInfo.attach(`${label}.json`, { path, contentType: 'application/json' });
}

for (const profile of PROFILES) {
  test.describe(profile.label, () => {
    test.use({
      viewport: { width: profile.width, height: profile.height },
      hasTouch: profile.touch,
      isMobile: profile.touch
    });

    test('navegación, ratón, teclado, táctil, axe y evidencia', async ({ page }, testInfo) => {
      await page.route('**/api.scryfall.com/**', (route) => route.abort());
      await page.goto('/stress?hand=7&tokens=4&mirror=1');
      await expect(page.getByTestId('stress-page')).toBeVisible();

      // 2) The document never scrolls sideways at any promised width.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow, `desbordamiento horizontal a ${profile.width}px`).toBeLessThanOrEqual(1);

      // 3) A real pointer hit test: the centre of a battlefield card is the card.
      const fieldCard = page.locator('.battlefield [data-card-id]').first();
      await fieldCard.scrollIntoViewIfNeeded();
      const hit = await fieldCard.evaluate((card) => {
        const rect = card.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return { tag: target?.tagName ?? null, inside: !!target && (target === card || card.contains(target)) };
      });
      expect(hit.inside, `el centro de la carta no es la carta (${hit.tag}) a ${profile.width}px`).toBe(true);

      // 4) Keyboard: card -> its own Ampliar -> dialog -> Escape.
      await showHand(page);
      const handCard = page.locator('.hand-zone .hand-card').first();
      const inspect = handCard.getByRole('button', { name: /^Ampliar / });
      await handCard.locator('.card').focus();
      await expect(handCard.locator('.card')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(inspect).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Carta ampliada' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Carta ampliada' })).toBeHidden();

      // 5) Touch: the same control answers a finger, without hover.
      if (profile.touch) {
        await inspect.tap();
        await expect(page.getByRole('dialog', { name: 'Carta ampliada' })).toBeVisible();
        // Scoped to the dialog: the phone drawer also has a close control and
        // `getByRole` matches names by substring by default.
        await page.getByRole('dialog', { name: 'Carta ampliada' }).getByRole('button', { name: /^Cerrar/ }).tap();
        await expect(page.getByRole('dialog', { name: 'Carta ampliada' })).toBeHidden();
      }

      // 6) Accessibility: no serious or critical axe violation anywhere.
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations
        .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
        .map((violation) => `${violation.id} (${violation.nodes.length})`);
      expect(serious, `violaciones axe a ${profile.width}px`).toEqual([]);

      // Close the phone drawer again before measuring: a closed drawer is the
      // resting state of the hand and must not reserve card height.
      if (profile.touch && profile.width <= 640) {
        await page.locator('.hand-zone .hand-close').click();
        await expect(page.locator('.hand-trigger')).toHaveAttribute('aria-expanded', 'false');
      }

      // 7) Evidence, with the same marker the rest of the suite uses.
      const evidence = await captureViewportEvidence(
        page,
        `arena-quality-${profile.width}x${profile.height}`,
        {
          fixture: '[data-testid="stress-page"]',
          opponentField: '.battlefield[data-side="opponent"]',
          battlefield: '.battlefield[data-side="player"]',
          hand: '.hand-zone',
          trigger: '.hand-trigger'
        }
      );
      expect(evidence.horizontalOverflow).toBeLessThanOrEqual(1);
      if (profile.touch && profile.width <= 640) {
        // The phone hand is a drawer: closed, it must not reserve card height.
        expect(evidence.elements.hand!.height).toBeLessThan(110);
      }
      await page.screenshot({ path: join(testInfo.project.outputDir, 'quality-gate', `arena-${profile.width}.png`), fullPage: false });
      await persist(testInfo, `arena-${profile.width}`, {
        profile,
        overflow,
        hit,
        axe: { serious: serious.length, violations: results.violations.length },
        evidence
      });
    });
  });
}
