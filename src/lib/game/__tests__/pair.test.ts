import { expect, test } from 'bun:test';
import { choosePair, pairPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 702.95a + CR 608.2d: soulbond. The pairing is optional, so `ChoosePair
 * { partner: None }` is an answer the engine offers — the prompt must not treat
 * "no partner" as an unanswered question.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 11,
    revision: 40,
    actions_applied: 40,
    metrics: {},
    state: {
      turn_number: 2,
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

const pair = (data: Record<string, unknown> = {}) => ({
  type: 'PairChoice',
  data: { player: 0, source_id: 100, choices: [101, 105], ...data }
});

test('a pairing prompt carries the creature and the legal partners', () => {
  const prompt = pairPrompt(withWaiting(pair()))!;
  expect(prompt.player).toBe(0);
  expect(prompt.sourceId).toBe(100);
  expect(prompt.choices).toEqual([101, 105]);
});

test('partners the engine did not publish are dropped', () => {
  const prompt = pairPrompt(withWaiting(pair({ choices: [101, null, 'x', 105] })))!;
  expect(prompt.choices).toEqual([101, 105]);
  // No legal partner is a prompt with an empty list, not a missing prompt.
  expect(pairPrompt(withWaiting(pair({ choices: undefined })))!.choices).toEqual([]);
});

test('both answers are the engine action: a partner or none', () => {
  expect(choosePair(105)).toEqual({ type: 'ChoosePair', data: { partner: 105 } });
  expect(choosePair(null)).toEqual({ type: 'ChoosePair', data: { partner: null } });
});

test('there is no pairing prompt for another decision', () => {
  expect(pairPrompt(withWaiting({ type: 'RevealChoice', data: {} }))).toBeNull();
  expect(pairPrompt(null)).toBeNull();
});
