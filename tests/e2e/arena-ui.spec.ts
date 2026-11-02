import { expect, test } from '@playwright/test';

test('Arena es nativo de Svelte, reversible y persistente', async ({ page }) => {
  await page.goto('/');
  const app = page.locator('.app');
  await expect(app).toHaveAttribute('data-board-style', 'arena');
  await expect(page.locator('.arena-surface')).toHaveCount(1);
  await expect(page.locator('.arena-surface')).toHaveAttribute('data-mana', 'white');
  // The original Phase painting must be bundled, not a broken remote image.
  const painting = page.locator('.arena-surface .arena-art');
  await expect(painting).toHaveAttribute('src', '/phase/arenas/angelic-sky-topdown.webp');
  await expect.poll(() => painting.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Ajustes' }).click();
  const style = page.getByRole('combobox', { name: 'Estilo del tablero' });
  await style.selectOption('classic');
  await expect(app).toHaveAttribute('data-board-style', 'classic');
  await expect(page.locator('.arena-surface')).toHaveCount(0);

  await style.selectOption('arena');
  await expect(app).toHaveAttribute('data-board-style', 'arena');
  await page.reload();
  await expect(app).toHaveAttribute('data-board-style', 'arena');
  await expect(page.locator('.arena-surface')).toHaveCount(1);
});

test('el tutorial comparte la escena Arena sin desbordar cinco anchos', async ({ page }) => {
  await page.goto('/aprender');
  await expect(page.locator('.app')).toHaveAttribute('data-board-style', 'arena');
  await expect(page.locator('.arena-surface')).toHaveAttribute('data-mana', 'white');
  await expect(page.getByRole('heading', { name: 'Mi primera partida' })).toBeVisible();

  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 800 : 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test('la banda de fases refleja el snapshot de Phase durante una partida', async ({ page }) => {
  await page.goto('/');
  const play = page.getByRole('button', { name: 'Iniciar partida' });
  await expect(play).toBeEnabled({ timeout: 30_000 });
  await play.click();
  const phases = page.locator('.turn-track');
  await expect(phases).toBeVisible({ timeout: 180_000 });
  await expect(phases.locator('li')).toHaveCount(5);
  await expect(phases.locator('li.current')).toHaveCount(1);
  await expect(phases).toContainText('Turno');
});


test('las cinco pinturas de Phase están en el build y son WebP reales', async ({ request }) => {
  for (const painting of [
    'angelic-sky-topdown.webp',
    'ocean-temple-topdown.webp',
    'moon-coven-topdown.webp',
    'molten-topdown.webp',
    'elderwood-topdown.webp'
  ]) {
    const response = await request.get('/phase/arenas/' + painting);
    expect(response.ok(), painting).toBe(true);
    expect(response.headers()['content-type'], painting).toContain('image/webp');
    expect((await response.body()).length, painting).toBeGreaterThan(100_000);
  }
});


test('Phase Arena enfrenta las filas de criaturas y conserva los asientos', async ({ page }) => {
  await page.goto('/aprender');
  const rival = page.locator('.battlefield[data-side="opponent"]');
  const own = page.locator('.battlefield[data-side="player"]');
  await expect(rival).toBeVisible({ timeout: 180_000 });
  await expect(own).toBeVisible();
  // Only presentation order changes. The engine's object IDs and zone membership
  // remain attached to their original seat; CSS order expresses facing geometry.
  const original = await own.locator('[data-zone="creatures"]').first().evaluate((e) => getComputedStyle(e).order);
  const mirrored = await rival.locator('[data-zone="creatures"]').first().evaluate((e) => getComputedStyle(e).order);
  expect(original).toBe('1');
  expect(mirrored).toBe('3');
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('combobox', { name: 'Estilo del tablero' }).selectOption('classic');
  await expect(own).toHaveAttribute('data-side', 'player');
  await expect(rival).toHaveAttribute('data-side', 'opponent');
  await expect.poll(() => own.locator('[data-zone="creatures"]').first().evaluate((e) => getComputedStyle(e).order)).toBe('0');
});
