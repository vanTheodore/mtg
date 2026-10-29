import { expect, test } from '@playwright/test';

const widths = [320, 375, 390, 768, 1440];

test.beforeEach(async ({ page }) => {
  // Force deterministic missing-art fallbacks; never depend on Scryfall availability.
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
});

for (const width of widths) {
  test(`todas las cartas de una mano de 30 son accesibles a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/stress?hand=30&tokens=20');
    const hand = page.getByRole('region', { name: 'Mano de prueba', exact: true });
    await expect(hand).toBeVisible();
    const cards = hand.locator('[role="button"][data-card-id]');
    await expect(cards).toHaveCount(30);

    // No unintended page-level horizontal overflow.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    // Every card can be scrolled into view and focused, even when the hand overflows.
    for (let i = 0; i < 30; i++) {
      const card = cards.nth(i);
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeVisible();
      await card.focus();
      await expect(card).toBeFocused();
    }

    // Token-heavy board: collapsed group exposes an expansion control and all members after expansion.
    const toggle = page.getByRole('button', { name: /Soldier Token × 20/ });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator('.battlefield [data-card-id]')).toHaveCount(30); // 6 lands + 4 bears + 20 tokens
  });
}

test('fallback identificable, error de imagen y reintento', async ({ page }) => {
  await page.goto('/stress?hand=3&tokens=0');
  const card = page.locator('[data-card-id="1001"]');
  const shell = card.locator('..');
  await expect(card).toContainText('Grizzly Bears');
  await expect(card).toContainText('2/2');
  await expect(shell.getByRole('button', { name: 'Reintentar imagen' })).toBeVisible();
  await shell.getByRole('button', { name: 'Reintentar imagen' }).click();
  await expect(card).toContainText('Grizzly Bears');
});

test('información oculta se distingue de arte ausente', async ({ page }) => {
  await page.goto('/stress?hand=3&tokens=0&images=hidden');
  const card = page.locator('[data-card-id="1001"]');
  await expect(card).toHaveAttribute('data-hidden', 'true');
  await expect(card).toHaveAttribute('aria-label', 'Carta oculta');
  await expect(card).not.toContainText('Grizzly Bears');
  await expect(card.locator('..').getByRole('button', { name: 'Reintentar imagen' })).toHaveCount(0);
});

test('ampliación por teclado y transformación/adjuntos', async ({ page }) => {
  await page.goto('/stress?hand=3&tokens=0');
  const dfc = page.locator('[data-card-id="1002"]');
  await expect(dfc).toContainText('Transformada');
  await dfc.focus();
  await page.keyboard.press('Shift+Enter');
  const dialog = page.getByRole('dialog', { name: 'Carta ampliada' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Insectile Aberration');
  await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('[data-card-id="2101"]')).toContainText('1 adjuntos');
});
