import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * UX-DECISION 1.1 · baseline medible y evidencia antes/después.
 *
 * Este spec es **idéntico** para las dos variantes que el job de CI ejecuta:
 *   - `MESA_UI_VARIANT=baseline` contra un worktree del commit base
 *     dd531f46d20b6136cb2b7a40962a210fad6a4de0;
 *   - `MESA_UI_VARIANT=after` contra el HEAD de esta PR.
 * Ambas sirven el MISMO WASM E2E y los MISMOS fixtures de GameScenario, así que
 * la única diferencia es la interfaz. El spec sólo usa selectores que existen
 * en los dos árboles; cualquier atributo `data-decision-*` se lee de forma
 * opcional, nunca como precondición.
 *
 * Instrumentación 1.1 (sustituye a la de 1.0, que contaba mal):
 *   - un `<summary>` cuyo `<details>` está cerrado **es** un control visible:
 *     es el botón que abre el desplegable. Lo que no se ve es el *contenido*.
 *   - «visible» se descompone en cuatro hechos distintos: visibilidad CSS
 *     (`checkVisibility`), intersección con el viewport, recorte (visible pero
 *     no alcanzable por el puntero) y capacidad real de recibir eventos
 *     (`elementFromPoint` sobre el centro del control).
 *   - los objetivos táctiles se miden por geometría **y** hit-testing: un
 *     control cuenta como objetivo efectivo si su lado menor mide ≥44 px y el
 *     puntero cae sobre él.
 *   - `interactionsNeeded` no se declara: se **ejecuta** cada flujo y se
 *     cuentan los clics/toques realmente hechos hasta que el motor aplica la
 *     decisión (`data-actions-applied` avanza).
 *   - las acciones legales accesibles se publican por **identidad**
 *     (`data-decision-action` / clave estable, o etiqueta accesible en la UI
 *     base), no como un recuento de botones.
 *   - `boardSharePercent` se publica por escenario; el comparador resume
 *     promedio y extremos, nunca una suma de porcentajes.
 *
 * Cada escenario declara la ventana `WaitingFor` que el fixture produce y
 * `openScenario` la verifica contra `data-waiting`: una medición que no
 * corresponde al estado que dice medir hace fallar el spec.
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

/** Estado exacto que cada fixture de GameScenario produce. */
const SCENARIO_WAITING: Record<string, string> = {
  'priority-empty': 'Priority',
  'priority-stack': 'Priority',
  'target-cast': 'Priority',
  'manual-payment': 'Priority',
  'declare-attackers': 'DeclareAttackers',
  'declare-blockers': 'DeclareBlockers',
  'obligatory-decision': 'KeepExactPermanentsChoice',
  'optional-decision': 'OptionalEffectChoice'
};
const SCENARIOS = Object.keys(SCENARIO_WAITING);
const THEMES = [{ theme: 'light', slug: 'claro' }, { theme: 'dark', slug: 'oscuro' }] as const;

interface Metrics {
  variant: string;
  scenario: string;
  viewport: string;
  theme: string;
  /** Ventana que el fixture declara y `data-waiting` confirmó. */
  waitingKind: string;
  cssVisibleControls: number;
  visibleControls: number;
  hittableControls: number;
  clippedControls: number;
  summariesVisible: number;
  primaryControls: number;
  secondaryControls: number;
  totalControls: number;
  advancedStopsVisible: number;
  effectiveTouchTargets: number;
  touchTargetsBelow44: number;
  smallestTouchTarget: number;
  panelHeight: number;
  panelArea: number;
  boardArea: number;
  viewportArea: number;
  boardSharePercent: number;
  /** Interacciones ejecutadas de verdad para completar el flujo (por escenario). */
  interactionsNeeded: number;
  /** Identidades de las acciones legales alcanzables, no un recuento. */
  accessibleActionIdentities: string[];
  primaryActionAccessible: boolean;
  /** Superficie avanzada *abierta*: controles y cuántos no se pueden pulsar. */
  advancedOpenControls: number;
  advancedOpenUnreachable: number;
  advancedOpenSmallestTarget: number;
  decisionPrimary: string | null;
  decisionConsequence: boolean;
}

const results: Metrics[] = [];
/** Interacciones ejecutadas por escenario en esta variante (flujos reales). */
const executedInteractions = new Map<string, number>();

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
  const expected = SCENARIO_WAITING[id];
  if (!expected) throw new Error(`escenario sin ventana declarada: ${id}`);
  // La medición tiene que corresponder al estado que dice medir.
  await expect(page.locator('.app'), `el fixture ${id} no produjo ${expected}`).toHaveAttribute(
    'data-waiting', expected, { timeout: 30_000 }
  );
  await expect(page.locator('section[aria-label="Decisión pendiente"]')).toBeVisible();
}

const applied = (page: Page) => page.locator('.app').getAttribute('data-actions-applied');

/** Botón principal en cualquiera de las dos UI (la base no publica la clave). */
function primaryLocator(page: Page) {
  return page.locator('[data-decision-primary], section[aria-label="Decisión pendiente"] button.primary-action, section[aria-label="Decisión pendiente"] .confirmations > button').first();
}

async function measure(page: Page, scenario: string, viewport: string, theme: string): Promise<Metrics> {
  const raw = await page.evaluate(() => {
    const panel = document.querySelector('section[aria-label="Decisión pendiente"]') as HTMLElement | null;
    const board = document.querySelector('section[aria-label^="Tu campo de batalla"]') as HTMLElement | null;
    const app = document.querySelector('.app') as HTMLElement | null;
    if (!panel || !board || !app) throw new Error('falta el panel, el tablero o la app');
    const controls = [...panel.querySelectorAll('button, summary, input, select')] as HTMLElement[];

    const cssVisible = (el: HTMLElement): boolean => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      // El contenido de un <details> cerrado no se ve, pero su <summary> sí:
      // es el control que lo abre. Contar el summary como invisible era el
      // error de la instrumentación 1.0.
      const disclosure = el.closest('details');
      if (disclosure && !(disclosure as HTMLDetailsElement).open && el.tagName !== 'SUMMARY') return false;
      if (el.tagName !== 'SUMMARY') {
        const ancestors = [...document.querySelectorAll('details')].filter((d) => d !== disclosure && d.contains(el));
        if (ancestors.some((d) => !(d as HTMLDetailsElement).open)) return false;
      }
      const probe = el as HTMLElement & { checkVisibility?: (options?: { checkOpacity?: boolean; checkVisibilityCSS?: boolean; contentVisibilityAuto?: boolean }) => boolean };
      if (typeof probe.checkVisibility === 'function') {
        return probe.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true, contentVisibilityAuto: true });
      }
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none';
    };
    const inViewport = (el: HTMLElement): boolean => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && r.width > 0 && r.height > 0;
    };
    const hittable = (el: HTMLElement): boolean => {
      if (!cssVisible(el) || !inViewport(el)) return false;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        Math.min(Math.max(r.x + r.width / 2, 0), innerWidth - 1),
        Math.min(Math.max(r.y + r.height / 2, 0), innerHeight - 1)
      );
      return !!hit && (hit === el || el.contains(hit));
    };

    const css = controls.filter(cssVisible);
    const visible = css.filter(inViewport);
    const hittableList = controls.filter(hittable);
    const touch = (el: HTMLElement) => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height);
    const effective = hittableList.filter((el) => touch(el) >= 44);
    const primary = hittableList.filter((el) => el.matches('.primary, [data-tier="primary"]'));
    const stops = [...document.querySelectorAll('.stop-bar .step, details[data-advanced-controls] .step')] as HTMLElement[];
    const panelRect = panel.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    const viewportArea = window.innerWidth * window.innerHeight;
    const identityOf = (el: HTMLElement): string => {
      const keyed = el.getAttribute('data-decision-action') ?? el.getAttribute('data-decision-primary') ?? el.getAttribute('data-decision-cancel');
      if (keyed) return keyed;
      return `label:${(el.textContent ?? '').trim().split('\n')[0].slice(0, 80)}`;
    };
    return {
      waitingKind: app.getAttribute('data-waiting') ?? 'none',
      cssVisibleControls: css.length,
      visibleControls: visible.length,
      hittableControls: hittableList.length,
      clippedControls: visible.filter((el) => !hittable(el)).length,
      summariesVisible: visible.filter((el) => el.tagName === 'SUMMARY').length,
      primaryControls: primary.length,
      secondaryControls: Math.max(0, hittableList.length - primary.length),
      totalControls: controls.length,
      advancedStopsVisible: stops.filter(cssVisible).length,
      effectiveTouchTargets: effective.length,
      touchTargetsBelow44: hittableList.length - effective.length,
      smallestTouchTarget: hittableList.length ? Math.round(Math.min(...hittableList.map(touch))) : 0,
      panelHeight: Math.round(panelRect.height),
      panelArea: Math.round(panelRect.width * panelRect.height),
      boardArea: Math.round(boardRect.width * boardRect.height),
      viewportArea,
      boardSharePercent: Math.round((boardRect.width * boardRect.height / viewportArea) * 1000) / 10,
      accessibleActionIdentities: [...new Set(hittableList.map(identityOf))],
      decisionPrimary: panel.querySelector('[data-decision-primary]')?.textContent?.trim().split('\n')[0]
        ?? panel.querySelector('button')?.textContent?.trim().split('\n')[0] ?? null,
      decisionConsequence: !!panel.querySelector('[data-decision-consequence]'),
      actionsApplied: Number(app.getAttribute('data-actions-applied') ?? 0)
    };
  });

  return {
    variant: VARIANT, scenario, viewport, theme,
    waitingKind: raw.waitingKind,
    cssVisibleControls: raw.cssVisibleControls,
    visibleControls: raw.visibleControls,
    hittableControls: raw.hittableControls,
    clippedControls: raw.clippedControls,
    summariesVisible: raw.summariesVisible,
    primaryControls: raw.primaryControls,
    secondaryControls: raw.secondaryControls,
    totalControls: raw.totalControls,
    advancedStopsVisible: raw.advancedStopsVisible,
    effectiveTouchTargets: raw.effectiveTouchTargets,
    touchTargetsBelow44: raw.touchTargetsBelow44,
    smallestTouchTarget: raw.smallestTouchTarget,
    panelHeight: raw.panelHeight,
    panelArea: raw.panelArea,
    boardArea: raw.boardArea,
    viewportArea: raw.viewportArea,
    boardSharePercent: raw.boardSharePercent,
    interactionsNeeded: executedInteractions.get(scenario) ?? 0,
    accessibleActionIdentities: raw.accessibleActionIdentities,
    primaryActionAccessible: raw.primaryControls > 0 || raw.accessibleActionIdentities.length > 0,
    advancedOpenControls: 0,
    advancedOpenUnreachable: 0,
    advancedOpenSmallestTarget: 0,
    decisionPrimary: raw.decisionPrimary,
    decisionConsequence: raw.decisionConsequence
  };
}

/**
 * Abre la superficie avanzada y comprueba que **todos** sus controles se
 * pueden pulsar tras desplazarlos a la vista. No se cierra para evitar medir
 * el problema: si un control queda bajo otra capa, esto lo cuenta.
 */
async function measureAdvancedOpen(page: Page): Promise<{ total: number; unreachable: number; smallest: number }> {
  const tiers = page.locator('details[data-decision-tiers]');
  if (await tiers.count()) {
    const open = await tiers.evaluate((d: HTMLDetailsElement) => d.open);
    if (!open) await tiers.locator('summary').click();
  }
  return page.evaluate(() => {
    const scope = document.querySelector('details[data-decision-tiers]') as HTMLElement | null
      ?? document.querySelector('.stop-bar') as HTMLElement | null;
    if (!scope) return { total: 0, unreachable: 0, smallest: 0 };
    const controls = [...scope.querySelectorAll('button, summary, input, select')] as HTMLElement[];
    let unreachable = 0;
    let smallest = 0;
    for (const el of controls) {
      const rect0 = el.getBoundingClientRect();
      if (!rect0.width && !rect0.height) continue;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      const min = Math.min(r.width, r.height);
      if (min > 0) smallest = smallest === 0 ? Math.round(min) : Math.min(smallest, Math.round(min));
      const hit = document.elementFromPoint(
        Math.min(Math.max(r.x + r.width / 2, 0), innerWidth - 1),
        Math.min(Math.max(r.y + r.height / 2, 0), innerHeight - 1)
      );
      if (!hit || (hit !== el && !el.contains(hit))) unreachable += 1;
    }
    return { total: controls.length, unreachable, smallest };
  });
}

/**
 * Ejecuta el flujo de un escenario y cuenta las interacciones reales hasta
 * que el motor aplica la decisión. Nada de valores declarados.
 */
async function executeFlow(page: Page, scenario: string): Promise<number> {
  await openScenario(page, scenario);
  const panel = page.locator('section[aria-label="Decisión pendiente"]');
  const before = Number(await applied(page));
  let interactions = 0;
  const click = async (locator: ReturnType<Page['locator']>) => {
    await locator.click();
    interactions += 1;
  };
  if (scenario === 'priority-empty' || scenario === 'priority-stack') {
    await click(primaryLocator(page));
  } else if (scenario === 'declare-attackers' || scenario === 'declare-blockers') {
    await click(primaryLocator(page));
  } else if (scenario === 'optional-decision') {
    await click(panel.locator('[data-optional-effect] button').first());
  } else if (scenario === 'obligatory-decision') {
    const choices = panel.locator('[data-keep-exact-object]');
    await click(choices.nth(0));
    await click(choices.nth(1));
    await click(panel.locator('[data-keep-exact] button.primary'));
  } else if (scenario === 'target-cast' || scenario === 'manual-payment') {
    const card = page.locator('.hand-zone [data-card-id], .hand [data-card-id]').first();
    await click(card);
    const castButton = scenario === 'manual-payment'
      ? panel.locator('button').filter({ hasText: 'maná manualmente' }).first()
      : panel.locator('button').filter({ hasText: /^Lanzar/ }).first();
    await click(castButton);
    // Objetivos/pago reales si el motor los pide tras el lanzamiento.
    for (let step = 0; step < 6; step += 1) {
      const waiting = await page.locator('.app').getAttribute('data-waiting');
      if (waiting === 'TargetSelection' || waiting === 'TriggerTargetSelection') {
        const details = panel.locator('details[data-target-list]');
        if (!(await details.count())) break;
        if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) {
          await click(details.locator('summary'));
        }
        const choice = details.locator('button').filter({ hasText: /^Elegir Jugador 2$/ }).first();
        if (!(await choice.count())) break;
        await click(choice);
        continue;
      }
      if (waiting === 'ManaPayment' || waiting === 'ManaAbilityManaPayment') {
        const confirm = panel.locator('button').filter({ hasText: 'Confirmar pago' }).first();
        if (!(await confirm.count())) break;
        await click(confirm);
        continue;
      }
      break;
    }
  }
  await expect
    .poll(() => applied(page), { timeout: 15_000 })
    .not.toBe(String(before));
  return interactions;
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
      scenarioWaiting: SCENARIO_WAITING,
      viewports: VIEWPORTS.map((v) => v.slug),
      metrics: results
    }, null, 2)
  );
});

test.describe('MESA_EVIDENCE_UX_DECISION · flujos ejecutados (interacciones reales)', () => {
  test('completa cada flujo contando las interacciones hechas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const scenario of SCENARIOS) {
      const count = await executeFlow(page, scenario);
      expect(count, `el flujo ${scenario} no ejecutó ninguna interacción`).toBeGreaterThan(0);
      executedInteractions.set(scenario, count);
    }
  });
});

test.describe('MESA_EVIDENCE_UX_DECISION · matriz de viewports con motor real', () => {
  test('mide y captura los escenarios representativos en seis tamaños', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const scenario of SCENARIOS) {
        await openScenario(page, scenario);
        const metrics = await measure(page, scenario, viewport.slug, 'default');
        expect(metrics.waitingKind, `${scenario} no midió su ventana`).toBe(SCENARIO_WAITING[scenario]);
        results.push(metrics);
        await page.screenshot({ path: `${EVIDENCE_DIR}${viewport.slug}-${scenario}.png`, fullPage: false });
      }
    }
    expect(results.length).toBeGreaterThanOrEqual(VIEWPORTS.length * SCENARIOS.length);
  });

  test('la superficie avanzada abierta es alcanzable en escritorio, móvil y landscape', async ({ page }) => {
    for (const viewport of [{ width: 1440, height: 900, slug: '1440x900' }, { width: 390, height: 844, slug: '390x844' }, { width: 844, height: 390, slug: '844x390' }]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openScenario(page, 'priority-empty');
      const advanced = await measureAdvancedOpen(page);
      const metrics = await measure(page, 'priority-empty', viewport.slug, 'avanzado-abierto');
      metrics.advancedOpenControls = advanced.total;
      metrics.advancedOpenUnreachable = advanced.unreachable;
      metrics.advancedOpenSmallestTarget = advanced.smallest;
      results.push(metrics);
      if (VARIANT === 'after') {
        expect(advanced.total, `sin controles avanzados medibles a ${viewport.slug}`).toBeGreaterThan(0);
        expect(advanced.unreachable, `controles avanzados inalcanzables a ${viewport.slug}`).toBe(0);
      }
    }
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
    const before = Number(await applied(page));
    let interactions = 0;
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab');
      interactions += 1;
      const focused = page.locator(':focus');
      const text = (await focused.textContent().catch(() => '')) ?? '';
      if (text.includes('Pasar')) { await page.keyboard.press('Enter'); interactions += 1; break; }
    }
    await expect
      .poll(() => applied(page), { timeout: 10_000 })
      .not.toBe(String(before));
    executedInteractions.set('teclado', interactions);
    results.push(await measure(page, 'priority-empty', '390x844', 'teclado'));
  });
});

test.describe('MESA_EVIDENCE_UX_DECISION · táctil', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('un toque en el control principal mueve el motor', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openScenario(page, 'priority-empty');
    const before = Number(await applied(page));
    const pass = page.locator('section[aria-label="Decisión pendiente"] button').filter({ hasText: 'Pasar' }).first();
    await expect(pass).toBeVisible();
    await pass.tap();
    await expect
      .poll(() => applied(page), { timeout: 10_000 })
      .not.toBe(String(before));
    const metrics = await measure(page, 'priority-empty', '390x844', 'tactil');
    results.push(metrics);
    await page.screenshot({ path: `${EVIDENCE_DIR}tactil-390x844.png` });
  });
});
