import { expect, test } from 'bun:test';
import { canAssignDistinctCardTypes, zoneChoicePrompt, zoneChoiceReady } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 608.2d: `ChooseFromZoneChoice`. The confirm gate is Phase's modal, not a
 * second reading of the card: exact or up-to, distinct types by assignment,
 * and a mana-value bound the engine checks itself.
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

const objects = {
  '1': { card_types: { core_types: ['Creature'] } },
  '2': { card_types: { core_types: ['Artifact'] } },
  '3': { card_types: { core_types: ['Instant'] } },
  '4': { card_types: { core_types: ['Artifact', 'Creature'] } }
};

test('an exact pick is the published count, and a zero is not a card', () => {
  const prompt = zoneChoicePrompt(withWaiting({
    type: 'ChooseFromZoneChoice',
    data: { player: 0, cards: [1, 2, 0], count: 1, source_id: 9 }
  }));
  expect(prompt).toMatchObject({
    player: 0,
    cards: [1, 2, 0],
    count: 1,
    upTo: false,
    constraint: { kind: 'none' },
    sourceId: 9,
    reciprocal: null
  });
  expect(zoneChoiceReady(prompt!, [1], objects)).toBe(true);
  expect(zoneChoiceReady(prompt!, [], objects)).toBe(false);
  expect(zoneChoiceReady(prompt!, [0], objects)).toBe(false);
  expect(zoneChoiceReady(prompt!, [1, 2], objects)).toBe(false);
});

test('up to N may be empty, and distinct types are an assignment, not a filter invented here', () => {
  const prompt = zoneChoicePrompt(withWaiting({
    type: 'ChooseFromZoneChoice',
    data: {
      player: 0,
      cards: [1, 2, 3, 4],
      count: 2,
      up_to: true,
      constraint: { type: 'DistinctCardTypes', categories: ['Artifact', 'Creature'] },
      reciprocal_role: 'Produce',
      source_id: 8
    }
  }));
  expect(prompt?.upTo).toBe(true);
  expect(prompt?.reciprocal).toBe('produce');
  expect(prompt?.constraint).toEqual({ kind: 'distinct-types', categories: ['Artifact', 'Creature'] });
  expect(zoneChoiceReady(prompt!, [], objects)).toBe(true);
  expect(zoneChoiceReady(prompt!, [1, 2], objects)).toBe(true);
  expect(zoneChoiceReady(prompt!, [1, 3], objects)).toBe(false);
  expect(zoneChoiceReady(prompt!, [4], objects)).toBe(true);
  expect(canAssignDistinctCardTypes(objects, [1, 4], ['Artifact', 'Creature'])).toBe(true);
  expect(canAssignDistinctCardTypes(objects, [3], ['Artifact', 'Creature'])).toBe(false);
});

test('a mana-value bound is named and not gated, and an unknown constraint is not assumed', () => {
  const mana = zoneChoicePrompt(withWaiting({
    type: 'ChooseFromZoneChoice',
    data: {
      player: 0,
      cards: [1, 2],
      count: 2,
      constraint: { type: 'TotalManaValue', comparator: 'LE', value: 6 }
    }
  }));
  expect(mana?.constraint).toEqual({ kind: 'total-mana', comparator: 'LE', value: 6 });
  expect(zoneChoiceReady(mana!, [1, 2], objects)).toBe(true);

  const unknown = zoneChoicePrompt(withWaiting({
    type: 'ChooseFromZoneChoice',
    data: { player: 0, cards: [1], count: 1, constraint: { type: 'FutureBound' }, reciprocal_role: 'Sideways' }
  }));
  expect(unknown?.constraint.kind).toBe('unknown');
  expect(unknown?.reciprocal).toBe('unknown');
  expect(zoneChoiceReady(unknown!, [1], objects)).toBe(true);
});

test('a missing count asks nothing, and a neighbour window is not this one', () => {
  const missing = zoneChoicePrompt(withWaiting({
    type: 'ChooseFromZoneChoice',
    data: { player: 0, cards: [1] }
  }));
  expect(missing?.count).toBeNull();
  expect(zoneChoiceReady(missing!, [], objects)).toBe(false);
  expect(zoneChoicePrompt(withWaiting({ type: 'SearchChoice', data: { cards: [1], count: 1 } }))).toBeNull();
});
