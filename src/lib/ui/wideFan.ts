/**
 * Phase's wide hand-fan profile, ported as pure, dependency-free TypeScript.
 * Original: phase-rs/phase client/src/components/card/fanGeometry.ts
 * Source pin: 0dd35e4a9dfe1dfba697224775d2205d56f7f20d.
 * Copyright 2024–2026 phase.rs contributors, MIT OR Apache-2.0.
 *
 * This file only computes presentation geometry. It never decides MTG rules.
 */
export interface WideFan {
  overlapFraction: number;
  spreadFactor: number;
  rotation: (index: number) => number;
  arc: (index: number) => number;
}

export function wideFan(count: number): WideFan {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('A fan needs at least one card');
  const overlapFraction =
    count <= 3 ? -0.1 :
    count <= 5 ? -0.15 :
    count <= 7 ? -0.25 :
    Math.max(-0.86, Math.min(-0.35, 4.5 / (count - 1) - 1));
  const spreadFactor = count === 1 ? 1 : 1 + (count - 1) * (1 + overlapFraction);
  const center = (count - 1) / 2;
  const shape = Math.max(2, count);
  const rotationStep = Math.min(4, 24 / (shape - 1));
  const arcCoefficient = shape <= 7 ? 3.5 : 32 / (((shape - 1) / 2) ** 2);
  return {
    overlapFraction,
    spreadFactor,
    rotation: (index: number) => (index - center) * rotationStep,
    arc: (index: number) => Math.min((index - center) ** 2 * arcCoefficient, center ** 2 * arcCoefficient)
  };
}
