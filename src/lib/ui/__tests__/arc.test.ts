import { describe, expect, test } from 'bun:test';
import { ARC_OFFSET_RATIO, MAX_ARC_OFFSET, getArcPath, isDrawablePoint, withArcPaths } from '#lib/ui/arc.ts';

describe('arc path', () => {
  test('emits a quadratic curve between the endpoints', () => {
    const d = getArcPath({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(d).toBe('M 0 0 Q 50 30 100 0');
  });

  test('the control point sits on the perpendicular bisector', () => {
    // Vertical segment → the bulge is horizontal.
    const d = getArcPath({ x: 10, y: 10 }, { x: 10, y: 110 });
    expect(d).toBe('M 10 10 Q -20 60 10 110');
  });

  test('caps the offset so a long line does not bow off screen', () => {
    const d = getArcPath({ x: 0, y: 0 }, { x: 1000, y: 0 });
    expect(d).toBe(`M 0 0 Q 500 ${MAX_ARC_OFFSET} 1000 0`);
    expect(MAX_ARC_OFFSET).toBe(80);
    expect(ARC_OFFSET_RATIO).toBe(0.3);
  });

  test('a negative bend bows the curve the other way for overlapping layers', () => {
    const forward = getArcPath({ x: 0, y: 0 }, { x: 100, y: 0 });
    const backward = getArcPath({ x: 0, y: 0 }, { x: 100, y: 0 }, -0.6);
    expect(forward).toBe('M 0 0 Q 50 30 100 0');
    expect(backward).toBe('M 0 0 Q 50 -18 100 0');
    expect(forward).not.toBe(backward);
  });

  test('a zero bend draws a straight chord', () => {
    expect(getArcPath({ x: 0, y: 0 }, { x: 10, y: 10 }, 0)).toBe('M 0 0 Q 5 5 10 10');
  });

  test('coincident endpoints produce a finite degenerate line, never NaN', () => {
    const d = getArcPath({ x: 42, y: 7 }, { x: 42, y: 7 });
    expect(d).toBe('M 42 7 L 42 7');
    expect(d).not.toContain('NaN');
  });

  test('every emitted number is finite', () => {
    const d = getArcPath({ x: -3.5, y: 1e4 }, { x: 8, y: 2 });
    for (const token of d.split(/\s+/)) {
      if (token === 'M' || token === 'Q' || token === 'L') continue;
      expect(Number.isFinite(Number(token))).toBe(true);
    }
  });

  test('isDrawablePoint rejects missing or non-finite anchors', () => {
    expect(isDrawablePoint(undefined)).toBe(false);
    expect(isDrawablePoint({ x: Number.NaN, y: 1 })).toBe(false);
    expect(isDrawablePoint({ x: Number.POSITIVE_INFINITY, y: 1 })).toBe(false);
    expect(isDrawablePoint({ x: 0, y: 0 })).toBe(true);
  });

  test('withArcPaths takes a per-line bend', () => {
    const lines = withArcPaths(
      [{ key: 'a', from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, bend: -0.6 }],
      (line) => line.bend
    );
    expect(lines[0].d).toBe('M 0 0 Q 50 -18 100 0');
  });

  test('withArcPaths drops undrawable lines and computes d once', () => {
    const lines = withArcPaths([
      { key: 'a', from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      { key: 'b', from: { x: Number.NaN, y: 0 }, to: { x: 10, y: 0 } },
      { key: 'c', from: { x: 0, y: 0 }, to: { x: 0, y: 10 } }
    ]);
    expect(lines.map((line) => line.key)).toEqual(['a', 'c']);
    expect(lines[0].d).toBe('M 0 0 Q 5 3 10 0');
    expect(lines[1].d).toBe('M 0 0 Q -3 5 0 10');
  });
});
