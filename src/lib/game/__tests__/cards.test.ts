import { describe, expect, test } from 'bun:test';
import { cardImageLookup, groupTokens, isHidden, typeLine } from '../cards';
import type { GameObject } from '../../engine/types';

const base: GameObject = {
  id: 1, card_id: 1, owner: 0, controller: 0, zone: 'Hand', name: 'Delver of Secrets',
  display_visible_to_viewer: true
};

describe('cardImageLookup', () => {
  test('prefers printed_ref oracle id and face name', () => {
    const lookup = cardImageLookup({ ...base, printed_ref: { oracle_id: 'abc', face_name: 'Insectile Aberration' }, transformed: true });
    expect(lookup.oracleId).toBe('abc');
    expect(lookup.faceName).toBe('Insectile Aberration');
    expect(lookup.faceIndex).toBe(1);
  });
  test('falls back to back face name when transformed without printed_ref', () => {
    const lookup = cardImageLookup({ ...base, transformed: true, back_face: { name: 'Insectile Aberration' } });
    expect(lookup.name).toBe('Insectile Aberration');
    expect(lookup.faceIndex).toBe(1);
  });
  test('hidden is distinct from missing image', () => {
    expect(isHidden({ ...base, display_visible_to_viewer: false })).toBe(true);
    expect(isHidden({ ...base, face_down: true })).toBe(true);
    expect(isHidden(base)).toBe(false);
  });
});

describe('groupTokens', () => {
  test('groups by controller and name', () => {
    const objs = [
      { ...base, id: 1, name: 'Soldier', display_source: 'Token' },
      { ...base, id: 2, name: 'Soldier', display_source: 'Token' },
      { ...base, id: 3, name: 'Soldier', controller: 1, display_source: 'Token' }
    ];
    const groups = groupTokens(objs);
    expect(groups).toHaveLength(2);
    expect(groups[0].items).toHaveLength(2);
  });
});

test('typeLine joins supertypes, core types and subtypes', () => {
  expect(typeLine({ ...base, card_types: { supertypes: ['Legendary'], core_types: ['Creature'], subtypes: ['Human', 'Wizard'] } }))
    .toBe('Legendary Creature — Human Wizard');
});
