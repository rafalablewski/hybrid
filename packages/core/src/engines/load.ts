/**
 * Training load & ACWR — the canonical load-management math coaches live in.
 *
 * Turns logged sessions into an sRPE-style daily load (duration × session RPE),
 * then the rolling acute:chronic workload ratio (7-day load vs 28-day weekly
 * average), monotony and strain. ACWR is presented WITH its caveats (it's a
 * contested metric — read alongside monotony and absolute load, never alone).
 * Pure data + math.
 */

import type { LoggedSession } from "./session";

const DAY = 86_400_000;
const num = (s: string | undefined) => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};

/**
 * sRPE-style session load in arbitrary units: each block's duration (min) ×
 * its RPE. Strength duration is approximated from set count (~3.5 min/set incl.
 * rest) and the top set RPE; conditioning uses its minutes × RPE.
 */
export function sessionLoad(s: LoggedSession): number {
  let load = 0;
  for (const b of s.blocks) {
    if (b.kind === "strength") {
      const rpes = b.sets.map((x) => num(x.rpe)).filter((n) => Number.isFinite(n));
      const rpe = rpes.length ? Math.max(...rpes) : 7;
      load += b.sets.length * 3.5 * rpe;
    } else if (b.kind === "cardio") {
      load += (b.minutes ?? 30) * (b.rpe ?? 6);
    } else {
      const minutes =
        b.minutes ?? (b.work && b.rest && b.rounds ? ((b.work + b.rest) * b.rounds) / 60 : 12);
      load += minutes * (b.rpe ?? 7);
    }
  }
  return Math.round(load);
}

export type AcwrBand = "detraining" | "sweet-spot" | "caution" | "danger" | "insufficient";

export interface LoadState {
  /** total load over the last 7 days */
  acute: number;
  /** average weekly load over the last 28 days */
  chronicWeekly: number;
  /**
   * COUPLED acute:chronic-weekly ratio (acute is INSIDE chronic). Retained for
   * back-compat and as one input — but it is autocorrelated by construction
   * (Lolli 2019; Impellizzeri 2020), so do not read it alone. Prefer `acwrEwma`.
   */
  acwr: number;
  /**
   * UNCOUPLED ACWR — acute(7d) vs. the average weekly load of the PRIOR 21 days
   * (days 7..27), so the acute window is no longer part of the denominator.
   * Removes the mathematical artefact in the coupled ratio.
   */
  acwrUncoupled: number;
  /**
   * EWMA ACWR (Williams et al. 2017) — exponentially-weighted acute (N=7) vs.
   * chronic (N=28) loads. The recommended primary signal: it respects the decay
   * structure of fatigue vs. fitness instead of a flat rolling window.
   */
  acwrEwma: number;
  /**
   * Week-over-week load change (this week vs. last), as a fraction. Large
   * positive ramps (>~0.5) flag a spike independent of any ratio.
   */
  rampRate: number;
  /** band derived from the COUPLED ratio (kept for back-compat). */
  band: AcwrBand;
  /** band derived from the recommended EWMA ratio — read this one. */
  bandEwma: AcwrBand;
  /** mean ÷ SD of daily load over the last 7 days (variety of the week) */
  monotony: number;
  /** weekly load × monotony — the injury-associated "strain" */
  strain: number;
  /** load per week for the last 4 weeks, newest first */
  weekly: { weeksAgo: number; load: number }[];
  enoughHistory: boolean;
}

/** Continuous → coarse band. Bands are a label over a continuous signal, not a
 *  cliff: the same thresholds apply to whichever ratio is passed in. */
function acwrBand(ratio: number, enoughHistory: boolean): AcwrBand {
  if (!enoughHistory) return "insufficient";
  if (ratio < 0.8) return "detraining";
  if (ratio <= 1.3) return "sweet-spot";
  if (ratio <= 1.5) return "caution";
  return "danger";
}

/**
 * Exponentially-weighted moving average of a daily-load series given a window
 * size N (λ = 2/(N+1)). `loads` is newest-first (index 0 = today); we fold from
 * the oldest day forward so the most recent day dominates.
 */
function ewma(loads: number[], n: number): number {
  const lambda = 2 / (n + 1);
  let acc = 0;
  for (let i = loads.length - 1; i >= 0; i--) {
    acc = (loads[i] ?? 0) * lambda + acc * (1 - lambda);
  }
  return acc;
}

function dailyLoads(sessions: LoggedSession[], now: number, days: number): number[] {
  const out = new Array(days).fill(0);
  for (const s of sessions) {
    const d = Math.floor((now - Date.parse(s.startedAt)) / DAY);
    if (d >= 0 && d < days) out[d] += sessionLoad(s);
  }
  return out; // index 0 = today, 1 = yesterday, …
}

/** Acute:chronic workload ratio + monotony/strain from logged sessions. */
export function computeLoad(sessions: LoggedSession[], now = Date.now()): LoadState {
  const d28 = dailyLoads(sessions, now, 28);
  const acute = d28.slice(0, 7).reduce((a, b) => a + b, 0);
  const chronicTotal = d28.reduce((a, b) => a + b, 0);
  const chronicWeekly = chronicTotal / 4;
  const acwr = chronicWeekly > 0 ? acute / chronicWeekly : 0;

  // UNCOUPLED: denominator is the prior 21 days only (days 7..27), as weekly.
  const priorWeekly = d28.slice(7, 28).reduce((a, b) => a + b, 0) / 3;
  const acwrUncoupled = priorWeekly > 0 ? acute / priorWeekly : 0;

  // EWMA acute (N=7) vs. chronic (N=28) — the recommended primary ratio.
  const ewmaAcute = ewma(d28.slice(0, 7), 7);
  const ewmaChronic = ewma(d28, 28);
  const acwrEwma = ewmaChronic > 0 ? ewmaAcute / ewmaChronic : 0;

  // monotony over the last 7 days (zeros included → rest-day variety counts)
  const week = d28.slice(0, 7);
  const mean = week.reduce((a, b) => a + b, 0) / 7;
  const variance = week.reduce((a, b) => a + (b - mean) ** 2, 0) / 7;
  const sd = Math.sqrt(variance);
  const monotony = sd > 0 ? mean / sd : mean > 0 ? 2 : 0;
  const strain = Math.round(acute * monotony);

  const weekly = [0, 1, 2, 3].map((w) => ({
    weeksAgo: w,
    load: d28.slice(w * 7, w * 7 + 7).reduce((a, b) => a + b, 0),
  }));

  // Week-over-week ramp: this week vs. last week (fraction change).
  const thisWeek = weekly[0]?.load ?? 0;
  const lastWeek = weekly[1]?.load ?? 0;
  const rampRate = lastWeek > 0 ? (thisWeek - lastWeek) / lastWeek : 0;

  const oldestDaysAgo = sessions.length
    ? Math.max(...sessions.map((s) => Math.floor((now - Date.parse(s.startedAt)) / DAY)))
    : 0;
  const enoughHistory = oldestDaysAgo >= 14 && chronicWeekly > 0;

  return {
    acute: Math.round(acute),
    chronicWeekly: Math.round(chronicWeekly),
    acwr: Math.round(acwr * 100) / 100,
    acwrUncoupled: Math.round(acwrUncoupled * 100) / 100,
    acwrEwma: Math.round(acwrEwma * 100) / 100,
    rampRate: Math.round(rampRate * 100) / 100,
    band: acwrBand(acwr, enoughHistory),
    bandEwma: acwrBand(acwrEwma, enoughHistory),
    monotony: Math.round(monotony * 100) / 100,
    strain,
    weekly,
    enoughHistory,
  };
}
