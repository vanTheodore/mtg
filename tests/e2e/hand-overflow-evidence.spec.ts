import { expect, test } from '@playwright/test';

type HandEvidence = {
  viewport: { width: number; height: number };
  scroll: { scrollWidth: number; clientWidth: number; scrollLeft: number; left: number; right: number };
  controls: boolean;
  hint: boolean;
  faces: Array<{ left: number; right: number; width: number; fullyVisible: boolean }>;
  layoutSaysOverflow: boolean;
  clippedFaceCount: number;
};

/**
 * Diagnostic evidence, not a proposed fix. CSS transforms/absolute card tools
 * can inflate scrollWidth even when every *face* is visible. Conversely a
 * rotated face might clip without changing the scroll metric as expected.
 * Record both signals before changing Hand.svelte's scroll controls.
 */
async function scrollerScrollLeft(zone: import('@playwright/test').Locator): Promise<number> {
  return zone.locator('.hand-scroll').evaluate((el) => el.scrollLeft);
}

async function measureHand(page: import('@playwright/test').Page): Promise<HandEvidence> {
  return page.evaluate(() => {
    const zone = document.querySelector<HTMLElement>('.hand-zone');
    const scroll = zone?.querySelector<HTMLElement>('.hand-scroll');
    if (!zone || !scroll) throw new Error('Hand DOM was not mounted');
    const bounds = scroll.getBoundingClientRect();
    const faces = [...scroll.querySelectorAll<HTMLElement>('.hand-card .card')].map((face) => {
      const rect = face.getBoundingClientRect();
      return {
        left: rect.left, right: rect.right, width: rect.width,
        fullyVisible: rect.left >= bounds.left - 2 && rect.right <= bounds.right + 2
      };
    });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scroll: {
        scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth,
        scrollLeft: scroll.scrollLeft, left: bounds.left, right: bounds.right
      },
      controls: zone.querySelectorAll('.scroll-controls button').length === 2,
      hint: !!zone.querySelector('.more-hint'),
      faces,
      layoutSaysOverflow: scroll.scrollWidth > scroll.clientWidth + 2,
      clippedFaceCount: faces.filter((face) => !face.fullyVisible).length
    };
  });
}

for (const [width, height] of [[1440, 900], [390, 844]] as const) {
  for (const count of [4, 30] as const) {
    test(`Hand overflow diagnostic: ${count} cards at ${width}×${height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await page.route('**/api.scryfall.com/**', (route) => route.abort());
      await page.goto(`/stress?hand=${count}&tokens=0&mirror=1`);
      const zone = page.locator('.hand-zone').first();
      await expect(zone).toBeVisible();
      await expect(zone.locator('.hand-card')).toHaveCount(count);

      // Current behavior uses scrollWidth, not a geometric face-visibility
      // decision. Wait for the post-render rAF rather than logging stale UI.
      await expect.poll(async () => {
        const sample = await measureHand(page);
        return sample.controls === sample.layoutSaysOverflow
          && sample.hint === sample.layoutSaysOverflow;
      }).toBe(true);

      const initial = await measureHand(page);

      // Thirty cards must remain navigable. Exercise the actual button via
      // keyboard rather than relying solely on a DOM geometry assertion.
      if (count === 30) {
        const right = zone.getByRole('button', { name: 'Desplazar mano a la derecha' });
        await expect(right).toBeVisible();
        await right.focus();
        await expect(right).toBeFocused();
        await page.keyboard.press('Enter');
        await expect.poll(async () =>
          scrollerScrollLeft(zone)
        ).toBeGreaterThan(0);
      }
      // The arrows are never intentionally removed from a truly overflowing
      // 30-card hand; sample both the initial and rightmost scroll positions.
      const scroller = zone.locator('.hand-scroll');
      await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
      const rightmost = await measureHand(page);
      await scroller.evaluate((el) => { el.scrollLeft = 0; });
      const restored = await measureHand(page);

      const evidence = { initial, rightmost, restored };
      console.log('MESA_HAND_OVERFLOW_EVIDENCE ' + JSON.stringify({ width, height, count, ...evidence }));
      await testInfo.attach(`hand-overflow-${width}-${count}.json`, {
        body: JSON.stringify(evidence, null, 2),
        contentType: 'application/json'
      });

      expect(restored.faces).toHaveLength(count);
      // Do NOT assert that scrollWidth and rendered clipping agree yet:
      // their disagreement is exactly the hypothesis under investigation.
    });
  }
}
