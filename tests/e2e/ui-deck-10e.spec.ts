import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * 0.4.3 — a pasted 10E deck, played through the Svelte controls.
 *
 * The deck is 40 cards: 17 Plains (core pack) + 22 creatures and one red
 * enchantment that **only** the 10E pack carries. `Arcane Teachings` is the
 * known-limitation card the coverage artifact reports (`SilentDrop:1_of_2`),
 * so the game can only start with explicit consent.
 *
 * Every selector below was checked against the components
 * (`DeckBuilder.svelte`, `Board.svelte`, `DecisionPanel.svelte`,
 * `Hand.svelte`, `CardView.svelte`). **NO EJECUTADO**: el entorno de esta ronda
 * no tiene Chromium (ver `docs/VERIFICATION-0.4.3.md`).
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
const CREATURES = ['Suntail Hawk', 'Soul Warden', 'Honor Guard', 'Youthful Knight', 'Wild Griffin', 'Benalish Knight', 'Skyhunter Skirmisher', 'Steadfast Guard', 'True Believer', 'Aven Cloudchaser', 'Voice of All'];

const hand = (page: Page) => page.locator('section[aria-label^="Tu mano"]');
const decision = (page: Page) => page.locator('section[aria-label="Decisión pendiente"]');
const battlefield = (page: Page) => page.locator('section[aria-label^="Tu campo de batalla"]');

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

  // 1. Import: the deck is accepted and the 10E cards are *pending*, not missing.
  await importDeck(page);
  await expect(page.locator('[data-state="pending"]').first()).toBeVisible();
  await expect(page.locator('[data-state="absent"]')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: /se descarga al iniciar/ })).toBeVisible();

  // 2. Nothing was downloaded just by importing: only the core pack is in memory.
  expect(packRequests.filter((url) => url.startsWith('/data/catalog/packs/10e.json'))).toEqual([]);

  // 3. 「Jugar」 is enabled: pending packs are the loader's job, not a blocker.
  const play = page.getByRole('button', { name: 'Jugar con este mazo' });
  await expect(play).toBeEnabled();
  await play.click();

  // 4. One known limitation blocks the start until it is accepted explicitly.
  const alert = page.getByRole('alert');
  await expect(alert).toContainText(LIMITED, { timeout: 120_000 });
  await expect(alert).toContainText(/limitaciones conocidas/i);
  await expect(page.getByRole('checkbox', { name: /Permitir 1 carta\(s\) con limitaciones conocidas/ })).toBeVisible();
  await page.getByRole('checkbox', { name: /Permitir 1 carta\(s\) con limitaciones conocidas/ }).check();
  await play.click();

  // 5. Only the pack the deck needs is fetched, and its URL carries the digest.
  await expect(page.getByRole('status').filter({ hasText: /Motor: 40 \/ 40/ })).toBeVisible({ timeout: 180_000 });
  const tenE = packRequests.find((url) => url.startsWith('/data/catalog/packs/10e.json'));
  expect(tenE, 'la partida debe descargar el pack 10e').toBeTruthy();
  expect(tenE).toMatch(/\?v=[0-9a-f]{64}$/);
  expect([...new Set(packRequests.map((url) => url.split('?')[0]))].sort())
    .toEqual(['/data/catalog/packs/10e.json', '/data/catalog/packs/fixture.json']);

  // 6. The board shows the deck: hand from engine state, cards with art fallback.
  await expect(hand(page).locator('[data-card-id]').first()).toBeVisible({ timeout: 60_000 });
  const names = await hand(page).locator('.fallback-name').allInnerTexts();
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((name) => name.length > 0)).toBe(true);
  await expect(page.locator('.game-over')).toHaveCount(0);
});

test('estado de bloqueo: el tablero queda inerte, cubierto y sin fuga de mano', async ({ page }) => {
  test.setTimeout(240_000);
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/');

  await page.getByRole('checkbox', { name: 'Confirmar cada cambio de asiento' }).check();
  await importDeck(page);
  await page.getByRole('button', { name: 'Jugar con este mazo' }).click();
  const alert = page.getByRole('alert');
  if (await alert.isVisible().catch(() => false)) {
    await page.getByRole('checkbox', { name: /Permitir 1 carta\(s\) con limitaciones conocidas/ }).check();
    await page.getByRole('button', { name: 'Jugar con este mazo' }).click();
  }

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

test('la partida se juega hasta el final: acciones, combate, bloqueo y resultado', async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api.scryfall.com/**', (route) => route.abort());

  await page.goto('/');
  await importDeck(page);
  await page.getByRole('button', { name: 'Jugar con este mazo' }).click();
  const consent = page.getByRole('checkbox', { name: /Permitir 1 carta\(s\) con limitaciones conocidas/ });
  if (await consent.isVisible().catch(() => false)) await consent.check();
  await page.getByRole('button', { name: 'Jugar con este mazo' }).click();
  await answerHandoff(page);

  await expect(hand(page).locator('[data-card-id]').first()).toBeVisible({ timeout: 180_000 });
  const app = page.locator('.app');
  const revision = async () => Number(await app.getAttribute('data-actions-applied'));

  let sawAttack = false;
  let sawBlock = false;
  let interactions = 0;
  let stalls = 0;

  const clickCard = async (card: Locator) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { await card.click({ timeout: 2_000 }); return true; } catch { await page.waitForTimeout(60); }
    }
    return false;
  };
  const press = async (button: Locator) => {
    if (!(await button.count())) return false;
    const before = await revision();
    await button.click({ timeout: 1_500 }).catch(() => {});
    await page.waitForTimeout(40);
    if ((await revision()) > before) { interactions += 1; return true; }
    return false;
  };
  /** Try to play whatever the selected hand card offers (land, creature, spell). */
  const playFromHand = async () => {
    const cards = hand(page).locator('[data-card-id]');
    const count = await cards.count();
    for (let i = 0; i < count; i += 1) {
      const card = cards.nth(i);
      if (!(await clickCard(card))) continue;
      const cast = decision(page).locator('button').filter({ hasText: /^(Lanzar|Jugar)/ }).first();
      if (await cast.count() && await press(cast)) return true;
      if (await press(decision(page).locator('button').filter({ hasText: 'Elegir maná manualmente' }).first())) return true;
    }
    return false;
  };

  for (let step = 0; step < 500; step += 1) {
    if (await page.locator('.game-over').isVisible().catch(() => false)) break;
    const waiting = await decision(page).getAttribute('data-waiting');
    if (waiting === 'MulliganDecision') {
      await press(decision(page).locator('button').filter({ hasText: 'Conservar mano' }).first());
      continue;
    }
    const viewer = Number(await app.getAttribute('data-viewer'));
    if (viewer !== 0) {
      if (await press(decision(page).locator('button').filter({ hasText: /^No atacar$/ }).first())) continue;
      if (await press(decision(page).locator('button').filter({ hasText: /^No bloquear$/ }).first())) continue;
      if (await press(decision(page).locator('button').filter({ hasText: /^Pasar/ }).first())) continue;
      if (await press(decision(page).locator('button').filter({ hasText: 'Confirmar pago' }).first())) continue;
      await page.waitForTimeout(80);
      continue;
    }
    if (waiting === 'DeclareAttackers') {
      const attackers = battlefield(page).locator('[data-card-id][data-targetable="true"]');
      const ids = await attackers.evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.cardId).filter(Boolean));
      if (ids.length) sawAttack = true;
      for (const id of ids) await clickCard(battlefield(page).locator(`[data-card-id="${id}"]`));
      const confirm = decision(page).locator('button').filter({ hasText: /^Confirmar ataque/ }).first();
      await press((await confirm.count()) ? confirm : decision(page).locator('button').filter({ hasText: 'No atacar' }).first());
      continue;
    }
    if (waiting === 'DeclareBlockers') {
      sawBlock = true;
      await press(decision(page).locator('button').filter({ hasText: 'No bloquear' }).first());
      continue;
    }
    if (waiting === 'Priority' && await playFromHand()) continue;

    if (await press(decision(page).locator('button').filter({ hasText: 'Confirmar pago' }).first())) continue;
    if (await press(decision(page).locator('button').filter({ hasText: /^Pasar/ }).first())) continue;
    if (await press(decision(page).locator('.confirmations button:not([disabled]), .actions button:not([disabled])').first())) continue;

    if (++stalls > 30) {
      throw new Error(`La interfaz se bloqueó en el paso ${step}: waiting=${waiting}, viewer=${viewer}`);
    }
    await page.waitForTimeout(120);
  }

  await expect(page.locator('.game-over')).toBeVisible({ timeout: 180_000 });
  await expect(page.locator('.game-over')).toContainText(/gana|Empate/);
  expect(sawAttack).toBe(true);
  expect(sawBlock).toBe(true);
  expect(interactions).toBeGreaterThan(10);
  expect(errors).toEqual([]);
  test.info().annotations.push({ type: 'interacciones', description: `${interactions} acciones` });
});
