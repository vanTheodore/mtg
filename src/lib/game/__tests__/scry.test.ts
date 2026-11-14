import { expect, test } from 'bun:test';
import { scryAction, scryPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 701.22a / CR 701.25a as the engine reads them: look at the top N and put any
 * number of those cards back **in any order**. The answer is the ordered
 * keep-on-top set; everything outside it takes the other destination — bottom of
 * the library for scry, graveyard for surveil.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
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
      objects: {},
      waiting_for: waiting
    },
    derived: {},
    legal: { actions: [], spell_costs: {}, by_object: {} }
  }) as unknown as EngineSnapshot;

test('scry publishes the looked-at cards in library order', () => {
  const prompt = scryPrompt(withWaiting({ type: 'ScryChoice', data: { player: 0, cards: [400, 401] } }))!;
  expect(prompt.kind).toBe('scry');
  expect(prompt.cards).toEqual([400, 401]);
  expect(prompt.player).toBe(0);
});

test('surveil is the same shape and a different destination', () => {
  const prompt = scryPrompt(withWaiting({ type: 'SurveilChoice', data: { player: 1, cards: [403] } }, 1))!;
  // The kind is what tells the block where the rest goes; without it the two
  // prompts would be indistinguishable and one of them would lie.
  expect(prompt.kind).toBe('surveil');
  expect(prompt.player).toBe(1);
  expect(prompt.cards).toEqual([403]);
});

test('junk in the card list is dropped, and a missing list is empty', () => {
  expect(scryPrompt(withWaiting({ type: 'ScryChoice', data: { cards: [400, null, 'x'] } }))!.cards).toEqual([400]);
  expect(scryPrompt(withWaiting({ type: 'ScryChoice', data: {} }))!.cards).toEqual([]);
});

test('the answer is the ordered keep-on-top set, empty included', () => {
  expect(scryAction([401, 400])).toEqual({ type: 'SelectCards', data: { cards: [401, 400] } });
  // Empty is a legal answer: everything goes to the other destination.
  expect(scryAction([])).toEqual({ type: 'SelectCards', data: { cards: [] } });
});

test('an unrelated decision is not a scry prompt', () => {
  expect(scryPrompt(withWaiting({ type: 'RevealChoice', data: {} }))).toBeNull();
  expect(scryPrompt(null)).toBeNull();
});
