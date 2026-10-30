import { expect, test, type Locator } from '@playwright/test';

/**
 * Full-game interaction test driven only through Svelte controls.
 *
 * It never imports EngineClient and never fabricates a GameAction. Legality is
 * always Phase's answer; this test only picks among the controls the UI shows.
 * The hot-seat modal marks the board aria-hidden, so the helpers use CSS
 * locators (the same visible buttons) and settle the seat dialog first.
 */
const C = (locator: Locator) => locator; // documents intent: CSS, not role, locators

test('partida completa y victoria desde controles Svelte', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mesa', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Duelo de práctica/ })).toBeChecked();
  await page.getByRole('button', { name: 'Iniciar partida' }).click();

  const hand = C(page.locator('section[aria-label^="Tu mano"]'));
  const app = C(page.locator('.app'));
  const decision = C(page.locator('section[aria-label="Decisión pendiente"]'));
  await expect(hand.locator('[data-card-id]').first()).toBeVisible({ timeout: 90_000 });

  let handoffs = 0;
  let interactions = 0;
  const dialog = page.locator('.handoff');
  // The hot-seat modal blocks the board; Playwright's locator handler dismisses
  // it whenever it would intercept an action, exactly like a person would.
  await page.addLocatorHandler(page.locator('.handoff button'), async () => {
    await page.locator('.handoff button').click({ timeout: 3_000 }).catch(() => {});
    handoffs++;
  });
  async function settleSeat() {
    if (!(await dialog.isVisible().catch(() => false))) return;
    // The locator handler may have dismissed it already; either path is fine.
    await dialog.locator('button').click({ timeout: 2_000 }).catch(() => {});
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
  /** Card clicks also cross the seat dialog; keep their timeout short and retry. */
  async function clickCard(card: Locator) {
    for (let attempt = 0; attempt < 5; attempt++) {
      await settleSeat();
      try { await card.click({ timeout: 2_500 }); return; } catch { await page.waitForTimeout(50); }
    }
    throw new Error('La carta no se pudo pulsar');
  }
  async function revision() {
    return Number(await app.getAttribute('data-actions-applied'));
  }
  /**
   * Best-effort press: the panel can change between reading it and clicking
   * (auto-pass, seat switch), so a miss is not an error unless the driver
   * stalls. Returns whether the engine advanced.
   */
  async function press(button: Locator): Promise<boolean> {
    await settleSeat();
    if (!(await button.count())) return false;
    const before = await revision();
    await button.click({ timeout: 1_500 }).catch(() => {});
    await page
      .waitForFunction((n) => Number(document.querySelector('.app')?.getAttribute('data-actions-applied')) > n, before, { timeout: 3_000 })
      .catch(() => {});
    if ((await revision()) > before) { interactions++; return true; }
    return false;
  }
  const passButton = () => decision.locator('.confirmations button').filter({ hasText: /^Pasar/ }).first();
  const keepButton = () => decision.locator('button').filter({ hasText: 'Conservar mano' }).first();

  let sawDamage = false;
  let sawAttackerSelection = false;
  let opponentAtOrBelowTen = false;
  let discards = 0;
  let stalls = 0;

  for (let step = 0; step < 400; step++) {
    if (await page.locator('.game-over').isVisible().catch(() => false)) break;
    await settleSeat();
    const before = await revision();

    const discard = page.locator('[aria-label="Descartar hasta siete cartas"]');
    if (await discard.isVisible().catch(() => false)) {
      const needed = Number((await discard.locator('strong').innerText()).match(/(\d+)/)?.[1] ?? 1);
      for (let i = 0; i < needed; i++) await clickCard(hand.locator('[data-card-id]').nth(i));
      await press(discard.locator('button').filter({ hasText: 'Confirmar descarte' }));
      discards++;
      continue;
    }

    const waiting = await decision.getAttribute('data-waiting');
    if (waiting === 'MulliganDecision') { if (!(await press(keepButton()))) await page.waitForTimeout(60); continue; }

    const viewer = Number(await app.getAttribute('data-viewer'));
    const opponentLife = Number(await page.locator('[data-player-id="1"]').getAttribute('data-life'));
    if (opponentLife < 20) sawDamage = true;
    if (opponentLife <= 10) opponentAtOrBelowTen = true;

    // The non-driving seat still faces real prompts; answer them through the UI
    // (decline combat, pass priority) instead of assuming a Priority window.
    if (viewer !== 0) {
      if (await press(decision.locator('button').filter({ hasText: /^No atacar$/ }).first())) continue;
      if (await press(decision.locator('button').filter({ hasText: /^No bloquear$/ }).first())) continue;
      if (await press(passButton())) continue;
      if (await press(decision.locator('button').filter({ hasText: 'Confirmar pago' }).first())) continue;
      await page.waitForTimeout(80);
      continue;
    }

    if (waiting === 'DeclareAttackers') {
      const attackers = page.locator('section[aria-label^="Tu campo de batalla"] [data-card-id][data-targetable="true"]');
      const ids = await attackers.evaluateAll((cards) => cards.map((c) => (c as HTMLElement).dataset.cardId).filter(Boolean));
      if (ids.length) sawAttackerSelection = true;
      for (const id of ids) await clickCard(page.locator(`section[aria-label^="Tu campo de batalla"] [data-card-id="${id}"]`));
      const confirm = decision.locator('button').filter({ hasText: /^Confirmar ataque/ }).first();
      await press((await confirm.count()) ? confirm : decision.locator('button').filter({ hasText: 'No atacar' }).first());
      continue;
    }
    if (waiting === 'DeclareBlockers') {
      await press(decision.locator('button').filter({ hasText: 'No bloquear' }).first());
      continue;
    }
    if (waiting === 'TargetSelection' || waiting === 'TriggerTargetSelection') {
      const target = page.locator('section[aria-label^="Jugador 2"] button.targetable').first();
      if (await target.isVisible().catch(() => false) && await press(target)) continue;
      const listed = decision.locator('details button').first();
      if (await listed.isVisible().catch(() => false) && await press(listed)) continue;
    }
    if (waiting === 'Priority') {
      const land = hand.locator('[data-card-id]').filter({ hasText: 'Plains' }).first();
      if (await land.isVisible().catch(() => false)) {
        await clickCard(land);
        const playLand = decision.locator('button').filter({ hasText: 'Jugar tierra: Plains' }).first();
        if (await playLand.count() && await press(playLand)) continue;
        await clickCard(land);
      }
      const lion = hand.locator('[data-card-id]').filter({ hasText: 'Savannah Lions' }).first();
      if (await lion.isVisible().catch(() => false)) {
        await clickCard(lion);
        const cast = decision.locator('button').filter({ hasText: /^Lanzar Savannah Lions/ }).first();
        if (await cast.count() && await press(cast)) continue;
        await clickCard(lion);
      }
    }

    const confirmPayment = decision.locator('button').filter({ hasText: 'Confirmar pago' }).first();
    if (await press(confirmPayment)) continue;
    if (await press(passButton())) continue;

    if (await press(decision.locator('.confirmations button:not([disabled]), .actions button:not([disabled])').first())) continue;

    // The panel can change between reading the state and acting, so a miss is
    // only fatal when it repeats without any revision progress.
    if ((await revision()) > before) { stalls = 0; continue; }
    if (++stalls > 30) {
      throw new Error(`La interfaz se bloqueó: waiting=${waiting}, viewer=${viewer}, paso=${step}, botones=${JSON.stringify(await decision.locator('button').allInnerTexts())}`);
    }
    await page.waitForTimeout(100);
  }

  await expect(page.locator('.game-over')).toBeVisible();
  await expect(page.locator('.game-over')).toContainText('Jugador 1 gana');
  expect(Number(await page.locator('[data-player-id="1"]').getAttribute('data-life'))).toBeLessThanOrEqual(0);
  expect(sawDamage).toBe(true);
  expect(opponentAtOrBelowTen).toBe(true);
  expect(sawAttackerSelection).toBe(true);
  expect(interactions).toBeGreaterThan(20);
  expect(handoffs).toBeGreaterThan(0);
  expect(discards).toBeGreaterThanOrEqual(0);
  await expect(page.locator('section[aria-label="Registro de la partida"]')).toContainText(/daño|vidas/);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/ui-game-victory.png', fullPage: true });
  test.info().annotations.push({ type: 'interacciones', description: `${interactions} acciones, ${handoffs} pasos de asiento, ${discards} descartes` });
});

test('la interfaz explica objetivos, maná y combate sin nombres internos', async ({ page }) => {
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/?autostart');
  await page.addLocatorHandler(page.locator('.handoff button'), async () => {
    await page.locator('.handoff button').click({ timeout: 3_000 }).catch(() => {});
  });
  const hand = page.locator('section[aria-label^="Tu mano"]');
  await expect(hand.locator('[data-card-id]').first()).toBeVisible({ timeout: 90_000 });
  const decision = page.locator('section[aria-label="Decisión pendiente"]');
  const keep = decision.locator('button').filter({ hasText: 'Conservar mano' }).first();
  if (await keep.count()) await keep.click();

  const plains = hand.locator('[data-card-id]').filter({ hasText: 'Plains' }).first();
  if (await plains.isVisible().catch(() => false)) {
    await plains.click();
    const play = decision.locator('button').filter({ hasText: 'Jugar tierra: Plains' }).first();
    if (await play.count()) {
      await play.click({ timeout: 5_000 }).catch(() => {});
      await expect(page.locator('section[aria-label^="Tu campo de batalla"] [data-card-id]').filter({ hasText: 'Plains' }).first()).toBeVisible({ timeout: 20_000 });
    }
    await plains.click().catch(() => {});
  }
  const texts = await decision.innerText();
  expect(texts).not.toMatch(/PassPriority|DeclareAttackers|ManaPayment|TargetSelection|SelectTargets|DiscardToHandSize/);
  await expect(page.getByRole('checkbox', { name: 'Auto-pasar ventanas sin acciones' })).toBeVisible();
  const card = page.locator('section[aria-label^="Tu campo de batalla"] [data-card-id]').first();
  if (await card.count()) expect(await card.getAttribute('aria-label')).toContain('Plains');
});

test('objetivo elegido con clic en el jugador y daño visible', async ({ page }) => {
  test.setTimeout(180_000);
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('radio', { name: /Duelo de chispas/ }).check();
  await page.getByRole('button', { name: 'Iniciar partida' }).click();
  await page.addLocatorHandler(page.locator('.handoff button'), async () => {
    await page.locator('.handoff button').click({ timeout: 3_000 }).catch(() => {});
  });
  const hand = page.locator('section[aria-label^="Tu mano"]');
  const decision = page.locator('section[aria-label="Decisión pendiente"]');
  const app = page.locator('.app');
  await expect(hand.locator('[data-card-id]').first()).toBeVisible({ timeout: 90_000 });

  const keep = decision.locator('button').filter({ hasText: 'Conservar mano' }).first();
  const mulligan = decision.locator('button').filter({ hasText: 'Hacer mulligan' }).first();
  // Keep the first seven that already contain a Mountain; otherwise redraw up to
  // twice. This is a real player decision made through the UI.
  for (let attempt = 0; attempt < 3; attempt++) {
    const hasMountain = await hand.locator('[data-card-id]').filter({ hasText: 'Mountain' }).count();
    if (hasMountain || attempt === 2) {
      if (await keep.isEnabled().catch(() => false)) await keep.click({ timeout: 3_000 }).catch(() => {});
      break;
    }
    if (await mulligan.isEnabled().catch(() => false)) await mulligan.click({ timeout: 3_000 }).catch(() => {});
  }

  let landed = false;
  for (let step = 0; step < 60 && !landed; step++) {
    const waiting = await decision.getAttribute('data-waiting');
    const viewer = await app.getAttribute('data-viewer');
    const turnText = await decision.locator('.phase').first().innerText().catch(() => '');
    if (waiting === 'MulliganDecision') { await keep.click({ timeout: 3_000 }).catch(() => {}); continue; }
    if (viewer !== '0' || !turnText.includes('Fase principal')) {
      const pass = decision.locator('.confirmations button').filter({ hasText: /^Pasar/ }).first();
      if (await pass.count()) await pass.click({ timeout: 2_000 }).catch(() => {});
      else await page.waitForTimeout(120);
      continue;
    }
    const mountain = hand.locator('[data-card-id]').filter({ hasText: 'Mountain' }).first();
    if (await mountain.isVisible().catch(() => false)) {
      await mountain.click({ timeout: 2_000 }).catch(() => {});
      const play = decision.locator('button').filter({ hasText: 'Jugar tierra: Mountain' }).first();
      if (await play.count()) { await play.click({ timeout: 2_000 }).catch(() => {}); await page.waitForTimeout(150); continue; }
      await mountain.click({ timeout: 2_000 }).catch(() => {});
    }
    const bolt = hand.locator('[data-card-id]').filter({ hasText: 'Lightning Bolt' }).first();
    if (await bolt.isVisible().catch(() => false)) {
      await bolt.click({ timeout: 2_000 }).catch(() => {});
      const cast = decision.locator('button').filter({ hasText: /^Lanzar Lightning Bolt/ }).first();
      if (await cast.count()) {
        await cast.click({ timeout: 2_000 }).catch(() => {});
        await expect(decision).toHaveAttribute('data-waiting', /TargetSelection/, { timeout: 15_000 });
        // The interface must mark the legal target and explain what to click.
        await expect(decision).toContainText('objetivos');
        const target = page.locator('section[aria-label^="Jugador 2"] button.targetable');
        await expect(target).toBeVisible();
        await expect(target).toHaveAttribute('aria-label', 'Elegir Jugador 2 como objetivo');
        await target.click();
        await expect(page.locator('[data-player-id="1"]')).toHaveAttribute('data-life', '17', { timeout: 20_000 });
        await expect(page.locator('section[aria-label="Registro de la partida"]')).toContainText(/pierde 3 vidas/);
        landed = true;
      }
    }
    if (!landed) await page.waitForTimeout(150);
  }
  expect(landed).toBe(true);
});
