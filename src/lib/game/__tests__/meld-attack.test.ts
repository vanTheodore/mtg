import { expect, test } from 'bun:test';
import { chooseEntryAttackTargetAction, meldAttackPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 508.4: the melded permanent enters tapped and attacking, and its controller
 * chooses one defending player, planeswalker or battle. The engine publishes the
 * complete legal topology and pauses **only** when there is more than one
 * destination; with one it enters attacking it and nothing is asked.
 *
 * The context is the same `MeldSelection` the pair choice froze, so the block can
 * name the card that is entering without re-reading the battlefield. The same
 * action (`ChooseEntryAttackTarget`) answers the sibling prompt
 * `EntryAttackTargetChoice`, which is why the parser keys on the variant, not on
 * the action.
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
      phase: 'DeclareAttackers',
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

const context = {
  source_id: 405,
  partner_id: 406,
  controller: 0,
  expected_source: 'Bruna, the Fading Light',
  expected_partner: 'Gisela, the Broken Blade',
  result: 'Brisela, Voice of Nightmares',
  entry: { type: 'TappedAndAttacking', data: { type: 'AnyDefender' } }
};

const offer = (data: Record<string, unknown> = {}, player = 0) =>
  withWaiting({
    type: 'MeldAttackTargetChoice',
    data: {
      player,
      context,
      valid_targets: [
        { type: 'Player', data: 1 },
        { type: 'Planeswalker', data: 205 }
      ],
      ...data
    }
  });

test('the offer carries the melded card and the whole legal topology', () => {
  const prompt = meldAttackPrompt(offer());
  expect(prompt).not.toBeNull();
  expect(prompt!.player).toBe(0);
  expect(prompt!.sourceId).toBe(405);
  expect(prompt!.result).toBe('Brisela, Voice of Nightmares');
  expect(prompt!.targets).toEqual([
    { type: 'Player', data: 1 },
    { type: 'Planeswalker', data: 205 }
  ]);
});

test('targets that are not a tagged id are dropped, not rendered', () => {
  const prompt = meldAttackPrompt(
    offer({
      valid_targets: [
        { type: 'Player', data: 1 },
        { type: 'Player' },
        { data: 2 },
        'junk',
        null
      ]
    })
  );
  expect(prompt!.targets).toEqual([{ type: 'Player', data: 1 }]);
});

test('an offer with no destination is not a window', () => {
  // The engine auto-selects when there is exactly one, so an empty list means the
  // prompt has already moved on.
  expect(meldAttackPrompt(offer({ valid_targets: [] }))).toBeNull();
  expect(meldAttackPrompt(offer({ valid_targets: undefined }))).toBeNull();
});

test('a context without the melded object is not this block', () => {
  expect(meldAttackPrompt(offer({ context: { partner_id: 406 } }))).toBeNull();
  expect(meldAttackPrompt(offer({ context: undefined }))).toBeNull();
});

test('the result name is optional; the object id is not', () => {
  const bare = meldAttackPrompt(offer({ context: { source_id: 405 } }));
  expect(bare!.sourceId).toBe(405);
  expect(bare!.result).toBeUndefined();
});

test('the seat defaults to the viewer', () => {
  const noSeat = withWaiting({
    type: 'MeldAttackTargetChoice',
    data: { context, valid_targets: [{ type: 'Player', data: 0 }] }
  }, 1);
  expect(meldAttackPrompt(noSeat)!.player).toBe(1);
});

test('the sibling prompt is not this block, even though it answers the same action', () => {
  expect(
    meldAttackPrompt(withWaiting({ type: 'EntryAttackTargetChoice', data: { player: 0, object_id: 1, valid_targets: [] } }))
  ).toBeNull();
  expect(meldAttackPrompt(null)).toBeNull();
});

test('the answer is the engine target, tagged, not a bare id', () => {
  expect(chooseEntryAttackTargetAction({ type: 'Player', data: 1 })).toEqual({
    type: 'ChooseEntryAttackTarget',
    data: { target: { type: 'Player', data: 1 } }
  });
  expect(chooseEntryAttackTargetAction({ type: 'Battle', data: 9 }).data).toEqual({
    target: { type: 'Battle', data: 9 }
  });
});
