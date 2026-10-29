/// <reference lib="webworker" />
import { OP, decodeResponse, encodeRequest, type WorkerRequest, type WorkerResponse } from './protocol';
import { buildImports } from './wasm-imports';

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

const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;
function hostRandom(dest: Uint8Array): number {
  // crypto.getRandomValues has a 65536-byte per-call limit.
  for (let offset = 0; offset < dest.length; offset += 65_536) {
    crypto.getRandomValues(dest.subarray(offset, Math.min(offset + 65_536, dest.length)));
  }
  return 0;
}

async function boot() {
  const start = performance.now();
  const url = new URL('/wasm/mtg_engine_wasm.wasm', scope.location.href);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar el motor WASM (${response.status}). Ejecuta bun run engine:build.`);
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > 0) wasmTransferBytes = contentLength;
  const module = await WebAssembly.compileStreaming(response);
  const imports = buildImports(WebAssembly.Module.imports(module), {
    now: () => performance.now(), random: hostRandom, memory: () => memory.buffer
  });
  wasm = await WebAssembly.instantiate(module, imports);
  memory = (wasm.exports as unknown as Exports).memory;
  compileMs = performance.now() - start;
}

function call(op: number, payload: unknown): { reply: unknown; responseBytes: number } {
  if (!wasm) throw new Error('WASM no inicializado');
  const ex = wasm.exports as unknown as Exports;
  const input = encodeRequest(payload);
  if (input.length > MAX_MESSAGE_BYTES) throw new Error('Solicitud WASM demasiado grande');
  const ptr = ex.mtg_alloc(input.length);
  if (!ptr || ptr + input.length > memory.buffer.byteLength) throw new Error('Asignación WASM inválida');
  let packed = 0n;
  try {
    new Uint8Array(memory.buffer, ptr, input.length).set(input);
    packed = ex.mtg_request(op, ptr, input.length);
  } finally { ex.mtg_free(ptr, input.length); }
  const outPtr = Number(packed >> 32n);
  const outLen = Number(packed & 0xffffffffn);
  if (!outPtr || outLen === 0 || outLen > MAX_MESSAGE_BYTES || outPtr + outLen > memory.buffer.byteLength) throw new Error('Respuesta WASM inválida');
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(memory.buffer, outPtr, outLen).slice(); }
  finally { ex.mtg_free(outPtr, outLen); }
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
