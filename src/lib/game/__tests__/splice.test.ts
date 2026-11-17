import { describe, expect, test } from 'bun:test';
import { spliceOffers, splicePrompt, type SplicePrompt } from '../interaction.ts';
import type { EngineSnapshot, GameAction, ObjectId } from '../../engine/types.ts';

function snapshot(data: Record<string, unknown>, viewer = 0): EngineSnapshot {
  return {
    viewer,
    state: { waiting_for: { type: 'SpliceOffer', data }, objects: {} },
    legal: { actions: [] }
  } as unknown as EngineSnapshot;
}

const splice = (card: number | null): GameAction =>
  ({ type: 'RespondToSpliceOffer', data: { card } }) as GameAction;

describe('CR 702.47a — splice is a published card, and decline is a published null', () => {
  test('a missing prompt is not a splice offer', () => {
    expect(splicePrompt(null)).toBeNull();
  });

  test('the spell and the eligible cards come from the prompt, including a redacted 0', () => {
    const prompt = splicePrompt(snapshot({
      player: 0,
      pending_cast: { object_id: 12 },
      eligible: [4, 0, 8]
    }));
    expect(prompt).toEqual({
      player: 0,
      spellId: 12 as ObjectId,
      eligible: [4, 0, 8]
    } satisfies SplicePrompt);
  });

  test('a missing field is not invented', () => {
    const prompt = splicePrompt(snapshot({ eligible: [4, 'x'] }));
    expect(prompt?.spellId).toBeNull();
    expect(prompt?.eligible).toEqual([4]);
  });

  test('null declines, zero is not a card, and the first published action wins', () => {
    const first = splice(4);
    const decline = splice(null);
    const offers = spliceOffers([
      first,
      splice(4),
      splice(0),
      decline,
      { type: 'RespondToSpliceOffer', data: {} } as GameAction,
      splice(8)
    ]);
    expect(offers.byCard.get(4)).toBe(first);
    expect(offers.byCard.has(0)).toBe(false);
    expect([...offers.byCard.keys()]).toEqual([4, 8]);
    expect(offers.decline).toBe(decline);
  });

  test('decline is absent when the engine did not publish it', () => {
    expect(spliceOffers([splice(4)]).decline).toBeNull();
  });
});
