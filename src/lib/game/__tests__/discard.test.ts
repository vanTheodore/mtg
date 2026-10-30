import { expect, test } from 'bun:test';
import { discardPrompt, discardSelection } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * The cleanup discard (CR 514.1) is the decision that froze the interface in
 * the browser suite: Phase asked the active player to discard down to seven
 * cards and the interface had to answer with exactly the cards Phase had
 * published. These tests pin that contract without an engine.
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
      phase: 'Cleanup',
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

test('the discard prompt repeats what Phase published, card for card', () => {
  const prompt = discardPrompt(
    withWaiting({ type: 'DiscardToHandSize', data: { player: 0, count: 2, cards: [41, 42, 43] } })
  );
  expect(prompt).toEqual({ count: 2, cards: [41, 42, 43], player: 0 });
});

test('a prompt without a player belongs to the seat being shown', () => {
  const prompt = discardPrompt(withWaiting({ type: 'DiscardToHandSize', data: { count: 1, cards: [7] } }, 1));
  expect(prompt).toEqual({ count: 1, cards: [7], player: 1 });
});

test('a connive discard is a discard', () => {
  const prompt = discardPrompt(withWaiting({ type: 'ConniveDiscard', data: { player: 1, count: 1, cards: [9] } }, 1));
  expect(prompt).toEqual({ count: 1, cards: [9], player: 1 });
});

test('there is no discard when the engine is not asking for one', () => {
  expect(discardPrompt(withWaiting({ type: 'Priority', data: { player: 0 } }))).toBeNull();
  expect(discardPrompt(withWaiting({ type: 'DeclareBlockers', data: { player: 1 } }))).toBeNull();
  expect(discardPrompt(null)).toBeNull();
});

test('the answer is a SelectCards with exactly the chosen cards', () => {
  expect(discardSelection([41, 43])).toEqual({ type: 'SelectCards', data: { cards: [41, 43] } });
});
