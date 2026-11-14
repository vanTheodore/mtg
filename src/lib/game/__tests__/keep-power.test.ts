import { expect, test } from 'bun:test';
import { keepPowerAction, keepPowerPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 107.1c + CR 701.21a (Slaughter the Strong): "each player chooses any number of
 * creatures they control with total power 4 or less, then sacrifices all other
 * creatures they control".
 *
 * The window is a **sum of power**, not a count: the engine resolves the cap
 * (CR 608.2h) and validates the kept set's total against it, deduping repeats. The
 * screen only sums what the objects publish; it never recomputes the cap.
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

const keepPower = (data: Record<string, unknown> = {}) =>
  withWaiting({
    type: 'KeepWithinTotalPowerChoice',
    data: {
      player: 0,
      target_player: 0,
      eligible: [100, 101, 105],
      cap: 4,
      chooser_scope: 'EachPlayerSelf',
      source_id: 373,
      source_controller: 0,
      remaining_players: [1],
      all_kept: [],
      scoped_players: [0, 1],
      ...data
    }
  });

test('the prompt publishes the pool and the cap the engine resolved', () => {
  const prompt = keepPowerPrompt(keepPower())!;
  expect(prompt.eligible).toEqual([100, 101, 105]);
  expect(prompt.cap).toBe(4);
  expect(prompt.chooserScope).toBe('self');
  expect(prompt.sourceId).toBe(373);
  expect(prompt.remainingPlayers).toEqual([1]);
  expect(prompt.keptBefore).toEqual([]);
});

test('`ControllerForAll` keeps on behalf of every player in scope', () => {
  const prompt = keepPowerPrompt(
    keepPower({ chooser_scope: 'ControllerForAll', target_player: 1, remaining_players: [], all_kept: [200] })
  )!;
  expect(prompt.chooserScope).toBe('forAll');
  expect(prompt.targetPlayer).toBe(1);
  expect(prompt.remainingPlayers).toEqual([]);
  expect(prompt.keptBefore).toEqual([200]);
});

test('junk ids are dropped, and an absent cap is zero rather than a guess', () => {
  const prompt = keepPowerPrompt(keepPower({ eligible: [100, null, 'x', '101'], cap: undefined }))!;
  expect(prompt.eligible).toEqual([100]);
  expect(prompt.cap).toBe(0);
});

test('the defaults fall back to the viewer seat', () => {
  const prompt = keepPowerPrompt(keepPower({ player: undefined, target_player: undefined, source_id: undefined }))!;
  expect(prompt.player).toBe(0);
  expect(prompt.targetPlayer).toBe(0);
  expect(prompt.sourceId).toBeNull();
});

test('the answer is the kept subset, in the chosen order, and zero is a legal one', () => {
  expect(keepPowerAction([100, 105])).toEqual({
    type: 'ChooseKeptCreatures',
    data: { kept: [100, 105] }
  });
  // "Any number" includes none: an empty set spends no power and keeps nothing.
  expect(keepPowerAction([]).data).toEqual({ kept: [] });
});

test('another prompt is not this block', () => {
  expect(keepPowerPrompt(withWaiting({ type: 'CategoryChoice', data: {} }))).toBeNull();
  expect(keepPowerPrompt(withWaiting({ type: 'KeepExactPermanentsChoice', data: {} }))).toBeNull();
  expect(keepPowerPrompt(null)).toBeNull();
});
