/// <reference lib="webworker" />
import { OP, decodeResponse, encodeRequest, type WorkerRequest, type WorkerResponse } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let wasm: WebAssembly.Instance | null = null;
let memory: WebAssembly.Memory;
let compileMs = 0;
let wasmTransferBytes = 0;

interface Exports {
  memory: WebAssembly.Memory;
  mtg_alloc(len: number): number;
  mtg_free(ptr: number, len: number): void;
  mtg_request(op: number, ptr: number, len: number): bigint;
}

/**
 * The upstream engine uses web-time, which pulls a small wasm-bindgen
 * performance.now() shim. We do not use wasm-bindgen glue, so provide the
 * minimal externref/runtime imports it needs. This is presentation timing only;
 * rules randomness remains deterministically seeded inside the engine.
 */
function createImports(module: WebAssembly.Module): WebAssembly.Imports {
  const heap: unknown[] = [undefined];
  const ref = (value: unknown) => { heap.push(value); return heap.length - 1; };
  const placeholder: Record<string, (...args: number[]) => number | void> = {};
  const xform: Record<string, (...args: number[]) => number | void> = {};

  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.module === '__wbindgen_placeholder__') {
      if (imp.name === '__wbindgen_describe') placeholder[imp.name] = () => {};
      else if (imp.name.startsWith('__wbg_performance')) placeholder[imp.name] = () => ref(performance);
      else if (imp.name.startsWith('__wbg_now')) placeholder[imp.name] = (idx) => (heap[idx] as Performance).now();
      else if (imp.name === '__wbindgen_object_drop_ref') placeholder[imp.name] = (idx) => { heap[idx] = undefined; };
      else if (imp.name === '__wbindgen_object_clone_ref') placeholder[imp.name] = (idx) => ref(heap[idx]);
      else if (imp.name.includes('GLOBAL_THIS')) placeholder[imp.name] = () => ref(globalThis);
      else if (imp.name.includes('SELF')) placeholder[imp.name] = () => ref(self);
      else if (imp.name.includes('WINDOW')) placeholder[imp.name] = () => ref(undefined);
      else if (imp.name.includes('GLOBAL')) placeholder[imp.name] = () => ref(globalThis);
      else if (imp.name.includes('is_undefined')) placeholder[imp.name] = (idx) => heap[idx] === undefined ? 1 : 0;
      else if (imp.name.includes('throw')) placeholder[imp.name] = (ptr, len) => {
        const bytes = new Uint8Array(memory.buffer, ptr, len);
        throw new Error(new TextDecoder().decode(bytes));
      };
      else placeholder[imp.name] = () => 0;
    } else if (imp.module === '__wbindgen_externref_xform__') {
      if (imp.name.includes('table_grow')) xform[imp.name] = (delta) => {
        const old = heap.length;
        for (let i = 0; i < delta; i++) heap.push(undefined);
        return old;
      };
      else if (imp.name.includes('table_set_null')) xform[imp.name] = (idx) => { heap[idx] = undefined; };
      else xform[imp.name] = () => 0;
    }
  }
  return { env: { mesa_now_ms: () => performance.now() }, __wbindgen_placeholder__: placeholder, __wbindgen_externref_xform__: xform };
}

async function boot() {
  const start = performance.now();
  const url = new URL('/wasm/mtg_engine_wasm.wasm', scope.location.href);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar el motor WASM (${response.status}). Ejecuta bun run engine:build.`);
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > 0) wasmTransferBytes = contentLength;
  const module = await WebAssembly.compileStreaming(response);
  wasm = await WebAssembly.instantiate(module, createImports(module));
  memory = (wasm.exports as unknown as Exports).memory;
  compileMs = performance.now() - start;
}

function call(op: number, payload: unknown): { reply: unknown; responseBytes: number } {
  if (!wasm) throw new Error('WASM no inicializado');
  const ex = wasm.exports as unknown as Exports;
  const input = encodeRequest(payload);
  const ptr = ex.mtg_alloc(input.length);
  new Uint8Array(memory.buffer, ptr, input.length).set(input);
  const packed = ex.mtg_request(op, ptr, input.length);
  ex.mtg_free(ptr, input.length);
  const outPtr = Number(packed >> 32n);
  const outLen = Number(packed & 0xffffffffn);
  const bytes = new Uint8Array(memory.buffer, outPtr, outLen).slice();
  ex.mtg_free(outPtr, outLen);
  return { reply: decodeResponse(bytes), responseBytes: bytes.length };
}

scope.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const { id, op, payload } = event.data;
  const start = performance.now();
  try {
    if (!wasm) await boot();
    const { reply, responseBytes } = call(op, payload);
    const msg: WorkerResponse = { id, reply, metrics: { worker_ms: performance.now() - start, wasm_compile_ms: compileMs, response_bytes: responseBytes, wasm_transfer_bytes: wasmTransferBytes, wasm_memory_bytes: memory?.buffer.byteLength ?? 0 } };
    scope.postMessage(msg);
  } catch (error) {
    const msg: WorkerResponse = { id, error: error instanceof Error ? error.message : String(error), metrics: { worker_ms: performance.now() - start, wasm_compile_ms: compileMs, wasm_transfer_bytes: wasmTransferBytes, wasm_memory_bytes: memory?.buffer.byteLength ?? 0 } };
    scope.postMessage(msg);
  }
});

export {};
