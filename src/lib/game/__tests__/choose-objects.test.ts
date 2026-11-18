import { expect, test } from 'bun:test';
import { chooseObjectsAction, chooseObjectsPrompt } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 608.2c + CR 115.10a: a set of battlefield permanents chosen while the effect
 * is applied (`ChooseObjectsIntoTrackedSet`), and the described damage recipient
 * that shares the same prompt. Neither is a target — which is why a seat may be
 * eligible here and nowhere else.
 *
 * The engine publishes a window: at least `min`, at most `max`, and an absent
 * `max` means "any number", clamped to what is eligible. Picks are distinct and
 * the answer is one `SelectTargets`.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 121,
    actions_applied: 121,
    metrics: {},
    state: {
      turn_number: 12,
      active_player: viewer,
      priority_player: viewer,
      phase: 'Upkeep',
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

test('the prompt publishes the eligible set, the window and the trigger', () => {
  const prompt = chooseObjectsPrompt(
    withWaiting({
      type: 'ChooseObjectsSelection',
      data: {
        player: 1,
        eligible: [{ Object: 100 }, { Object: 101 }, { Object: 105 }],
        min: 1,
        max: 2,
        trigger_event: { type: 'StepBegins', data: { player_id: 0 } }
      }
    })
  )!;
  expect(prompt.player).toBe(1);
  expect(prompt.eligible).toEqual([{ Object: 100 }, { Object: 101 }, { Object: 105 }]);
  expect(prompt.min).toBe(1);
  expect(prompt.max).toBe(2);
  expect(prompt.openMax).toBe(false);
  expect(prompt.recipient).toBe(false);
  expect(prompt.triggered).toBe(true);
});

test('an absent maximum is «any number», and it clamps to what is eligible', () => {
  const prompt = chooseObjectsPrompt(
    withWaiting({
      type: 'ChooseObjectsSelection',
      data: { player: 0, eligible: [{ Object: 100 }, { Object: 101 }], min: 0 }
    })
  )!;
  // \"Any number\" can never need more objects than the set it picks from.
  expect(prompt.openMax).toBe(true);
  expect(prompt.max).toBe(2);
  expect(prompt.min).toBe(0);
  // A maximum above the eligible set is the eligible set, exactly as the engine's
  // own projection clamps it.
  const clamped = chooseObjectsPrompt(
    withWaiting({ type: 'ChooseObjectsSelection', data: { eligible: [{ Object: 100 }], max: 5 } })
  )!;
  expect(clamped.max).toBe(1);
  expect(clamped.openMax).toBe(false);
});

test('a seat in the eligible set means a described damage recipient', () => {
  const prompt = chooseObjectsPrompt(
    withWaiting({
      type: 'ChooseObjectsSelection',
      data: { player: 0, eligible: [{ Object: 200 }, { Player: 1 }], min: 1, max: 1 }
    })
  )!;
  expect(prompt.recipient).toBe(true);
  expect(prompt.eligible).toEqual([{ Object: 200 }, { Player: 1 }]);
});

test('the defaults are the engine defaults: no minimum, no trigger', () => {
  const prompt = chooseObjectsPrompt(
    withWaiting({ type: 'ChooseObjectsSelection', data: { eligible: [{ Object: 100 }] } })
  )!;
  expect(prompt.min).toBe(0);
  expect(prompt.triggered).toBe(false);
  // No `player` in the payload: the seat that owns the prompt is the viewer's.
  expect(prompt.player).toBe(0);
});

test('junk in the eligible set is dropped, not guessed at', () => {
  const prompt = chooseObjectsPrompt(
    withWaiting({
      type: 'ChooseObjectsSelection',
      data: { eligible: [{ Object: 100 }, null, 'x', { Bogus: 2 }, { Player: 0 }], min: 1 }
    })
  )!;
  expect(prompt.eligible).toEqual([{ Object: 100 }, { Player: 0 }]);
});

test('the answer is one SelectTargets with the chosen refs, in order', () => {
  expect(chooseObjectsAction([{ Object: 105 }, { Player: 0 }])).toEqual({
    type: 'SelectTargets',
    data: { targets: [{ Object: 105 }, { Player: 0 }] }
  });
  // An empty selection is still a submission: an empty fresh set (CR 608.2c),
  // legal exactly when `min` is zero.
  expect(chooseObjectsAction([]).data).toEqual({ targets: [] });
});

test('another prompt is not this block', () => {
  expect(chooseObjectsPrompt(withWaiting({ type: 'RetargetChoice', data: {} }))).toBeNull();
  expect(chooseObjectsPrompt(withWaiting({ type: 'MultiTargetSelection', data: {} }))).toBeNull();
  expect(chooseObjectsPrompt(null)).toBeNull();
});
