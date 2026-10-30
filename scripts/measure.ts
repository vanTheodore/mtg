#!/usr/bin/env bun
/**
 * Reproducible UI/engine performance probe against the real WASM engine.
 *
 * Measured separately (never summed into one headline number):
 *  - Rust apply (`engine_ms`)
 *  - legal-action enumeration and projection/serialization inside the worker
 *  - worker round trip and host/worker transport
 *  - Svelte commit and next-presentation opportunity
 *  - full UI action round trip (click → engine advance → repaint)
 */
import { chromium } from 'playwright';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-webgl']
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Manual priority keeps each window observable for the probe.
await context.addInitScript(() => { try { localStorage.setItem('mesa:autoPass', 'off'); } catch {} });
const page = await context.newPage();
await page.route('**/api.scryfall.com/**', (r) => r.abort());

const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/?autostart');
await page.waitForSelector('.hand-scroll [data-card-id]', { timeout: 60_000 });

const dialog = page.locator('.handoff');
async function ready() {
  if (await dialog.isVisible().catch(() => false)) await dialog.locator('button').click({ timeout: 3_000 }).catch(() => {});
}
await ready();
for (let i = 0; i < 6; i++) {
  const keep = page.locator('section[aria-label="Decisión pendiente"] button').filter({ hasText: 'Conservar mano' }).first();
  if (!(await keep.isEnabled().catch(() => false))) break;
  await keep.click().catch(() => {});
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

const metricsNow = () => page.locator('.metrics').innerText();
const initialMetricsText = await metricsNow();
const passRoundTrips: number[] = [];
const samples: Record<string, number[]> = { engine_ms: [], legal_ms: [], projection_ms: [], serialize_ms: [], transport_ms: [], worker_ms: [], svelte_commit_ms: [], presentation_ms: [], encode_ms: [], decode_ms: [] };

// Read the last snapshot's metrics from the visible footer plus session state.
async function sampleMetrics() {
  const text = await metricsNow();
  const value = (label: string) => {
    const m = text.match(new RegExp(`${label} ([\\d.]+|—) ms`));
    return m && m[1] !== '—' ? Number(m[1]) : null;
  };
  for (const key of ['engine_ms', 'legal_ms', 'projection_ms', 'serialize_ms', 'transport_ms', 'worker_ms', 'svelte_commit_ms', 'presentation_ms', 'encode_ms', 'decode_ms']) {
    const label = ({ engine_ms: 'Reglas', legal_ms: 'Legales', projection_ms: 'Proyección', serialize_ms: 'Serialización', transport_ms: 'Transporte', worker_ms: 'Worker', svelte_commit_ms: 'Commit Svelte', presentation_ms: 'Presentación' } as Record<string, string>)[key];
    const v = value(label);
    if (v !== null) samples[key].push(v);
  }
}

const decision = page.locator('section[aria-label="Decisión pendiente"]');
const app = page.locator('.app');
const hand = page.locator('section[aria-label^="Tu mano"]');
const revision = async () => Number(await app.getAttribute('data-actions-applied'));

/** Same driver as the visual E2E: settle the seat modal, then press one real control. */
async function press(locator: ReturnType<typeof page.locator>) {
  await ready();
  if (!(await locator.count())) return false;
  const before = await revision();
  const t0 = performance.now();
  await locator.click({ timeout: 1_500 }).catch(() => {});
  await page.waitForFunction((n) => Number(document.querySelector('.app')?.getAttribute('data-actions-applied')) > n, before, { timeout: 4_000 }).catch(() => {});
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  if ((await revision()) > before) { passRoundTrips.push(performance.now() - t0); await sampleMetrics(); return true; }
  return false;
}

let cardSelectMs: number | null = null;
for (let step = 0; step < 220 && passRoundTrips.length < 12; step++) {
  const waiting = await decision.getAttribute('data-waiting').catch(() => null);
  if (waiting === 'MulliganDecision') { await press(decision.locator('button').filter({ hasText: 'Conservar mano' }).first()); continue; }
  if (!(await press(decision.locator('.confirmations button, .actions button').filter({ hasText: /^(Pasar|No atacar|No bloquear|Confirmar|Lanzar|Jugar)/ }).first()))) {
    // Fall back to selecting a hand card, which also provides the selection latency sample.
    const card = hand.locator('[data-card-id]').first();
    if (await card.count()) {
      await ready();
      await card.scrollIntoViewIfNeeded().catch(() => {});
      const t0 = performance.now();
      await card.click({ timeout: 2_000 }).catch(() => {});
      if ((await decision.locator('.prompt').count()) && cardSelectMs === null) cardSelectMs = performance.now() - t0;
      await sampleMetrics();
      continue;
    }
    await page.waitForTimeout(80);
  }
}

const interaction = await page.evaluate(async () => {
  const before = performance.now();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  return performance.now() - before;
});

const finalMetricsText = await metricsNow();
const heap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize);
const wasmFile = Bun.file('static/wasm/mtg_engine_wasm.wasm');

const summarize = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { n: values.length, min: +sorted[0].toFixed(2), median: +at(0.5).toFixed(2), p90: +at(0.9).toFixed(2), max: +sorted.at(-1)!.toFixed(2) };
};

const report = {
  wasm_file_bytes: wasmFile.size,
  wasm_sha256: new Bun.CryptoHasher('sha256').update(await wasmFile.arrayBuffer()).digest('hex'),
  environment: { browser: 'Chromium (headless)', viewport: '1440x900', scryfall: 'blocked (deterministic fallback)' },
  startup,
  initial_metrics_text: initialMetricsText,
  final_metrics_text: finalMetricsText,
  phases_ms: Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, summarize(v)])),
  pass_priority_round_trip_ms: passRoundTrips.map((v) => +v.toFixed(1)),
  pass_priority_round_trip_summary: summarize(passRoundTrips),
  hand_card_selection_response_ms: cardSelectMs === null ? null : +cardSelectMs.toFixed(1),
  two_frame_presentation_ms: +interaction.toFixed(1),
  final_used_js_heap_bytes: heap,
  page_errors: errors,
  notes: [
    'presentation_ms is a proxy: it ends at the second animation frame after the Svelte commit, not at a GPU-composited frame.',
    'Idle FPS is intentionally not reported: it does not measure any game interaction.',
    'engine_ms is the Rust apply call only; legal_ms/projection_ms/serialize_ms are measured inside the worker separately.',
    'One round-trip sample includes a seat handoff and is reported as the max, not hidden.'
  ]
};
await Bun.write('docs/performance.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
await browser.close();
