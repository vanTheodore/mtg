import { describe, expect, test } from 'bun:test';
import { typeSlotOffers, typeSlotPrompt, type TypeSlotPrompt } from '../interaction.ts';
import type { EngineSnapshot, GameAction, ObjectId } from '../../engine/types.ts';

function snapshot(data: Record<string, unknown>, viewer = 0): EngineSnapshot {
  return {
    viewer,
    state: { waiting_for: { type: 'ChoosePermanentTypeSlot', data }, objects: {} },
    legal: { actions: [] }
  } as unknown as EngineSnapshot;
}

const action = (slot: string): GameAction =>
  ({ type: 'ChoosePermanentTypeSlot', data: { slot } }) as GameAction;

describe('CR 110.4 — the type slot is a published slot, not a type the card has', () => {
  test('a missing prompt is not a slot choice', () => {
    expect(typeSlotPrompt(null)).toBeNull();
  });

  test('published slots keep their order, and a missing permission is a land play', () => {
    const prompt = typeSlotPrompt(snapshot({
      player: 0,
      object_id: 9,
      card_id: 700,
      source: 3,
      payment_mode: 'Auto',
      available_slots: ['Artifact', 'Creature']
    }));
    expect(prompt).toEqual({
      player: 0,
      objectId: 9 as ObjectId,
      cardId: 700,
      sourceId: 3 as ObjectId,
      paymentMode: 'Auto',
      slots: ['Artifact', 'Creature'],
      hasPermission: false
    } satisfies TypeSlotPrompt);
  });

  test('a published permission is present, and a tagged slot keeps its name', () => {
    const prompt = typeSlotPrompt(snapshot({
      player: 1,
      object_id: 4,
      payment_mode: { type: 'ExileThis' },
      available_slots: [{ type: 'Enchantment' }, 'Land'],
      permission: { source: 2, type_slot: 'Enchantment' }
    }));
    expect(prompt?.slots).toEqual(['Enchantment', 'Land']);
    expect(prompt?.paymentMode).toBe('ExileThis');
    expect(prompt?.hasPermission).toBe(true);
  });

  test('a blank slot is dropped, and a missing field is not invented', () => {
    const prompt = typeSlotPrompt(snapshot({ available_slots: ['', 4, 'Battle'] }));
    expect(prompt?.slots).toEqual(['Battle']);
    expect(prompt?.objectId).toBeNull();
    expect(prompt?.cardId).toBeNull();
    expect(prompt?.sourceId).toBeNull();
  });

  test('a slot is a button only when the engine published it', () => {
    const offers = typeSlotOffers([
      action('Creature'),
      action('Artifact'),
      { type: 'ChoosePermanentTypeSlot', data: { slot: { type: 'Land' } } } as GameAction,
      action('Creature'),
      { type: 'ChoosePermanentTypeSlot', data: { slot: '' } } as GameAction,
      { type: 'CancelCast' } as GameAction
    ]);
    expect([...offers.bySlot.keys()]).toEqual(['Creature', 'Artifact', 'Land']);
    expect(offers.bySlot.get('Creature')).toBeDefined();
  });
});
