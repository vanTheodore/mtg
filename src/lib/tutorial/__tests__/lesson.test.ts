import { expect, test } from 'bun:test';
import { GLOSSARY } from '../glossary.ts';
import {
  MAX_MULLIGANS,
  STEPS,
  TUTORIAL_CARD_NAMES,
  TUTORIAL_DECK,
  TUTORIAL_SEED,
  battleStepIsDone,
  creatureInHand,
  handSupportsLesson,
  introducedWords,
  isCreature,
  isLand,
  landInHand,
  legalFor,
  manaPoolOf,
  mulliganAction,
  dummyAction
} from '../lesson.ts';
import { manaPips } from '../../game/cards.ts';
import type { EngineSnapshot, GameObject } from '../../engine/types.ts';

/** A synthetic card, shaped like the objects Phase publishes. */
export function card(id: number, name: string, types: string[], extra: Partial<GameObject> = {}): GameObject {
  return {
    id,
    card_id: id,
    owner: 0,
    controller: 0,
    zone: 'Hand',
    name,
    card_types: { core_types: types, subtypes: [], supertypes: [] },
    ...extra
  } as GameObject;
}

export interface SnapshotOptions {
  viewer?: number;
  active?: number;
  phase?: string;
  waiting?: string;
  hand?: GameObject[];
  battlefield?: GameObject[];
  actions?: EngineSnapshot['legal']['actions'];
  byObject?: Record<string, EngineSnapshot['legal']['actions']>;
  life?: [number, number];
  mana?: number;
  combat?: EngineSnapshot['state']['combat'];
  turn?: number;
}

/** A synthetic snapshot: the same shape the engine publishes, nothing more. */
export function makeSnapshot(options: SnapshotOptions = {}): EngineSnapshot {
  const hand = options.hand ?? [];
  const battlefield = options.battlefield ?? [];
  const objects: Record<string, GameObject> = {};
  for (const object of [...hand, ...battlefield]) objects[String(object.id)] = object;
  const [lifeA, lifeB] = options.life ?? [20, 20];
  const pool = (total: number) => ({ total, white: total, blue: 0, black: 0, red: 0, green: 0, colorless: 0 });
  return {
    ok: true,
    viewer: options.viewer ?? 0,
    seed: TUTORIAL_SEED,
    revision: 1,
    actions_applied: 1,
    metrics: {},
    state: {
      turn_number: options.turn ?? 1,
      active_player: options.active ?? 0,
      priority_player: options.viewer ?? 0,
      phase: options.phase ?? 'PreCombatMain',
      waiting_for: { type: options.waiting ?? 'Priority' },
      players: [
        {
          id: 0, life: lifeA, mana_pool: pool(options.mana ?? 0), hand: hand.map((o) => o.id),
          library_count: 30, graveyard: [], exile: [], is_eliminated: false, poison_counters: 0,
          energy: 0, lands_played_this_turn: 0
        },
        {
          id: 1, life: lifeB, mana_pool: pool(0), hand: [], library_count: 33, graveyard: [], exile: [],
          is_eliminated: false, poison_counters: 0, energy: 0, lands_played_this_turn: 0
        }
      ],
      battlefield: battlefield.map((o) => o.id),
      stack: [],
      exile: [],
      objects,
      combat: options.combat ?? null
    },
    derived: {},
    legal: { actions: options.actions ?? [], spell_costs: {}, by_object: options.byObject ?? {} }
  } as unknown as EngineSnapshot;
}

test('the lesson is a short, complete script with unique steps', () => {
  expect(STEPS.length).toBeGreaterThanOrEqual(8);
  expect(STEPS.length).toBeLessThanOrEqual(12);
  const ids = STEPS.map((step) => step.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const step of STEPS) {
    expect(step.title.length).toBeGreaterThan(3);
    expect(step.teach.length).toBeGreaterThan(20);
    expect(step.goal.length).toBeGreaterThan(10);
    expect(step.action.length).toBeGreaterThan(3);
  }
});

test('the lesson ends with a final screen and every other step is playable', () => {
  expect(STEPS[STEPS.length - 1].kind).toBe('final');
  for (const step of STEPS.slice(0, -1)) {
    expect(['read', 'act', 'wait']).toContain(step.kind);
    if (step.kind === 'act') expect(typeof step.perform).toBe('function');
  }
});

test('every word the lesson introduces exists in the glossary', () => {
  const known = new Set(GLOSSARY.map((entry) => entry.term));
  for (const word of introducedWords(STEPS.length)) {
    expect(known.has(word)).toBe(true);
  }
});

test('words are introduced progressively, never all at once', () => {
  expect(introducedWords(0)).toEqual(['vida', 'jugador', 'rival']);
  expect(introducedWords(0).length).toBeLessThan(introducedWords(STEPS.length).length);
  // The combat vocabulary arrives with the attack, not before.
  const beforeAttack = introducedWords(STEPS.findIndex((step) => step.id === 'attack') - 1);
  expect(beforeAttack).not.toContain('atacar');
  expect(introducedWords(STEPS.length)).toContain('bloquear');
});

test('the deck is exactly two simple cards and forty cards per seat', () => {
  expect(TUTORIAL_DECK.player.main_deck).toHaveLength(40);
  expect(TUTORIAL_DECK.opponent.main_deck).toHaveLength(40);
  expect(new Set(TUTORIAL_DECK.player.main_deck)).toEqual(new Set(['Plains', 'Savannah Lions']));
  expect(TUTORIAL_DECK.opponent.main_deck.every((name) => name === 'Plains')).toBe(true);
  expect([...TUTORIAL_CARD_NAMES].sort()).toEqual(['Plains', 'Savannah Lions']);
});

test('the reader helpers tell lands and creatures apart', () => {
  const plains = card(1, 'Plains', ['Land']);
  const lions = card(2, 'Savannah Lions', ['Creature']);
  expect(isLand(plains)).toBe(true);
  expect(isCreature(lions)).toBe(true);
  expect(isCreature(plains)).toBe(false);
});

test('the lesson finds the card it points at, in hand and on the battlefield', () => {
  const plains = card(1, 'Plains', ['Land']);
  const lions = card(2, 'Savannah Lions', ['Creature']);
  const snapshot = makeSnapshot({ hand: [lions, plains] });
  expect(landInHand(snapshot, { learner: 0, dummy: 1 })?.id).toBe(1);
  expect(creatureInHand(snapshot, { learner: 0, dummy: 1 })?.id).toBe(2);
});

test('a hand without a land or without a creature cannot support the lesson', () => {
  const plains = card(1, 'Plains', ['Land']);
  const lions = card(2, 'Savannah Lions', ['Creature']);
  expect(handSupportsLesson(makeSnapshot({ hand: [plains, lions] }), { learner: 0, dummy: 1 })).toBe(true);
  expect(handSupportsLesson(makeSnapshot({ hand: [plains] }), { learner: 0, dummy: 1 })).toBe(false);
  expect(handSupportsLesson(makeSnapshot({ hand: [lions] }), { learner: 0, dummy: 1 })).toBe(false);
});

test('the mulligan is kept when the hand works and redrawn when it does not', () => {
  const keep = { type: 'MulliganDecision', data: { choice: { type: 'Keep' } } };
  const redraw = { type: 'MulliganDecision', data: { choice: { type: 'Mulligan' } } };
  const ctx = { learner: 0, dummy: 1 };
  const good = makeSnapshot({ hand: [card(1, 'Plains', ['Land']), card(2, 'Savannah Lions', ['Creature'])], actions: [keep, redraw] });
  expect(mulliganAction(good, ctx, 0)?.data?.choice).toEqual({ type: 'Keep' });
  const bad = makeSnapshot({ hand: [card(1, 'Plains', ['Land'])], actions: [keep, redraw] });
  expect(mulliganAction(bad, ctx, 0)?.data?.choice).toEqual({ type: 'Mulligan' });
  // The limit is respected: after the allowed redraws the hand is kept.
  expect(mulliganAction(bad, ctx, MAX_MULLIGANS)?.data?.choice).toEqual({ type: 'Keep' });
});

test('the dummy only answers with actions the engine published', () => {
  const pass = { type: 'PassPriority' };
  const noBlock = { type: 'DeclareBlockers', data: { assignments: [] } };
  const block = { type: 'DeclareBlockers', data: { assignments: [[9, 4]] } };
  const ctx = { learner: 0, dummy: 1 };
  const blocking = makeSnapshot({ viewer: 1, waiting: 'DeclareBlockers', actions: [block, noBlock, pass] });
  expect(dummyAction(blocking)?.type).toBe('DeclareBlockers');
  expect((dummyAction(blocking)?.data?.assignments ?? []) as unknown[]).toHaveLength(0);
  const idle = makeSnapshot({ viewer: 1, actions: [pass] });
  expect(dummyAction(idle)?.type).toBe('PassPriority');
  expect(dummyAction(makeSnapshot({ viewer: 1, actions: [] }))).toBeUndefined();
});

test('the step predicates read the engine state instead of re-deciding rules', () => {
  const ctx = { learner: 0, dummy: 1 };
  const plains = card(1, 'Plains', ['Land'], { zone: 'Battlefield' });
  const lions = card(2, 'Savannah Lions', ['Creature'], { zone: 'Battlefield' });
  const empty = { sawOpponentTurn: false };
  expect(battleStepIsDone('play-land', makeSnapshot({ battlefield: [plains] }), empty, ctx)).toBe(true);
  expect(battleStepIsDone('make-mana', makeSnapshot({ mana: 1 }), empty, ctx)).toBe(true);
  expect(battleStepIsDone('cast-creature', makeSnapshot({ battlefield: [lions] }), empty, ctx)).toBe(true);
  expect(battleStepIsDone('damage', makeSnapshot({ life: [20, 18] }), empty, ctx)).toBe(true);
  expect(battleStepIsDone('damage', makeSnapshot({ life: [20, 20] }), empty, ctx)).toBe(false);
  expect(battleStepIsDone('end-turn', makeSnapshot({ active: 0 }), { sawOpponentTurn: true }, ctx)).toBe(true);
  expect(battleStepIsDone('end-turn', makeSnapshot({ active: 0 }), empty, ctx)).toBe(false);
});

test('the legal action is looked up in the bucket the engine published', () => {
  const snapshot = makeSnapshot({
    hand: [card(1, 'Plains', ['Land'])],
    byObject: { '1': [{ type: 'PlayLand', data: { object_id: 1, card_id: 1 } }] }
  });
  expect(legalFor(snapshot, 'PlayLand', 1)?.type).toBe('PlayLand');
  expect(legalFor(snapshot, 'CastSpell', 1)).toBeUndefined();
});

test('the mana pool is read from the engine', () => {
  expect(manaPoolOf(makeSnapshot({ mana: 2 }), 0)).toBe(2);
  expect(manaPoolOf(makeSnapshot({}), 0)).toBe(0);
});

test('a mana cost is shown as pips, read from the engine DTO', () => {
  expect(manaPips({ type: 'Cost', shards: ['White'], generic: 0 })).toEqual([{ symbol: 'W', kind: 'white' }]);
  expect(manaPips({ type: 'Cost', shards: ['Green'], generic: 1 })).toEqual([
    { symbol: '1', kind: 'generic' },
    { symbol: 'G', kind: 'green' }
  ]);
  expect(manaPips({ type: 'NoCost' })).toEqual([]);
  expect(manaPips(undefined)).toEqual([]);
});
