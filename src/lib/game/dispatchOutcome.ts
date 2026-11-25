import type { EngineReply } from '#lib/engine/types.ts';

/**
 * What one dispatch actually achieved.
 *
 * The sheet used to infer success from "the revision went up". That is not a
 * proof: `dispatch` re-views after `stale_action`, and a re-view can move the
 * revision by itself, so a rejected action could look accepted. Worse, it made
 * the UI's behaviour depend on a number it did not own.
 *
 * These are the only outcomes a caller may branch on:
 *
 *  - `accepted`    the engine applied the action and returned the new state
 *  - `stale`       the state had moved; the view was refreshed, nothing applied
 *  - `rejected`    the engine refused this action and said why
 *  - `failed`      transport/worker error; nothing is known about the action
 *  - `unavailable` there was no state to act on (or a dispatch is in flight)
 */
export type DispatchOutcomeKind = 'accepted' | 'stale' | 'rejected' | 'failed' | 'unavailable';

export interface DispatchOutcome {
  kind: DispatchOutcomeKind;
  /** Revision the engine reported after the reply, when it reported one. */
  revision?: number;
  /** Engine code (`stale_action`, `invalid_action`…) when there was one. */
  code?: string;
  /** Human sentence in es-419, ready to show. */
  message?: string;
}

const STALE_MESSAGE = 'La partida cambió mientras elegías. La vista se actualizó; vuelve a intentarlo.';
const REJECTED_MESSAGE = 'Phase no acepta esa elección todavía. Revisa objetivos, fuentes de maná o criaturas seleccionadas y vuelve a intentarlo.';

export function classifyDispatch(input: {
  /** Revision the action was built against. */
  actionRevision: number;
  /** Revision the UI had when the dispatch started. */
  snapshotBefore: number;
  reply: EngineReply | null;
  reViewed: boolean;
  error?: unknown;
  skipped?: boolean;
}): DispatchOutcome {
  if (input.skipped) {
    return { kind: 'unavailable', message: 'No hay una partida activa que pueda aceptar esa acción.' };
  }
  if (input.error !== undefined) {
    const detail = input.error instanceof Error ? input.error.message : String(input.error);
    return { kind: 'failed', message: `No se pudo enviar la acción: ${detail}` };
  }
  const reply = input.reply;
  if (!reply) return { kind: 'failed', message: 'No se pudo enviar la acción.' };
  if (reply.ok === true) {
    return { kind: 'accepted', revision: reply.revision };
  }
  const code = reply.code;
  if (code === 'stale_action') {
    return { kind: 'stale', code, revision: reply.revision, message: STALE_MESSAGE };
  }
  const rejected = code === 'invalid_action' || reply.rejected === true;
  return {
    kind: 'rejected',
    code,
    revision: reply.revision,
    message: rejected ? REJECTED_MESSAGE : (reply.error || REJECTED_MESSAGE)
  };
}
