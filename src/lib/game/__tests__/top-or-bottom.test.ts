import { describe, expect, test } from 'bun:test';
import { topOrBottomOffers, topOrBottomPrompt } from '../interaction.ts';
import type { EngineSnapshot, GameAction, ObjectId } from '../../engine/types.ts';

function snapshot(data: Record<string, unknown>, viewer = 0): EngineSnapshot {
  return {
    viewer,
    state: { waiting_for: { type: 'TopOrBottomChoice', data }, objects: {} },
    legal: { actions: [] }
  } as unknown as EngineSnapshot;
}

const side = (top: boolean): GameAction =>
  ({ type: 'ChooseTopOrBottom', data: { top } }) as GameAction;

describe('CR 608.2d — a library position is the published boolean, not a renamed top', () => {
  test('a missing prompt is not a library choice', () => {
    expect(topOrBottomPrompt(null)).toBeNull();
  });

  test('an omitted position is the top, and the object is the published one', () => {
    const prompt = topOrBottomPrompt(snapshot({ player: 1, object_id: 448 }));
    expect(prompt?.side).toBe('top');
    expect(prompt?.nth).toBeNull();
    expect(prompt?.objectId).toBe(448 as ObjectId);
    expect(prompt?.player).toBe(1);
  });

  test('second from the top keeps the published n', () => {
    const prompt = topOrBottomPrompt(snapshot({ top_position: { type: 'NthFromTop', n: 2 }, object_id: 448 }));
    expect(prompt?.side).toBe('nth');
    expect(prompt?.nth).toBe(2);
  });

  test('a position this table cannot place is not relabeled as the top', () => {
    expect(topOrBottomPrompt(snapshot({ top_position: { type: 'BeneathTop', depth: { type: 'Fixed', value: 1 } } }))?.side).toBe('other');
    expect(topOrBottomPrompt(snapshot({ top_position: { type: 'NthFromTop' } }))?.side).toBe('unknown');
    expect(topOrBottomPrompt(snapshot({}))?.objectId).toBeNull();
  });

  test('a button is the published boolean, and the first action wins', () => {
    const top = side(true);
    const bottom = side(false);
    const offers = topOrBottomOffers([top, side(true), bottom, { type: 'ChooseTopOrBottom', data: {} } as GameAction]);
    expect(offers.top).toBe(top);
    expect(offers.bottom).toBe(bottom);
    expect(topOrBottomOffers([side(false)]).top).toBeNull();
  });
});
