import { expect, test, type Page } from '@playwright/test';
import { createBoardDriver } from './support/board-driver.ts';

/**
 * 0.5 — a pasted 10E deck played through the Svelte controls, including a real
 * block: select a blocker, assign it to an attacker, confirm, and check that
 * Phase accepted the assignment (its own `BlockersDeclared` shows up in the
 * game log and the creature keeps the blocking role).
 *
 * The deck is 40 cards: 17 Plains (core pack) + 22 creatures and one red
 * enchantment that **only** the 10E pack carries. `Arcane Teachings` is the
 * known-limitation card (`SilentDrop:1_of_2`), so the game only starts with
 * explicit consent.
 *
 * The board is played with the shared driver (`tests/e2e/support/board-driver.ts`):
 * it only clicks what Mesa shows — the panel, the hand, the cards — and Phase
 * decides what is legal. The driver knows how to answer every decision the
 * interface offers, including the cleanup discard (CR 514.1): without that the
 * game froze at the end of the first turn with more than seven cards.
 *
 * Selectors were checked against the components (`DeckBuilder.svelte`,
 * `Board.svelte`, `DecisionPanel.svelte`, `Hand.svelte`, `CardView.svelte`,
 * `HistoryPanel.svelte`). First executed in a browser with the real engine in
 * CI (2026-10-30): see `docs/VERIFICATION-0.5.2.md`.
 */

/** 17 + 1 + 22 = 40. All but Plains live in the `10e` pack only. */
const DECK = [
  '17 Plains',
  '1 Arcane Teachings',
  '2 Suntail Hawk',
  '2 Soul Warden',
  '2 Honor Guard',
  '2 Youthful Knight',
  '2 Wild Griffin',
  '2 Benalish Knight',
  '2 Skyhunter Skirmisher',
  '2 Steadfast Guard',
  '2 True Believer',
  '2 Aven Cloudchaser',
  '2 Voice of All'
].join('\n');

const LIMITED = 'Arcane Teachings';

const hand = (page: Page) => page.locator('section[aria-label^="Tu mano"]');

async function openBuilder(page: Page) {
  await page.getByRole('button', { name: 'Mis mazos' }).click();
  await expect(page.getByTestId('deck-builder')).toBeVisible();
}

async function importDeck(page: Page, list = DECK) {
  await openBuilder(page);
  await page.getByRole('button', { name: 'Importar lista' }).click();
  await page.getByLabel(/Pega una lista/).fill(list);
  await page.getByRole('button', { name: 'Convertir lista' }).click();
  await expect(page.getByTestId('deck-total')).toHaveText('40 cartas');
}

/** The seat hand-off dialog blocks the board; dismiss it like a person would. */
function answerHandoff(page: Page) {
  return page.addLocatorHandler(page.locator('.handoff button'), async () => {
    await page.locator('.handoff button').click({ timeout: 3_000 }).catch(() => {});
  });
}

/** Import the 10E deck, accept the known limitation and wait for a hand. */
async function startDeckGame(page: Page) {
  await importDeck(page);
  await page.getByRole('button', { name: 'Jugar con este mazo' }).click();
  // Loading the 10E pack and discovering parser limitations is asynchronous.
  // Do not skip the explicit consent merely because the checkbox has not appeared yet.
  await expect(page.getByRole('alert')).toContainText(LIMITED, { timeout: 120_000 });
  const consent = page.getByRole('checkbox', { name: /Permitir 1 carta\(s\) con limitaciones conocidas/ });
  await expect(consent).toBeVisible();
  await consent.check();
  await page.getByRole('button', { name: 'Jugar con este mazo' }).click();
  await answerHandoff(page);
  await expect(hand(page).locator('[data-card-id]').first()).toBeVisible({ timeout: 180_000 });
}

test('mazo pegado de 10E: estados, descarga selectiva y arranque 40/40', async ({ page }) => {
  test.setTimeout(360_000);
  await page.route('**/api.scryfall.com/**', (route) => route.abort());

  const packRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/data/catalog/packs/')) packRequests.push(url.pathname + url.search);
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mesa', exact: true })).toBeVisible();

  // 1. Import: the 10E cards are *pending*, not missing, and do not block Play.
  await importDeck(page);
  await expect(page.locator('[data-state="pending"]').first()).toBeVisible();
  await expect(page.locator('[data-state="absent"]')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: /se descarga al iniciar/ })).toBeVisible();
  expect(packRequests.filter((url) => url.startsWith('/data/catalog/packs/10e.json'))).toEqual([]);

  const play = page.getByRole('button', { name: 'Jugar con este mazo' });
  await expect(play).toBeEnabled();
  await play.click();

  // 2. One known limitation blocks the start until it is accepted explicitly.
  const alert = page.getByRole('alert');
  await expect(alert).toContainText(LIMITED, { timeout: 120_000 });
  await expect(alert).toContainText(/limitaciones conocidas/i);
  await page.getByRole('checkbox', { name: /Permitir 1 carta\(s\) con limitaciones conocidas/ }).check();
  await play.click();

  // 3. Only the pack the deck needs is fetched, and its URL carries the digest.
  await expect(page.getByRole('status').filter({ hasText: /Motor: 40 \/ 40/ })).toBeVisible({ timeout: 180_000 });
  const tenE = packRequests.find((url) => url.startsWith('/data/catalog/packs/10e.json'));
  expect(tenE, 'la partida debe descargar el pack 10e').toBeTruthy();
  expect(tenE).toMatch(/\?v=[0-9a-f]{64}$/);
  expect([...new Set(packRequests.map((url) => url.split('?')[0]))].sort())
    .toEqual(['/data/catalog/packs/10e.json', '/data/catalog/packs/fixture.json']);
});

test('bloqueo real: asignar bloqueadora a un atacante y ver que Phase lo acepta', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api.scryfall.com/**', (route) => route.abort());

  await page.goto('/');
  // The board is read with the automatic pass off: the test wants to see the
  // combat state that Phase published when the blocks were declared, not the
  // state left after the game moved on (a blocker that died is no longer on
  // the battlefield, and its role with it).
  await page.getByRole('checkbox', { name: 'Auto-pasar ventanas sin acciones' }).uncheck();
  await startDeckGame(page);
  const driver = createBoardDriver(page);

  // Play until seat 0 has an attacker and seat 1 a valid blocker. Bounded on
  // purpose: the test fails with the last state instead of hanging.
  let attacked = false;
  let attackerName = '';
  for (let step = 0; step < 400 && !attacked; step += 1) {
    if (await page.locator('.game-over').isVisible().catch(() => false)) break;
    const waiting = await driver.waiting();
    const viewer = await driver.viewer();

    if (waiting === 'DeclareAttackers' && viewer === 0) {
      const candidates = driver.battlefield.locator('[data-card-id][data-attack-options]:not([data-attack-options="0"])');
      if (await candidates.count()) {
        const attacker = candidates.first();
        const id = await attacker.getAttribute('data-card-id');
        await driver.clickCard(attacker);
        // A single destination is auto-assigned by the controller; if there are
        // several, the panel offers one button per destination.
        const destination = driver.decision.locator('button').filter({ hasText: /^Atacar a / }).first();
        if (await destination.count()) await driver.press(destination);
        const confirm = driver.decision.locator('button').filter({ hasText: /^Confirmar ataque/ }).first();
        if (await driver.press(confirm)) {
          // The board changes hands right after the attack (the defending
          // seat is the one that has to block), so the attacking creature is
          // looked up wherever the board is showing it now.
          await expect(page.locator(`[data-card-id="${id}"][data-combat-role="Atacando"]`)).toHaveCount(1);
          attacked = true;
          attackerName = (await page.locator(`[data-card-id="${id}"] .fallback-name`).innerText()).trim();
          break;
        }
      }
    }
    // A seat with no attackers yet has to build one: play the cards Mesa
    // marks as playable, and answer the cleanup discard that closes the turn.
    if (waiting === 'Priority' && (await driver.playPlayableCard())) continue;
    if (!(await driver.answerAnyPrompt())) await page.waitForTimeout(80);
  }
  expect(attacked, 'no se llegó a declarar un atacante').toBe(true);

  // Seat 1 must now declare blockers. Wait for that prompt, answering the
  // priority windows in between.
  let blocking = false;
  for (let step = 0; step < 200; step += 1) {
    const waiting = await driver.waiting();
    const viewer = await driver.viewer();
    if (waiting === 'DeclareBlockers' && viewer === 1) { blocking = true; break; }
    if (await page.locator('.game-over').isVisible().catch(() => false)) break;
    if (!(await driver.answerAnyPrompt())) await page.waitForTimeout(80);
  }
  expect(blocking, 'no se llegó a la ventana de bloqueo').toBe(true);

  // The attacking creature is visible with its combat role from Phase's state.
  const attackerCard = driver.rivalField.locator('[data-combat-role="Atacando"]').first();
  await expect(attackerCard).toHaveCount(1);
  const attackerId = await attackerCard.getAttribute('data-card-id');

  // A creature the engine reports as able to block.
  const blockerCard = driver.battlefield.locator('[data-card-id][data-block-options]:not([data-block-options="0"])').first();
  await expect(blockerCard, 'Phase no ofrece ninguna bloqueadora válida').toHaveCount(1);
  const blockerId = await blockerCard.getAttribute('data-card-id');
  const blockerName = (await blockerCard.locator('.fallback-name').innerText()).trim();

  // 1) select the blocker, 2) click the attacker it will block.
  await driver.clickCard(blockerCard);
  await driver.clickCard(driver.rivalField.locator(`[data-card-id="${attackerId}"]`));

  // The draft is the pair the player is about to send, named not numeric.
  const draft = driver.decision.locator('ul[aria-label="Bloqueos elegidos"]');
  await expect(draft).toContainText(blockerName);
  await expect(draft).toContainText(attackerName);

  // 3) confirm: Phase validates the assignment and answers with a new revision.
  const before = await driver.revision();
  await driver.press(driver.decision.locator('button').filter({ hasText: /^Confirmar bloqueos/ }).first());
  expect(await driver.revision()).toBeGreaterThan(before);

  // 4) Proof that Phase accepted it: its own event, in the game log.
  await expect(driver.log).toContainText(`${blockerName} bloquea a ${attackerName}`, { timeout: 15_000 });
  // 5) And the visible state: the blocker keeps the blocking role, the attacker
  //    is still marked as the one that attacked. The board changes hands again
  //    when the damage is dealt, so both creatures are looked up wherever the
  //    board is showing them now.
  const blockerAfter = page.locator(`[data-card-id="${blockerId}"]`);
  await expect(blockerAfter).toHaveAttribute('data-combat-role', 'Bloqueando');
  await expect(blockerAfter.locator('.status-strip')).toContainText('Bloqueando');
  await expect(page.locator(`[data-card-id="${attackerId}"][data-combat-role="Atacando"]`)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('estado de bloqueo: el tablero queda inerte, cubierto y sin fuga de mano', async ({ page }) => {
  test.setTimeout(240_000);
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/');

  await page.getByRole('checkbox', { name: 'Confirmar cada cambio de asiento' }).check();
  await importDeck(page);
  await page.getByRole('button', { name: 'Jugar con este mazo' }).click();
  // The 10E pack is loaded asynchronously; wait for Phase's actual warning
  // instead of treating a not-yet-visible alert as permission to continue.
  await expect(page.getByRole('alert')).toContainText(LIMITED, { timeout: 120_000 });
  await page.getByRole('checkbox', { name: /Permitir 1 carta\(s\) con limitaciones conocidas/ }).check();
  await page.getByRole('button', { name: 'Jugar con este mazo' }).click();

  const driver = createBoardDriver(page);
  // The board changes hands when the seat that is looking at it answers its
  // mulligan: the other seat is the one that has to decide next (CR 103.5),
  // and Mesa asks for the device before showing that seat's cards.
  const keep = driver.decision.locator('button').filter({ hasText: 'Conservar mano' }).first();
  await expect(keep).toBeVisible({ timeout: 180_000 });
  await keep.click({ timeout: 5_000 });

  const dialog = page.getByRole('dialog', { name: 'Paso de asiento' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole('button', { name: 'Estoy listo' })).toBeFocused();

  const board = page.locator('main.layout');
  await expect(board).toHaveAttribute('aria-hidden', 'true');
  await expect(board).toHaveAttribute('inert', '');

  const geometry = await page.locator('.handoff').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      background: style.backgroundColor,
      opacity: Number(style.opacity)
    };
  });
  expect(geometry.width).toBeGreaterThanOrEqual(geometry.viewportWidth);
  expect(geometry.height).toBeGreaterThanOrEqual(geometry.viewportHeight);
  expect(geometry.opacity).toBeGreaterThan(0.9);
  expect(geometry.background).not.toBe('rgba(0, 0, 0, 0)');

  // The seat handing the device over must not be able to read the incoming
  // seat's cards: the overlay only dims the board, so a hand painted under it
  // would still be legible (the cards were readable in a browser check).
  await expect(page.locator('section[aria-label^="Tu mano"] [data-card-id]')).toHaveCount(0);
  await expect(page.locator('.mini-back')).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Estoy listo' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(board).not.toHaveAttribute('inert', '');
  // The incoming seat does see its own hand once it takes the device.
  await expect(page.locator('section[aria-label^="Tu mano"] [data-card-id]').first()).toBeVisible({ timeout: 10_000 });
});

test('la partida se juega hasta el final con acciones, combate y resultado', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api.scryfall.com/**', (route) => route.abort());

  await page.goto('/');
  await startDeckGame(page);
  const driver = createBoardDriver(page);

  let sawAttack = false;
  let sawBlock = false;
  let interactions = 0;
  let stalls = 0;

  for (let step = 0; step < 600; step += 1) {
    if (await page.locator('.game-over').isVisible().catch(() => false)) break;
    const waiting = await driver.waiting();
    const viewer = await driver.viewer();

    if (waiting === 'DeclareAttackers' && viewer === 0) {
      const attackers = driver.battlefield.locator('[data-card-id][data-attack-options]:not([data-attack-options="0"])');
      if (await attackers.count()) sawAttack = true;
      for (const card of await attackers.all()) await driver.clickCard(card);
      const confirm = driver.decision.locator('button').filter({ hasText: /^Confirmar ataque/ }).first();
      if (await driver.press(confirm)) interactions += 1; else await driver.answerAnyPrompt();
      continue;
    }
    if (waiting === 'DeclareBlockers' && viewer === 1) {
      // A block only counts once Phase logged it; the prompt alone proves nothing.
      const blocker = driver.battlefield.locator('[data-card-id][data-block-options]:not([data-block-options="0"])').first();
      const attacker = driver.rivalField.locator('[data-combat-role="Atacando"]').first();
      if (await blocker.count() && await attacker.count()) {
        await driver.clickCard(blocker);
        await driver.clickCard(attacker);
        const confirm = driver.decision.locator('button').filter({ hasText: /^Confirmar bloqueos/ }).first();
        if (await driver.press(confirm)) {
          interactions += 1;
          if (await driver.log.locator('li').filter({ hasText: /bloquea a/ }).count()) sawBlock = true;
          continue;
        }
      }
      if (await driver.press(driver.decision.locator('button').filter({ hasText: /^No bloquear/ }).first())) { interactions += 1; continue; }
    }
    // Play what the interface offers, then answer the decision that is open.
    if (waiting === 'Priority' && (await driver.playPlayableCard())) { interactions += 1; continue; }
    if (await driver.answerAnyPrompt()) { interactions += 1; continue; }

    if (++stalls > 40) {
      throw new Error(`La interfaz se bloqueó en el paso ${step}: waiting=${waiting}, viewer=${viewer}`);
    }
    await page.waitForTimeout(100);
  }

  await expect(page.locator('.game-over')).toBeVisible({ timeout: 180_000 });
  await expect(page.locator('.game-over')).toContainText(/gana|Empate/);
  expect(interactions).toBeGreaterThan(10);
  test.info().annotations.push({ type: 'interacciones', description: `${interactions} acciones; ataque=${sawAttack}; bloqueo registrado=${sawBlock}` });
  expect(errors).toEqual([]);
});
