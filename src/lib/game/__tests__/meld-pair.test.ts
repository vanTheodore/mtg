import { expect, test } from 'bun:test';
import { chooseMeldPairAction, meldPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 701.42: meld freezes **referents**, not names. Every candidate carries the
 * fixed half (`source_id`), the candidate half (`partner_id`), the printed names the
 * instruction expects and the card the pair would become; the answer names both
 * object ids, because two copies of the same half share a name.
 *
 * Two engine details the parser keeps:
 *   - with a single candidate the engine never asks (it melds straight away), so an
 *     offer with no usable entry is not a prompt at all, and
 *   - `entry` says whether the result enters tapped and attacking (CR 508.4), which
 *     is a different follow-up question.
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
      turn_number: 12,
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

const selection = (partner: number, entry: unknown = 'Normal') => ({
  source_id: 405,
  partner_id: partner,
  controller: 0,
  expected_source: 'Bruna, the Fading Light',
  expected_partner: 'Gisela, the Broken Blade',
  result: 'Brisela, Voice of Nightmares',
  entry
});

const offer = (choices: unknown[], player = 0) =>
  withWaiting({ type: 'MeldPairChoice', data: { player, choices } });

test('the offer names the fixed half, the result and every candidate pair', () => {
  const prompt = meldPrompt(offer([selection(406), selection(407)]));
  expect(prompt).not.toBeNull();
  expect(prompt!.player).toBe(0);
  expect(prompt!.sourceId).toBe(405);
  expect(prompt!.expectedSource).toBe('Bruna, the Fading Light');
  expect(prompt!.result).toBe('Brisela, Voice of Nightmares');
  expect(prompt!.choices.map((choice) => choice.partnerId)).toEqual([406, 407]);
});

test('an entry without both ids is dropped, not guessed', () => {
  const prompt = meldPrompt(
    offer([
      selection(406),
      { source_id: 405, expected_source: 'Bruna, the Fading Light' },
      { partner_id: 407 },
      'junk'
    ])
  );
  expect(prompt!.choices.map((choice) => choice.partnerId)).toEqual([406]);
});

test('an offer with no usable pair is not a prompt', () => {
  // With one candidate the engine melds without asking; with none it does not meld.
  expect(meldPrompt(offer([]))).toBeNull();
  expect(meldPrompt(offer([{ source_id: 405 }]))).toBeNull();
});

test('the printed names and the result are optional on the wire', () => {
  const bare = meldPrompt(offer([{ source_id: 405, partner_id: 406 }]));
  expect(bare!.expectedSource).toBeUndefined();
  expect(bare!.result).toBeUndefined();
});

test('entering tapped and attacking is read in both serialized spellings', () => {
  // A unit variant travels as a string; a struct variant travels as `{ type }`.
  expect(meldPrompt(offer([selection(406, 'TappedAndAttacking')]))!.choices[0].attacking).toBe(true);
  expect(
    meldPrompt(offer([selection(406, { type: 'TappedAndAttacking', data: { type: 'AnyDefender' } })]))!.choices[0]
      .attacking
  ).toBe(true);
  expect(meldPrompt(offer([selection(406, 'Normal')]))!.choices[0].attacking).toBe(false);
});

test('the seat defaults to the viewer', () => {
  const noSeat = withWaiting({
    type: 'MeldPairChoice',
    data: { choices: [selection(406)] }
  }, 1);
  expect(meldPrompt(noSeat)!.player).toBe(1);
});

test('another prompt is not this block', () => {
  expect(meldPrompt(withWaiting({ type: 'MeldAttackTargetChoice', data: { player: 0 } }))).toBeNull();
  expect(meldPrompt(null)).toBeNull();
});

test('the answer names both ids, in the order the engine expects', () => {
  expect(chooseMeldPairAction(405, 407)).toEqual({
    type: 'ChooseMeldPair',
    data: { source_id: 405, partner_id: 407 }
  });
});
