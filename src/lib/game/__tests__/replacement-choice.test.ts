import { expect, test } from 'bun:test';
import { chooseReplacementAction, replacementPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 616.1: one `WaitingFor` serves three prompts — ordering, an optional
 * branch, and found-card destinations — and the engine publishes which one
 * (`kind`) so the table never re-derives it from label text. The answer is a
 * position, `ChooseReplacement { index }`.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 7,
    revision: 30,
    actions_applied: 30,
    metrics: {},
    state: {
      turn_number: 5,
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

const order = (data: Record<string, unknown> = {}) => ({
  type: 'ReplacementChoice',
  data: {
    player: 0,
    candidate_count: 2,
    candidates: [
      { source_id: 410, source_name: 'Kalitas, Traitor of Ghet', description: 'Exiliar la criatura' },
      { source_id: 411, source_name: 'Rest in Peace', description: 'Exiliar la carta' }
    ],
    kind: { type: 'Order' },
    last_applied_decides: true,
    ...data
  }
});

test('an ordering carries every replacement with its source and its own wording', () => {
  const prompt = replacementPrompt(withWaiting(order()))!;
  expect(prompt.player).toBe(0);
  expect(prompt.kind).toBe('order');
  expect(prompt.options).toEqual([
    { index: 0, sourceId: 410, sourceName: 'Kalitas, Traitor of Ghet', description: 'Exiliar la criatura' },
    { index: 1, sourceId: 411, sourceName: 'Rest in Peace', description: 'Exiliar la carta' }
  ]);
  // CR 616.1f: only the engine gets to say whether the last one decides.
  expect(prompt.lastAppliedDecides).toBe(true);
});

test('the kind travels tagged or as a plain name, and defaults to an ordering', () => {
  expect(replacementPrompt(withWaiting(order({ kind: { type: 'OptionalBranch' } })))!.kind).toBe('optional');
  expect(replacementPrompt(withWaiting(order({ kind: 'OptionalBranch' })))!.kind).toBe('optional');
  expect(replacementPrompt(withWaiting(order({ kind: { type: 'SearchFoundDestination' } })))!.kind).toBe('destination');
  // CR 616.1e is the serde default: an older state without the field is an ordering.
  expect(replacementPrompt(withWaiting(order({ kind: undefined })))!.kind).toBe('order');
  expect(replacementPrompt(withWaiting(order({ kind: { type: 'Junk' } })))!.kind).toBe('order');
});

test('a slot without a summary still gets a button: the answer is the position', () => {
  // `EmptyManaPool` builds its summaries with `filter_map`, so the list can be
  // shorter than what the engine will accept. Dropping the empty slot would leave
  // a legal index with nothing to click.
  const prompt = replacementPrompt(
    withWaiting(order({ candidate_count: 3, candidates: order().data.candidates }))
  )!;
  expect(prompt.options.length).toBe(3);
  expect(prompt.options[2]).toEqual({ index: 2, sourceId: null, sourceName: null, description: null });
  // A state with no summaries at all is still a prompt while the engine accepts an index.
  const bare = replacementPrompt(withWaiting(order({ candidate_count: 1, candidates: undefined })))!;
  expect(bare.options).toEqual([{ index: 0, sourceId: null, sourceName: null, description: null }]);
});

test('empty, malformed or neighbouring windows are not this prompt', () => {
  expect(replacementPrompt(withWaiting(order({ candidate_count: 0, candidates: [] })))).toBeNull();
  expect(replacementPrompt(withWaiting({ type: 'OrderTriggers', data: {} }))).toBeNull();
  expect(replacementPrompt(null)).toBeNull();
});

test('names and descriptions are optional, never invented', () => {
  const prompt = replacementPrompt(
    withWaiting(
      order({
        candidate_count: 1,
        candidates: [{ source_id: 'x', source_name: '', description: 7 }]
      })
    )
  )!;
  expect(prompt.options[0]).toEqual({ index: 0, sourceId: null, sourceName: null, description: null });
});

test('the seat defaults to the viewer and «se componen» is the absence of the flag', () => {
  const prompt = replacementPrompt(withWaiting(order({ player: undefined, last_applied_decides: undefined }), 3))!;
  expect(prompt.player).toBe(3);
  // CR 616.1f: the display may not assume last-write-wins.
  expect(prompt.lastAppliedDecides).toBe(false);
});

test('only the engine’s own key marks the answer as rememberable', () => {
  expect(replacementPrompt(withWaiting(order()))!.rememberable).toBe(false);
  const rememberable = replacementPrompt(
    withWaiting(order({ remember_identity: { type: 'Optional', data: { source: 410 } } }))
  )!;
  expect(rememberable.rememberable).toBe(true);
});

test('the answer is the index, exactly as the engine accepts it', () => {
  expect(chooseReplacementAction(0)).toEqual({ type: 'ChooseReplacement', data: { index: 0 } });
  expect(chooseReplacementAction(2)).toEqual({ type: 'ChooseReplacement', data: { index: 2 } });
});
