import { expect, test } from 'bun:test';
import { stationAction, stationPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 702.184a: station taps **one** untapped creature and puts charge counters on
 * the Spacecraft equal to its power — as the engine computes it (CR 702.184c),
 * which is not necessarily the printed power. The prompt carries the Spacecraft
 * and the candidates, and nothing else: no contribution list, because the number
 * is decided by the creature that ends up tapped.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 71,
    actions_applied: 71,
    metrics: {},
    state: {
      turn_number: 7,
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

test('station publishes the Spacecraft and the creatures it will accept', () => {
  const prompt = stationPrompt(
    withWaiting({ type: 'StationTarget', data: { player: 0, spacecraft_id: 343, eligible_creatures: [100, 101, 105] } })
  )!;
  expect(prompt.spacecraftId).toBe(343);
  expect(prompt.creatures).toEqual([100, 101, 105]);
  expect(prompt.player).toBe(0);
  // The engine's own order is kept: it is the list the handler re-validates.
  expect(prompt.creatures[2]).toBe(105);
});

test('station invents no contribution: the prompt carries only candidates', () => {
  const prompt = stationPrompt(
    withWaiting({
      type: 'StationTarget',
      data: {
        player: 1,
        spacecraft_id: 343,
        eligible_creatures: [100],
        // A stray field must not become a counter count the engine never sent.
        contributions: [5]
      }
    }, 1)
  )!;
  expect(prompt.player).toBe(1);
  expect(Object.keys(prompt).sort()).toEqual(['creatures', 'player', 'spacecraftId']);
});

test('junk in the eligible list is dropped and a missing list is empty', () => {
  expect(
    stationPrompt(
      withWaiting({ type: 'StationTarget', data: { spacecraft_id: 343, eligible_creatures: [100, null, 'x', 101] } })
    )!.creatures
  ).toEqual([100, 101]);
  const empty = stationPrompt(withWaiting({ type: 'StationTarget', data: { spacecraft_id: 343 } }))!;
  expect(empty.creatures).toEqual([]);
  expect(empty.spacecraftId).toBe(343);
});

test('the answer names the Spacecraft and one creature', () => {
  expect(stationAction(343, 101)).toEqual({
    type: 'ActivateStation',
    data: { spacecraft_id: 343, creature_id: 101 }
  });
});

test('another prompt is not this block', () => {
  expect(stationPrompt(withWaiting({ type: 'CrewVehicle', data: { vehicle_id: 340, crew_power: 3 } }))).toBeNull();
  expect(stationPrompt(withWaiting({ type: 'EquipTarget', data: { equipment_id: 341 } }))).toBeNull();
  expect(stationPrompt(withWaiting(null))).toBeNull();
  expect(stationPrompt(null)).toBeNull();
});
