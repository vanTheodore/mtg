import { expect, test } from '@playwright/test';

// Opt-in: this suite must hit the real service, never a mock. It is skipped by
// default so offline CI remains deterministic. Run with MESA_SCRYFALL_LIVE=1.
test('Scryfall real: cartas por nombre/oracle y ficha cargan ilustración', async ({ page }) => {
  test.skip(process.env.MESA_SCRYFALL_LIVE !== '1', 'Requiere salida de red real a api.scryfall.com y cards.scryfall.io');
  const failures: string[] = [];
  page.on('requestfailed', (request) => { if (request.url().includes('scryfall')) failures.push(`${request.url()} ${request.failure()?.errorText}`); });
  await page.goto('/stress?hand=5&tokens=1');
  const forest = page.locator('[data-card-id="1000"]');
  const bolt = page.locator('[data-card-id="1003"]');
  await expect(forest).toHaveAttribute('data-image-state', 'ready', { timeout: 30_000 });
  await expect(bolt).toHaveAttribute('data-image-state', 'ready', { timeout: 30_000 });
  for (const card of [forest, bolt]) {
    const img = card.locator('img');
    await expect(img).toBeVisible();
    expect(await img.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
    expect(await img.evaluate((node) => (node as HTMLImageElement).src)).toContain('scryfall.io');
  }
  expect(failures).toEqual([]);
});
