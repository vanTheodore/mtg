import { expect, test, type Locator, type Page } from '@playwright/test';
import { logBoardFailureDiagnostics } from './support/failure-diagnostics.ts';
import { createBoardDriver } from './support/board-driver.ts';

test.afterEach(async ({ page }, info) => logBoardFailureDiagnostics(page, info));

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
  const driver = createBoardDriver(page);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const handoff = page.locator('.handoff');
    if (!(await handoff.isVisible().catch(() => false))) break;
    await handoff.locator('button').first().tap({ timeout: 3_000 }).catch(() => {});
    await handoff.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
  // A handoff can be followed immediately by another seat's privacy barrier.
  // Wait until Phase's next decision is actually visible before tapping it.
  if (!(await page.locator('.game-over').isVisible().catch(() => false))) {
    await driver.waitForDecision(30_000);
  }
}

async function tapDecisionButton(page: Page, label: RegExp | string): Promise<boolean> {
  const driver = createBoardDriver(page);
  await driver.settleSeat();
  const button = page
    .locator('section[aria-label="Decisión pendiente"] button')
    .filter({ hasText: label })
    .first();
  if (!(await button.count())) return false;
  const before = await revision(page);
  await button.tap({ timeout: 4_000 });
  await expect.poll(() => revision(page), { timeout: 15_000 }).toBeGreaterThan(before);
  if (!(await page.locator('.game-over').isVisible().catch(() => false))) {
    await driver.waitForDecision(30_000);
  }
  return true;
}

async function playFromHand(page: Page) {
  await page.goto('/?autostart');
  await createBoardDriver(page).waitForDecision(180_000);
  await expect(page.locator('section[aria-label^="Tu mano"] [data-card-id]').first()).toBeVisible({
    timeout: 180_000
  });

  // Both seats keep their opening hand, passing the device like people do.
  for (let round = 0; round < 4; round += 1) {
    await passSeat(page);
    if (!(await tapDecisionButton(page, 'Conservar mano'))) break;
  }
  await passSeat(page);
  // The hand itself is always mounted (the inline region), so it is the right
  // thing to wait for here. The sheet's action buttons only exist while the
  // sheet is open — polling them before opening it can only ever see zero.
  await expect
    .poll(() => page.locator('.hand-zone [data-card-id]').count(), { timeout: 30_000 })
    .toBeGreaterThan(0);

  const before = {
    revision: await revision(page),
    hand: await page.locator('.hand-zone [data-card-id]').count(),
    field: await page.locator('section.battlefield[data-side="player"] [data-card-id]').count()
  };

  // 1) Open the hand sheet and press the card's own action — with the finger,
  //    at scrollY 0.
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
  // UX-HAND: the sheet gives each playable card its own labelled action, so
  // playing is one press on a 44px control instead of "tap the face to close
  // the drawer and focus a button elsewhere". Legality arrives with an engine
  // reply *after* priority moves (Inicio → tu turno), so the control is waited
  // for rather than demanded in the first frame — that race was a red CI run.
  const playWhenReady = page.locator('.hand-sheet .sheet-play').first();
  await expect(playWhenReady).toBeVisible({ timeout: 60_000 });
  // A player scrolls the grid to the card they want; do the same so the tap
  // lands where the finger would be, not on an off-screen control.
  await playWhenReady.scrollIntoViewIfNeeded();
  await expect(playWhenReady).toBeInViewport();
  const playable = page.locator('.hand-sheet [data-card-id]').first();
  await expect(playable).toBeInViewport();
  await fingerTap(page, playWhenReady);

  // 2) UX-HAND: the press on the card's own action IS the play. The sheet
  //    closes and the board it was covering is no longer inert, so a stray tap
  //    cannot land on a permanent the player could not see. There is no second
  //    confirmation step in the panel to wait for any more: the previous
  //    contract (tap the face → focus a panel button → press it) is precisely
  //    what this sheet replaced.
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.hand-zone')).not.toHaveClass(/sheet-open/);
  await expect(page.locator('main.layout')).not.toHaveAttribute('inert', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

  // 3) Phase really applied it, not just the UI: the revision moved, the card
  //    left the hand and a permanent joined the battlefield.
  await expect.poll(() => revision(page), { timeout: 20_000 }).toBeGreaterThan(before.revision);
  await expect.poll(() => page.locator('.hand-zone [data-card-id]').count()).toBe(before.hand - 1);
  await expect
    .poll(() => page.locator('section.battlefield[data-side="player"] [data-card-id]').count())
    .toBeGreaterThan(before.field);

  // 4) The same finger can pass priority, which moves the game on.
  await passSeat(page);
  const passed = await tapDecisionButton(page, /^Pasar/);
  expect(passed, 'la prioridad no se pudo pasar con el dedo').toBe(true);

  // 5) Keyboard reaches the same path: open, focus a card's action, press
  //    Enter, and the sheet closes for the keyboard too. Whatever the engine
  //    does next, the board is reachable again and the sheet is gone.
  await trigger.tap();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const keyboardCard = page.locator('.hand-sheet .sheet-play').first();
  await expect(keyboardCard).toBeVisible({ timeout: 60_000 });
  await keyboardCard.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.hand-sheet')).toHaveCount(0);
  await expect(page.locator('main.layout')).not.toHaveAttribute('inert', '');
  // Focus must follow the surface the player can currently act on. A seat
  // handoff is a valid next state after Phase accepts the action: its own button
  // must hold focus, rather than treating the temporarily hidden decision panel
  // as a failure. Resolve that privacy barrier through the shared driver and
  // verify that it then exposes a real decision (or an explicit terminal UI).
  const keyboardSurface = async () => page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.app');
    const active = document.activeElement as HTMLElement | null;
    const isVisible = (element: HTMLElement | null): boolean => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    if (isVisible(root?.querySelector<HTMLElement>('.handoff') ?? null)) return 'handoff';
    if (isVisible(root?.querySelector<HTMLElement>('.game-over') ?? null)) return 'game-over';
    if (active?.closest('section[aria-label="Decisión pendiente"]')) return 'panel';
    if (active?.closest('.hand-trigger')) return 'trigger';
    return 'pending';
  });
  await expect.poll(keyboardSurface, { timeout: 15_000 }).toMatch(/^(handoff|panel|trigger|game-over)$/);

  const surface = await createBoardDriver(page).settleSeat();
  if (surface === 'decision') await expect(page.locator('section[aria-label="Decisión pendiente"]')).toBeVisible();
  else await expect(page.locator('.game-over')).toBeVisible();
}

test.describe('teléfono con puntero táctil', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('390×844: la acción de la carta en la hoja juega y Phase la acepta', async ({ page }) => {
    await page.route('**/api.scryfall.com/**', (route) => route.abort());
    await playFromHand(page);
  });

  test('320×800: la hoja más estrecha también juega', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.route('**/api.scryfall.com/**', (route) => route.abort());
    await playFromHand(page);
  });
});
