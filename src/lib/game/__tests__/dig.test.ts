import { expect, test } from 'bun:test';
import { digPrompt, digReady, togglePick } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 701.20e: "look at the top N" shows hidden cards, the player keeps some and
 * the rest goes somewhere. The engine publishes every part of that — the cards,
 * the ones passing the filter, how many may be kept and where each pile ends
 * up — because "on top of your library" and "into your hand" are different
 * decisions over the same cards.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 42,
    revision: 7,
    actions_applied: 7,
    metrics: {},
    state: {
      turn_number: 3,
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

const dig = (data: Record<string, unknown> = {}) => ({
  type: 'DigChoice',
  data: { player: 0, cards: [1, 2, 3], keep_count: 1, up_to: false, selectable_cards: [1, 2], ...data }
});

test('the prompt repeats the cards, the filter and the window', () => {
  expect(digPrompt(withWaiting(dig({ kept_destination: 'Hand', rest_destination: 'Graveyard' })))).toEqual({
    player: 0,
    cards: [1, 2, 3],
    selectable: [1, 2],
    count: 1,
    partial: false,
    keptLabel: 'tu mano',
    restLabel: 'van al cementerio',
    enterTapped: false,
    entersAttacking: false
  });
});

test('there is no dig prompt when the engine is asking something else', () => {
  expect(digPrompt(withWaiting({ type: 'SearchChoice', data: { player: 0, cards: [] } }))).toBeNull();
  expect(digPrompt(null)).toBeNull();
});

test('keeping "on top of the library" says so, and is not "into your hand"', () => {
  const prompt = digPrompt(withWaiting(dig({ kept_destination: 'Library' })))!;
  expect(prompt.keptLabel).toBe('la parte superior de tu biblioteca');
  expect(prompt.keptLabel).not.toContain('mano');
});

test('CR 701.20e: the unkept pile may stay where it was', () => {
  // `rest_remainder: StayInLibrary` is serialized only when it is NOT the
  // routing default: the cards were looked at and never moved.
  expect(digPrompt(withWaiting(dig({ rest_remainder: 'StayInLibrary' })))!.restLabel)
    .toBe('se quedan en la biblioteca');
  // A Telling Time-class split is a follow-up prompt, and the label says so.
  expect(digPrompt(withWaiting(dig({ rest_split_top_count: 1 })))!.restLabel).toContain('se reparten');
  expect(digPrompt(withWaiting(dig({ rest_destination: 'Library' })))!.restLabel)
    .toBe('van al fondo de tu biblioteca');
  expect(digPrompt(withWaiting(dig({ kept_destination: 'Battlefield', enter_tapped: true })))!.enterTapped).toBe(true);
});

test('no filter means every looked-at card is eligible', () => {
  const prompt = digPrompt(withWaiting(dig({ cards: [1, 2], selectable_cards: [], keep_count: 2 })))!;
  expect(prompt.selectable).toEqual([1, 2]);
  expect(prompt.count).toBe(2);
  // A filter that names a card that is not there cannot widen the set.
  expect(digPrompt(withWaiting(dig({ selectable_cards: [9] })))!.selectable).toEqual([]);
});

test('the window is capped by what the filter allows', () => {
  const prompt = digPrompt(withWaiting(dig({ keep_count: 3, selectable_cards: [1] })))!;
  expect(prompt.count).toBe(1);
  expect(digReady(prompt, [1])).toBe(true);
  expect(digReady(prompt, [1, 2])).toBe(false);
});

test('an exact keep demands its count; an up-to keep accepts fewer', () => {
  const exact = digPrompt(withWaiting(dig()))!;
  expect(digReady(exact, [])).toBe(false);
  expect(digReady(exact, [1])).toBe(true);
  // A card outside the filter is never an answer.
  expect(digReady(exact, [3])).toBe(false);

  const upTo = digPrompt(withWaiting(dig({ up_to: true, keep_count: 2 })))!;
  expect(digReady(upTo, [])).toBe(true);
  expect(digReady(upTo, [1])).toBe(true);
  expect(digReady(upTo, [1, 2])).toBe(true);
  expect(digReady(upTo, [1, 2, 3])).toBe(false);
});

test('togglePick never exceeds the limit and ignores cards outside the set', () => {
  expect(togglePick([1, 2], [], 1, 2)).toEqual([1]);
  // Un-ticking always works, even at the limit.
  expect(togglePick([1, 2], [1], 1, 2)).toEqual([]);
  // A card outside the published set returns the SAME array: nothing to resend.
  const chosen = [1];
  expect(togglePick([1, 2], chosen, 9, 2)).toBe(chosen);
  // So does a click that would exceed the window.
  expect(togglePick([1, 2], chosen, 2, 1)).toBe(chosen);
});
