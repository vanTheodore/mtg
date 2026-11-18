#!/usr/bin/env bun
/**
 * One-off: the six clash scenes at desktop width, cropped to the block.
 *
 * The committed `ux-*-1440.jpg` files are the *block*, not the whole field: at
 * 1440×900 with the classic chrome the decision panel sits below the fold, so a
 * full-frame shot would not show the window under review. This script opens each
 * scene at 1440×900, scrolls the block into view and captures its own box.
 *
 * Not part of the suite's assertions: `ux-lab.spec.ts` and `ux-themes.spec.ts`
 * are the ones that prove behaviour and contrast.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = 'docs/screenshots';
const port = '5179';
const baseURL = `http://127.0.0.1:${port}`;
const SHOTS = [
  { scene: 'clash', file: 'ux-oponente-choque-1440.jpg', block: '[data-clash]' },
  { scene: 'clashOne', file: 'ux-un-oponente-choque-1440.jpg', block: '[data-clash]' },
  { scene: 'clashAway', file: 'ux-choque-ajeno-1440.jpg', block: '[data-clash]' },
  { scene: 'clashPlace', file: 'ux-colocar-choque-1440.jpg', block: '[data-clash-placement]' },
  { scene: 'clashPlaceHidden', file: 'ux-colocar-oculta-1440.jpg', block: '[data-clash-placement]' },
  { scene: 'clashPlaceAway', file: 'ux-colocacion-ajena-1440.jpg', block: '[data-clash-placement]' }
];

mkdirSync(outDir, { recursive: true });
const server = spawn('bun', ['run', 'dev', '--port', port], { stdio: 'ignore' });
async function waitForServer() {
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

try {
  await waitForServer();
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  for (const { scene, file, block } of SHOTS) {
    await page.goto(`${baseURL}/ux?scene=${scene}`, { waitUntil: 'networkidle' });
    const prompt = page.locator(block).first();
    await prompt.waitFor({ state: 'visible' });
    await prompt.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await prompt.screenshot({ path: join(outDir, file), type: 'jpeg', quality: 80 });
    console.log('ok', file);
  }
  await browser.close();
} finally {
  server.kill('SIGTERM');
}
