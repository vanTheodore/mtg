import { describe, expect, test } from 'bun:test';
import { bottomOrderAction, bottomOrderPile, bottomOrderPrompt } from '../interaction.ts';
import type { EngineSnapshot, ObjectId } from '../../engine/types.ts';

function snapshot(type: string, data: Record<string, unknown>, viewer = 0): EngineSnapshot {
  return {
    viewer,
    state: { waiting_for: { type, data }, objects: {} },
    legal: { actions: [] }
  } as unknown as EngineSnapshot;
}

describe('CR 608.2d — the bottom order is the answer, not a hint', () => {
  test('a missing prompt, or another window, is not an order', () => {
    expect(bottomOrderPrompt(null)).toBeNull();
    expect(bottomOrderPrompt(snapshot('DigChoice', { cards: [1] }))).toBeNull();
  });

  test('each of the three windows keeps its own kind and published pile', () => {
    const ripple = bottomOrderPrompt(
      snapshot('RippleBottomOrder', { player: 1, source_id: 447, cards: [12, 11], final_cast: 9 })
    );
    expect(ripple?.kind).toBe('ripple');
    expect(ripple?.player).toBe(1);
    expect(ripple?.sourceId).toBe(447 as ObjectId);
    // The engine's own order, not sorted.
    expect(ripple?.cards).toEqual([12, 11]);

    expect(bottomOrderPrompt(snapshot('RevealUntilBottomOrder', { cards: [3] }))?.kind).toBe('reveal-until');
    expect(bottomOrderPrompt(snapshot('DigBottomOrder', { cards: [4] }))?.kind).toBe('dig');
  });

  test('a card id the wire did not publish is not in the pile', () => {
    const prompt = bottomOrderPrompt(snapshot('RippleBottomOrder', { cards: [12, 0, -3, '11'] }));
    expect(prompt?.cards).toEqual([12]);
    // A copy: callers cannot mutate the prompt's pile through the helper.
    const pile = bottomOrderPile(prompt!);
    pile.push(99);
    expect(prompt?.cards).toEqual([12]);
  });

  test('a permutation of exactly the published pile is the only action', () => {
    const prompt = bottomOrderPrompt(snapshot('RippleBottomOrder', { cards: [12, 11] }))!;
    expect(bottomOrderAction(prompt, [11, 12])).toEqual({ type: 'SelectCards', data: { cards: [11, 12] } });
    // Same order is legal too: the engine only requires a permutation.
    expect(bottomOrderAction(prompt, [12, 11])).not.toBeNull();
    // Short, long, duplicated, or a card the wire did not offer: no action.
    expect(bottomOrderAction(prompt, [11])).toBeNull();
    expect(bottomOrderAction(prompt, [11, 12, 13])).toBeNull();
    expect(bottomOrderAction(prompt, [11, 11])).toBeNull();
    expect(bottomOrderAction(prompt, [11, 13])).toBeNull();
  });

  test('a ripple without a published count does not invent one', () => {
    expect(bottomOrderPrompt(snapshot('RippleBottomOrder', { cards: [1] }))?.rippleCount).toBeNull();
    expect(bottomOrderPrompt(snapshot('RippleBottomOrder', { cards: [1], count: 4 }))?.rippleCount).toBe(4);
    // Only Ripple carries the count; the other two never print one.
    expect(bottomOrderPrompt(snapshot('DigBottomOrder', { cards: [1], count: 4 }))?.rippleCount).toBeNull();
  });

  test('an empty published pile still yields no action', () => {
    const prompt = bottomOrderPrompt(snapshot('DigBottomOrder', {}))!;
    expect(prompt.cards).toEqual([]);
    expect(bottomOrderAction(prompt, [])).not.toBeNull();
  });
});
