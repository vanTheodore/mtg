export const OP = { INIT: 1, ACTION: 2, SNAPSHOT: 3, VIEW: 4 } as const;

export interface WorkerRequest {
  id: number;
  op: number;
  payload: unknown;
}

export interface WorkerResponse {
  id: number;
  reply?: unknown;
  error?: string;
  metrics?: { worker_ms: number; wasm_compile_ms?: number; response_bytes?: number; wasm_transfer_bytes?: number; wasm_memory_bytes?: number; encode_ms?: number; wasm_call_ms?: number; decode_ms?: number };
}

export function encodeRequest(payload: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function decodeResponse(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes));
}
