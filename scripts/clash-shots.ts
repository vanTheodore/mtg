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
  { scene: 'clashPlaceAway', file: 'ux-colocacion-ajena-1440.jpg', block: '[data-clash-placement]' },
  { scene: 'sideboard', file: 'ux-ajustar-mazo-1440.jpg', block: '[data-sideboard]' },
  { scene: 'sideboardNoSide', file: 'ux-sin-banquillo-1440.jpg', block: '[data-sideboard]' },
  { scene: 'sideboardAway', file: 'ux-ajuste-ajeno-1440.jpg', block: '[data-sideboard]' },
  { scene: 'playDraw', file: 'ux-jugar-o-robar-1440.jpg', block: '[data-play-draw]' },
  { scene: 'playDrawDraw', file: 'ux-solo-robar-1440.jpg', block: '[data-play-draw]' },
  { scene: 'playDrawAway', file: 'ux-jugar-robar-ajeno-1440.jpg', block: '[data-play-draw]' },
  { scene: 'bottomRipple', file: 'ux-fondo-estruendo-1440.jpg', block: '[data-bottom-order]' },
  { scene: 'bottomReveal', file: 'ux-fondo-revelado-1440.jpg', block: '[data-bottom-order]' },
  { scene: 'bottomDig', file: 'ux-fondo-mirado-1440.jpg', block: '[data-bottom-order]' },
  { scene: 'bottomEmpty', file: 'ux-fondo-vacio-1440.jpg', block: '[data-bottom-order]' },
  { scene: 'bottomAway', file: 'ux-fondo-ajeno-1440.jpg', block: '[data-bottom-order]' },
  { scene: 'ringBearer', file: 'ux-portador-anillo-1440.jpg', block: '[data-exact-candidate]' },
  { scene: 'ringBearerOne', file: 'ux-un-portador-anillo-1440.jpg', block: '[data-exact-candidate]' },
  { scene: 'ringBearerAway', file: 'ux-portador-ajeno-1440.jpg', block: '[data-exact-candidate]' },
  { scene: 'legend', file: 'ux-regla-leyendas-1440.jpg', block: '[data-exact-candidate]' },
  { scene: 'legendAway', file: 'ux-leyendas-ajenas-1440.jpg', block: '[data-exact-candidate]' },
  { scene: 'protoProtector', file: 'ux-protector-batalla-1440.jpg', block: '[data-exact-candidate]' },
  { scene: 'protoOne', file: 'ux-un-protector-batalla-1440.jpg', block: '[data-exact-candidate]' },
  { scene: 'protoAway', file: 'ux-protector-ajeno-1440.jpg', block: '[data-exact-candidate]' },
  { scene: 'dungeon', file: 'ux-elegir-dungeon-1440.jpg', block: '[data-dungeon]' },
  { scene: 'dungeonOne', file: 'ux-una-dungeon-1440.jpg', block: '[data-dungeon]' },
  { scene: 'dungeonAway', file: 'ux-dungeon-ajena-1440.jpg', block: '[data-dungeon]' },
  { scene: 'dungeonRoom', file: 'ux-habitacion-dungeon-1440.jpg', block: '[data-dungeon]' },
  { scene: 'dungeonRoomOne', file: 'ux-una-habitacion-1440.jpg', block: '[data-dungeon]' },
  { scene: 'dungeonRoomAway', file: 'ux-habitacion-ajena-1440.jpg', block: '[data-dungeon]' },
  { scene: 'behold', file: 'ux-behold-1440.jpg', block: '[data-pick-one]' },
  { scene: 'beholdOne', file: 'ux-un-behold-1440.jpg', block: '[data-pick-one]' },
  { scene: 'beholdAway', file: 'ux-behold-ajeno-1440.jpg', block: '[data-pick-one]' },
  { scene: 'populate', file: 'ux-poblar-1440.jpg', block: '[data-pick-one]' },
  { scene: 'populateOne', file: 'ux-un-poblar-1440.jpg', block: '[data-pick-one]' },
  { scene: 'populateAway', file: 'ux-poblar-ajeno-1440.jpg', block: '[data-pick-one]' },
  { scene: 'specialize', file: 'ux-especializar-1440.jpg', block: '[data-specialize]' },
  { scene: 'specializeOne', file: 'ux-un-color-especializar-1440.jpg', block: '[data-specialize]' },
  { scene: 'specializeAway', file: 'ux-especializar-ajeno-1440.jpg', block: '[data-specialize]' },
  { scene: 'roomDoor', file: 'ux-puerta-room-1440.jpg', block: '[data-room-door]' },
  { scene: 'roomDoorOne', file: 'ux-una-puerta-1440.jpg', block: '[data-room-door]' },
  { scene: 'roomDoorAway', file: 'ux-puerta-ajena-1440.jpg', block: '[data-room-door]' }
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
