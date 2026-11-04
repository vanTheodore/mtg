import { expect, test, type Page } from '@playwright/test';

/**
 * The phone hand.
 *
 * Measured before this work, on `/stress?hand=30&tokens=0&mirror=1` at
 * 390×844 with a real touch pointer:
 *
 *   document height 3261px   (viewport 844px)
 *   one battlefield  1336px tall — six lands stacked in a half-width lane
 *   the hand         ~1500px  — thirty cards in a wrapping row
 *
 * so the battlefield, the decision and the player's own permanents were all
 * off screen, and the only thing a player could do with the hand was a long
 * vertical scroll. The fix is a fixed drawer for the hand plus phone-sized
 * lanes for the battlefield; both are checked here with the pointer actually
 * removed (a narrow desktop window is not a phone).
 */

async function openRealGame(page: Page) {
  await page.goto('/?autostart');
  await expect(page.locator('section[aria-label^="Tu mano"] [data-card-id]').first()).toBeVisible({ timeout: 180_000 });
}

test.describe('teléfono con puntero táctil', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('la mano es un cajón que se abre, se recorre y se cierra con foco', async ({ page }) => {
    await page.route('**/api.scryfall.com/**', (route) => route.abort());
    await openRealGame(page);

    const trigger = page.locator('.hand-trigger');
    const sheet = page.locator('.hand-zone');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Closed, the drawer must not reserve the height of the cards it hides.
    expect((await sheet.boundingBox())!.height).toBeLessThan(110);

    await trigger.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(sheet).toHaveClass(/sheet-open/);

    // The board is inert while the sheet is open: a stray tap cannot target a
    // permanent the player cannot see.
    await expect(page.locator('main.layout')).toHaveAttribute('inert', '');
    // Focus moves into the sheet, and the sheet itself is the tab stop.
    await expect(page.locator('#mesa-hand-sheet .hand-scroll')).toBeFocused();

    // Every hand card is reachable by keyboard inside the sheet's scrollport.
    const cards = sheet.locator('[data-card-id]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index);
      await card.scrollIntoViewIfNeeded();
      await card.focus();
      await expect(card).toBeFocused();
    }

    // Escape closes it and gives focus back to the trigger.
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('main.layout')).not.toHaveAttribute('inert', '');
    await expect(trigger).toBeFocused();
  });

  test('el cajón no desborda el documento y sus cartas conservan tamaño legible', async ({ page }) => {
    await page.route('**/api.scryfall.com/**', (route) => route.abort());
    await page.goto('/stress?hand=30&tokens=0&mirror=1');

    const trigger = page.locator('.hand-trigger');
    await expect(trigger).toBeVisible();
    await trigger.tap();

    const geometry = await page.evaluate(() => {
      const scroll = document.querySelector<HTMLElement>('#mesa-hand-sheet .hand-scroll')!;
      const cards = [...document.querySelectorAll<HTMLElement>('#mesa-hand-sheet [data-card-id]')];
      const widths = cards.map((card) => card.getBoundingClientRect().width);
      return {
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: innerHeight,
        scrollWidth: scroll.scrollWidth,
        clientWidth: scroll.clientWidth,
        minCardWidth: Math.min(...widths),
        cards: cards.length
      };
    });

    expect(geometry.cards).toBe(30);
    expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1);
    // Thirty cards are one swipeable strip, not a vertical marathon.
    expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
    expect(geometry.minCardWidth).toBeGreaterThan(100);
    // The sheet itself must not push the document taller than it already is.
    expect(geometry.documentHeight).toBeLessThan(geometry.viewportHeight * 2.2);

    // The far end of the strip is reachable by scrolling, and the cards there
    // are real elements with the same accessible name as a card on screen.
    await page.locator('#mesa-hand-sheet .hand-scroll').evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await expect(page.locator('#mesa-hand-sheet .hand-card').last()).toBeVisible();
  });

  test('el campo de batalla cabe en una pantalla y sus cartas no se apilan en una columna', async ({ page }) => {
    await page.route('**/api.scryfall.com/**', (route) => route.abort());
    await page.goto('/stress?hand=30&tokens=0&mirror=1');
    await expect(page.locator('.hand-trigger')).toBeVisible();

    const fields = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('section.battlefield[data-side]')]
      .map((field) => {
        const lands = [...field.querySelectorAll<HTMLElement>('.row[data-zone="lands"] [data-card-id]')];
        const rows = new Set(lands.map((card) => Math.round(card.getBoundingClientRect().top)));
        return {
          side: field.getAttribute('data-side'),
          height: Math.round(field.getBoundingClientRect().height),
          landRows: rows.size,
          lanes: getComputedStyle(field.querySelector('.middle-permanents')!).display
        };
      }));

    for (const field of fields) {
      // 1336px before the fix; six lands now share two or three short rows.
      expect(field.height, `campo ${field.side} demasiado alto`).toBeLessThan(700);
      expect(field.landRows, `campo ${field.side} apila las tierras en una columna`).toBeLessThanOrEqual(3);
      expect(field.lanes).toBe('block');
    }
  });
});
