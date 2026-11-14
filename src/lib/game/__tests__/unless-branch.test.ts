import { expect, test } from 'bun:test';
import { unlessBranchPrompt, unlessCostLabel, chooseUnlessCostBranch } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 118.12a: the disjunctive unless-cost — "unless they X or Y". Unlike
 * `UnlessPayment` (pay or not, one cost), here the question is *which* cost, and
 * declining is a third answer that runs the effect.
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

const choose = (data: Record<string, unknown> = {}) =>
  withWaiting({
    type: 'UnlessPaymentChooseCost',
    data: {
      player: 0,
      costs: [
        { type: 'Sacrifice', target: { type: 'Typed', type_filters: ['Permanent'] }, count: 1 },
        { type: 'Discard', count: { type: 'Fixed', value: 1 }, filter: null }
      ],
      pending_ability: { ability: {} },
      effect_description: 'pierde 3 vidas',
      ...data
    }
  });

test('each branch is named by its own kind and count', () => {
  const prompt = unlessBranchPrompt(choose())!;
  expect(prompt.branches).toEqual([
    { index: 0, label: 'Sacrificar 1 permanente' },
    { index: 1, label: 'Descartar 1 carta' }
  ]);
  expect(prompt.effect).toBe('pierde 3 vidas');
  expect(prompt.player).toBe(0);
});

test('a cost the table cannot name keeps the engine position', () => {
  const prompt = unlessBranchPrompt(
    choose({ costs: [{ type: 'ExileWithAggregate', filter: null, value: 15 }] })
  )!;
  expect(prompt.branches).toEqual([{ index: 0, label: null }]);
});

test('the count comes from the engine, never assumed', () => {
  expect(
    unlessCostLabel({ kind: 'permanent', count: 2, noun: 'criatura que controlas' })
  ).toBe('Sacrificar 2 criatura que controlas');
  expect(unlessCostLabel({ kind: 'cards', verb: 'exiliar', count: 3 })).toBe('Exiliar 3 cartas');
  expect(unlessCostLabel({ kind: 'permanent', count: 0 })).toBeNull();
});

test('the sequence is counted from the engine queue', () => {
  const prompt = unlessBranchPrompt(choose({ chosen: [{ type: 'Tap' }], remaining_choices: [[], []] }))!;
  expect(prompt.chosen).toBe(1);
  expect(prompt.remainingChoices).toBe(2);
});

test('paying names the branch by index; declining carries no index', () => {
  expect(chooseUnlessCostBranch(1)).toEqual({
    type: 'ChooseUnlessCostBranch',
    data: { choice: { type: 'Pay', data: { index: 1 } } }
  });
  expect(chooseUnlessCostBranch(null)).toEqual({
    type: 'ChooseUnlessCostBranch',
    data: { choice: { type: 'Decline' } }
  });
});

test('the single-cost unless-payment is a different prompt', () => {
  expect(unlessBranchPrompt(withWaiting({ type: 'UnlessPayment', data: {} }))).toBeNull();
  expect(unlessBranchPrompt(null)).toBeNull();
});
