import { describe, expect, test } from 'bun:test';
import { clashOffers, clashPlacementPrompt, clashPrompt } from '../interaction.ts';
import type { EngineSnapshot, GameAction, ObjectId } from '../../engine/types.ts';

function snapshot(type: string, data: Record<string, unknown>, viewer = 0): EngineSnapshot {
  return {
    viewer,
    state: { waiting_for: { type, data }, objects: {} },
    legal: { actions: [] }
  } as unknown as EngineSnapshot;
}

const pick = (opponent: number): GameAction =>
  ({ type: 'ChooseClashOpponent', data: { opponent } }) as GameAction;

describe('CR 701.30b — a clash opponent is a published seat, not a reordered one', () => {
  test('a missing prompt is not a clash choice', () => {
    expect(clashPrompt(null)).toBeNull();
    expect(clashPlacementPrompt(null)).toBeNull();
  });

  test('the candidates are the wire order and the prompt is the other window', () => {
    const prompt = clashPrompt(snapshot('ClashChooseOpponent', { player: 1, candidates: [3, 2] }));
    expect(prompt?.candidates).toEqual([3, 2]);
    expect(prompt?.player).toBe(1);
    // A `TopOrBottomChoice` is not a clash opponent, and the reverse.
    expect(clashPrompt(snapshot('TopOrBottomChoice', { candidates: [2] }))).toBeNull();
    expect(clashPlacementPrompt(snapshot('ClashChooseOpponent', { player: 0 }))).toBeNull();
  });

  test('a blank or negative candidate is not a button, and the first action wins', () => {
    const prompt = clashPrompt(snapshot('ClashChooseOpponent', { candidates: [2, -1, '3'] }));
    expect(prompt?.candidates).toEqual([2]);
    const first = pick(2);
    const offers = clashOffers([first, pick(2), pick(3), { type: 'ChooseClashOpponent', data: {} } as GameAction]);
    expect(offers.byOpponent.get(2)).toBe(first);
    expect(offers.byOpponent.has(3)).toBe(true);
    expect(offers.byOpponent.size).toBe(2);
  });

  test('a window without a published candidate list offers nothing', () => {
    expect(clashPrompt(snapshot('ClashChooseOpponent', { player: 0 }))?.candidates).toEqual([]);
    expect(clashOffers([]).byOpponent.size).toBe(0);
  });
});

describe('CR 701.30c — the placement names the revealed card and the queue', () => {
  test('the card and the APNAP queue are the published ones', () => {
    const prompt = clashPlacementPrompt(
      snapshot('ClashCardPlacement', { player: 0, card: 512, remaining: [[1, 513]] })
    );
    expect(prompt?.cardId).toBe(512 as ObjectId);
    expect(prompt?.remaining).toEqual([1]);
    expect(prompt?.player).toBe(0);
  });

  test('a hidden card (0) is not named, and the tally is not a queue', () => {
    const prompt = clashPlacementPrompt(
      snapshot('ClashCardPlacement', { player: 1, card: 0, remaining: [], bottom_cards: [512] })
    );
    expect(prompt?.cardId).toBeNull();
    expect(prompt?.remaining).toEqual([]);
  });

  test('the placement answers with the library-position booleans', () => {
    // The engine's `ClashCardPlacement` arm takes `ChooseTopOrBottom`, so the
    // offers are read by the same parser — no second boolean vocabulary.
    const prompt = clashPlacementPrompt(snapshot('ClashCardPlacement', { player: 0, card: 512 }));
    expect(prompt?.cardId).toBe(512 as ObjectId);
    expect(prompt?.remaining).toEqual([]);
  });
});
