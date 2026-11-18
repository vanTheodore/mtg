import { expect, test } from 'bun:test';
import { chooseStartingPlayer, startingPlayerPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 103.1: the roll decides **who chooses** who takes the first turn. The
 * engine already ran the contest; it publishes the chooser and the seats it will
 * accept, in seat order. CR 103.1a: under shared team turns a candidate is a
 * team's representative, so the list is not "the other people".
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 1,
    actions_applied: 1,
    metrics: {},
    state: {
      turn_number: 1,
      active_player: viewer,
      priority_player: viewer,
      phase: 'Beginning',
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

const prompt = (data: Record<string, unknown> = {}) =>
  withWaiting({ type: 'ChooseStartingPlayer', data: { player: 1, candidates: [0, 1], ...data } });

test('the chooser is the roll winner, not the seat that will start', () => {
  const p = startingPlayerPrompt(prompt())!;
  expect(p.player).toBe(1);
  expect(p.candidates).toEqual([0, 1]);
});

test('the candidates keep the engine order and are not re-sorted', () => {
  expect(startingPlayerPrompt(prompt({ candidates: [2, 0, 1] }))!.candidates).toEqual([2, 0, 1]);
});

test('junk in the list is dropped, not coerced', () => {
  expect(startingPlayerPrompt(prompt({ candidates: [0, null, 'x', 1] }))!.candidates).toEqual([0, 1]);
  expect(startingPlayerPrompt(prompt({ candidates: undefined }))!.candidates).toEqual([]);
});

test('the answer names one seat', () => {
  expect(chooseStartingPlayer(1)).toEqual({ type: 'ChooseStartingPlayer', data: { player: 1 } });
});

test('another decision is not this prompt', () => {
  expect(startingPlayerPrompt(withWaiting({ type: 'MulliganDecision', data: {} }))).toBeNull();
  expect(startingPlayerPrompt(null)).toBeNull();
});
