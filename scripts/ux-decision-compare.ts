#!/usr/bin/env bun
/**
 * UX-DECISION 1.1 · comparación cuantitativa baseline ↔ resultado.
 *
 * Lee los dos `metrics.json` que el job `ux-evidence` produce con el MISMO
 * spec, los MISMOS fixtures de GameScenario y el MISMO WASM E2E (sólo cambia
 * la UI), y publica las deltas.
 *
 * Gate 1.1 — integridad por **identidad y accesibilidad**, no por recuento:
 *   - cada par mide la ventana `WaitingFor` que su escenario declara;
 *   - la acción principal de cada estado sigue siendo alcanzable por el
 *     puntero (identidad publicada y hit-testing, no «hay N botones»);
 *   - ningún flujo necesita más interacciones **ejecutadas** que en la base;
 *   - ningún control alcanzable queda por debajo del objetivo táctil de 44 px;
 *   - la superficie avanzada abierta no deja controles inalcanzables;
 *   - las paradas avanzadas no aumentan su exposición permanente.
 *
 * Lo que 1.0 comprobaba y 1.1 elimina a propósito: que el número total de
 * botones no disminuya. Ese gate penalizaba quitar controles genuinamente
 * redundantes y confundía «hay un botón» con «la acción legal es accesible».
 * La reducción de densidad se informa; no se impone ni se prohíbe.
 *
 * Los porcentajes de pantalla se resumen por escenario con promedio y
 * extremos (mín/máx). Sumar porcentajes de viewports distintos y presentar el
 * total como una proporción no significa nada, y ya no se hace.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';

interface Metrics {
  variant: string;
  scenario: string;
  viewport: string;
  theme: string;
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
  interactionsNeeded: number;
  accessibleActionIdentities: string[];
  primaryActionAccessible: boolean;
  advancedOpenControls: number;
  advancedOpenUnreachable: number;
  advancedOpenSmallestTarget: number;
  decisionPrimary: string | null;
  decisionConsequence: boolean;
}
interface Report {
  variant: string; headSha: string; baselineSha: string; afterSha: string | null;
  scenarioWaiting?: Record<string, string>;
  metrics: Metrics[];
}

const root = process.env.MESA_EVIDENCE_ROOT ?? 'evidence';
const after: Report = JSON.parse(await readFile(`${root}/after/metrics.json`, 'utf8'));
const before: Report = JSON.parse(await readFile(`${root}/baseline/metrics.json`, 'utf8'));
const key = (m: Metrics) => `${m.viewport}|${m.scenario}|${m.theme}`;
const beforeByKey = new Map(before.metrics.map((m) => [key(m), m]));

const rows: {
  key: string; before: Metrics; after: Metrics;
  delta: Record<string, number>;
}[] = [];
const failures: string[] = [];

for (const m of after.metrics) {
  const b = beforeByKey.get(key(m));
  if (!b) { failures.push(`falta la medición baseline de ${key(m)}`); continue; }
  const expectedWaiting = after.scenarioWaiting?.[m.scenario] ?? before.scenarioWaiting?.[m.scenario];
  if (expectedWaiting && m.waitingKind !== expectedWaiting) {
    failures.push(`${key(m)}: la medición after dice ${m.waitingKind} y el escenario declara ${expectedWaiting}`);
  }
  if (expectedWaiting && b.waitingKind !== expectedWaiting) {
    failures.push(`${key(m)}: la medición baseline dice ${b.waitingKind} y el escenario declara ${expectedWaiting}`);
  }
  // Identidad y accesibilidad, no recuento: la acción principal del estado
  // sigue publicada con su identidad y alcanzable por el puntero.
  if (!m.primaryActionAccessible || !m.accessibleActionIdentities.length) {
    failures.push(`${key(m)}: la acción principal dejó de ser accesible (identidades: ${JSON.stringify(m.accessibleActionIdentities)})`);
  }
  if (m.interactionsNeeded > 0 && b.interactionsNeeded > 0 && m.interactionsNeeded > b.interactionsNeeded) {
    failures.push(`${key(m)}: el flujo ejecutado necesita más interacciones (${b.interactionsNeeded} → ${m.interactionsNeeded})`);
  }
  if (m.touchTargetsBelow44 > 0) {
    failures.push(`${key(m)}: ${m.touchTargetsBelow44} objetivo(s) alcanzable(s) por debajo de 44 px (menor: ${m.smallestTouchTarget})`);
  }
  if (m.advancedOpenUnreachable > 0) {
    failures.push(`${key(m)}: ${m.advancedOpenUnreachable} control(es) avanzado(s) inalcanzable(s) con la superficie abierta`);
  }
  const delta = {
    cssVisibleControls: m.cssVisibleControls - b.cssVisibleControls,
    visibleControls: m.visibleControls - b.visibleControls,
    hittableControls: m.hittableControls - b.hittableControls,
    clippedControls: m.clippedControls - b.clippedControls,
    summariesVisible: m.summariesVisible - b.summariesVisible,
    primaryControls: m.primaryControls - b.primaryControls,
    secondaryControls: m.secondaryControls - b.secondaryControls,
    totalControls: m.totalControls - b.totalControls,
    advancedStopsVisible: m.advancedStopsVisible - b.advancedStopsVisible,
    effectiveTouchTargets: m.effectiveTouchTargets - b.effectiveTouchTargets,
    touchTargetsBelow44: m.touchTargetsBelow44 - b.touchTargetsBelow44,
    smallestTouchTarget: m.smallestTouchTarget - b.smallestTouchTarget,
    panelHeight: m.panelHeight - b.panelHeight,
    boardSharePercent: Math.round((m.boardSharePercent - b.boardSharePercent) * 10) / 10,
    interactionsNeeded: m.interactionsNeeded - b.interactionsNeeded
  };
  if (delta.advancedStopsVisible > 0) failures.push(`${key(m)}: aumentó la exposición permanente de paradas`);
  rows.push({ key: key(m), before: b, after: m, delta });
}

const sum = (pick: (r: typeof rows[number]) => number) => rows.reduce((total, r) => total + pick(r), 0);
const stats = (values: number[]) => values.length
  ? {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: Math.round((values.reduce((a, v) => a + v, 0) / values.length) * 10) / 10
  }
  : { min: 0, max: 0, avg: 0 };
const summary = {
  baselineSha: before.baselineSha,
  afterSha: after.headSha,
  pairs: rows.length,
  scenarios: [...new Set(rows.map((r) => r.after.scenario))],
  // Recuentos: se informan, no son el gate.
  visibleControls: { baseline: sum((r) => r.before.visibleControls), after: sum((r) => r.after.visibleControls), delta: sum((r) => r.delta.visibleControls) },
  hittableControls: { baseline: sum((r) => r.before.hittableControls), after: sum((r) => r.after.hittableControls), delta: sum((r) => r.delta.hittableControls) },
  primaryControls: { baseline: sum((r) => r.before.primaryControls), after: sum((r) => r.after.primaryControls), delta: sum((r) => r.delta.primaryControls) },
  totalControls: { baseline: sum((r) => r.before.totalControls), after: sum((r) => r.after.totalControls), delta: sum((r) => r.delta.totalControls) },
  advancedStopsVisible: { baseline: sum((r) => r.before.advancedStopsVisible), after: sum((r) => r.after.advancedStopsVisible), delta: sum((r) => r.delta.advancedStopsVisible) },
  interactionsNeeded: { baseline: sum((r) => r.before.interactionsNeeded), after: sum((r) => r.after.interactionsNeeded), delta: sum((r) => r.delta.interactionsNeeded) },
  effectiveTouchTargets: { baseline: sum((r) => r.before.effectiveTouchTargets), after: sum((r) => r.after.effectiveTouchTargets), delta: sum((r) => r.delta.effectiveTouchTargets) },
  touchTargetsBelow44: { baseline: sum((r) => r.before.touchTargetsBelow44), after: sum((r) => r.after.touchTargetsBelow44), delta: sum((r) => r.delta.touchTargetsBelow44) },
  panelHeight: { baseline: sum((r) => r.before.panelHeight), after: sum((r) => r.after.panelHeight), delta: sum((r) => r.delta.panelHeight) },
  // Porcentajes de pantalla: por escenario, promedio y extremos. Nunca sumas.
  boardSharePercent: {
    baseline: stats(rows.map((r) => r.before.boardSharePercent)),
    after: stats(rows.map((r) => r.after.boardSharePercent))
  },
  boardShareByScenario: Object.fromEntries(
    [...new Set(rows.map((r) => r.after.scenario))].map((scenario) => [
      scenario,
      {
        baseline: stats(rows.filter((r) => r.before.scenario === scenario).map((r) => r.before.boardSharePercent)),
        after: stats(rows.filter((r) => r.after.scenario === scenario).map((r) => r.after.boardSharePercent))
      }
    ])
  ),
  failures
};

await mkdir(root, { recursive: true });
await writeFile(`${root}/comparison.json`, JSON.stringify({ summary, rows }, null, 2));

const pct = (v: { min: number; max: number; avg: number }) => `avg ${v.avg}% · min ${v.min}% · max ${v.max}%`;
const lines = [
  '# UX-DECISION 1.1 · comparación cuantitativa',
  '',
  `- Baseline: \`${summary.baselineSha}\` (UI del commit base, WASM y fixtures de la PR)`,
  `- Resultado: \`${summary.afterSha}\` (UI del HEAD de la PR)`,
  `- Pares medidos: **${summary.pairs}** · escenarios: ${summary.scenarios.join(', ')}`,
  '',
  '| Métrica (recuento, informativo) | Baseline | Resultado | Δ |',
  '| --- | ---: | ---: | ---: |',
  ...(['visibleControls', 'hittableControls', 'primaryControls', 'totalControls', 'advancedStopsVisible', 'interactionsNeeded', 'effectiveTouchTargets', 'touchTargetsBelow44', 'panelHeight'] as const).map((metric) => {
    const value = summary[metric];
    return `| ${metric} | ${value.baseline} | ${value.after} | ${value.delta} |`;
  }),
  '',
  '| boardSharePercent (por escenario) | Baseline | Resultado |',
  '| --- | --- | --- |',
  ...Object.entries(summary.boardShareByScenario).map(([scenario, value]) => `| ${scenario} | ${pct(value.baseline)} | ${pct(value.after)} |`),
  '',
  `Tablero sobre pantalla, todos los pares: baseline ${pct(summary.boardSharePercent.baseline)} · resultado ${pct(summary.boardSharePercent.after)}.`,
  '',
  'El gate es de identidad y accesibilidad: ventana medida = ventana declarada,',
  'acción principal alcanzable con su identidad publicada, interacciones',
  'ejecutadas sin aumentar, ningún objetivo alcanzable bajo 44 px y ningún',
  'control avanzado inalcanzable con la superficie abierta. El número total de',
  'botones **no** es un gate: quitar un control genuinamente redundante no',
  'penaliza.',
  '',
  ...(failures.length ? ['## Fallos del gate', '', ...failures.map((f) => `- ${f}`)] : ['**Gate: OK** — integridad por identidad y accesibilidad conservada en todos los pares.']),
  ''
];
await writeFile(`${root}/COMPARACION.md`, lines.join('\n'));

console.log(JSON.stringify(summary, null, 2));
// Workflow commands: the artifact host is not reachable from every network,
// but check-run annotations are plain API JSON. Publish the measured deltas so
// the PR can quote them without downloading a zip.
const notice = (label: string, value: unknown) => console.log(`::notice title=UX-DECISION ${label}::${JSON.stringify(value)}`);
notice('SHA', { baselineSha: summary.baselineSha, afterSha: summary.afterSha, pairs: summary.pairs, scenarios: summary.scenarios });
for (const metric of ['visibleControls', 'hittableControls', 'primaryControls', 'totalControls', 'advancedStopsVisible', 'interactionsNeeded', 'effectiveTouchTargets', 'touchTargetsBelow44', 'panelHeight'] as const) {
  notice(metric, summary[metric]);
}
notice('boardSharePercent', summary.boardSharePercent);
notice('boardShareByScenario', summary.boardShareByScenario);
notice('gate', failures.length ? failures : 'OK — integridad por identidad y accesibilidad conservada');
if (failures.length) {
  console.error(`UX-DECISION comparison gate: ${failures.length} incumplimiento(s)`);
  process.exit(1);
}
