import { expect, test } from 'bun:test';
import { chooseCopyAnnouncerAction, chooseCopyTargetAction, copyRetargetPrompt, keepCopyTargetsAction } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 707.10c + CR 722.3c + CR 702.192a (`CopyRetarget`): the copy target walk.
 *
 * The engine asks **one slot at a time** and re-prompts after each answer, so the
 * prompt carries the decided prefix (`picks`) plus engine-derived permissions for
 * the position being answered (`can_keep`, `can_decline`) and for the whole walk
 * (`can_keep_rest`). The screen renders those; it never derives a legality rule of
 * its own, and it caches no half-answer because the engine already narrates it.
 *
 * One variant serves two operations: a copy that holds targets may pick new ones
 * (CR 707.10c) and a freshly cast copy announces its own (CR 601.2c + CR 707.12).
 * A walk may also open with an announcing-opponent election (CR 115.1), where no
 * slot is being answered at all.
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

const copyRetarget = (data: Record<string, unknown> = {}) =>
  withWaiting({
    type: 'CopyRetarget',
    data: {
      player: 0,
      copy_id: 380,
      target_slots: [
        {
          current: { Object: 200 },
          legal_alternatives: [{ Object: 100 }, { Player: 1 }],
          can_keep: true,
          can_decline: false
        }
      ],
      current_slot: 0,
      picks: [],
      can_keep_rest: true,
      mode: 'Retarget',
      ...data
    }
  });

test('the walk publishes its slot, its permissions and the decided prefix', () => {
  const prompt = copyRetargetPrompt(copyRetarget())!;
  expect(prompt.copyId).toBe(380);
  expect(prompt.mode).toBe('retarget');
  expect(prompt.currentSlot).toBe(0);
  expect(prompt.canKeepRest).toBe(true);
  expect(prompt.picks).toEqual([]);
  expect(prompt.slots).toHaveLength(1);
  expect(prompt.slots[0].current).toEqual({ Object: 200 });
  expect(prompt.slots[0].alternatives).toEqual([{ Object: 100 }, { Player: 1 }]);
  // CR 707.10c: this position may stay as it is.
  expect(prompt.slots[0].canKeep).toBe(true);
  // CR 115.6 does not apply to a retarget walk.
  expect(prompt.slots[0].canDecline).toBe(false);
});

test('an announcement walk keeps nothing and may decline an optional slot', () => {
  const prompt = copyRetargetPrompt(
    copyRetarget({
      mode: 'Announce',
      current_slot: 1,
      picks: [{ Object: 200 }],
      can_keep_rest: false,
      target_slots: [
        { current: null, legal_alternatives: [{ Object: 200 }], can_keep: false, can_decline: true },
        { current: null, legal_alternatives: [{ Object: 100 }], can_keep: false, can_decline: true }
      ]
    })
  )!;
  expect(prompt.mode).toBe('announce');
  expect(prompt.currentSlot).toBe(1);
  expect(prompt.picks).toEqual([{ Object: 200 }]);
  expect(prompt.canKeepRest).toBe(false);
  expect(prompt.slots[1].canDecline).toBe(true);
  expect(prompt.slots[1].canKeep).toBe(false);
  // A position with no announced target has nothing to keep.
  expect(prompt.slots[0].current).toBeNull();
});

test('a decided position may be a kept one, and that is not a target', () => {
  const prompt = copyRetargetPrompt(copyRetarget({ current_slot: 2, picks: [null, { Object: 101 }] }))!;
  // CR 707.10c: `None` in the prefix means "unchanged", not "no target".
  expect(prompt.picks).toEqual([null, { Object: 101 }]);
  expect(prompt.currentSlot).toBe(2);
});

test('the mode falls back to retarget, and the current slot to the prefix length', () => {
  const prompt = copyRetargetPrompt(copyRetarget({ mode: undefined, current_slot: undefined, picks: [null, null] }))!;
  expect(prompt.mode).toBe('retarget');
  expect(prompt.currentSlot).toBe(2);
  expect(copyRetargetPrompt(copyRetarget({ mode: 'Announce' }))!.mode).toBe('announce');
});

test('an announcing-opponent election is its own question', () => {
  const prompt = copyRetargetPrompt(
    copyRetarget({
      mode: 'Announce',
      target_slots: [],
      current_slot: 0,
      announcer_election: { candidates: [1], choice_index: 2, choice_count: 3 }
    })
  )!;
  // CR 115.1: while the election is open, no slot is answered.
  expect(prompt.slots).toEqual([]);
  expect(prompt.announcer).toEqual({ candidates: [1], choiceIndex: 2, choiceCount: 3 });
  // Absent is not an election.
  expect(copyRetargetPrompt(copyRetarget())!.announcer).toBeNull();
});

test('junk slots are dropped rather than becoming empty rows', () => {
  const prompt = copyRetargetPrompt(
    copyRetarget({
      target_slots: [
        { current: { Object: 200 }, legal_alternatives: [{ Object: 100 }, null, 'x'], can_keep: true },
        { current: { Weird: 1 }, legal_alternatives: 'nope', can_keep: 'yes' },
        'junk'
      ]
    })
  )!;
  expect(prompt.slots).toHaveLength(3);
  expect(prompt.slots[0].alternatives).toEqual([{ Object: 100 }]);
  expect(prompt.slots[1].current).toBeNull();
  expect(prompt.slots[1].alternatives).toEqual([]);
  // A permission is only true when the engine says `true`.
  expect(prompt.slots[1].canKeep).toBe(false);
});

test('the controller is published only when a different seat answers', () => {
  expect(copyRetargetPrompt(copyRetarget())!.controller).toBeNull();
  // CR 112.2: the copy is the controller's; the answering player may be another.
  expect(copyRetargetPrompt(copyRetarget({ controller: 1 }))!.controller).toBe(1);
  expect(copyRetargetPrompt(copyRetarget({ controller: 1 }))!.player).toBe(0);
});

test('the defaults fall back to the viewer seat and a missing copy', () => {
  const prompt = copyRetargetPrompt(copyRetarget({ player: undefined, copy_id: undefined }))!;
  expect(prompt.player).toBe(0);
  expect(prompt.copyId).toBe(0);
});

test('the answers are the engine actions this walk expects', () => {
  // One slot: a target or `null` (keep, CR 707.10c).
  expect(chooseCopyTargetAction({ Object: 100 })).toEqual({
    type: 'ChooseTarget',
    data: { target: { Object: 100 } }
  });
  expect(chooseCopyTargetAction(null)).toEqual({ type: 'ChooseTarget', data: { target: null } });
  // The whole remainder, gated by `can_keep_rest`.
  expect(keepCopyTargetsAction()).toEqual({ type: 'KeepAllCopyTargets' });
  // CR 601.2c + CR 115.1: the announcing opponent.
  expect(chooseCopyAnnouncerAction(1)).toEqual({
    type: 'ChooseAnnouncingOpponent',
    data: { opponent: 1 }
  });
});

test('another prompt is not this block', () => {
  expect(copyRetargetPrompt(withWaiting({ type: 'RetargetChoice', data: {} }))).toBeNull();
  expect(copyRetargetPrompt(withWaiting({ type: 'EachPlayerCopyChosenSelection', data: {} }))).toBeNull();
  expect(copyRetargetPrompt(null)).toBeNull();
});
