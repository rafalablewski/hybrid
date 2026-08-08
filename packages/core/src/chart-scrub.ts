// ─────────────────────────────────────────────────────────────────────────────
// CHART SCRUB — where a held finger lands on a chart, computed ONCE for both
// clients.
//
// A held chart is the stock-app gesture: press anywhere on the plot and it
// tells you the value UNDER YOUR FINGER instead of only the shape. The gesture
// itself is per-platform (pointer events in the browser, a PanResponder on the
// phone) but the ANSWER must not be: if web rounded to the nearest point and
// mobile floored to a band, the same press on the same chart would report two
// different weeks. So the hit-testing lives here and both clients call it.
//
// Two chart shapes, two rules:
//   • `band`  — a BAR chart. Every bar owns an equal slice of the width, so the
//               bar you are over is the bar you get. Anywhere on a bar (or in
//               the gap beside it) reads that bar.
//   • `point` — a LINE chart. The points are plotted at discrete x's, inset
//               from the edges by the plot's own padding, so the NEAREST point
//               wins and the ends stay reachable past their own dot.
//
// Everything is expressed as a FRACTION of the plot's width (0 → 1), never in
// pixels: the two clients draw the same chart at different widths (a stretched
// viewBox on one, a flex row on the other) and a fraction survives both.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THE FIGURE UNDER A HELD FINGER, formatted in the chart's own unit.
 *
 * Formatting it in the CLIENTS would mean two copies of every unit branch, and
 * a swim week reading "2.4 km" in a browser and "2 400 m" on a phone. So each
 * chart's model builds this (sportVolumeReading, lanePaceReading, …) and the
 * clients only place it.
 *
 * Nothing here is localized: `unit` is a symbol ("km", "/100m", "min") and the
 * client localizes the date and the efforts count around it.
 */
export interface ChartReading {
  index: number;
  /** ISO start of the 7-day bucket the point covers. */
  weekStart: string;
  /** Formatted in the chart's own unit. */
  value: string;
  unit: string;
  /** Efforts logged that week, or null on a chart that does not count them. */
  efforts: number | null;
  /** True when this point is the series' own best — the biggest week, the PR. */
  best: boolean;
}

/** How a chart's points occupy its width. See the file header. */
export type ScrubMode = "band" | "point";

export interface ScrubGeometry {
  /** How many points the chart draws. */
  count: number;
  mode: ScrubMode;
  /**
   * `point` only: the fraction of the width the FIRST and LAST plotted points
   * are inset by — the plot's own horizontal padding (e.g. 10 of a 326-wide
   * viewBox → 0.0307). Without it the ends are unreachable at one edge and
   * over-reachable at the other. Ignored by `band`.
   */
  inset?: number;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** A pointer's x, as a fraction of the plot's width. Guards the zero-width
 *  first frame, where a layout has been requested but not yet measured. */
export function scrubFraction(x: number, width: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return 0;
  return clamp01(x / width);
}

/**
 * Which point a press at `fraction` of the width reads.
 *
 * Returns −1 for a chart with no points — the caller shows no readout rather
 * than indexing into an empty series.
 */
export function scrubIndex(fraction: number, g: ScrubGeometry): number {
  const n = Math.floor(g.count);
  if (!Number.isFinite(n) || n <= 0) return -1;
  if (n === 1) return 0;
  const f = clamp01(Number.isFinite(fraction) ? fraction : 0);
  if (g.mode === "band") return Math.min(n - 1, Math.floor(f * n));
  const inset = clamp01(g.inset ?? 0);
  const span = 1 - inset * 2;
  const t = span <= 0 ? 0 : (f - inset) / span;
  return Math.min(n - 1, Math.max(0, Math.round(t * (n - 1))));
}

/**
 * Where point `index` sits, as a fraction of the width — the crosshair's
 * position. A bar reads at the CENTRE of its band; a line point reads at the
 * point itself, so the crosshair passes through the dot rather than beside it.
 */
export function scrubPosition(index: number, g: ScrubGeometry): number {
  const n = Math.floor(g.count);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const i = Math.min(Math.max(Math.round(index), 0), n - 1);
  if (g.mode === "band") return (i + 0.5) / n;
  if (n === 1) return 0.5;
  const inset = clamp01(g.inset ?? 0);
  return inset + (i / (n - 1)) * (1 - inset * 2);
}
