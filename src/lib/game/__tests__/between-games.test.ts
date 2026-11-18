import { describe, expect, test } from 'bun:test';
import { playDrawOffers, playDrawPrompt, sideboardOffers, sideboardPrompt } from '../interaction.ts';
import type { EngineSnapshot, GameAction } from '../../engine/types.ts';

function snapshot(type: string, data: Record<string, unknown>, viewer = 0): EngineSnapshot {
  return {
    viewer,
    state: { waiting_for: { type, data }, objects: {} },
    legal: { actions: [] }
  } as unknown as EngineSnapshot;
}

const playFirst = (play_first: boolean): GameAction =>
  ({ type: 'ChoosePlayDraw', data: { play_first } }) as GameAction;

describe('CR 100.2b — the sideboard bounds are the engine\'s own predicate', () => {
  test('a missing prompt is not a sideboard step', () => {
    expect(sideboardPrompt(null)).toBeNull();
    expect(playDrawPrompt(null)).toBeNull();
  });

  test('the floor, the cap, the score and the game number are the published ones', () => {
    const prompt = sideboardPrompt(
      snapshot('BetweenGamesSideboard', {
        player: 1,
        game_number: 2,
        score: { p0_wins: 1, p1_wins: 0, draws: 0 },
        min_main_deck_size: 60,
        max_sideboard_size: 15
      })
    );
    expect(prompt?.player).toBe(1);
    expect(prompt?.gameNumber).toBe(2);
    expect(prompt?.minMainDeckSize).toBe(60);
    expect(prompt?.maxSideboardSize).toBe(15);
    expect(prompt?.score).toEqual({ p0: 1, p1: 0, draws: 0 });
  });

  test('a forbidden sideboard is 0, and an absent cap is not 0', () => {
    // CR 100.4a: the Commander family forbids a sideboard; `Unlimited` omits the cap.
    expect(sideboardPrompt(snapshot('BetweenGamesSideboard', { max_sideboard_size: 0 }))?.maxSideboardSize).toBe(0);
    expect(sideboardPrompt(snapshot('BetweenGamesSideboard', { max_sideboard_size: null }))?.maxSideboardSize).toBeNull();
    expect(sideboardPrompt(snapshot('BetweenGamesSideboard', {}))?.minMainDeckSize).toBeNull();
  });

  test('the submission is the published action and its own lists, not a rebuilt deck', () => {
    const submit = {
      type: 'SubmitSideboard',
      data: { main: [{ name: 'Forest', count: 24 }, { name: 'Grizzly Bears', count: 4 }], sideboard: [{ name: 'Naturalize', count: 3 }] }
    } as GameAction;
    const offers = sideboardOffers([submit]);
    expect(offers.submit).toBe(submit);
    expect(offers.mainCount).toBe(28);
    expect(offers.sideboardCount).toBe(3);
    // No action, or one whose counts are not integers, prints no count.
    expect(sideboardOffers([]).submit).toBeNull();
    expect(sideboardOffers([{ type: 'SubmitSideboard', data: { main: [{ count: -1 }] } } as GameAction]).mainCount).toBeNull();
  });

  test('a malformed score is not printed', () => {
    expect(sideboardPrompt(snapshot('BetweenGamesSideboard', { score: { p0_wins: 1 } }))?.score).toBeNull();
    expect(playDrawPrompt(snapshot('BetweenGamesChoosePlayDraw', { score: { p0_wins: '1', p1_wins: 0, draws: 0 } }))?.score).toBeNull();
  });
});

describe('CR 103.1 — play or draw is the published boolean', () => {
  test('the prompt names the chooser and the game', () => {
    const prompt = playDrawPrompt(
      snapshot('BetweenGamesChoosePlayDraw', {
        player: 1,
        game_number: 3,
        score: { p0_wins: 1, p1_wins: 1, draws: 0 }
      })
    );
    expect(prompt?.player).toBe(1);
    expect(prompt?.gameNumber).toBe(3);
    expect(prompt?.score).toEqual({ p0: 1, p1: 1, draws: 0 });
  });

  test('a boolean the wire did not publish is not a button, and the first action wins', () => {
    const play = playFirst(true);
    const draw = playFirst(false);
    const offers = playDrawOffers([play, playFirst(true), draw, { type: 'ChoosePlayDraw', data: {} } as GameAction]);
    expect(offers.play).toBe(play);
    expect(offers.draw).toBe(draw);
    expect(playDrawOffers([playFirst(false)]).play).toBeNull();
  });

  test('the two between-games windows are not each other', () => {
    expect(playDrawPrompt(snapshot('BetweenGamesSideboard', { player: 0 }))).toBeNull();
    expect(sideboardPrompt(snapshot('BetweenGamesChoosePlayDraw', { player: 0 }))).toBeNull();
  });
});
