#!/usr/bin/env bun
/**
 * Turns a Playwright JSON report into bounded, privacy-safe check annotations.
 *
 * The HTML report, traces, and job log may live behind an unreachable Actions
 * artifact host. Annotations therefore preserve only static test metadata,
 * bounded E2E checkpoints, a coarse failure kind, and explicitly whitelisted
 * diagnostic fields. Expected/received text, arbitrary stdout, card names,
 * card counts, seat identifiers, and alert contents are never published.
 *
 * Usage (inside the workflow, after `playwright test`):
 *
 *   PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/report.json \
 *     bun --bun playwright test --reporter=list,json
 *   bun scripts/e2e-annotations.ts            # defaults to that path
 *   bun scripts/e2e-annotations.ts path.json
 *
 * Exit code is always 0: this runs in an `if: failure()` step and must not mask
 * the real failure.
 */
import { existsSync } from 'node:fs';

type JsonError = { message?: string };
type JsonOutput = string | { buffer?: string };
type JsonResult = { status?: string; error?: JsonError; stdout?: JsonOutput[]; stderr?: JsonOutput[] };
type JsonTest = {
  status?: string;
  results?: JsonResult[];
  annotations?: { type?: string; description?: string }[];
};
type JsonSpec = { title?: string; file?: string; line?: number; ok?: boolean; tests?: JsonTest[] };
type JsonSuite = { file?: string; specs?: JsonSpec[]; suites?: JsonSuite[] };

const MESSAGE_LIMIT = 1_800;
const MAX_CHECKPOINTS = 8;
const MAX_CHECKPOINT_LENGTH = 120;

function escape(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function annotation(file: string, line: number, title: string, message: string) {
  const safeTitle = escape(title).replace(/,/g, '%2C').replace(/:/g, '%3A');
  const safeFile = escape(file).replace(/,/g, '%2C');
  const readableMessage = escape(message).slice(0, MESSAGE_LIMIT);
  console.log(`::error file=${safeFile},line=${line},title=${safeTitle}::${readableMessage}`);
}

function decodeOutput(result: JsonResult): string {
  return [...(result.stdout ?? []), ...(result.stderr ?? [])]
    .map((chunk) => typeof chunk === 'string'
      ? chunk
      : chunk.buffer ? Buffer.from(chunk.buffer, 'base64').toString('utf8') : '')
    .join('')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

function safeToken(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,48}$/.test(value) ? value : null;
}

function safeCount(value: unknown, max = 1_000_000): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= max ? number : null;
}

function parseMarker<T>(line: string, marker: string): T | null {
  if (!line.startsWith(marker)) return null;
  try {
    return JSON.parse(line.slice(marker.length).trim()) as T;
  } catch {
    return null;
  }
}

function safeBoardDiagnostic(line: string): string | null {
  const marker = 'MESA_E2E_FAILURE_UI ';
  const data = parseMarker<{
    status?: unknown;
    snapshot?: {
      app?: { phase?: unknown; turn?: unknown; waiting?: unknown; busy?: unknown; actions?: unknown } | null;
      handoffVisible?: unknown;
      decision?: { visible?: unknown; waiting?: unknown; buttonCount?: unknown } | null;
      viewerHandVisible?: unknown;
      startPanelVisible?: unknown;
      alertVisible?: unknown;
    };
  }>(line, marker);
  if (!data?.snapshot) return null;
  const app = data.snapshot.app;
  const decision = data.snapshot.decision;
  return `UI ${JSON.stringify({
    status: safeToken(data.status),
    phase: safeToken(app?.phase),
    turn: safeCount(app?.turn),
    waiting: safeToken(app?.waiting),
    busy: app?.busy === true || app?.busy === 'true',
    actions: safeCount(app?.actions),
    handoffVisible: data.snapshot.handoffVisible === true,
    decisionVisible: decision?.visible === true,
    decisionWaiting: safeToken(decision?.waiting),
    decisionButtons: safeCount(decision?.buttonCount, 100),
    viewerHandVisible: data.snapshot.viewerHandVisible === true,
    startPanelVisible: data.snapshot.startPanelVisible === true,
    alertVisible: data.snapshot.alertVisible === true
  })}`;
}

function safeTutorialState(line: string): string | null {
  const data = parseMarker<{
    step?: unknown;
    phase?: unknown;
    turn?: unknown;
    waiting?: unknown;
    focusPresent?: unknown;
  }>(line, 'MESA_E2E_TUTORIAL_STATE ');
  if (!data) return null;
  return `tutorial ${JSON.stringify({
    step: safeCount(data.step, 32),
    phase: safeToken(data.phase),
    turn: safeCount(data.turn),
    waiting: safeToken(data.waiting),
    focusPresent: data.focusPresent === true
  })}`;
}

function safeTutorialTrace(line: string): string | null {
  const raw = parseMarker<unknown>(line, 'MESA_E2E_TUTORIAL_TRACE ');
  if (!Array.isArray(raw)) return null;
  const entries = raw.flatMap((entry) => {
    if (typeof entry !== 'string') return [];
    const match = entry.match(/^\[lección\] rev=(\d+) paso=(\d+)\/(\d+) fase=([A-Za-z][A-Za-z0-9_-]*) espera=([A-Za-z][A-Za-z0-9_-]*) turno=(\d+) → ([A-Za-z][A-Za-z0-9_-]*|espera)$/);
    if (!match) return [];
    return [{
      revision: safeCount(match[1]),
      step: safeCount(match[2], 32),
      phase: safeToken(match[4]),
      waiting: safeToken(match[5]),
      turn: safeCount(match[6]),
      action: safeToken(match[7])
    }];
  }).slice(-6);
  return entries.length ? `tutorial-trace ${JSON.stringify(entries)}` : null;
}

/** Extract only structured diagnostic markers; ignore all arbitrary test output. */
function safeDiagnostics(result: JsonResult): string {
  const lines = decodeOutput(result).split(/\r?\n/);
  const markers = lines.flatMap((line) => {
    const safe = safeBoardDiagnostic(line) ?? safeTutorialState(line) ?? safeTutorialTrace(line);
    return safe ? [safe] : [];
  });
  return markers.slice(-3).join(' · ');
}

/** Classify failures without publishing Playwright's expected/received content. */
function failureKind(result: JsonResult): string {
  const message = result.error?.message ?? '';
  if (result.status === 'timedOut' || /Test timeout of .* exceeded/i.test(message)) return 'timeout';
  if (/expect\([^\n]*\).*failed|Expected:|Received:/i.test(message)) return 'aserción fallida';
  if (/locator\.|page\.(?:goto|click|waitFor)|browser has been closed/i.test(message)) return 'interacción del navegador';
  return 'fallo Playwright';
}

let emitted = 0;

function walk(suite: JsonSuite, file: string) {
  const currentFile = suite.file ?? file;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const failed = (test.results ?? []).filter(
        (result) => result.status && result.status !== 'passed' && result.status !== 'skipped'
      );
      if (!failed.length) continue;
      const first = failed[0];
      const checkpoints = (test.annotations ?? [])
        .filter((entry) => entry.type === 'e2e-checkpoint' && typeof entry.description === 'string')
        .map((entry) => entry.description!.replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, MAX_CHECKPOINT_LENGTH))
        .slice(-MAX_CHECKPOINTS);
      const diagnostics = safeDiagnostics(first);
      const message = [
        `tipo: ${failureKind(first)}`,
        checkpoints.length ? `checkpoints: ${checkpoints.join(' → ')}` : '',
        diagnostics
      ].filter(Boolean).join(' · ');
      annotation(currentFile || spec.file || 'tests/e2e', spec.line ?? 1, spec.title ?? 'prueba sin título', message);
      emitted += 1;
    }
  }
  for (const child of suite.suites ?? []) walk(child, currentFile);
}

const path = process.argv[2] ?? 'test-results/report.json';
if (!existsSync(path)) {
  // Do not print arbitrary directory names from a partial Playwright run.
  console.log(`::warning title=Sin informe::No existe el informe JSON de Playwright (${path}); las salidas de prueba se omiten por privacidad.`);
  process.exit(0);
}

try {
  const report = (await Bun.file(path).json()) as { suites?: JsonSuite[]; errors?: JsonError[] };
  for (const suite of report.suites ?? []) walk(suite, 'tests/e2e');
  for (const _error of report.errors ?? []) {
    annotation('tests/e2e', 1, 'Playwright no llegó a ejecutar las pruebas', 'error global; detalle omitido por privacidad');
    emitted += 1;
  }
  console.log(`::notice title=Anotaciones::${emitted} prueba(s) fallida(s) anotadas con contexto acotado.`);
} catch {
  console.log('::warning title=Informe ilegible::No se pudo leer el informe de Playwright; el detalle se omite por privacidad.');
}
process.exit(0);
