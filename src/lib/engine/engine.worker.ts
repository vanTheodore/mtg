/// <reference lib="webworker" />
import { OP, decodeResponse, encodeRequest, type WorkerRequest, type WorkerResponse } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let wasm: WebAssembly.Instance | null = null;
let memory: WebAssembly.Memory;
let compileMs = 0;

interface Exports {
  memory: WebAssembly.Memory;
  mtg_alloc(len: number): number;
  mtg_free(ptr: number, len: number): void;
  mtg_request(op: number, ptr: number, len: number): bigint;
}

async function boot() {
  const start = performance.now();
  const url = new URL('/wasm/mtg_engine_wasm.wasm', scope.location.href);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar el motor WASM (${response.status}). Ejecuta bun run engine:build.`);
  const result = await WebAssembly.instantiateStreaming(response, {});
  wasm = result.instance;
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
    const msg: WorkerResponse = { id, reply, metrics: { worker_ms: performance.now() - start, wasm_compile_ms: compileMs, response_bytes: responseBytes } };
    scope.postMessage(msg);
  } catch (error) {
    const msg: WorkerResponse = { id, error: error instanceof Error ? error.message : String(error), metrics: { worker_ms: performance.now() - start, wasm_compile_ms: compileMs } };
    scope.postMessage(msg);
  }
});

export {};
