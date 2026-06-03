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
  /** acute : chronic-weekly ratio (0 when no chronic base) */
  acwr: number;
  band: AcwrBand;
  /** mean ÷ SD of daily load over the last 7 days (variety of the week) */
  monotony: number;
  /** weekly load × monotony — the injury-associated "strain" */
  strain: number;
  /** load per week for the last 4 weeks, newest first */
  weekly: { weeksAgo: number; load: number }[];
  enoughHistory: boolean;
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

  const oldestDaysAgo = sessions.length
    ? Math.max(...sessions.map((s) => Math.floor((now - Date.parse(s.startedAt)) / DAY)))
    : 0;
  const enoughHistory = oldestDaysAgo >= 14 && chronicWeekly > 0;

  const band: AcwrBand = !enoughHistory
    ? "insufficient"
    : acwr < 0.8
      ? "detraining"
      : acwr <= 1.3
        ? "sweet-spot"
        : acwr <= 1.5
          ? "caution"
          : "danger";

  return {
    acute: Math.round(acute),
    chronicWeekly: Math.round(chronicWeekly),
    acwr: Math.round(acwr * 100) / 100,
    band,
    monotony: Math.round(monotony * 100) / 100,
    strain,
    weekly,
    enoughHistory,
  };
}
