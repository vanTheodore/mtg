/**
 * Native engine and shipped WASM must agree.
 *
 * Two independent runs of the same seed and the same deck list:
 *  - `docs/packcheck-10e.json` — `packcheck`, native Rust, `CardDatabase::from_json_str`.
 *  - `docs/wasm-packcheck.json` — `scripts/wasm-packcheck.ts`, the exact `.wasm`
 *    the browser downloads, driven through `mtg_request`/`mtg_alloc`.
 *
 * If the bridge, the ABI or the pack merge changed behaviour, the step count,
 * the action mix or the winner would drift. They are compared here, not assumed.
 *
 * `docs/parity-trace.json` goes further: `scripts/parity-trace.ts` diffs both
 * runs step by step — actor, action with its arguments, every legal action and
 * the full projected state for that viewer. The traces themselves are 100 MB of
 * generated data and are not committed; the summary is.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../../../', import.meta.url).pathname;
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));

interface Report {
  faces?: number;
  catalog_faces?: number;
  requested: { player: number; opponent: number };
  resolved_after_init?: number[];
  resolved?: { player: number; opponent: number };
  steps: number;
  action_kinds: Record<string, number>;
  outcome?: { winner?: number | null; draw?: boolean } | null;
  game_over?: { winner: number | null } | null;
}

const native = readJson('docs/packcheck-10e.json') as Report;
const wasm = readJson('docs/wasm-packcheck.json') as Report;
const trace = readJson('docs/parity-trace.json') as {
  equal: boolean;
  native_steps: number;
  wasm_steps: number;
  steps_compared: number;
  actions_equal: boolean;
  legal_sets_equal: boolean;
  states_equal: boolean;
  actors_equal: boolean;
  waiting_equal: boolean;
  first_divergence: unknown;
  normalization: string[];
};
const normalizeOutcome = (report: Report) =>
  report.outcome ? report.outcome.winner ?? null : report.game_over ? report.game_over.winner : null;

describe('native engine and shipped WASM resolve the same game', () => {
  test('both loaded every card the decks asked for', () => {
    expect(native.resolved).toEqual({ player: 40, opponent: 40 });
    expect(wasm.resolved_after_init).toEqual([40, 40]);
  });

  test('the same seed produces the same number of steps', () => {
    expect(native.steps).toBeGreaterThan(100);
    expect(wasm.steps).toBe(native.steps);
  });

  test('both runs take the same kinds of actions', () => {
    expect(wasm.action_kinds).toEqual(native.action_kinds);
  });

  test('both runs end the same way', () => {
    expect(normalizeOutcome(wasm)).toBe(normalizeOutcome(native));
  });

  test('the WASM run reports the engine it actually loaded', () => {
    expect(wasm.catalog_faces).toBe(444);
    expect(native.faces).toBe(444);
  });

  test('every step matches: action, arguments, legal set and projected state', () => {
    expect(trace.equal).toBe(true);
    expect(trace.first_divergence).toBeNull();
    expect(trace.steps_compared).toBe(native.steps);
    expect(trace.native_steps).toBe(trace.wasm_steps);
    expect({
      actions: trace.actions_equal,
      legal: trace.legal_sets_equal,
      states: trace.states_equal,
      actors: trace.actors_equal,
      waiting: trace.waiting_equal
    }).toEqual({ actions: true, legal: true, states: true, actors: true, waiting: true });
  });

  test('the comparison states what it normalizes and nothing else', () => {
    // Only wall-clock/envelope data is excluded, and the list is the contract:
    // if someone adds a state field here, this test fails.
    expect(trace.normalization).toEqual([
      'metrics: tiempos de pared (no forman parte de la partida)',
      'envelope del run: bytes, memoria y tiempos; no se incluyen en el trace',
      'nada dentro de state/legal/action se normaliza'
    ]);
  });
});
