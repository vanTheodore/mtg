import { expect, test } from 'bun:test';
import { wardSacrificeAction, wardSacrificePrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 702.21a/b: paying a ward cost by sacrificing. The prompt is reached only
 * after the payer accepted the ward, and the options are Phase's own
 * `SelectCards` candidates — one permanent per round-trip, or the single set the
 * engine found for a total-power threshold.
 */
const objects = {
  '101': { id: 101, name: 'Savannah Lions', power: 2, toughness: 1 },
  '105': { id: 105, name: 'Elvish Mystic', power: 1, toughness: 1 },
  '106': { id: 106, name: 'Carta sin poder', power: undefined }
};
const withWaiting = (waiting: unknown, actions: unknown[], viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 51,
    actions_applied: 51,
    metrics: {},
    state: {
      turn_number: 4,
      active_player: viewer,
      priority_player: viewer,
      phase: 'PreCombatMain',
      players: [],
      battlefield: [],
      stack: [],
      exile: [],
      objects,
      waiting_for: waiting
    },
    derived: {},
    legal: { actions, spell_costs: {}, by_object: {} }
  }) as unknown as EngineSnapshot;

const ward = (data: Record<string, unknown> = {}) => ({
  type: 'WardSacrificeChoice',
  data: { player: 0, permanents: [101, 105], remaining: 1, min_total_power: null, ...data }
});

test('one option per permanent, in the order Phase published them', () => {
  const prompt = wardSacrificePrompt(
    withWaiting(ward(), [
      { type: 'SelectCards', data: { cards: [101] } },
      { type: 'SelectCards', data: { cards: [105] } }
    ])
  )!;
  expect(prompt.options).toEqual([
    { cards: [101], power: 2 },
    { cards: [105], power: 1 }
  ]);
  expect(prompt.minTotalPower).toBeUndefined();
  expect(prompt.remaining).toBe(1);
});

test('a threshold set is named with its total, for display only', () => {
  const prompt = wardSacrificePrompt(
    withWaiting(ward({ permanents: [101, 105], min_total_power: 3 }), [
      { type: 'SelectCards', data: { cards: [101, 105] } }
    ])
  )!;
  expect(prompt.minTotalPower).toBe(3);
  expect(prompt.options).toEqual([{ cards: [101, 105], power: 3 }]);
});

test('an unknown power leaves the total unnamed instead of guessed', () => {
  const prompt = wardSacrificePrompt(
    withWaiting(ward(), [{ type: 'SelectCards', data: { cards: [106] } }])
  )!;
  expect(prompt.options).toEqual([{ cards: [106], power: null }]);
});

test('an empty selection is an option, and is not the same as no options', () => {
  const prompt = wardSacrificePrompt(
    withWaiting(ward({ permanents: [] }), [{ type: 'SelectCards', data: { cards: [] } }])
  )!;
  expect(prompt.options).toEqual([{ cards: [], power: null }]);
  // Nothing listed is no prompt material at all: the block says so instead of
  // inventing a choice.
  const none = wardSacrificePrompt(withWaiting(ward(), []))!;
  expect(none.options).toEqual([]);
});

test('the answer carries the engine’s own selection', () => {
  expect(wardSacrificeAction([101, 105])).toEqual({
    type: 'SelectCards',
    data: { cards: [101, 105] }
  });
});

test('a ward that discards cards is a different prompt', () => {
  expect(wardSacrificePrompt(withWaiting({ type: 'WardDiscardChoice', data: {} }, []))).toBeNull();
  expect(wardSacrificePrompt(null)).toBeNull();
});
