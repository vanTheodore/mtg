/**
 * The interaction contract the Svelte components rely on.
 *
 * Everything asserted here is the *exact* thing the UI sends to Phase: the pairs
 * in a combat declaration, the action committed by a second activation, and the
 * text the player reads afterwards. If any of it drifts, the E2E in a browser
 * would fail somewhere far from the cause — this puts the cause in a Bun test
 * that runs everywhere.
 */
import { describe, expect, test } from 'bun:test';
import { blockDeclaration, blockPairs, secondActivation, attackDeclaration } from '../interaction.ts';
import { summarizeEvents } from '../events.ts';
import type { EngineSnapshot, GameObject } from '../../engine/types.ts';

const object = (id: number, name: string, zone = 'Battlefield'): GameObject =>
  ({ id, card_id: id, owner: 0, controller: 0, zone, name } as unknown as GameObject);

const priority = (byObject: Record<string, unknown[]>, objects: Record<string, GameObject> = {}): EngineSnapshot => ({
  ok: true, viewer: 0, seed: 7, revision: 5, actions_applied: 5, metrics: {},
  state: {
    turn_number: 3, active_player: 0, priority_player: 0, phase: 'PreCombatMain',
    waiting_for: { type: 'Priority', data: { player: 0 } },
    players: [], battlefield: [], stack: [], exile: [], objects,
    combat: { attackers: [], blocker_assignments: {}, blocker_to_attacker: {} }
  },
  derived: {},
  legal: { actions: [], spell_costs: {}, by_object: byObject }
} as unknown as EngineSnapshot);

describe('a second activation commits only when the choice is unambiguous', () => {
  const land = object(30, 'Plains', 'Hand');
  const playLand = { type: 'PlayLand', data: { object_id: 30, card_id: 30 } };

  test('a land with one way to play it commits on the second click', () => {
    const s = priority({ '30': [playLand] }, { '30': land });
    expect(secondActivation(s, 30)).toEqual({ action: playLand, kind: 'play-land' });
  });

  test('a spell with a single cast option commits', () => {
    const spell = { type: 'CastSpell', data: { object_id: 31, card_id: 31, targets: [], payment_mode: { type: 'Auto' } } };
    const s = priority({ '31': [spell] }, { '31': object(31, 'Soul Warden', 'Hand') });
    expect(secondActivation(s, 31)).toEqual({ action: spell, kind: 'cast' });
  });

  test('two cast options keep it a selection: the player chooses', () => {
    const a = { type: 'CastSpell', data: { object_id: 31, card_id: 31, payment_mode: { type: 'Auto' } } };
    const b = { type: 'CastSpell', data: { object_id: 31, card_id: 31, payment_mode: { type: 'Manual' } } };
    const s = priority({ '31': [a, b] });
    expect(secondActivation(s, 31)).toEqual({ action: null, reason: 'ambiguous' });
  });

  test('during a prompt a card click still means "choose", never "commit"', () => {
    const s = { ...priority({ '30': [playLand] }), state: { ...priority({}).state, waiting_for: { type: 'ManaPayment', data: {} } } } as unknown as EngineSnapshot;
    expect(secondActivation(s, 30)).toEqual({ action: null, reason: 'not-a-priority' });
  });

  test('a permanent with no committing action is not committed', () => {
    const s = priority({ '40': [{ type: 'ActivateAbility', data: { object_id: 40 } }] });
    expect(secondActivation(s, 40)).toEqual({ action: null, reason: 'no-action' });
  });
});

describe('combat declarations carry the pairs Phase expects', () => {
  test('blockers are sent as [blocker, attacker]', () => {
    const action = blockDeclaration({ '20': 10, '21': 11 });
    expect(action.type).toBe('DeclareBlockers');
    expect(action.data).toEqual({ assignments: [[20, 10], [21, 11]] });
    expect(blockPairs({ '20': 10 })).toEqual([[20, 10]]);
  });

  test('attackers keep the engine-authored target, with an empty band list', () => {
    const action = attackDeclaration({ '10': { type: 'Player', data: 1 } });
    expect(action.type).toBe('DeclareAttackers');
    expect(action.data).toEqual({ attacks: [[10, { type: 'Player', data: 1 }]], bands: [] });
  });
});

describe('the log shows a block as accepted, not merely attempted', () => {
  const objects = { '10': object(10, 'Serra Angel'), '20': object(20, 'Soul Warden') };
  let next = 0;
  const summarize = (events: unknown[]) => summarizeEvents(events, objects, 9, () => ++next);

  test('BlockersDeclared becomes "X bloquea a Y" with Phase order', () => {
    const entries = summarize([{ type: 'BlockersDeclared', data: { assignments: [[20, 10]] } }]);
    expect(entries.map((entry) => entry.text)).toEqual(['Soul Warden bloquea a Serra Angel.']);
    expect(entries[0]!.kind).toBe('combat');
  });

  test('AttackersDeclared names the attackers and the defending seat', () => {
    const entries = summarize([{ type: 'AttackersDeclared', data: { attacker_ids: [10], defending_player: 1, attacks: [[10, { type: 'Player', data: 1 }]] } }]);
    expect(entries.map((entry) => entry.text)).toEqual(['Atacan Serra Angel (Jugador 2).']);
  });

  test('a declaration with no pairs logs nothing invented', () => {
    expect(summarize([{ type: 'BlockersDeclared', data: { assignments: [] } }])).toEqual([]);
    expect(summarize([{ type: 'BlockersDeclared', data: {} }])).toEqual([]);
  });
});
