import { expect, test } from 'bun:test';
import { revealAction, revealPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 701.20a: the player shows one card from a hidden zone. The reveal-land
 * pattern (Port Town, Gilt-Leaf Palace) makes declining a real answer, and the
 * engine says whether an empty selection runs the card's other branch or simply
 * skips the follow-up — the same gesture with two different consequences.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 3,
    revision: 21,
    actions_applied: 21,
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

const reveal = (data: Record<string, unknown> = {}) => ({
  type: 'RevealChoice',
  data: { player: 0, cards: [1000, 1001, 1002], optional: true, decline_runs_continuation: true, ...data }
});

test('an optional reveal carries the cards, the decline and what declining means', () => {
  const prompt = revealPrompt(withWaiting(reveal()))!;
  expect(prompt.player).toBe(0);
  expect(prompt.cards).toEqual([1000, 1001, 1002]);
  expect(prompt.optional).toBe(true);
  // A reveal-from-hand effect runs its other branch on decline.
  expect(prompt.declineRunsContinuation).toBe(true);
});

test('a forced reveal offers no decline at all', () => {
  const prompt = revealPrompt(withWaiting(reveal({ optional: false, decline_runs_continuation: false })))!;
  expect(prompt.optional).toBe(false);
  expect(prompt.declineRunsContinuation).toBe(false);
});

test('an optional follow-up says its decline skips the next choice', () => {
  const prompt = revealPrompt(withWaiting(reveal({ decline_runs_continuation: false })))!;
  expect(prompt.optional).toBe(true);
  expect(prompt.declineRunsContinuation).toBe(false);
});

test('non-numeric card ids are dropped, not rendered as holes', () => {
  const prompt = revealPrompt(withWaiting(reveal({ cards: [1000, null, 'x', 1002] })))!;
  expect(prompt.cards).toEqual([1000, 1002]);
  // A payload without cards is still a prompt: the engine asked, it just
  // published nothing the player could pick.
  expect(revealPrompt(withWaiting(reveal({ cards: undefined })))!.cards).toEqual([]);
});

test('one card, and an empty selection for the decline', () => {
  expect(revealAction(1001)).toEqual({ type: 'SelectCards', data: { cards: [1001] } });
  expect(revealAction(null)).toEqual({ type: 'SelectCards', data: { cards: [] } });
});

test('there is no reveal prompt for another decision', () => {
  expect(revealPrompt(withWaiting({ type: 'SearchChoice', data: {} }))).toBeNull();
  expect(revealPrompt(null)).toBeNull();
});
