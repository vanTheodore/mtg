#!/usr/bin/env bun
/**
 * The two boards, side by side, from the same browser.
 *
 * Mesa's own board (`/`, or `/stress` when the WASM engine is absent) and the
 * upstream phase-rs client's board (`/game/:id`, seeded by the dev fixture in
 * `scripts/seed-phase-board.ts`) are photographed at the same viewport with the
 * same Chromium. That is what makes the comparison in `docs/PHASE-UX-PORT.md`
 * evidence rather than recollection: one browser, one size, two boards.
 *
 * Usage:
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=… bun scripts/compare-boards-shots.ts \\
 *     --mesa http://127.0.0.1:5173 --phase http://127.0.0.1:5280 \\
 *     --out docs/screenshots
 *
 * It expects both servers to be already running: this script photographs, it
 * does not boot anything.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function argOf(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const outDir = resolve(argOf('--out') ?? 'docs/screenshots');
const mesa = argOf('--mesa');
const phase = argOf('--phase');
if (!mesa || !phase) {
  console.error('Faltan --mesa y --phase (las dos URL base).');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

type Shot = {
  file: string;
  url: string;
  note: string;
  width: number;
  height: number;
  /** Injects a snapshot into Mesa's dev-served session singleton before the shot. */
  mesaFixture?: boolean;
};
const shots: Shot[] = [
  { file: 'comparar-mesa-1440.jpg', url: `${mesa}/`, width: 1440, height: 900, note: 'Mesa · tablero (instantánea sembrada)', mesaFixture: true },
  { file: 'comparar-phase-1440.jpg', url: `${phase}/game/screenshot?mode=local`, width: 1440, height: 900, note: 'phase-rs · tablero sembrado' },
  { file: 'comparar-mesa-1280.jpg', url: `${mesa}/`, width: 1280, height: 800, note: 'Mesa · tablero (instantánea sembrada)', mesaFixture: true },
  { file: 'comparar-mesa-390.jpg', url: `${mesa}/`, width: 390, height: 844, note: 'Mesa · tablero en teléfono', mesaFixture: true },
  { file: 'comparar-phase-390.jpg', url: `${phase}/game/screenshot?mode=local`, width: 390, height: 844, note: 'phase-rs · tablero en teléfono' },
  { file: 'comparar-phase-1280.jpg', url: `${phase}/game/screenshot?mode=local`, width: 1280, height: 800, note: 'phase-rs · tablero sembrado' },
];

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

try {
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
    // Art is unreachable from this sandbox; refusing it turns the cards into
    // the client's own fallback tiles instead of hanging skeletons.
    await page.route('**/api.scryfall.com/**', (route) => route.abort());
    await page.route('**/cards.scryfall.io/**', (route) => route.abort());
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(shot.url, { waitUntil: 'domcontentloaded' });
    if (shot.mesaFixture) {
      await page.waitForSelector('.app', { timeout: 30_000 });
      await page.addScriptTag({ path: resolve(import.meta.dir, 'compare-boards-mesa-fixture.js') });
      await page.waitForFunction(() => window.__mesaFixtureInstalled === true, null, { timeout: 15_000 });
    }
    await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 3500));
    const path = join(outDir, shot.file);
    await page.screenshot({ path });
    const size = statSync(path).size;
    console.log(`${shot.file}  ${size} B  ${shot.note}`);
    if (errors.length) console.log(`  errores de página: ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
}
