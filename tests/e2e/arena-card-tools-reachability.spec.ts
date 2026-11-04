import { expect, test } from '@playwright/test';

/**
 * Regression guard for the failure the PR #39 / #41 diagnostics kept finding:
 * a contextual control that is "visible" to Playwright but not reachable for a
 * person, because the hand is a horizontal scrollport and the fan lifts cards
 * when they are hovered.
 *
 * The assertions below are the browser's own answers, not our intentions:
 * `elementFromPoint` decides who receives the click, and `boundingClientRect`
 * decides whether the target is inside the scrollport that clips it.
 *
 * Measured before the fix (Chromium, 1440×900, 7-card fan): the toolbar of the
 * hovered card started at y=599 against a scrollport top of y=624 — five of
 * seven cards could not be clicked at all, and the earlier one-card test
 * passed because it never hovered the card it was measuring.
 */
test('cada carta de la mano expone su herramienta a un clic real, dentro del scrollport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/stress?hand=7&tokens=0&mirror=1');

  const cards = page.locator('.hand-zone .hand-card');
  await expect(cards).toHaveCount(7);
  const total = await cards.count();
  const report: Array<Record<string, unknown>> = [];

  for (let index = 0; index < total; index += 1) {
    const face = cards.nth(index).locator('.card');
    const box = await face.boundingBox();
    expect(box, `la carta ${index} debe tener geometría`).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // The raised card animates (160ms); measure the settled state.
    const inspect = cards.nth(index).getByRole('button', { name: /^Ampliar / });
    await expect(inspect).toHaveCSS('opacity', '1');

    const geometry = await page.evaluate((cardIndex) => {
      const shell = document.querySelectorAll<HTMLElement>('.hand-zone .hand-card')[cardIndex];
      const button = shell.querySelector<HTMLButtonElement>('.card-tools button.inspect');
      const face = shell.querySelector<HTMLElement>('.card');
      const port = document.querySelector<HTMLElement>('.hand-zone .hand-scroll');
      if (!button || !face || !port) throw new Error('faltan nodos de la mano');
      const portRect = port.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const faceRect = face.getBoundingClientRect();
      const x = buttonRect.left + buttonRect.width / 2;
      const y = buttonRect.top + buttonRect.height / 2;
      const hit = document.elementFromPoint(x, y);
      const centerHit = document.elementFromPoint(
        faceRect.left + faceRect.width / 2,
        faceRect.top + faceRect.height / 2
      );
      return {
        cardIndex,
        port: { top: Math.round(portRect.top), bottom: Math.round(portRect.bottom) },
        button: { top: Math.round(buttonRect.top), bottom: Math.round(buttonRect.bottom) },
        insideScrollport: buttonRect.top >= portRect.top && buttonRect.bottom <= portRect.bottom
          && x >= portRect.left && x <= portRect.right,
        hitsButton: !!hit && (hit === button || button.contains(hit)),
        hitTag: hit?.tagName ?? null,
        // Inspecting a card must never require stealing its own center.
        centerStaysPlayable: !!centerHit && (centerHit === face || face.contains(centerHit))
      };
    }, index);

    report.push(geometry);
    expect(geometry.insideScrollport, `carta ${index}: la herramienta queda fuera del scrollport`).toBe(true);
    expect(geometry.hitsButton, `carta ${index}: el puntero no llega a la herramienta (${geometry.hitTag})`).toBe(true);
    expect(geometry.centerStaysPlayable, `carta ${index}: el centro de la carta quedó tapado`).toBe(true);
  }

  console.log('MESA_HAND_TOOL_REACHABILITY ' + JSON.stringify(report));

  // The keyboard path must reach the same control: Tab from the card face
  // lands on that card's own toolbar button (not another card's, and not
  // something hidden behind the scrollport).
  const keyboardCard = cards.first();
  await keyboardCard.locator('.card').focus();
  await page.keyboard.press('Tab');
  await expect(keyboardCard.getByRole('button', { name: /^Ampliar / })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Carta ampliada' })).toBeVisible();
});

// A phone is not a narrow desktop: `(hover: none)` is what Mesa keys the
// touch layout on, so the test must actually take the pointer away.
test.describe('móvil con puntero táctil', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('la herramienta de la carta es un objetivo táctil, no un ícono de hover', async ({ page }) => {
    await page.route('**/api.scryfall.com/**', (route) => route.abort());
    await page.goto('/stress?hand=7&tokens=0&mirror=1');

    // The phone hand is a drawer: its cards are on screen (and touchable)
    // once the sheet is open, never behind a collapsed scrollport.
    const trigger = page.locator('.hand-trigger');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.tap();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const first = page.locator('.hand-zone .hand-card').first();
    await first.scrollIntoViewIfNeeded();
    const inspect = first.getByRole('button', { name: /^Ampliar / });
    // No hover exists on touch: the control is laid out in flow and always visible.
    await expect(inspect).toHaveCSS('position', 'static');
    await expect(inspect).toHaveCSS('opacity', '1');
    await expect(inspect).toBeVisible();
    const box = await inspect.boundingBox();
    // WCAG 2.2 target size (minimum) is 24×24; Mesa aims at a comfortable
    // 32px touch target, which the previous 24.8px button did not reach.
    expect(box!.width).toBeGreaterThanOrEqual(32);
    expect(box!.height).toBeGreaterThanOrEqual(32);
    const hit = await page.evaluate((rect) => {
      const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return target?.closest('button')?.getAttribute('aria-label') ?? null;
    }, { x: box!.x, y: box!.y, width: box!.width, height: box!.height });
    expect(hit).toMatch(/^Ampliar /);
    await inspect.tap();
    await expect(page.getByRole('dialog', { name: 'Carta ampliada' })).toBeVisible();
  });
});
