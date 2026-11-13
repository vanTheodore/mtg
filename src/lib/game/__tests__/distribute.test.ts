import { expect, test } from 'bun:test';
import { distributeAction, distributePrompt, evenSplit, targetKey } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 601.2d / CR 608.2d: a division of an amount among recipients. The engine
 * publishes the amount, the recipients and **when** the division is chosen, and a
 * single validator enforces the sum, that no portion is zero, that no recipient
 * repeats, and that an announce-time division names every target.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 91,
    actions_applied: 91,
    metrics: {},
    state: {
      turn_number: 9,
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

const resolution = { type: 'ResolutionCandidates', data: { pending_effect: { ability: {} } } };

test('a resolution-time division allows leaving candidates out', () => {
  const prompt = distributePrompt(
    withWaiting({
      type: 'DistributeAmong',
      data: {
        player: 0,
        total: 5,
        targets: [{ Object: 100 }, { Object: 101 }, { Player: 1 }],
        unit: { type: 'Damage' },
        scope: resolution
      }
    })
  )!;
  expect(prompt.total).toBe(5);
  expect(prompt.unit).toBe('damage');
  expect(prompt.scope).toBe('resolution');
  // Players are recipients too: a division does not only name permanents.
  expect(prompt.targets).toEqual([{ Object: 100 }, { Object: 101 }, { Player: 1 }]);
});

test('an absent scope is the announce-time division', () => {
  const prompt = distributePrompt(
    withWaiting({ type: 'DistributeAmong', data: { total: 4, targets: [{ Object: 100 }], unit: { type: 'Damage' } } })
  )!;
  // CR 601.2d is the wire default, which is why the field is skipped upstream.
  expect(prompt.scope).toBe('announced');
});

test('the unit is read from the engine, counters included', () => {
  const counters = distributePrompt(
    withWaiting({
      type: 'DistributeAmong',
      data: { total: 3, targets: [], unit: { type: 'Counters', data: '+1/+1' } }
    })
  )!;
  expect(counters.unit).toBe('counters');
  expect(counters.counterType).toBe('+1/+1');
  // Even split is a unit with no choice in it, not a damage division.
  const even = distributePrompt(
    withWaiting({ type: 'DistributeAmong', data: { total: 4, targets: [{ Object: 100 }], unit: { type: 'EvenSplitDamage' } } })
  )!;
  expect(even.unit).toBe('even');
  expect(even.counterType).toBeNull();
  const life = distributePrompt(
    withWaiting({ type: 'DistributeAmong', data: { total: 6, targets: [], unit: { type: 'Life' } } })
  )!;
  expect(life.unit).toBe('life');
});

test('junk in the recipient list is dropped and a missing list is empty', () => {
  expect(
    distributePrompt(
      withWaiting({
        type: 'DistributeAmong',
        data: { total: 2, targets: [{ Object: 100 }, { Nope: 1 }, 7], unit: { type: 'Damage' } }
      })
    )!.targets
  ).toEqual([{ Object: 100 }]);
  expect(
    distributePrompt(withWaiting({ type: 'DistributeAmong', data: { total: 2, unit: { type: 'Life' } } }))!.targets
  ).toEqual([]);
});

test('recipients are keyed by kind, so a player and an object do not collide', () => {
  expect(targetKey({ Object: 1 })).toBe('object:1');
  expect(targetKey({ Player: 1 })).toBe('player:1');
  expect(targetKey({ Nope: 1 })).toBe('none');
});

test('the answer is the list of portions, in the engine shape', () => {
  const entries: [{ Object: number }, number][] = [[{ Object: 100 }, 3], [{ Object: 101 }, 2]];
  const action = distributeAction(entries as never);
  expect(action.type).toBe('DistributeAmong');
  // `Vec<(TargetRef, u32)>` is a list of two-element arrays on the wire.
  expect(action.data).toEqual({ distribution: [[{ Object: 100 }, 3], [{ Object: 101 }, 2]] });
});

test('the even split is the engine rule: floor, remainder last, never a zero', () => {
  expect(evenSplit(5, 2)).toEqual([2, 3]);
  expect(evenSplit(4, 2)).toEqual([2, 2]);
  expect(evenSplit(7, 3)).toEqual([2, 2, 3]);
  // Fewer points than recipients cannot satisfy "at least one each".
  expect(evenSplit(2, 3)).toBeNull();
  expect(evenSplit(0, 0)).toEqual([]);
  expect(evenSplit(1, 0)).toBeNull();
});

test('another prompt is not this block', () => {
  expect(distributePrompt(withWaiting({ type: 'MultiTargetSelection', data: { legal_targets: [] } }))).toBeNull();
  expect(distributePrompt(withWaiting({ type: 'PayAmountChoice', data: { min: 1, max: 3 } }))).toBeNull();
  expect(distributePrompt(null)).toBeNull();
});
