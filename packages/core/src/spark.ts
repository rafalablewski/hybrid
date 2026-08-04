// SPARKLINE geometry — the shape of a small trend line, computed ONCE for both
// clients. Web draws the result into an <svg>, mobile into react-native-svg;
// neither owns the maths, so the line on the phone and the line in the browser
// are the same line.
//
// The rule this file exists to enforce: **a true zero baseline**. The trend
// cards used to floor every empty week at a 6px stub, which made "trained
// nothing" and "trained a little" identical shapes and turned the floor into a
// baseline the athlete then read as real. Here an empty period sits exactly ON
// the baseline, and a series that is entirely empty is a flat line along it.

export interface SparkPoint {
  x: number;
  y: number;
}

export interface Spark {
  /** the polyline, oldest → newest, as an SVG path (`M … L …`) */
  d: string;
  /** the same points, for callers that need the newest one (the endpoint dot) */
  points: SparkPoint[];
  /** the newest point — where the value label / dot goes */
  last: SparkPoint;
  /** y of the true zero line */
  baselineY: number;
}

export interface SparkBox {
  width: number;
  height: number;
  /** breathing room at the top, and at each end, so the endpoint dot isn't
   *  clipped by the viewBox. Defaults to 4. */
  pad?: number;
}

/**
 * Map `values` (oldest → newest) into a `width` × `height` box.
 *
 * The vertical scale runs from zero to the series max — always anchored at
 * zero, so line-to-line differences stay proportional to the differences in the
 * data. An all-zero series draws flat along the baseline rather than dividing by
 * zero; a single value is centred horizontally and, being its own max, sits at
 * the top of the box.
 */
export function sparkline(values: number[], { width, height, pad = 4 }: SparkBox): Spark {
  const baselineY = height - pad;
  const max = Math.max(0, ...values);
  const span = height - pad * 2;
  const n = values.length;
  const points: SparkPoint[] = values.map((v, i) => ({
    x: n < 2 ? width / 2 : pad + (i * (width - pad * 2)) / (n - 1),
    // max === 0 keeps every point on the baseline instead of dividing by zero.
    y: max === 0 ? baselineY : baselineY - (Math.max(0, v) / max) * span,
  }));
  const fallback: SparkPoint = { x: width / 2, y: baselineY };
  const last = points[points.length - 1] ?? fallback;
  const d = points.length === 0
    ? ""
    : points.map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)},${round(p.y)}`).join(" ");
  return { d, points, last, baselineY };
}

const round = (n: number) => Math.round(n * 100) / 100;
