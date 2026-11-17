import { describe, expect, test } from 'bun:test';
import { mutateMergeOffers, mutateMergePrompt, type MutateMergePrompt } from '../interaction.ts';
import type { EngineSnapshot, GameAction, ObjectId } from '../../engine/types.ts';

function snapshot(data: Record<string, unknown>, viewer = 0): EngineSnapshot {
  return {
    viewer,
    state: { waiting_for: { type: 'MutateMergeChoice', data }, objects: {} },
    legal: { actions: [] }
  } as unknown as EngineSnapshot;
}

const side = (name: string): GameAction =>
  ({ type: 'ChooseMutateMergeSide', data: { side: name } }) as GameAction;

describe('CR 702.140c — the merge side is a published side, not a rebuilt one', () => {
  test('a missing prompt is not a merge choice', () => {
    expect(mutateMergePrompt(null)).toBeNull();
  });

  test('the spell and the target come from the prompt', () => {
    const prompt = mutateMergePrompt(snapshot({
      player: 0,
      merging_id: 440,
      target_id: 441
    }));
    expect(prompt).toEqual({
      player: 0,
      mergingId: 440 as ObjectId,
      targetId: 441 as ObjectId
    } satisfies MutateMergePrompt);
  });

  test('a missing field is not invented', () => {
    const prompt = mutateMergePrompt(snapshot({ player: 1 }));
    expect(prompt?.mergingId).toBeNull();
    expect(prompt?.targetId).toBeNull();
    expect(prompt?.player).toBe(1);
  });

  test('only the plain strings Top and Bottom are sides, and the first action wins', () => {
    const top = side('Top');
    const offers = mutateMergeOffers([
      top,
      side('Top'),
      side('Bottom'),
      side('Left'),
      { type: 'ChooseMutateMergeSide', data: { side: { type: 'Top' } } } as GameAction,
      { type: 'CancelCast' } as GameAction
    ]);
    expect([...offers.bySide.keys()]).toEqual(['Top', 'Bottom']);
    expect(offers.bySide.get('Top')).toBe(top);
  });

  test('a side the engine did not publish is not a button', () => {
    const offers = mutateMergeOffers([side('Top')]);
    expect(offers.bySide.has('Bottom')).toBe(false);
  });
});
