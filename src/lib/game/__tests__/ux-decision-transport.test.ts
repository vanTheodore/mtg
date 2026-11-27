import { describe, expect, test } from 'bun:test';
import { classifyDispatch, type DispatchOutcome } from '../dispatchOutcome.ts';
import { projectDecision } from '../decisionProjection.ts';

/**
 * UX-DECISION 1.0 · fixtures guionizados de error de transporte.
 *
 * **Capa declarada: transporte / despacho (`classifyDispatch`), NO motor.**
 * Estos casos no restauran un `GameState`, no usan `GameScenario` y no tocan el
 * WASM: simulan únicamente lo que `EngineClient` puede devolver o lo que el
 * worker puede lanzar. Por eso van aquí y no en `bin/e2e_scenarios.rs`, cuyos
 * fixtures son de **motor real** y declaran su capa en el job Rust.
 *
 * Se comprueba que la proyección de decisiones es independiente de `busy`,
 * `stale_action`, rechazo y cancelación: `projectDecision` sigue siendo pura y
 * el resultado del despacho sigue viniendo de `session.dispatch`. Así una
 * simplificación visual nunca convierte un error en «aceptado».
 */
interface TransportFixture {
  id: string;
  layer: 'transporte/despacho';
  reply: null | { ok: boolean; revision?: number; code?: string; rejected?: boolean; error?: string };
  error?: Error;
  skipped?: boolean;
  reViewed?: boolean;
  expected: DispatchOutcome['kind'];
}

const FIXTURES: TransportFixture[] = [
  { id: 'worker-muerto', layer: 'transporte/despacho', reply: null, error: new Error('worker muerto'), expected: 'failed' },
  { id: 'sin-respuesta', layer: 'transporte/despacho', reply: null, expected: 'failed' },
  { id: 'stale-revisitado', layer: 'transporte/despacho', reply: { ok: false, code: 'stale_action', revision: 9 }, reViewed: true, expected: 'stale' },
  { id: 'invalid-action', layer: 'transporte/despacho', reply: { ok: false, code: 'invalid_action' }, expected: 'rejected' },
  { id: 'rechazo-explicito', layer: 'transporte/despacho', reply: { ok: false, rejected: true, error: 'Ese objetivo ya no es legal.' }, expected: 'rejected' },
  { id: 'sin-motor', layer: 'transporte/despacho', reply: null, skipped: true, expected: 'unavailable' }
];

const baseSnapshot = {
  viewer: 0,
  revision: 7,
  state: {
    turn_number: 1,
    phase: 'PreCombatMain',
    active_player: 0,
    priority_player: 0,
    stack: [],
    waiting_for: { type: 'Priority', data: { player: 0 } }
  },
  legal: { actions: [{ type: 'PassPriority' }], by_object: {} }
};

describe('UX-DECISION · errores de transporte guionizados (capa: despacho)', () => {
  for (const fixture of FIXTURES) {
    test(`${fixture.id} se clasifica como ${fixture.expected} y no como aceptado`, () => {
      expect(fixture.layer).toBe('transporte/despacho');
      const outcome = classifyDispatch({
        actionRevision: 7,
        snapshotBefore: 7,
        reply: fixture.reply as never,
        reViewed: fixture.reViewed ?? false,
        error: fixture.error,
        skipped: fixture.skipped
      });
      expect(outcome.kind).toBe(fixture.expected);
      expect(outcome.kind).not.toBe('accepted');
      expect(outcome.message).toBeTruthy();
    });
  }

  test('un error de transporte no altera la proyección ni elimina acciones legales', () => {
    const projection = projectDecision({ snapshot: baseSnapshot as never })!;
    expect(projection.integrity.ok).toBe(true);
    expect(projection.integrity.unclassified).toEqual([]);
    expect(projection.primary?.label).toBe('Pasar');
    expect(JSON.stringify(baseSnapshot)).toContain('PassPriority');
  });
});
