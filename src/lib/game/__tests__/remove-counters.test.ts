import { expect, test } from 'bun:test';
import { removeCountersAction, removeCountersPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 107.1c + CR 608.2d (`RemoveCountersChoice`): "remove any number of counters"
 * (Rhys, the Evermore; Tetravus) and "remove up to N counters" (Hex Parasite's
 * announced X).
 *
 * The engine publishes the **budget**: the per-type counts on the source, and — when
 * the text caps the removal — `max_total` across every kind, already bounded by what
 * is there. `None` is the uncapped "any number", and the prompt keeps that `null`
 * rather than turning it into a number nobody published.
 *
 * Counter types are flat strings on the wire (`P1P1`, `charge`, `vow`), which is what
 * the source's own `HashMap<CounterType, u32>` serializes; the object shape is
 * tolerated because older payloads wrote it.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 161,
    actions_applied: 161,
    metrics: {},
    state: {
      turn_number: 16,
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

const removeCounters = (data: Record<string, unknown> = {}) =>
  withWaiting({
    type: 'RemoveCountersChoice',
    data: {
      player: 0,
      source_id: 378,
      counter_type: null,
      available: [
        ['P1P1', 3],
        ['charge', 2]
      ],
      max_total: null,
      ...data
    }
  });

test('the prompt publishes the pool and the cap the engine resolved', () => {
  const prompt = removeCountersPrompt(removeCounters())!;
  expect(prompt.sourceId).toBe(378);
  expect(prompt.counterType).toBeNull();
  expect(prompt.available).toEqual([
    { type: 'P1P1', count: 3 },
    { type: 'charge', count: 2 }
  ]);
  // CR 107.1c: "any number" carries no cap, and the prompt keeps that as `null`.
  expect(prompt.maxTotal).toBeNull();
});

test('"up to N" keeps the engine\'s number, including zero', () => {
  expect(removeCountersPrompt(removeCounters({ max_total: 2 }))!.maxTotal).toBe(2);
  // Hex Parasite with X = 0 would not prompt at all, but a zero cap is still a
  // published number and is not "no cap".
  expect(removeCountersPrompt(removeCounters({ max_total: 0 }))!.maxTotal).toBe(0);
  expect(removeCountersPrompt(removeCounters({ max_total: -1 }))!.maxTotal).toBe(0);
});

test('a narrowed effect names the one kind it removes', () => {
  // Tetravus: "remove any number of +1/+1 counters from this creature".
  const prompt = removeCountersPrompt(
    removeCounters({ counter_type: 'P1P1', available: [['P1P1', 3]], max_total: null })
  )!;
  expect(prompt.counterType).toBe('P1P1');
  expect(prompt.available).toEqual([{ type: 'P1P1', count: 3 }]);
});

test('counter types keep the engine\'s word, flat or wrapped', () => {
  const prompt = removeCountersPrompt(
    removeCounters({
      counter_type: { Generic: 'vow' },
      available: [
        [{ Generic: 'vow' }, 1],
        ['loyalty', 4]
      ]
    })
  )!;
  expect(prompt.counterType).toBe('vow');
  expect(prompt.available).toEqual([
    { type: 'vow', count: 1 },
    { type: 'loyalty', count: 4 }
  ]);
});

test('junk entries are dropped instead of becoming a nameless counter', () => {
  const prompt = removeCountersPrompt(
    removeCounters({
      available: [['P1P1', 3], [null, 2], ['charge'], ['', 1], [{ Weird: 'x' }, 1], 'P1P1']
    })
  )!;
  expect(prompt.available).toEqual([{ type: 'P1P1', count: 3 }]);
});

test('a narrowed kind that is not a counter is no kind at all', () => {
  const prompt = removeCountersPrompt(removeCounters({ counter_type: { Weird: 'x' } }))!;
  expect(prompt.counterType).toBeNull();
});

test('the defaults fall back to the viewer seat and a missing source', () => {
  const prompt = removeCountersPrompt(removeCounters({ player: undefined, source_id: undefined }))!;
  expect(prompt.player).toBe(0);
  expect(prompt.sourceId).toBe(0);
});

test('the answer is one entry per kind, with the engine\'s field names', () => {
  expect(
    removeCountersAction([
      { counterType: 'P1P1', count: 2 },
      { counterType: 'charge', count: 1 }
    ])
  ).toEqual({
    type: 'ChooseCountersToRemove',
    data: {
      selections: [
        { counter_type: 'P1P1', count: 2 },
        { counter_type: 'charge', count: 1 }
      ]
    }
  });
  // CR 107.1c: the empty selection removes nothing, and that is a legal answer.
  expect(removeCountersAction([]).data).toEqual({ selections: [] });
});

test('another prompt is not this block', () => {
  expect(removeCountersPrompt(withWaiting({ type: 'MoveCountersDistribution', data: {} }))).toBeNull();
  expect(removeCountersPrompt(withWaiting({ type: 'KeepExactPermanentsChoice', data: {} }))).toBeNull();
  expect(removeCountersPrompt(null)).toBeNull();
});
