import { describe, expect, test } from 'bun:test';
import { placePopover } from '../anchored.ts';

const viewport = { width: 1440, height: 900 };

describe('placePopover', () => {
  test('a card with room below opens the box underneath it', () => {
    const anchor = { left: 300, right: 500, top: 100, bottom: 240 };
    const size = { width: 240, height: 150 };
    expect(placePopover(anchor, size, viewport)).toEqual({ top: 246, left: 260 });
  });

  test('a card near the bottom flips the box above instead of off-screen', () => {
    // Measured case: the creature sat at y 740–880 in a 900 px window and the
    // picker opened at y 890, leaving only the title visible.
    const anchor = { left: 500, right: 700, top: 740, bottom: 880 };
    const size = { width: 240, height: 150 };
    const { top } = placePopover(anchor, size, viewport);
    expect(top).toBe(740 - 150 - 6);
    expect(top + size.height).toBeLessThanOrEqual(viewport.height - 8);
  });

  test('a short landscape viewport overlaps the card rather than leaving the screen', () => {
    const anchor = { left: 40, right: 240, top: 100, bottom: 340 };
    const size = { width: 240, height: 200 };
    const { top } = placePopover(anchor, size, { width: 844, height: 390 });
    expect(top).toBeGreaterThanOrEqual(8);
    expect(top).toBeLessThanOrEqual(390 - 200 - 8);
  });

  test('the box hangs from the card\'s right edge and never leaves the margins', () => {
    const size = { width: 240, height: 120 };
    // Right-aligned to the card, not to the window: 1420 - 240.
    const flushRight = placePopover({ left: 1300, right: 1420, top: 10, bottom: 60 }, size, viewport);
    expect(flushRight.left).toBe(1180);
    // A card against the right edge clamps the box to the 8 px margin.
    const atEdge = placePopover({ left: 1300, right: 1500, top: 10, bottom: 60 }, size, viewport);
    expect(atEdge.left).toBe(1440 - 240 - 8);
    const flushLeft = placePopover({ left: 0, right: 60, top: 10, bottom: 60 }, size, viewport);
    expect(flushLeft.left).toBe(8);
  });

  test('a box wider than the viewport still starts inside the margin', () => {
    const { left } = placePopover({ left: 10, right: 90, top: 10, bottom: 40 }, { width: 900, height: 100 }, { width: 390, height: 844 });
    expect(left).toBe(8);
  });
});
