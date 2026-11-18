import { expect, test } from 'bun:test';
import { defaultOrder, moveInOrder, orderTriggersAction, triggerOrderPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 603.3b: ordering simultaneous triggers is the controller's choice, and
 * Phase accepts a permutation of the summaries it published. These tests pin
 * the contract without an engine — the UI never invents a trigger and never
 * sends an order it did not build by moving rows.
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

const triggers = [
  { source_id: 1000, source_name: 'Soul Warden', description: 'Ganas 1 vida.' },
  { source_id: 1001, source_name: "Ajani's Pridemate", description: 'Pon un contador +1/+1.' }
];

test('the prompt repeats the summaries the engine derived, in its order', () => {
  expect(triggerOrderPrompt(withWaiting({ type: 'OrderTriggers', data: { player: 1, triggers } }))).toEqual({
    player: 1,
    triggers: [
      { sourceId: 1000, name: 'Soul Warden', description: 'Ganas 1 vida.' },
      { sourceId: 1001, name: "Ajani's Pridemate", description: 'Pon un contador +1/+1.' }
    ]
  });
});

test('a prompt without triggers is not an order to build', () => {
  expect(triggerOrderPrompt(withWaiting({ type: 'OrderTriggers', data: { player: 0, triggers: [] } }))).toBeNull();
  expect(triggerOrderPrompt(withWaiting({ type: 'Priority', data: { player: 0 } }))).toBeNull();
  expect(triggerOrderPrompt(null)).toBeNull();
});

test('the list opens in the order the engine published', () => {
  expect(defaultOrder(0)).toEqual([]);
  expect(defaultOrder(3)).toEqual([0, 1, 2]);
});

test('moving a trigger keeps every index exactly once', () => {
  expect(moveInOrder([0, 1, 2], 0, 1)).toEqual([1, 0, 2]);
  expect(moveInOrder([0, 1, 2], 2, 0)).toEqual([2, 0, 1]);
  // Out of bounds and no-ops return the same array: nothing to resend.
  const order = [0, 1, 2];
  expect(moveInOrder(order, 1, 1)).toBe(order);
  expect(moveInOrder(order, 0, -1)).toBe(order);
  expect(moveInOrder(order, 0, 3)).toBe(order);
});

test('the answer is the permutation, and it is copied', () => {
  const order = [2, 0, 1];
  const action = orderTriggersAction(order);
  expect(action).toEqual({ type: 'OrderTriggers', data: { order: [2, 0, 1] } });
  order.push(9);
  expect(action).toEqual({ type: 'OrderTriggers', data: { order: [2, 0, 1] } });
});
