import { OP, type WorkerRequest, type WorkerResponse } from './protocol';
import type { EngineReply, EngineSnapshot, GameAction } from './types';

export class EngineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: EngineReply) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; sentAt: number }>();
  private bootPromise: Promise<void> | null = null;

  private ensure(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const { id, reply, error, metrics } = event.data;
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      clearTimeout(entry.timer);
      if (error) entry.reject(new Error(error));
      else {
        const r = reply as EngineReply;
        if (r.ok && metrics) {
          const transport_ms = Math.max(0, performance.now() - entry.sentAt - (metrics.worker_ms ?? 0));
          r.metrics = { ...r.metrics, ...metrics, transport_ms };
        }
        entry.resolve(r);
      }
    });
    this.worker.addEventListener('error', (event) => {
      for (const entry of this.pending.values()) entry.reject(new Error(event.message || 'Error del worker del motor'));
      this.pending.clear();
    });
    return this.worker;
  }

  private send(op: number, payload: unknown, timeoutMs = 30_000): Promise<EngineReply> {
    const worker = this.ensure();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('El motor no respondió a tiempo.'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, sentAt: performance.now() });
      // Svelte runes proxies are not structured-cloneable; cross the worker
      // boundary with plain JSON only.
      const msg: WorkerRequest = { id, op, payload: JSON.parse(JSON.stringify(payload)) };
      worker.postMessage(msg);
    });
  }

  async init(payload: unknown): Promise<EngineReply> {
    return this.send(OP.INIT, payload, 120_000);
  }

  async action(actor: number, action: GameAction, expectedRevision?: number): Promise<EngineReply> {
    return this.send(OP.ACTION, { actor, action, expected_revision: expectedRevision });
  }

  async view(viewer: number): Promise<EngineReply> {
    return this.send(OP.VIEW, viewer);
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('Motor terminado'));
    }
    this.pending.clear();
  }
}

export function isSnapshot(reply: EngineReply): reply is EngineSnapshot {
  return reply.ok === true;
}
