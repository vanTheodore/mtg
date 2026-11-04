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
  expect(measurements.verticalOverflow).toBeLessThan(804);
  expect(measurements.elements.opponentField).not.toBeNull();
  expect(measurements.elements.playerField).not.toBeNull();
  expect(measurements.elements.hand).not.toBeNull();

  // A mirrored battlefield faces the centerline from BOTH sides.
  expect(measurements.elements.opponentLands!.top)
    .toBeLessThan(measurements.elements.opponentCreatures!.top);
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
