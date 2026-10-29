import { expect, test } from 'bun:test';
import { actionsForObject, describeAction } from '../actions';

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
  expect(describeAction({ type: 'MulliganDecision', data: { choice: 'Keep' } })).toBe('Conservar mano');
  expect(describeAction({ type: 'MulliganDecision', data: { choice: 'Mulligan' } })).toBe('Hacer mulligan');
});
