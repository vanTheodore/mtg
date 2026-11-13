import { expect, test } from 'bun:test';
import {
  chooseObjectsAction,
  proliferatePrompt,
  selectTargetsAction,
  timeTravelPrompt
} from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * Two prompts that share one answer (`SelectTargets`) and no window: any number of
 * the eligible objects, including none.
 *
 *   - CR 701.34a — proliferate: what already carries a counter, permanents **and**
 *     players (poison or energy);
 *   - CR 701.56a — time travel: the same list twice, remove first and add second,
 *     with the just-chosen objects excluded from the add half so each object gets
 *     at most one of the two.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 5,
    revision: 131,
    actions_applied: 131,
    metrics: {},
    state: {
      turn_number: 13,
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

test('proliferate publishes what already carries a counter, seats included', () => {
  const prompt = proliferatePrompt(
    withWaiting({
      type: 'ProliferateChoice',
      data: { player: 1, eligible: [{ Object: 205 }, { Object: 344 }, { Player: 0 }, { Player: 1 }] }
    })
  )!;
  expect(prompt.player).toBe(1);
  expect(prompt.eligible).toEqual([{ Object: 205 }, { Object: 344 }, { Player: 0 }, { Player: 1 }]);
});

test('proliferate drops junk and falls back to the viewer seat', () => {
  const prompt = proliferatePrompt(
    withWaiting({ type: 'ProliferateChoice', data: { eligible: [{ Object: 205 }, null, 'x', { Bogus: 1 }] } })
  )!;
  expect(prompt.eligible).toEqual([{ Object: 205 }]);
  expect(prompt.player).toBe(0);
});

test('time travel carries the half it is in', () => {
  const remove = timeTravelPrompt(
    withWaiting({
      type: 'TimeTravelChoice',
      data: { player: 0, eligible: [{ Object: 360 }, { Object: 361 }], phase: { type: 'Remove' } }
    })
  )!;
  expect(remove.phase).toBe('remove');
  expect(remove.eligible).toEqual([{ Object: 360 }, { Object: 361 }]);

  const add = timeTravelPrompt(
    withWaiting({
      type: 'TimeTravelChoice',
      data: { player: 0, eligible: [{ Object: 361 }], phase: { type: 'Add' } }
    })
  )!;
  expect(add.phase).toBe('add');
  // The remove-half pick is gone from the add list: at most one of add/remove.
  expect(add.eligible).toEqual([{ Object: 361 }]);
});

test('a missing or unknown phase is the remove half, which is the one offered first', () => {
  expect(
    timeTravelPrompt(withWaiting({ type: 'TimeTravelChoice', data: { eligible: [{ Object: 360 }] } }))!.phase
  ).toBe('remove');
  expect(
    timeTravelPrompt(
      withWaiting({ type: 'TimeTravelChoice', data: { eligible: [{ Object: 360 }], phase: { type: 'Later' } } })
    )!.phase
  ).toBe('remove');
});

test('both prompts answer with the same SelectTargets, in the chosen order', () => {
  expect(selectTargetsAction([{ Object: 360 }, { Player: 1 }])).toEqual({
    type: 'SelectTargets',
    data: { targets: [{ Object: 360 }, { Player: 1 }] }
  });
  // Choosing nothing is still a submission for both: no counters change in either.
  expect(selectTargetsAction([]).data).toEqual({ targets: [] });
  // The object-selection prompt introduced this answer; it is the same function.
  expect(chooseObjectsAction([{ Object: 100 }])).toEqual(selectTargetsAction([{ Object: 100 }]));
});

test('another prompt is not either block', () => {
  expect(proliferatePrompt(withWaiting({ type: 'TimeTravelChoice', data: {} }))).toBeNull();
  expect(timeTravelPrompt(withWaiting({ type: 'ProliferateChoice', data: {} }))).toBeNull();
  expect(proliferatePrompt(null)).toBeNull();
  expect(timeTravelPrompt(null)).toBeNull();
});
