import { expect, test } from 'bun:test';
import { castingVariantName, castingVariantOffers, castingVariantPrompt } from '../interaction';
import type { EngineSnapshot, GameAction } from '../../engine/types';

/**
 * CR 601.2b: `CastingVariantChoice`. The options keep the engine's index, and
 * a button exists only for an index `legal.actions` already published.
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

test('an externally tagged variant keeps its name, and a missing index is not rebuilt', () => {
  const wear = { type: 'Cost', generic: 1, shards: ['Red'] };
  const tear = { type: 'Cost', generic: 0, shards: ['White'] };
  const fuse = { type: 'Cost', generic: 1, shards: ['Red', 'White'] };
  const prompt = castingVariantPrompt(withWaiting({
    type: 'CastingVariantChoice',
    data: {
      player: 0,
      object_id: 33,
      card_id: 33,
      options: [
        { variant: 'Normal', face: 'Left', mana_cost: wear },
        { variant: 'Normal', face: 'Right', mana_cost: tear },
        { variant: 'Fuse', face: 'Current', mana_cost: fuse }
      ]
    }
  }));
  expect(prompt?.options.map((option) => [option.index, option.variant, option.face])).toEqual([
    [0, 'Normal', 'Left'],
    [1, 'Normal', 'Right'],
    [2, 'Fuse', 'Current']
  ]);
  expect(prompt?.paymentMode).toBe('Auto');
  const left = { type: 'ChooseCastingVariant', data: { index: 0 } } as GameAction;
  const fused = { type: 'ChooseCastingVariant', data: { index: 2 } } as GameAction;
  const offers = castingVariantOffers([
    left,
    fused,
    { type: 'ChooseCastingVariant', data: { index: '1' } },
    { type: 'ChooseCastingVariant', data: { index: -1 } }
  ]);
  expect(offers.byIndex.get(0)).toBe(left);
  expect(offers.byIndex.has(1)).toBe(false);
  expect(offers.byIndex.get(2)).toBe(fused);
  expect(offers.cancel).toBeNull();
  expect(castingVariantName({ GraveyardPermission: { source: 4, frequency: 'OncePerTurn' } })).toBe('GraveyardPermission');
});

test('a graveyard permission keeps the authority the engine announced', () => {
  const life = { type: 'PayLife', amount: { type: 'Fixed', value: 2 } };
  const prompt = castingVariantPrompt(withWaiting({
    type: 'CastingVariantChoice',
    data: {
      player: 0,
      object_id: 35,
      card_id: 35,
      payment_mode: 'Manual',
      options: [
        null,
        {
          variant: { GraveyardPermission: { source: 34, frequency: 'OncePerTurn' } },
          face: { type: 'Current' },
          mana_cost: { type: 'Cost', generic: 0, shards: ['White'] },
          authority: {
            announcement: {
              permission: { source: 34, grant: { type: 'Static', index: 0 } },
              grant_digest: 'aa',
              slot_type: 'Creature'
            },
            frequency: 'OncePerTurnPerPermanentType',
            extra_cost: { cost: life, mode: 'Additional' },
            enters_with_counter: 'P1P1'
          }
        }
      ]
    }
  }));
  expect(prompt?.paymentMode).toBe('Manual');
  expect(prompt?.options[0]).toEqual({
    index: 0,
    variant: '',
    face: '',
    manaCost: null,
    additionalCost: null,
    authority: null
  });
  expect(prompt?.options[1]?.variant).toBe('GraveyardPermission');
  expect(prompt?.options[1]?.face).toBe('Current');
  expect(prompt?.options[1]?.authority).toEqual({
    sourceId: 34,
    frequency: 'OncePerTurnPerPermanentType',
    slotType: 'Creature',
    extraMode: 'Additional',
    extraCost: life,
    counter: 'P1P1'
  });
  const cancel = { type: 'CancelCast' } as GameAction;
  expect(castingVariantOffers([cancel]).cancel).toBe(cancel);
});

test('a neighbour window is not this one, and an unknown variant is still named', () => {
  expect(castingVariantPrompt(withWaiting({ type: 'AlternativeCastChoice', data: {} }))).toBeNull();
  expect(castingVariantName({ type: 'Freerunning' })).toBe('Freerunning');
  expect(castingVariantName(null)).toBe('');
});
