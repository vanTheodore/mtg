import { expect, test } from 'bun:test';
import { searchPrompt, searchReady, selectCardsAction } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 701.23: the library is a hidden zone, so Phase publishes the legal
 * choices. The distinction the rules draw — and that a naive port flattens —
 * is CR 701.23b/701.23d: a stated-quality search may find fewer cards, even
 * none, while a quantity search must find as many as it can.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 42,
    revision: 7,
    actions_applied: 7,
    metrics: {},
    state: {
      turn_number: 3,
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

const search = (data: Record<string, unknown> = {}) => ({
  type: 'SearchChoice',
  data: { player: 0, cards: [400, 401, 402], count: 1, ...data }
});

test('the prompt repeats the legal choices and the window', () => {
  expect(searchPrompt(withWaiting(search({ reveal: true, library_owner: 1 })))).toEqual({
    player: 0,
    cards: [400, 401, 402],
    count: 1,
    partial: false,
    reveal: true,
    owner: 1
  });
});

test('there is no search prompt for another kind of decision', () => {
  expect(searchPrompt(withWaiting({ type: 'Priority', data: { player: 0 } }))).toBeNull();
  expect(searchPrompt(withWaiting({ type: 'DigChoice', data: { player: 0, cards: [] } }))).toBeNull();
  expect(searchPrompt(null)).toBeNull();
});

test('CR 701.23b: a stated-quality search may find nothing', () => {
  // `up_to` and `allows_partial_find` both widen the window…
  expect(searchPrompt(withWaiting(search({ up_to: true })))?.partial).toBe(true);
  expect(searchPrompt(withWaiting(search({ allows_partial_find: true })))?.partial).toBe(true);
  // …and so does any real selection constraint, whatever those two fields say:
  // `SearchSelectionConstraint::permits_partial_find` is "not None".
  for (const constraint of ['SharesQualities', 'TotalManaValue', 'MatchEachFilter']) {
    const prompt = searchPrompt(withWaiting(search({ constraint: { type: constraint } })));
    expect(prompt?.partial).toBe(true);
  }
  expect(searchPrompt(withWaiting(search({ constraint: { type: 'None' } })))?.partial).toBe(false);
  expect(searchPrompt(withWaiting(search({ constraint: 'None' })))?.partial).toBe(false);
});

test('a quantity search demands exactly the count it published', () => {
  const prompt = searchPrompt(withWaiting(search({ count: 2 })))!;
  expect(searchReady(prompt, [])).toBe(false);
  expect(searchReady(prompt, [400])).toBe(false);
  expect(searchReady(prompt, [400, 401])).toBe(true);
  expect(searchReady(prompt, [400, 401, 402])).toBe(false);
  // A card the engine did not offer is never an answer.
  expect(searchReady(prompt, [400, 999])).toBe(false);
});

test('a partial search accepts fewer, including none, but never more', () => {
  const prompt = searchPrompt(withWaiting(search({ count: 2, up_to: true })))!;
  expect(searchReady(prompt, [])).toBe(true);
  expect(searchReady(prompt, [400])).toBe(true);
  expect(searchReady(prompt, [400, 402])).toBe(true);
  expect(searchReady(prompt, [400, 401, 402])).toBe(false);
  expect(searchReady(prompt, [999])).toBe(false);
});

test('the answer is a SelectCards with a copy of the chosen cards', () => {
  const cards = [401];
  const action = selectCardsAction(cards);
  expect(action).toEqual({ type: 'SelectCards', data: { cards: [401] } });
  cards.push(400);
  expect(action).toEqual({ type: 'SelectCards', data: { cards: [401] } });
  // A search that finds nothing is still a real answer to the engine.
  expect(selectCardsAction([])).toEqual({ type: 'SelectCards', data: { cards: [] } });
});
