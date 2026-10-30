import { expect, test } from 'bun:test';
import { initialState, reduce, type MachineState } from '../machine.ts';
import { STEPS } from '../lesson.ts';
import { card, makeSnapshot } from './lesson.test.ts';
import type { EngineSnapshot, GameAction } from '../../engine/types.ts';

const CTX = { learner: 0, dummy: 1 };

const PLAINS = card(1, 'Plains', ['Land']);
const LIONS = card(2, 'Savannah Lions', ['Creature']);
const PLAY_LAND: GameAction = { type: 'PlayLand', data: { object_id: 1, card_id: 1 } };
const TAP_LAND: GameAction = { type: 'TapLandForMana', data: { selection: { source: { object_id: 1 } } } };
const CAST_LIONS: GameAction = { type: 'CastSpell', data: { object_id: 2, card_id: 2, targets: [] } };
const PASS: GameAction = { type: 'PassPriority' };

/** The learner acknowledged the reading step, so the lesson is on step 1. */
function acknowledged(): MachineState {
  return { ...initialState(), acknowledged: 0 };
}

/** Every action the engine published, so the test can assert the machine only picks those. */
function published(snapshot: EngineSnapshot): string[] {
  const flat = snapshot.legal.actions.map((action) => JSON.stringify(action));
  const grouped = Object.values(snapshot.legal.by_object).flat().map((action) => JSON.stringify(action));
  return [...flat, ...grouped];
}

test('the first step is a reading step: the machine waits for the learner', () => {
  const snapshot = makeSnapshot({ hand: [PLAINS, LIONS], actions: [PASS] });
  const result = reduce(initialState(), snapshot, CTX);
  expect(result.action).toBeUndefined();
  expect(result.state.step).toBe(0);
  expect(result.state.completed).toBe(false);
});

test('the reading step advances when the learner confirms it', () => {
  const snapshot = makeSnapshot({ hand: [PLAINS, LIONS], actions: [PASS] });
  const result = reduce(acknowledged(), snapshot, CTX);
  expect(result.state.step).toBe(1);
  // The land play is not legal in this window, so the tutorial only lets the
  // game move on: it never proposes an action the engine did not publish.
  expect(result.action?.type ?? 'PassPriority').toBe('PassPriority');
});

test('the land step waits for the learner and offers the action Phase published', () => {
  const snapshot = makeSnapshot({
    hand: [PLAINS, LIONS],
    actions: [PASS],
    byObject: { '1': [PLAY_LAND] }
  });
  const result = reduce(acknowledged(), snapshot, CTX);
  expect(result.action).toBeUndefined();
  const step = STEPS[1];
  expect(step.perform?.(snapshot, CTX)).toEqual(PLAY_LAND);
  expect(published(snapshot)).toContain(JSON.stringify(PLAY_LAND));
});

test('the land step completes when the land reaches the battlefield', () => {
  const played = card(1, 'Plains', ['Land'], { zone: 'Battlefield' });
  const snapshot = makeSnapshot({ hand: [LIONS], battlefield: [played], actions: [PASS] });
  const result = reduce(acknowledged(), snapshot, CTX);
  expect(result.state.step).toBe(2);
});

test('the mana step taps the land the engine offers', () => {
  const played = card(1, 'Plains', ['Land'], { zone: 'Battlefield' });
  const snapshot = makeSnapshot({
    hand: [LIONS],
    battlefield: [played],
    actions: [PASS],
    byObject: { '1': [TAP_LAND] }
  });
  const result = reduce(acknowledged(), snapshot, CTX);
  expect(result.state.step).toBe(2);
  expect(result.action).toBeUndefined();
  expect(STEPS[2].perform?.(snapshot, CTX)).toEqual(TAP_LAND);
});

test('the mana step completes when the pool holds mana', () => {
  const played = card(1, 'Plains', ['Land'], { zone: 'Battlefield' });
  const snapshot = makeSnapshot({ hand: [LIONS], battlefield: [played], mana: 1, actions: [PASS] });
  const result = reduce(acknowledged(), snapshot, CTX);
  expect(result.state.step).toBe(3);
});

test('the cast step casts the creature the engine offers', () => {
  const played = card(1, 'Plains', ['Land'], { zone: 'Battlefield' });
  const snapshot = makeSnapshot({
    hand: [LIONS],
    battlefield: [played],
    mana: 1,
    actions: [PASS],
    byObject: { '2': [CAST_LIONS] }
  });
  const result = reduce(acknowledged(), snapshot, CTX);
  expect(result.state.step).toBe(3);
  expect(STEPS[3].perform?.(snapshot, CTX)).toEqual(CAST_LIONS);
});

test('the cast step completes when the creature is on the battlefield', () => {
  const played = card(1, 'Plains', ['Land'], { zone: 'Battlefield' });
  const creature = card(2, 'Savannah Lions', ['Creature'], { zone: 'Battlefield' });
  const snapshot = makeSnapshot({ battlefield: [played, creature], mana: 1, actions: [PASS] });
  const result = reduce(acknowledged(), snapshot, CTX);
  expect(result.state.step).toBe(4);
  // Step 4 reads the stats: it waits for the learner again.
  expect(result.action).toBeUndefined();
});

test('the turn step waits for the learner, then passes priority on its own', () => {
  const played = card(1, 'Plains', ['Land'], { zone: 'Battlefield' });
  const creature = card(2, 'Savannah Lions', ['Creature'], { zone: 'Battlefield' });
  const snapshot = makeSnapshot({ battlefield: [played, creature], mana: 1, actions: [PASS] });
  const afterCast = reduce(acknowledged(), snapshot, CTX);
  expect(afterCast.state.step).toBe(4);

  // The learner reads the stats and continues: the lesson reaches the turn step.
  const reading = reduce({ ...afterCast.state, acknowledged: 4 }, snapshot, CTX);
  expect(reading.state.step).toBe(5);
  // The turn step waits for the learner to end the turn.
  expect(reading.action).toBeUndefined();

  const asked = { ...reading.state, autoPassing: true };
  const passing = reduce(asked, snapshot, CTX);
  expect(passing.action?.type).toBe('PassPriority');
  expect(passing.state.autoPasses).toBe(1);
});

test('the turn step completes when the learner gets the turn back', () => {
  const played = card(1, 'Plains', ['Land'], { zone: 'Battlefield' });
  const creature = card(2, 'Savannah Lions', ['Creature'], { zone: 'Battlefield' });
  const snapshot = makeSnapshot({ battlefield: [played, creature], active: 0, actions: [PASS] });
  const state: MachineState = {
    ...initialState(),
    step: 5,
    acknowledged: 4,
    autoPassing: true,
    sawOpponentTurn: true,
    learnerTurn: 2
  };
  const result = reduce(state, snapshot, CTX);
  expect(result.state.step).toBe(6);
});

test('the dummy only passes while it is the one with the decision', () => {
  const snapshot = makeSnapshot({ viewer: 1, active: 1, actions: [PASS] });
  const result = reduce(initialState(), snapshot, CTX);
  expect(result.action?.type).toBe('PassPriority');
  expect(result.state.sawOpponentTurn).toBe(true);
});

test('the attack step declares the attack with the action Phase published', () => {
  const played = card(1, 'Plains', ['Land'], { zone: 'Battlefield' });
  const creature = card(2, 'Savannah Lions', ['Creature'], { zone: 'Battlefield' });
  const attack: GameAction = { type: 'DeclareAttackers', data: { attacks: [[2, { type: 'Player', data: 1 }]], bands: [] } };
  const snapshot = makeSnapshot({
    battlefield: [played, creature],
    waiting: 'DeclareAttackers',
    actions: [{ type: 'DeclareAttackers', data: { attacks: [], bands: [] } }, attack, PASS],
    byObject: {}
  });
  const withTargets = {
    ...snapshot,
    state: {
      ...snapshot.state,
      waiting_for: {
        type: 'DeclareAttackers',
        data: { player: 0, valid_attacker_ids: [2], valid_attack_targets_by_attacker: { '2': [{ type: 'Player', data: 1 }] } }
      }
    }
  } as unknown as EngineSnapshot;
  const state: MachineState = { ...initialState(), step: 6, acknowledged: 4, sawOpponentTurn: true, learnerTurn: 2 };
  const result = reduce(state, withTargets, CTX);
  expect(result.action).toBeUndefined();
  expect(STEPS[6].perform?.(withTargets, CTX)).toEqual(attack);
});

test('the attack step completes once the combat state lists the attacker', () => {
  const played = card(1, 'Plains', ['Land'], { zone: 'Battlefield' });
  const creature = card(2, 'Savannah Lions', ['Creature'], { zone: 'Battlefield' });
  const snapshot = makeSnapshot({
    battlefield: [played, creature],
    waiting: 'CombatDamage',
    combat: { attackers: [{ object_id: 2, defending_player: 1, attack_target: { type: 'Player', data: 1 }, blocked: false }], blocker_assignments: {}, blocker_to_attacker: {} }
  });
  const state: MachineState = { ...initialState(), step: 6, acknowledged: 4, sawOpponentTurn: true, learnerTurn: 2 };
  const result = reduce(state, snapshot, CTX);
  expect(result.state.step).toBe(7);
});

test('the damage step reads what happened and the lesson finishes after it', () => {
  const played = card(1, 'Plains', ['Land'], { zone: 'Battlefield' });
  const creature = card(2, 'Savannah Lions', ['Creature'], { zone: 'Battlefield' });
  const snapshot = makeSnapshot({
    battlefield: [played, creature],
    life: [20, 18],
    waiting: 'EndCombat'
  });
  const state: MachineState = { ...initialState(), step: 7, acknowledged: 4, sawOpponentTurn: true, learnerTurn: 2 };
  // The damage step explains what happened: it waits for the learner.
  const reading = reduce(state, snapshot, CTX);
  expect(reading.state.step).toBe(7);
  expect(reading.state.completed).toBe(false);

  const final = reduce({ ...reading.state, acknowledged: 7 }, snapshot, CTX);
  expect(final.state.completed).toBe(true);
  expect(final.state.step).toBe(STEPS.length - 1);
});

test('an unexpected state never produces an action the engine did not publish', () => {
  const snapshots: EngineSnapshot[] = [
    makeSnapshot({ hand: [PLAINS, LIONS], actions: [PASS] }),
    makeSnapshot({ hand: [PLAINS, LIONS], actions: [PASS], byObject: { '1': [PLAY_LAND] } }),
    makeSnapshot({ hand: [LIONS], battlefield: [card(1, 'Plains', ['Land'], { zone: 'Battlefield' })], actions: [PASS], byObject: { '1': [TAP_LAND] } }),
    makeSnapshot({ hand: [LIONS], battlefield: [card(1, 'Plains', ['Land'], { zone: 'Battlefield' })], mana: 1, actions: [PASS], byObject: { '2': [CAST_LIONS] } }),
    makeSnapshot({ viewer: 1, active: 1, actions: [PASS] }),
    makeSnapshot({ actions: [PASS] })
  ];
  let state = initialState();
  for (const snapshot of snapshots) {
    const result = reduce(state, snapshot, CTX);
    if (result.action) {
      const allowed = published(snapshot);
      expect(allowed).toContain(JSON.stringify(result.action));
    }
    state = result.state;
  }
  // The lesson never completed on its own: it is waiting for the learner.
  expect(state.completed).toBe(false);
});

test('the same sequence of snapshots always produces the same decisions', () => {
  const run = () => {
    const snapshots = [
      makeSnapshot({ hand: [PLAINS, LIONS], actions: [PASS] }),
      makeSnapshot({ hand: [PLAINS, LIONS], actions: [PASS], byObject: { '1': [PLAY_LAND] } }),
      makeSnapshot({ hand: [LIONS], battlefield: [card(1, 'Plains', ['Land'], { zone: 'Battlefield' })], actions: [PASS], byObject: { '1': [TAP_LAND] } }),
      makeSnapshot({ hand: [LIONS], battlefield: [card(1, 'Plains', ['Land'], { zone: 'Battlefield' })], mana: 1, actions: [PASS], byObject: { '2': [CAST_LIONS] } })
    ];
    let state = initialState();
    const trace: string[] = [];
    for (const snapshot of snapshots) {
      const result = reduce(state, snapshot, CTX);
      trace.push(`${result.state.step}:${result.action?.type ?? 'wait'}`);
      state = result.state;
    }
    return trace.join('|');
  };
  expect(run()).toBe(run());
});

test('a step whose action never arrives stops asking instead of forcing the state', () => {
  // The engine never offers the land play: the tutorial must not invent it.
  const snapshot = makeSnapshot({ hand: [PLAINS, LIONS], actions: [PASS] });
  let state: MachineState = { ...initialState(), step: 1, acknowledged: 0 };
  for (let i = 0; i < 80; i += 1) {
    const result = reduce(state, snapshot, CTX);
    if (result.action) {
      // Only passing priority is ever proposed: no forged PlayLand.
      expect(result.action.type).toBe('PassPriority');
    }
    state = result.state;
  }
  expect(state.autoPasses).toBeGreaterThan(0);
  expect(state.step).toBe(1);
});

test('the dummy declares no attackers when the engine asks it to', () => {
  const noAttack: GameAction = { type: 'DeclareAttackers', data: { attacks: [], bands: [] } };
  const snapshot = makeSnapshot({
    viewer: 1,
    active: 1,
    waiting: 'DeclareAttackers',
    actions: [noAttack, PASS]
  });
  const result = reduce(initialState(), snapshot, CTX);
  expect(result.action).toEqual(noAttack);
  expect(published(snapshot)).toContain(JSON.stringify(noAttack));
});

test('the dummy declares no blockers when the engine asks it to', () => {
  const noBlock: GameAction = { type: 'DeclareBlockers', data: { assignments: [] } };
  const snapshot = makeSnapshot({
    viewer: 1,
    active: 1,
    waiting: 'DeclareBlockers',
    actions: [noBlock, PASS]
  });
  const result = reduce(initialState(), snapshot, CTX);
  expect(result.action).toEqual(noBlock);
});

test('a cost the engine asks to pay is paid with an action Phase published', () => {
  const played = card(1, 'Plains', ['Land'], { zone: 'Battlefield' });
  const tap: GameAction = { type: 'TapLandForMana', data: { selection: { source: { object_id: 1 } } } };
  const snapshot = makeSnapshot({
    battlefield: [played],
    waiting: 'ManaSourceSelection',
    actions: [{ type: 'ActivateManaSource', data: { selection: { source: { object_id: 1 } } } }],
    byObject: { '1': [tap] }
  });
  const result = reduce(initialState(), snapshot, CTX);
  expect(result.action).toBeDefined();
  expect(published(snapshot)).toContain(JSON.stringify(result.action));
});
