import { expect, test } from 'bun:test';
import { manaPips, manaSpoken, manaText } from '../cards';
import { combatTaxPrompt, payCombatTaxAction } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 508.1d + CR 508.1h + CR 509.1c + CR 509.1d: a combat declaration the engine
 * already validated and priced. The answer is a bare boolean — pay the locked-in
 * total and the declaration commits, or decline and the whole proposal is
 * discarded. The block must not re-price the quote, and it must not drop a
 * hybrid or Phyrexian shard the engine counted (`{W/P}` is mana value 1).
 *
 * `CombatTaxContext` is internally tagged, so the wire form is `{ type }`.
 * `pending` snapshots incarnation refs (CR 508.1k + CR 400.7); `per_creature`
 * keys are bare `ObjectId`s.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
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

const phyrexian = (count: number) => ({
  type: 'Cost',
  shards: Array.from({ length: count }, () => 'PhyrexianWhite'),
  generic: 0
});

test('CR 508.1h: the attack tax is the engine quote, with its snapshot and its band', () => {
  const total = phyrexian(2);
  const prompt = combatTaxPrompt(
    withWaiting({
      type: 'CombatTaxPayment',
      data: {
        player: 0,
        context: { type: 'Attacking' },
        total_cost: total,
        per_creature: [
          [100, phyrexian(1)],
          [101, phyrexian(1)]
        ],
        pending: {
          type: 'Attack',
          data: {
            attacks: [
              [{ object_id: 100, incarnation: 3 }, { type: 'Player', data: 1 }],
              [{ object_id: 101, incarnation: 3 }, { type: 'Planeswalker', data: 205 }],
              [{ object_id: 105, incarnation: 1 }, { type: 'Battle', data: 9 }]
            ],
            bands: [[{ object_id: 100, incarnation: 3 }, { object_id: 101, incarnation: 3 }]]
          }
        }
      }
    })
  )!;
  expect(prompt.player).toBe(0);
  expect(prompt.context).toBe('attacking');
  // The total is the engine's object, not a sum of the breakdown.
  expect(prompt.totalCost).toBe(total);
  expect(prompt.perCreature).toEqual([
    { id: 100, cost: phyrexian(1), target: null },
    { id: 101, cost: phyrexian(1), target: null }
  ]);
  expect(prompt.pending).toEqual({
    kind: 'attack',
    attackers: [
      { id: 100, cost: null, target: { type: 'Player', data: 1 } },
      { id: 101, cost: null, target: { type: 'Planeswalker', data: 205 } },
      { id: 105, cost: null, target: { type: 'Battle', data: 9 } }
    ],
    bands: [[100, 101]]
  });
});

test('CR 509.1d: a block tax names both sides of each pair and drops a broken one', () => {
  const prompt = combatTaxPrompt(
    withWaiting({
      type: 'CombatTaxPayment',
      data: {
        player: 1,
        context: { type: 'Blocking' },
        total_cost: { type: 'Cost', shards: [], generic: 2 },
        per_creature: [
          [200, { type: 'Cost', shards: [], generic: 2 }],
          ['not-an-id', { type: 'Cost', shards: [], generic: 2 }],
          [{ object_id: 201, incarnation: 4 }, { type: 'Cost', shards: ['White'], generic: 0 }]
        ],
        pending: {
          type: 'Block',
          data: {
            assignments: [
              [{ object_id: 200, incarnation: 1 }, { object_id: 100, incarnation: 1 }],
              [{ object_id: 201, incarnation: 1 }],
              [202, 100]
            ]
          }
        }
      }
    })
  )!;
  expect(prompt.context).toBe('blocking');
  expect(prompt.player).toBe(1);
  expect(prompt.perCreature.map((entry) => entry.id)).toEqual([200, 201]);
  expect(prompt.perCreature[1]?.cost).toEqual({ type: 'Cost', shards: ['White'], generic: 0 });
  expect(prompt.pending).toEqual({
    kind: 'block',
    pairs: [
      [200, 100],
      [202, 100]
    ]
  });
});

test('a missing or foreign context is unknown, and a bare discriminant still reads', () => {
  const base = {
    type: 'CombatTaxPayment',
    data: {
      player: 0,
      total_cost: phyrexian(1),
      per_creature: [],
      pending: { type: 'Attack', data: { attacks: [], bands: [] } }
    }
  };
  expect(combatTaxPrompt(withWaiting(base))!.context).toBe('unknown');
  expect(
    combatTaxPrompt(withWaiting({ ...base, data: { ...base.data, context: { type: 'Neither' } } }))!.context
  ).toBe('unknown');
  // A flattened writer must not invent a third side of combat.
  expect(
    combatTaxPrompt(withWaiting({ ...base, data: { ...base.data, context: 'Blocking' } }))!.context
  ).toBe('blocking');
  // No published player: the seat being asked is the viewer, not seat 0 by fiat.
  const unseated = combatTaxPrompt(
    withWaiting({ ...base, data: { ...base.data, player: undefined, context: { type: 'Attacking' } } }, 1)
  )!;
  expect(unseated.player).toBe(1);
  expect(unseated.context).toBe('attacking');
  expect(unseated.pending).toEqual({ kind: 'attack', attackers: [], bands: [] });
});

test('a quote with no breakdown, and a pending shape the engine does not use, still asks', () => {
  const prompt = combatTaxPrompt(
    withWaiting({
      type: 'CombatTaxPayment',
      data: {
        player: 0,
        context: { type: 'Attacking' },
        total_cost: { type: 'Cost', shards: [], generic: 2 },
        per_creature: null,
        pending: { type: 'Other', data: {} }
      }
    })
  )!;
  expect(prompt.perCreature).toEqual([]);
  expect(prompt.pending).toEqual({ kind: 'unknown' });
  expect(prompt.totalCost).toEqual({ type: 'Cost', shards: [], generic: 2 });
  // The boolean is the whole answer. A neighbour window is not this one.
  expect(combatTaxPrompt(withWaiting({ type: 'PhyrexianPayment', data: {} }))).toBeNull();
  expect(combatTaxPrompt(withWaiting({ type: 'DeclareAttackers', data: {} }))).toBeNull();
  expect(combatTaxPrompt(null)).toBeNull();
});

test('CR 508.1d: accept and decline are a bare boolean, with no creature list to smuggle', () => {
  expect(payCombatTaxAction(true)).toEqual({ type: 'PayCombatTax', data: { accept: true } });
  expect(payCombatTaxAction(false)).toEqual({ type: 'PayCombatTax', data: { accept: false } });
  expect(Object.keys(payCombatTaxAction(false).data ?? {})).toEqual(['accept']);
});

test('hybrid and Phyrexian shards print, and an unknown shard is not dropped', () => {
  expect(manaText({ type: 'Cost', generic: 0, shards: ['PhyrexianWhite', 'PhyrexianWhite'] })).toBe('{W/P}{W/P}');
  expect(manaText({ type: 'Cost', generic: 2, shards: [{ type: 'PhyrexianBlack' }] })).toBe('{2}{B/P}');
  expect(manaText({ type: 'Cost', generic: 1, shards: ['Green'] })).toBe('{1}{G}');
  expect(manaText({ type: 'NoCost' })).toBe('');
  expect(manaText('{W/P}')).toBe('{W/P}');

  expect(manaPips({ type: 'Cost', shards: ['PhyrexianWhite'], generic: 0 })).toEqual([
    { symbol: 'W/P', kind: 'phyrexian' }
  ]);
  expect(manaPips({ type: 'Cost', shards: ['PhyrexianWhiteBlue'], generic: 0 })).toEqual([
    { symbol: 'W/U/P', kind: 'phyrexian' }
  ]);
  expect(manaPips({ type: 'Cost', shards: ['WhiteBlue', 'TwoGreen', 'ColorlessBlue'], generic: 0 })).toEqual([
    { symbol: 'W/U', kind: 'hybrid' },
    { symbol: '2/G', kind: 'hybrid' },
    { symbol: 'C/U', kind: 'hybrid' }
  ]);
  expect(manaPips({ type: 'Cost', shards: ['Snow', 'X', 'TwoOrMoreColorSource'], generic: 1 })).toEqual([
    { symbol: '1', kind: 'generic' },
    { symbol: 'S', kind: 'snow' },
    { symbol: 'X', kind: 'variable' },
    { symbol: 'Z', kind: 'variable' }
  ]);
  // A shard this table has not met still occupies a pip. Hiding it would be a price.
  expect(manaPips({ type: 'Cost', shards: ['FutureShard'], generic: 0 })).toEqual([
    { symbol: 'FutureShard', kind: 'generic' }
  ]);
  expect(manaText({ type: 'Cost', shards: ['FutureShard'], generic: 0 })).toBe('{FutureShard}');
  expect(manaPips('{2}{W/P}')).toEqual([
    { symbol: '2', kind: 'generic' },
    { symbol: 'W/P', kind: 'phyrexian' }
  ]);
  expect(manaPips({ type: 'NoCost' })).toEqual([]);
  expect(manaSpoken(manaPips(phyrexian(1)))).toBe('blanco o 2 vidas');
});
