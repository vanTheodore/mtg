import { expect, test } from 'bun:test';
import {
  declineResolveAllAction,
  grantResolveAllAction,
  resolveAllPrompt,
  revokeResolveAllAction
} from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 117.3d + CR 117.4: the table's «resolve all» shortcut asks each priority
 * representative to consent. Only `epoch` and `representative` cross the viewer
 * projection — the run's participants, scope and auto-pass baseline are stripped
 * server-side — so the prompt names one seat and promises nothing more. The
 * answers are the engine's own envelopes: a delayed one naming another epoch is
 * refused, which is exactly why nothing here rebuilds the action.
 */
const withWaiting = (waiting: unknown, actions: unknown[] = [], viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 11,
    revision: 50,
    actions_applied: 50,
    metrics: {},
    state: {
      turn_number: 7,
      active_player: viewer,
      priority_player: viewer,
      phase: 'PreCombatMain',
      players: [],
      battlefield: [],
      stack: [],
      exile: [],
      objects: {},
      waiting_for: waiting
    },
    derived: {},
    legal: { actions, spell_costs: {}, by_object: {} }
  }) as unknown as EngineSnapshot;

const consent = (data: Record<string, unknown> = {}) => ({
  type: 'ResolveAllConsent',
  data: { epoch: 3, representative: 0, ...data }
});
const grant = (epoch = 3) => ({ type: 'RespondResolveAllConsent', data: { epoch, decision: { type: 'Grant' } } });
const decline = (epoch = 3) => ({ type: 'RespondResolveAllConsent', data: { epoch, decision: { type: 'Decline' } } });

test('the window names the seat being asked and the proposal it answers', () => {
  const prompt = resolveAllPrompt(withWaiting(consent(), [grant(), decline()]))!;
  expect(prompt.representative).toBe(0);
  expect(prompt.epoch).toBe(3);
  expect(prompt.grantOffered).toBe(true);
  expect(prompt.declineOffered).toBe(true);
});

test('the offers are the engine’s envelopes, not the state on screen', () => {
  // A prompt can outlive the run that issued it: with nothing on offer the window
  // still exists (the seat is being asked) but issues no answer.
  const none = resolveAllPrompt(withWaiting(consent(), [{ type: 'PassPriority' }]))!;
  expect(none.grantOffered).toBe(false);
  expect(none.declineOffered).toBe(false);
  expect(grantResolveAllAction(withWaiting(consent(), [{ type: 'PassPriority' }]))).toBeUndefined();

  const onlyDecline = resolveAllPrompt(withWaiting(consent(), [decline()]))!;
  expect(onlyDecline.grantOffered).toBe(false);
  expect(onlyDecline.declineOffered).toBe(true);

  // An envelope for another epoch is not an answer to this one.
  const stale = resolveAllPrompt(withWaiting(consent(), [grant(2), decline(4)]))!;
  expect(stale.grantOffered).toBe(false);
  expect(stale.declineOffered).toBe(false);
});

test('without a representative there is no one to ask', () => {
  expect(resolveAllPrompt(withWaiting(consent({ representative: undefined })))).toBeNull();
  expect(resolveAllPrompt(withWaiting({ type: 'ResolveAllReady', data: { epoch: 3 } }))).toBeNull();
  expect(resolveAllPrompt(withWaiting({ type: 'Priority', data: { player: 0 } }))).toBeNull();
  expect(resolveAllPrompt(null)).toBeNull();
});

test('a missing epoch still reads the offers the engine sent', () => {
  const prompt = resolveAllPrompt(withWaiting(consent({ epoch: undefined }), [grant(9)]))!;
  // Absent is not a reason to hide the answers; the envelope carries the epoch.
  expect(prompt.epoch).toBe(0);
  expect(prompt.grantOffered).toBe(true);
  // The envelope keeps the epoch the engine minted, not the one the state omits.
  const action = grantResolveAllAction(withWaiting(consent({ epoch: undefined }), [grant(9)]));
  expect(action?.data).toEqual({ epoch: 9, decision: { type: 'Grant' } });
});

test('grant, decline and revoke hand over the envelope untouched', () => {
  const snapshot = withWaiting(consent(), [grant(), decline(), { type: 'RevokeResolveAllConsent', data: { epoch: 3, representative: 0 } }]);
  expect(grantResolveAllAction(snapshot)).toEqual(grant());
  expect(declineResolveAllAction(snapshot)).toEqual(decline());
  expect(revokeResolveAllAction(snapshot, 0)).toEqual({
    type: 'RevokeResolveAllConsent',
    data: { epoch: 3, representative: 0 }
  });
  // Nothing to revoke for a seat the engine did not name.
  expect(revokeResolveAllAction(snapshot, 1)).toBeUndefined();
});
