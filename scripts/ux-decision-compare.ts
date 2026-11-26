#!/usr/bin/env bun
/**
 * UX-DECISION 1.0 · comparación cuantitativa baseline ↔ resultado.
 *
 * Lee los dos `metrics.json` que el job `ux-evidence` produce con el MISMO spec,
 * los MISMOS fixtures de GameScenario y el MISMO WASM E2E (sólo cambia la UI),
 * y publica las deltas. El gate es de *integridad*, no de estética:
 *
 *   - ninguna acción legal accesible desaparece;
 *   - ningún flujo necesita más interacciones;
 *   - los controles avanzados no aumentan su exposición permanente.
 *
 * La reducción de controles visibles se **informa**, no se impone: el briefing
 * prohíbe exigir una reducción arbitraria donde hay decisiones estratégicas
 * distintas. Una ventana con una sola acción legítimamente gana el disclosure
 * que permite llegar a las demás opciones.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';

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
interface Report {
  variant: string; headSha: string; baselineSha: string; afterSha: string | null;
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
  const delta = {
    visibleControls: m.visibleControls - b.visibleControls,
    primaryControls: m.primaryControls - b.primaryControls,
    secondaryControls: m.secondaryControls - b.secondaryControls,
    totalControls: m.totalControls - b.totalControls,
    advancedStopsVisible: m.advancedStopsVisible - b.advancedStopsVisible,
    effectiveTouchTargets: m.effectiveTouchTargets - b.effectiveTouchTargets,
    smallestTouchTarget: m.smallestTouchTarget - b.smallestTouchTarget,
    panelHeight: m.panelHeight - b.panelHeight,
    boardSharePercent: Math.round((m.boardSharePercent - b.boardSharePercent) * 10) / 10,
    interactionsNeeded: m.interactionsNeeded - b.interactionsNeeded,
    legalActionsAccessible: m.legalActionsAccessible - b.legalActionsAccessible
  };
  if (delta.totalControls < 0 || delta.legalActionsAccessible < 0) {
    failures.push(`${key(m)}: desaparecieron controles o acciones legales (${JSON.stringify(delta)})`);
  }
  if (delta.interactionsNeeded > 0) failures.push(`${key(m)}: el flujo necesita más interacciones`);
  if (delta.advancedStopsVisible > 0) failures.push(`${key(m)}: aumentó la exposición permanente de paradas`);
  rows.push({ key: key(m), before: b, after: m, delta });
}

const sum = (pick: (r: typeof rows[number]) => number) => rows.reduce((total, r) => total + pick(r), 0);
const summary = {
  baselineSha: before.baselineSha,
  afterSha: after.headSha,
  pairs: rows.length,
  visibleControls: { baseline: sum((r) => r.before.visibleControls), after: sum((r) => r.after.visibleControls), delta: sum((r) => r.delta.visibleControls) },
  primaryControls: { baseline: sum((r) => r.before.primaryControls), after: sum((r) => r.after.primaryControls), delta: sum((r) => r.delta.primaryControls) },
  totalControls: { baseline: sum((r) => r.before.totalControls), after: sum((r) => r.after.totalControls), delta: sum((r) => r.delta.totalControls) },
  advancedStopsVisible: { baseline: sum((r) => r.before.advancedStopsVisible), after: sum((r) => r.after.advancedStopsVisible), delta: sum((r) => r.delta.advancedStopsVisible) },
  interactionsNeeded: { baseline: sum((r) => r.before.interactionsNeeded), after: sum((r) => r.after.interactionsNeeded), delta: sum((r) => r.delta.interactionsNeeded) },
  effectiveTouchTargets: { baseline: sum((r) => r.before.effectiveTouchTargets), after: sum((r) => r.after.effectiveTouchTargets), delta: sum((r) => r.delta.effectiveTouchTargets) },
  panelHeight: { baseline: sum((r) => r.before.panelHeight), after: sum((r) => r.after.panelHeight), delta: sum((r) => r.delta.panelHeight) },
  boardSharePercent: { baseline: Math.round(sum((r) => r.before.boardSharePercent) * 10) / 10, after: Math.round(sum((r) => r.after.boardSharePercent) * 10) / 10, delta: Math.round(sum((r) => r.delta.boardSharePercent) * 10) / 10 },
  failures
};

await mkdir(root, { recursive: true });
await writeFile(`${root}/comparison.json`, JSON.stringify({ summary, rows }, null, 2));

const lines = [
  '# UX-DECISION 1.0 · comparación cuantitativa',
  '',
  `- Baseline: \`${summary.baselineSha}\` (UI del commit base, WASM y fixtures de la PR)`,
  `- Resultado: \`${summary.afterSha}\` (UI del HEAD de la PR)`,
  `- Pares medidos: **${summary.pairs}** (6 viewports × 2 escenarios + temas, teclado y táctil)`,
  '',
  '| Métrica | Baseline | Resultado | Δ |',
  '| --- | ---: | ---: | ---: |',
  ...(['visibleControls', 'primaryControls', 'totalControls', 'advancedStopsVisible', 'interactionsNeeded', 'effectiveTouchTargets', 'panelHeight', 'boardSharePercent'] as const).map((metric) => {
    const value = summary[metric];
    return `| ${metric} | ${value.baseline} | ${value.after} | ${value.delta} |`;
  }),
  '',
  '`totalControls` y `legalActionsAccessible` son el gate de integridad: ninguna',
  'acción legal puede desaparecer para reducir la densidad visual. La reducción',
  'de `visibleControls` se informa, no se impone.',
  '',
  ...(failures.length ? ['## Fallos del gate', '', ...failures.map((f) => `- ${f}`)] : ['**Gate: OK** — integridad conservada en todos los pares.']),
  ''
];
await writeFile(`${root}/COMPARACION.md`, lines.join('\n'));

console.log(JSON.stringify(summary, null, 2));
// Workflow commands: the artifact host is not reachable from every network,
// but check-run annotations are plain API JSON. Publish the measured deltas so
// the PR can quote them without downloading a zip.
const notice = (label: string, value: unknown) => console.log(`::notice title=UX-DECISION ${label}::${JSON.stringify(value)}`);
notice('SHA', { baselineSha: summary.baselineSha, afterSha: summary.afterSha, pairs: summary.pairs });
for (const metric of ['visibleControls', 'primaryControls', 'totalControls', 'advancedStopsVisible', 'interactionsNeeded', 'effectiveTouchTargets', 'panelHeight', 'boardSharePercent'] as const) {
  notice(metric, summary[metric]);
}
notice('gate', failures.length ? failures : 'OK — integridad conservada');
if (failures.length) {
  console.error(`UX-DECISION comparison gate: ${failures.length} incumplimiento(s)`);
  process.exit(1);
}
