import { afterAll, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The job summary is a gate, not decoration.
 *
 * `scripts/e2e-summary.ts` must (a) publish passed / failed / skipped / retries
 * and the per-test rows of UX-HAND, UX-DECISION and UX-PRIORITY, and (b) exit
 * non-zero when a required test of any feature was skipped — that is the hole the WASM guard
 * cannot see, because a `test.skip` inside a spec leaves the Chromium job green.
 *
 * These tests run the real script over synthetic Playwright JSON, so the gate
 * is exercised without a browser.
 */
const SCRIPT = 'scripts/e2e-summary.ts';
const tmp = mkdtempSync(join(tmpdir(), 'mesa-e2e-summary-'));

type ReportSpec = { suite: string; title: string; status: string; results?: string[] };

const UX_HAND_TITLES: [string, string][] = [
  ['contrato de despacho (motor real, mazo determinista)', 'lanzar desde la hoja ejecuta una acción legal del motor'],
  ['contrato de despacho (motor real, mazo determinista)', 'doble pulsación produce exactamente un despacho aceptado'],
  ['escenarios deterministas (Phase GameScenario, motor real)', '1 · lanzamiento con objetivo: elegirlo y ver el daño'],
  ['escenarios deterministas (Phase GameScenario, motor real)', '2 · pago manual: pagar el maná y completar el lanzamiento'],
  ['escenarios deterministas (Phase GameScenario, motor real)', '3 · cancelación real: la carta vuelve a la mano y el estado se restaura'],
  ['rechazo explícito (fixture, cliente guionizado)', '4 · rechazo explícito: mensaje, hoja abierta y reintento'],
  ['escenarios deterministas (Phase GameScenario, motor real)', '5 · cambio de asiento con hoja y detalle abiertos: identificadores, no cantidades'],
  ['legalidad explícita (fixture con acciones)', 'una carta con lanzamiento y activación no se ejecuta de un toque'],
  ['legalidad explícita (fixture con acciones)', 'las alternativas del mismo lanzamiento se identifican'],
  ['legalidad explícita (fixture con acciones)', 'una habilidad activada sigue visible y accionable'],
  ['navegación por teclado de la hoja', 'Tab y Shift+Tab recorren sólo controles visibles de la hoja, sin duplicar la mano']
];

const UX_DECISION_TITLES = [
  'prioridad con pila vacía: contexto, una acción principal y cesión real',
  'prioridad con hechizo pendiente: pila real, cesión contextual y resolución por prioridades reales',
  'respuesta durante el turno rival: intención y consecuencia del motor',
  'declaración de atacantes: no atacar y confirmar borrador son decisiones distintas',
  'declaración de bloqueadores: no bloquear es explícito y el motor responde',
  'objetivos: selección directa, lista accesible y progreso sin duplicados',
  'pago manual: accesible bajo demanda, nunca dominante',
  'decisión obligatoria: KeepExact conserva la ventana exacta sin auto-selección',
  'decisión opcional: ambas ramas legales siguen en el especialista',
  'cancelación y busy: un doble pulso no despacha dos acciones',
  'cancelación del lanzamiento: la acción de seguridad está fuera del desplegable'
];

const UX_PRIORITY_TITLES = [
  'modos temporales y alcances por asiento se sincronizan con Phase',
  'pasar hasta una frontera es explícito y protege la mano del siguiente asiento',
  'handoff estricto oculta y después identifica la mano privada del asiento siguiente',
  'Resolve All propio no solicita consentimiento compartido',
  'una pila vacía no se presenta como Resolve All satisfactorio',
  'CancelAutoPass revoca la sesión propia publicada por Phase'
];

function uxHandSpecs(): ReportSpec[] {
  return UX_HAND_TITLES.map(([suite, title]) => ({ suite, title, status: 'expected' }));
}

function uxDecisionSuite(skippedTitle?: string) {
  return {
    file: 'ux-decision.spec.ts',
    title: '',
    specs: UX_DECISION_TITLES.map((title) => {
      const status = title === skippedTitle ? 'skipped' : 'expected';
      return {
        title,
        file: 'ux-decision.spec.ts',
        line: 1,
        ok: status === 'expected',
        tests: [{ status, results: [{ status }] }]
      };
    }),
    suites: []
  };
}

function uxPrioritySuite(skippedTitle?: string) {
  return {
    file: 'ux-priority.spec.ts',
    title: '',
    specs: UX_PRIORITY_TITLES.map((title) => {
      const status = title === skippedTitle ? 'skipped' : 'expected';
      return {
        title,
        file: 'ux-priority.spec.ts',
        line: 1,
        ok: status === 'expected',
        tests: [{ status, results: [{ status }] }]
      };
    }),
    suites: []
  };
}

function report(specs: ReportSpec[], extraSuites: Record<string, unknown>[] = []) {
  const groups = new Map<string, typeof specs>();
  for (const spec of specs) {
    const list = groups.get(spec.suite) ?? [];
    list.push(spec);
    groups.set(spec.suite, list);
  }
  return {
    suites: [
      {
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
      },
      ...extraSuites
    ]
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
  expect(summary).toContain('`ux-decision.spec.ts` (UX-DECISION)');
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

test('falla si una transición obligatoria de UX-DECISION se omite', () => {
  const skipped = UX_DECISION_TITLES[0];
  const { status, summary } = run(report(uxHandSpecs(), [uxDecisionSuite(skipped)]));
  expect(status).toBe(1);
  expect(summary).toContain(skipped);
  expect(summary).toContain('se omitió');
});

test('falla si una prueba funcional obligatoria no existe en el informe', () => {
  const { status, summary } = run(report([]));
  expect(status).toBe(1);
  expect(summary).toContain('no se ejecutó');
});

test('falla si una transición obligatoria de UX-PRIORITY se omite', () => {
  const skipped = UX_PRIORITY_TITLES[0];
  const { status, summary } = run(report(uxHandSpecs(), [uxDecisionSuite(), uxPrioritySuite(skipped)]));
  expect(status).toBe(1);
  expect(summary).toContain(skipped);
  expect(summary).toContain('se omitió');
});

test('pasa cuando todas las obligatorias pasan, y lo dice', () => {
  const { status, summary } = run(report(uxHandSpecs(), [uxDecisionSuite(), uxPrioritySuite()]));
  expect(status).toBe(0);
  expect(summary).toContain('Las 28 se ejecutaron y pasaron.');
  expect(summary).toContain('`ux-decision.spec.ts` (UX-DECISION)');
  expect(summary).toContain('`ux-priority.spec.ts` (UX-PRIORITY)');
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
