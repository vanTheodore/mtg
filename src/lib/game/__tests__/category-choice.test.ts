import { expect, test } from 'bun:test';
import { categoryAction, categoryPrompt } from '../interaction';
import { coreTypeLabel } from '../cards';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 101.4 + CR 701.21a: "each player chooses one permanent of each of those types
 * from among the permanents they control, then sacrifices the rest" — Cataclysm
 * (each player for their own) and Tragic Arrogance (the controller for everyone).
 *
 * The payload is one candidate list **per category**, aligned with `categories`,
 * and the answer is one slot per category: a pick where there are candidates, a
 * `null` where there are none. The engine rejects both mistakes, so the screen must
 * keep every slot — including the empty ones.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 141,
    actions_applied: 141,
    metrics: {},
    state: {
      turn_number: 14,
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

const cataclysm = (data: Record<string, unknown> = {}) =>
  withWaiting({
    type: 'CategoryChoice',
    data: {
      player: 0,
      target_player: 0,
      source_id: 370,
      categories: ['Artifact', 'Creature', 'Enchantment', 'Land'],
      chooser_scope: 'EachPlayerSelf',
      eligible_per_category: [[341], [100, 101], [], [102]],
      remaining_players: [],
      all_kept: [],
      scoped_players: [0, 1],
      ...data
    }
  });

test('each category keeps its own candidate list, in the engine order', () => {
  const prompt = categoryPrompt(cataclysm())!;
  expect(prompt.categories).toEqual([
    { category: 'Artifact', eligible: [341] },
    { category: 'Creature', eligible: [100, 101] },
    { category: 'Enchantment', eligible: [] },
    { category: 'Land', eligible: [102] }
  ]);
  expect(prompt.sourceId).toBe(370);
  expect(prompt.chooserScope).toBe('self');
});

test('a category the payload forgot keeps its slot instead of shifting the rest', () => {
  const prompt = categoryPrompt(cataclysm({ eligible_per_category: [[341], [100], [102]] }))!;
  // Four categories, three lists: the last one is empty and nothing shifted into it.
  expect(prompt.categories.map((entry) => entry.eligible)).toEqual([[341], [100], [102], []]);
});

test('junk candidates are dropped from their own category only', () => {
  const prompt = categoryPrompt(cataclysm({ eligible_per_category: [[341, null, 'x'], [100], [], [102]] }))!;
  expect(prompt.categories[0].eligible).toEqual([341]);
  expect(prompt.categories[1].eligible).toEqual([100]);
});

test('`ControllerForAll` is the shape where one player chooses for everyone', () => {
  const forAll = categoryPrompt(
    cataclysm({ chooser_scope: 'ControllerForAll', target_player: 1, remaining_players: [1], all_kept: [341] })
  )!;
  expect(forAll.chooserScope).toBe('forAll');
  expect(forAll.targetPlayer).toBe(1);
  expect(forAll.remainingPlayers).toEqual([1]);
  expect(forAll.keptBefore).toEqual([341]);
  // An absent scope is the engine's default: each player for their own.
  expect(categoryPrompt(cataclysm({ chooser_scope: undefined }))!.chooserScope).toBe('self');
});

test('the answer is one slot per category, and the empty ones are nulls', () => {
  expect(categoryAction([341, 101, null, 102])).toEqual({
    type: 'SelectCategoryPermanents',
    data: { choices: [341, 101, null, 102] }
  });
  // Every category empty: still one (null) slot per category, never an empty list.
  expect(categoryAction([null, null, null, null]).data).toEqual({ choices: [null, null, null, null] });
});

test('core types read in Spanish, and an unmapped one keeps the engine word', () => {
  expect(coreTypeLabel('Artifact')).toBe('Artefacto');
  expect(coreTypeLabel('Creature')).toBe('Criatura');
  expect(coreTypeLabel('Land')).toBe('Tierra');
  expect(coreTypeLabel('Planeswalker')).toBe('Planeswalker');
  // No verified Spanish form: the engine's own word beats a guess.
  expect(coreTypeLabel('Battle')).toBe('Battle');
});

test('another prompt is not this block', () => {
  expect(categoryPrompt(withWaiting({ type: 'CategoryChoice' }))!.categories).toEqual([]);
  expect(categoryPrompt(withWaiting({ type: 'ProliferateChoice', data: {} }))).toBeNull();
  expect(categoryPrompt(withWaiting({ type: 'ChooseObjectsSelection', data: {} }))).toBeNull();
  expect(categoryPrompt(null)).toBeNull();
});
