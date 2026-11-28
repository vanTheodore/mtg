import { expect, test } from 'bun:test';
import { ActionSlot, type ActionSlotProposal } from '../action-slot.ts';
import type { GameAction } from '../../engine/types.ts';

const PASS: GameAction = { type: 'PassPriority' };
const PLAY_LAND: GameAction = { type: 'PlayLand', data: { object_id: 1, card_id: 1 } };
const IDENTITY = { viewer: 0, revision: 1 };
const proposal = (action: GameAction, viewer = IDENTITY.viewer, revision = IDENTITY.revision, step = 1): ActionSlotProposal => ({
  action, viewer, revision, step
});

test('an action waits while another one is in flight instead of being dropped', () => {
  const slot = new ActionSlot();
  slot.propose(proposal(PASS));
  const first = slot.take(IDENTITY);
  expect(first).toEqual({ kind: 'ready', proposal: proposal(PASS) });
  expect(slot.isBusy).toBe(true);

  // The next decision arrives while the engine is busy: it must wait.
  slot.propose(proposal(PLAY_LAND, 0, 2));
  expect(slot.take({ viewer: 0, revision: 2 })).toEqual({ kind: 'busy' });
  expect(slot.waiting).toEqual(proposal(PLAY_LAND, 0, 2));

  // The engine finishes: the waiting action goes out only against its revision.
  slot.release();
  expect(slot.take({ viewer: 0, revision: 2 })).toEqual({
    kind: 'ready', proposal: proposal(PLAY_LAND, 0, 2)
  });
  expect(slot.waiting).toBeNull();
});

test('the newest decision replaces the waiting one', () => {
  const slot = new ActionSlot();
  slot.propose(proposal(PASS));
  expect(slot.take(IDENTITY)).toEqual({ kind: 'ready', proposal: proposal(PASS) });
  slot.propose(proposal(PASS, 0, 2));
  slot.propose(proposal(PLAY_LAND, 0, 3, 2));
  slot.release();
  expect(slot.take({ viewer: 0, revision: 3 })).toEqual({
    kind: 'ready', proposal: proposal(PLAY_LAND, 0, 3, 2)
  });
});

test('a saved action is discarded after either the viewer or revision changes', () => {
  const slot = new ActionSlot();
  slot.propose(proposal(PASS));

  expect(slot.take({ viewer: 1, revision: 1 })).toEqual({
    kind: 'stale', proposal: proposal(PASS)
  });
  expect(slot.isBusy).toBe(false);
  expect(slot.waiting).toBeNull();

  slot.propose(proposal(PASS, 0, 2));
  expect(slot.take({ viewer: 0, revision: 3 })).toEqual({
    kind: 'stale', proposal: proposal(PASS, 0, 2)
  });
  expect(slot.isBusy).toBe(false);
  expect(slot.waiting).toBeNull();
});

test('without a decision there is nothing to send', () => {
  const slot = new ActionSlot();
  expect(slot.take(IDENTITY)).toEqual({ kind: 'empty' });
  slot.propose(null);
  expect(slot.take(IDENTITY)).toEqual({ kind: 'empty' });
  slot.propose(proposal(PASS));
  expect(slot.take(IDENTITY)).toEqual({ kind: 'ready', proposal: proposal(PASS) });
  expect(slot.take(IDENTITY)).toEqual({ kind: 'busy' });
});
