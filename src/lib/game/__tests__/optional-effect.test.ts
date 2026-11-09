import { expect, test } from 'bun:test';
import { decideOptionalEffect, optionalEffectPrompt, rememberOptionalEffect } from '../interaction';
import type { EngineSnapshot } from '../../engine/types';

/**
 * CR 608.2d: "you may" asks the controller a yes/no question. CR 603.5 is the
 * part a naive port invents: the engine decides whether the answer can be
 * remembered at all (a `may_trigger_key` exists) and whether the wider
 * same-card scope is offered. Mesa reads those two capabilities, never a card's
 * text.
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
      objects: {},
      waiting_for: waiting
    },
    derived: {},
    legal: { actions: [], spell_costs: {}, by_object: {} }
  }) as unknown as EngineSnapshot;

const key = { player: 0, source_id: 100, origin: { type: 'Printed', trigger_index: 0 } };
const optional = (data: Record<string, unknown> = {}) => ({
  type: 'OptionalEffectChoice',
  data: { player: 0, source_id: 100, description: 'Puedes robar una carta.', ...data }
});

test('the prompt repeats the wording and the two engine capabilities', () => {
  expect(optionalEffectPrompt(withWaiting(optional({ may_trigger_key: key, same_card_may_trigger_choice_available: true }))))
    .toEqual({
      player: 0,
      sourceId: 100,
      subjectId: undefined,
      description: 'Puedes robar una carta.',
      rememberable: true,
      sameCardAvailable: true
    });
});

test('without a key there is nothing to remember', () => {
  const prompt = optionalEffectPrompt(withWaiting(optional()))!;
  expect(prompt.rememberable).toBe(false);
  // The wider scope cannot appear without the key it belongs to.
  expect(prompt.sameCardAvailable).toBe(false);
  // …not even when the flag is set on its own.
  const orphan = optionalEffectPrompt(withWaiting(optional({ same_card_may_trigger_choice_available: true })))!;
  expect(orphan.sameCardAvailable).toBe(false);
});

test('the same-card scope needs the engine to offer it', () => {
  const prompt = optionalEffectPrompt(withWaiting(optional({ may_trigger_key: key })))!;
  expect(prompt.rememberable).toBe(true);
  expect(prompt.sameCardAvailable).toBe(false);
});

test('the subject and the description travel when the engine publishes them', () => {
  const prompt = optionalEffectPrompt(withWaiting(optional({ decision_subject_id: 55, description: 'Puedes sacrificar una criatura.' })))!;
  expect(prompt.subjectId).toBe(55);
  expect(prompt.description).toBe('Puedes sacrificar una criatura.');
  // An empty description is no description: the panel falls back to its own line.
  expect(optionalEffectPrompt(withWaiting(optional({ description: '' })))!.description).toBeUndefined();
});

test('there is no optional prompt for another decision', () => {
  expect(optionalEffectPrompt(withWaiting({ type: 'OpponentMayChoice', data: { player: 0 } }))).toBeNull();
  expect(optionalEffectPrompt(null)).toBeNull();
});

test('one answer, two actions: plain and remembered', () => {
  expect(decideOptionalEffect(true)).toEqual({ type: 'DecideOptionalEffect', data: { accept: true } });
  expect(decideOptionalEffect(false)).toEqual({ type: 'DecideOptionalEffect', data: { accept: false } });
  expect(rememberOptionalEffect(true, false)).toEqual({
    type: 'DecideOptionalEffectAndRemember',
    data: { choice: { type: 'Accept' }, scope: { type: 'ExactInstance' } }
  });
  expect(rememberOptionalEffect(false, true)).toEqual({
    type: 'DecideOptionalEffectAndRemember',
    data: { choice: { type: 'Decline' }, scope: { type: 'SameCard' } }
  });
});
