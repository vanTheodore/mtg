import { describe, expect, test } from 'bun:test';
import { giftRecipientOffers, giftRecipientPrompt } from '../interaction.ts';
import type { EngineSnapshot, GameAction, ObjectId } from '../../engine/types.ts';

function snapshot(data: Record<string, unknown>, viewer = 0): EngineSnapshot {
  return {
    viewer,
    state: { waiting_for: { type: 'ChooseGiftRecipient', data }, objects: {} },
    legal: { actions: [] }
  } as unknown as EngineSnapshot;
}

const pick = (opponent: number): GameAction =>
  ({ type: 'ChooseGiftRecipient', data: { opponent } }) as GameAction;
const cancel = { type: 'CancelCast' } as GameAction;

describe('CR 115.10a — a recipient is a published opponent, not a reordered seat', () => {
  test('a missing prompt is not a recipient choice', () => {
    expect(giftRecipientPrompt(null)).toBeNull();
  });

  test('an absent purpose is Gift, and the kind is the published one', () => {
    const prompt = giftRecipientPrompt(snapshot({
      player: 0,
      candidates: [2, 1],
      gift_kind: { type: 'Card' },
      pending_cast: { object_id: 447 }
    }));
    expect(prompt?.purpose).toBe('gift');
    expect(prompt?.giftKind).toBe('card');
    expect(prompt?.candidates).toEqual([2, 1]);
    expect(prompt?.spellId).toBe(447 as ObjectId);
    expect(prompt?.lifeGain).toBeNull();
  });

  test('an effect cost prints the fixed life and does not invent a gift', () => {
    const prompt = giftRecipientPrompt(snapshot({
      purpose: { type: 'EffectCost', cost: { type: 'EffectCost', data: { effect: { type: 'GainLife', amount: { type: 'Fixed', value: 3 } } } } },
      candidates: [1]
    }));
    expect(prompt?.purpose).toBe('effect-cost');
    expect(prompt?.lifeGain).toBe(3);
    expect(prompt?.giftKind).toBeNull();
  });

  test('a blank opponent, an unreadable kind and an unfixed amount are not invented', () => {
    const prompt = giftRecipientPrompt(snapshot({
      candidates: [1, -1, '2'],
      gift_kind: { type: 'Octopus' },
      purpose: { type: 'EffectCost', cost: { type: 'EffectCost', data: { effect: { type: 'GainLife', amount: { type: 'Ref', qty: 'X' } } } } }
    }));
    expect(prompt?.candidates).toEqual([1]);
    expect(prompt?.giftKind).toBe('unknown');
    expect(prompt?.lifeGain).toBeNull();
    expect(prompt?.spellId).toBeNull();
  });

  test('a button is the published opponent, and cancel exists only when published', () => {
    const first = pick(2);
    const offers = giftRecipientOffers([first, pick(2), pick(1), cancel, { type: 'ChooseGiftRecipient', data: {} } as GameAction]);
    expect(offers.byOpponent.get(2)).toBe(first);
    expect([...offers.byOpponent.keys()]).toEqual([2, 1]);
    expect(offers.cancel).toBe(cancel);
    expect(giftRecipientOffers([pick(1)]).cancel).toBeNull();
  });
});
