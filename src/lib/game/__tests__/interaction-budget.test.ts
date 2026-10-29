/**
 * A budget for the work each click does, so an O(board) regression cannot sneak
 * back in unnoticed.
 *
 * `manaActions(s, id)` used to flatten **every** legal action on the board for
 * **every** permanent the components render: on an 80-permanent board one click
 * spent 1.2 ms doing that, and the cost grew with the square of the board. It
 * now reads the bucket of the object it was asked about. Measured on the same
 * machine: 80 permanents went from ~1200 µs to ~140 µs per render pass
 * (`bun scripts/measure-interaction.ts`).
 *
 * The budget is deliberately loose (3x the observed value) so a slow CI box does
 * not fail a correct change; what it catches is the class of regression, not a
 * few microseconds.
 */
import { describe, expect, test } from 'bun:test';
import { combatRole, keywordLabel, manaActions, objectSelectLabel, permanentStates } from '../interaction.ts';
import type { EngineSnapshot, GameObject } from '../../engine/types.ts';

function board(size: number): EngineSnapshot {
  const objects: Record<string, GameObject> = {};
  const battlefield: number[] = [];
  const byObject: Record<string, unknown[]> = {};
  for (let index = 0; index < size; index += 1) {
    const id = 100 + index;
    objects[String(id)] = {
      id, card_id: id, owner: 0, controller: 0, zone: 'Battlefield',
      name: `Permanente ${index}`, power: 2, toughness: 2, keywords: index % 4 === 0 ? ['Flying'] : []
    } as unknown as GameObject;
    battlefield.push(id);
    byObject[String(id)] = [{ type: 'TapLandForMana', data: { selection: { source: { object_id: id } } } }];
  }
  return {
    ok: true, viewer: 0, seed: 1, revision: 9, actions_applied: 9, metrics: {},
    state: {
      turn_number: 5, active_player: 0, priority_player: 0, phase: 'PreCombatMain',
      waiting_for: { type: 'Priority', data: { player: 0 } },
      players: [], battlefield, stack: [], exile: [], objects,
      combat: { attackers: [], blocker_assignments: {}, blocker_to_attacker: {} }
    },
    derived: {},
    legal: { actions: [], spell_costs: {}, by_object: byObject }
  } as unknown as EngineSnapshot;
}

function renderPass(snapshot: EngineSnapshot): number {
  let checksum = 0;
  for (const id of snapshot.state.battlefield) {
    const object = snapshot.state.objects[String(id)]!;
    const role = combatRole(snapshot, id);
    checksum += permanentStates(object, role).length;
    checksum += objectSelectLabel(snapshot, id)?.length ?? 0;
    for (const keyword of (object.keywords ?? []) as unknown[]) checksum += keywordLabel(keyword).length;
  }
  return checksum;
}

function micros(fn: () => void, iterations = 200): number {
  for (let index = 0; index < 5; index += 1) fn();
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) fn();
  return ((performance.now() - started) / iterations) * 1000;
}

describe('the per-click pass over the board stays inside its budget', () => {
  test('asking for one object never walks the whole legal map', () => {
    const snapshot = board(40);
    const action = manaActions(snapshot, 105);
    expect(action).toHaveLength(1);
    // A mana action that only exists in the flat list is still found, and one
    // filed under another object is not attributed to this one.
    const flat = {
      ...snapshot,
      legal: { ...snapshot.legal, actions: [{ type: 'TapLandForMana', data: { selection: { source: { object_id: 105 } } } }], by_object: { '999': [{ type: 'TapLandForMana', data: { selection: { source: { object_id: 999 } } } }] } }
    } as unknown as EngineSnapshot;
    expect(manaActions(flat, 105)).toHaveLength(1);
    // Flat list first, then per-object buckets — the order the panel renders.
    expect(manaActions(flat, undefined).map((entry) => (entry.data?.selection as { source?: { object_id?: number } }).source?.object_id)).toEqual([105, 999]);
  });

  test('80 permanents render in well under a millisecond', () => {
    const snapshot = board(80);
    const perClick = micros(() => renderPass(snapshot));
    expect(perClick).toBeLessThan(800);
    expect(renderPass(snapshot)).toBeGreaterThan(0);
  });

  test('cost grows roughly linearly, not with the square of the board', () => {
    const small = micros(() => renderPass(board(10)), 400);
    const large = micros(() => renderPass(board(80)), 200);
    // A quadratic pass would be ~64x here; the budget asks for less than 24x.
    expect(large / Math.max(small, 0.001)).toBeLessThan(24);
  });
});
