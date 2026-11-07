/**
 * Arc geometry for the board overlay.
 *
 * Ported from Phase `client/src/components/targeting/arcPath.ts`
 * (commit `f67169218fa9f5dec439b9024906b891a926210e`, MIT OR Apache-2.0).
 * The maths is the upstream one: a quadratic curve whose control point sits on
 * the perpendicular bisector, offset proportionally to the distance. React,
 * framer-motion and the portal layer are **not** imported.
 *
 * Kept as a pure module so the shape can be asserted without a browser: an
 * invalid `d` attribute fails silently in SVG (the path simply is not drawn),
 * which is exactly the kind of defect a screenshot review misses.
 */
export interface Point {
  x: number;
  y: number;
}

/** Maximum control-point offset, in CSS pixels. */
export const MAX_ARC_OFFSET = 80;
/** Fraction of the distance used as the control-point offset. */
export const ARC_OFFSET_RATIO = 0.3;

/**
 * `bend` scales the control-point offset. The default `1` is Phase's curve;
 * layers that share both endpoints (a stack object's declared target and the
 * legal targets offered for it) pass a negative value so the second arc bows
 * the other way instead of hiding under the first.
 */
export function getArcPath(from: Point, to: Point, bend = 1): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Coincident endpoints (a self-target, or two anchors overlapping mid-layout):
  // the perpendicular unit vector is 0/0 = NaN, which propagates into the
  // control point and yields an invalid `d`. There is no arc to draw, so emit a
  // degenerate line instead — the same guard Phase ships.
  if (dist === 0) {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }
  const offset = Math.min(MAX_ARC_OFFSET, dist * ARC_OFFSET_RATIO) * bend;
  const nx = -dy / dist;
  const ny = dx / dist;
  const cx = mx + nx * offset;
  const cy = my + ny * offset;
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}

/** True when both endpoints are finite numbers: what `getArcPath` needs. */
export function isDrawablePoint(point: Point | undefined): point is Point {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

/**
 * Attach the SVG `d` attribute once per line.
 *
 * The overlay renders two strokes per line (a dark underlay and the coloured
 * stroke), so computing the path inside the markup would run the maths twice
 * per line on every frame the anchors move.
 */
export function withArcPaths<T extends { from: Point; to: Point }>(
  lines: readonly T[],
  bendOf: (line: T) => number = () => 1
): (T & { d: string })[] {
  return lines
    .filter((line) => isDrawablePoint(line.from) && isDrawablePoint(line.to))
    .map((line) => ({ ...line, d: getArcPath(line.from, line.to, bendOf(line)) }));
}
