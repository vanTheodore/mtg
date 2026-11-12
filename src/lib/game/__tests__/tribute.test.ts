import { expect, test } from 'bun:test';
import { decideTribute, tributePrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 702.104a: a Tribute creature enters and an opponent decides whether to put
 * the counters on it. The engine names the deciding seat, the creature and how
 * many counters the tribute is worth; declining is what turns on the card's
 * "if tribute wasn't paid" ability (CR 702.104b).
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 51,
    actions_applied: 51,
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

const tribute = (data: Record<string, unknown> = {}) =>
  withWaiting({ type: 'TributeChoice', data: { player: 1, source_id: 330, count: 1, ...data } });

test('the prompt names the seat that decides, not the controller', () => {
  const prompt = tributePrompt(tribute())!;
  expect(prompt.player).toBe(1);
  expect(prompt.sourceId).toBe(330);
  expect(prompt.count).toBe(1);
});

test('the counter count is the engine’s, and a missing one is not invented', () => {
  expect(tributePrompt(tribute({ count: 2 }))!.count).toBe(2);
  expect(tributePrompt(tribute({ count: undefined }))!.count).toBe(0);
  expect(tributePrompt(tribute({ count: 0 }))!.count).toBe(0);
});

test('paying the tribute answers the optional-effect action with accept', () => {
  expect(decideTribute(true)).toEqual({ type: 'DecideOptionalEffect', data: { accept: true } });
  expect(decideTribute(false)).toEqual({ type: 'DecideOptionalEffect', data: { accept: false } });
});

test('there is no tribute prompt for another decision', () => {
  expect(tributePrompt(withWaiting({ type: 'OptionalEffectChoice', data: {} }))).toBeNull();
  expect(tributePrompt(null)).toBeNull();
});
