import { describe, expect, test } from 'bun:test';
import { costOrderOffers, costOrderPrompt } from '../interaction.ts';
import type { EngineSnapshot, GameAction, ObjectId } from '../../engine/types.ts';

function snapshot(data: Record<string, unknown>, viewer = 0): EngineSnapshot {
  return {
    viewer,
    state: { waiting_for: { type: 'OrderCostReductions', data }, objects: {} },
    legal: { actions: [] }
  } as unknown as EngineSnapshot;
}

const election = (order: number[], hybrid?: string[]): GameAction =>
  ({
    type: 'OrderCostReductions',
    data: hybrid ? { order, hybrid_announcement: hybrid } : { order }
  }) as GameAction;

describe('CR 601.2f — a locked total is a published election, not a reordered list', () => {
  test('a missing prompt is not an ordering', () => {
    expect(costOrderPrompt(null)).toBeNull();
  });

  test('reductions and outcomes keep the engine order, and an omitted reach is not a rider', () => {
    const prompt = costOrderPrompt(snapshot({
      player: 0,
      pending_cast: { object_id: 445 },
      reductions: [
        { display_name: 'Thunderscape Familiar', amount: { type: 'Cost', generic: 0, shards: ['Red'] }, multiplier: 1 },
        { display_name: 'Morophon, the Boundless', amount: { type: 'Cost', shards: ['Red'] }, multiplier: 2, reach: 'ColoredManaOnly', minimum_mana: 1 }
      ],
      hybrid_symbols: ['WhiteBlue'],
      outcomes: [
        { order: [1, 0], hybrid_announcement: ['White'], locked_cost: { type: 'Cost', shards: ['Red'] } },
        { order: [0, 1], locked_cost: { type: 'Cost', generic: 1, shards: ['Red'] } }
      ]
    }));
    expect(prompt?.spellId).toBe(445 as ObjectId);
    expect(prompt?.reductions.map((entry) => entry.name)).toEqual(['Thunderscape Familiar', 'Morophon, the Boundless']);
    expect(prompt?.reductions[0].reach).toBe('');
    expect(prompt?.reductions[1].reach).toBe('ColoredManaOnly');
    expect(prompt?.reductions[1].multiplier).toBe(2);
    expect(prompt?.reductions[1].minimumMana).toBe(1);
    expect(prompt?.hybridSymbols).toEqual(['WhiteBlue']);
    expect(prompt?.outcomes.map((outcome) => outcome.key)).toEqual(['1.0|White', '0.1|']);
  });

  test('a junk order is dropped, and a missing field is not invented', () => {
    const prompt = costOrderPrompt(snapshot({
      outcomes: [{ order: [0, 'x'] }, { order: [0] }]
    }));
    expect(prompt?.spellId).toBeNull();
    expect(prompt?.outcomes.map((outcome) => outcome.order)).toEqual([[0]]);
    expect(prompt?.hybridSymbols).toEqual([]);
  });

  test('only an exact published election is a button, and cancel exists only when published', () => {
    const first = election([1, 0], ['White']);
    const cancel = { type: 'CancelCast' } as GameAction;
    const offers = costOrderOffers([
      first,
      election([1, 0], ['White']),
      election([0, 1]),
      election([1, 0], ['Blue']),
      { type: 'OrderCostReductions', data: { order: [1, 'x'] } } as GameAction,
      cancel
    ]);
    expect(offers.byKey.get('1.0|White')).toBe(first);
    expect(offers.byKey.has('0.1|')).toBe(true);
    expect(offers.byKey.has('1.0|Blue')).toBe(true);
    expect([...offers.byKey.keys()]).toEqual(['1.0|White', '0.1|', '1.0|Blue']);
    expect(offers.cancel).toBe(cancel);
  });

  test('cancel is absent when the engine did not publish it', () => {
    expect(costOrderOffers([election([0, 1])]).cancel).toBeNull();
  });
});
