import { describe, expect, test } from 'bun:test';
import {
  dungeonOffers,
  dungeonPrompt,
  exactCandidateAction,
  exactCandidateOffers,
  exactCandidatePrompt
} from '../interaction.ts';
import type { EngineSnapshot, GameAction } from '../../engine/types.ts';

function snapshot(type: string, data: Record<string, unknown>, viewer = 0): EngineSnapshot {
  return {
    viewer,
    state: { waiting_for: { type, data }, objects: {} },
    legal: { actions: [] }
  } as unknown as EngineSnapshot;
}

const action = (type: string, data: Record<string, unknown>) => ({ type, data }) as unknown as GameAction;

describe('CR 701.54a / CR 704.5j / CR 310.11 — una lista cerrada, un candidato elegido', () => {
  test('otra ventana, o ninguna, no es una elección de candidato', () => {
    expect(exactCandidatePrompt(null)).toBeNull();
    expect(exactCandidatePrompt(snapshot('ChooseDungeon', { options: [] }))).toBeNull();
  });

  test('las tres ventanas se separan por su kind y conservan el orden del cable', () => {
    const bearer = exactCandidatePrompt(snapshot('ChooseRingBearer', { player: 1, candidates: [9, 7] }));
    expect(bearer?.kind).toBe('ring-bearer');
    expect(bearer?.player).toBe(1);
    // The wire's order, not sorted: 7 does not come before 9 here.
    expect(bearer?.candidates).toEqual([9, 7]);

    const legend = exactCandidatePrompt(
      snapshot('ChooseLegend', { player: 0, legend_name: 'Gisela, the Broken Blade', candidates: [406, 407] })
    );
    expect(legend?.kind).toBe('legend');
    expect(legend?.legendName).toBe('Gisela, the Broken Blade');

    const battle = exactCandidatePrompt(snapshot('BattleProtectorChoice', { player: 0, battle_id: 409, candidates: [1, 0] }));
    expect(battle?.kind).toBe('battle-protector');
    expect(battle?.battleId).toBe(409);
    // CR 310.11: seats, and the engine's order again.
    expect(battle?.candidates).toEqual([1, 0]);
  });

  test('un candidato que el cable no publicó no entra en la lista', () => {
    // `0` SÍ entra: es un id válido («Jugador 1»), el mismo criterio que
    // `clashPrompt` usa para los asientos. Un negativo, un string y un decimal
    // no son ids publicados.
    const prompt = exactCandidatePrompt(snapshot('ChooseRingBearer', { candidates: [9, 0, -1, '7', 2.5] }));
    expect(prompt?.candidates).toEqual([9, 0]);
  });

  test('sin jugador en el cable, decide el que mira; sin nombre legendario, no se inventa', () => {
    const prompt = exactCandidatePrompt(snapshot('ChooseLegend', { candidates: [1] }, 3));
    expect(prompt?.player).toBe(3);
    expect(prompt?.legendName).toBeNull();
  });

  test('sólo la acción publicada del candidato es botón', () => {
    const offers = exactCandidateOffers([
      action('ChooseRingBearer', { target: 9 }),
      action('ChooseRingBearer', { target: 7 }),
      { type: 'CancelCast' } as unknown as GameAction
    ]);
    const prompt = exactCandidatePrompt(snapshot('ChooseRingBearer', { candidates: [9, 8] }))!;
    expect(exactCandidateAction(offers, prompt, 9)).toBeDefined();
    // 8 is a candidate the engine published but offered no action for.
    expect(exactCandidateAction(offers, prompt, 8)).toBeUndefined();
    // The first published action wins when the wire repeats a candidate.
    expect(exactCandidateAction(offers, prompt, 7)).toBeDefined();
  });

  test('una acción malformada no produce botón', () => {
    const offers = exactCandidateOffers([action('ChooseRingBearer', { target: '9' }), action('ChooseLegend', { keep: -1 })]);
    expect(offers.byObject.size).toBe(0);
    expect(offers.byLegend.size).toBe(0);
  });

  test('el objeto publicado se despacha tal cual, sin reconstruirlo', () => {
    const published = action('ChooseBattleProtector', { protector: 1 });
    const offers = exactCandidateOffers([published]);
    const prompt = exactCandidatePrompt(snapshot('BattleProtectorChoice', { battle_id: 409, candidates: [0, 1] }))!;
    // Identity, not equality: the panel must send the wire object itself.
    expect(exactCandidateAction(offers, prompt, 1)).toBe(published);
  });
});

describe('CR 701.49a / CR 309.5a — dungeons y habitaciones con los nombres del cable', () => {
  test('otra ventana no es una elección de dungeon', () => {
    expect(dungeonPrompt(null)).toBeNull();
    expect(dungeonPrompt(snapshot('ChooseRingBearer', { candidates: [1] }))).toBeNull();
  });

  test('ChooseDungeon lee el nombre y la entrada impresos, y descarta previews sin nombre', () => {
    const prompt = dungeonPrompt(
      snapshot('ChooseDungeon', {
        player: 0,
        options: [
          { dungeon: { type: 'LostMineOfPhandelver' }, name: 'Lost Mine of Phandelver', entry_room: { index: 1, name: 'Cave Entrance', text: 'Dark.' } },
          { dungeon: { type: 'X' }, entry_room: { name: 'Y' } }
        ]
      })
    );
    expect(prompt?.dungeonName).toBeNull();
    expect(prompt?.dungeons.length).toBe(1);
    expect(prompt?.dungeons[0]?.name).toBe('Lost Mine of Phandelver');
    // CR 309.4a: the entry room comes from the preview.
    expect(prompt?.dungeons[0]?.roomName).toBe('Cave Entrance');
  });

  test('ChooseDungeonRoom conserva el índice y el nombre de la dungeon', () => {
    const prompt = dungeonPrompt(
      snapshot('ChooseDungeonRoom', {
        player: 1,
        dungeon_name: 'Lost Mine of Phandelver',
        options: [
          { index: 2, name: 'Mine Tunnels', text: 'Twisting.' },
          { index: 1, name: 'Cave Entrance', text: 'Dark.' },
          { name: 'No index' }
        ]
      })
    );
    expect(prompt?.dungeonName).toBe('Lost Mine of Phandelver');
    expect(prompt?.rooms.map((room) => room.index)).toEqual([2, 1]);
    expect(prompt?.rooms[1]?.name).toBe('Cave Entrance');
  });

  test('la dungeon se indexa por el id que el motor publicó', () => {
    const published = action('ChooseDungeon', { dungeon: { type: 'LostMineOfPhandelver' } });
    const offers = dungeonOffers([published]);
    expect(offers.byDungeon.get(JSON.stringify({ type: 'LostMineOfPhandelver' }))).toBe(published);
    expect(offers.byDungeon.get(JSON.stringify({ type: 'DungeonOfTheMadMage' }))).toBeUndefined();
  });

  test('una habitación sin acción publicada no es botón', () => {
    const offers = dungeonOffers([action('ChooseDungeonRoom', { room_index: 1 })]);
    expect(offers.byRoom.get(1)).toBeDefined();
    expect(offers.byRoom.get(2)).toBeUndefined();
  });
});
