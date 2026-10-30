import { expect, test } from 'bun:test';
import { attackTargets, blockedAttackerIds, blockTargets, canSelectObject, combatRole, isHiddenObject, manaActions, manualCast, nextBlockAssignment, permanentStates, sameTarget, targetAction } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

const object = { id: 10, card_id: 10, owner: 0, controller: 0, zone: 'Battlefield', name: 'Savannah Lions' };
const snapshot = {
  ok: true, viewer: 0, seed: 42, revision: 3, actions_applied: 3, metrics: {},
  state: {
    turn_number: 2, active_player: 0, priority_player: 0, phase: 'DeclareAttackers', players: [], battlefield: [10], stack: [], exile: [], objects: { '10': object },
    waiting_for: { type: 'DeclareAttackers', data: { player: 0, valid_attacker_ids: [10], valid_attack_targets_by_attacker: { '10': [{ type: 'Player', data: 1 }] } } },
    combat: { attackers: [{ object_id: 10, defending_player: 1, attack_target: { type: 'Player', data: 1 }, blocked: false }], blocker_assignments: {}, blocker_to_attacker: {} }
  },
  derived: {}, legal: { actions: [{ type: 'DeclareAttackers', data: { attacks: [[10, { type: 'Player', data: 1 }]] } }], spell_costs: {}, by_object: {} }
} as unknown as EngineSnapshot;

test('attack destinations come from the engine prompt', () => {
  expect(attackTargets(snapshot, 10)).toEqual([{ type: 'Player', data: 1 }]);
  expect(attackTargets(snapshot, 99)).toEqual([]);
  expect(combatRole(snapshot, 10)).toBe('Atacando');
  expect(canSelectObject(snapshot, 10)).toBe(true);
});
test('targets are matched through the externally tagged Phase wire shape', () => {
  const target = { ...snapshot, legal: { ...snapshot.legal, actions: [{ type: 'ChooseTarget', data: { target: { Player: 1 } } }] }, state: { ...snapshot.state, waiting_for: { type: 'TargetSelection', data: { selection: { current_slot: 0, current_legal_targets: [{ Player: 1 }] } } } } } as unknown as EngineSnapshot;
  expect(targetAction(target, { Player: 1 })?.type).toBe('ChooseTarget');
  expect(targetAction(target, { Player: 0 })).toBeUndefined();
  const blockers = { ...snapshot, state: { ...snapshot.state, waiting_for: { type: 'DeclareBlockers', data: { valid_blocker_ids: [20], valid_block_targets: { '20': [10] } } } } } as unknown as EngineSnapshot;
  expect(blockTargets(blockers, 20)).toEqual([10]);
  expect(blockTargets({ ...blockers, state: { ...blockers.state, waiting_for: { type: 'DeclareBlockers', data: {} } } } as EngineSnapshot, 20)).toEqual([]);
});
test('manual payment preserves the engine-authored action and only changes preference', () => {
  const action = { type: 'CastSpell', data: { object_id: 10, card_id: 10, targets: [], payment_mode: { type: 'Auto' } } };
  expect(manualCast(action).data).toMatchObject({ object_id: 10, payment_mode: { type: 'Manual' } });
  expect(action.data.payment_mode).toEqual({ type: 'Auto' });
});
test('permanent states include counters and hidden objects expose no name', () => {
  expect(permanentStates({ ...object, tapped: true, counters: { PlusOnePlusOne: 2 } })).toEqual(['Girada', '2 +1/+1']);
  expect(isHiddenObject({ ...object, face_down: true })).toBe(true);
  expect(permanentStates({ ...object, face_down: true })).toEqual([]);
});
test('mana actions are filtered from engine buckets only', () => {
  const s = { ...snapshot, legal: { ...snapshot.legal, actions: [{ type: 'TapLandForMana', data: { selection: { source: { object_id: 5 }, mana_type: 'Green' } } }], by_object: { '5': [{ type: 'ActivateManaSource', data: { selection: { source: { object_id: 5 }, mana_type: 'Green' } } }] } } } as unknown as EngineSnapshot;
  expect(manaActions(s, 5)).toHaveLength(2);
  expect(manaActions(s, 6)).toHaveLength(0);
});

test('block assignment accepts attacker-first and blocker-first clicks only from engine pairs', () => {
  const attackers = [10];
  const valid = (id: number) => (id === 20 ? [10] : []);
  expect(nextBlockAssignment(null, 20, attackers, valid)).toEqual({ selected: 20 });
  expect(nextBlockAssignment(20, 10, attackers, valid)).toEqual({ selected: null, assignment: [20, 10] });
  expect(nextBlockAssignment(10, 20, attackers, valid)).toEqual({ selected: null, assignment: [20, 10] });
  // A creature the engine did not offer as a blocker gives no assignment.
  expect(nextBlockAssignment(20, 99, attackers, valid)).toEqual({ selected: 99 });
  expect(nextBlockAssignment(20, 20, attackers, valid)).toEqual({ selected: null });
});

test('a blocking creature is labelled from the map Phase actually sends', () => {
  // Shape taken from `CombatState` (phase-engine/game/combat.rs): the bridge
  // forwards the struct unchanged, so there is `blocker_to_attacker`, never
  // `blockers`. Reading the wrong key meant a blocker was never marked.
  const withBlock = {
    ...snapshot,
    state: {
      ...snapshot.state,
      combat: {
        attackers: [{ object_id: 10, defending_player: 1, attack_target: { type: 'Player', data: 1 }, blocked: true }],
        blocker_assignments: { '10': [20] },
        blocker_to_attacker: { '20': [10] }
      }
    }
  } as unknown as EngineSnapshot;
  expect(combatRole(withBlock, 20)).toBe('Bloqueando');
  expect(combatRole(withBlock, 10)).toBe('Atacando');
  expect([...blockedAttackerIds(withBlock)]).toEqual([10]);
  // A creature that blocked and whose attacker left combat keeps the role: the
  // key stays with an empty list (CR 509.1g).
  const emptied = { ...withBlock, state: { ...withBlock.state, combat: { ...withBlock.state.combat!, blocker_to_attacker: { '20': [] } } } } as unknown as EngineSnapshot;
  expect(combatRole(emptied, 20)).toBe('Bloqueando');
  // The field that never existed must not be treated as truth either.
  const legacy = { ...withBlock, state: { ...withBlock.state, combat: { attackers: [], blockers: { '10': [20] } } } } as unknown as EngineSnapshot;
  expect(combatRole(legacy, 20)).toBeUndefined();
});
