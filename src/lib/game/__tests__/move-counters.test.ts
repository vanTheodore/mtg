import { expect, test } from 'bun:test';
import { counterLabel, moveCountersAction, moveCountersPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 122.5 + CR 608.2d: "move any number of counters". The pool on the source is
 * the ceiling — not a fixed total — and the engine's validator refuses a zero
 * count, a destination outside its list, a repeated (destination, type) pair and
 * any request above what is left *of that type*. Moving nothing is legal.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 101,
    actions_applied: 101,
    metrics: {},
    state: {
      turn_number: 10,
      active_player: viewer,
      priority_player: viewer,
      phase: 'Upkeep',
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

test('the prompt publishes the source, the pool by type and the destinations', () => {
  const prompt = moveCountersPrompt(
    withWaiting({
      type: 'MoveCountersDistribution',
      data: {
        player: 0,
        source_id: 344,
        available: [['P1P1', 3]],
        destinations: [100, 105, 200],
        pending_effect: { ability: {} }
      }
    })
  )!;
  expect(prompt.sourceId).toBe(344);
  expect(prompt.available).toEqual([{ type: 'P1P1', count: 3 }]);
  expect(prompt.destinations).toEqual([100, 105, 200]);
  // No narrowing sent by the engine: the block does not claim one.
  expect(prompt.counterType).toBeNull();
});

test('a narrowed move carries the counter type the engine named', () => {
  const prompt = moveCountersPrompt(
    withWaiting({
      type: 'MoveCountersDistribution',
      data: { source_id: 344, counter_type: 'P1P1', available: [['P1P1', 1]], destinations: [100] }
    })
  )!;
  expect(prompt.counterType).toBe('P1P1');
});

test('several types are kept apart, and junk is dropped', () => {
  const prompt = moveCountersPrompt(
    withWaiting({
      type: 'MoveCountersDistribution',
      data: {
        source_id: 344,
        available: [['P1P1', 2], ['loyalty', 1], ['nope'], [3, 1], null],
        destinations: [100, null, 'x', 200]
      }
    })
  )!;
  expect(prompt.available).toEqual([
    { type: 'P1P1', count: 2 },
    { type: 'loyalty', count: 1 }
  ]);
  expect(prompt.destinations).toEqual([100, 200]);
});

test('the answer is one entry per destination and type, with the engine keys', () => {
  expect(
    moveCountersAction([
      { destinationId: 100, counterType: 'P1P1', count: 2 },
      { destinationId: 200, counterType: 'P1P1', count: 1 }
    ])
  ).toEqual({
    type: 'ChooseCounterMoveDistribution',
    data: {
      selections: [
        { destination_id: 100, counter_type: 'P1P1', count: 2 },
        { destination_id: 200, counter_type: 'P1P1', count: 1 }
      ]
    }
  });
  // Moving nothing is a legal answer, and it is an empty list, not a zero count.
  expect(moveCountersAction([]).data).toEqual({ selections: [] });
});

test('the counter vocabulary knows the wire spellings and leaves the rest raw', () => {
  expect(counterLabel('P1P1')).toBe('+1/+1');
  expect(counterLabel('M1M1')).toBe('−1/−1');
  expect(counterLabel('loyalty')).toBe('lealtad');
  expect(counterLabel('flying')).toBe('vuelo');
  // PascalCase still resolves: the older payloads use it.
  expect(counterLabel('PlusOnePlusOne')).toBe('+1/+1');
  // An unknown counter keeps the engine's own word instead of a guess.
  expect(counterLabel('quest')).toBe('quest');
});

test('another prompt is not this block', () => {
  expect(moveCountersPrompt(withWaiting({ type: 'DistributeAmong', data: { total: 1 } }))).toBeNull();
  expect(moveCountersPrompt(withWaiting({ type: 'RemoveCountersChoice', data: { available: [] } }))).toBeNull();
  expect(moveCountersPrompt(null)).toBeNull();
});
