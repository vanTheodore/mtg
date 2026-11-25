#!/usr/bin/env bun
/** Prove the production WASM bridge does not expose the test-only restore opcode. */
import { readFileSync } from 'node:fs';
import { buildImports } from '../src/lib/engine/wasm-imports.ts';

interface Exports {
  memory: WebAssembly.Memory;
  mtg_alloc(len: number): number;
  mtg_free(ptr: number, len: number): void;
  mtg_request(op: number, ptr: number, len: number): bigint;
}

const path = 'static/wasm/mtg_engine_wasm.wasm';
const module = await WebAssembly.compile(readFileSync(path));
let memory: WebAssembly.Memory | null = null;
const random = (dest: Uint8Array) => {
  for (let offset = 0; offset < dest.length; offset += 65_536) {
    crypto.getRandomValues(dest.subarray(offset, Math.min(offset + 65_536, dest.length)));
  }
  return 0;
};
const instance = await WebAssembly.instantiate(module, buildImports(WebAssembly.Module.imports(module), {
  now: () => performance.now(),
  random,
  memory: () => {
    if (!memory) throw new Error('WASM memory is not initialized');
    return memory.buffer;
  }
}));
const exports = instance.exports as unknown as Exports;
memory = exports.memory;
const input = new TextEncoder().encode('{}');
const pointer = exports.mtg_alloc(input.length);
if (!pointer) throw new Error('mtg_alloc failed');
let packed = 0n;
try {
  new Uint8Array(memory.buffer, pointer, input.length).set(input);
  packed = exports.mtg_request(5, pointer, input.length);
} finally {
  exports.mtg_free(pointer, input.length);
}
const outputPointer = Number(packed >> 32n);
const outputLength = Number(packed & 0xffffffffn);
if (!outputPointer || !outputLength) throw new Error('production WASM returned an invalid response');
let reply: { ok?: boolean; error?: string };
try {
  reply = JSON.parse(new TextDecoder().decode(new Uint8Array(memory.buffer, outputPointer, outputLength).slice()));
} finally {
  exports.mtg_free(outputPointer, outputLength);
}
if (reply.ok !== false || reply.error !== 'unknown operation') {
  throw new Error(`production WASM exposed operation 5: ${JSON.stringify(reply)}`);
}
console.log('Production WASM rejects E2E scenario operation 5.');
