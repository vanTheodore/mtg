import { describe, expect, test } from 'bun:test';
import {
  beholdOffers,
  colorName,
  doorName,
  opName,
  pickOneAction,
  pickOnePrompt,
  populateOffers,
  roomDoorKey,
  roomDoorOffers,
  roomDoorPrompt,
  specializeOffers,
  specializePrompt
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

describe('CR 701.4a — behold elige exactamente uno del conjunto mixto', () => {
  test('la lista es la publicada, en su orden, y no se filtra por zona', () => {
    const prompt = pickOnePrompt(snapshot('BeholdChoice', { player: 1, choices: [100, 1001] }));
    expect(prompt?.kind).toBe('behold');
    expect(prompt?.player).toBe(1);
    // 100 is on the battlefield, 1001 is in hand: the engine mixes both.
    expect(prompt?.options).toEqual([100, 1001]);
  });

  test('sólo un SelectCards con UNA carta es botón de behold', () => {
    const offers = beholdOffers([
      action('SelectCards', { cards: [100] }),
      action('SelectCards', { cards: [100, 1001] }),
      action('SelectCards', { cards: [] })
    ]);
    expect([...offers.byCard.keys()]).toEqual([100]);
  });

  test('un ChooseTarget no es una respuesta de behold', () => {
    const offers = beholdOffers([action('ChooseTarget', { target: { Object: 100 } })]);
    expect(offers.byCard.size).toBe(0);
  });
});

describe('CR 701.47a — poblar responde con un objetivo, no con SelectCards', () => {
  test('la ventana es populate y sus candidatos son valid_tokens', () => {
    const prompt = pickOnePrompt(snapshot('PopulateChoice', { player: 0, source_id: 105, valid_tokens: [100, 101] }));
    expect(prompt?.kind).toBe('populate');
    expect(prompt?.options).toEqual([100, 101]);
  });

  test('sólo un ChooseTarget con Object(id) es botón de populate', () => {
    const offers = populateOffers([
      action('ChooseTarget', { target: { Object: 100 } }),
      action('ChooseTarget', { target: { Player: 1 } }),
      action('SelectCards', { cards: [101] })
    ]);
    expect([...offers.byToken.keys()]).toEqual([100]);
  });

  test('cada ventana empareja sólo sus propias acciones', () => {
    // The same id, two windows: behold's SelectCards must not light up populate,
    // and populate's ChooseTarget must not light up behold.
    const behold = pickOnePrompt(
      snapshot('BeholdChoice', { choices: [100] }, [action('ChooseTarget', { target: { Object: 100 } })])
    );
    expect(behold?.actions.size).toBe(0);
    const populate = pickOnePrompt(
      snapshot('PopulateChoice', { valid_tokens: [100] }, [action('SelectCards', { cards: [100] })])
    );
    expect(populate?.actions.size).toBe(0);
  });

  test('el despacho exige que la acción sea de esta ventana', () => {
    const published = action('SelectCards', { cards: [100] });
    const snap = snapshot('BeholdChoice', { choices: [100] }, [published]);
    expect(pickOneAction(snap, published)).toBe(true);
    expect(pickOneAction(snap, action('SelectCards', { cards: [999] }))).toBe(false);
    expect(pickOneAction(snapshot('PopulateChoice', { valid_tokens: [100] }, []), published)).toBe(false);
  });

  test('otra ventana no es una elección de un objeto', () => {
    expect(pickOnePrompt(snapshot('DigChoice', { cards: [1] }))).toBeNull();
    expect(pickOnePrompt(null)).toBeNull();
  });
});

describe('CR 253.2 — especializar nombra los cinco colores y nada más', () => {
  test('los nombres salen del enum del motor', () => {
    expect(colorName('White')).toBe('Blanco');
    expect(colorName('Green')).toBe('Verde');
    // A value the engine's enum cannot produce is said without a name.
    expect(colorName('Purple')).toBeNull();
    expect(colorName(7)).toBeNull();
  });

  test('la ventana conserva el orden del cable y descarta lo que no es color', () => {
    const prompt = specializePrompt(snapshot('SpecializeColor', { player: 0, object_id: 105, options: ['Black', 'White', 3] }));
    expect(prompt?.options).toEqual(['Black', 'White']);
    expect(prompt?.objectId).toBe(105);
  });

  test('la oferta es ChooseSpecializeColor por color', () => {
    const published = action('ChooseSpecializeColor', { color: 'White' });
    const offers = specializeOffers([published, action('OtherAction', { color: 'Black' })]);
    expect(offers.byColor.get('White')).toBe(published);
    expect(offers.byColor.size).toBe(1);
  });
});

describe('CR 709.5f-g — la Room ofrece pares, no el producto cartesiano', () => {
  test('op y door se nombran desde sus enums; lo demás se dice tal cual', () => {
    expect(opName('Unlock')).toBe('Desbloquear');
    expect(opName('LockOrUnlock')).toBe('Bloquear o desbloquear');
    expect(doorName('Left')).toBe('puerta izquierda');
    expect(opName('Melt')).toBeNull();
    expect(doorName('Top')).toBeNull();
  });

  test('un par sin acción publicada no es botón, y el par opuesto tampoco', () => {
    const published = action('ChooseRoomDoor', { object_id: 105, op: { type: 'Unlock' }, door: 'Left' });
    const offers = roomDoorOffers([published]);
    expect(offers.byPair.get(roomDoorKey('Unlock', 'Left'))).toBe(published);
    // Same operation, other door: not published, not a button.
    expect(offers.byPair.get(roomDoorKey('Unlock', 'Right'))).toBeUndefined();
    // Same door, other operation: not published either.
    expect(offers.byPair.get(roomDoorKey('Lock', 'Left'))).toBeUndefined();
  });

  test('la ventana lee los pares etiquetados por tipo y conserva el orden', () => {
    const prompt = roomDoorPrompt(
      snapshot('ChooseRoomDoor', {
        player: 0,
        object_id: 105,
        options: [
          [{ type: 'Unlock' }, 'Left'],
          [{ type: 'Lock' }, 'Right'],
          [{ type: 'Unlock' }, 'Left']
        ]
      })
    );
    expect(prompt?.options).toEqual([
      { op: 'Unlock', door: 'Left' },
      { op: 'Lock', door: 'Right' }
    ]);
  });

  test('una opción malformada no entra en la lista', () => {
    const prompt = roomDoorPrompt(snapshot('ChooseRoomDoor', { options: [['Unlock'], [{ type: 'Unlock' }, 3], 'Left'] }));
    expect(prompt?.options).toEqual([]);
  });
});
