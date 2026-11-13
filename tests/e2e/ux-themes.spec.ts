import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Mesa — las vistas de `WaitingFor` en los dos temas.
 *
 * Cada bloque nuevo de esta rama tiene su escena en el laboratorio (`/ux`). Esta
 * prueba las recorre en tema claro y oscuro y deja una captura de cada par en
 * `docs/screenshots/temas/`, además de auditar con axe **en los dos temas**: un
 * contraste que falla en oscuro no se ve en una captura clara, y al revés.
 *
 * El tema se cambia por el camino del producto: `localStorage['mesa:theme']` es
 * lo que lee `session.setTheme` (y lo que el ajuste escribe). La prueba comprueba
 * después que `data-theme` cambió de verdad, para que una captura no salga
 * etiquetada como oscura con la paleta clara.
 *
 * Se captura con el cromo clásico (`mesa:boardStyle = classic`). El cromo de
 * arena, que es el de por defecto, **no sigue el tema a propósito**
 * (`arena.css`, `.app[data-chrome="arena"]`): va sobre el arte, con su propia
 * paleta, para que el tablero se lea igual con el tema del sistema en claro o en
 * oscuro. Las capturas de este fichero existen para revisar el tema, así que se
 * toman donde el tema manda.
 */
const shotsDir = fileURLToPath(new URL('../../docs/screenshots/temas/', import.meta.url));

/** Las escenas que esta rama añadió, con el nombre que llevará el fichero. */
const SCENES = [
  { scene: 'pay', slug: 'cargo-con-importe', block: '[data-pay-amount]' },
  { scene: 'opponent', slug: 'puede-un-oponente', block: '[data-optional-effect]' },
  { scene: 'reveal', slug: 'ensenar-una-carta', block: '[data-reveal-prompt]' },
  { scene: 'unless', slug: 'pagar-o-aceptar', block: '[data-unless-prompt]' },
  { scene: 'pair', slug: 'emparejar', block: '[data-pair-prompt]' },
  { scene: 'host', slug: 'destinatario-ficha', block: '[data-token-host]' },
  { scene: 'branches', slug: 'pagar-uno-de-dos', block: '[data-unless-branch]' },
  { scene: 'tribute', slug: 'tributo', block: '[data-tribute]' },
  { scene: 'ward', slug: 'guardia', block: '[data-ward-sacrifice]' },
  { scene: 'wardPower', slug: 'guardia-poder', block: '[data-ward-sacrifice]' },
  { scene: 'startingPlayer', slug: 'quien-empieza', block: '[data-starting-player]' },
  { scene: 'scry', slug: 'adivinar', block: '[data-scry-prompt]' },
  { scene: 'surveil', slug: 'vigilar', block: '[data-scry-prompt]' },
  { scene: 'crew', slug: 'tripular', block: '[data-tap-power]' },
  { scene: 'saddle', slug: 'montar', block: '[data-tap-power]' },
  { scene: 'equip', slug: 'equipar', block: '[data-equip-prompt]' }
] as const;

const THEMES = [
  { theme: 'light', slug: 'claro' },
  { theme: 'dark', slug: 'oscuro' }
] as const;
/** El cromo que resuelve los tokens del tema global. */
const CHROME = { boardStyle: 'classic' };

test.beforeAll(async () => {
  await mkdir(shotsDir, { recursive: true });
});

for (const { theme, slug } of THEMES) {
  test(`las vistas de Phase en tema ${slug}, auditadas`, async ({ page }) => {
    // El ajuste guarda la preferencia; `system` quedaría a merced del anfitrión.
    await page.addInitScript(
      ({ value, boardStyle }) => {
        window.localStorage.setItem('mesa:theme', value);
        window.localStorage.setItem('mesa:boardStyle', boardStyle);
      },
      { value: theme, boardStyle: CHROME.boardStyle }
    );

    for (const { scene, slug: sceneSlug, block } of SCENES) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/ux?scene=${scene}`, { waitUntil: 'networkidle' });

      // El tema tiene que estar aplicado de verdad antes de capturar, y el
      // cromo tiene que ser el que lo resuelve: si `data-chrome="arena"`
      // siguiera puesto, las dos capturas saldrían idénticas.
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.app')).toHaveAttribute('data-board-style', CHROME.boardStyle);
      await expect(page.locator('.app')).not.toHaveAttribute('data-chrome', 'arena');
      const prompt = page.locator(block).first();
      await expect(prompt, `la escena ${scene} no muestra su bloque`).toBeVisible();

      const audit = await new AxeBuilder({ page }).analyze();
      const serious = audit.violations.filter((violation) =>
        ['critical', 'serious'].includes(violation.impact ?? '')
      );
      expect(serious, `axe en ${scene} (${slug}): ${serious.map((v) => v.id).join(', ')}`).toEqual([]);

      // La captura tiene que enseñar el bloque: con el cromo clásico el panel
      // cae por debajo del pliegue a 1440×900 y una foto del campo no dice nada
      // del tema aplicado al prompt.
      await prompt.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await page.screenshot({
        path: `${shotsDir}${sceneSlug}-${slug}.jpg`,
        type: 'jpeg',
        quality: 72,
        fullPage: false
      });
    }
  });
}

test('los dos temas no pintan lo mismo', async ({ page }) => {
  const inkOf = async (value: 'light' | 'dark') => {
    await page.addInitScript((theme) => {
      window.localStorage.setItem('mesa:theme', theme);
      window.localStorage.setItem('mesa:boardStyle', 'classic');
    }, value);
    await page.goto('/ux?scene=unless', { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', value);
    return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim());
  };
  const light = await inkOf('light');
  const dark = await inkOf('dark');
  expect(light).not.toBe('');
  expect(dark).not.toBe('');
  // Si ambos fueran iguales, las capturas estarían duplicando el mismo tema.
  expect(light).not.toBe(dark);
});
