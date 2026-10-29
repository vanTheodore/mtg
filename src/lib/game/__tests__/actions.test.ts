import { expect, test } from 'bun:test';
import { actionsForObject, decisionGuide, describeAction } from '../actions';

test('describes land play with object name', () => {
  const objects = { '7': { id: 7, name: 'Forest', zone: 'Hand' } as never };
  expect(describeAction({ type: 'PlayLand', data: { object_id: 7, card_id: 1 } }, objects)).toBe('Jugar tierra: Forest');
});

test('describes attacker count', () => {
  expect(describeAction({ type: 'DeclareAttackers', data: { attacks: [[1, 0], [2, 0]] } })).toBe('Atacar con 2 criaturas');
});

test('actionsForObject returns empty array for unknown id', () => {
  expect(actionsForObject({}, 99)).toEqual([]);
});

test('describes mulligan decisions in Spanish', () => {
  expect(describeAction({ type: 'MulliganDecision', data: { choice: { type: 'Keep' } } })).toBe('Conservar mano');
  expect(describeAction({ type: 'MulliganDecision', data: { choice: { type: 'Mulligan' } } })).toBe('Hacer mulligan');
});

test('describes mana sources and casting payment mode', () => {
  const objects = { '7': { id: 7, name: 'Forest', zone: 'Battlefield' } as never, '8': { id: 8, name: 'Grizzly Bears', zone: 'Hand' } as never };
  expect(describeAction({ type: 'TapLandForMana', data: { selection: { source: { object_id: 7 } } } }, objects)).toBe('Girar Forest para producir maná');
  expect(describeAction({ type: 'CastSpell', data: { object_id: 8, card_id: 2, targets: [] } }, objects)).toContain('Lanzar Grizzly Bears');
  expect(describeAction({ type: 'CastSpell', data: { object_id: 8, card_id: 2, targets: [], payment_mode: { type: 'Manual' } } }, objects)).toContain('pago manual');
});

test('decision guide explains prompts instead of raw action names', () => {
  expect(decisionGuide('SelectTargets', 'PreCombatMain', 0)).toContain('objetivos');
  expect(decisionGuide('Priority', 'DeclareAttackers', 0)).toContain('atacan');
  expect(decisionGuide('Priority', 'DeclareBlockers', 1)).toContain('bloqueadoras');
  expect(decisionGuide('GameOver', 'End', 0)).toContain('terminó');
});
