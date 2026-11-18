import { expect, test } from 'bun:test';
import { decideOptionalCostAction, defilerPaymentPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 601.2b: `DefilerPayment`. The quote is the engine's. The answer is
 * `DecideOptionalCost`, but the index is not the optional-cost list: 0 pays
 * (`index == 0`) and 1 declines. A missing `reach` is the default spill, not
 * the Defiler cycle's colored-only rider — that one is published.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 4,
    revision: 8,
    actions_applied: 8,
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

const green = { type: 'Cost', shards: ['Green'], generic: 0 };

test('CR 601.2b: the colored-only reduction is the published quote, not a recomputed one', () => {
  const prompt = defilerPaymentPrompt(
    withWaiting({
      type: 'DefilerPayment',
      data: {
        player: 0,
        life_cost: 2,
        mana_reduction: green,
        reach: 'ColoredManaOnly',
        pending_cast: { object_id: 424 }
      }
    })
  )!;
  expect(prompt.player).toBe(0);
  expect(prompt.lifeCost).toBe(2);
  expect(prompt.manaReduction).toBe(green);
  expect(prompt.reach).toBe('colored');
  expect(prompt.spellId).toBe(424);
});

test('an omitted reach is the spill default, and a wrapped discriminant still reads', () => {
  const omitted = defilerPaymentPrompt(
    withWaiting({
      type: 'DefilerPayment',
      data: {
        player: 1,
        life_cost: 2,
        mana_reduction: { type: 'Cost', shards: ['Blue'], generic: 1 },
        pending_cast: { object_id: 425 }
      }
    })
  )!;
  expect(omitted.reach).toBe('spill');
  expect(omitted.player).toBe(1);
  expect(omitted.manaReduction).toEqual({ type: 'Cost', shards: ['Blue'], generic: 1 });
  const wrapped = defilerPaymentPrompt(
    withWaiting({
      type: 'DefilerPayment',
      data: {
        player: 0,
        life_cost: 2,
        mana_reduction: green,
        reach: { type: 'ColoredManaOnly' },
        pending_cast: { object_id: 1 }
      }
    })
  )!;
  expect(wrapped.reach).toBe('colored');
  const explicit = defilerPaymentPrompt(
    withWaiting({
      type: 'DefilerPayment',
      data: {
        player: 0,
        life_cost: 2,
        mana_reduction: green,
        reach: 'SpillsToGeneric',
        pending_cast: { object_id: 1 }
      }
    })
  )!;
  expect(explicit.reach).toBe('spill');
});

test('a missing price stays missing, and an unknown reach is not assumed', () => {
  const prompt = defilerPaymentPrompt(
    withWaiting({
      type: 'DefilerPayment',
      data: {
        reach: 'GenericOnly',
        pending_cast: {}
      }
    }, 1)
  )!;
  expect(prompt.lifeCost).toBeNull();
  expect(prompt.manaReduction).toBeNull();
  expect(prompt.reach).toBe('unknown');
  expect(prompt.spellId).toBeNull();
  expect(prompt.player).toBe(1);
  // A string is not a life total.
  const text = defilerPaymentPrompt(
    withWaiting({
      type: 'DefilerPayment',
      data: { player: 0, life_cost: '2', mana_reduction: green, pending_cast: { object_id: 1 } }
    })
  )!;
  expect(text.lifeCost).toBeNull();
});

test('the same index envelope answers both windows, and a neighbour is not a Defiler', () => {
  expect(decideOptionalCostAction(0)).toEqual({ type: 'DecideOptionalCost', data: { index: 0 } });
  expect(decideOptionalCostAction(1)).toEqual({ type: 'DecideOptionalCost', data: { index: 1 } });
  expect(defilerPaymentPrompt(withWaiting({ type: 'OptionalCostChoice', data: {} }))).toBeNull();
  expect(defilerPaymentPrompt(null)).toBeNull();
});
