import { expect, test } from 'bun:test';
import { equipAction, equipPrompt, tapPowerAction, tapPowerPrompt, tapPowerTotal } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 702.122a (crew) and CR 702.171a (saddle): tap creatures of yours whose
 * contribution adds up to N. The engine publishes the eligible creatures, what
 * each one contributes, and the threshold; the table only composes the pick and
 * sums the engine's own numbers — never the printed power.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 61,
    actions_applied: 61,
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

test('crew publishes the Vehicle, the threshold and one contribution per creature', () => {
  const prompt = tapPowerPrompt(
    withWaiting({
      type: 'CrewVehicle',
      data: {
        player: 0,
        vehicle_id: 340,
        crew_power: 3,
        eligible_creatures: [100, 101, 102],
        contributions: [2, 2, 1]
      }
    })
  )!;
  expect(prompt.kind).toBe('crew');
  expect(prompt.sourceId).toBe(340);
  expect(prompt.required).toBe(3);
  expect(prompt.counted).toBe(true);
  // Aligned with `eligible_creatures`: the engine's order is the only thing that
  // ties a contribution to a creature, so re-sorting would silently renumber them.
  expect(prompt.creatures).toEqual([
    { id: 100, contribution: 2 },
    { id: 101, contribution: 2 },
    { id: 102, contribution: 1 }
  ]);
});

test('saddle is the same shape with the Mount and its own keyword', () => {
  const prompt = tapPowerPrompt(
    withWaiting({
      type: 'SaddleMount',
      data: { player: 1, mount_id: 342, saddle_power: 1, eligible_creatures: [102], contributions: [1] }
    }, 1)
  )!;
  expect(prompt.kind).toBe('saddle');
  expect(prompt.player).toBe(1);
  // `mount_id`/`saddle_power`, not the crew fields: saddle is a different action.
  expect(prompt.sourceId).toBe(342);
  expect(prompt.required).toBe(1);
});

test('without a contribution list the block has no total to claim', () => {
  const prompt = tapPowerPrompt(
    withWaiting({ type: 'CrewVehicle', data: { vehicle_id: 340, crew_power: 3, eligible_creatures: [100, 101] } })
  )!;
  expect(prompt.counted).toBe(false);
  expect(prompt.creatures).toEqual([
    { id: 100, contribution: null },
    { id: 101, contribution: null }
  ]);
  // Null, not zero: an invented sum would be a rule the engine never stated.
  expect(tapPowerTotal(prompt, [100, 101])).toBeNull();
  // Same when the list is shorter than the creatures it should qualify.
  const short = tapPowerPrompt(
    withWaiting({
      type: 'CrewVehicle',
      data: { vehicle_id: 340, crew_power: 3, eligible_creatures: [100, 101], contributions: [2] }
    })
  )!;
  expect(short.counted).toBe(false);
  expect(tapPowerTotal(short, [100])).toBeNull();
});

test('junk in the eligible list is dropped and a missing list is empty', () => {
  expect(
    tapPowerPrompt(
      withWaiting({
        type: 'SaddleMount',
        data: { mount_id: 342, saddle_power: 2, eligible_creatures: [100, null, 'x', 101], contributions: [1, 1] }
      })
    )!.creatures
  ).toEqual([
    { id: 100, contribution: 1 },
    { id: 101, contribution: 1 }
  ]);
  const empty = tapPowerPrompt(withWaiting({ type: 'CrewVehicle', data: { vehicle_id: 340, crew_power: 3 } }))!;
  expect(empty.creatures).toEqual([]);
  expect(empty.required).toBe(3);
  expect(tapPowerTotal(empty, [])).toBe(0);
});

test('the total is the engine contributions, and the threshold is readable from it', () => {
  const prompt = tapPowerPrompt(
    withWaiting({
      type: 'CrewVehicle',
      data: { vehicle_id: 340, crew_power: 3, eligible_creatures: [100, 101, 102], contributions: [2, 2, 1] }
    })
  )!;
  expect(tapPowerTotal(prompt, [])).toBe(0);
  expect(tapPowerTotal(prompt, [100])).toBe(2);
  expect(tapPowerTotal(prompt, [100, 102])).toBe(3);
  expect(tapPowerTotal(prompt, [100, 101])).toBe(4);
  // An id the engine did not offer cannot inflate the sum.
  expect(tapPowerTotal(prompt, [100, 999])).toBe(2);
  // Order of the pick does not change what it adds up to.
  expect(tapPowerTotal(prompt, [102, 100])).toBe(3);
});

test('the answer names the keyword it belongs to', () => {
  const crew = tapPowerPrompt(withWaiting({ type: 'CrewVehicle', data: { vehicle_id: 340, crew_power: 1 } }))!;
  expect(tapPowerAction(crew, [100, 101])).toEqual({
    type: 'CrewVehicle',
    data: { vehicle_id: 340, creature_ids: [100, 101] }
  });
  const saddle = tapPowerPrompt(withWaiting({ type: 'SaddleMount', data: { mount_id: 342, saddle_power: 1 } }))!;
  // Mount, not Vehicle: sending `CrewVehicle` here would be a different rule.
  expect(tapPowerAction(saddle, [100])).toEqual({
    type: 'SaddleMount',
    data: { mount_id: 342, creature_ids: [100] }
  });
});

test('equip is a list of targets and one action each', () => {
  const prompt = equipPrompt(
    withWaiting({ type: 'EquipTarget', data: { player: 0, equipment_id: 341, valid_targets: [100, null, 101] } })
  )!;
  expect(prompt.player).toBe(0);
  expect(prompt.equipmentId).toBe(341);
  // Same filter as everywhere else: what the engine did not publish is not a target.
  expect(prompt.targets).toEqual([100, 101]);
  expect(equipAction(prompt.equipmentId, prompt.targets[1])).toEqual({
    type: 'Equip',
    data: { equipment_id: 341, target_id: 101 }
  });
  expect(equipPrompt(withWaiting({ type: 'EquipTarget', data: { equipment_id: 341 } }))!.targets).toEqual([]);
});

test('another prompt is not this block', () => {
  expect(tapPowerPrompt(withWaiting({ type: 'ScryChoice', data: { player: 0, cards: [400] } }))).toBeNull();
  expect(equipPrompt(withWaiting({ type: 'CrewVehicle', data: { vehicle_id: 340, crew_power: 1 } }))).toBeNull();
  expect(tapPowerPrompt(withWaiting(null))).toBeNull();
  expect(equipPrompt(null)).toBeNull();
});
