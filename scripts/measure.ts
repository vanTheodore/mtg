#!/usr/bin/env bun
/** Reproducible UI/engine performance probe against the real WASM engine. */
import { chromium } from 'playwright';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-webgl']
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.route('**/api.scryfall.com/**', (r) => r.abort());

const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/?autostart');
await page.waitForSelector('.hand-scroll [data-card-id]', { timeout: 60_000 });

async function ready() {
  const btn = page.getByRole('button', { name: 'Estoy listo' });
  await btn.waitFor({ state: 'visible', timeout: 2500 }).then(() => btn.click()).catch(() => {});
}
await ready();
for (let i = 0; i < 4; i++) {
  const keep = page.getByRole('button', { name: 'Conservar mano' }).first();
  if (!(await keep.isVisible().catch(() => false))) break;
  await keep.click();
  await ready();
}

const startup = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  const wasm = performance.getEntriesByType('resource').find((r) => r.name.includes('mtg_engine_wasm.wasm')) as PerformanceResourceTiming | undefined;
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  return {
    dom_content_loaded_ms: nav?.domContentLoadedEventEnd,
    load_ms: nav?.loadEventEnd,
    wasm_transfer_bytes: wasm?.transferSize,
    wasm_encoded_bytes: wasm?.encodedBodySize,
    wasm_resource_ms: wasm?.duration,
    used_js_heap_bytes: mem?.usedJSHeapSize,
    js_heap_limit_bytes: mem?.jsHeapSizeLimit
  };
});

const metricsText = await page.locator('.metrics').innerText();
const actions: number[] = [];
for (let i = 0; i < 10; i++) {
  await ready();
  const pass = page.getByRole('button', { name: 'Pasar prioridad' });
  if (!(await pass.isVisible().catch(() => false))) break;
  const before = Number(await page.locator('.app').getAttribute('data-actions-applied'));
  const t0 = Date.now();
  await pass.click();
  await page.waitForFunction((n) => Number(document.querySelector('.app')?.getAttribute('data-actions-applied')) > n, before, { timeout: 15_000 });
  actions.push(Date.now() - t0);
  await ready();
}

const fps = await page.evaluate(() => new Promise<number>((resolve) => {
  let frames = 0;
  const start = performance.now();
  function tick() {
    frames++;
    if (performance.now() - start < 1000) requestAnimationFrame(tick);
    else resolve(frames);
  }
  requestAnimationFrame(tick);
}));

const finalMetrics = await page.locator('.metrics').innerText();
const heap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize);
const report = {
  environment: { browser: 'Chromium 153 (headless)', viewport: '1440x900', scryfall: 'blocked (deterministic fallback)' },
  startup,
  initial_metrics_text: metricsText,
  final_metrics_text: finalMetrics,
  pass_priority_round_trip_ms: actions,
  idle_fps: fps,
  final_used_js_heap_bytes: heap,
  page_errors: errors
};
await Bun.write('docs/performance.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
await browser.close();
