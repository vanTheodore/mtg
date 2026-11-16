import { expect, test } from 'bun:test';
import {
  comparatorHolds,
  payCostAction,
  payCostPrompt,
  phyrexianChoicesAction,
  phyrexianPaymentPrompt,
  selectCardsAction
} from '../interaction';
import type { EngineSnapshot } from '../../engine/types';
import type { PayCostKindName, PayCostResume } from '../interaction';

/**
 * CR 118.3 + CR 601.2b: a cost paid by choosing objects is one window with one
 * answer (`SelectCards`) and a dozen meanings, told apart by `kind`. The engine
 * publishes the candidates and the cardinality contract (`count` ceiling,
 * `min_count` floor) and, for the aggregate kinds, the constraint itself.
 *
 * CR 400.2: the candidates can be **redacted for a viewer** — the whole list for
 * `Reveal`/`Discard`, `0` placeholders for a hand pitch — so a `0` is not a card
 * and an empty list is not always «nothing to choose».
 *
 * CR 107.4f: Phyrexian payment is the opposite shape — an ordered vector with one
 * entry per shard, whose length must equal `shards.len()`.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 3,
    revision: 7,
    actions_applied: 7,
    metrics: {},
    state: {
      turn_number: 3,
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

const payCost = (data: Record<string, unknown> = {}, viewer = 0) =>
  withWaiting(
    {
      type: 'PayCost',
      data: {
        player: 0,
        kind: { type: 'Sacrifice' },
        choices: [100, 101, 105],
        count: 2,
        min_count: 2,
        resume: { type: 'Spell', spell: { object_id: 419 } },
        ...data
      }
    },
    viewer
  );

test('every published cost kind gets its own name, and an unknown one says so', () => {
  const kinds: [string, PayCostKindName][] = [
    ['Discard', 'discard'],
    ['Reveal', 'reveal'],
    ['Sacrifice', 'sacrifice'],
    ['ReturnToHand', 'return-to-hand'],
    ['ExileFromZone', 'exile-from-zone'],
    ['ExileMaterials', 'exile-materials'],
    ['ExilePermanent', 'exile-permanent'],
    ['ExileFromManaZone', 'exile-from-mana-zone'],
    ['UnattachFrom', 'unattach'],
    ['RemoveCounter', 'remove-counter'],
    ['TapCreatures', 'tap-creatures'],
    ['Behold', 'behold'],
    ['ExileAggregate', 'exile-aggregate']
  ];
  for (const [tag, name] of kinds) {
    expect(payCostPrompt(payCost({ kind: { type: tag } }))!.kind).toBe(name);
  }
  expect(payCostPrompt(payCost({ kind: { type: 'SomethingNew' } }))!.kind).toBe('unknown');
  expect(payCostPrompt(payCost({ kind: null }))!.kind).toBe('unknown');
});

test('the cardinality contract is the engine’s: a ceiling and a floor', () => {
  const exact = payCostPrompt(payCost())!;
  expect(exact.count).toBe(2);
  expect(exact.minCount).toBe(2);
  // An at-least cost keeps both numbers, and zero may be published as the floor.
  const atLeast = payCostPrompt(payCost({ count: 3, min_count: 0 }))!;
  expect([atLeast.count, atLeast.minCount]).toEqual([3, 0]);
  // A floor above the ceiling is clamped: the answer can never exceed `count`.
  expect(payCostPrompt(payCost({ count: 1, min_count: 4 }))!.minCount).toBe(1);
  // An absent `min_count` is the old wire shape, which meant «exactly count».
  const absent = payCost({});
  delete (absent.state.waiting_for!.data as Record<string, unknown>).min_count;
  expect(payCostPrompt(absent)!.minCount).toBe(2);
});

test('CR 400.2: placeholders are counted, not named, and never become choices', () => {
  const hidden = payCostPrompt(payCost({ kind: { type: 'ExileFromZone', zone: 'Hand' }, choices: [0, 0] }, 1))!;
  expect(hidden.choices).toEqual([]);
  expect(hidden.hiddenChoices).toBe(2);
  expect(hidden.zone).toBe('Hand');
  // `Reveal`/`Discard` lose the whole list for an opponent, so the count survives
  // while there is nothing to hide: an empty list is `0` placeholders.
  const dropped = payCostPrompt(payCost({ kind: { type: 'Discard' }, choices: [] }, 1))!;
  expect(dropped.choices).toEqual([]);
  expect(dropped.hiddenChoices).toBe(0);
  expect(dropped.count).toBe(2);
});

test('the prompt says which pipeline resumes, and never repeats the pending cast', () => {
  const names: [string, PayCostResume][] = [
    ['Spell', 'spell'],
    ['SpellCost', 'spell-cost'],
    ['ManaAbility', 'mana-ability'],
    ['Resolution', 'resolution'],
    ['TeamTapPayment', 'team-tap'],
    ['TurnFaceUp', 'turn-face-up'],
    ['Unknown', 'unknown']
  ];
  for (const [tag, name] of names) {
    expect(payCostPrompt(payCost({ resume: { type: tag } }))!.resume).toBe(name);
  }
  const prompt = payCostPrompt(payCost())!;
  expect(Object.keys(prompt)).not.toContain('resumePayload');
  expect(JSON.stringify(prompt)).not.toContain('419');
});

test('counter costs carry which counters and from how many objects', () => {
  const single = payCostPrompt(
    payCost({
      kind: { type: 'RemoveCounter', counter_type: 'Any', count: 2, selection: 'SingleObject' }
    })
  )!;
  expect(single.counters).toEqual({ count: 2, perObject: 'single' });
  expect(single.counterKind).toBe('cualquiera');
  const among = payCostPrompt(
    payCost({
      kind: {
        type: 'RemoveCounter',
        counter_type: { OfType: 'Plus1Plus1' },
        count: 1,
        selection: 'AmongObjects'
      }
    })
  )!;
  expect(among.counters).toEqual({ count: 1, perObject: 'among' });
  expect(among.counterKind).toBe('Plus1Plus1');
  // Other kinds do not invent counter data.
  expect(payCostPrompt(payCost())!.counters).toBeNull();
});

test('aggregate costs keep the engine’s comparator instead of assuming «at least»', () => {
  const aggregate = payCostPrompt(
    payCost({
      kind: {
        type: 'TapCreatures',
        mode: { Aggregate: { stat: 'TotalPower', comparator: 'GE', value: 4 } }
      },
      count: 3,
      min_count: 0
    })
  )!;
  expect(aggregate.tapAggregate).toEqual({ comparator: 'GE', symbol: '≥', value: 4 });
  expect(comparatorHolds('GE', 4, 4)).toBe(true);
  expect(comparatorHolds('GE', 3, 4)).toBe(false);
  expect(comparatorHolds('LE', 3, 4)).toBe(true);
  expect(comparatorHolds('LT', 4, 4)).toBe(false);
  expect(comparatorHolds('NE', 4, 4)).toBe(false);
  expect(comparatorHolds('EQ', 4, 4)).toBe(true);
  // Fixed and VariableX are not aggregate: nothing to satisfy but the count.
  expect(payCostPrompt(payCost({ kind: { type: 'TapCreatures', mode: 'Fixed' } }))!.tapAggregate).toBeNull();
  expect(payCostPrompt(payCost({ kind: { type: 'TapCreatures', mode: 'VariableX' } }))!.tapAggregate).toBeNull();
});

test('an exile aggregate publishes its function, property and threshold', () => {
  const prompt = payCostPrompt(
    payCost({
      kind: {
        type: 'ExileAggregate',
        zone: 'Graveyard',
        function: 'Count',
        property: 'CardTypes',
        comparator: 'GE',
        value: 3
      }
    })
  )!;
  expect(prompt.exileAggregate).toEqual({
    function: 'Count',
    property: 'CardTypes',
    comparator: '≥',
    value: 3
  });
  expect(prompt.zone).toBe('Graveyard');
});

test('reveal keeps its shared quality and behold its action', () => {
  const reveal = payCostPrompt(payCost({ kind: { type: 'Reveal', shared_quality: 'Color' } }))!;
  expect(reveal.sharedQuality).toBe('Color');
  expect(payCostPrompt(payCost({ kind: { type: 'Reveal' } }))!.sharedQuality).toBeNull();
  expect(payCostPrompt(payCost({ kind: { type: 'Behold', action: 'ExileChosen' } }))!.behold).toBe('exile-chosen');
  expect(payCostPrompt(payCost({ kind: { type: 'Behold', action: 'ChooseOrReveal' } }))!.behold).toBe(
    'choose-or-reveal'
  );
});

test('the answer is the shared `SelectCards` envelope, in the caller’s order', () => {
  expect(payCostAction([105, 100])).toEqual(selectCardsAction([105, 100]));
  expect(payCostAction([])).toEqual({ type: 'SelectCards', data: { cards: [] } });
  expect(payCostPrompt(withWaiting({ type: 'PhyrexianPayment', data: {} }))).toBeNull();
});

test('CR 107.4f: Phyrexian payment is one answer per shard, in order', () => {
  const prompt = phyrexianPaymentPrompt(
    withWaiting({
      type: 'PhyrexianPayment',
      data: {
        player: 0,
        spell_object: 419,
        shards: [
          { shard_index: 0, color: 'Black', options: 'ManaOrLife' },
          { shard_index: 1, color: 'Black', options: 'ManaOnly' },
          { shard_index: 2, color: 'Blue', options: 'LifeOnly' }
        ]
      }
    })
  )!;
  expect(prompt.spellId).toBe(419);
  expect(prompt.shards.map((shard) => shard.options)).toEqual(['mana-or-life', 'mana-only', 'life-only']);
  expect(prompt.shards.map((shard) => shard.color)).toEqual(['Black', 'Black', 'Blue']);
  // A shard without `shard_index` falls back to its position, never to 0.
  const positional = phyrexianPaymentPrompt(
    withWaiting({
      type: 'PhyrexianPayment',
      data: { player: 0, spell_object: 419, shards: [{ color: 'Red' }, { color: 'Green' }] }
    })
  )!;
  expect(positional.shards.map((shard) => shard.index)).toEqual([0, 1]);
  // No shards, no question: the engine settles the payment itself.
  expect(
    phyrexianPaymentPrompt(withWaiting({ type: 'PhyrexianPayment', data: { player: 0, shards: [] } }))
  ).toBeNull();
  expect(phyrexianPaymentPrompt(withWaiting({ type: 'PayCost', data: {} }))).toBeNull();
});

test('the Phyrexian answer is a full vector of tagged shard choices', () => {
  expect(phyrexianChoicesAction(['mana', 'life'])).toEqual({
    type: 'SubmitPhyrexianChoices',
    data: { choices: [{ type: 'PayMana' }, { type: 'PayLife' }] }
  });
  // The engine requires `choices.len() == shards.len()`; an empty vector is what a
  // caller sends only when the prompt published no shards.
  expect(phyrexianChoicesAction([])).toEqual({ type: 'SubmitPhyrexianChoices', data: { choices: [] } });
});
