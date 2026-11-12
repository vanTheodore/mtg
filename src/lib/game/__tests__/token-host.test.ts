import { expect, test } from 'bun:test';
import { chooseTokenHost, tokenHostPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * Digital-only Alchemy (no CR entry): a batch entry stamps several hosts and the
 * controller picks one. The engine is explicit that this is a CHOICE, not a
 * target — hexproof/shroud/protection never filtered `legal_targets` — and the
 * answer is the `ChooseTarget` the engine lists.
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
      turn_number: 6,
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

const host = (data: Record<string, unknown> = {}) => ({
  type: 'ChooseTokenHost',
  data: { player: 0, source_id: 100, legal_targets: [{ Object: 101 }, { Object: 105 }], ...data }
});

test('the prompt publishes the hosts the engine left legal', () => {
  const prompt = tokenHostPrompt(withWaiting(host()))!;
  expect(prompt.player).toBe(0);
  expect(prompt.sourceId).toBe(100);
  expect(prompt.hosts).toEqual([{ Object: 101 }, { Object: 105 }]);
});

test('a player can be a host too — the engine decides, not the shape', () => {
  const prompt = tokenHostPrompt(withWaiting(host({ legal_targets: [{ Player: 1 }] })))!;
  expect(prompt.hosts).toEqual([{ Player: 1 }]);
});

test('an absent list is an empty prompt, not a missing one', () => {
  expect(tokenHostPrompt(withWaiting(host({ legal_targets: undefined })))!.hosts).toEqual([]);
});

test('the answer is the ChooseTarget the engine listed', () => {
  expect(chooseTokenHost({ Object: 105 })).toEqual({
    type: 'ChooseTarget',
    data: { target: { Object: 105 } }
  });
});

test('there is no host prompt for another decision', () => {
  expect(tokenHostPrompt(withWaiting({ type: 'PairChoice', data: {} }))).toBeNull();
  expect(tokenHostPrompt(null)).toBeNull();
});
