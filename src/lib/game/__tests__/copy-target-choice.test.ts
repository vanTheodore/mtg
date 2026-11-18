import { expect, test } from 'bun:test';
import { copyTargetPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 707.2 + CR 707.9: a copy effect asks which permanent to copy. Copying does
 * not target, so hexproof and shroud never narrow the list — the engine's
 * `valid_targets` is the whole answer. The same variant serves three purposes,
 * and the engine says which one with `purpose`.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 9,
    revision: 40,
    actions_applied: 40,
    metrics: {},
    state: {
      turn_number: 6,
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

const copy = (data: Record<string, unknown> = {}) => ({
  type: 'CopyTargetChoice',
  data: {
    player: 0,
    source_id: 415,
    valid_targets: [100, 101, 105],
    max_mana_value: 4,
    purpose: { type: 'BecomeCopy' },
    ...data
  }
});

test('the entering object, the legal permanents and the ceiling are what the window carries', () => {
  const prompt = copyTargetPrompt(withWaiting(copy()))!;
  expect(prompt.player).toBe(0);
  expect(prompt.sourceId).toBe(415);
  expect(prompt.purpose).toBe('copy');
  expect(prompt.targets).toEqual([100, 101, 105]);
  // The printed ceiling is a sentence about a list Phase already filtered.
  expect(prompt.maxManaValue).toBe(4);
});

test('the three purposes travel tagged or as plain names, and default to a copy', () => {
  expect(copyTargetPrompt(withWaiting(copy({ purpose: { type: 'PersistChosenAttribute' } })))!.purpose).toBe('latch');
  expect(copyTargetPrompt(withWaiting(copy({ purpose: 'CopyTokenSource' })))!.purpose).toBe('tokenSource');
  expect(copyTargetPrompt(withWaiting(copy({ purpose: { type: 'CopyTokenSource' } })))!.purpose).toBe('tokenSource');
  // `BecomeCopy` is the serde default: an older state without the field is a clone.
  expect(copyTargetPrompt(withWaiting(copy({ purpose: undefined })))!.purpose).toBe('copy');
  expect(copyTargetPrompt(withWaiting(copy({ purpose: { type: 'Junk' } })))!.purpose).toBe('copy');
});

test('a window with nothing to copy is not a window', () => {
  expect(copyTargetPrompt(withWaiting(copy({ valid_targets: [] })))).toBeNull();
  expect(copyTargetPrompt(withWaiting(copy({ valid_targets: undefined })))).toBeNull();
  // Without the object the copy belongs to there is nothing to name.
  expect(copyTargetPrompt(withWaiting(copy({ source_id: undefined })))).toBeNull();
  expect(copyTargetPrompt(withWaiting({ type: 'CopyRetarget', data: {} }))).toBeNull();
  expect(copyTargetPrompt(null)).toBeNull();
});

test('non-numeric candidates are dropped and the ceiling is never invented', () => {
  const prompt = copyTargetPrompt(
    withWaiting(copy({ valid_targets: [100, '101', null, 105], max_mana_value: undefined }))
  )!;
  expect(prompt.targets).toEqual([100, 105]);
  // Absent is not zero: only a published ceiling gets printed.
  expect(prompt.maxManaValue).toBeNull();
});

test('the seat defaults to the viewer when the engine sends no player', () => {
  const prompt = copyTargetPrompt(withWaiting(copy({ player: undefined }), 3))!;
  expect(prompt.player).toBe(3);
});

test('the list is exactly what Phase published — no local filtering of the source', () => {
  // CR 707.9: copying does not target. Whatever the engine left out (the copy's own
  // object, an excluded permanent) is left out here too, and nothing else is added.
  const prompt = copyTargetPrompt(withWaiting(copy({ valid_targets: [100] })))!;
  expect(prompt.targets).toEqual([100]);
  expect(prompt.targets).not.toContain(prompt.sourceId);
});
