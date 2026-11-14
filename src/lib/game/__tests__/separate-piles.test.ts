import { expect, test } from 'bun:test';
import { choosePileAction, separatePilesPrompt, submitPilePartitionAction } from '../interaction';
import { choosePileOpponentAction } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 700.3: "separate into two piles, then an opponent chooses one" — the primitive
 * behind Make an Example, Fact or Fiction and Boneyard Parley. The engine runs it as
 * three prompts and this parser reads all three, because it is one flow:
 *
 *   - `SeparatePilesChooseOpponent` — who partitions. With a single opponent the
 *     engine skips it, so it only exists in games of three or more players.
 *   - `SeparatePilesPartition` — the subject names pile A; the engine derives pile B
 *     as the rest of the pool (CR 700.3a), and either pile may be empty (CR 700.3d).
 *   - `SeparatePilesChoice` — the chooser picks A or B for one subject at a time
 *     (CR 101.4c).
 *
 * `pile_source` says where the objects come from — battlefield (Make an Example),
 * top of the library (Fact or Fiction) or an earlier exile (Boneyard Parley) — so the
 * block can say "permanentes" or "cartas" without guessing.
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
      turn_number: 16,
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

const partition = (data: Record<string, unknown> = {}) =>
  withWaiting({
    type: 'SeparatePilesPartition',
    data: {
      player: 0,
      eligible: [100, 101, 105],
      remaining_subjects: [],
      completed: [],
      chooser: 1,
      source_id: 387,
      pile_source: { type: 'Battlefield' },
      ...data
    }
  });

const choice = (data: Record<string, unknown> = {}) =>
  withWaiting({
    type: 'SeparatePilesChoice',
    data: {
      player: 0,
      pending: [],
      current: { subject: 1, pile_a: [200], pile_b: [201] },
      source_id: 387,
      pile_source: { type: 'Battlefield' },
      ...data
    }
  });

const opponent = (data: Record<string, unknown> = {}) =>
  withWaiting({
    type: 'SeparatePilesChooseOpponent',
    data: {
      player: 0,
      candidates: [1, 2],
      eligible: [100, 101],
      chooser: 0,
      source_id: 387,
      pile_source: { type: 'Battlefield' },
      ...data
    }
  });

test('the partition stage publishes the pool, who chooses later and who is next', () => {
  const prompt = separatePilesPrompt(
    partition({ remaining_subjects: [[2, [300, 301]]] })
  )!;
  expect(prompt.stage).toBe('partition');
  expect(prompt.eligible).toEqual([100, 101, 105]);
  expect(prompt.chooser).toBe(1);
  expect(prompt.remainingSubjects).toEqual([{ player: 2, eligible: [300, 301] }]);
  expect(prompt.pileSource).toBe('battlefield');
  expect(prompt.current).toBeNull();
});

test('the choice stage publishes the two piles of the subject in turn', () => {
  const prompt = separatePilesPrompt(
    choice({ pending: [{ subject: 2, pile_a: [300], pile_b: [301, 302] }] })
  )!;
  expect(prompt.stage).toBe('choice');
  expect(prompt.current).toEqual({ subject: 1, pileA: [200], pileB: [201] });
  // CR 101.4c: the chooser answers one subject at a time, so the rest is a queue.
  expect(prompt.pending).toEqual([{ subject: 2, pileA: [300], pileB: [301, 302] }]);
});

test('the opponent stage exists only with three or more players', () => {
  const prompt = separatePilesPrompt(opponent())!;
  expect(prompt.stage).toBe('opponent');
  expect(prompt.candidates).toEqual([1, 2]);
  expect(prompt.chooser).toBe(0);
});

test('the pile source decides the word, and keeps the library count', () => {
  // Fact or Fiction: the cards come from the top of the library.
  const library = separatePilesPrompt(
    partition({ pile_source: { type: 'RevealedFromLibraryTop', data: { count: 5 } } })
  )!;
  expect(library.pileSource).toBe('library');
  expect(library.libraryCount).toBe(5);
  // Boneyard Parley: cards exiled earlier in the same resolution.
  expect(separatePilesPrompt(partition({ pile_source: { type: 'ExiledThisWay' } }))!.pileSource).toBe('exile');
  // Absent means the battlefield shape, which is the engine's own default.
  expect(separatePilesPrompt(partition({ pile_source: undefined }))!.pileSource).toBe('battlefield');
});

test('a library source without its count does not invent one', () => {
  const prompt = separatePilesPrompt(partition({ pile_source: { type: 'RevealedFromLibraryTop' } }))!;
  expect(prompt.pileSource).toBe('library');
  expect(prompt.libraryCount).toBeNull();
});

test('junk piles and subjects are dropped, and an empty pile stays empty', () => {
  const prompt = separatePilesPrompt(
    choice({
      current: { subject: 1, pile_a: [], pile_b: [201, null, 'x'] },
      pending: [{ subject: 2 }, 'junk', { pile_a: [1] }]
    })
  )!;
  // CR 700.3d: an empty pile is legal and is not repaired into anything.
  expect(prompt.current).toEqual({ subject: 1, pileA: [], pileB: [201] });
  // A pending entry without a subject is not a subject; one with a subject but no
  // piles is a subject whose two piles are both empty (CR 700.3d).
  expect(prompt.pending).toEqual([{ subject: 2, pileA: [], pileB: [] }]);
});

test('the defaults fall back to the viewer seat and a missing source', () => {
  const prompt = separatePilesPrompt(partition({ player: undefined, source_id: undefined, chooser: undefined }))!;
  expect(prompt.player).toBe(0);
  expect(prompt.sourceId).toBe(0);
  expect(prompt.chooser).toBeNull();
});

test('the three stages answer with the engine actions they expect', () => {
  expect(choosePileOpponentAction(1)).toEqual({ type: 'ChoosePileOpponent', data: { opponent: 1 } });
  // CR 700.3a: only pile A travels; pile B is derived by the engine.
  expect(submitPilePartitionAction([101, 105])).toEqual({
    type: 'SubmitPilePartition',
    data: { pile_a: [101, 105] }
  });
  expect(submitPilePartitionAction([]).data).toEqual({ pile_a: [] });
  // The side is typed on the wire, not a boolean.
  expect(choosePileAction('A')).toEqual({ type: 'ChoosePile', data: { pile: { type: 'A' } } });
  expect(choosePileAction('B')).toEqual({ type: 'ChoosePile', data: { pile: { type: 'B' } } });
});

test('another prompt is not this block', () => {
  expect(separatePilesPrompt(withWaiting({ type: 'ExploreChoice', data: {} }))).toBeNull();
  expect(separatePilesPrompt(withWaiting({ type: 'VoteChoice', data: {} }))).toBeNull();
  expect(separatePilesPrompt(null)).toBeNull();
});
