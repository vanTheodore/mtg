import { expect, test } from 'bun:test';
import { retargetAction, retargetPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 115.7: changing the targets of a spell that is already on the stack. The
 * engine validates one position at a time — "each target can be changed only to
 * another legal target" — so it publishes a pool **per position** (`slot_pools`,
 * aligned with `slots`) and only uses `legal_new_targets` as the fallback for a
 * payload without that refinement. An inner empty pool is not a fallback: that
 * position simply admits nothing.
 *
 * The answer is an `Option` per position in the prompt's own index space: `null`
 * keeps, a `TargetRef` changes. `single` ("change the target") takes exactly one
 * and cannot keep; `forced` never reaches an interactive prompt.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 111,
    actions_applied: 111,
    metrics: {},
    state: {
      turn_number: 11,
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

const allScope = (data: Record<string, unknown>) =>
  withWaiting({ type: 'RetargetChoice', data: { player: 0, stack_entry_index: 0, scope: { type: 'All' }, ...data } });

test('every position carries the pool that position admits', () => {
  const prompt = retargetPrompt(
    allScope({
      current_targets: [{ Object: 200 }, { Player: 1 }],
      slots: [{ path: [], slot: 0 }, { path: [], slot: 1 }],
      slot_pools: [[{ Object: 100 }, { Object: 105 }], [{ Player: 0 }]],
      keep_is_distinct: [false, false],
      legal_new_targets: [{ Object: 100 }, { Object: 105 }, { Player: 0 }]
    })
  )!;
  expect(prompt.scope).toBe('all');
  expect(prompt.stackEntryIndex).toBe(0);
  expect(prompt.current).toEqual([{ Object: 200 }, { Player: 1 }]);
  expect(prompt.pools).toEqual([[{ Object: 100 }, { Object: 105 }], [{ Player: 0 }]]);
  expect(prompt.keepDistinct).toEqual([false, false]);
});

test('an absent per-position refinement falls back to the flat union, as the engine does', () => {
  const prompt = retargetPrompt(
    allScope({ current_targets: [{ Object: 200 }, { Object: 201 }], legal_new_targets: [{ Object: 100 }] })
  )!;
  // Outer-empty `slot_pools`: both positions admit the union.
  expect(prompt.pools).toEqual([[{ Object: 100 }], [{ Object: 100 }]]);
});

test('an inner empty pool admits nothing — it is not a fallback', () => {
  const prompt = retargetPrompt(
    allScope({
      current_targets: [{ Object: 200 }, { Object: 201 }],
      slot_pools: [[], [{ Object: 100 }]],
      legal_new_targets: [{ Object: 100 }]
    })
  )!;
  expect(prompt.pools[0]).toEqual([]);
  expect(prompt.pools[1]).toEqual([{ Object: 100 }]);
});

test('`single` is one position, and the declared target is no alternative of its own', () => {
  const prompt = retargetPrompt(
    withWaiting({
      type: 'RetargetChoice',
      data: {
        player: 0,
        stack_entry_index: 1,
        scope: { type: 'Single' },
        current_targets: [{ Object: 200 }],
        slots: [{ path: [], slot: 0 }],
        slot_pools: [[{ Object: 200 }, { Object: 100 }]],
        keep_is_distinct: [false],
        legal_new_targets: [{ Object: 200 }, { Object: 100 }]
      }
    })
  )!;
  expect(prompt.scope).toBe('single');
  expect(prompt.stackEntryIndex).toBe(1);
  expect(prompt.pools[0]).toEqual([{ Object: 200 }, { Object: 100 }]);
  expect(prompt.keepDistinct).toEqual([false]);
});

test('`keep_is_distinct` says where the announced object is gone and naming it elects another', () => {
  const prompt = retargetPrompt(
    allScope({
      current_targets: [{ Object: 200 }, { Object: 201 }],
      keep_is_distinct: [true, false],
      legal_new_targets: [{ Object: 200 }]
    })
  )!;
  expect(prompt.keepDistinct).toEqual([true, false]);
});

test('`forced` is applied by the engine: it never renders an interactive prompt', () => {
  expect(
    retargetPrompt(
      withWaiting({
        type: 'RetargetChoice',
        data: { player: 0, scope: { type: 'ForcedTo', data: { Object: 100 } }, current_targets: [{ Object: 200 }] }
      })
    )
  ).toBeNull();
});

test('a payload with junk targets keeps only the ones the wire can name', () => {
  const prompt = retargetPrompt(
    allScope({
      current_targets: [{ Object: 200 }, null, { Bogus: 1 }, 'x'],
      slot_pools: [[{ Object: 100 }], null, 'x'],
      legal_new_targets: [{ Player: 0 }, { Nope: 2 }]
    })
  )!;
  expect(prompt.current).toEqual([{ Object: 200 }]);
  expect(prompt.pools).toEqual([[{ Object: 100 }]]);
  expect(prompt.union).toEqual([{ Player: 0 }]);
});

test('the answer preserves the target count and only moves what was chosen', () => {
  expect(retargetAction([null, { Object: 105 }])).toEqual({
    type: 'RetargetSpell',
    data: { new_targets: [null, { Object: 105 }] }
  });
  // `single`: exactly one pick, no keep.
  expect(retargetAction([{ Object: 100 }]).data).toEqual({ new_targets: [{ Object: 100 }] });
  // Keeping every position is a legal submission: each null is a keep.
  expect(retargetAction([null, null]).data).toEqual({ new_targets: [null, null] });
});

test('another prompt is not this block', () => {
  expect(retargetPrompt(withWaiting({ type: 'MoveCountersDistribution', data: {} }))).toBeNull();
  expect(retargetPrompt(withWaiting({ type: 'TargetSelection', data: {} }))).toBeNull();
  expect(retargetPrompt(null)).toBeNull();
});
