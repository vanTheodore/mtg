import { expect, test } from '@playwright/test';

/**
 * Real-engine smoke test through the Svelte UI: boot, mulligan with seat
 * handoffs, land play and priority passing. Deeper interaction and victory are
 * covered by ui-game.spec.ts.
 */
test('partida real: inicializa WASM, conserva manos y juega una tierra', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.route('**/api.scryfall.com/**', (route) => route.abort());

  await page.goto('/?autostart');
  await expect(page.getByRole('heading', { name: /Tu mano/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.metrics')).toContainText('Reglas');

  const app = page.locator('.app');
  const decision = page.locator('section[aria-label="Decisión pendiente"]');
  const dialog = page.locator('.handoff');
  const revision = async () => Number(await app.getAttribute('data-actions-applied'));
  async function settle() {
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.locator('button').click({ timeout: 5_000 });
      await expect(dialog).toBeHidden({ timeout: 5_000 });
    }
  }
  async function press(button: ReturnType<typeof page.locator>) {
    await settle();
    const before = await revision();
    await button.click({ timeout: 2_500 }).catch(() => {});
    await page
      .waitForFunction((n) => Number(document.querySelector('.app')?.getAttribute('data-actions-applied')) > n, before, { timeout: 5_000 })
      .catch(() => {});
    return (await revision()) > before;
  }

  // Both seats keep their opening hand; the acting seat is always Phase's viewer.
  for (let i = 0; i < 6; i++) {
    await settle();
    const keep = decision.locator('button').filter({ hasText: 'Conservar mano' }).first();
    if (!(await keep.count())) break;
    await press(keep);
  }
  await expect(decision).not.toContainText('MulliganDecision', { timeout: 15_000 });
  await expect(page.locator('.rival-hand .mini-back').first()).toBeVisible();
  await expect(page.locator('.rival-hand')).not.toContainText(/\{T\}|Forest|Lightning|Island|Mountain/);

  // Reach the first main phase of the displayed seat.
  for (let i = 0; i < 20; i++) {
    await settle();
    const text = await decision.innerText();
    if (text.includes('Fase principal')) break;
    const pass = decision.locator('.confirmations button').filter({ hasText: /^Pasar/ }).first();
    if (!(await pass.count()) || !(await press(pass))) break;
  }
  await settle();

  // Any playable land in the acting seat's own hand; never assume a fixed card.
  const hand = page.locator('section[aria-label^="Tu mano"]');
  let played = false;
  for (let step = 0; step < 40 && !played; step++) {
    await settle();
    const cards = hand.locator('[data-card-id]');
    const count = await cards.count();
    for (let i = 0; i < count && !played; i++) {
      const card = cards.nth(i);
      await card.scrollIntoViewIfNeeded().catch(() => {});
      await card.click({ timeout: 2_000 }).catch(() => {});
      const play = decision.locator('button').filter({ hasText: /^Jugar tierra:/ }).first();
      if (await play.count() && (await press(play))) { played = true; break; }
      await card.click({ timeout: 2_000 }).catch(() => {});
    }
    if (played) break;
    const pass = decision.locator('.confirmations button').filter({ hasText: /^Pasar/ }).first();
    if (!(await press(pass))) await page.waitForTimeout(80);
  }
  expect(played).toBe(true);
  await expect(page.locator('section[aria-label^="Tu campo de batalla"] [data-card-id][data-zone="Battlefield"]').first()).toBeVisible({ timeout: 15_000 });

  // The metrics footer separates the measured phases.
  await expect(page.locator('.metrics')).toContainText('objetos');
  await expect(page.locator('.metrics')).toContainText('Proyección');

  const critical = errors.filter((e) => !/scryfall|Failed to load resource|net::/i.test(e));
  expect(critical).toEqual([]);
});
