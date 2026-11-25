import { afterAll, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The job summary is a gate, not decoration.
 *
 * `scripts/e2e-summary.ts` must (a) publish passed / failed / skipped / retries
 * and the per-test rows of `arena-hand-sheet`, and (b) exit non-zero when a
 * required UX-HAND test was skipped — that is the hole the WASM guard cannot
 * see, because a `test.skip` inside a spec leaves the Chromium job green.
 *
 * These tests run the real script over synthetic Playwright JSON, so the gate
 * is exercised without a browser.
 */
const SCRIPT = 'scripts/e2e-summary.ts';
const tmp = mkdtempSync(join(tmpdir(), 'mesa-e2e-summary-'));

function report(specs: { suite: string; title: string; status: string; results?: string[] }[]) {
  const groups = new Map<string, typeof specs>();
  for (const spec of specs) {
    const list = groups.get(spec.suite) ?? [];
    list.push(spec);
    groups.set(spec.suite, list);
  }
  return {
    suites: [{
      file: 'arena-hand-sheet.spec.ts',
      specs: [],
      suites: [...groups.entries()].map(([title, list]) => ({
        title,
        file: 'arena-hand-sheet.spec.ts',
        specs: list.map((spec) => ({
          title: spec.title,
          file: 'arena-hand-sheet.spec.ts',
          line: 1,
          ok: spec.status === 'expected',
          tests: [{ status: spec.status, results: (spec.results ?? [spec.status]).map((status) => ({ status })) }]
        }))
      }))
    }]
  };
}

function run(json: unknown, args: string[] = []) {
  const path = join(tmp, `report-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, JSON.stringify(json));
  const summary = join(tmp, `summary-${Math.random().toString(36).slice(2)}.md`);
  writeFileSync(summary, '');
  const result = spawnSync('bun', [SCRIPT, path, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: summary, MESA_ENGINE_REQUIRED: '' }
  });
  return { status: result.status, out: result.stdout ?? '', summary: readFileSync(summary, 'utf8') };
}

const REQUIRED_CAST = 'contrato de despacho (motor real, mazo determinista) › lanzar desde la hoja ejecuta una acción legal del motor';

test('publica aprobadas, fallidas, omitidas y reintentos', () => {
  const { status, summary } = run(report([
    { suite: 'contrato de despacho (motor real, mazo determinista)', title: 'lanzar desde la hoja ejecuta una acción legal del motor', status: 'expected' },
    { suite: 'fixture', title: 'otra prueba', status: 'expected', results: ['failed', 'passed'] },
    { suite: 'fixture', title: 'una omitida', status: 'skipped' }
  ]));
  expect(summary).toContain('aprobadas');
  expect(summary).toContain('1 omitidas');
  expect(summary).toContain('1 con reintentos');
  expect(summary).toContain('`arena-hand-sheet.spec.ts` (UX-HAND)');
  expect(summary).toContain('otra prueba');
  // A required test that did not even run is a failure, so the exit is 1.
  expect(status).toBe(1);
});

test('falla si una prueba funcional obligatoria se omite', () => {
  const { status, summary } = run(report([
    { suite: 'contrato de despacho (motor real, mazo determinista)', title: 'lanzar desde la hoja ejecuta una acción legal del motor', status: 'skipped' }
  ]));
  expect(status).toBe(1);
  expect(summary).toContain('Pruebas funcionales obligatorias que no pasaron');
  expect(summary).toContain('se omitió');
});

test('falla si una prueba funcional obligatoria no existe en el informe', () => {
  const { status, summary } = run(report([]));
  expect(status).toBe(1);
  expect(summary).toContain('no se ejecutó');
});

test('pasa cuando todas las obligatorias pasan, y lo dice', () => {
  const titles = [
    ['contrato de despacho (motor real, mazo determinista)', 'lanzar desde la hoja ejecuta una acción legal del motor'],
    ['contrato de despacho (motor real, mazo determinista)', 'doble pulsación produce exactamente un despacho aceptado'],
    ['escenarios deterministas (mazo propio, motor real)', '1 · lanzamiento con objetivo: elegirlo y ver el daño'],
    ['escenarios deterministas (mazo propio, motor real)', '2 · pago manual: pagar el maná y completar el lanzamiento'],
    ['escenarios deterministas (mazo propio, motor real)', '3 · cancelación real: la carta vuelve a la mano y el estado se restaura'],
    ['rechazo explícito (fixture, cliente guionizado)', '4 · rechazo explícito: mensaje, hoja abierta y reintento'],
    ['escenarios deterministas (mazo propio, motor real)', '5 · cambio de asiento con hoja y detalle abiertos: identificadores, no cantidades'],
    ['legalidad explícita (fixture con acciones)', 'una carta con lanzamiento y activación no se ejecuta de un toque'],
    ['legalidad explícita (fixture con acciones)', 'las alternativas del mismo lanzamiento se identifican'],
    ['legalidad explícita (fixture con acciones)', 'una habilidad activada sigue visible y accionable'],
    ['navegación por teclado de la hoja', 'Tab y Shift+Tab recorren sólo controles visibles de la hoja, sin duplicar la mano']
  ];
  const { status, summary } = run(report(titles.map(([suite, title]) => ({ suite, title, status: 'expected' }))));
  expect(status).toBe(0);
  expect(summary).toContain('se ejecutaron y pasaron');
});

test('un reintento que acaba en verde no cuenta como aprobada a la primera', () => {
  const { status, summary } = run(report([
    { suite: 'contrato de despacho (motor real, mazo determinista)', title: 'lanzar desde la hoja ejecuta una acción legal del motor', status: 'expected', results: ['failed', 'passed'] }
  ]));
  expect(summary).toContain('inestables');
  expect(status).toBe(1);
});

test('un tiempo agotado no se cuenta como aprobado', () => {
  const { status, summary } = run(report([
    { suite: 'contrato de despacho (motor real, mazo determinista)', title: 'lanzar desde la hoja ejecuta una acción legal del motor', status: 'unexpected', results: ['timedOut'] }
  ]));
  expect(status).toBe(1);
  expect(summary).toContain('timedout');
});

test('sin informe el trabajo falla: nada corrió no es verde', () => {
  const missing = join(tmp, 'no-existe.json');
  const summary = join(tmp, 'summary-missing.md');
  writeFileSync(summary, '');
  const result = spawnSync('bun', [SCRIPT, missing], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: summary }
  });
  expect(result.status).toBe(2);
  expect(readFileSync(summary, 'utf8')).toContain('no existe');
  expect(existsSync(missing)).toBe(false);
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));
