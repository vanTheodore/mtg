import { type Page, test } from '@playwright/test';

/**
 * Geometric evidence from one *unchanged* scene. This helper does not claim
 * Phase/Mesa visual parity or enforce a one-screen threshold prematurely:
 * the report includes vertical scroll debt so the next CSS iteration has a
 * falsifiable baseline. Snapshots are attached to Playwright artifacts.
 */
export async function captureViewportEvidence(
  page: Page,
  label: string,
  selectors: Record<string, string>
) {
  const metrics = await page.evaluate((targets) => {
    const rects = Object.fromEntries(Object.entries(targets).map(([key, selector]) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return [key, null];
      const bounds = element.getBoundingClientRect();
      return [key, {
        x: Math.round(bounds.x), y: Math.round(bounds.y),
        top: Math.round(bounds.top), bottom: Math.round(bounds.bottom),
        left: Math.round(bounds.left), right: Math.round(bounds.right),
        width: Math.round(bounds.width), height: Math.round(bounds.height)
      }];
    }));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scroll: { x: scrollX, y: scrollY },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight
      },
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      verticalOverflow: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      elements: rects
    };
  }, selectors);
  await test.info().attach(`${label}.json`, {
    body: Buffer.from(JSON.stringify(metrics, null, 2)),
    contentType: 'application/json'
  });
  await test.info().attach(`${label}.png`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  });
  console.log(`MESA_VIEWPORT_EVIDENCE ${label}: ${JSON.stringify(metrics)}`);
  return metrics;
}
