import { describe, expect, test } from 'bun:test';
import {
  blightPrompt,
  harmonizePrompt,
  pickExactlyOneAction,
  pickExactlyOneOffers,
  pickExactlyOnePrompt,
  unlessBouncePrompt
} from '../interaction.ts';
import type { EngineSnapshot, GameAction } from '../../engine/types.ts';

function snapshot(type: string, data: Record<string, unknown>, actions: GameAction[] = [], viewer = 0): EngineSnapshot {
  return {
    viewer,
    state: { waiting_for: { type, data }, objects: {} },
    legal: { actions }
  } as unknown as EngineSnapshot;
}

const action = (type: string, data: Record<string, unknown>) => ({ type, data }) as unknown as GameAction;

describe('CR 701.68a — blight pone N contadores en UNA criatura', () => {
  test('el recuento de contadores es el del cable, no el de la lista', () => {
    const prompt = blightPrompt(snapshot('BlightChoice', { player: 0, counters: 2, creatures: [100, 105] }));
    // Two counters, two creatures: N is not the number of creatures.
    expect(prompt?.counters).toBe(2);
    expect(prompt?.creatures).toEqual([100, 105]);
  });

  test('la respuesta es SelectCards con exactamente una carta', () => {
    const one = action('SelectCards', { cards: [100] });
    const offers = pickExactlyOneOffers([one, action('SelectCards', { cards: [100, 105] }), action('SelectCards', { cards: [] })]);
    expect([...offers.byCard.keys()]).toEqual([100]);
    expect(offers.byCard.get(100)).toBe(one);
  });

  test('la ventana se identifica por su kind y conserva el orden', () => {
    const prompt = pickExactlyOnePrompt(snapshot('BlightChoice', { counters: 1, creatures: [105, 100] }));
    expect(prompt?.kind).toBe('blight');
    expect(prompt?.candidates).toEqual([105, 100]);
  });
});

describe('CR 702.180b — armonizar gira una criatura, y «ninguna» sólo si el cable lo publica', () => {
  test('la respuesta es HarmonizeTap, no SelectCards', () => {
    const tap = action('HarmonizeTap', { creature_id: 100 });
    const offers = pickExactlyOneOffers([tap, action('SelectCards', { cards: [100] })]);
    expect(offers.byTap.get(100)).toBe(tap);
    // SelectCards belongs to the sibling windows, never to harmonize.
    expect(offers.byCard.size).toBe(1);
    const prompt = pickExactlyOnePrompt(snapshot('HarmonizeTapChoice', { eligible_creatures: [100] }, [tap]));
    expect(prompt?.actions.get(100)).toBe(tap);
  });

  test('sin la acción nula en el cable, no hay vía de no reducir', () => {
    const prompt = pickExactlyOnePrompt(
      snapshot('HarmonizeTapChoice', { eligible_creatures: [100] }, [action('HarmonizeTap', { creature_id: 100 })])
    );
    expect(prompt?.decline).toBeNull();
  });

  test('con la acción nula publicada, «no reducir» existe y se despacha', () => {
    const decline = action('HarmonizeTap', { creature_id: null });
    const snap = snapshot('HarmonizeTapChoice', { eligible_creatures: [100] }, [decline]);
    const prompt = pickExactlyOnePrompt(snap);
    expect(prompt?.decline).toBe(decline);
    expect(pickExactlyOneAction(snap, decline)).toBe(true);
  });

  test('la lista de elegibles es la del cable', () => {
    expect(harmonizePrompt(snapshot('HarmonizeTapChoice', { eligible_creatures: [100, 105] }))?.creatures).toEqual([100, 105]);
  });
});

describe('CR 118.12 — «a menos que» devuelve UN permanente publicado', () => {
  test('el número de jugadores restantes viene del cable', () => {
    const prompt = unlessBouncePrompt(snapshot('UnlessBounceChoice', { player: 1, permanents: [100], remaining: 2 }));
    expect(prompt?.player).toBe(1);
    expect(prompt?.remaining).toBe(2);
    expect(prompt?.permanents).toEqual([100]);
  });

  test('sin remaining en el cable, se asume uno y no se inventa un recuento', () => {
    expect(unlessBouncePrompt(snapshot('UnlessBounceChoice', { permanents: [100] }))?.remaining).toBe(1);
  });

  test('un permanente no publicado no es botón', () => {
    const published = action('SelectCards', { cards: [100] });
    const snap = snapshot('UnlessBounceChoice', { permanents: [100, 101] }, [published]);
    const prompt = pickExactlyOnePrompt(snap)!;
    expect(prompt.actions.get(100)).toBe(published);
    expect(prompt.actions.get(101)).toBeUndefined();
    expect(prompt.decline).toBeNull();
    expect(pickExactlyOneAction(snap, action('SelectCards', { cards: [101] }))).toBe(false);
  });
});

describe('las tres ventanas juntas', () => {
  test('cada una empareja sólo su propia acción', () => {
    const tap = action('HarmonizeTap', { creature_id: 100 });
    const cards = action('SelectCards', { cards: [100] });
    // Behold-style SelectCards must not light up harmonize.
    const harmonize = pickExactlyOnePrompt(snapshot('HarmonizeTapChoice', { eligible_creatures: [100] }, [cards]));
    expect(harmonize?.actions.size).toBe(0);
    // And a HarmonizeTap must not light up blight.
    const blight = pickExactlyOnePrompt(snapshot('BlightChoice', { counters: 1, creatures: [100] }, [tap]));
    expect(blight?.actions.size).toBe(0);
  });

  test('otra ventana no es ninguna de las tres', () => {
    expect(pickExactlyOnePrompt(snapshot('DigChoice', { cards: [1] }))).toBeNull();
    expect(pickExactlyOnePrompt(null)).toBeNull();
    expect(pickExactlyOneAction(null, action('SelectCards', { cards: [1] }))).toBe(false);
  });
});
