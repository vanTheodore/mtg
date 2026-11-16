import { expect, test } from 'bun:test';
import { chooseEnlistAction, chooseExertAction, enlistPrompt, exertPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 508.1g: both optional attack costs are decided while attackers are being
 * declared, **one occurrence at a time**, and both are optional.
 *
 *   - `ExertChoice` (CR 701.43d) asks about one creature: paying means it won't
 *     untap during your next untap step (CR 701.43b). Its `permission` is an
 *     opaque binding of source incarnation + occurrence, and the answer is a bare
 *     boolean — the engine re-validates the permission it latched, so the screen
 *     never names an ability and cannot name the wrong one.
 *   - `EnlistChoice` (CR 702.154a) offers the engine's legal tap set for this
 *     instance. `ChooseEnlist { target: null }` declines, and declining is a real
 *     answer because enlist taps «up to one».
 *
 * Neither prompt filters: `eligible` and `remaining` are Phase's, and the block
 * shows them as they arrive.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 9,
    actions_applied: 9,
    metrics: {},
    state: {
      turn_number: 6,
      active_player: viewer,
      priority_player: viewer,
      phase: 'DeclareAttackers',
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

const permission = (id: number) => ({
  source: { object_id: id, incarnation: 3 },
  occurrence: { type: 'Printed', data: { base_set: 1, printed_index: 0 } }
});

test('the exert window names the creature being decided and the rest of the queue', () => {
  const prompt = exertPrompt(
    withWaiting({
      type: 'ExertChoice',
      data: { player: 0, attacker: 100, permission: permission(100), remaining: [{ attacker: 101, permission: permission(101) }] }
    })
  )!;
  expect(prompt.player).toBe(0);
  expect(prompt.attacker).toBe(100);
  expect(prompt.remaining).toEqual([101]);
  expect(prompt.permissionPublished).toBe(true);
});

test('the queue only reads `attacker` from each pending exert entry', () => {
  // `remaining` is `Vec<PendingAttackExert>`: a list of pairs, not of ids. A bare
  // number is accepted too, because a projection may flatten it.
  const prompt = exertPrompt(
    withWaiting({
      type: 'ExertChoice',
      data: {
        player: 1,
        attacker: 101,
        remaining: [{ attacker: 102, permission: permission(102) }, 105, { permission: permission(100) }]
      }
    })
  )!;
  expect(prompt.remaining).toEqual([102, 105]);
  expect(prompt.permissionPublished).toBe(false);
});

test('a window without an attacker is not this prompt, and neighbours are not either', () => {
  expect(exertPrompt(withWaiting({ type: 'ExertChoice', data: { player: 0, remaining: [] } }))).toBeNull();
  expect(exertPrompt(withWaiting({ type: 'EnlistChoice', data: { player: 0, attacker: 100, eligible: [] } }))).toBeNull();
  expect(exertPrompt(null)).toBeNull();
});

test('both exert answers are real envelopes and neither carries the permission', () => {
  expect(chooseExertAction(true)).toEqual({ type: 'ChooseExert', data: { exert: true } });
  expect(chooseExertAction(false)).toEqual({ type: 'ChooseExert', data: { exert: false } });
});

test('the enlist window publishes the engine’s tap set and its queue', () => {
  const prompt = enlistPrompt(
    withWaiting({ type: 'EnlistChoice', data: { player: 0, attacker: 100, eligible: [101, 105], remaining: [100] } })
  )!;
  expect(prompt.player).toBe(0);
  expect(prompt.attacker).toBe(100);
  expect(prompt.eligible).toEqual([101, 105]);
  expect(prompt.remaining).toEqual([100]);
  expect(prompt.hasEligible).toBe(true);
});

test('an empty tap set still asks: declining is the only answer and it is legal', () => {
  const prompt = enlistPrompt(
    withWaiting({ type: 'EnlistChoice', data: { player: 0, attacker: 100, eligible: [] } })
  )!;
  expect(prompt.hasEligible).toBe(false);
  expect(prompt.eligible).toEqual([]);
  expect(prompt.remaining).toEqual([]);
  // A different window is not this prompt, and neither is an attackerless one.
  expect(enlistPrompt(withWaiting({ type: 'ExertChoice', data: { player: 0, attacker: 100 } }))).toBeNull();
  expect(enlistPrompt(withWaiting({ type: 'EnlistChoice', data: { player: 0, eligible: [101] } }))).toBeNull();
});

test('declining enlist is `target: null`, not an omitted field', () => {
  expect(chooseEnlistAction(101)).toEqual({ type: 'ChooseEnlist', data: { target: 101 } });
  expect(chooseEnlistAction(null)).toEqual({ type: 'ChooseEnlist', data: { target: null } });
  // `null` must survive as a key: the engine distinguishes «declined» from a
  // payload it could not read.
  expect(Object.keys(chooseEnlistAction(null).data!)).toEqual(['target']);
});
