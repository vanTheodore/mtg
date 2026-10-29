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
});
