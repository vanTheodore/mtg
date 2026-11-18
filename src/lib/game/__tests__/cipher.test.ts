import { describe, expect, test } from 'bun:test';
import { cipherOffers, cipherPrompt, type CipherPrompt } from '../interaction.ts';
import type { EngineSnapshot, GameAction, ObjectId } from '../../engine/types.ts';

function snapshot(data: Record<string, unknown>, viewer = 0): EngineSnapshot {
  return {
    viewer,
    state: { waiting_for: { type: 'CipherEncodeChoice', data }, objects: {} },
    legal: { actions: [] }
  } as unknown as EngineSnapshot;
}

const encode = (creature: number | null): GameAction =>
  ({ type: 'CipherEncode', data: { creature } }) as GameAction;

describe('CR 702.99a — cipher is a published host, and decline is a published null', () => {
  test('a missing prompt is not a cipher choice', () => {
    expect(cipherPrompt(null)).toBeNull();
  });

  test('the card and the hosts come from the prompt, including a redacted 0', () => {
    const prompt = cipherPrompt(snapshot({
      player: 0,
      card_id: 442,
      creatures: [443, 0, 444]
    }));
    expect(prompt).toEqual({
      player: 0,
      cardId: 442 as ObjectId,
      creatures: [443, 0, 444]
    } satisfies CipherPrompt);
  });

  test('a missing field is not invented', () => {
    const prompt = cipherPrompt(snapshot({ creatures: [443, 'x'] }));
    expect(prompt?.cardId).toBeNull();
    expect(prompt?.creatures).toEqual([443]);
  });

  test('null declines, zero is not a host, and the first published action wins', () => {
    const first = encode(443);
    const decline = encode(null);
    const offers = cipherOffers([
      first,
      encode(443),
      encode(0),
      decline,
      { type: 'CipherEncode', data: {} } as GameAction,
      encode(444)
    ]);
    expect(offers.byCreature.get(443)).toBe(first);
    expect(offers.byCreature.has(0)).toBe(false);
    expect([...offers.byCreature.keys()]).toEqual([443, 444]);
    expect(offers.decline).toBe(decline);
  });

  test('decline is absent when the engine did not publish it', () => {
    expect(cipherOffers([encode(443)]).decline).toBeNull();
  });
});
