/**
 * Body-composition trend — a smoothed bodyweight line and its rate of change.
 *
 * Daily bodyweight is noisy (water, food, time of day); the honest signal is the
 * trend. This applies an EWMA to bodyMass readings and fits the weekly rate, so
 * the UI can show "down 0.4 kg/wk" instead of demotivating daily jitter. Pure.
 */

import type { Signal } from "./signals";
import { localDayKey } from "../day-key";

export interface WeightPoint {
  date: string; // YYYY-MM-DD
  raw: number;
  smoothed: number;
}

export interface WeightTrend {
  points: WeightPoint[];
  /** fitted change per week of the smoothed line (kg/wk; negative = losing) */
  ratePerWeek: number;
  latest: number | null;
  smoothedLatest: number | null;
}

const WEEK = 7 * 86_400_000;

/** EWMA-smoothed bodyweight trend + weekly rate from bodyMass signals. */
export function weightTrend(signals: Signal[], opts: { alpha?: number } = {}): WeightTrend {
  const alpha = opts.alpha ?? 0.25;
  const pts = signals
    .filter((s) => s.kind === "bodyMass")
    .map((s) => ({ t: Date.parse(s.ts), v: s.value }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);

  if (pts.length === 0) return { points: [], ratePerWeek: 0, latest: null, smoothedLatest: null };

  const points: WeightPoint[] = [];
  let ewma = pts[0]!.v;
  for (const p of pts) {
    ewma = alpha * p.v + (1 - alpha) * ewma;
    points.push({ date: localDayKey(p.t), raw: p.v, smoothed: Math.round(ewma * 100) / 100 });
  }

  // weekly rate = least-squares slope of smoothed vs time(weeks)
  let ratePerWeek = 0;
  if (pts.length >= 2) {
    const t0 = pts[0]!.t;
    const xs = pts.map((p) => (p.t - t0) / WEEK);
    const ys = points.map((p) => p.smoothed);
    const n = xs.length;
    const xBar = xs.reduce((a, b) => a + b, 0) / n;
    const yBar = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i]! - xBar; sxx += dx * dx; sxy += dx * (ys[i]! - yBar); }
    ratePerWeek = sxx > 0 ? Math.round((sxy / sxx) * 100) / 100 : 0;
  }

  return {
    points,
    ratePerWeek,
    latest: pts[pts.length - 1]!.v,
    smoothedLatest: points[points.length - 1]!.smoothed,
  };
}
