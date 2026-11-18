import { expect, test } from 'bun:test';
import { multiTargetAction, multiTargetPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 601.2c: a spell or ability with more than one instance of "target" asks for a
 * **set**, inside the window the engine publishes (`min_targets..=max_targets`).
 * "Any number of targets" starts at zero; "two target creatures" fixes the count.
 * CR 115.3 keeps the same target from being named twice.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 81,
    actions_applied: 81,
    metrics: {},
    state: {
      turn_number: 8,
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

test('the prompt publishes the window and the legal targets in engine order', () => {
  const prompt = multiTargetPrompt(
    withWaiting({
      type: 'MultiTargetSelection',
      data: {
        player: 0,
        legal_targets: [100, 101, 105],
        min_targets: 0,
        max_targets: 2,
        pending_ability: { ability: {}, source_id: 350 }
      }
    })
  )!;
  expect(prompt.player).toBe(0);
  expect(prompt.min).toBe(0);
  expect(prompt.max).toBe(2);
  expect(prompt.targets).toEqual([100, 101, 105]);
  // The source is attribution: it is what lets the block name the spell asking.
  expect(prompt.sourceId).toBe(350);
});

test('a fixed count and a minimum both survive the read', () => {
  const fixed = multiTargetPrompt(
    withWaiting({ type: 'MultiTargetSelection', data: { legal_targets: [352, 353], min_targets: 2, max_targets: 2 } })
  )!;
  expect(fixed.min).toBe(2);
  expect(fixed.max).toBe(2);
  // No attribution in the payload means no name to show, not an invented one.
  expect(fixed.sourceId).toBeNull();
});

test('a missing window is read from the payload without inventing a gate', () => {
  const bare = multiTargetPrompt(
    withWaiting({ type: 'MultiTargetSelection', data: { legal_targets: [100, 101], min_targets: 1 } })
  )!;
  expect(bare.min).toBe(1);
  // No maximum sent: the whole legal set is the ceiling, never less than it.
  expect(bare.max).toBe(2);
  const none = multiTargetPrompt(withWaiting({ type: 'MultiTargetSelection', data: {} }))!;
  expect(none.targets).toEqual([]);
  expect(none.min).toBe(0);
  expect(none.max).toBe(0);
});

test('junk in the legal list is dropped', () => {
  expect(
    multiTargetPrompt(
      withWaiting({ type: 'MultiTargetSelection', data: { legal_targets: [100, null, 'x', 105], min_targets: 0, max_targets: 3 } })
    )!.targets
  ).toEqual([100, 105]);
});

test('the answer is the chosen set, empty included when the window allows it', () => {
  expect(multiTargetAction([101, 100])).toEqual({ type: 'SelectCards', data: { cards: [101, 100] } });
  // "Up to two" makes zero a legal answer: declining is a real submission.
  expect(multiTargetAction([])).toEqual({ type: 'SelectCards', data: { cards: [] } });
});

test('another prompt is not this block', () => {
  expect(multiTargetPrompt(withWaiting({ type: 'TargetSelection', data: { legal_targets: [100] } }))).toBeNull();
  expect(multiTargetPrompt(withWaiting({ type: 'StationTarget', data: { spacecraft_id: 343 } }))).toBeNull();
  expect(multiTargetPrompt(null)).toBeNull();
});
