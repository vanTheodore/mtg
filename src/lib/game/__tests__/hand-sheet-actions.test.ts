import { describe, expect, test } from 'bun:test';

/**
 * UX-HAND 1.1 — the sheet's action projection.
 *
 * These assertions are written against the intended behaviour, not the current
 * one. They are the RED for the refactor: today `HandSheet.svelte` decides
 * "quick action" by three independent `find`s (PlayLand, a single CastSpell, a
 * single ActivateAbility) and filters its "other actions" list with
 * `!isManaAction(a)`, where `isManaAction` counts *every* `ActivateAbility` as
 * mana while `manaActions` drops generic activations outside a mana window.
 *
 * The fixture below is explicit legality: it is not a rules engine, it is the
 * exact `legal.by_object` shape Phase publishes, which is the only thing the
 * sheet is allowed to read.
 */
import { sheetActions } from '../handSheetActions.ts';
import type { EngineSnapshot, GameAction } from '#lib/engine/types.ts';

const cast = (id: number, face?: string): GameAction => ({
  type: 'CastSpell',
  data: { object_id: id, card_id: id, targets: [], ...(face ? { face } : {}) }
} as unknown as GameAction);
const activate = (id: number, ability: number, label: string): GameAction => ({
  type: 'ActivateAbility',
  data: { object_id: id, ability_index: ability, label }
} as unknown as GameAction);
const playLand = (id: number): GameAction => ({ type: 'PlayLand', data: { object_id: id, card_id: id } } as unknown as GameAction);
const tapForMana = (id: number): GameAction => ({ type: 'TapLandForMana', data: { object_id: id } } as unknown as GameAction);

function snapshot(byObject: Record<string, GameAction[]>, waitingFor: unknown = { type: 'Priority' }): EngineSnapshot {
  return {
    ok: true,
    revision: 3,
    viewer: 0,
    legal: { by_object: byObject, actions: [], spell_costs: {} },
    state: { objects: {}, waiting_for: waitingFor }
  } as unknown as EngineSnapshot;
}

describe('A — acciones ambiguas', () => {
  test('un lanzamiento y una activación simultáneos NO producen acción rápida', () => {
    const s = snapshot({ '42': [cast(42), activate(42, 0, 'Sobrecarga')] });
    const result = sheetActions(s, 42);
    // Two semantically different choices: guessing one would be a coin flip.
    expect(result.quick).toBeUndefined();
    expect(result.choices.map((c) => c.action.type).sort()).toEqual(['ActivateAbility', 'CastSpell']);
    expect(result.choices).toHaveLength(2);
  });

  test('dos activaciones distintas tampoco producen acción rápida', () => {
    const s = snapshot({ '7': [activate(7, 0, 'Equipar'), activate(7, 1, 'Otra')] });
    const result = sheetActions(s, 7);
    expect(result.quick).toBeUndefined();
    expect(result.choices).toHaveLength(2);
  });

  test('una sola acción sí es rápida, y su etiqueta dice lo que hace', () => {
    expect(sheetActions(snapshot({ '5': [cast(5)] }), 5).quick).toMatchObject({ label: 'Lanzar' });
    expect(sheetActions(snapshot({ '5': [playLand(5)] }), 5).quick).toMatchObject({ label: 'Jugar tierra' });
    expect(sheetActions(snapshot({ '5': [activate(5, 0, 'Ciclar')] }), 5).quick).toMatchObject({ label: 'Activar' });
    expect(sheetActions(snapshot({ '5': [tapForMana(5)] }), 5).quick).toMatchObject({ label: 'Producir maná' });
  });

  test('sin acciones no hay acción rápida ni opciones', () => {
    const result = sheetActions(snapshot({}), 99);
    expect(result.quick).toBeUndefined();
    expect(result.choices).toEqual([]);
  });
});

describe('B — habilidades invisibles', () => {
  test('una habilidad activada fuera de ventana de maná sigue siendo una acción', () => {
    // Today this disappears: `isManaAction` says ActivateAbility is mana, and
    // `manaActions` refuses it outside a mana prompt, so the "other actions"
    // filter drops it and the mana list never includes it.
    const s = snapshot({ '11': [activate(11, 0, 'Ciclar')] }, { type: 'Priority' });
    const result = sheetActions(s, 11);
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0]!.kind).toBe('activate');
    expect(result.quick).toBeDefined();
  });

  test('en una ventana de maná, la misma activación es maná y no se duplica', () => {
    const s = snapshot({ '11': [activate(11, 0, 'Producir {G}'), activate(11, 0, 'Producir {G}')] }, { type: 'ManaPayment' });
    const result = sheetActions(s, 11);
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0]!.kind).toBe('mana');
    expect(result.choices[0]!.label).toBe('Producir maná');
  });

  test('ninguna acción publicada por Phase desaparece y ninguna aparece dos veces', () => {
    const actions = [
      cast(20), cast(20, 'Adventure'), activate(20, 0, 'Ciclar'), playLand(20), tapForMana(20)
    ];
    const result = sheetActions(snapshot({ '20': actions }), 20);
    expect(result.choices).toHaveLength(actions.length);
    const keys = result.choices.map((c) => JSON.stringify(c.action));
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('las alternativas del mismo lanzamiento se identifican', () => {
    const s = snapshot({ '30': [cast(30), cast(30, 'Adventure')] });
    const result = sheetActions(s, 30);
    expect(result.quick).toBeUndefined();
    expect(result.choices.filter((c) => c.alternative)).toHaveLength(1);
    expect(result.choices.filter((c) => !c.alternative)).toHaveLength(1);
  });

  test('el maná manual no se ofrece como acción suelta si ya hay lanzamientos', () => {
    const s = snapshot({ '40': [cast(40), cast(40, 'Adventure')] });
    const result = sheetActions(s, 40);
    const casts = result.choices.filter((c) => c.kind === 'cast');
    expect(casts).toHaveLength(2);
    // The manual-payment control belongs to each cast, never to the list.
    expect(result.manualPayment).toBe(true);
  });
});
