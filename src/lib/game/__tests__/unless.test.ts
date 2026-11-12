import { expect, test } from 'bun:test';
import { payUnlessCost, unlessCostLabel, unlessPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 118.12: "counter it unless its controller pays {3}". The payer answers
 * pay-or-not, and the prompt must carry the cost and the consequence — the
 * unless-cost is an `AbilityCost`, not a number: mana, life, or an object cost
 * the table cannot price.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 9,
    revision: 33,
    actions_applied: 33,
    metrics: {},
    state: {
      turn_number: 5,
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

const unless = (data: Record<string, unknown> = {}) => ({
  type: 'UnlessPayment',
  data: {
    player: 0,
    cost: { type: 'Mana', cost: { generic: 3, shards: [] } },
    pending_effect: { ability: {} },
    effect_description: 'contrarrestar el hechizo',
    ...data
  }
});

test('a mana unless-cost is named with the engine’s own cost text', () => {
  const prompt = unlessPrompt(withWaiting(unless()))!;
  expect(prompt.player).toBe(0);
  expect(prompt.cost).toEqual({ kind: 'mana', text: '{3}' });
  expect(unlessCostLabel(prompt.cost)).toBe('{3}');
  // Declining is a real answer with a consequence, so the wording travels.
  expect(prompt.effect).toBe('contrarrestar el hechizo');
  expect(prompt.remaining).toEqual([]);
});

test('a colored unless-cost keeps its pips', () => {
  const prompt = unlessPrompt(
    withWaiting(unless({ cost: { type: 'Mana', cost: { generic: 0, shards: ['Blue'] } } }))
  )!;
  expect(prompt.cost).toEqual({ kind: 'mana', text: '{U}' });
});

test('paying life is named only when the engine fixed the amount', () => {
  const fixed = unlessPrompt(
    withWaiting(unless({ cost: { type: 'PayLife', amount: { type: 'Fixed', value: 3 } } }))
  )!;
  expect(fixed.cost).toEqual({ kind: 'life', amount: 3 });
  expect(unlessCostLabel(fixed.cost)).toBe('3 vidas');
  // One life is singular, because «1 vidas» reads like a bug.
  const one = unlessPrompt(
    withWaiting(unless({ cost: { type: 'PayLife', amount: { type: 'Fixed', value: 1 } } }))
  )!;
  expect(unlessCostLabel(one.cost)).toBe('1 vida');
  // A dynamic amount is NOT printed as a wrong number.
  const dynamic = unlessPrompt(
    withWaiting(unless({ cost: { type: 'PayLife', amount: { type: 'Ref', qty: 'X' } } }))
  )!;
  expect(dynamic.cost).toEqual({ kind: 'other' });
  expect(unlessCostLabel(dynamic.cost)).toBeNull();
});

test('an object cost is admitted, not invented', () => {
  const prompt = unlessPrompt(withWaiting(unless({ cost: { type: 'Sacrifice', filter: {} } })))!;
  expect(prompt.cost).toEqual({ kind: 'other' });
  expect(unlessCostLabel(prompt.cost)).toBeNull();
  // A mana cost the engine did not fill in is no cost text either.
  const empty = unlessPrompt(withWaiting(unless({ cost: { type: 'Mana', cost: {} } })))!;
  expect(empty.cost).toEqual({ kind: 'other' });
});

test('"unless any player pays" publishes the seats left to poll', () => {
  const prompt = unlessPrompt(withWaiting(unless({ player: 1, remaining: [2, 3] }), 1))!;
  expect(prompt.player).toBe(1);
  expect(prompt.remaining).toEqual([2, 3]);
  // Nothing numeric to render for junk entries.
  const noisy = unlessPrompt(withWaiting(unless({ player: 1, remaining: [2, null, 'x'] }), 1))!;
  expect(noisy.remaining).toEqual([2]);
});

test('the answer is the engine action, both ways', () => {
  expect(payUnlessCost(true)).toEqual({ type: 'PayUnlessCost', data: { pay: true } });
  expect(payUnlessCost(false)).toEqual({ type: 'PayUnlessCost', data: { pay: false } });
});

test('there is no unless prompt for another decision', () => {
  expect(unlessPrompt(withWaiting({ type: 'ManaPayment', data: {} }))).toBeNull();
  expect(unlessPrompt(null)).toBeNull();
});
