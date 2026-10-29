#!/usr/bin/env bun
/**
 * Native engine vs shipped WASM, step by step.
 *
 * Comparing "how many steps" is weak: two runs can end with the same count while
 * taking different actions. This script diffs the two traces produced by
 * `packcheck --trace` (native Rust, `CardDatabase::from_json_str`) and
 * `wasm-packcheck.ts --trace` (the `.wasm` the browser downloads), and compares
 * for every step:
 *
 *   - the actor,
 *   - the action applied, including its arguments,
 *   - every legal action at that point (as a sorted set),
 *   - the projected state for that viewer (the same `project_state` function),
 *   - the waiting-for kind,
 *   - and, at the end, the outcome.
 *
 * Normalisation is deliberately tiny and written down:
 *
 *   `metrics`           — wall-clock numbers, not part of the game
 *   `generated_at`      — ditto; traces do not carry it, the report does
 *   the whole envelope  — byte sizes, memory, timings of the run
 *
 * Nothing inside `state` / `legal` / `action` is normalised. If those differ, the
 * report keeps the first divergence with the seed, the packs, the decks file and
 * the step index, which is enough to replay it (`--max-steps <step>` reproduces
 * the exact prefix).
 *
 * Usage:
 *   bun scripts/parity-trace.ts <native.jsonl> <wasm.jsonl> [--out docs/parity-trace.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : undefined;
};
const positional = argv.filter((token, at) => !token.startsWith('--') && !(at > 0 && argv[at - 1]?.startsWith('--')));
if (positional.length < 2) {
  console.error('uso: bun scripts/parity-trace.ts <native.jsonl> <wasm.jsonl> [--out <json>]');
  process.exit(2);
}

interface TraceStep {
  step: number;
  actor: number;
  waiting: unknown;
  action: unknown;
  legal: unknown[];
  state: unknown;
}

const readTrace = (path: string): TraceStep[] =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const parsed = JSON.parse(line) as TraceStep;
      if (typeof parsed.step !== 'number') throw new Error(`${path}: línea ${index + 1} sin step`);
      return parsed;
    });

/** Sorted-key serialisation, so key order never reads as a difference. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** First path where two JSON values differ, or `null`. */
function firstDifference(a: unknown, b: unknown, path = ''): { path: string; native: unknown; wasm: unknown } | null {
  if (a === b) return null;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return { path: `${path}.length`, native: a.length, wasm: b.length };
    for (let index = 0; index < a.length; index += 1) {
      const found = firstDifference(a[index], b[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const key of [...keys].sort()) {
      const found = firstDifference((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
      if (found) return found;
    }
    return null;
  }
  return { path: path || '(root)', native: a, wasm: b };
}

const native = readTrace(positional[0]!);
const wasm = readTrace(positional[1]!);

const summary = {
  native_steps: native.length,
  wasm_steps: wasm.length,
  steps_compared: 0,
  actions_equal: true,
  legal_sets_equal: true,
  states_equal: true,
  actors_equal: true,
  waiting_equal: true,
  first_divergence: null as null | {
    step: number;
    field: string;
    path: string;
    native: unknown;
    wasm: unknown;
    action: unknown;
    replay: string;
  }
};

const steps = Math.min(native.length, wasm.length);
for (let index = 0; index < steps; index += 1) {
  const n = native[index]!;
  const w = wasm[index]!;
  summary.steps_compared = index + 1;
  const checks: [string, boolean, { path: string; native: unknown; wasm: unknown } | null][] = [
    ['actor', n.actor === w.actor, firstDifference(n.actor, w.actor, 'actor')],
    ['waiting', stable(n.waiting) === stable(w.waiting), firstDifference(n.waiting, w.waiting, 'waiting')],
    ['action', stable(n.action) === stable(w.action), firstDifference(n.action, w.action, 'action')],
    [
      'legal',
      stable([...n.legal].map(stable).sort()) === stable([...w.legal].map(stable).sort()),
      firstDifference([...n.legal].map(stable).sort(), [...w.legal].map(stable).sort(), 'legal')
    ],
    ['state', stable(n.state) === stable(w.state), firstDifference(n.state, w.state, 'state')]
  ];
  for (const [field, equal, difference] of checks) {
    if (field === 'actor' && !equal) summary.actors_equal = false;
    if (field === 'waiting' && !equal) summary.waiting_equal = false;
    if (field === 'action' && !equal) summary.actions_equal = false;
    if (field === 'legal' && !equal) summary.legal_sets_equal = false;
    if (field === 'state' && !equal) summary.states_equal = false;
    if (!equal && !summary.first_divergence) {
      summary.first_divergence = {
        step: index,
        field,
        path: difference?.path ?? '',
        native: difference?.native ?? null,
        wasm: difference?.wasm ?? null,
        action: n.action,
        replay: `packcheck <packs> <decks> <seed> --trace … --max-steps ${index + 1}`
      };
      break;
    }
  }
  if (summary.first_divergence) break;
}

const equal = summary.first_divergence === null
  && native.length === wasm.length
  && summary.actions_equal && summary.legal_sets_equal && summary.states_equal;

const report = {
  generated_at: new Date().toISOString(),
  native_trace: positional[0],
  wasm_trace: positional[1],
  normalization: [
    'metrics: tiempos de pared (no forman parte de la partida)',
    'envelope del run: bytes, memoria y tiempos; no se incluyen en el trace',
    'nada dentro de state/legal/action se normaliza'
  ],
  equal,
  ...summary
};

const text = JSON.stringify(report, null, 2);
const out = flag('out');
if (out) writeFileSync(out, `${text}\n`);
console.log(text);
process.exit(equal ? 0 : 1);
