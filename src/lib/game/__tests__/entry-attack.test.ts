import { expect, test } from 'bun:test';
import { attackLabel, chooseEntryAttackTargetAction, entryAttackPrompt, meldAttackPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 508.4: a permanent that enters the battlefield already attacking never went
 * through the declare-attackers step, so its controller names the defending
 * player, planeswalker or battle it attacks. Ninjutsu and sneak are the two
 * keyword routes; the engine asks only when more than one destination is legal.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 12,
    actions_applied: 12,
    metrics: {},
    state: {
      turn_number: 3,
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

const entry = (data: Record<string, unknown> = {}) => ({
  type: 'EntryAttackTargetChoice',
  data: {
    player: 0,
    object_id: 408,
    valid_targets: [
      { type: 'Player', data: 1 },
      { type: 'Planeswalker', data: 205 },
      { type: 'Battle', data: 409 }
    ],
    ...data
  }
});

test('the entering permanent and the whole legal topology are what the window carries', () => {
  const prompt = entryAttackPrompt(withWaiting(entry()))!;
  expect(prompt.player).toBe(0);
  expect(prompt.objectId).toBe(408);
  expect(prompt.targets).toEqual([
    { type: 'Player', data: 1 },
    { type: 'Planeswalker', data: 205 },
    { type: 'Battle', data: 409 }
  ]);
});

test('without the permanent there is no window to draw', () => {
  // The block names the object it is asking about; without it there is nothing to name.
  expect(entryAttackPrompt(withWaiting(entry({ object_id: undefined })))).toBeNull();
  expect(entryAttackPrompt(withWaiting(entry({ object_id: 'x' })))).toBeNull();
});

test('a malformed destination is dropped, not drawn as a button nobody can name', () => {
  const prompt = entryAttackPrompt(
    withWaiting(
      entry({
        valid_targets: [
          { type: 'Player', data: 1 },
          { type: 'Planeswalker' },
          { data: 3 },
          'junk',
          null,
          { type: 'Battle', data: '4' }
        ]
      })
    )
  )!;
  expect(prompt.targets).toEqual([{ type: 'Player', data: 1 }]);
});

test('an empty topology is not a window: the engine seats the attacker alone', () => {
  // CR 508.4a: with no legal destination the permanent still enters tapped and
  // attacking, but it attacks nothing, so there is nothing to ask.
  expect(entryAttackPrompt(withWaiting(entry({ valid_targets: [] })))).toBeNull();
  expect(entryAttackPrompt(withWaiting(entry({ valid_targets: undefined })))).toBeNull();
  expect(entryAttackPrompt(null)).toBeNull();
});

test('the seat defaults to the viewer when the engine sends no player', () => {
  const prompt = entryAttackPrompt(withWaiting(entry({ player: undefined }), 2))!;
  expect(prompt.player).toBe(2);
});

test('this is not the melded window, and the melded window is not this one', () => {
  // Both answer `ChooseEntryAttackTarget`, so the variant is the only thing that
  // tells them apart: a prompt that read the action would confuse them.
  expect(meldAttackPrompt(withWaiting(entry()))).toBeNull();
  expect(
    entryAttackPrompt(
      withWaiting({
        type: 'MeldAttackTargetChoice',
        data: {
          player: 0,
          context: { source_id: 405, result: 'Brisela, Voice of Nightmares' },
          valid_targets: [{ type: 'Player', data: 1 }]
        }
      })
    )
  ).toBeNull();
});

test('the destination is named by kind: a seat by number, a permanent by its name', () => {
  const objects = {
    '205': { name: 'Chandra, Torch of Defiance' },
    '409': { name: 'Invasion of Kamigawa' }
  } as never;
  expect(attackLabel({ type: 'Player', data: 1 }, objects)).toBe('Jugador 2');
  expect(attackLabel({ type: 'Planeswalker', data: 205 }, objects)).toBe('Chandra, Torch of Defiance');
  expect(attackLabel({ type: 'Battle', data: 409 }, objects)).toBe('Invasion of Kamigawa');
  // Nothing to read is still a kind, not a blank button.
  expect(attackLabel({ type: 'Battle', data: 999 }, objects)).toBe('Batalla');
  expect(attackLabel({ type: 'Planeswalker', data: 999 }, objects)).toBe('Planeswalker');
});

test('the answer is the shared action, carrying the destination as the engine sent it', () => {
  expect(chooseEntryAttackTargetAction({ type: 'Battle', data: 409 })).toEqual({
    type: 'ChooseEntryAttackTarget',
    data: { target: { type: 'Battle', data: 409 } }
  });
});
