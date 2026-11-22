import { expect, test } from 'bun:test';
import { replacementOrderAction, replacementOrderPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 101.4c + CR 616.1: `ReplacementDecisionOrder` asks which of several
 * simultaneous replacement decisions is made first. It is a pick of exactly
 * one, but unlike `ReplacementChoice` the candidates are **objects** and the
 * answer is `SelectCards { cards: [that one] }` — not `ChooseReplacement`.
 *
 * The buttons come from `legal.actions`, so these tests check the two ways it
 * can go wrong: inventing an answer the engine did not offer, and dropping a
 * candidate the engine did publish into an unreachable row.
 */
const base = (waiting: unknown, actions: unknown[] = [], viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 7,
    revision: 3,
    actions_applied: 3,
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
      objects: {
        '31': { id: 31, name: 'Rest in Peace', zone: 'Battlefield', display_visible_to_viewer: true },
        '32': { id: 32, name: 'Leyline of the Void', zone: 'Battlefield', display_visible_to_viewer: true }
      },
      waiting_for: waiting
    },
    derived: {},
    legal: { actions, spell_costs: {}, by_object: {} }
  }) as unknown as EngineSnapshot;

const waiting = (data: Record<string, unknown> = {}) => ({
  type: 'ReplacementDecisionOrder',
  data: { player: 0, objects: [31, 32], ...data }
});

const offer = (id: number) => ({ type: 'SelectCards', data: { cards: [id] } });

test('the published objects are the candidates, in announcement order', () => {
  const prompt = replacementOrderPrompt(base(waiting()))!;
  expect(prompt.player).toBe(0);
  expect(prompt.objects).toEqual([31, 32]);
});

test('every candidate whose SelectCards the engine offered gets a button', () => {
  const prompt = replacementOrderPrompt(base(waiting(), [offer(31), offer(32)]))!;
  expect([...prompt.actions.keys()]).toEqual([31, 32]);
  expect(prompt.actions.get(31)).toEqual({ type: 'SelectCards', data: { cards: [31] } });
});

test('an object with no published action is a candidate, not a button', () => {
  const prompt = replacementOrderPrompt(base(waiting(), [offer(32)]))!;
  expect(prompt.objects).toEqual([31, 32]);
  expect(prompt.actions.has(31)).toBe(false);
  expect(prompt.actions.get(32)).toEqual({ type: 'SelectCards', data: { cards: [32] } });
});

test('the multi-card SelectCards envelope is never read as a single pick', () => {
  const prompt = replacementOrderPrompt(base(waiting(), [{ type: 'SelectCards', data: { cards: [31, 32] } }]))!;
  expect(prompt.actions.size).toBe(0);
});

test('ChooseReplacement is not this window’s answer', () => {
  const prompt = replacementOrderPrompt(base(waiting(), [{ type: 'ChooseReplacement', data: { index: 0 } }]))!;
  expect(prompt.actions.size).toBe(0);
});

test('a stale answer is refused; the published one goes through', () => {
  // Identity, like every other prompt's guard: the action that is dispatched is
  // the one the engine published in this window, not one rebuilt to look alike.
  const snapshot = base(waiting(), [offer(31)]);
  const published = replacementOrderPrompt(snapshot)!.actions.get(31)!;
  expect(replacementOrderAction(snapshot, published)).toBe(true);
  expect(replacementOrderAction(snapshot, offer(31))).toBe(false);
  expect(replacementOrderAction(snapshot, offer(32))).toBe(false);
});

test('another window draws nothing, and an empty candidate list is not a window', () => {
  expect(replacementOrderPrompt(base({ type: 'ReplacementChoice', data: { player: 0 } }))).toBeNull();
  expect(replacementOrderPrompt(base(waiting({ objects: [] })))).toBeNull();
  expect(replacementOrderPrompt(null)).toBeNull();
});

test('the absent player falls back to the viewer, exactly like the other prompts', () => {
  const prompt = replacementOrderPrompt(base({ type: 'ReplacementDecisionOrder', data: { objects: [31] } }, [], 1))!;
  expect(prompt.player).toBe(1);
});
