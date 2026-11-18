import { expect, test } from 'bun:test';
import {
  parseAmount,
  payAmountKey,
  payAmountLabel,
  payAmountPrompt,
  payAmountResource,
  submitPayAmount
} from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 107.1c + CR 118.1: the engine owns the window and names the resource; Mesa
 * only reads it. CR 732.2a is the odd one out — a loop collapse asks for a
 * count of cycles, not a payment — and treating it as a cost would tell the
 * player they are spending something that nothing spends.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 1,
    revision: 12,
    actions_applied: 12,
    metrics: {},
    state: {
      turn_number: 2,
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

const pay = (data: Record<string, unknown> = {}) => ({
  type: 'PayAmountChoice',
  data: { player: 0, resource: { type: 'Life' }, min: 1, max: 4, accumulated: 0, source_id: 100, ...data }
});

test('an amount prompt reads the window and the source from the engine', () => {
  const prompt = payAmountPrompt(withWaiting(pay()))!;
  expect(prompt.player).toBe(0);
  expect(prompt.sourceId).toBe(100);
  expect([prompt.min, prompt.max]).toEqual([1, 4]);
  expect(prompt.accumulated).toBe(0);
  expect(prompt.pendingManaAbility).toBe(false);
  expect(prompt.resource).toEqual({ kind: 'life' });
});

test('a mana amount keeps the composition that tells {X}{W} from "pay any amount of {R}"', () => {
  const perUnit = payAmountPrompt(withWaiting(pay({ resource: { type: 'ManaGeneric', composition: 'PerUnit' } })))!;
  expect(perUnit.resource).toEqual({ kind: 'mana', composition: 'perUnit' });
  // `ConcretizeX` is the serde default, so a payload without `composition` is X.
  const concretize = payAmountPrompt(withWaiting(pay({ resource: { type: 'ManaGeneric' } })))!;
  expect(concretize.resource).toEqual({ kind: 'mana', composition: 'concretizeX' });
});

test('every payable resource the engine can send is named', () => {
  const kinds = ['Energy', 'Counters', 'Speed', 'Life'].map(
    (type) => payAmountPrompt(withWaiting(pay({ resource: { type } })))!.resource.kind
  );
  expect(kinds).toEqual(['energy', 'counters', 'speed', 'life']);
});

test('a loop collapse is a count of cycles, and its axis is read from the engine', () => {
  const base = { resource: { type: 'LoopCollapse', axis: 'Counters' }, min: 0, max: 6 };
  const prompt = payAmountPrompt(withWaiting(pay(base)))!;
  expect(prompt.resource).toEqual({ kind: 'loop', axis: 'counters' });
  expect(payAmountResource(prompt)).toBe('contadores');
  // Nothing is spent, so the label must never say "pagar".
  expect(payAmountLabel(prompt, 3)).toBe('Aplicar 3 · 3 contadores');
  expect(payAmountLabel(prompt, 1)).toBe('Aplicar 1 ciclo · 1 contador');
  expect(payAmountLabel(prompt, 3)).not.toContain('Pagar');
  expect(payAmountPrompt(withWaiting(pay({ resource: { type: 'LoopCollapse', axis: 'Tokens' } })))!.resource)
    .toEqual({ kind: 'loop', axis: 'tokens' });
});

test('the label names the resource and refuses to invent an amount', () => {
  const prompt = payAmountPrompt(withWaiting(pay()))!;
  expect(payAmountLabel(prompt, 2)).toBe('Pagar 2 vida');
  expect(payAmountLabel(prompt, null)).toBe('Pagar ? vida');
  expect(payAmountResource(prompt)).toBe('vida');
});

test('the prompt identity separates two seats that share a source and a window', () => {
  const first = payAmountPrompt(withWaiting(pay()))!;
  const otherSeat = payAmountPrompt(withWaiting(pay({ player: 1 })))!;
  expect(payAmountKey(first)).not.toBe(payAmountKey(otherSeat));
  // CR 107.1c: a grown `accumulated` moves the window, so it is part of the key.
  const grown = payAmountPrompt(withWaiting(pay({ accumulated: 3, min: 3, max: 6 })))!;
  expect(payAmountKey(first)).not.toBe(payAmountKey(grown));
});

test('an entry is digits inside the window, never a coercible string', () => {
  expect(parseAmount('3', 1, 4)).toBe(3);
  expect(parseAmount('1', 1, 4)).toBe(1);
  expect(parseAmount('4', 1, 4)).toBe(4);
  // Outside, or not digits: rejected rather than clamped.
  for (const raw of ['0', '5', '', ' 2 ', '1.5', '1e1', '+2', '0x2', '-1']) {
    expect(parseAmount(raw, 1, 4)).toBeNull();
  }
  // 0 is a legal amount when the engine says so — the truthiness trap.
  expect(parseAmount('0', 0, 4)).toBe(0);
});

test('the submission is the engine action, with the amount', () => {
  expect(submitPayAmount(3)).toEqual({ type: 'SubmitPayAmount', data: { amount: 3 } });
});

test('there is no amount prompt for another decision', () => {
  expect(payAmountPrompt(withWaiting({ type: 'ChooseXValue', data: {} }))).toBeNull();
  expect(payAmountPrompt(null)).toBeNull();
});
