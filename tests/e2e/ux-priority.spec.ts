import { expect, test, type Page } from '@playwright/test';
import { createBoardDriver } from './support/board-driver';

/**
 * UX-PRIORITY 1.0 · Phase-owned priority controls, seat-scoped preferences,
 * explicit pass sessions, Resolve All Own, cancellation and privacy handoff.
 *
 * All transitions here use the isolated real Phase GameScenario WASM. Tests
 * inspect engine snapshots and wait for revision changes; the UI never predicts
 * a recommendation, legal action or resolution boundary.
 */
async function openScenario(page: Page, id: string, handoffMode: 'turn' | 'every' = 'turn') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((mode) => {
    // Compatibility input: this is migrated to temporary P0 Full Control for
    // the fixture, preventing an automatic pass from racing the test setup.
    localStorage.setItem('mesa:autoPass', 'off');
    localStorage.setItem('mesa:handoffMode', mode);
  }, handoffMode);
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto(`/?e2e-scenario=${id}`);
  const app = page.locator('.app');
  await expect(app).toHaveAttribute('data-waiting', /.+/, { timeout: 30_000 });
  await expect(page.locator('section[aria-label="Decisión pendiente"]')).toBeVisible();
  return createBoardDriver(page);
}

const panel = (page: Page) => page.locator('section[aria-label="Decisión pendiente"]');
const advanced = (page: Page) => panel(page).locator('[data-advanced-surface]');
const applied = async (page: Page) => Number(await page.locator('.app').getAttribute('data-actions-applied'));

async function openMoreOptions(page: Page) {
  const details = panel(page).locator('details[data-decision-tiers]');
  if (!(await details.evaluate((node: HTMLDetailsElement) => node.open))) {
    await details.locator('summary').click();
  }
  await expect(advanced(page)).toBeVisible();
}

async function waitForPrioritySync(page: Page, mode: string, stops?: number) {
  const controls = advanced(page);
  await expect(controls).toHaveAttribute('data-engine-priority-mode', mode, { timeout: 30_000 });
  await expect(controls).toHaveAttribute('data-priority-sync', 'synced', { timeout: 30_000 });
  if (stops !== undefined) await expect(controls).toHaveAttribute('data-engine-stop-count', String(stops), { timeout: 30_000 });
}

function checkpoint(description: string) {
  test.info().annotations.push({ type: 'e2e-checkpoint', description });
}

test('modos temporales y alcances por asiento se sincronizan con Phase', async ({ page }) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  checkpoint('abrir la fixture priority-stack');
  await openScenario(page, 'priority-stack');
  checkpoint('abrir opciones avanzadas');
  await openMoreOptions(page);
  const controls = advanced(page);
  checkpoint('sincronizar el modo FullControl inicial');
  await waitForPrioritySync(page, 'FullControl', 0);

  const standard = controls.locator('button[data-priority-mode="Standard"]');
  checkpoint('enviar y sincronizar Standard');
  await standard.click();
  await expect(standard).toHaveAttribute('aria-pressed', 'true');
  await waitForPrioritySync(page, 'Standard', 0);

  const skipLow = controls.locator('button[data-priority-mode="SkipLowUseWindows"]');
  checkpoint('enviar y sincronizar SkipLowUseWindows');
  await skipLow.click();
  await expect(skipLow).toHaveAttribute('aria-pressed', 'true');
  await waitForPrioritySync(page, 'SkipLowUseWindows', 0);

  const full = controls.locator('button[data-priority-mode="FullControl"]');
  checkpoint('activar y sincronizar FullControl temporal');
  await full.click();
  await expect(full).toHaveAttribute('aria-pressed', 'true');
  await waitForPrioritySync(page, 'FullControl', 0);
  // Full Control is the temporary in-game override, never a persisted mode.
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('mesa:priorityPreferences') ?? '{}'));
  expect(persisted['0']).toEqual({ mode: 'SkipLowUseWindows', stops: {} });

  checkpoint('desactivar FullControl y restaurar SkipLowUseWindows');
  await full.click();
  await expect(full).toHaveAttribute('aria-pressed', 'false');
  await waitForPrioritySync(page, 'SkipLowUseWindows', 0);

  checkpoint('abrir controles de paradas de fase');
  await controls.locator('[data-open-phase-stops]').click();
  const currentStop = page.locator('.stop-bar button[data-step="PreCombatMain"]');
  await expect(currentStop).toBeFocused();
  for (const scope of ['AllTurns', 'OwnTurn', 'OpponentsTurns']) {
    checkpoint(`enviar y sincronizar parada ${scope}`);
    await currentStop.click();
    await expect(currentStop).toHaveAttribute('data-stop-scope', scope);
    await waitForPrioritySync(page, 'SkipLowUseWindows', 1);
  }
  // P0 is active in this Phase fixture, so an opponents-only stop is configured
  // but does not claim that the current P0 window is stopped.
  await expect(page.locator('.stop-bar .state')).toHaveAttribute('data-active', 'false');
  checkpoint('desactivar y sincronizar la parada de fase');
  await currentStop.click();
  await expect(currentStop).toHaveAttribute('data-stop-scope', 'off');
  await waitForPrioritySync(page, 'SkipLowUseWindows', 0);

  checkpoint('comprobar las preferencias persistidas finales');
  const finalPreferences = await page.evaluate(() => JSON.parse(localStorage.getItem('mesa:priorityPreferences') ?? '{}'));
  expect(finalPreferences['0']).toEqual({ mode: 'SkipLowUseWindows', stops: {} });
});

test('pasar hasta una frontera es explícito y protege la mano del siguiente asiento', async ({ page }) => {
  test.setTimeout(180_000);
  await openScenario(page, 'priority-empty');
  await openMoreOptions(page);
  await waitForPrioritySync(page, 'FullControl', 0);
  await expect(page.locator('.app')).toHaveAttribute('data-waiting', 'Priority');
  await expect(panel(page).locator('button[data-auto-pass-until="EndOfCurrentTurn"]')).toBeVisible();

  const before = await applied(page);
  await panel(page).locator('button[data-auto-pass-until="EndOfCurrentTurn"]').click();
  await expect.poll(() => applied(page), { timeout: 30_000 }).toBeGreaterThan(before);
  await expect(page.locator('.app')).toHaveAttribute('data-viewer', '1', { timeout: 30_000 });
  await expect(page.locator('.handoff'), 'el pase explícito no debe revelar la mano P1 sin confirmar').toBeVisible();
  await expect(page.locator('.app main[data-board-region]')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('section[aria-label^="Tu mano"]')).toHaveCount(0);
  await expect(page.locator('.handoff')).toContainText('Jugador 2');

  await page.locator('.handoff button').click();
  await expect(page.locator('.handoff')).toHaveCount(0);
  await expect(page.locator('.app')).toHaveAttribute('data-viewer', '1');
  await expect(page.locator('section[aria-label^="Tu mano"] .fallback-name')).toContainText('Spectral Sailor');
});

test('handoff estricto oculta y después identifica la mano privada del asiento siguiente', async ({ page }) => {
  test.setTimeout(180_000);
  await openScenario(page, 'priority-empty', 'every');
  const pass = page.locator('[data-decision-primary]');
  await expect(pass).toContainText('Pasar');
  const before = await applied(page);
  await pass.click();
  await expect.poll(() => applied(page), { timeout: 30_000 }).toBeGreaterThan(before);
  await expect(page.locator('.app')).toHaveAttribute('data-viewer', '1');
  await expect(page.locator('.handoff')).toBeVisible();
  await expect(page.locator('.app main[data-board-region]')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('section[aria-label^="Tu mano"]')).toHaveCount(0);
  await expect(page.locator('text=Spectral Sailor')).toHaveCount(0);

  await page.locator('.handoff button').click();
  await expect(page.locator('.handoff')).toHaveCount(0);
  await expect(page.locator('section[aria-label^="Tu mano"] .fallback-name')).toContainText('Spectral Sailor');
});

test('Resolve All propio no solicita consentimiento compartido', async ({ page }) => {
  test.setTimeout(180_000);
  const driver = await openScenario(page, 'priority-resolve-own');
  const beforeCast = await applied(page);
  const bolt = driver.hand.locator('[data-card-id]').filter({ hasText: 'Lightning Bolt' }).first();
  await expect(bolt).toBeVisible();
  await driver.clickCard(bolt);
  const cast = panel(page).locator('button').filter({ hasText: 'Lanzar Lightning Bolt' }).first();
  await expect(cast).toBeVisible();
  await cast.click();
  await expect(page.locator('.app')).toHaveAttribute('data-waiting', 'TargetSelection');
  const targets = panel(page).locator('details[data-target-list]');
  if (!(await targets.evaluate((node: HTMLDetailsElement) => node.open))) await targets.locator('summary').click();
  const opponent = targets.locator('button').filter({ hasText: /^Elegir Jugador 2$/ }).first();
  await expect(opponent).toBeVisible();
  await opponent.click();
  await expect.poll(() => applied(page), { timeout: 30_000 }).toBeGreaterThan(beforeCast);
  await expect(page.locator('section[aria-label="Pila"] ol li')).toHaveCount(1);
  await expect(page.locator('.app')).toHaveAttribute('data-waiting', 'Priority');

  await openMoreOptions(page);
  const resolve = panel(page).locator('button[data-resolve-all-own]');
  await expect(resolve).toBeVisible();
  const beforeResolve = await applied(page);
  await resolve.click();
  await expect.poll(() => applied(page), { timeout: 30_000 }).toBeGreaterThan(beforeResolve);
  await expect(page.locator('.app')).toHaveAttribute('data-waiting', 'Priority');
  await expect(page.locator('.app')).toHaveAttribute('data-viewer', '1');
  await expect(page.locator('[data-resolve-all]')).toHaveCount(0);
  await expect(page.locator('section[aria-label="Pila"] ol li')).toHaveCount(1);
  const handoff = page.locator('.handoff');
  await expect(handoff, 'Resolve All Own pasa P0 pero no revela la mano privada de P1').toBeVisible();
  await expect(page.locator('.app main[data-board-region]')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('section[aria-label^="Tu mano"]')).toHaveCount(0);
  await handoff.locator('button').click();

  const responseCard = driver.hand.locator('[data-card-id]').filter({ hasText: 'Counterspell' }).first();
  await expect(responseCard).toBeVisible();
  await openMoreOptions(page);
  const full = advanced(page).locator('button[data-priority-mode="FullControl"]');
  await full.click();
  await waitForPrioritySync(page, 'FullControl', 0);

  await driver.clickCard(responseCard);
  const castResponse = panel(page).locator('button').filter({ hasText: 'Lanzar Counterspell' }).first();
  await expect(castResponse).toBeVisible();
  const beforeResponse = await applied(page);
  await castResponse.click();
  // Counterspell has one legal target in this fixture. Phase can choose it as
  // part of CastSpell and return directly to Priority, or request an explicit
  // target choice; both are valid engine paths and must leave it on the stack.
  await expect.poll(async () => {
    const waiting = await page.locator('.app').getAttribute('data-waiting');
    const stackCount = await page.locator('section[aria-label="Pila"] ol li').count();
    return waiting === 'TargetSelection' || (waiting === 'Priority' && stackCount === 2);
  }, { timeout: 15_000 }).toBe(true);
  if (await page.locator('.app').getAttribute('data-waiting') === 'TargetSelection') {
    const responseTargets = panel(page).locator('details[data-target-list]');
    if (!(await responseTargets.evaluate((node: HTMLDetailsElement) => node.open))) await responseTargets.locator('summary').click();
    const boltOnStack = responseTargets.locator('button').filter({ hasText: /Elegir Lightning Bolt/ }).first();
    await expect(boltOnStack).toBeVisible();
    await boltOnStack.click();
  }
  await expect.poll(() => applied(page), { timeout: 30_000 }).toBeGreaterThan(beforeResponse);
  await expect(page.locator('.app')).toHaveAttribute('data-waiting', 'Priority');
  await expect(page.locator('.app')).toHaveAttribute('data-viewer', '1');
  const stack = page.locator('section[aria-label="Pila"] ol li');
  await expect(stack).toHaveCount(2);
  await expect(stack.filter({ hasText: 'Counterspell' }).first()).toContainText('Lightning Bolt');
  await expect(page.locator('section[aria-label="Pila"]')).toHaveAttribute('data-empty', 'false');
});

test('una pila vacía no se presenta como Resolve All satisfactorio', async ({ page }) => {
  await openScenario(page, 'priority-empty');
  await openMoreOptions(page);
  await expect(page.locator('section[aria-label="Pila"]')).toHaveAttribute('data-empty', 'true');
  await expect(panel(page).locator('button[data-resolve-all-own]')).toHaveCount(0);
  await expect(panel(page)).not.toContainText('pila resuelta');
});

test('CancelAutoPass revoca la sesión propia publicada por Phase', async ({ page }) => {
  test.setTimeout(180_000);
  await openScenario(page, 'priority-auto-pass');
  const cancel = page.locator('[data-decision-cancel="cancel-auto-pass"]');
  await expect(cancel).toBeVisible({ timeout: 30_000 });
  await expect(cancel).toContainText('Cancelar pase hasta la frontera de turno');
  const before = await applied(page);
  await cancel.click();
  await expect.poll(() => applied(page), { timeout: 30_000 }).toBeGreaterThan(before);
  await expect(cancel).toHaveCount(0);
  await expect(page.locator('.app')).toHaveAttribute('data-viewer', '0');
});
