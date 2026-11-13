import { expect, test } from 'bun:test';
import { copyChosenAction, copyChosenPrompt, objectPropertyLabel } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 707.2 + CR 101.4: `EachPlayerCopyChosen` — "each player chooses one or two
 * creatures they control; a token copies the **first** creature they chose … then
 * whoever chose a second one puts counters on the token equal to its power"
 * (Human—Time Lord Meta-Crisis).
 *
 * The order is the rule: index 0 is copied, index 1 only scales. Picks are
 * distinct objects, `min..=max` of them, and nothing is applied until the whole
 * APNAP set is collected.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 151,
    actions_applied: 151,
    metrics: {},
    state: {
      turn_number: 15,
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

const copyChosen = (data: Record<string, unknown> = {}) =>
  withWaiting({
    type: 'EachPlayerCopyChosenSelection',
    data: {
      player: 0,
      eligible: [{ Object: 100 }, { Object: 101 }, { Object: 105 }],
      min: 1,
      max: 2,
      copy_modifications: [],
      scale: { counter_type: 'P1P1', scale_property: 'Power' },
      choose_scope: { type: 'Chooser' },
      source_id: 372,
      source_controller: 1,
      remaining_players: [1],
      all_choices: [],
      scoped_players: [0, 1],
      ...data
    }
  });

test('the prompt publishes the window, the scaling clause and the source', () => {
  const prompt = copyChosenPrompt(copyChosen())!;
  expect(prompt.eligible).toEqual([100, 101, 105]);
  expect(prompt.min).toBe(1);
  expect(prompt.max).toBe(2);
  expect(prompt.scope).toBe('own');
  expect(prompt.scale).toEqual({ counterType: 'P1P1', property: 'Power' });
  expect(prompt.sourceId).toBe(372);
  expect(prompt.remainingPlayers).toEqual([1]);
  expect(prompt.earlier).toEqual([]);
});

test('only objects are eligible: the engine rejects a player pick outright', () => {
  const prompt = copyChosenPrompt(copyChosen({ eligible: [{ Object: 100 }, { Player: 1 }, null, 'x'] }))!;
  expect(prompt.eligible).toEqual([100]);
});

test('`choose_scope` says whose battlefield the pool came from', () => {
  expect(copyChosenPrompt(copyChosen({ choose_scope: { type: 'Neighbor', direction: 'Left' } }))!.scope).toBe('left');
  expect(copyChosenPrompt(copyChosen({ choose_scope: { type: 'Neighbor', direction: 'Right' } }))!.scope).toBe('right');
  // An absent scope is the engine default: the chooser's own permanents.
  expect(copyChosenPrompt(copyChosen({ choose_scope: undefined }))!.scope).toBe('own');
});

test('the scaling clause is optional and its two halves travel together', () => {
  expect(copyChosenPrompt(copyChosen({ scale: undefined }))!.scale).toBeNull();
  // Half a clause is not a clause: no counter type without a property to read.
  expect(copyChosenPrompt(copyChosen({ scale: { counter_type: 'P1P1' } }))!.scale).toBeNull();
});

test('earlier players are kept in APNAP order, and empty rounds are dropped', () => {
  const prompt = copyChosenPrompt(
    copyChosen({
      all_choices: [
        { player: 1, chosen: [101] },
        { player: 2, chosen: [] },
        { player: 0, chosen: [200, 201] }
      ]
    })
  )!;
  expect(prompt.earlier).toEqual([
    { player: 1, chosen: [101] },
    { player: 0, chosen: [200, 201] }
  ]);
});

test('the answer keeps the order the player picked', () => {
  expect(copyChosenAction([101, 100])).toEqual({
    type: 'SelectTargets',
    data: { targets: [{ Object: 101 }, { Object: 100 }] }
  });
  // Same two objects, other way round: a different answer, because index 0 is copied.
  expect(copyChosenAction([100, 101]).data).toEqual({ targets: [{ Object: 100 }, { Object: 101 }] });
});

test('the scaling property reads in Spanish and an unknown one keeps the engine word', () => {
  expect(objectPropertyLabel('Power')).toBe('fuerza');
  expect(objectPropertyLabel('Toughness')).toBe('resistencia');
  expect(objectPropertyLabel('ManaValue')).toBe('valor de maná');
  expect(objectPropertyLabel('Loyalty')).toBe('Loyalty');
});

test('another prompt is not this block', () => {
  expect(copyChosenPrompt(withWaiting({ type: 'CategoryChoice', data: {} }))).toBeNull();
  expect(copyChosenPrompt(withWaiting({ type: 'ChooseObjectsSelection', data: {} }))).toBeNull();
  expect(copyChosenPrompt(null)).toBeNull();
});
