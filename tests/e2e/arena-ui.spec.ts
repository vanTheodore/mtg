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


test('Phase Arena conserva ambos asientos y permite volver al modo Clásico', async ({ page }) => {
  // This is a real Phase lesson, not a fabricated action or injected DOM row.
  // Populated visual ordering is covered separately in arena-zones.spec.ts.
  await page.goto('/aprender');
  const app = page.locator('.app');
  const opponent = page.locator('section.battlefield[data-side="opponent"]');
  const player = page.locator('section.battlefield[data-side="player"]');
  await expect(opponent).toBeVisible({ timeout: 180_000 });
  await expect(player).toBeVisible();
  await expect(app).toHaveAttribute('data-board-style', 'arena');
  await expect(opponent).toContainText('Campo de batalla · maniquí');
  await expect(player).toContainText('Tu campo de batalla');

  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('combobox', { name: 'Estilo del tablero' }).selectOption('classic');
  await expect(app).toHaveAttribute('data-board-style', 'classic');
  await expect(opponent).toHaveAttribute('data-side', 'opponent');
  await expect(player).toHaveAttribute('data-side', 'player');
  // Returning to Arena must preserve both seat identities, not recreate a
  // fake battlefield or remap any game objects.
  await page.getByRole('combobox', { name: 'Estilo del tablero' }).selectOption('arena');
  await expect(app).toHaveAttribute('data-board-style', 'arena');
  await expect(opponent).toBeVisible();
  await expect(player).toBeVisible();
});

test('Arena de escritorio ajusta la densidad al viewport sin cambiar Clásico ni móvil', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const start = page.getByRole('button', { name: 'Iniciar partida' });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  const app = page.locator('.app');
  await expect(app).toHaveAttribute('data-board-style', 'arena');
  const hand = page.locator('section.hand-zone[aria-label^="Tu mano"]');
  await expect.poll(() => hand.locator('[data-card-id]').count(), { timeout: 180_000 }).toBe(7);

  const first = hand.locator('.hand-card .card-shell').first();
  const compactWidth = await first.evaluate((node) => node.getBoundingClientRect().width);
  const compactHeight = await page.locator('.layout').evaluate((node) => node.getBoundingClientRect().height);
  expect(compactWidth).toBeGreaterThan(90);
  expect(compactWidth).toBeLessThanOrEqual(130);

  // Compare the same Arena scene at a tall viewport, without changing
  // gameplay, hands or HUD. Comparing Classic's height would be misleading:
  // only Arena renders the additional Phase turn track.
  await page.setViewportSize({ width: 1440, height: 1100 });
  const tallWidth = await first.evaluate((node) => node.getBoundingClientRect().width);
  const tallHeight = await page.locator('.layout').evaluate((node) => node.getBoundingClientRect().height);
  expect(tallWidth - compactWidth).toBeGreaterThan(20);
  expect(tallHeight - compactHeight).toBeGreaterThan(25);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Ajustes' }).click();
  const style = page.getByRole('combobox', { name: 'Estilo del tablero' });
  await style.selectOption('classic');
  await expect(app).toHaveAttribute('data-board-style', 'classic');
  const classicWidth = await first.evaluate((node) => node.getBoundingClientRect().width);
  expect(classicWidth).toBeGreaterThanOrEqual(145);

  // Mobile deliberately keeps its original scrollable card sizes, and switching
  // board style never changes the Phase-reported hand count or objects.
  await page.setViewportSize({ width: 390, height: 844 });
  await style.selectOption('arena');
  await expect(app).toHaveAttribute('data-board-style', 'arena');
  await expect(hand.locator('[data-card-id]')).toHaveCount(7);
  const mobileWidth = await first.evaluate((node) => node.getBoundingClientRect().width);
  expect(mobileWidth).toBeGreaterThan(125);
  const region = hand.getByRole('region', { name: /Tu mano/ });
  await expect(region).toBeVisible();
  const lastCard = region.locator('[data-card-id]').last();
  await lastCard.scrollIntoViewIfNeeded();
  await lastCard.focus();
  await expect(lastCard).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
