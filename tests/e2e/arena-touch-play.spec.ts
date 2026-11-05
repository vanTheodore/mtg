import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * El teléfono juega: tocar una carta del cajón tiene que llevar a la acción.
 *
 * Encontrado midiendo `/?autostart` a 390×844 con puntero táctil real:
 * al tocar una carta de la mano el panel ofrecía «Jugar tierra: Plains», pero
 * el cajón (78dvh) seguía abierto por encima y el tablero seguía `inert`
 * (`Board.svelte`: `inert={needsHandoff || session.handDrawerOpen}`).
 * `elementFromPoint` en el centro del botón devolvía la raíz de la app y el
 * `tap()` agotaba el tiempo: **desde el teléfono no se podía jugar una carta
 * de la mano**.
 *
 * La corrección está en `Hand.svelte` (`select`): si la selección desbloquea
 * un `CastSpell`/`PlayLand`, el cajón se cierra, la acción entra en el
 * viewport y toma el foco. Esta prueba exige, con el motor real de Phase:
 *
 *   1. el cajón se cierra solo al tocar la carta;
 *   2. el botón de la acción es el objetivo real del puntero
 *      (`elementFromPoint`), no algo tapado por la hoja ni dentro de `inert`;
 *   3. tocar la acción mueve la partida (Phase aplica una acción más), la
 *      carta sale de la mano y aparece en el campo;
 *   4. después se puede pasar prioridad con el mismo dedo;
 *   5. el teclado recorre el mismo camino con `Enter`.
 *
 * Se corre en los dos anchos donde existe el cajón: 390×844 y 320×800.
 */

/**
 * A real finger, no autoscroll: the coordinates are taken once, the viewport is
 * checked first, and the tap lands wherever those pixels are. Playwright's
 * `locator.tap()` scrolls the element into view on its own, so it can never
 * prove that a player holding the phone can reach a control without scrolling.
 */
async function fingerTap(page: Page, selector: Locator) {
  const box = (await selector.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const viewport = page.viewportSize()!;
  expect(box.width, 'el control no tiene caja').toBeGreaterThan(0);
  expect(box.y, 'el control está por encima del viewport').toBeGreaterThanOrEqual(-1);
  expect(box.y + box.height, 'el control cae por debajo del viewport sin desplazar').toBeLessThanOrEqual(
    viewport.height + 1
  );
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

async function revision(page: Page): Promise<number> {
  return Number(await page.locator('.app').getAttribute('data-actions-applied'));
}

/** The seat dialog is the product's privacy guard: the player passes it. */
async function passSeat(page: Page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const handoff = page.locator('.handoff');
    if (!(await handoff.isVisible().catch(() => false))) return;
    await handoff.locator('button').first().tap({ timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
}

async function tapDecisionButton(page: Page, label: RegExp | string): Promise<boolean> {
  const button = page
    .locator('section[aria-label="Decisión pendiente"] button')
    .filter({ hasText: label })
    .first();
  if (!(await button.count())) return false;
  const before = await revision(page);
  await button.tap({ timeout: 4_000 });
  await expect.poll(() => revision(page), { timeout: 15_000 }).toBeGreaterThan(before);
  return true;
}

async function playFromHand(page: Page) {
  await page.goto('/?autostart');
  await expect(page.locator('section[aria-label^="Tu mano"] [data-card-id]').first()).toBeVisible({
    timeout: 180_000
  });

  // Both seats keep their opening hand, passing the device like people do.
  for (let round = 0; round < 4; round += 1) {
    await passSeat(page);
    if (!(await tapDecisionButton(page, 'Conservar mano'))) break;
  }
  await passSeat(page);
  await expect
    .poll(() => page.locator('.hand-card').filter({ hasText: 'Disponible para jugar' }).count(), {
      timeout: 30_000
    })
    .toBeGreaterThan(0);

  const before = {
    revision: await revision(page),
    hand: await page.locator('.hand-zone [data-card-id]').count(),
    field: await page.locator('section.battlefield[data-side="player"] [data-card-id]').count()
  };

  // 1) Open the drawer and tap the card — with the finger, at scrollY 0.
  expect(await page.evaluate(() => scrollY), 'la partida arranca desplazada').toBe(0);
  const trigger = page.locator('.hand-trigger');
  const triggerBox = (await trigger.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(triggerBox.y + triggerBox.height, 'la mano cae fuera de la pantalla al empezar').toBeLessThanOrEqual(
    viewport.height + 1
  );
  const triggerHit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('.hand-trigger') !== null,
    [triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2]
  );
  expect(triggerHit, 'otra capa tapa el botón de la mano').toBe(true);
  await fingerTap(page, trigger);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const playable = page.locator('.hand-card').filter({ hasText: 'Disponible para jugar' }).first();
  await expect(playable).toBeInViewport();
  await fingerTap(page, playable.locator('[data-card-id]'));

  // 2) The sheet closes and the action it unlocked is the pointer target.
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.hand-zone')).not.toHaveClass(/sheet-open/);
  const action = page.locator('section[aria-label="Decisión pendiente"] .actions button').first();
  await expect(action).toBeVisible();
  // The action that the card unlocked is the one that takes focus, not just
  // any button in the panel.
  const cardPrompt = page.locator(
    'section[aria-label="Decisión pendiente"] [aria-label^="Carta seleccionada"]'
  );
  if (await cardPrompt.count()) {
    await expect(cardPrompt.locator('.actions button').first()).toBeFocused();
  } else {
    await expect(action).toBeFocused();
  }
  const hit = await action.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      inside: !!target && (target === button || button.contains(target)),
      insideViewport: rect.top >= 0 && rect.bottom <= innerHeight,
      tag: target?.tagName ?? null
    };
  });
  expect(hit.inside, `la acción no recibe el toque (${hit.tag})`).toBe(true);
  expect(hit.insideViewport, 'la acción quedó fuera del viewport').toBe(true);
  // The board is no longer inert: the sheet really closed, it did not just hide.
  await expect(page.locator('main.layout')).not.toHaveAttribute('inert', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

  // 3) Tap the action: Phase applies it, the card leaves the hand and lands
  //    on the battlefield.
  await page.evaluate(() => scrollTo(0, 0));
  expect(hit.insideViewport).toBe(true);
  await fingerTap(page, action);
  await expect.poll(() => revision(page), { timeout: 20_000 }).toBeGreaterThan(before.revision);
  await expect.poll(() => page.locator('.hand-zone [data-card-id]').count()).toBe(before.hand - 1);
  await expect
    .poll(() => page.locator('section.battlefield[data-side="player"] [data-card-id]').count())
    .toBeGreaterThan(before.field);

  // 4) The same finger can pass priority, which moves the game on.
  await passSeat(page);
  const passed = await tapDecisionButton(page, /^Pasar/);
  expect(passed, 'la prioridad no se pudo pasar con el dedo').toBe(true);

  // 5) Keyboard reaches the same path: focus a card and press Enter, and the
  //    drawer closes for the keyboard too.
  const keyboardCard = page.locator('.hand-card').filter({ hasText: 'Disponible para jugar' }).first();
  if (await keyboardCard.count()) {
    await trigger.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await keyboardCard.locator('[data-card-id]').focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('section[aria-label="Decisión pendiente"] .actions button:focus')).toHaveCount(1);
  }
}

test.describe('teléfono con puntero táctil', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('390×844: tocar una carta del cajón ofrece la acción y Phase la acepta', async ({ page }) => {
    await page.route('**/api.scryfall.com/**', (route) => route.abort());
    await playFromHand(page);
  });

  test('320×800: el cajón más estrecho también juega', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.route('**/api.scryfall.com/**', (route) => route.abort());
    await playFromHand(page);
  });
});
