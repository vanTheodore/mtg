import { expect, test } from 'bun:test';
import { chooseXAction, defaultX, parseX, xCost, xPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 107.3a: the caster announces X, and the engine owns the window it may
 * announce. These tests pin the contract without an engine: the prompt repeats
 * what Phase published, the entry is rejected rather than clamped, and the
 * answer is the bare `ChooseX` the engine offers.
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
      objects: { '320': { id: 320, name: 'Fireball' } },
      waiting_for: waiting
    },
    derived: {},
    legal: { actions: [], spell_costs: {}, by_object: {} }
  }) as unknown as EngineSnapshot;

/** `Vec<(u32, ManaCost)>` on the engine side: an array of two-element tuples. */
const previews: [number, unknown][] = [
  [2, { type: 'Cost', generic: 3, shards: ['Red'] }],
  [5, { type: 'Cost', generic: 6, shards: ['Red'] }]
];
const fireball = {
  type: 'ChooseXValue',
  data: {
    player: 0,
    min: 2,
    max: 5,
    pending_cast: { object_id: 320, cost: { type: 'Cost', generic: 1, shards: ['Red'] } },
    x_cost_previews: previews
  }
};

test('the X prompt repeats the window, the spell and the previews Phase sent', () => {
  const prompt = xPrompt(withWaiting(fireball));
  expect(prompt).toEqual({
    player: 0,
    min: 2,
    max: 5,
    objectId: 320,
    cost: { type: 'Cost', generic: 1, shards: ['Red'] },
    previews
  });
});

test('there is no X prompt when the engine is asking something else', () => {
  expect(xPrompt(withWaiting({ type: 'Priority', data: { player: 0 } }))).toBeNull();
  expect(xPrompt(withWaiting({ type: 'DiscardChoice', data: { player: 0, count: 1, cards: [] } }))).toBeNull();
  expect(xPrompt(null)).toBeNull();
});

test('the box opens at the engine minimum, never below zero', () => {
  expect(defaultX({ min: 2, max: 5 })).toBe(2);
  expect(defaultX({ min: 0, max: 5 })).toBe(0);
  // An impossible window has no legal default; the panel renders nothing.
  expect(defaultX({ min: 5, max: 2 })).toBe(0);
});

test('an entry outside the window is refused, not clamped', () => {
  expect(parseX('3', 2, 5)).toBe(3);
  expect(parseX('2', 2, 5)).toBe(2);
  expect(parseX('5', 2, 5)).toBe(5);
  expect(parseX('6', 2, 5)).toBeNull();
  expect(parseX('1', 2, 5)).toBeNull();
  expect(parseX('99', 2, 5)).toBeNull();
  // `Number()` alone would take all of these: 0, 7, 1.5, 1000, 2, 16.
  for (const raw of ['', ' 7 ', '1.5', '1e3', '+2', '0x10', '-1']) expect(parseX(raw, 0, 100)).toBeNull();
});

test('the cost shown is the one the engine published for that X', () => {
  const prompt = xPrompt(withWaiting(fireball))!;
  expect(xCost(prompt, 5)).toEqual({ type: 'Cost', generic: 6, shards: ['Red'] });
  // No preview for 3: the cast's own cost is the honest fallback.
  expect(xCost(prompt, 3)).toEqual({ type: 'Cost', generic: 1, shards: ['Red'] });
  // While the entry is invalid there is no announced X, so no cost at all.
  expect(xCost(prompt, null)).toBeNull();
});

test('the answer is a bare ChooseX with the announced value', () => {
  expect(chooseXAction(4)).toEqual({ type: 'ChooseX', data: { value: 4 } });
  expect(chooseXAction(0)).toEqual({ type: 'ChooseX', data: { value: 0 } });
});
