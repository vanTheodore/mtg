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
  // A single attachment says "1 adjunto": the old assertion froze the plural
  // bug (found in docs/screenshots/cartas-1440.png, fixed in interaction.ts).
  await expect(page.locator('[data-card-id="2101"]')).toContainText('1 adjunto');
  await expect(page.locator('[data-card-id="2101"]')).not.toContainText('1 adjuntos');
});

/**
 * Regression for what the 0.5.1 screenshots showed and the old suite did not
 * look at: the card face itself.
 *
 * Before: lands were ~50 px shorter than creatures on the same row; the status
 * strip ("Girada") was painted over the rules text and over the image note; the
 * rules text was cut in half with no ellipsis; a creature taller than its card
 * at 320 px pushed the power/toughness out of the box; and a long name pushed
 * the mana cost past the card edge.
 */
test('la cara de la carta no se desborda ni tapa texto, a 320 y 1440', async ({ page }) => {
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/stress?hand=12&tokens=0');
    const battlefield = page.locator('.battlefield [data-card-id]');
    await expect(battlefield.first()).toBeVisible();

    const faces = await battlefield.evaluateAll((cards) => cards.map((card) => {
      const face = card.querySelector('.fallback') as HTMLElement;
      const art = card.querySelector('.fallback-art') as HTMLElement;
      const name = card.querySelector('.fallback-name') as HTMLElement;
      const cost = card.querySelector('.fallback-cost') as HTMLElement;
      const box = card.getBoundingClientRect();
      const artBox = art.getBoundingClientRect();
      const costBox = cost.getBoundingClientRect();
      return {
        height: Math.round(box.height),
        overflows: face.scrollHeight - face.clientHeight,
        artHeight: Math.round(artBox.height),
        artText: art.textContent?.trim() ?? '',
        costClipped: costBox.right > box.right + 1,
        nameVisible: name.offsetParent !== null
      };
    }));

    // Every card on a row is the same height, whatever its fields.
    const heights = new Set(faces.map((face) => face.height));
    expect(heights.size, `alturas distintas a ${width}px: ${[...heights].join(', ')}`).toBe(1);

    for (const face of faces) {
      expect(face.overflows, `contenido fuera de la cara a ${width}px`).toBeLessThanOrEqual(1);
      expect(face.costClipped, `coste recortado a ${width}px`).toBe(false);
      expect(face.nameVisible).toBe(true);
      // The art box keeps room for its note; it must never collapse to a sliver.
      if (face.artText) expect(face.artHeight, `caja de arte aplastada a ${width}px`).toBeGreaterThan(12);
    }
  }
});

test('el nombre accesible de la carta sigue el orden visible', async ({ page }) => {
  // Wait for the deliberately unavailable artwork to settle before checking
  // that both the visible fallback and accessible name describe the same state.
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/stress?hand=3&tokens=0');
  const card = page.locator('[data-card-id="1001"]');
  await expect(card).toHaveAttribute('data-image-state', 'error', { timeout: 30_000 });
  const { visible, label } = await card.evaluate((element) => ({
    visible: (element as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
    label: element.getAttribute('aria-label') ?? ''
  }));
  // axe's label-content-name-mismatch compares sequences, not sets: the note
  // lives in the art box, so it must come before the rules text in the name.
  const words = visible.split(' ').filter((word) => word.length > 2);
  for (const word of words) expect(label, `«${word}» falta en «${label}»`).toContain(word);
  expect(label.indexOf('Criatura')).toBeLessThan(label.indexOf('Una criatura sencilla'));
  expect(label.indexOf('Sin conexión')).toBeLessThan(label.indexOf('Una criatura sencilla'));
});
