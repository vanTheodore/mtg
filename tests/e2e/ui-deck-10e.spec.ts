import { expect, test, type Locator, type Page } from '@playwright/test';

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
 * Selectors were checked against the components (`DeckBuilder.svelte`,
 * `Board.svelte`, `DecisionPanel.svelte`, `Hand.svelte`, `CardView.svelte`,
 * `HistoryPanel.svelte`). **NO EJECUTADO en este entorno**: no hay navegador
 * (ver `docs/VERIFICATION-0.5.md` §1 y `docs/BROWSER-RUNBOOK.md`).
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
const decision = (page: Page) => page.locator('section[aria-label="Decisión pendiente"]');
const battlefield = (page: Page) => page.locator('section[aria-label^="Tu campo de batalla"]');
const rivalField = (page: Page) => page.locator('section[aria-label^="Campo de batalla"]');
const log = (page: Page) => page.locator('section[aria-label="Registro de la partida"]');
const app = (page: Page) => page.locator('.app');

const revision = async (page: Page) => Number(await app(page).getAttribute('data-actions-applied'));

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

/** One click on a card, retrying while the seat dialog settles. */
async function clickCard(page: Page, card: Locator) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { await card.click({ timeout: 2_500 }); return; } catch { await page.waitForTimeout(60); }
  }
  throw new Error('No se pudo pulsar la carta');
}

/** Click a panel button and report whether Phase moved the game. */
async function press(page: Page, button: Locator): Promise<boolean> {
  if (!(await button.count())) return false;
  const before = await revision(page);
  await button.click({ timeout: 2_000 }).catch(() => {});
  await page
    .waitForFunction((value) => Number(document.querySelector('.app')?.getAttribute('data-actions-applied')) > value, before, { timeout: 4_000 })
    .catch(() => {});
  return (await revision(page)) > before;
}

/** Pass, keep, confirm whatever the panel is currently asking. */
async function answerAnyPrompt(page: Page): Promise<boolean> {
  const d = decision(page);
  if (await press(page, d.locator('button').filter({ hasText: 'Conservar mano' }).first())) return true;
  if (await press(page, d.locator('button').filter({ hasText: 'Confirmar pago' }).first())) return true;
  if (await press(page, d.locator('button').filter({ hasText: /^No atacar$/ }).first())) return true;
  if (await press(page, d.locator('button').filter({ hasText: /^No bloquear$/ }).first())) return true;
  if (await press(page, d.locator('.confirmations button').filter({ hasText: /^Pasar/ }).first())) return true;
  return press(page, d.locator('.confirmations button:not([disabled])').first());
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
  await startDeckGame(page);

  // Play until seat 0 has an attacker and seat 1 a valid blocker. Bounded on
  // purpose: the test fails with the last state instead of hanging.
  let attacked = false;
  let attackerName = '';
  for (let step = 0; step < 400 && !attacked; step += 1) {
    if (await page.locator('.game-over').isVisible().catch(() => false)) break;
    const waiting = await decision(page).getAttribute('data-waiting');
    const viewer = Number(await app(page).getAttribute('data-viewer'));

    if (waiting === 'DeclareAttackers' && viewer === 0) {
      const candidates = battlefield(page).locator('[data-card-id][data-attack-options]:not([data-attack-options="0"])');
      if (await candidates.count()) {
        const attacker = candidates.first();
        const id = await attacker.getAttribute('data-card-id');
        await clickCard(page, attacker);
        // A single destination is auto-assigned by the controller; if there are
        // several, the panel offers one button per destination.
        const destination = decision(page).locator('button').filter({ hasText: /^Atacar a / }).first();
        if (await destination.count()) await press(page, destination);
        const confirm = decision(page).locator('button').filter({ hasText: /^Confirmar ataque/ }).first();
        if (await press(page, confirm)) {
          await expect(battlefield(page).locator(`[data-card-id="${id}"][data-combat-role="Atacando"]`)).toHaveCount(1);
          attacked = true;
          attackerName = (await battlefield(page).locator(`[data-card-id="${id}"] .fallback-name`).innerText()).trim();
          break;
        }
      }
    }
    if (!(await answerAnyPrompt(page)) && !(await press(page, hand(page).locator('[data-card-id]').first()))) {
      await page.waitForTimeout(80);
    }
  }
  expect(attacked, 'no se llegó a declarar un atacante').toBe(true);

  // Seat 1 must now declare blockers. Wait for that prompt, answering the
  // priority windows in between.
  let blocking = false;
  for (let step = 0; step < 200; step += 1) {
    const waiting = await decision(page).getAttribute('data-waiting');
    const viewer = Number(await app(page).getAttribute('data-viewer'));
    if (waiting === 'DeclareBlockers' && viewer === 1) { blocking = true; break; }
    if (await page.locator('.game-over').isVisible().catch(() => false)) break;
    if (!(await answerAnyPrompt(page))) await page.waitForTimeout(80);
  }
  expect(blocking, 'no se llegó a la ventana de bloqueo').toBe(true);

  // The attacking creature is visible with its combat role from Phase's state.
  const attackerCard = rivalField(page).locator('[data-combat-role="Atacando"]').first();
  await expect(attackerCard).toHaveCount(1);
  const attackerId = await attackerCard.getAttribute('data-card-id');

  // A creature the engine reports as able to block.
  const blockerCard = battlefield(page).locator('[data-card-id][data-block-options]:not([data-block-options="0"])').first();
  await expect(blockerCard, 'Phase no ofrece ninguna bloqueadora válida').toHaveCount(1);
  const blockerId = await blockerCard.getAttribute('data-card-id');
  const blockerName = (await blockerCard.locator('.fallback-name').innerText()).trim();

  // 1) select the blocker, 2) click the attacker it will block.
  await clickCard(page, blockerCard);
  await clickCard(page, rivalField(page).locator(`[data-card-id="${attackerId}"]`));

  // The draft is the pair the player is about to send, named not numeric.
  const draft = decision(page).locator('ul[aria-label="Bloqueos elegidos"]');
  await expect(draft).toContainText(blockerName);
  await expect(draft).toContainText(attackerName);

  // 3) confirm: Phase validates the assignment and answers with a new revision.
  const before = await revision(page);
  await press(page, decision(page).locator('button').filter({ hasText: /^Confirmar bloqueos/ }).first());
  expect(await revision(page)).toBeGreaterThan(before);

  // 4) Proof that Phase accepted it: its own event, in the game log.
  await expect(log(page)).toContainText(`${blockerName} bloquea a ${attackerName}`, { timeout: 15_000 });
  // 5) And the visible state: the blocker keeps the blocking role, the attacker
  //    is still marked as the one that attacked.
  const blockerAfter = battlefield(page).locator(`[data-card-id="${blockerId}"]`);
  await expect(blockerAfter).toHaveAttribute('data-combat-role', 'Bloqueando');
  await expect(battlefield(page).locator('.status-strip')).toContainText('Bloqueando');
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

  const dialog = page.getByRole('dialog', { name: 'Paso de asiento' });
  await expect(dialog).toBeVisible({ timeout: 180_000 });
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
  await expect(page.locator('.mini-back')).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Estoy listo' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(board).not.toHaveAttribute('inert', '');
});

test('la partida se juega hasta el final con acciones, combate y resultado', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api.scryfall.com/**', (route) => route.abort());

  await page.goto('/');
  await startDeckGame(page);

  let sawAttack = false;
  let sawBlock = false;
  let interactions = 0;
  let stalls = 0;

  for (let step = 0; step < 600; step += 1) {
    if (await page.locator('.game-over').isVisible().catch(() => false)) break;
    const waiting = await decision(page).getAttribute('data-waiting');
    const viewer = Number(await app(page).getAttribute('data-viewer'));

    if (waiting === 'DeclareAttackers' && viewer === 0) {
      const attackers = battlefield(page).locator('[data-card-id][data-attack-options]:not([data-attack-options="0"])');
      if (await attackers.count()) sawAttack = true;
      for (const card of await attackers.all()) await clickCard(page, card);
      const confirm = decision(page).locator('button').filter({ hasText: /^Confirmar ataque/ }).first();
      if (await press(page, confirm)) interactions += 1; else await answerAnyPrompt(page);
      continue;
    }
    if (waiting === 'DeclareBlockers' && viewer === 1) {
      // A block only counts once Phase logged it; the prompt alone proves nothing.
      const blocker = battlefield(page).locator('[data-card-id][data-block-options]:not([data-block-options="0"])').first();
      const attacker = rivalField(page).locator('[data-combat-role="Atacando"]').first();
      if (await blocker.count() && await attacker.count()) {
        await clickCard(page, blocker);
        await clickCard(page, attacker);
        const confirm = decision(page).locator('button').filter({ hasText: /^Confirmar bloqueos/ }).first();
        if (await press(page, confirm)) {
          interactions += 1;
          if (await log(page).locator('li').filter({ hasText: /bloquea a/ }).count()) sawBlock = true;
          continue;
        }
      }
      if (await press(page, decision(page).locator('button').filter({ hasText: /^No bloquear/ }).first())) { interactions += 1; continue; }
    }
    if (await answerAnyPrompt(page)) { interactions += 1; continue; }

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
