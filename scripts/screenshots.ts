#!/usr/bin/env bun
/**
 * Real screenshots of Mesa, from a real Chromium.
 *
 * The E2E suite proves behaviour; this proves what a person sees. It starts the
 * dev server itself, walks the screens that do not need the engine artifact,
 * and writes one PNG per width plus a couple of states (deck builder open,
 * import panel).
 *
 * Usage:
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=… bun scripts/screenshots.ts
 *   bun scripts/screenshots.ts --out docs/screenshots --port 5178
 *
 * It refuses to produce a blank gallery: every shot is checked for painted
 * pixels (a page rendered without fonts is white, and a blank PNG is ~800 B).
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function argOf(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const outDir = resolve(argOf('--out') ?? 'docs/screenshots');
const port = argOf('--port') ?? '5178';
const baseURL = `http://127.0.0.1:${port}`;
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const server = Bun.spawn(['bun', 'run', 'dev', '--port', port], { stdout: 'ignore', stderr: 'ignore' });
async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseURL, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await Bun.sleep(500);
  }
  throw new Error(`el servidor no respondió en ${baseURL}`);
}

const shots: { file: string; width: number; height: number; note: string }[] = [];
try {
  await waitForServer();
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  for (const [width, height] of [[320, 800], [375, 812], [390, 844], [768, 1024], [1440, 900]] as const) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    // The banner about the missing engine is part of the truth: if the artifact
    // is absent, the screenshot must show it, not hide it.
    const file = `inicio-${width}.png`;
    await page.screenshot({ path: join(outDir, file), fullPage: true });
    shots.push({ file, width, height, note: 'inicio' });
    await page.close();
  }

  // `/stress` is a deterministic UI fixture (no rules, no engine): the hand,
  // the battlefield, tapped lands, tokens, attachments and transformed cards
  // are all real components. This is the only screen that can be photographed
  // without the WASM artifact, and it is the one that matters for legibility.
  for (const [width, hand, tokens] of [[320, 30, 20], [390, 30, 20], [768, 30, 20], [1440, 15, 12]] as const) {
    const stress = await browser.newPage({ viewport: { width, height: 900 } });
    await stress.route('**/api.scryfall.com/**', (route) => route.abort());
    await stress.goto(`${baseURL}/stress?hand=${hand}&tokens=${tokens}`, { waitUntil: 'networkidle' });
    await stress.waitForTimeout(400);
    const file = `cartas-${width}.png`;
    await stress.screenshot({ path: join(outDir, file), fullPage: true });
    shots.push({ file, width, height: 900, note: `mano de ${hand}, ${tokens} fichas` });
    await stress.close();
  }

  // The densest board the fixture allows: 60 cards in hand, 60 tokens.
  const saturate = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await saturate.route('**/api.scryfall.com/**', (route) => route.abort());
  await saturate.goto(`${baseURL}/stress?hand=60&tokens=60`, { waitUntil: 'networkidle' });
  await saturate.waitForTimeout(400);
  await saturate.screenshot({ path: join(outDir, 'saturacion-390.png'), fullPage: true });
  shots.push({ file: 'saturacion-390.png', width: 390, height: 900, note: '60 en mano, 60 fichas' });
  await saturate.close();

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  const toggle = page.getByRole('button', { name: /^Mis mazos$|^Ocultar constructor$/ }).first();
  if ((await toggle.count()) > 0) {
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(outDir, 'constructor-1440.png'), fullPage: true });
    shots.push({ file: 'constructor-1440.png', width: 1440, height: 900, note: 'constructor de mazos' });

    const importButton = page.getByRole('button', { name: 'Importar lista' }).first();
    if ((await importButton.count()) > 0) {
      await importButton.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(outDir, 'importar-1440.png'), fullPage: true });
      shots.push({ file: 'importar-1440.png', width: 1440, height: 900, note: 'importar lista' });
    }
    await page.close();
  }

  // Dark theme, if the app supports the system preference.
  const dark = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await dark.goto(baseURL, { waitUntil: 'networkidle' });
  await dark.screenshot({ path: join(outDir, 'inicio-390-oscuro.png'), fullPage: true });
  shots.push({ file: 'inicio-390-oscuro.png', width: 390, height: 844, note: 'tema oscuro del sistema' });
  await dark.close();
  await browser.close();
} finally {
  server.kill();
}

/** A blank page still screenshots; a text-free render is ~800 B. */
let failures = 0;
for (const shot of shots) {
  const path = join(outDir, shot.file);
  const size = statSync(path).size;
  const painted = size > 6_000;
  if (!painted) failures += 1;
  console.log(`  ${painted ? '✔' : '✘'} ${shot.file.padEnd(24)} ${(size / 1024).toFixed(0).padStart(4)} KiB  ${shot.note}`);
}
console.log(`\n${shots.length} capturas en ${outDir} (${readdirSync(outDir).length} archivos)`);
if (failures) {
  console.log(`${failures} capturas parecen vacías: revisa fuentes (no exportes FONTCONFIG_PATH).`);
  process.exit(1);
}
