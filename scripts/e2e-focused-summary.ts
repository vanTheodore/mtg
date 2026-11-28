#!/usr/bin/env bun
/**
 * Gate a focused Playwright run: every selected test must exist, run once, and
 * pass without a retry. This keeps `test.skip()` and flaky retries from making
 * a targeted regression green before the full-suite summary executes.
 */
import { existsSync } from 'node:fs';

type JsonResult = { status?: string; error?: { message?: string } };
type JsonTest = { status?: string; results?: JsonResult[] };
type JsonSpec = { title?: string; file?: string; line?: number; tests?: JsonTest[] };
type JsonSuite = { file?: string; specs?: JsonSpec[]; suites?: JsonSuite[] };

type Row = { file: string; title: string; line: number; status: string; retries: number; error?: string };

function collect(suite: JsonSuite, inheritedFile: string, rows: Row[]): void {
  const file = suite.file ?? inheritedFile;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const results = test.results ?? [];
      const last = results.at(-1);
      rows.push({
        file: spec.file ?? file,
        title: spec.title ?? 'test sin título',
        line: spec.line ?? 1,
        status: last?.status ?? test.status ?? 'skipped',
        retries: Math.max(0, results.length - 1),
        error: results.map((result) => result.error?.message).filter(Boolean).join(' · ').split('\n')[0]
      });
    }
  }
  for (const child of suite.suites ?? []) collect(child, file, rows);
}

const reportPath = process.argv[2] ?? 'test-results/targeted-report.json';
const expected = Number(process.argv[3]);
if (!existsSync(reportPath)) {
  console.error(`Focused E2E gate: missing Playwright report ${reportPath}`);
  process.exit(2);
}
if (!Number.isSafeInteger(expected) || expected < 1) {
  console.error('Focused E2E gate: expected test count must be a positive integer.');
  process.exit(2);
}

const report = (await Bun.file(reportPath).json()) as { suites?: JsonSuite[]; errors?: { message?: string }[] };
const rows: Row[] = [];
for (const suite of report.suites ?? []) collect(suite, 'tests/e2e', rows);
console.log(`Focused E2E: ${rows.length}/${expected} selected tests reported.`);
for (const row of rows) {
  const suffix = row.error ? ` — ${row.error}` : '';
  console.log(`- ${row.status}${row.retries ? ` (retries=${row.retries})` : ''}: ${row.file}:${row.line} ${row.title}${suffix}`);
}

const failed = rows.filter((row) => row.status !== 'passed' || row.retries > 0);
const globalErrors = report.errors ?? [];
if (rows.length !== expected || failed.length || globalErrors.length) {
  for (const error of globalErrors) console.error(`Playwright global error: ${error.message ?? 'error sin mensaje'}`);
  if (rows.length !== expected) console.error(`Expected exactly ${expected} test results; received ${rows.length}.`);
  if (failed.length) console.error(`${failed.length} selected test(s) were skipped, failed, timed out, or retried.`);
  process.exit(1);
}
console.log('Focused E2E gate passed: every selected test ran once and passed.');
