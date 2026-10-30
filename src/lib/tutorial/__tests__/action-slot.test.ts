import { expect, test } from 'bun:test';
import { ActionSlot } from '../action-slot.ts';
import type { GameAction } from '../../engine/types.ts';

const PASS: GameAction = { type: 'PassPriority' };
const PLAY_LAND: GameAction = { type: 'PlayLand', data: { object_id: 1, card_id: 1 } };

test('an action waits while another one is in flight instead of being dropped', () => {
  const slot = new ActionSlot();
  slot.propose(PASS);
  const first = slot.take();
  expect(first).toEqual(PASS);
  expect(slot.isBusy).toBe(true);

  // The next decision arrives while the engine is busy: it must wait.
  slot.propose(PLAY_LAND);
  expect(slot.take()).toBeNull();
  expect(slot.waiting).toEqual(PLAY_LAND);

  // The engine finishes: the waiting action goes out.
  slot.release();
  expect(slot.take()).toEqual(PLAY_LAND);
  expect(slot.waiting).toBeNull();
});

test('the newest decision replaces the waiting one', () => {
  const slot = new ActionSlot();
  slot.propose(PASS);
  const taken = slot.take();
  expect(taken).toEqual(PASS);
  slot.propose(PASS);
  slot.propose(PLAY_LAND);
  slot.release();
  expect(slot.take()).toEqual(PLAY_LAND);
});

test('without a decision there is nothing to send', () => {
  const slot = new ActionSlot();
  expect(slot.take()).toBeNull();
  slot.propose(null);
  expect(slot.take()).toBeNull();
  slot.propose(PASS);
  expect(slot.take()).toEqual(PASS);
  expect(slot.take()).toBeNull();
});
