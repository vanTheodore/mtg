import { expect, test } from 'bun:test';
import {
  chooseUntapAction,
  selectCardsAction,
  untapPrompt,
  untapSubsetAction,
  untapSubsetPrompt
} from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 502.3: the untap step happens before the active player gets priority, and
 * Phase splits it into two different questions.
 *
 *   - `UntapChoice` asks about **one** permanent at a time — «you may choose not
 *     to untap this permanent» — and re-prompts with the rest. The answer is
 *     `ChooseUntap { object_id, untap }`, and `chosen_not_to_untap` is what this
 *     same step has already declined.
 *   - `ChooseUntapSubset` is a `MaxUntapPerType` cap: the player must say which
 *     members of `group` untap, at most `max` of them, and the complement stays
 *     tapped. Fewer than `max` is legal and so is none.
 *
 * Neither prompt invents a target: the candidate list and the cap are the
 * engine's, and an answer names only ids from them.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 21,
    revision: 12,
    actions_applied: 12,
    metrics: {},
    state: {
      turn_number: 4,
      active_player: viewer,
      priority_player: viewer,
      phase: 'Untap',
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

test('the choice names one permanent, its seat and what the step already declined', () => {
  const prompt = untapPrompt(
    withWaiting({ type: 'UntapChoice', data: { player: 0, candidates: [417], chosen_not_to_untap: [418, 205] } })
  )!;
  expect(prompt.player).toBe(0);
  expect(prompt.candidates).toEqual([417]);
  expect(prompt.declined).toEqual([418, 205]);
});

test('a drained candidate list asks nothing: the engine has moved on', () => {
  expect(untapPrompt(withWaiting({ type: 'UntapChoice', data: { player: 0, candidates: [] } }))).toBeNull();
  expect(untapPrompt(null)).toBeNull();
  // And the other untap shape is not this prompt.
  expect(untapPrompt(withWaiting({ type: 'ChooseUntapSubset', data: { player: 0, group: [102], max: 1 } }))).toBeNull();
});

test('both answers are real envelopes, one per permanent', () => {
  expect(chooseUntapAction(417, false)).toEqual({ type: 'ChooseUntap', data: { object_id: 417, untap: false } });
  expect(chooseUntapAction(417, true)).toEqual({ type: 'ChooseUntap', data: { object_id: 417, untap: true } });
});

test('the subset carries the over-cap group and the ceiling it competes for', () => {
  const prompt = untapSubsetPrompt(
    withWaiting({ type: 'ChooseUntapSubset', data: { player: 1, group: [102, 103, 104], max: 1 } })
  )!;
  expect(prompt.player).toBe(1);
  expect(prompt.group).toEqual([102, 103, 104]);
  expect(prompt.max).toBe(1);
});

test('a cap of zero or an empty group is not a question a player could answer', () => {
  expect(untapSubsetPrompt(withWaiting({ type: 'ChooseUntapSubset', data: { player: 0, group: [102], max: 0 } }))).toBeNull();
  expect(untapSubsetPrompt(withWaiting({ type: 'ChooseUntapSubset', data: { player: 0, group: [], max: 2 } }))).toBeNull();
  expect(untapPrompt(withWaiting({ type: 'ChooseUntapSubset', data: { player: 0, group: [102], max: 1 } }))).toBeNull();
});

test('the subset answer is the shared SelectCards envelope, copied', () => {
  const cards = [103];
  const action = untapSubsetAction(cards);
  expect(action).toEqual(selectCardsAction([103]));
  expect(action).toEqual({ type: 'SelectCards', data: { cards: [103] } });
  // An empty answer is legal: nothing untaps.
  expect(untapSubsetAction([])).toEqual({ type: 'SelectCards', data: { cards: [] } });
  expect(cards).toEqual([103]);
});
