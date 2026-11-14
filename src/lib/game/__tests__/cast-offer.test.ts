import { expect, test } from 'bun:test';
import {
  adventureFaceAction,
  castAsMadnessAction,
  castAsMiracleAction,
  castFreeCandidateAction,
  castOfferChoiceAction,
  castOfferPrompt,
  castParadigmCopyAction,
  finishFreeCastWindowAction,
  passParadigmOfferAction
} from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 608.2g: `CastOffer` is one `WaitingFor` variant with **nine shapes**, and each
 * shape answers with a different action. The parser therefore reads the nested
 * `kind` tag and keeps the payload the block needs; it never guesses the shape from
 * the card.
 *
 * The two things this file pins down hardest are the ones the engine validates:
 *   - decline is shape-specific (`CascadeChoice`, `DiscoverChoice`, `RippleChoice`,
 *     `GraveyardPaidCastChoice`, `FreeCastWindowChoice { selection: null }`, …), and
 *   - the single card arrives under two different field names — `object_id` for the
 *     keyword offers, `hit_card` for cascade/discover/ripple/graveyard.
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
      turn_number: 9,
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
    legal: { actions: [], spell_costs: {}, by_object: {} }
  }) as unknown as EngineSnapshot;

const offer = (kind: Record<string, unknown>, player = 0) =>
  withWaiting({ type: 'CastOffer', data: { player, kind } });

const cost = { type: 'Cost', shards: ['White'], generic: 0 };

test('every shape of the engine reads as its own shape', () => {
  const shapes: [string, Record<string, unknown>, string][] = [
    ['Adventure', { object_id: 1, card_id: 2 }, 'adventure'],
    ['Miracle', { object_id: 1, cost }, 'miracle'],
    ['Madness', { object_id: 1, cost }, 'madness'],
    ['Paradigm', { offers: [7, 8] }, 'paradigm'],
    ['Cascade', { hit_card: 1, exiled_misses: [2] }, 'cascade'],
    ['Discover', { hit_card: 1, exiled_misses: [2] }, 'discover'],
    ['Ripple', { hit_card: 1, revealed_misses: [2] }, 'ripple'],
    ['FreeCastWindow', { candidates: [1, 2] }, 'freeWindow'],
    ['GraveyardPaidCast', { hit_card: 1 }, 'graveyardPaid']
  ];
  for (const [type, payload, expected] of shapes) {
    expect(castOfferPrompt(offer({ type, ...payload }))!.shape).toBe(expected as never);
  }
});

test('the offered card arrives as object_id or as hit_card', () => {
  expect(castOfferPrompt(offer({ type: 'Miracle', object_id: 395, cost }))!.objectId).toBe(395);
  expect(castOfferPrompt(offer({ type: 'Cascade', hit_card: 300, exiled_misses: [] }))!.objectId).toBe(300);
  // Paradigm and free-cast windows name a list, not one card.
  expect(castOfferPrompt(offer({ type: 'Paradigm', offers: [7] }))!.objectId).toBeNull();
  expect(castOfferPrompt(offer({ type: 'FreeCastWindow', candidates: [7, 8] }))!.objectId).toBeNull();
});

test('candidates come from offers or candidates, and misses from either miss list', () => {
  expect(castOfferPrompt(offer({ type: 'Paradigm', offers: [7, 8] }))!.candidates).toEqual([7, 8]);
  expect(castOfferPrompt(offer({ type: 'FreeCastWindow', candidates: [9] }))!.candidates).toEqual([9]);
  expect(castOfferPrompt(offer({ type: 'Cascade', hit_card: 1, exiled_misses: [2, 3] }))!.misses).toEqual([2, 3]);
  expect(castOfferPrompt(offer({ type: 'Ripple', hit_card: 1, revealed_misses: [4] }))!.misses).toEqual([4]);
  // Non-numbers in the published lists are dropped, not turned into objects.
  expect(castOfferPrompt(offer({ type: 'Cascade', hit_card: 1, exiled_misses: [2, '3'] }))!.misses).toEqual([2]);
});

test('the window publishes its bounds, and an absent bound stays absent', () => {
  const bounded = castOfferPrompt(
    offer({ type: 'FreeCastWindow', candidates: [1], remaining_casts: 2, remaining_mv_budget: 4 })
  )!;
  expect(bounded.remainingCasts).toBe(2);
  expect(bounded.mvBudget).toBe(4);
  // "any number of spells" and "no MV cap" travel as absent, not as zero.
  const open = castOfferPrompt(offer({ type: 'FreeCastWindow', candidates: [1] }))!;
  expect(open.remainingCasts).toBeNull();
  expect(open.mvBudget).toBeNull();
});

test('the cascade gate and the discover value are read, not inferred', () => {
  expect(castOfferPrompt(offer({ type: 'Cascade', hit_card: 1, source_mv: 4 }))!.sourceMv).toBe(4);
  expect(castOfferPrompt(offer({ type: 'Discover', hit_card: 1, discover_value: 3 }))!.discoverValue).toBe(3);
  expect(castOfferPrompt(offer({ type: 'Cascade', hit_card: 1 }))!.sourceMv).toBeNull();
});

test('the any-type-mana concession is read from the grant', () => {
  const withGrant = castOfferPrompt(
    offer({ type: 'GraveyardPaidCast', hit_card: 1, mana_spend_permission: { type: 'AnyType' } })
  )!;
  expect(withGrant.anyMana).toBe(true);
  expect(castOfferPrompt(offer({ type: 'GraveyardPaidCast', hit_card: 1 }))!.anyMana).toBe(false);
});

test('an unknown kind, or another prompt, is not this block', () => {
  expect(castOfferPrompt(offer({ type: 'SomethingNew', hit_card: 1 }))).toBeNull();
  expect(castOfferPrompt(withWaiting({ type: 'MiracleReveal', data: { object_id: 1 } }))).toBeNull();
  expect(castOfferPrompt(null)).toBeNull();
});

test('the seat defaults to the viewer', () => {
  const noSeat = withWaiting({ type: 'CastOffer', data: { kind: { type: 'Miracle', object_id: 1 } } }, 1);
  expect(castOfferPrompt(noSeat)!.player).toBe(1);
});

test('adventure answers with a face, not with a yes or a no', () => {
  expect(adventureFaceAction(true)).toEqual({ type: 'ChooseAdventureFace', data: { creature: true } });
  expect(adventureFaceAction(false)).toEqual({ type: 'ChooseAdventureFace', data: { creature: false } });
});

test('the keyword offers carry object and card separately, with automatic payment', () => {
  const miracle = castAsMiracleAction(395, 12);
  expect(miracle.type).toBe('CastSpellAsMiracle');
  expect(miracle.data).toEqual({ object_id: 395, card_id: 12, payment_mode: { type: 'Auto' } });
  const madness = castAsMadnessAction(400, 40);
  expect(madness.type).toBe('CastSpellAsMadness');
  expect(madness.data).toEqual({ object_id: 400, card_id: 40, payment_mode: { type: 'Auto' } });
});

test('each cast-or-decline shape answers with its own action', () => {
  expect(castOfferChoiceAction('cascade', true)).toEqual({ type: 'CascadeChoice', data: { choice: 'Cast' } });
  expect(castOfferChoiceAction('cascade', false)).toEqual({ type: 'CascadeChoice', data: { choice: 'Decline' } });
  expect(castOfferChoiceAction('discover', false)).toEqual({ type: 'DiscoverChoice', data: { choice: 'Decline' } });
  expect(castOfferChoiceAction('ripple', true)).toEqual({ type: 'RippleChoice', data: { choice: 'Cast' } });
  expect(castOfferChoiceAction('graveyardPaid', false)).toEqual({
    type: 'GraveyardPaidCastChoice',
    data: { choice: 'Decline' }
  });
  // The shapes that answer differently must not be routed through this helper.
  expect(() => castOfferChoiceAction('miracle', true)).toThrow();
  expect(() => castOfferChoiceAction('freeWindow', false)).toThrow();
});

test('paradigm and the free window have their own actions', () => {
  expect(castParadigmCopyAction(7)).toEqual({ type: 'CastParadigmCopy', data: { source: 7 } });
  expect(passParadigmOfferAction()).toEqual({ type: 'PassParadigmOffer', data: {} });
  expect(castFreeCandidateAction(396)).toEqual({ type: 'FreeCastWindowChoice', data: { selection: 396 } });
  // Closing the window is `selection: null`, which is a different value from a card.
  expect(finishFreeCastWindowAction()).toEqual({ type: 'FreeCastWindowChoice', data: { selection: null } });
});
