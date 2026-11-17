import { expect, test } from 'bun:test';
import {
  decideOptionalCostAction,
  namedAbilityCost,
  optionalCostPrompt
} from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 601.2b: `OptionalCostChoice`. The index is `optional_cost_options`, not a
 * guess: Optional/Kicker are pay-then-decline, Choice is one pay per published
 * alternative and no decline, Required is a single payment. A kicker with two
 * costs still offers only the first — the live one — so a sibling cannot steal
 * index 2.
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

const mana = (generic: number, shards: string[] = []) => ({ type: 'Cost', shards, generic });
const manaCost = (generic: number, shards: string[] = []) => ({ type: 'Mana', cost: mana(generic, shards) });

test('CR 702.33a: a kicker offers the live cost, then a decline, and names the spell', () => {
  const prompt = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        player: 0,
        cost: { type: 'Kicker', data: { costs: [manaCost(0, ['Red']), manaCost(2)] } },
        times_kicked: 0,
        origin: 'Kicker',
        pending_cast: { object_id: 420, alternative_cost_election: 'Undecided' }
      }
    })
  )!;
  expect(prompt.shape).toBe('kicker');
  expect(prompt.origin).toBe('kicker');
  expect(prompt.repeatable).toBe(false);
  expect(prompt.timesKicked).toBe(0);
  expect(prompt.giftKind).toBeNull();
  expect(prompt.alternativeOffered).toBe(false);
  expect(prompt.spellId).toBe(420);
  // The second kicker cost is not a button. Index 2 does not exist.
  expect(prompt.options).toEqual([
    { index: 0, kind: 'pay', label: '{R}', mana: mana(0, ['Red']) },
    { index: 1, kind: 'decline', label: null, mana: null }
  ]);
});

test('CR 702.33c: multikicker publishes the running count and that it can be paid again', () => {
  const prompt = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        player: 0,
        cost: {
          type: 'Kicker',
          data: { costs: [manaCost(2)], repeatable: true }
        },
        times_kicked: 2,
        origin: 'Kicker',
        pending_cast: { object_id: 421 }
      }
    })
  )!;
  expect(prompt.repeatable).toBe(true);
  expect(prompt.timesKicked).toBe(2);
  expect(prompt.options.map((option) => option.index)).toEqual([0, 1]);
  expect(prompt.options[0]?.label).toBe('{2}');
  // A string is not the bool the engine writes.
  const lied = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        player: 0,
        cost: { type: 'Optional', data: { cost: manaCost(1), repeatable: 'true' } },
        pending_cast: { object_id: 1 }
      }
    })
  )!;
  expect(lied.repeatable).toBe(false);
  expect(lied.shape).toBe('optional');
});

test('CR 601.2b: a choice pays exactly one, in the published order, with no decline', () => {
  const prompt = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        player: 0,
        cost: {
          type: 'Choice',
          data: [
            { type: 'Sacrifice', target: { type: 'Typed', type_filters: ['Creature'], controller: 'You' }, count: 1 },
            { type: 'Discard', count: { type: 'Fixed', value: 1 } },
            { type: 'PayLife', amount: { type: 'Fixed', value: 4 } },
            { type: 'Waterbend', cost: mana(3) }
          ]
        },
        origin: 'Other',
        pending_cast: { object_id: 422, alternative_cost_election: 'Undecided' }
      }
    })
  )!;
  expect(prompt.shape).toBe('choice');
  expect(prompt.options.map((option) => option.kind)).toEqual(['pay', 'pay', 'pay', 'pay']);
  expect(prompt.options.map((option) => option.index)).toEqual([0, 1, 2, 3]);
  expect(prompt.options.map((option) => option.label)).toEqual([
    'Sacrificar 1 criatura que controlas',
    'Descartar 1 carta',
    '4 vidas',
    null
  ]);
  expect(prompt.options.some((option) => option.kind === 'decline')).toBe(false);
});

test('CR 118.9: an offered alternative is a choice whose first index accepts it', () => {
  const prompt = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        player: 0,
        cost: {
          type: 'Choice',
          data: [manaCost(0), manaCost(6)]
        },
        origin: 'Other',
        pending_cast: { object_id: 426, alternative_cost_election: 'Offered' }
      }
    })
  )!;
  expect(prompt.alternativeOffered).toBe(true);
  expect(prompt.options).toEqual([
    { index: 0, kind: 'pay', label: '{0}', mana: mana(0) },
    { index: 1, kind: 'pay', label: '{6}', mana: mana(6) }
  ]);
  // A wrapped discriminant still reads. Anything else is not an offer.
  const wrapped = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        player: 0,
        cost: { type: 'Choice', data: [manaCost(1)] },
        pending_cast: { object_id: 1, alternative_cost_election: { type: 'Offered' } }
      }
    })
  )!;
  expect(wrapped.alternativeOffered).toBe(true);
  const declined = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        player: 0,
        cost: { type: 'Choice', data: [manaCost(1)] },
        pending_cast: { object_id: 1, alternative_cost_election: 'Declined' }
      }
    })
  )!;
  expect(declined.alternativeOffered).toBe(false);
});

test('CR 702.174a: a gift is a promise, and the kind arrives tagged', () => {
  const prompt = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        player: 0,
        cost: { type: 'Optional', data: { cost: manaCost(0) } },
        origin: 'Gift',
        gift_kind: { type: 'Card' },
        pending_cast: { object_id: 423 }
      }
    })
  )!;
  expect(prompt.origin).toBe('gift');
  expect(prompt.giftKind).toBe('card');
  expect(prompt.options[0]).toEqual({ index: 0, kind: 'pay', label: '{0}', mana: mana(0) });
  expect(prompt.options[1]?.kind).toBe('decline');
  // A bare kind still reads. An unknown kind is not "a card".
  const bare = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        player: 0,
        cost: { type: 'Optional', data: { cost: manaCost(0) } },
        origin: 'Gift',
        gift_kind: 'ExtraTurn',
        pending_cast: { object_id: 1 }
      }
    })
  )!;
  expect(bare.giftKind).toBe('extra-turn');
  const odd = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        player: 0,
        cost: { type: 'Optional', data: { cost: manaCost(0) } },
        origin: 'Gift',
        gift_kind: { type: 'Octopus' },
        pending_cast: { object_id: 1 }
      }
    })
  )!;
  expect(odd.giftKind).toBe('unknown');
  // No kind published: not an invented card.
  const plain = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        player: 0,
        cost: { type: 'Optional', data: { cost: manaCost(0) } },
        origin: 'Gift',
        pending_cast: { object_id: 1 }
      }
    })
  )!;
  expect(plain.giftKind).toBeNull();
});

test('a missing origin is Other, an unknown one stays unknown, and the seat falls back to the viewer', () => {
  const missing = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        cost: { type: 'Optional', data: { cost: manaCost(1, ['Green']) } },
        pending_cast: { object_id: 7 }
      }
    }, 1)
  )!;
  expect(missing.origin).toBe('other');
  expect(missing.player).toBe(1);
  expect(missing.timesKicked).toBe(0);
  expect(missing.options[0]?.label).toBe('{1}{G}');
  const unknown = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        player: 0,
        cost: { type: 'Optional', data: { cost: manaCost(1) } },
        origin: 'Impending',
        pending_cast: {}
      }
    })
  )!;
  expect(unknown.origin).toBe('unknown');
  expect(unknown.spellId).toBeNull();
});

test('an empty kicker list asks nothing, a required cost has one payment, and a foreign window is not this one', () => {
  const empty = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        player: 0,
        cost: { type: 'Kicker', data: { costs: [] } },
        origin: 'Kicker',
        pending_cast: { object_id: 1 }
      }
    })
  )!;
  expect(empty.shape).toBe('kicker');
  expect(empty.options).toEqual([]);
  const required = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: {
        player: 0,
        cost: { type: 'Required', data: { type: 'PayLife', amount: { type: 'Fixed', value: 2 } } },
        pending_cast: { object_id: 1 }
      }
    })
  )!;
  expect(required.shape).toBe('required');
  expect(required.options).toEqual([{ index: 0, kind: 'pay', label: '2 vidas', mana: null }]);
  const unread = optionalCostPrompt(
    withWaiting({
      type: 'OptionalCostChoice',
      data: { player: 0, cost: { type: 'SomethingElse' }, pending_cast: { object_id: 1 } }
    })
  )!;
  expect(unread.shape).toBe('unknown');
  expect(unread.options).toEqual([]);
  expect(optionalCostPrompt(withWaiting({ type: 'DefilerPayment', data: {} }))).toBeNull();
  expect(optionalCostPrompt(null)).toBeNull();
});

test('CR 601.2b: the answer is the index alone', () => {
  expect(decideOptionalCostAction(0)).toEqual({ type: 'DecideOptionalCost', data: { index: 0 } });
  expect(decideOptionalCostAction(2)).toEqual({ type: 'DecideOptionalCost', data: { index: 2 } });
  expect(Object.keys(decideOptionalCostAction(1).data ?? {})).toEqual(['index']);
});

test('a cost is named only from what the engine published', () => {
  expect(namedAbilityCost({ type: 'Mana', cost: mana(0) })).toEqual({ label: '{0}', mana: mana(0) });
  expect(namedAbilityCost({ type: 'Mana', cost: { type: 'NoCost' } })).toEqual({ label: null, mana: null });
  expect(namedAbilityCost({ type: 'PayLife', amount: { type: 'Ref', qty: 'X' } }).label).toBeNull();
  // An aggregate sacrifice is not "sacrifice 1".
  expect(
    namedAbilityCost({
      type: 'Sacrifice',
      target: { type: 'Typed', type_filters: ['Creature'] },
      requirement: { requirement: 'aggregate', stat: 'TotalPower', comparator: 'GE', value: 4 }
    }).label
  ).toBeNull();
  expect(
    namedAbilityCost({
      type: 'TapCreatures',
      requirement: { requirement: 'aggregate', stat: 'TotalPower', comparator: 'GE', value: 2 },
      filter: { type: 'Typed', type_filters: ['Creature'], controller: 'You' }
    }).label
  ).toBe('Girar criaturas que controlas con fuerza total 2 o más');
  expect(
    namedAbilityCost({
      type: 'Composite',
      costs: [manaCost(1, ['Black']), { type: 'Discard', count: { type: 'Fixed', value: 1 } }]
    }).label
  ).toBe('{1}{B} y Descartar 1 carta');
  // One unnamed part unnamed the whole composition. A partial price is a lie.
  expect(
    namedAbilityCost({
      type: 'Composite',
      costs: [manaCost(1), { type: 'Waterbend', cost: mana(2) }]
    }).label
  ).toBeNull();
  expect(namedAbilityCost({ type: 'CollectEvidence', amount: 6 }).label).toBe(
    'Reunir pruebas con valor de maná total 6 o más'
  );
  expect(namedAbilityCost({ type: 'Blight', count: 1 }).label).toBe(
    'Poner 1 contador −1/−1 en una criatura que controlas'
  );
});
