#!/usr/bin/env bun
/**
 * Publishes the Playwright result to the GitHub Actions job summary, and fails
 * the job when a functional UX-HAND test was skipped.
 *
 * Why this exists: a green Chromium job used to mean "the suite exited 0". It
 * could also mean "the engine was missing and eight tests announced `test.skip`",
 * and nothing in the run said so. The WASM guard catches the engine, but a skip
 * or an early `return` written *inside* a test slips past it: the spec decides
 * the precondition, the runner just records "skipped", and the job stays green.
 *
 * So the summary is the evidence and the gate at the same time:
 *
 *  - every outcome is published (passed / failed / skipped / flaky, plus the
 *    per-test table for the hand sheet, which is what UX-HAND is about);
 *  - the required list below is a contract: if one of those tests is skipped,
 *    retried into green, or never ran at all, this script exits 1.
 *
 * Usage (in CI, after `playwright test`):
 *
 *   PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/report.json \
 *     bun --bun playwright test --reporter=list,json
 *   bun scripts/e2e-summary.ts            # writes $GITHUB_STEP_SUMMARY, gates
 *   bun scripts/e2e-summary.ts report.json --no-gate   # local, never fails
 *
 * Exit codes: 0 = nothing required is missing; 1 = a required test did not pass;
 * 2 = the report does not exist (nothing ran, which is also a failure).
 */
import { appendFileSync, existsSync } from 'node:fs';

type JsonError = { message?: string };
type JsonResult = { status?: string; error?: JsonError };
type JsonTest = { status?: string; expectedStatus?: string; projectName?: string; results?: JsonResult[] };
type JsonSpec = { title?: string; file?: string; line?: number; ok?: boolean; tests?: JsonTest[] };
type JsonSuite = { file?: string; title?: string; specs?: JsonSpec[]; suites?: JsonSuite[] };
type Outcome = 'passed' | 'failed' | 'skipped' | 'flaky' | 'timedout';

interface Row {
  title: string;
  file: string;
  line: number;
  outcome: Outcome;
  retries: number;
  error?: string;
}

/**
 * Tests that are the functional guarantee of UX-HAND. Each must RUN and PASS.
 * The names are prefixes of the spec title, because Playwright appends the
 * viewport or the project to parametrised titles.
 *
 * Adding a scenario here is what stops it from being quietly skipped later.
 */
const REQUIRED: { file: string; title: string; why: string }[] = [
  { file: 'arena-hand-sheet.spec.ts', title: 'contrato de despacho (motor real, mazo determinista) › lanzar desde la hoja ejecuta una acción legal del motor', why: 'una acción legal del motor se despacha de verdad' },
  { file: 'arena-hand-sheet.spec.ts', title: 'contrato de despacho (motor real, mazo determinista) › doble pulsación produce exactamente un despacho aceptado', why: 'un solo despacho por doble pulsación' },
  { file: 'arena-hand-sheet.spec.ts', title: 'escenarios deterministas (Phase GameScenario, motor real) › 1 · lanzamiento con objetivo', why: 'objetivo elegido y daño verificado' },
  { file: 'arena-hand-sheet.spec.ts', title: 'escenarios deterministas (Phase GameScenario, motor real) › 2 · pago manual', why: 'pago manual completado' },
  { file: 'arena-hand-sheet.spec.ts', title: 'escenarios deterministas (Phase GameScenario, motor real) › 3 · cancelación real', why: 'cancelación con estado restaurado' },
  { file: 'arena-hand-sheet.spec.ts', title: 'rechazo explícito (fixture, cliente guionizado) › 4 · rechazo explícito', why: 'rechazo con mensaje y reintento' },
  { file: 'arena-hand-sheet.spec.ts', title: 'legalidad explícita (fixture con acciones) › una habilidad activada sigue visible y accionable', why: 'una habilidad activada no desaparece' },
  { file: 'arena-hand-sheet.spec.ts', title: 'escenarios deterministas (Phase GameScenario, motor real) › 5 · cambio de asiento', why: 'cambio de asiento por identidad, no por cantidad' },
  { file: 'arena-hand-sheet.spec.ts', title: 'legalidad explícita (fixture con acciones) › una carta con lanzamiento y activación no se ejecuta de un toque', why: 'ambigüedad: no se adivina' },
  { file: 'arena-hand-sheet.spec.ts', title: 'legalidad explícita (fixture con acciones) › las alternativas del mismo lanzamiento se identifican', why: 'alternativas distinguibles' },
  { file: 'arena-hand-sheet.spec.ts', title: 'navegación por teclado de la hoja › Tab y Shift+Tab', why: 'sin árbol accesible duplicado' }
];

// Playwright spells these `timedOut` / `interrupted`; compare case-insensitively
// so a timeout is never counted as a pass.
const FAILED = new Set(['failed', 'timedout', 'interrupted']);

function outcomeOf(test: JsonTest): { outcome: Outcome; retries: number } {
  const results = test.results ?? [];
  const retries = Math.max(0, results.length - 1);
  const last = results[results.length - 1];
  const lastStatus = (last?.status ?? '').toLowerCase();
  if (!last || lastStatus === 'skipped' || test.status === 'skipped') return { outcome: 'skipped', retries };
  if (FAILED.has(lastStatus)) return { outcome: lastStatus === 'timedout' ? 'timedout' : 'failed', retries };
  return { outcome: retries > 0 ? 'flaky' : 'passed', retries };
}

function walk(suite: JsonSuite, file: string, rows: Row[], errors: string[]) {
  const currentFile = suite.file ?? file;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const { outcome, retries } = outcomeOf(test);
      const message = (test.results ?? [])
        .map((result) => result.error?.message)
        .filter(Boolean)
        .join(' · ');
      rows.push({
        title: `${suite.title ? `${suite.title} › ` : ''}${spec.title ?? 'sin título'}`,
        file: currentFile || spec.file || 'tests/e2e',
        line: spec.line ?? 1,
        outcome,
        retries,
        error: message ? message.split('\n')[0] : undefined
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, currentFile, rows, errors);
}

function table(rows: Row[]): string {
  const head = '| Prueba | Resultado | Reintentos |\n|---|---|---|\n';
  return head + rows
    .map((row) => `| \`${row.title.replace(/\|/g, '\\|')}\` | ${row.outcome} | ${row.retries} |`)
    .join('\n');
}

const args = process.argv.slice(2);
const noGate = args.includes('--no-gate');
const path = args.find((arg) => !arg.startsWith('--')) ?? 'test-results/report.json';
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

if (!existsSync(path)) {
  const message = `## Playwright\n\nEl informe \`${path}\` no existe: la suite no llegó a ejecutarse.\n`;
  if (summaryPath) appendFileSync(summaryPath, message);
  console.log(message);
  process.exit(noGate ? 0 : 2);
}

const report = (await Bun.file(path).json()) as { suites?: JsonSuite[]; errors?: JsonError[] };
const rows: Row[] = [];
const globalErrors: string[] = [];
for (const suite of report.suites ?? []) walk(suite, 'tests/e2e', rows, globalErrors);
for (const error of report.errors ?? []) globalErrors.push(error.message ?? 'error global');

const count = (outcome: Outcome) => rows.filter((row) => row.outcome === outcome).length;
const total = rows.length;
const retried = rows.filter((row) => row.retries > 0).length;

const sheetRows = rows.filter((row) => row.file.includes('arena-hand-sheet.spec.ts'));
const missing: string[] = [];
for (const required of REQUIRED) {
  const match = rows.find((row) => row.file.includes(required.file) && row.title.includes(required.title));
  if (!match) missing.push(`${required.title} — no se ejecutó (${required.why})`);
  else if (match.outcome === 'skipped') missing.push(`${required.title} — se omitió (${required.why})`);
  else if (match.outcome !== 'passed') missing.push(`${required.title} — ${match.outcome} (${required.why})`);
}

const lines: string[] = [];
lines.push('## Playwright');
lines.push('');
lines.push(`**${total}** pruebas · ${count('passed')} aprobadas · ${count('failed') + count('timedout')} fallidas · ${count('skipped')} omitidas · ${retried} con reintentos · ${count('flaky')} inestables`);
lines.push('');
if (globalErrors.length) {
  lines.push('### Errores globales');
  lines.push('');
  for (const error of globalErrors) lines.push(`- ${error.split('\n')[0]}`);
  lines.push('');
}
lines.push('### `arena-hand-sheet.spec.ts` (UX-HAND)');
lines.push('');
if (!sheetRows.length) lines.push('Ninguna prueba de la hoja de la mano se ejecutó.');
else lines.push(table(sheetRows));
lines.push('');
if (missing.length) {
  lines.push('### Pruebas funcionales obligatorias que no pasaron');
  lines.push('');
  lines.push('Una suite verde no puede significar «nada corrió». Estas pruebas son la garantía funcional de UX-HAND y deben ejecutarse y pasar:');
  lines.push('');
  for (const item of missing) lines.push(`- **${item}**`);
  lines.push('');
} else {
  lines.push('### Pruebas funcionales obligatorias');
  lines.push('');
  lines.push(`Las ${REQUIRED.length} se ejecutaron y pasaron.`);
  lines.push('');
}
const body = lines.join('\n');
if (summaryPath) appendFileSync(summaryPath, body);
console.log(body);

process.exit(missing.length && !noGate ? 1 : 0);
