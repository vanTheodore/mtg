import { describe, expect, test } from 'bun:test';

/**
 * UX-HAND 1.1 — C. What a dispatch actually told us.
 *
 * A revision bump does not prove the action was accepted. `session.dispatch`
 * re-views after `stale_action`, and a re-view can move the revision too, so
 * "revision went up" is compatible with "your action was rejected". The sheet
 * used exactly that inference to decide whether to close.
 *
 * The RED here is that `dispatch` returns `Promise<void>`: there is nothing to
 * distinguish acceptance, rejection, a stale re-view or a transport failure.
 * The classifier below is pure so the three outcomes can be asserted without a
 * browser, and the same function is what `session.dispatch` returns.
 */
import { classifyDispatch } from '../dispatchOutcome.ts';

const snapshot = (revision: number) => ({ ok: true, revision } as never);
const failure = (code: string) => ({ ok: false, code, error: `Phase dijo ${code}` } as never);

describe('C — resultado explícito del despacho', () => {
  test('una respuesta con snapshot es aceptación y trae la revisión', () => {
    expect(classifyDispatch({ actionRevision: 7, snapshotBefore: 7, reply: snapshot(8), reViewed: false }))
      .toEqual({ kind: 'accepted', revision: 8, code: undefined, message: undefined });
  });

  test('stale_action ya re-visto es "stale", no aceptación', () => {
    const outcome = classifyDispatch({ actionRevision: 7, snapshotBefore: 7, reply: failure('stale_action'), reViewed: true });
    expect(outcome.kind).toBe('stale');
    // The player must be told why nothing happened, and be able to retry.
    expect(outcome.message).toBeTruthy();
  });

  test('invalid_action/rejected es rechazo explícito con mensaje', () => {
    const outcome = classifyDispatch({ actionRevision: 7, snapshotBefore: 7, reply: failure('invalid_action'), reViewed: false });
    expect(outcome.kind).toBe('rejected');
    expect(outcome.code).toBe('invalid_action');
    expect(outcome.message).toBeTruthy();
  });

  test('una excepción de transporte es "failed", no "accepted"', () => {
    const outcome = classifyDispatch({ actionRevision: 7, snapshotBefore: 7, reply: null, reViewed: false, error: new Error('worker muerto') });
    expect(outcome.kind).toBe('failed');
    expect(outcome.message).toContain('worker muerto');
  });

  test('el resultado nunca depende de que la revisión suba', () => {
    // A re-view that lands on the same revision as before is still not an
    // acceptance: the kind comes from the reply, not from comparing numbers.
    const outcome = classifyDispatch({ actionRevision: 7, snapshotBefore: 8, reply: failure('stale_action'), reViewed: true });
    expect(outcome.kind).toBe('stale');
  });

  test('sin motor disponible el despacho no se declara aceptado', () => {
    const outcome = classifyDispatch({ actionRevision: 0, snapshotBefore: 0, reply: null, reViewed: false, skipped: true });
    expect(outcome.kind).toBe('unavailable');
  });
});
