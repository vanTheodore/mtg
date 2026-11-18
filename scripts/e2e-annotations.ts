#!/usr/bin/env bun
/**
 * Turns a Playwright JSON report into check-run annotations.
 *
 * The HTML report, the traces and the job log all live behind a download from
 * the Actions artifact host; on some networks that download is simply
 * unreachable (`EOF` from the blob storage), so a failing `playwright test` step
 * arrives as «exit code 1» and nothing else. Annotations, on the other hand, are
 * plain JSON on `api.github.com`, so this script repeats each failure — test
 * title, file, line and the first line of the error — as a `::error` command.
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
import { existsSync, readdirSync } from 'node:fs';

type JsonError = { message?: string; stack?: string };
type JsonResult = { status?: string; error?: JsonError };
type JsonTest = { status?: string; results?: JsonResult[] };
type JsonSpec = { title?: string; file?: string; line?: number; ok?: boolean; tests?: JsonTest[] };
type JsonSuite = { file?: string; specs?: JsonSpec[]; suites?: JsonSuite[] };

/** Keeps one annotation readable; GitHub truncates long bodies anyway. */
const MESSAGE_LIMIT = 400;

function escape(value: string): string {
  // The workflow command grammar needs the percent-escapes; the commas and
  // colons of the property list are escaped separately at the call site.
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function annotation(file: string, line: number, title: string, message: string) {
  const safeTitle = escape(title).replace(/,/g, '%2C').replace(/:/g, '%3A');
  const safeFile = escape(file).replace(/,/g, '%2C');
  console.log(`::error file=${safeFile},line=${line},title=${safeTitle}::${escape(message.slice(0, MESSAGE_LIMIT))}`);
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
      const message = (first.error?.message ?? first.status ?? 'fallo sin mensaje')
        .split('\n')
        .filter(Boolean)
        .slice(0, 2)
        .join(' · ');
      annotation(currentFile || spec.file || 'tests/e2e', spec.line ?? 1, spec.title ?? 'prueba sin título', message);
      emitted += 1;
    }
  }
  for (const child of suite.suites ?? []) walk(child, currentFile);
}

const path = process.argv[2] ?? 'test-results/report.json';
if (!existsSync(path)) {
  // Without a report (the runner died, or an older workflow ran this step) the
  // directory names Playwright leaves behind still say which tests broke.
  console.log(`::warning title=Sin informe::No existe ${path}; se anotan los directorios de test-results.`);
  const dirs = existsSync('test-results')
    ? readdirSync('test-results', { withFileTypes: true }).filter((entry) => entry.isDirectory())
    : [];
  for (const dir of dirs) annotation('test-results', 1, 'Prueba de Chromium fallida', dir.name);
  process.exit(0);
}

try {
  const report = (await Bun.file(path).json()) as { suites?: JsonSuite[]; errors?: JsonError[] };
  for (const suite of report.suites ?? []) walk(suite, 'tests/e2e');
  // A run can also fail before any test starts (global setup, webServer).
  for (const error of report.errors ?? []) {
    annotation('tests/e2e', 1, 'Playwright no llegó a ejecutar las pruebas', error.message ?? 'error global');
    emitted += 1;
  }
  console.log(`::notice title=Anotaciones::${emitted} prueba(s) fallida(s) anotadas desde ${path}.`);
} catch (error) {
  console.log(`::warning title=Informe ilegible::${error instanceof Error ? error.message : String(error)}`);
}
process.exit(0);
