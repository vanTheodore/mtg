#!/usr/bin/env bun
/**
 * Exact parity over several seeds, not just the one that was tuned.
 *
 * `scripts/parity-trace.ts` proves every step of one game matches. This script
 * asks a cheaper question over a wider surface: for each seed, do the native
 * engine and the shipped WASM reach the same game — same number of steps, same
 * mix of actions, same winner, same per-seat resolution? Any difference is a
 * seed worth tracing.
 *
 * Usage:
 *   bun scripts/parity-seeds.ts [--packs a.json,b.json] [--decks file.json]
 *                               [--seeds 1,3,7,11,42] [--max-steps 4000]
 *                               [--native target/.../packcheck] [--out docs/parity-seeds.json]
 */
import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] ? argv[at + 1]! : fallback;
};

const packs = flag('packs', 'static/data/catalog/packs/fixture.json,static/data/catalog/packs/10e.json');
const decks = flag('decks', 'docs/packcheck-10e-decks.json');
const seeds = flag('seeds', '1,3,7,11,42').split(',').map(Number);
const maxSteps = flag('max-steps', '4000');
const native = flag('native', 'target/x86_64-unknown-linux-gnu/debug/packcheck');
const out = flag('out', 'docs/parity-seeds.json');

interface NativeReport {
  steps: number;
  game_over: { winner: number | null } | null;
  action_kinds: Record<string, number>;
  requested: Record<string, number>;
  resolved: Record<string, number>;
}

interface WasmReport {
  steps: number;
  outcome: { winner: number | null; draw: boolean };
  action_kinds: Record<string, number>;
  requested: Record<string, number>;
  resolved_after_init: number[];
  rejections: number;
}

const sorted = (kinds: Record<string, number>) =>
  Object.fromEntries(Object.entries(kinds).sort(([a], [b]) => a.localeCompare(b)));

const results: {
  seed: number;
  equal: boolean;
  steps: { native: number; wasm: number };
  winner: { native: number | null; wasm: number | null };
  resolved: { native: Record<string, number>; wasm: number[] };
  differences: string[];
}[] = [];

for (const seed of seeds) {
  const runNative = Bun.spawnSync([native, packs, decks, String(seed), maxSteps], { stdout: 'pipe', stderr: 'pipe' });
  if (runNative.exitCode !== 0) {
    console.error(`packcheck falló con semilla ${seed}:\n${runNative.stderr.toString()}`);
    process.exit(1);
  }
  const nativeReport = JSON.parse(runNative.stdout.toString()) as NativeReport;

  const runWasm = Bun.spawnSync(
    ['bun', 'scripts/wasm-packcheck.ts', packs, '--decks', decks, '--seed', String(seed), '--max-steps', maxSteps],
    { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, MESA_WASM_QUIET: '1' } }
  );
  if (runWasm.exitCode !== 0) {
    console.error(`wasm-packcheck falló con semilla ${seed}:\n${runWasm.stderr.toString()}`);
    process.exit(1);
  }
  const text = runWasm.stdout.toString();
  const wasmReport = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as WasmReport;

  const differences: string[] = [];
  if (nativeReport.steps !== wasmReport.steps) differences.push(`pasos ${nativeReport.steps} ≠ ${wasmReport.steps}`);
  const nativeWinner = nativeReport.game_over?.winner ?? null;
  const wasmWinner = wasmReport.outcome.draw ? null : wasmReport.outcome.winner ?? null;
  if (nativeWinner !== wasmWinner) differences.push(`ganador ${nativeWinner} ≠ ${wasmWinner}`);
  const nativeKinds = JSON.stringify(sorted(nativeReport.action_kinds));
  const wasmKinds = JSON.stringify(sorted(wasmReport.action_kinds));
  if (nativeKinds !== wasmKinds) differences.push('mezcla de acciones distinta');
  const nativeResolved = [nativeReport.resolved.player, nativeReport.resolved.opponent];
  if (JSON.stringify(nativeResolved) !== JSON.stringify(wasmReport.resolved_after_init)) {
    differences.push(`resolución ${nativeResolved} ≠ ${wasmReport.resolved_after_init}`);
  }
  if (wasmReport.rejections !== 0) differences.push(`${wasmReport.rejections} rechazos del motor`);

  results.push({
    seed,
    equal: differences.length === 0,
    steps: { native: nativeReport.steps, wasm: wasmReport.steps },
    winner: { native: nativeWinner, wasm: wasmWinner },
    resolved: { native: nativeReport.resolved, wasm: wasmReport.resolved_after_init },
    differences
  });
  console.log(
    `semilla ${seed}: ${nativeReport.steps} pasos, ganador ${nativeWinner}` +
      (differences.length ? ` — DIFIERE: ${differences.join('; ')}` : ' — idéntico')
  );
}

const report = {
  generated_at: new Date().toISOString(),
  engine: 'static/wasm/mtg_engine_wasm.wasm',
  packs,
  decks,
  max_steps: Number(maxSteps),
  fields_compared: ['steps', 'action_kinds', 'winner', 'resolved per seat', 'rejections'],
  equal: results.every((result) => result.equal),
  seeds: results
};
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${results.filter((result) => result.equal).length}/${results.length} semillas idénticas → ${out}`);
process.exit(report.equal ? 0 : 1);
