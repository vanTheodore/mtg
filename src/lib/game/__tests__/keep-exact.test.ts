import { expect, test } from 'bun:test';
import { keepExactAction, keepExactPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 101.4 + CR 701.21a (`KeepExactPermanentsChoice`): the player protects
 * permanents inside the engine's [minimum_count, required_count] window and every
 * other in-scope permanent is sacrificed afterwards.
 *
 * Phase v0.133.0 redefined the payload: `required_count` is an uncapped CEILING
 * (CR 609.3 is resolved by the engine, not by a display client) and
 * `minimum_count` is the FLOOR — absent/null means exactly the ceiling, `0` means
 * "up to N". Both are parsed as they arrive; the client never recomputes either
 * from `eligible.length`.
 *
 * `keeper_counter` (CR 608.2c + CR 122.1) rides along with its count already
 * resolved (CR 608.2h): Promise of Loyalty's vow counter is on the kept creature
 * **before** the rest is sacrificed, so the screen can announce it with the choice.
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

const keepExact = (data: Record<string, unknown> = {}) =>
  withWaiting({
    type: 'KeepExactPermanentsChoice',
    data: {
      player: 0,
      target_player: 0,
      eligible: [100, 101, 105, 102, 340],
      required_count: 3,
      keeper_counter: null,
      chooser_scope: 'EachPlayerSelf',
      source_id: 374,
      source_controller: 0,
      remaining_players: [1],
      all_kept: [],
      scoped_players: [0, 1],
      ...data
    }
  });

test('the prompt publishes the pool and the exact number the engine resolved', () => {
  const prompt = keepExactPrompt(keepExact())!;
  expect(prompt.eligible).toEqual([100, 101, 105, 102, 340]);
  // Razia's Purification: "chooses three permanents they control".
  expect(prompt.requiredCount).toBe(3);
  expect(prompt.keeperCounter).toBeNull();
  expect(prompt.chooserScope).toBe('self');
  expect(prompt.sourceId).toBe(374);
  expect(prompt.remainingPlayers).toEqual([1]);
  expect(prompt.keptBefore).toEqual([]);
});

test('v0.133.0: an "up to" keeper publishes floor zero and keeps the ceiling', () => {
  const prompt = keepExactPrompt(keepExact({ minimum_count: 0, required_count: 3 }))!;
  expect(prompt.requiredCount).toBe(3);
  expect(prompt.minimumCount).toBe(0);
});

test('v0.133.0: no floor (or a null one) is still the exact keeper', () => {
  expect(keepExactPrompt(keepExact())!.minimumCount).toBe(3);
  expect(keepExactPrompt(keepExact({ minimum_count: null }))!.minimumCount).toBe(3);
});

test('v0.133.0: a floor is clamped to the ceiling and never negative', () => {
  expect(keepExactPrompt(keepExact({ minimum_count: -2 }))!.minimumCount).toBe(0);
  expect(keepExactPrompt(keepExact({ minimum_count: 9 }))!.minimumCount).toBe(3);
  expect(keepExactPrompt(keepExact({ minimum_count: 1.9 }))!.minimumCount).toBe(1);
});

test('v0.133.0: the ceiling is the printed number, not the eligible pool size', () => {
  const prompt = keepExactPrompt(keepExact({ eligible: [100], required_count: 5 }))!;
  expect(prompt.requiredCount).toBe(5);
  expect(prompt.minimumCount).toBe(5);
  expect(prompt.eligible).toEqual([100]);
});

test('`count` is the older alias of the same figure', () => {
  const prompt = keepExactPrompt(keepExact({ required_count: undefined, count: 2 }))!;
  expect(prompt.requiredCount).toBe(2);
});

test('a figure the payload omits is zero, never a guess from the pool', () => {
  // The pool is five; the screen still reports the absent number as zero rather
  // than inventing 5 (or 1) out of `eligible.length`.
  const prompt = keepExactPrompt(keepExact({ required_count: undefined }))!;
  expect(prompt.requiredCount).toBe(0);
  expect(prompt.eligible).toHaveLength(5);
});

test('the keeper mark keeps its own resolved count, and the engine its word', () => {
  // Promise of Loyalty on the wire: `CounterType::Generic("vow")` × 1.
  const prompt = keepExactPrompt(keepExact({ keeper_counter: [{ Generic: 'vow' }, 1] }))!;
  expect(prompt.keeperCounter).toEqual({ type: 'vow', count: 1 });
  // A flat string reaches the same place, and the count is the payload's.
  const flat = keepExactPrompt(keepExact({ keeper_counter: ['vow', 2] }))!;
  expect(flat.keeperCounter).toEqual({ type: 'vow', count: 2 });
});

test('a mark that names no counter type is not reported as one', () => {
  expect(keepExactPrompt(keepExact({ keeper_counter: [{ Weird: 'x' }, 1] }))!.keeperCounter).toBeNull();
  expect(keepExactPrompt(keepExact({ keeper_counter: 'vow' }))!.keeperCounter).toBeNull();
  expect(keepExactPrompt(keepExact({ keeper_counter: [null, 1] }))!.keeperCounter).toBeNull();
});

test('`ControllerForAll` keeps on behalf of every player in scope', () => {
  const prompt = keepExactPrompt(
    keepExact({ chooser_scope: 'ControllerForAll', target_player: 1, remaining_players: [], all_kept: [200] })
  )!;
  expect(prompt.chooserScope).toBe('forAll');
  expect(prompt.targetPlayer).toBe(1);
  expect(prompt.remainingPlayers).toEqual([]);
  expect(prompt.keptBefore).toEqual([200]);
});

test('junk ids are dropped, and a negative figure never travels as one', () => {
  const prompt = keepExactPrompt(keepExact({ eligible: [100, null, 'x', '101'], required_count: -2 }))!;
  expect(prompt.eligible).toEqual([100]);
  expect(prompt.requiredCount).toBe(0);
});

test('the defaults fall back to the viewer seat', () => {
  const prompt = keepExactPrompt(keepExact({ player: undefined, target_player: undefined, source_id: undefined }))!;
  expect(prompt.player).toBe(0);
  expect(prompt.targetPlayer).toBe(0);
  expect(prompt.sourceId).toBeNull();
});

test('the answer is the kept set, in the chosen order, under the engine action', () => {
  expect(keepExactAction([105, 100, 340])).toEqual({
    type: 'ChooseKeptPermanents',
    data: { kept: [105, 100, 340] }
  });
});

test('another prompt is not this block', () => {
  expect(keepExactPrompt(withWaiting({ type: 'KeepWithinTotalPowerChoice', data: {} }))).toBeNull();
  expect(keepExactPrompt(withWaiting({ type: 'CategoryChoice', data: {} }))).toBeNull();
  expect(keepExactPrompt(null)).toBeNull();
});
