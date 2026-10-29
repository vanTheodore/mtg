/// <reference lib="webworker" />
import { OP, decodeResponse, encodeRequest, type WorkerRequest, type WorkerResponse } from './protocol';
import { buildImports } from './wasm-imports';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let wasm: WebAssembly.Instance | null = null;
let memory: WebAssembly.Memory | null = null;
let compileMs = 0;
let wasmTransferBytes = 0;
interface Exports { memory: WebAssembly.Memory; mtg_alloc(len: number): number; mtg_free(ptr: number, len: number): void; mtg_request(op: number, ptr: number, len: number): bigint }
const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;

function getMemory(): ArrayBuffer {
  if (!memory) throw new Error('Memoria WASM no inicializada');
  return memory.buffer;
}
function hostRandom(dest: Uint8Array): number {
  // getRandomValues is strict about >65536 bytes per call.
  for (let offset = 0; offset < dest.length; offset += 65_536) crypto.getRandomValues(dest.subarray(offset, Math.min(offset + 65_536, dest.length)));
  return 0;
}

async function boot() {
  const started = performance.now();
  const url = new URL('/wasm/mtg_engine_wasm.wasm', scope.location.href);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar el motor WASM (${response.status}). Ejecuta bun run engine:build.`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > 0) wasmTransferBytes = length;
  const module = await WebAssembly.compileStreaming(response);
  const imports = buildImports(WebAssembly.Module.imports(module), { now: () => performance.now(), random: hostRandom, memory: getMemory });
  wasm = await WebAssembly.instantiate(module, imports);
  memory = (wasm.exports as unknown as Exports).memory;
  compileMs = performance.now() - started;
}

function call(op: number, payload: unknown) {
  if (!wasm || !memory) throw new Error('WASM no inicializado');
  const ex = wasm.exports as unknown as Exports;
  const encodeStarted = performance.now();
  const input = encodeRequest(payload);
  const encodeMs = performance.now() - encodeStarted;
  if (input.length === 0 || input.length > MAX_MESSAGE_BYTES) throw new Error('Solicitud WASM inválida o demasiado grande');
  const ptr = ex.mtg_alloc(input.length);
  if (!ptr || ptr + input.length > memory.buffer.byteLength) throw new Error('Asignación WASM inválida');
  let requestMs = 0;
  let packed = 0n;
  try {
    new Uint8Array(memory.buffer, ptr, input.length).set(input);
    const requestStarted = performance.now();
    packed = ex.mtg_request(op, ptr, input.length);
    requestMs = performance.now() - requestStarted;
  } finally { ex.mtg_free(ptr, input.length); }
  const outPtr = Number(packed >> 32n);
  const outLen = Number(packed & 0xffffffffn);
  if (!outPtr || outLen === 0 || outLen > MAX_MESSAGE_BYTES || outPtr + outLen > memory.buffer.byteLength) throw new Error('Respuesta WASM inválida');
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(memory.buffer, outPtr, outLen).slice(); }
  finally { ex.mtg_free(outPtr, outLen); }
  const decodeStarted = performance.now();
  const reply = decodeResponse(bytes);
  return { reply, responseBytes: bytes.length, encodeMs, requestMs, decodeMs: performance.now() - decodeStarted };
}

scope.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const { id, op, payload } = event.data;
  const started = performance.now();
  try {
    if (!wasm) await boot();
    const callResult = call(op, payload);
    const msg: WorkerResponse = { id, reply: callResult.reply, metrics: {
      worker_ms: performance.now() - started, wasm_compile_ms: compileMs, response_bytes: callResult.responseBytes,
      wasm_transfer_bytes: wasmTransferBytes, wasm_memory_bytes: memory?.buffer.byteLength ?? 0,
      encode_ms: callResult.encodeMs, wasm_call_ms: callResult.requestMs, decode_ms: callResult.decodeMs
    } };
    scope.postMessage(msg);
  } catch (error) {
    const msg: WorkerResponse = { id, error: error instanceof Error ? error.message : String(error), metrics: {
      worker_ms: performance.now() - started, wasm_compile_ms: compileMs, wasm_transfer_bytes: wasmTransferBytes, wasm_memory_bytes: memory?.buffer.byteLength ?? 0
    } };
    scope.postMessage(msg);
  }
});
export {};
