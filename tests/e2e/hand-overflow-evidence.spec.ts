import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
async function persistEvidence(page: Page, testInfo: TestInfo, label: string, evidence: unknown) {
  const dir = join(testInfo.project.outputDir, 'hand-evidence');
  await mkdir(dir, { recursive: true });
  const jsonPath = join(dir, label + '.json');
  const screenshotPath = join(dir, label + '.png');
  await writeFile(jsonPath, JSON.stringify(evidence, null, 2));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(label + '.json', { path: jsonPath, contentType: 'application/json' });
  await testInfo.attach(label + '.png', { path: screenshotPath, contentType: 'image/png' });
}

async function scrollerScrollLeft(zone: import('@playwright/test').Locator): Promise<number> {
  return zone.locator('.hand-scroll').evaluate((el) => el.scrollLeft);
}

/**
 * Phone widths present the hand as a drawer (Hand.svelte). The inline row is
 * collapsed to a 1px clipped scrollport when the drawer is closed, so
 * `scrollWidth > clientWidth` is not a statement about the hand any more — it
 * is a statement about a deliberately collapsed box. These diagnostics
 * therefore measure the presentation the player actually sees: the closed
 * summary must never show arrows, and the open sheet must show them exactly
 * when its strip overflows. Opening is done through the real button.
 */
async function isNarrowHand(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('.hand-trigger');
    return !!trigger && getComputedStyle(trigger).display !== 'none';
  });
}

async function openHandDrawer(page: Page) {
  const trigger = page.locator('.hand-trigger');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.hand-zone')).toHaveClass(/sheet-open/);
}

async function closeHandDrawer(page: Page) {
  const trigger = page.locator('.hand-trigger');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
}

async function measureHand(page: Page): Promise<HandEvidence> {
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

      // On a phone the drawer starts closed: a collapsed 1px box must never
      // advertise overflow controls it cannot back up.
      const drawer = await isNarrowHand(page);
      if (drawer) {
        await expect(zone.locator('.scroll-controls')).toHaveCount(0);
        await expect(zone.locator('.more-hint')).toHaveCount(0);
        await openHandDrawer(page);
      }

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
      await persistEvidence(page, testInfo, `hand-overflow-${width}-${count}`, evidence);

      expect(restored.faces).toHaveLength(count);
      // Do NOT assert that scrollWidth and rendered clipping agree yet:
      // their disagreement is exactly the hypothesis under investigation.
    });
  }
}

test('Hand overflow diagnostic: react to viewport resize without remounting', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/stress?hand=4&tokens=0&mirror=1');
  await expect(page.locator('.hand-zone .hand-card')).toHaveCount(4);

  // Let Svelte's post-render rAF finish after each viewport change. This
  // intentionally does not navigate: updateOverflow only tracks objects.length
  // and scroll events; responsive relayout might therefore leave stale arrows.
  const settleLayout = async () => {
    // Allow CSS layout, ResizeObserver and the scheduled rAF measurement
    // to settle. Polling avoids timing-dependent false REDs on loaded CI.
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await expect.poll(async () => {
      const evidence = await measureHand(page);
      return evidence.controls === evidence.layoutSaysOverflow
        && evidence.hint === evidence.layoutSaysOverflow;
    }).toBe(true);
  };
  await settleLayout();
  const desktop = await measureHand(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.hand-trigger')).toBeVisible();
  // The resize alone must not leave desktop arrows on a closed phone drawer.
  await expect(page.locator('.hand-zone .scroll-controls')).toHaveCount(0);
  await expect(page.locator('.hand-zone .more-hint')).toHaveCount(0);
  await openHandDrawer(page);
  await settleLayout();
  const mobile = await measureHand(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await settleLayout();
  const restored = await measureHand(page);
  // The drawer must not survive the trip back to desktop: a stale open sheet
  // would leave the board `inert` behind an invisible trigger.
  await expect(page.locator('.hand-trigger')).toBeHidden();
  await expect(page.locator('.hand-zone')).not.toHaveClass(/sheet-open/);
  await expect(page.locator('.hand-zone .hand-close')).toHaveCount(0);
  const evidence = { desktop, mobile, restored };
  console.log('MESA_HAND_RESIZE_EVIDENCE ' + JSON.stringify(evidence));
  await persistEvidence(page, testInfo, 'hand-resize-without-remount', evidence);

  // Four cards fit the 1440px scene but exceed the 390px scrollport.
  // This transition was invisible to the old $effect, which only observed
  // objects.length, so the arrows could stay hidden after resize.
  expect(desktop.layoutSaysOverflow).toBe(false);
  expect(mobile.layoutSaysOverflow).toBe(true);
  expect(desktop.controls).toBe(desktop.layoutSaysOverflow);
  expect(mobile.controls).toBe(mobile.layoutSaysOverflow);
  expect(mobile.hint).toBe(mobile.layoutSaysOverflow);
  expect(restored.controls).toBe(restored.layoutSaysOverflow);
  expect(restored.hint).toBe(restored.layoutSaysOverflow);
  expect(restored.faces).toHaveLength(4);
});

test('Hand contextual toolbar diagnostic: rendered pointer target inside scrollport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto('/stress?hand=4&tokens=0&mirror=1');

  const card = page.locator('.hand-zone .hand-card').first();
  const face = card.locator('.card');
  const toolbar = card.locator('.card-tools');
  await expect(face).toBeVisible();
  await face.focus();
  await expect(face).toBeFocused();
  await expect(toolbar).toBeVisible();
  // The toolbar fades in over 120ms (`transition: opacity .12s`). Measuring
  // during that fade recorded 0.16–0.85 and failed a test whose actual claim
  // is "the target is reachable and steady", not "the first animation frame
  // equals 1". Wait for the transition to finish before reading geometry.
  await expect(toolbar).toHaveCSS('opacity', '1');

  // Chromium's actual hit-test reveals clipping even when an element has a
  // nonzero bounding rect and Playwright considers it "visible".
  const evidence = await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>('.hand-zone .hand-scroll');
    const tools = scroll?.querySelector<HTMLElement>('.hand-card .card-tools');
    const inspect = tools?.querySelector<HTMLButtonElement>('button.inspect');
    if (!scroll || !tools || !inspect) throw new Error('Card tools are missing');
    const scrollRect = scroll.getBoundingClientRect();
    const toolsRect = tools.getBoundingClientRect();
    const buttonRect = inspect.getBoundingClientRect();
    const x = buttonRect.left + buttonRect.width / 2;
    const y = buttonRect.top + buttonRect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      overflowX: getComputedStyle(scroll).overflowX,
      overflowY: getComputedStyle(scroll).overflowY,
      toolbarPosition: getComputedStyle(tools).position,
      toolbarOpacity: getComputedStyle(tools).opacity,
      scrollRect: scrollRect.toJSON(),
      toolsRect: toolsRect.toJSON(),
      buttonRect: buttonRect.toJSON(),
      buttonInsideScrollport: x >= scrollRect.left && x <= scrollRect.right
        && y >= scrollRect.top && y <= scrollRect.bottom,
      pointerHitsToolbar: !!hit && tools.contains(hit),
      hitTag: hit?.tagName ?? null
    };
  });
  console.log('MESA_HAND_TOOLBAR_EVIDENCE ' + JSON.stringify(evidence));
  await persistEvidence(page, testInfo, 'hand-toolbar-scrollport-1440', evidence);

  // The semantic claim: once the fade is over, the button's center is inside
  // the hand's scrollport AND the browser's own hit test lands on the button.
  // Both halves are asserted; neither can pass on a merely "visible" element.
  expect(evidence.toolbarOpacity).toBe('1');
  expect(evidence.buttonInsideScrollport).toBe(true);
  expect(evidence.pointerHitsToolbar).toBe(true);
  // A real mouse click (not a forced dispatch) must open the inspect dialog.
  await page.mouse.click(
    evidence.buttonRect.x + evidence.buttonRect.width / 2,
    evidence.buttonRect.y + evidence.buttonRect.height / 2
  );
  await expect(page.getByRole('dialog', { name: 'Carta ampliada' })).toBeVisible();
});
