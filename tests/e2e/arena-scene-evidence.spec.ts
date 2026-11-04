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
  const hand = page.getByRole('region', { name: /Mano de prueba, 7 cartas/ });
  await expect(hand.locator('[data-card-id]')).toHaveCount(7);

  for (const side of ['opponent', 'player'] as const) {
    const field = scene.locator(`section.battlefield[data-side="${side}"]`);
    await expect(field).toBeVisible();
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
  expect(measurements.elements.opponentField).not.toBeNull();
  expect(measurements.elements.playerField).not.toBeNull();
  expect(measurements.elements.hand).not.toBeNull();

  // A mirrored battlefield faces the centerline from BOTH sides.
  expect(measurements.elements.opponentLands!.top)
    .toBeLessThan(measurements.elements.opponentCreatures!.top);
  expect(measurements.elements.playerCreatures!.top)
    .toBeLessThan(measurements.elements.playerLands!.top);
});
