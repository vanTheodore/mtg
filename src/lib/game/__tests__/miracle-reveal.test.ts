import { expect, test } from 'bun:test';
import { castAsMiracleAction, declineMiracleAction, miraclePrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 702.94a: miracle is a **binary offer** over the first card a player draws in a
 * turn. The prompt names the drawn object and the cost the offer latched, and the two
 * answers are not the same shape:
 *
 *   - accept — `CastSpellAsMiracle { object_id, card_id, payment_mode }`, which
 *     reveals the card and puts the miracle trigger on the stack (the cast itself is
 *     a later `CastOffer`, CR 608.2g);
 *   - decline — the shared `DecideOptionalEffect { accept: false }`.
 *
 * `cost` is a latched value, not a lookup: the granting source may have left the
 * battlefield before the offer resolves (CR 608.2b), so the block shows what the
 * engine sent and never re-reads the card.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 161,
    actions_applied: 161,
    metrics: {},
    state: {
      turn_number: 4,
      active_player: viewer,
      priority_player: viewer,
      phase: 'Draw',
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

const cost = { type: 'Cost', shards: ['White'], generic: 0 };
const offer = (data: Record<string, unknown> = {}) =>
  withWaiting({ type: 'MiracleReveal', data: { player: 0, object_id: 395, cost, ...data } });

test('the offer names the drawn card and the cost it latched', () => {
  const prompt = miraclePrompt(offer());
  expect(prompt).not.toBeNull();
  expect(prompt!.objectId).toBe(395);
  expect(prompt!.player).toBe(0);
  expect(prompt!.cost).toEqual(cost);
});

test('an offer that names no card is not an offer', () => {
  // The engine rejects a `CastSpellAsMiracle` whose object is not the offered one,
  // so a reveal without `object_id` has no answer this block could send.
  expect(miraclePrompt(offer({ object_id: undefined }))).toBeNull();
  expect(miraclePrompt(offer({ object_id: '395' }))).toBeNull();
});

test('a missing cost stays missing instead of being invented', () => {
  const prompt = miraclePrompt(offer({ cost: undefined }));
  expect(prompt).not.toBeNull();
  expect(prompt!.cost).toBeUndefined();
});

test('the answering seat defaults to the viewer', () => {
  expect(miraclePrompt(offer({ player: undefined }))!.player).toBe(0);
  const rival = miraclePrompt(withWaiting({ type: 'MiracleReveal', data: { object_id: 7 } }, 1));
  expect(rival!.player).toBe(1);
});

test('other prompts are not this block', () => {
  expect(miraclePrompt(withWaiting({ type: 'Priority', data: { player: 0 } }))).toBeNull();
  expect(miraclePrompt(withWaiting({ type: 'CastOffer', data: { player: 0 } }))).toBeNull();
  expect(miraclePrompt(null)).toBeNull();
});

test('accepting reveals the card: object, card and an automatic payment mode', () => {
  const action = castAsMiracleAction(395, 395);
  expect(action.type).toBe('CastSpellAsMiracle');
  expect(action.data).toEqual({
    object_id: 395,
    card_id: 395,
    payment_mode: { type: 'Auto' }
  });
  // The object and the card are separate identities and both travel.
  expect(castAsMiracleAction(700, 12).data).toMatchObject({ object_id: 700, card_id: 12 });
});

test('declining reuses the generic optional decline', () => {
  expect(declineMiracleAction()).toEqual({ type: 'DecideOptionalEffect', data: { accept: false } });
});
