import { describe, test, expect } from 'bun:test';
import { wideFan } from './wideFan.ts';

describe('Phase wide-fan geometry port', () => {
  test('preserves overlap tiers and wide eight-card budget', () => {
    expect(wideFan(3).overlapFraction).toBe(-0.1);
    expect(wideFan(5).overlapFraction).toBe(-0.15);
    expect(wideFan(7).overlapFraction).toBe(-0.25);
    expect(wideFan(8).spreadFactor).toBeCloseTo(5.5, 4);
    expect(wideFan(20).spreadFactor).toBeLessThanOrEqual(5.5001);
  });
  test('seven cards form the original symmetric rotation and parabola', () => {
    const fan = wideFan(7);
    expect(fan.rotation(0)).toBe(-12);
    expect(fan.rotation(3)).toBe(0);
    expect(fan.rotation(6)).toBe(12);
    expect(fan.arc(0)).toBeCloseTo(31.5);
    expect(fan.arc(3)).toBe(0);
    expect(fan.arc(6)).toBeCloseTo(31.5);
  });
  test('larger hands flatten the outer arc to 32px', () => {
    const fan = wideFan(20);
    expect(fan.arc(0)).toBeCloseTo(32);
    expect(fan.arc(19)).toBeCloseTo(32);
    expect(fan.rotation(0)).toBeCloseTo(-12);
    expect(fan.rotation(19)).toBeCloseTo(12);
  });
  test('a single card remains deterministic without division by zero', () => {
    const single = wideFan(1);
    expect(single.spreadFactor).toBe(1);
    expect(single.rotation(0)).toBe(0);
    expect(single.arc(0)).toBe(0);
    expect(() => wideFan(0)).toThrow(RangeError);
  });
});
