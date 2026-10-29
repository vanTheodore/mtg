#!/usr/bin/env bun
/**
 * Play a real match through the **shipped WASM** bridge, headless.
 *
 * `packcheck` (Rust, native) proves the packs deserialize in the engine. This
 * script proves the other half: the exact `.wasm` the browser downloads
 * instantiates with the client's own imports, accepts the packs the client would
 * merge, and plays a full game through `init` / `action`, the same two ops the UI
 * uses. It is not a browser test — it does not paint, and Playwright/Chromium is
 * not involved — but every card, action and rule decision comes from Phase.
 *
 * Usage:
 *   bun scripts/wasm-packcheck.ts [packs...] [--decks <file>] [--seed 7] [--max-steps 4000]
 *                                 [--out docs/wasm-packcheck.json] [--trace <path>]
 *
 * `--trace` writes the same JSON lines `packcheck --trace` writes (actor, action,
 * every legal action, projected state per step) so `scripts/parity-trace.ts` can
 * diff native and WASM step by step instead of only comparing totals.
 */
import { closeSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { buildImports } from '../src/lib/engine/wasm-imports.ts';
import { ENGINE_PROTOCOL_VERSION, type EngineReply, type EngineSnapshot, type GameAction } from '../src/lib/engine/types.ts';
import type { Catalog } from '../src/lib/game/catalog.ts';

interface Exports {
  memory: WebAssembly.Memory;
  mtg_alloc(len: number): number;
  mtg_free(ptr: number, len: number): void;
  mtg_request(op: number, ptr: number, len: number): bigint;
}

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] ? argv[at + 1]! : fallback;
};
const decksPath = flag('decks', 'docs/packcheck-10e-decks.json');
const seed = Number(flag('seed', '7'));
const maxSteps = Number(flag('max-steps', '4000'));
const outPath = flag('out', '');
const tracePath = flag('trace', '');
// Synchronous writes: the script ends with `process.exit`, which would discard a
// buffered stream's tail.
const traceFd = tracePath ? openSync(tracePath, 'w') : null;
const packPaths = argv.filter((token, at) => !token.startsWith('--') && !(at > 0 && argv[at - 1]?.startsWith('--')));
if (!packPaths.length) {
  console.error('uso: bun scripts/wasm-packcheck.ts <pack.json[,pack2.json…]> [--decks …] [--seed 7] [--max-steps 4000]');
  process.exit(2);
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]!;
};

// ── catalog: merge the packs first-wins, exactly like `mergeCatalogs` ────────
const mergeStarted = performance.now();
const catalog: Catalog = {};
const packStats: { path: string; bytes: number; faces: number }[] = [];
for (const path of packPaths.flatMap((token) => token.split(','))) {
  const text = readFileSync(path, 'utf8');
  const payload = JSON.parse(text) as Catalog;
  let added = 0;
  for (const [name, entry] of Object.entries(payload)) {
    if (!(name in catalog)) {
      catalog[name] = entry;
      added += 1;
    }
  }
  packStats.push({ path, bytes: Buffer.byteLength(text), faces: added });
}
const mergeMs = performance.now() - mergeStarted;

const decks = JSON.parse(readFileSync(decksPath, 'utf8')) as { player: { main_deck: string[] }; opponent: { main_deck: string[] } };
const requested = { player: decks.player.main_deck.length, opponent: decks.opponent.main_deck.length };

// ── boot the engine exactly like engine.worker.ts ────────────────────────────
const wasmPath = 'static/wasm/mtg_engine_wasm.wasm';
const bytes = readFileSync(wasmPath);
const compileStarted = performance.now();
const module = await WebAssembly.compile(bytes);
const compileMs = performance.now() - compileStarted;
let memory: WebAssembly.Memory | null = null;
const hostRandom = (dest: Uint8Array) => {
  for (let offset = 0; offset < dest.length; offset += 65_536) crypto.getRandomValues(dest.subarray(offset, Math.min(offset + 65_536, dest.length)));
  return 0;
};
const instantiateStarted = performance.now();
const instance = await WebAssembly.instantiate(module, buildImports(WebAssembly.Module.imports(module), {
  now: () => performance.now(),
  random: hostRandom,
  memory: () => {
    if (!memory) throw new Error('memoria no disponible');
    return memory.buffer;
  }
}));
const instantiateMs = performance.now() - instantiateStarted;
const ex = instance.exports as unknown as Exports;
memory = ex.memory;

let calls = 0;
let wasmCallMs = 0;
let responseBytes = 0;
function call(op: number, payload: unknown): EngineReply {
  const input = new TextEncoder().encode(JSON.stringify(payload));
  const ptr = ex.mtg_alloc(input.length);
  if (!ptr) throw new Error('mtg_alloc falló');
  let packed = 0n;
  try {
    new Uint8Array(memory!.buffer, ptr, input.length).set(input);
    const started = performance.now();
    packed = ex.mtg_request(op, ptr, input.length);
    wasmCallMs += performance.now() - started;
  } finally {
    ex.mtg_free(ptr, input.length);
  }
  const outPtr = Number(packed >> 32n);
  const outLen = Number(packed & 0xffffffffn);
  const output = new Uint8Array(memory!.buffer, outPtr, outLen).slice();
  ex.mtg_free(outPtr, outLen);
  calls += 1;
  responseBytes = Math.max(responseBytes, output.length);
  return JSON.parse(new TextDecoder().decode(output)) as EngineReply;
}

const OP = { INIT: 1, ACTION: 2, SNAPSHOT: 3, VIEW: 4 } as const;
const initStarted = performance.now();
const init = call(OP.INIT, { protocol_version: ENGINE_PROTOCOL_VERSION, catalog, decks, seed, first_player: 0 });
const initMs = performance.now() - initStarted;
if (!init.ok) {
  console.log(JSON.stringify({ ok: false, error: init, packs: packStats }, null, 2));
  process.exit(1);
}
let snapshot = init as EngineSnapshot;

/** Count what the engine resolved for each seat right after `init`: Phase skips
 *  names it cannot resolve without an error, so this is the only honest check
 *  that the whole deck reached the game. */
function resolvedCounts(state: EngineSnapshot): number[] {
  return state.state.players.map((player) =>
    player.library_count + player.hand.length + player.graveyard.length
    + state.state.battlefield.filter((id) => state.state.objects[String(id)]?.controller === player.id).length);
}
const resolvedAfterInit = resolvedCounts(snapshot);

/** The same behaviour as the scripted player `packcheck` uses: play cards first,
 *  answer decisions immediately, pass only when nothing else is legal. */
function chooseLegal(actions: GameAction[]): GameAction | undefined {
  const rank = (action: GameAction): [number, number] => {
    const type = action.type;
    const data = (action.data ?? {}) as Record<string, unknown>;
    if (type === 'MulliganDecision' && data.choice === 'Keep') return [0, 0];
    if (type === 'SelectTargets') return [1, Array.isArray(data.targets) ? data.targets.length : 0];
    if (type === 'ChooseTarget') return [1, 0];
    if (type === 'DeclareAttackers') return [Array.isArray(data.attacks) && data.attacks.length ? 2 : 80, 0];
    if (type === 'DeclareBlockers') return [Array.isArray(data.assignments) && data.assignments.length ? 3 : 80, 0];
    if (type === 'CastSpell') return [4, 0];
    if (type === 'PlayLand') return [5, 0];
    if (type === 'ActivateAbility') return [6, 0];
    if (type === 'PassPriority') return [8, 0];
    return [1, 0];
  };
  return [...actions].sort((a, b) => {
    const [ra, sa] = rank(a);
    const [rb, sb] = rank(b);
    return ra - rb || sa - sb;
  })[0];
}

const stepLatencies: number[] = [];
const kinds: Record<string, number> = {};
let steps = 0;
let outcome: unknown = snapshot.outcome ?? null;
while (steps < maxSteps && !outcome) {
  const actions = snapshot.legal?.actions ?? [];
  const action = chooseLegal(actions);
  if (!action) break;
  kinds[action.type] = (kinds[action.type] ?? 0) + 1;
  const actor = snapshot.state.priority_player;
  if (traceFd !== null) {
    writeSync(traceFd, `${JSON.stringify({
      step: steps,
      actor,
      waiting: snapshot.state.waiting_for?.type ?? null,
      action,
      legal: actions,
      state: snapshot.state
    })}\n`);
  }
  const started = performance.now();
  const reply = call(OP.ACTION, { actor, action, expected_revision: snapshot.revision });
  stepLatencies.push(performance.now() - started);
  if (!reply.ok) {
    console.log(JSON.stringify({ ok: false, step: steps, action, error: reply }, null, 2));
    process.exit(1);
  }
  snapshot = reply as EngineSnapshot;
  outcome = snapshot.outcome ?? null;
  steps += 1;
}

if (traceFd !== null) closeSync(traceFd);
const rejected = 0;

const players = snapshot.state.players.map((player) => ({
  id: player.id,
  life: player.life,
  library: player.library_count,
  hand: player.hand.length,
  graveyard: player.graveyard.length,
  battlefield: snapshot.state.battlefield.filter((id) => snapshot.state.objects[String(id)]?.controller === player.id).length
}));
// Cards the engine still holds for each seat (library is a count for the
// opponent seat; hand/graveyard/battlefield are ids, visible per viewer).
const resolved = players.map((player) => player.library + player.hand + player.graveyard + player.battlefield);

const report = {
  generated_at: new Date().toISOString(),
  engine: 'static/wasm/mtg_engine_wasm.wasm',
  engine_bytes: bytes.length,
  packs: packStats,
  catalog_faces: Object.keys(catalog).length,
  merge_ms: Math.round(mergeMs * 10) / 10,
  compile_ms: Math.round(compileMs * 10) / 10,
  instantiate_ms: Math.round(instantiateMs * 10) / 10,
  wasm_memory_mb: Math.round((memory.buffer.byteLength / 1024 / 1024) * 10) / 10,
  init_ms: Math.round(initMs * 10) / 10,
  decks: decksPath,
  seed,
  requested,
  /** Cards per seat right after `init` (library + hand + graveyard + board):
   *  what the engine actually resolved. Phase skips unknown names silently, so a
   *  short count here is the only visible symptom of a missing card. */
  resolved_after_init: resolvedAfterInit,
  steps,
  action_kinds: kinds,
  step_ms: {
    median: Math.round(median(stepLatencies) * 100) / 100,
    p90: Math.round(percentile(stepLatencies, 0.9) * 100) / 100,
    max: Math.round(Math.max(...stepLatencies, 0) * 100) / 100
  },
  rejections: rejected,
  wasm_calls: calls,
  wasm_call_ms: Math.round(wasmCallMs * 10) / 10,
  max_response_bytes: responseBytes,
  outcome,
  players
};

const text = JSON.stringify(report, null, 2);
if (outPath) writeFileSync(outPath, `${text}\n`);
console.log(text);
const ok = steps > 0 && Object.keys(catalog).length > 0
  && resolvedAfterInit[0] === requested.player && resolvedAfterInit[1] === requested.opponent;
process.exit(ok ? 0 : 1);
