import { expect, test } from 'bun:test';
import { exploreAction, explorePrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 701.44d (`ExploreChoice`): several permanents explore at the same time, so
 * the player who controls them chooses **the order** — one explorer per step, and
 * the engine asks again after each pick.
 *
 * The payload carries two lists and they are not the same one: `choosable` is what
 * this player may send now, `remaining` is the whole queue. When permanents of
 * several players explore together each player orders their own (CR 101.4), so the
 * difference is exactly what someone else decides.
 *
 * CR 701.44a — the reveal that follows (a land to hand, otherwise a +1/+1 counter)
 * — is the engine's own resolution, not a question of this prompt.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 161,
    actions_applied: 161,
    metrics: {},
    state: {
      turn_number: 16,
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
    legal: { actions: [], spell_costs: {}, by_object: {} }
  }) as unknown as EngineSnapshot;

const explore = (data: Record<string, unknown> = {}) =>
  withWaiting({
    type: 'ExploreChoice',
    data: {
      player: 0,
      source_id: 385,
      choosable: [390, 391, 392],
      remaining: [390, 391, 392],
      ...data
    }
  });

test('the prompt publishes the picks and the queue the engine resolved', () => {
  const prompt = explorePrompt(explore())!;
  expect(prompt.player).toBe(0);
  expect(prompt.sourceId).toBe(385);
  expect(prompt.choosable).toEqual([390, 391, 392]);
  expect(prompt.remaining).toEqual([390, 391, 392]);
});

test('the queue can be longer than what this player may pick', () => {
  // CR 101.4: the rival's two Merfolk are queued for the rival, not for the viewer.
  const prompt = explorePrompt(explore({ choosable: [390, 391], remaining: [390, 391, 393, 394] }))!;
  expect(prompt.choosable).toHaveLength(2);
  expect(prompt.remaining).toHaveLength(4);
  expect(prompt.remaining.filter((id) => !prompt.choosable.includes(id))).toEqual([393, 394]);
});

test('junk ids are dropped instead of becoming unpickable rows', () => {
  // A string id is not an id: `'391'` is dropped even though 391 exists.
  const prompt = explorePrompt(explore({ choosable: [390, null, 'x', '391'], remaining: [390, null, 391] }))!;
  expect(prompt.choosable).toEqual([390]);
  expect(prompt.remaining).toEqual([390, 391]);
});

test('an absent list is empty, never a guess from the other one', () => {
  const prompt = explorePrompt(explore({ choosable: undefined }))!;
  expect(prompt.choosable).toEqual([]);
  expect(prompt.remaining).toEqual([390, 391, 392]);
  expect(explorePrompt(explore({ remaining: undefined }))!.remaining).toEqual([]);
});

test('the defaults fall back to the viewer seat and a missing source', () => {
  const prompt = explorePrompt(explore({ player: undefined, source_id: undefined }))!;
  expect(prompt.player).toBe(0);
  expect(prompt.sourceId).toBe(0);
});

test('the answer is the object that explores next, in the engine action shape', () => {
  // CR 701.44d: one explorer per step; the engine then re-asks for the next.
  expect(exploreAction(391)).toEqual({ type: 'ChooseTarget', data: { target: { Object: 391 } } });
});

test('another prompt is not this block', () => {
  expect(explorePrompt(withWaiting({ type: 'VoteChoice', data: {} }))).toBeNull();
  expect(explorePrompt(withWaiting({ type: 'DigChoice', data: {} }))).toBeNull();
  expect(explorePrompt(null)).toBeNull();
});
