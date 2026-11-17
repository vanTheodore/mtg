import { expect, test } from 'bun:test';
import { modalFaceOffers, modalFacePrompt } from '../interaction';
import type { EngineSnapshot, GameAction } from '../../engine/types';

/**
 * CR 712.12 / CR 712.11b: `ModalFaceChoice`. The buttons are the published
 * actions. A face the engine did not offer is not a button, and cancel exists
 * only for the resolution-owned choice that published `CancelCast`.
 */
const withWaiting = (waiting: unknown, actions: GameAction[] = [], viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 4,
    revision: 8,
    actions_applied: 8,
    metrics: {},
    state: {
      turn_number: 4,
      active_player: viewer,
      priority_player: viewer,
      phase: 'PreCombatMain',
      players: [],
      battlefield: [],
      stack: [],
      exile: [],
      objects: {},
      waiting_for: waiting
    },
    derived: {},
    legal: { actions, spell_costs: {}, by_object: {} }
  }) as unknown as EngineSnapshot;

test('an ordinary cast offers both published faces and no cancel', () => {
  const front = { type: 'ChooseModalFace', data: { back_face: false } };
  const back = { type: 'ChooseModalFace', data: { back_face: true } };
  const prompt = modalFacePrompt(withWaiting({
    type: 'ModalFaceChoice',
    data: { player: 0, object_id: 12, card_id: 40 }
  }));
  expect(prompt).toEqual({
    player: 0,
    objectId: 12,
    cardId: 40,
    paymentMode: 'Auto',
    additionalCost: null
  });
  const offers = modalFaceOffers([front, back, { type: 'PassPriority' }]);
  expect(offers.front).toBe(front);
  expect(offers.back).toBe(back);
  expect(offers.cancel).toBeNull();
});

test('a resolution choice may offer one face, a cancel, and an added cost', () => {
  const back = { type: 'ChooseModalFace', data: { back_face: true } };
  const cancel = { type: 'CancelCast' };
  const cost = { type: 'Cost', shards: [], generic: 2 };
  const prompt = modalFacePrompt(withWaiting({
    type: 'ModalFaceChoice',
    data: {
      player: 0,
      object_id: 12,
      card_id: 40,
      payment_mode: 'Manual',
      resolution_additional_cost: cost
    }
  }, [back, cancel]));
  expect(prompt?.paymentMode).toBe('Manual');
  expect(prompt?.additionalCost).toBe(cost);
  const offers = modalFaceOffers([back, cancel]);
  expect(offers.front).toBeNull();
  expect(offers.back).toBe(back);
  expect(offers.cancel).toBe(cancel);
});

test('a face flag that is not a boolean is not a face, and a neighbour is not this window', () => {
  const offers = modalFaceOffers([{ type: 'ChooseModalFace', data: { back_face: 'true' } }]);
  expect(offers.front).toBeNull();
  expect(offers.back).toBeNull();
  expect(modalFacePrompt(withWaiting({ type: 'ChooseFromZoneChoice', data: {} }))).toBeNull();
});
