import { describe, expect, test } from 'bun:test';
import { selectFromListAction, selectFromListPrompt, selectFromListReady } from '../interaction.ts';
import type { EngineSnapshot, GameAction } from '../../engine/types.ts';

function snapshot(type: string, data: Record<string, unknown>, viewer = 0): EngineSnapshot {
  return {
    viewer,
    state: { waiting_for: { type, data }, objects: {} },
    legal: { actions: [] as GameAction[] }
  } as unknown as EngineSnapshot;
}

describe('CR 701.21a / CR 608.2d — EffectZoneChoice publica el conjunto y su ventana', () => {
  test('una selección exacta no admite ni cero ni dos', () => {
    const prompt = selectFromListPrompt(snapshot('EffectZoneChoice', { player: 0, cards: [100, 105], count: 1, zone: 'Battlefield', effect_kind: 'Sacrifice' }))!;
    expect(prompt.kind).toBe('effect-zone');
    expect(prompt.min).toBe(1);
    expect(prompt.max).toBe(1);
    expect(prompt.window).toBe(false);
    expect(selectFromListReady(prompt, [100])).toBe(true);
    expect(selectFromListReady(prompt, [])).toBe(false);
    expect(selectFromListReady(prompt, [100, 105])).toBe(false);
  });

  test('«hasta N» abre la ventana desde el mínimo publicado, no desde cero por defecto', () => {
    const upTo = selectFromListPrompt(snapshot('EffectZoneChoice', { cards: [100, 105], count: 2, min_count: 0, up_to: true }))!;
    expect(upTo).toMatchObject({ min: 0, max: 2, window: true });
    expect(selectFromListReady(upTo, [])).toBe(true);
    expect(selectFromListReady(upTo, [100, 105])).toBe(true);

    // A contribution floor (Krang's Stratagem) raises the minimum, and the
    // empty answer stops being legal — the engine said so, not the panel.
    const floor = selectFromListPrompt(snapshot('EffectZoneChoice', { cards: [100, 105], count: 2, min_count: 1, up_to: true }))!;
    expect(floor.min).toBe(1);
    expect(selectFromListReady(floor, [])).toBe(false);
  });

  test('ninguna carta fuera del conjunto publicado entra en la respuesta', () => {
    const prompt = selectFromListPrompt(snapshot('EffectZoneChoice', { cards: [100], count: 1 }))!;
    expect(selectFromListReady(prompt, [105])).toBe(false);
    expect(selectFromListAction(prompt, [105])).toBeNull();
    // A duplicate is not a legal selection either: the engine dedupes by set.
    expect(selectFromListAction(prompt, [100])).toEqual({ type: 'SelectCards', data: { cards: [100] } });
  });

  test('el orden público de propietario tiene su propio bloque y aquí no aparece', () => {
    expect(selectFromListPrompt(snapshot('EffectZoneChoice', { cards: [100, 105], count: 2, mass_library_order: { owner: 0, members: [] } }))).toBeNull();
  });
});

describe('evento de héroe: la ventana la fija el motor, no la cuenta de candidatos', () => {
  test('dos exactas por defecto', () => {
    const prompt = selectFromListPrompt(snapshot('HeroEventChoice', { player: 1, cards: [100, 105], count: 2, event: { type: 'ChromeOverload' }, event_id: 471 }))!;
    expect(prompt.player).toBe(1);
    expect(prompt.event).toBe('ChromeOverload');
    expect(prompt).toMatchObject({ min: 2, max: 2, window: false });
  });

  test('con `up_to` el mínimo es el del cable y puede ser mayor que cero', () => {
    const prompt = selectFromListPrompt(snapshot('HeroEventChoice', { cards: [100, 105], count: 2, up_to: true, min: 1, event: { type: 'KrangStratagem', data: { remaining: 2 } } }))!;
    expect(prompt).toMatchObject({ min: 1, max: 2, window: true });
    expect(selectFromListReady(prompt, [])).toBe(false);
    expect(selectFromListReady(prompt, [100])).toBe(true);
  });
});

describe('lo robado este turno: la vida la cuenta el motor', () => {
  test('la ventana es min_count..count y la vida por carta se pinta, no se resta', () => {
    const prompt = selectFromListPrompt(snapshot('DrawnThisTurnTopdeckChoice', { cards: [1000, 1001, 1002], count: 3, min_count: 1, life_payment: 2, source_id: 472 }))!;
    expect(prompt.kind).toBe('drawn-topdeck');
    expect(prompt).toMatchObject({ min: 1, max: 3, window: true, lifePayment: 2 });
    expect(selectFromListReady(prompt, [])).toBe(false);
    expect(selectFromListReady(prompt, [1000, 1001, 1002])).toBe(true);
  });

  test('sin vida que pagar el mínimo es el máximo, y no hay ventana', () => {
    const prompt = selectFromListPrompt(snapshot('DrawnThisTurnTopdeckChoice', { cards: [1000, 1001, 1002], count: 3, min_count: 3, life_payment: 0 }))!;
    expect(prompt).toMatchObject({ min: 3, max: 3, window: false });
    expect(selectFromListReady(prompt, [1000])).toBe(false);
  });
});

describe('reparto de búsqueda: exactamente primary_count, y ninguna otra', () => {
  test('el tamaño es el publicado y las zonas se nombran tal cual', () => {
    const prompt = selectFromListPrompt(snapshot('SearchPartitionChoice', { cards: [105, 475], primary_destination: 'Battlefield', primary_count: 1, rest_destination: 'Hand', source_id: 473 }))!;
    expect(prompt.kind).toBe('search-partition');
    expect(prompt).toMatchObject({ min: 1, max: 1, window: false });
    expect(prompt.primaryDestination).toBe('el campo de batalla');
    expect(prompt.restDestination).toBe('la mano');
    expect(selectFromListReady(prompt, [105])).toBe(true);
    expect(selectFromListReady(prompt, [105, 475])).toBe(false);
  });

  test('un reparto sin reparto obliga a nombrar la única carta encontrada', () => {
    const prompt = selectFromListPrompt(snapshot('SearchPartitionChoice', { cards: [105], primary_count: 1, primary_destination: 'Battlefield', rest_destination: 'Hand' }))!;
    expect(prompt).toMatchObject({ min: 1, max: 1 });
    expect(selectFromListReady(prompt, [])).toBe(false);
  });

  test('una zona desconocida se dice con su nombre del cable', () => {
    const prompt = selectFromListPrompt(snapshot('SearchPartitionChoice', { cards: [105], primary_count: 1, primary_destination: 'Somewhere' }))!;
    expect(prompt.primaryDestination).toBe('Somewhere');
    expect(prompt.restDestination).toBeNull();
  });
});

describe('las cuatro juntas', () => {
  test('cada tipo se reconoce por su propio nombre y nada más', () => {
    expect(selectFromListPrompt(snapshot('BlightChoice', { cards: [1] }))).toBeNull();
    expect(selectFromListPrompt(snapshot('SearchChoice', { cards: [1] }))).toBeNull();
    expect(selectFromListPrompt(null)).toBeNull();
  });

  test('el máximo nunca supera el conjunto publicado', () => {
    const prompt = selectFromListPrompt(snapshot('EffectZoneChoice', { cards: [100], count: 5, min_count: 0, up_to: true }))!;
    expect(prompt.max).toBe(1);
    expect(prompt.min).toBe(0);
  });
});
