import type { Page } from '@playwright/test';
import { OP } from '../../../src/lib/engine/protocol';

export const ENGINE_ACTION_OP = OP.ACTION;

export interface WorkerTraceRequest {
  kind: 'request';
  workerId: number;
  id: number;
  op: number;
  payload: unknown;
}

export interface WorkerTraceResponse {
  kind: 'response';
  workerId: number;
  id: number;
  reply?: {
    ok?: boolean;
    code?: string;
    error?: string;
    revision?: number;
    viewer?: number;
    actions_applied?: number;
    waiting?: string;
    phase?: string;
  };
  error?: string;
}

export type WorkerTraceEntry = WorkerTraceRequest | WorkerTraceResponse;

/**
 * Record the actual browser Worker wire, not a UI counter. Requests retain the
 * action payload and expected revision; replies retain the engine's outcome and
 * state identity without copying the full snapshot into the test page.
 */
export async function installEngineWorkerTrace(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type TraceEntry = {
      kind: 'request' | 'response';
      workerId: number;
      id: number;
      op?: number;
      payload?: unknown;
      reply?: {
        ok?: boolean;
        code?: string;
        error?: string;
        revision?: number;
        viewer?: number;
        actions_applied?: number;
        waiting?: string;
        phase?: string;
      };
      error?: string;
    };
    type TracedWindow = Window & { __mesaEngineWorkerTrace?: TraceEntry[] };
    const target = window as TracedWindow;
    target.__mesaEngineWorkerTrace = [];
    const nativeWorker = window.Worker;
    let nextWorkerId = 1;
    const clone = (value: unknown): unknown => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

    window.Worker = class extends nativeWorker {
      private readonly mesaWorkerId: number;

      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options);
        this.mesaWorkerId = nextWorkerId++;
        this.addEventListener('message', (event: MessageEvent) => {
          const message = event.data ?? {};
          const reply = message.reply ?? {};
          target.__mesaEngineWorkerTrace?.push({
            kind: 'response',
            workerId: this.mesaWorkerId,
            id: Number(message.id),
            reply: {
              ok: reply.ok,
              code: reply.code,
              error: reply.error,
              revision: reply.revision,
              viewer: reply.viewer,
              actions_applied: reply.actions_applied,
              waiting: reply.state?.waiting_for?.type,
              phase: reply.state?.phase
            },
            error: message.error
          });
        });
      }

      postMessage(message: unknown, transfer?: unknown): void {
        const request = message as { id?: number; op?: number; payload?: unknown } | null;
        target.__mesaEngineWorkerTrace?.push({
          kind: 'request',
          workerId: this.mesaWorkerId,
          id: Number(request?.id),
          op: Number(request?.op),
          payload: clone(request?.payload)
        });
        if (transfer === undefined) super.postMessage(message);
        else super.postMessage(message, transfer as never);
      }
    };
  });
}

export async function readEngineWorkerTrace(page: Page): Promise<WorkerTraceEntry[]> {
  return page.evaluate(() => {
    type TraceEntry = WorkerTraceEntry;
    type TracedWindow = Window & { __mesaEngineWorkerTrace?: TraceEntry[] };
    return (window as TracedWindow).__mesaEngineWorkerTrace?.map((entry) => structuredClone(entry)) ?? [];
  });
}
