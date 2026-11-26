import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * UX-DECISION 1.0 · baseline medible y evidencia antes/después.
 *
 * Este spec es **idéntico** para las dos variantes que el job de CI ejecuta:
 *   - `MESA_UI_VARIANT=baseline` contra un worktree del commit base
 *     dd531f46d20b6136cb2b7a40962a210fad6a4de0;
 *   - `MESA_UI_VARIANT=after` contra el HEAD de esta PR.
 * Ambas sirven el MISMO WASM E2E y los MISMOS fixtures de GameScenario, así que
 * la única diferencia es la interfaz. Por eso el spec sólo usa selectores que
 * existen en los dos árboles (`section[aria-label="Decisión pendiente"]`,
 * `.app`, botones y `<details>`); cualquier atributo `data-decision-*` se lee
 * de forma opcional, nunca como precondición.
 *
 * Las capturas quedan fijadas a los SHA que el workflow publica en
 * `evidence.json`, no a una fecha: `variant/theme/viewport/scenario.png`.
 */
const VARIANT = process.env.MESA_UI_VARIANT === 'baseline' ? 'baseline' : 'after';
const URL_BASE = process.env.MESA_EVIDENCE_URL ?? 'http://127.0.0.1:5173';
const HEAD_SHA = process.env.MESA_EVIDENCE_SHA ?? 'local';
const BASE_SHA = process.env.MESA_BASELINE_SHA ?? 'dd531f46d20b6136cb2b7a40962a210fad6a4de0';
const OUT = process.env.MESA_EVIDENCE_OUT
  ?? fileURLToPath(new URL(`../../test-results/ux-decision/${VARIANT}/`, import.meta.url));
const EVIDENCE_DIR = OUT.endsWith('/') ? OUT : `${OUT}/`;

const VIEWPORTS = [
  { width: 320, height: 844, slug: '320x844' },
  { width: 375, height: 844, slug: '375x844' },
  { width: 390, height: 844, slug: '390x844' },
  { width: 768, height: 900, slug: '768x900' },
  { width: 1440, height: 900, slug: '1440x900' },
  { width: 844, height: 390, slug: '844x390' }
] as const;
const SCENARIOS = ['priority-empty', 'target-cast'] as const;
const THEMES = [{ theme: 'light', slug: 'claro' }, { theme: 'dark', slug: 'oscuro' }] as const;

interface Metrics {
  variant: string;
  scenario: string;
  viewport: string;
  theme: string;
  visibleControls: number;
  primaryControls: number;
  secondaryControls: number;
  totalControls: number;
  advancedStopsVisible: number;
  effectiveTouchTargets: number;
  smallestTouchTarget: number;
  panelHeight: number;
  panelArea: number;
  boardArea: number;
  viewportArea: number;
  boardSharePercent: number;
  interactionsNeeded: number;
  legalActionsAccessible: number;
  decisionPrimary: string | null;
  decisionConsequence: boolean;
}

const results: Metrics[] = [];

async function openScenario(page: Page, id: string, theme?: string, chrome = 'arena') {
  await page.addInitScript(
    ({ themeValue, chromeValue }) => {
      localStorage.setItem('mesa:autoPass', 'off');
      localStorage.setItem('mesa:handoffMode', 'turn');
      localStorage.setItem('mesa:boardStyle', chromeValue);
      if (themeValue) localStorage.setItem('mesa:theme', themeValue);
    },
    { themeValue: theme ?? null, chromeValue: chrome }
  );
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto(`${URL_BASE}/?e2e-scenario=${id}`);
  await expect(page.locator('.hand-trigger'), `no se montó el estado GameScenario ${id}`).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.app')).toHaveAttribute('data-viewer', '0');
}

async function measure(page: Page, scenario: string, viewport: string, theme: string): Promise<Metrics> {
  const raw = await page.evaluate(() => {
    const panel = document.querySelector('section[aria-label="Decisión pendiente"]') as HTMLElement | null;
    const board = document.querySelector('section[aria-label^="Tu campo de batalla"]') as HTMLElement | null;
    const app = document.querySelector('.app') as HTMLElement | null;
    if (!panel || !board || !app) throw new Error('falta el panel, el tablero o la app');
    const controls = [...panel.querySelectorAll('button, summary, input, select')] as HTMLElement[];
    const isVisible = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const visible = controls.filter(isVisible);
    const touch = (el: HTMLElement) => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height);
    const primary = visible.filter((el) => el.matches('.primary, [data-tier="primary"]'));
    const stops = [...document.querySelectorAll('.stop-bar .step, details[data-advanced-controls] .step')] as HTMLElement[];
    const panelRect = panel.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    const viewportArea = window.innerWidth * window.innerHeight;
    return {
      visibleControls: visible.length,
      primaryControls: primary.length,
      secondaryControls: visible.length - primary.length,
      totalControls: controls.length,
      advancedStopsVisible: stops.filter(isVisible).length,
      effectiveTouchTargets: visible.filter((el) => touch(el) >= 44).length,
      smallestTouchTarget: visible.length ? Math.round(Math.min(...visible.map(touch))) : 0,
      panelHeight: Math.round(panelRect.height),
      panelArea: Math.round(panelRect.width * panelRect.height),
      boardArea: Math.round(boardRect.width * boardRect.height),
      viewportArea,
      boardSharePercent: Math.round((boardRect.width * boardRect.height / viewportArea) * 1000) / 10,
      legalActionsAccessible: controls.filter((el) => el.tagName === 'BUTTON').length,
      decisionPrimary: panel.querySelector('[data-decision-primary]')?.textContent?.trim().split('\n')[0] ?? null,
      decisionConsequence: !!panel.querySelector('[data-decision-consequence]'),
      actionsApplied: Number(app.getAttribute('data-actions-applied') ?? 0)
    };
  });

  // Interacciones necesarias para completar el flujo de prioridad: un único
  // control principal. Se mide aquí de forma declarativa; la *transición real*
  // se verifica en los tests de teclado/táctil de este mismo spec y en
  // `ux-decision.spec.ts`, que comprueban que Phase aplicó la acción.
  const interactionsNeeded = raw.primaryControls > 0 ? 1 : raw.visibleControls > 0 ? 1 : 0;

  return {
    variant: VARIANT, scenario, viewport, theme,
    visibleControls: raw.visibleControls,
    primaryControls: raw.primaryControls,
    secondaryControls: raw.secondaryControls,
    totalControls: raw.totalControls,
    advancedStopsVisible: raw.advancedStopsVisible,
    effectiveTouchTargets: raw.effectiveTouchTargets,
    smallestTouchTarget: raw.smallestTouchTarget,
    panelHeight: raw.panelHeight,
    panelArea: raw.panelArea,
    boardArea: raw.boardArea,
    viewportArea: raw.viewportArea,
    boardSharePercent: raw.boardSharePercent,
    interactionsNeeded,
    legalActionsAccessible: raw.legalActionsAccessible,
    decisionPrimary: raw.decisionPrimary,
    decisionConsequence: raw.decisionConsequence
  };
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

test.afterAll(async () => {
  await writeFile(
    `${EVIDENCE_DIR}metrics.json`,
    JSON.stringify({
      variant: VARIANT,
      headSha: HEAD_SHA,
      baselineSha: BASE_SHA,
      afterSha: VARIANT === 'after' ? HEAD_SHA : null,
      capturedAt: new Date().toISOString(),
      scenarios: SCENARIOS,
      viewports: VIEWPORTS.map((v) => v.slug),
      metrics: results
    }, null, 2)
  );
});

test.describe('MESA_EVIDENCE_UX_DECISION · matriz de viewports con motor real', () => {
  test('mide y captura los dos escenarios en seis tamaños', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const scenario of SCENARIOS) {
        await openScenario(page, scenario);
        const metrics = await measure(page, scenario, viewport.slug, 'default');
        results.push(metrics);
        await page.screenshot({ path: `${EVIDENCE_DIR}${viewport.slug}-${scenario}.png`, fullPage: false });
      }
    }
    expect(results.length).toBe(VIEWPORTS.length * SCENARIOS.length);
  });
});

test.describe('MESA_EVIDENCE_UX_DECISION · temas claro y oscuro', () => {
  for (const { theme, slug } of THEMES) {
    test(`tema ${slug}: captura, contraste auditado y transición real`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openScenario(page, 'priority-empty', theme, 'classic');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const metrics = await measure(page, 'priority-empty', '390x844', slug);
      results.push(metrics);
      await page.screenshot({ path: `${EVIDENCE_DIR}tema-${slug}-390x844.png` });
      const violations = await new AxeBuilder({ page }).analyze();
      const serious = violations.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      expect(serious.map((v) => v.id)).toEqual([]);
    });
  }
});

test.describe('MESA_EVIDENCE_UX_DECISION · teclado', () => {
  test('el botón principal se alcanza con Tab y aplica la acción con Enter', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openScenario(page, 'priority-empty');
    const before = Number(await page.locator('.app').getAttribute('data-actions-applied'));
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      const text = (await focused.textContent().catch(() => '')) ?? '';
      if (text.includes('Pasar')) { await page.keyboard.press('Enter'); break; }
    }
    await expect
      .poll(() => page.locator('.app').getAttribute('data-actions-applied'), { timeout: 10_000 })
      .not.toBe(String(before));
    results.push(await measure(page, 'priority-empty', '390x844', 'teclado'));
  });
});

test.describe('MESA_EVIDENCE_UX_DECISION · táctil', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('un toque en el control principal mueve el motor', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openScenario(page, 'priority-empty');
    const before = Number(await page.locator('.app').getAttribute('data-actions-applied'));
    const pass = page.locator('section[aria-label="Decisión pendiente"] button').filter({ hasText: 'Pasar' }).first();
    await expect(pass).toBeVisible();
    await pass.tap();
    await expect
      .poll(() => page.locator('.app').getAttribute('data-actions-applied'), { timeout: 10_000 })
      .not.toBe(String(before));
    const metrics = await measure(page, 'priority-empty', '390x844', 'tactil');
    results.push(metrics);
    await page.screenshot({ path: `${EVIDENCE_DIR}tactil-390x844.png` });
  });
});
