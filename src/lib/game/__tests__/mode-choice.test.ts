import { expect, test } from 'bun:test';
import {
  modeCanCancel,
  modeChoicePrompt,
  modeConfirmable,
  modeIsBudget,
  modeSelectAction,
  modeSingleChoice,
  modeSpent,
  modeToggle
} from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 700.2: a modal card's controller chooses modes. The engine owns the
 * window, the texts and the modes it rules out; Mesa only builds the answer.
 * These tests pin the two things a naive port gets wrong — a one-of-one modal
 * answering with the click, and a TRIGGERED modal ability that cannot be
 * cancelled (CR 603.3c) — plus the pawprint budget of CR 700.2i.
 */
const withWaiting = (waiting: unknown, viewer = 0) =>
  ({
    ok: true,
    viewer,
    seed: 42,
    revision: 7,
    actions_applied: 7,
    metrics: {},
    state: {
      turn_number: 3,
      active_player: viewer,
      priority_player: viewer,
      phase: 'PreCombatMain',
      players: [],
      battlefield: [],
      stack: [],
      exile: [],
      objects: { '320': { id: 320, name: 'Charm' }, '90': { id: 90, name: 'Wizard' } },
      waiting_for: waiting
    },
    derived: {},
    legal: { actions: [], spell_costs: {}, by_object: {} }
  }) as unknown as EngineSnapshot;

const modal = (overrides: Record<string, unknown> = {}) => ({
  min_choices: 2,
  max_choices: 2,
  mode_count: 3,
  mode_descriptions: ['Uno.', 'Dos.', 'Tres.'],
  allow_repeat_modes: false,
  ...overrides
});

const spell = (overrides: Record<string, unknown> = {}) => ({
  type: 'ModeChoice',
  data: {
    player: 0,
    modal: modal(overrides),
    pending_cast: { object_id: 320, cost: { type: 'Cost', generic: 1 } },
    unavailable_modes: [2]
  }
});

test('the prompt repeats the window, the texts and the refused modes', () => {
  expect(modeChoicePrompt(withWaiting(spell()))).toEqual({
    player: 0,
    kind: 'spell',
    objectId: 320,
    min: 2,
    max: 2,
    descriptions: ['Uno.', 'Dos.', 'Tres.'],
    unavailable: [2],
    allowRepeat: false,
    pawprints: [],
    activated: false
  });
});

test('a modal ability keeps its own identity and its activation state', () => {
  const prompt = modeChoicePrompt(withWaiting({
    type: 'AbilityModeChoice',
    data: { player: 1, modal: modal({ min_choices: 1, max_choices: 1 }), source_id: 90, mode_abilities: [], is_activated: true }
  }))!;
  expect(prompt.kind).toBe('ability');
  expect(prompt.objectId).toBe(90);
  expect(prompt.player).toBe(1);
  expect(prompt.activated).toBe(true);
  expect(modeCanCancel(prompt)).toBe(true);
});

test('CR 603.3c: a triggered modal ability cannot be cancelled from here', () => {
  const prompt = modeChoicePrompt(withWaiting({
    type: 'AbilityModeChoice',
    data: { player: 0, modal: modal(), source_id: 90, mode_abilities: [], is_activated: false }
  }))!;
  expect(modeCanCancel(prompt)).toBe(false);
  // A modal SPELL can always be cancelled at this step.
  expect(modeCanCancel(modeChoicePrompt(withWaiting(spell()))!)).toBe(true);
});

test('there is no mode prompt when the engine is asking something else', () => {
  expect(modeChoicePrompt(withWaiting({ type: 'Priority', data: { player: 0 } }))).toBeNull();
  expect(modeChoicePrompt(null)).toBeNull();
});

test('a one-of-one modal answers with the click, not with a confirmation', () => {
  const single = modeChoicePrompt(withWaiting(spell({ min_choices: 1, max_choices: 1 })))!;
  expect(modeSingleChoice(single)).toBe(true);
  expect(modeSelectAction([1])).toEqual({ type: 'SelectModes', data: { indices: [1] } });
  // Two modes never collapse into one click.
  expect(modeSingleChoice(modeChoicePrompt(withWaiting(spell()))!)).toBe(false);
});

test('toggling refuses a third mode, a refused mode and repeats', () => {
  const prompt = modeChoicePrompt(withWaiting(spell()))!;
  let selected = modeToggle(prompt, [], 0);
  expect(selected).toEqual([0]);
  selected = modeToggle(prompt, selected, 2);
  expect(selected).toEqual([0]); // mode 2 is unavailable
  selected = modeToggle(prompt, selected, 1);
  expect(selected).toEqual([0, 1]);
  expect(modeConfirmable(prompt, selected)).toBe(true);
  // A refused mode cannot join the selection even when there is room.
  expect(modeToggle(prompt, [0], 2)).toEqual([0]);
  // With the window full a new mode is refused, but un-ticking still works.
  expect(modeToggle(prompt, selected, 2)).toEqual([0, 1]);
  expect(modeToggle(prompt, selected, 0)).toEqual([1]);
  expect(modeToggle(prompt, [1], 0)).toEqual([0, 1]);
});

test('a modal that allows repeats counts them instead of toggling', () => {
  const repeat = modeChoicePrompt(withWaiting(spell({ min_choices: 1, max_choices: 2, allow_repeat_modes: true })))!;
  expect(modeToggle(repeat, [], 1)).toEqual([1]);
  expect(modeToggle(repeat, [1], 1)).toEqual([1, 1]);
  expect(modeToggle(repeat, [1, 1], 1)).toEqual([1, 1]); // at the cap
});

test('CR 700.2i: with pawprints the cap is a budget, not a count', () => {
  const budget = modeChoicePrompt(withWaiting({
    type: 'ModeChoice',
    data: {
      player: 0,
      modal: modal({ min_choices: 1, max_choices: 3, mode_pawprints: [2, 2, 1] }),
      pending_cast: { object_id: 320, cost: { type: 'Cost', generic: 1 } }
      // No `unavailable_modes`: a budget modal starts with all three offered.
    }
  }))!;
  expect(modeIsBudget(budget)).toBe(true);
  let selected = modeToggle(budget, [], 0); // weight 2 of a budget of 3
  expect(modeSpent(budget, selected)).toBe(2);
  // A second weight-2 mode would spend 4 of 3: refused, same array back.
  expect(modeToggle(budget, selected, 1)).toBe(selected);
  // The weight-1 mode still fits exactly.
  selected = modeToggle(budget, selected, 2);
  expect(selected).toEqual([0, 2]);
  expect(modeSpent(budget, selected)).toBe(3);
  expect(modeConfirmable(budget, selected)).toBe(true);
  // The budget is what gates it, not the number of modes chosen.
  expect(modeConfirmable(budget, [0, 1])).toBe(false);
  // Budget modals never collapse into a single click.
  expect(modeSingleChoice(budget)).toBe(false);
});

test('the answer sorts the indices the engine indexes them by', () => {
  expect(modeSelectAction([2, 0])).toEqual({ type: 'SelectModes', data: { indices: [0, 2] } });
  const indices = [1];
  const action = modeSelectAction(indices);
  indices.push(9);
  expect(action).toEqual({ type: 'SelectModes', data: { indices: [1] } });
});
