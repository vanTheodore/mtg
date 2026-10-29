#!/usr/bin/env bun
/**
 * Optional post-link size optimization for the raw WASM bridge.
 * Requires Binaryen's wasm-opt (tested with 132). It is an external native
 * build tool, not an application/runtime dependency.
 *
 *   WASM_OPT=/path/to/wasm-opt bun run engine:optimize
 *
 * -O1 is the reproducible default: it reduced the bridge from ~46 MiB to
 * ~41 MiB in this repository and passed the real-game E2E. -Oz is smaller
 * but can take substantially longer on the full rules engine.
 */
const wasmOpt = process.env.WASM_OPT ?? 'wasm-opt';
const level = process.env.WASM_OPT_LEVEL ?? '-O1';
const input = 'static/wasm/mtg_engine_wasm.wasm';
const output = `${input}.opt`;
const before = Bun.file(input).size;

const version = Bun.spawnSync([wasmOpt, '--version'], { stdout: 'pipe', stderr: 'pipe' });
if (version.exitCode !== 0) {
  console.error(`wasm-opt not found at "${wasmOpt}". Install Binaryen 132+ or set WASM_OPT.`);
  process.exit(1);
}
console.log(`Optimizing ${input} with ${wasmOpt} ${level}…`);
const result = Bun.spawnSync([
  wasmOpt, input, level,
  '--strip-debug', '--strip-producers',
  '--enable-bulk-memory', '--enable-reference-types',
  '--enable-nontrapping-float-to-int', '--enable-sign-ext', '--enable-mutable-globals',
  '-o', output
], { stdout: 'inherit', stderr: 'inherit' });
if (result.exitCode !== 0) process.exit(result.exitCode ?? 1);
await Bun.write(input, Bun.file(output));
await Bun.$`rm -f ${output}`;
const after = Bun.file(input).size;
console.log(`WASM ${(before / 1048576).toFixed(2)} MiB → ${(after / 1048576).toFixed(2)} MiB`);
