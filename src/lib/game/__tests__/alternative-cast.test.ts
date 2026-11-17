import { expect, test } from 'bun:test';
import { alternativeCastOffers, alternativeCastPrompt, emergeSacrificeLabel } from '../interaction';
import type { EngineSnapshot, GameAction } from '../../engine/types';

/**
 * CR 118.9: `AlternativeCastChoice`. The keyword chooses the words. The
 * buttons are the published `ChooseAlternativeCast` actions, and a side the
 * engine did not publish is not rebuilt.
 */
const withWaiting = (waiting: unknown) =>
  ({
    ok: true,
    viewer: 0,
    seed: 4,
    revision: 8,
    actions_applied: 8,
    metrics: {},
    state: {
      turn_number: 4,
      active_player: 0,
      priority_player: 0,
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

const normal = { type: 'ChooseAlternativeCast', data: { choice: { type: 'Normal' } } } as GameAction;
const alternative = { type: 'ChooseAlternativeCast', data: { choice: { type: 'Alternative' } } } as GameAction;

test('both published sides are the actions, and a string is not a choice', () => {
  const cost = { type: 'Cost', generic: 1, shards: ['Blue'] };
  const alt = { type: 'Cost', generic: 6, shards: ['Blue'] };
  const prompt = alternativeCastPrompt(withWaiting({
    type: 'AlternativeCastChoice',
    data: {
      player: 0,
      object_id: 12,
      card_id: 40,
      keyword: { type: 'Overload' },
      normal_cost: cost,
      alternative_cost: alt
    }
  }));
  expect(prompt).toEqual({
    player: 0,
    objectId: 12,
    cardId: 40,
    keyword: 'Overload',
    paymentMode: 'Auto',
    normalCost: cost,
    alternativeCost: alt,
    additionalCost: null,
    additionalDescription: null
  });
  const offers = alternativeCastOffers([
    normal,
    alternative,
    { type: 'ChooseAlternativeCast', data: { choice: 'Alternative' } },
    { type: 'PassPriority' }
  ]);
  expect(offers.normal).toBe(normal);
  expect(offers.alternative).toBe(alternative);
  expect(offers.cancel).toBeNull();
});

test('a missing mana portion stays missing, and emerge names the published quality', () => {
  const exile = { type: 'Exile', count: 1 };
  const description = { type: 'EmergeSacrifice', quality: { type: 'Creature' } };
  const prompt = alternativeCastPrompt(withWaiting({
    type: 'AlternativeCastChoice',
    data: {
      player: 1,
      object_id: 9,
      card_id: 9,
      keyword: { type: 'Emerge' },
      payment_mode: 'Manual',
      normal_cost: { type: 'Cost', generic: 8, shards: [] },
      alternative_additional_cost: exile,
      alternative_additional_cost_description: description
    }
  }));
  expect(prompt?.alternativeCost).toBeNull();
  expect(prompt?.additionalCost).toBe(exile);
  expect(prompt?.additionalDescription).toBe(description);
  expect(prompt?.paymentMode).toBe('Manual');
  expect(emergeSacrificeLabel(description)).toBe('una criatura');
  expect(emergeSacrificeLabel({ type: 'EmergeSacrifice', quality: { type: 'Subtype', data: 'Eldrazi' } })).toBe('un permanente Eldrazi');
  expect(emergeSacrificeLabel({ type: 'EmergeSacrifice', quality: { type: 'Goblin' } })).toBeNull();
});

test('a zero mana alternative is a cost, cancel exists only when published, and a neighbour is not this window', () => {
  const zero = { type: 'Cost', generic: 0, shards: [] };
  const prompt = alternativeCastPrompt(withWaiting({
    type: 'AlternativeCastChoice',
    data: { player: 0, keyword: 'Warp', alternative_cost: zero }
  }));
  expect(prompt?.keyword).toBe('Warp');
  expect(prompt?.alternativeCost).toBe(zero);
  const cancel = { type: 'CancelCast' } as GameAction;
  expect(alternativeCastOffers([normal, cancel]).cancel).toBe(cancel);
  expect(alternativeCastOffers([normal]).alternative).toBeNull();
  expect(alternativeCastPrompt(withWaiting({ type: 'ModalFaceChoice', data: {} }))).toBeNull();
});
