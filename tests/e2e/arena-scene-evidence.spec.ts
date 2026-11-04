import { expect, test } from '@playwright/test';
import { captureViewportEvidence } from './support/viewport-evidence';

/**
 * Deterministic *presentation* fixture. Both seats contain the same 6 lands
 * and 4 creatures, with a 7-card hand. This is deliberately NOT a Phase game:
 * the separate ui-deck-10e E2E captures a real blocking decision with the HUD.
 * Keeping the two kinds of evidence distinct avoids claiming rules coverage
 * or pixel parity from a synthetic board.
 */
test('Arena 1440×900: compare mirrored 6+4 seats and a 7-card hand', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/stress?hand=7&tokens=0&mirror=1');

  const scene = page.locator('[data-testid="stress-page"]');
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute('data-board-style', 'arena');
  const hand = page.getByRole('region', { name: /Mano de prueba, 7 cartas/ });
  await expect(hand.locator('[data-card-id]')).toHaveCount(7);

  for (const side of ['opponent', 'player'] as const) {
    const field = scene.locator(`section.battlefield[data-side="${side}"]`);
    await expect(field).toBeVisible();
    await expect(field).toHaveCSS('display', 'grid');
    await expect(field.locator('.row[data-zone="lands"] [data-card-id]')).toHaveCount(6);
    await expect(field.locator('.row[data-zone="creatures"] [data-card-id]')).toHaveCount(4);
  }

  const measurements = await captureViewportEvidence(page, 'arena-mirrored-6-4-hand-7', {
    scene: '.stress',
    opponentField: 'section.battlefield[data-side="opponent"]',
    opponentCreatures: 'section.battlefield[data-side="opponent"] .row[data-zone="creatures"]',
    opponentLands: 'section.battlefield[data-side="opponent"] .row[data-zone="lands"]',
    playerField: 'section.battlefield[data-side="player"]',
    playerCreatures: 'section.battlefield[data-side="player"] .row[data-zone="creatures"]',
    playerLands: 'section.battlefield[data-side="player"] .row[data-zone="lands"]',
    hand: '.hand-zone'
  });

  // All cards remain on the horizontal canvas. A vertical scroll is recorded
  // as *debt*, not silently treated as a one-screen success.
  expect(measurements.horizontalOverflow).toBeLessThanOrEqual(1);
  // PR #25 measured 804px of vertical debt in the identical presentation
  // fixture. The new Arena-only short-desktop lanes must beat that baseline;
  // do not claim one-screen success until verticalOverflow reaches zero.
  // PR #27: 194px of debt at identical 1440×900 /stress state.
  // 0.8.2 must save at least 70px without scaling the actual cards smaller.
  // 0.8.2: 105px. Invisible, space-reserving card-tools must now be
  // out of flow, without hiding keyboard or touch access.
  expect(measurements.verticalOverflow).toBeLessThan(90);
  expect(measurements.elements.opponentField).not.toBeNull();
  expect(measurements.elements.playerField).not.toBeNull();
  expect(measurements.elements.hand).not.toBeNull();

  // In the compact desktop scene each side has lands and creatures on the
  // same visual row: neither lane steals a second full card-height.
  expect(Math.abs(measurements.elements.opponentLands!.top - measurements.elements.opponentCreatures!.top))
    .toBeLessThanOrEqual(8);
  expect(Math.abs(measurements.elements.playerLands!.top - measurements.elements.playerCreatures!.top))
    .toBeLessThanOrEqual(8);

  // Mobile/tablet keep the original, vertically mirrored layout.
  await page.setViewportSize({ width: 768, height: 900 });
  const mobileField = scene.locator('section.battlefield[data-side="player"]');
  await expect(mobileField).toHaveCSS('display', 'flex');
  await expect(mobileField.locator('.row[data-zone="lands"] [data-card-id]')).toHaveCount(6);
  await expect(mobileField.locator('.row[data-zone="creatures"] [data-card-id]')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});


test('Arena desktop: tools do not steal card rows and remain keyboard-accessible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/stress?hand=7&tokens=0&mirror=1');

  const scene = page.getByTestId('stress-page');
  await expect(scene).toHaveAttribute('data-board-style', 'arena');
  const card = scene.locator('section.battlefield[data-side="player"] .row[data-zone="creatures"] .card-shell').first();
  const face = card.locator('.card');
  const tools = card.locator('.card-tools');
  const inspect = card.getByRole('button', { name: /^Ampliar / });

  // The formerly invisible buttons cannot add a card-height row in Arena.
  await expect(tools).toHaveCSS('position', 'absolute');
  await page.mouse.move(0, 0);
  await face.focus();
  await expect(face).toBeFocused();
  await expect(tools).toHaveCSS('opacity', '1');
  await inspect.focus();
  await expect(inspect).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Carta ampliada' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar' }).click();

  // The old centered overlay blocked clicking cards in actual Phase games.
  // Hover the battlefield face and confirm its CENTER is still the hit target.
  await face.hover();
  const faceHit = await face.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return target === element || element.contains(target);
  });
  expect(faceHit, 'the battlefield face center must not be covered by its toolbar').toBe(true);
  await face.click();

  // A hand card lives inside a horizontal scrollport. A toolbar below the
  // card may be non-interactive due to overflow clipping even while it is
  // keyboard-focusable. Check the browser's pointer hit target explicitly.
  const handCard = scene.locator('.hand-zone .hand-card').first();
  const handFace = handCard.locator('.card');
  const handInspect = handCard.getByRole('button', { name: /^Ampliar / });
  await handFace.hover();
  await expect(handCard.locator('.card-tools')).toHaveCSS('opacity', '1');
  const handFaceHit = await handFace.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return target === element || element.contains(target);
  });
  expect(handFaceHit, 'the hand face center must remain playable when tools appear').toBe(true);
  await handFace.click();
  await handFace.hover();
  const hit = await handInspect.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return target === button || button.contains(target);
  });
  expect(hit, 'the contextual hand toolbar must receive real mouse clicks').toBe(true);
  await handInspect.click();
  await expect(page.getByRole('dialog', { name: 'Carta ampliada' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar' }).click();

  // Tablet keeps the compact corner tools (they fit a 768px card) but they are
  // no longer hidden behind hover, so a finger can always reach them. The
  // in-flow, always-visible variant is reserved for `(hover: none)` /
  // `(pointer: coarse)`, which a desktop browser at any width does not match;
  // that path is covered by arena-card-tools-reachability.spec.ts with real
  // touch emulation. Asserting `position: static` here was asserting a
  // pointer capability this context does not have.
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(inspect).toBeVisible();
  // Reachable by keyboard without any pointer hover.
  await page.mouse.move(0, 0);
  await face.focus();
  await expect(tools).toHaveCSS('opacity', '1');
  await inspect.focus();
  await expect(inspect).toBeFocused();
});
