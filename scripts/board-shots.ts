#!/usr/bin/env bun
/**
 * El tablero de Mesa, antes y después de acercarlo a Phase.
 *
 * Un solo Chromium, una sola fixture (`compare-boards-mesa-fixture.js`, la
 * misma instantánea `EngineSnapshot` que usan las capturas de comparación) y
 * las medidas del DOM en el mismo pase que la foto: lo que el guion imprime es
 * lo que se puede comprobar en la imagen.
 *
 * Uso:
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=… bun scripts/board-shots.ts \
 *     --mesa http://127.0.0.1:5173 --out docs/screenshots --tag antes
 *
 * Escribe `docs/screenshots/tablero-<tag>-<ancho>.jpg` y
 * `docs/evidence/tablero-<tag>-<ancho>.json`.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function argOf(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const mesa = argOf('--mesa') ?? 'http://127.0.0.1:5173';
const outDir = resolve(argOf('--out') ?? 'docs/screenshots');
const evidenceDir = resolve('docs/evidence');
const tag = argOf('--tag') ?? 'despues';
const wait = Number(process.env.SHOT_WAIT ?? 4500);
mkdirSync(outDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

const SIZES = [
  { width: 1440, height: 900, label: '1440' },
  { width: 1280, height: 800, label: '1280' },
  { width: 390, height: 844, label: '390' },
] as const;

/** Every number below is read from the live DOM; nothing is estimated here. */
const MEASURE = () => {
  const box = (element: Element | null) => {
    if (!element) return null;
    const r = element.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const text = (selector: string) => document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const steps = document.querySelector<HTMLElement>('.stop-bar .steps');
  const visibleSteps = steps
    ? [...steps.querySelectorAll('button')]
        .filter((button) => {
          const b = button.getBoundingClientRect();
          const p = steps.getBoundingClientRect();
          return b.left >= p.left - 1 && b.right <= p.right + 1;
        })
        .map((button) => button.textContent?.trim())
    : [];
  const cardSizes = (selector: string) =>
    [...document.querySelectorAll(`${selector} [data-card-id]`)].map((card) => box(card));
  const root = document.documentElement;
  const layout = document.querySelector<HTMLElement>('main.layout');
  return {
    viewport: { width: innerWidth, height: innerHeight },
    documentHeight: root.scrollHeight,
    horizontalOverflow: root.scrollWidth - innerWidth,
    boxes: {
      topbar: box(document.querySelector('header.topbar')),
      layout: box(layout),
      opponentField: box(document.querySelector('main.layout > .battlefield[data-side="opponent"]')),
      playerField: box(document.querySelector('main.layout > .battlefield[data-side="player"]')),
      middle: box(document.querySelector('main.layout > .middle')),
      decision: box(document.querySelector('section[aria-label="Decisión pendiente"]')),
      log: box(document.querySelector('section[aria-label="Registro de la partida"]')),
      stopBar: box(document.querySelector('section[aria-label="Fases y paradas"]')),
      opponentSeat: box(document.querySelector('section[aria-label^="Jugador 2"]')),
      playerSeat: box(document.querySelector('section[aria-label^="Jugador 1"]')),
      hand: box(document.querySelector('.hand-zone')),
      handTrigger: box(document.querySelector('.hand-trigger')),
      statusDock: box(document.querySelector('.status-dock')),
      coach: box(document.querySelector('.coach')),
      metrics: box(document.querySelector('footer.metrics')),
      rivalHand: box(document.querySelector('.rival-hand')),
    },
    phaseRail: {
      clientWidth: steps?.clientWidth ?? 0,
      scrollWidth: steps?.scrollWidth ?? 0,
      visible: visibleSteps,
      total: steps?.querySelectorAll('button').length ?? 0,
    },
    lands: cardSizes('main.layout > .battlefield[data-side="player"] [data-zone="middle"]'),
    creatures: cardSizes('main.layout > .battlefield[data-side="player"] [data-zone="creatures"]'),
    handCards: cardSizes('.hand-zone'),
    logText: text('section[aria-label="Registro de la partida"]'),
    layoutScroll: layout ? { clientHeight: layout.clientHeight, scrollHeight: layout.scrollHeight } : null,
  };
};

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await page.route('**/api.scryfall.com/**', (route) => route.abort());
    await page.route('**/cards.scryfall.io/**', (route) => route.abort());
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`${mesa}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app', { timeout: 30_000 });
    await page.addScriptTag({ path: resolve(import.meta.dir, 'compare-boards-mesa-fixture.js') });
    await page.waitForFunction('window.__mesaFixtureInstalled === true', null, { timeout: 15_000 });
    await page.waitForTimeout(wait);
    const shot = join(outDir, `tablero-${tag}-${size.label}.jpg`);
    await page.screenshot({ path: shot });
    const measured = await page.evaluate(MEASURE);
    const evidence = join(evidenceDir, `tablero-${tag}-${size.label}.json`);
    writeFileSync(evidence, JSON.stringify(measured, null, 2));
    console.log(`${shot}  ${statSync(shot).size} B  deuda ${Math.max(0, (measured as { documentHeight: number }).documentHeight - size.height)} px  pasos ${(measured as { phaseRail: { visible: string[]; total: number } }).phaseRail.visible.length}/${(measured as { phaseRail: { visible: string[]; total: number } }).phaseRail.total}`);
    if (errors.length) console.log(`  errores de página: ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
}
