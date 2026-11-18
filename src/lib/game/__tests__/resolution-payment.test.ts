import { describe, expect, test } from 'bun:test';
import { resolutionPaymentOffers, resolutionPaymentPrompt } from '../interaction.ts';
import type { EngineSnapshot, GameAction, ObjectId } from '../../engine/types.ts';

function snapshot(data: Record<string, unknown>, viewer = 0): EngineSnapshot {
  return {
    viewer,
    state: { waiting_for: { type: 'ResolutionOptionalPaymentChoice', data }, objects: {} },
    legal: { actions: [] }
  } as unknown as EngineSnapshot;
}

const pay = (index: number): GameAction =>
  ({ type: 'ChooseResolutionOptionalPaymentBranch', data: { choice: { type: 'Pay', data: { index } } } }) as GameAction;
const decline = { type: 'ChooseResolutionOptionalPaymentBranch', data: { choice: { type: 'Decline' } } } as GameAction;

describe('CR 118.12 — a resolution branch is a published index, and decline is a published tag', () => {
  test('a missing prompt is not a payment choice', () => {
    expect(resolutionPaymentPrompt(null)).toBeNull();
  });

  test('the index stays the engine index, including a gap', () => {
    const prompt = resolutionPaymentPrompt(snapshot({
      player: 0,
      source_id: 446,
      costs: [
        { index: 0, cost: { type: 'PayLife', amount: { type: 'Fixed', value: 2 } } },
        { index: 2, cost: { type: 'Sacrifice' } }
      ]
    }));
    expect(prompt?.sourceId).toBe(446 as ObjectId);
    expect(prompt?.options.map((option) => option.index)).toEqual([0, 2]);
  });

  test('a blank index is dropped, and a missing field is not invented', () => {
    const prompt = resolutionPaymentPrompt(snapshot({ costs: [{ index: -1 }, { cost: {} }, { index: 1, cost: null }] }));
    expect(prompt?.sourceId).toBeNull();
    expect(prompt?.options.map((option) => option.index)).toEqual([1]);
  });

  test('decline is the tagged variant, and the first published action wins', () => {
    const first = pay(2);
    const offers = resolutionPaymentOffers([
      first,
      pay(2),
      pay(0),
      decline,
      { type: 'ChooseResolutionOptionalPaymentBranch', data: { choice: 'Decline' } } as GameAction,
      { type: 'ChooseResolutionOptionalPaymentBranch', data: {} } as GameAction
    ]);
    expect(offers.byIndex.get(2)).toBe(first);
    expect([...offers.byIndex.keys()]).toEqual([2, 0]);
    expect(offers.decline).toBe(decline);
  });

  test('decline is absent when the engine did not publish it', () => {
    expect(resolutionPaymentOffers([pay(0)]).decline).toBeNull();
  });
});
