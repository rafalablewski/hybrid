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
import { estimateSessionEnergy } from "../energy";

const DAY = 86_400_000;
const num = (s: string | undefined) => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};

/**
 * sRPE-style session load in arbitrary units: each block's duration (min) ×
 * its RPE. Strength duration is approximated from set count (~3.5 min/set incl.
 * rest) and the top set RPE; conditioning uses its minutes × RPE.
 *
 * When a device recorded the session (see session-device.ts), its MEASURED
 * duration replaces the heuristic total: the per-block minutes are scaled to
 * sum to it, keeping each block's share of the session and its RPE weight. The
 * intensity is still the athlete's — only the clock comes from the wrist.
 */
export function sessionLoad(s: LoggedSession): number {
  let load = 0;
  let minutes = 0;
  for (const b of s.blocks) {
    const m = blockMinutes(b);
    load += m * blockRpe(b);
    minutes += m;
  }
  const measured = s.device?.durationMin;
  if (measured != null && measured > 0 && minutes > 0) load *= measured / minutes;
  return Math.round(load);
}

/** The RPE the load model reads off a block — the top logged set RPE for
 *  strength, the block's own for cardio/conditioning, each with the default
 *  the sRPE model has always assumed when none was entered. */
function blockRpe(b: LoggedSession["blocks"][number]): number {
  if (b.kind === "strength") {
    const rpes = b.sets.map((x) => num(x.rpe)).filter((n) => Number.isFinite(n));
    return rpes.length ? Math.max(...rpes) : 7;
  }
  if (b.kind === "cardio") return b.rpe ?? 6;
  return b.rpe ?? 7;
}

/**
 * Total MINUTES of a session: the device's measurement when one recorded it,
 * else the same duration heuristic sessionLoad uses. Exported because
 * sessionLoad is Σ (minutes × RPE), so load ÷ minutes is exactly the
 * minutes-weighted mean RPE — the OBJECTIVE session effort the effort model
 * compares the athlete's own answer against (see engines/effort.ts). Deriving
 * it here rather than re-deriving it there keeps the two from drifting, and
 * scaling the load by the same measured total keeps that identity exact.
 */
export function sessionMinutes(s: LoggedSession): number {
  const measured = s.device?.durationMin;
  if (measured != null && measured > 0) return measured;
  let m = 0;
  for (const b of s.blocks) m += blockMinutes(b);
  return m;
}

/** Approximate MINUTES of a block, mirroring the duration heuristic sessionLoad
 *  uses (strength ≈ 3.5 min/set incl. rest; cardio/conditioning from minutes or
 *  the work/rest/rounds interval). Kept beside sessionLoad so the two never drift. */
function blockMinutes(b: LoggedSession["blocks"][number]): number {
  if (b.kind === "strength") return b.sets.length * 3.5;
  if (b.kind === "cardio") return b.minutes ?? 30;
  return b.minutes ?? (b.work && b.rest && b.rounds ? ((b.work + b.rest) * b.rounds) / 60 : 12);
}

/**
 * Rough energy expenditure (kcal) of one logged session — the "eat for the work
 * you did" figure the nutrition engine adds to a training-day target. An
 * estimate, not a measurement. Defaults to a 75 kg athlete when bodyweight is
 * unknown, because a nutrition target has to produce SOME number.
 *
 * The MET model lives in energy.ts, which reads the activity's measured pace and
 * the sport catalog before falling back to RPE; this stays as the nutrition
 * engine's entry point (its signature and its 75 kg default are relied on by the
 * fuel target) but delegates the physiology, so there is one MET model in the
 * codebase rather than two that drift.
 *
 * That default is exactly why the WRAPPED does not use this function: a summary
 * shown to the athlete must not present a 75 kg stranger's calories as theirs,
 * so `estimateSessionEnergy` returns null instead. Same model, different honesty
 * budget — a target that must exist vs a figure that may be omitted.
 *
 * A session matched to a device skips the model entirely: eat for the work the
 * watch actually measured, not for the work a MET table guessed at.
 */
export function sessionEnergyKcal(s: LoggedSession, bodyMassKg = 75): number {
  const measured = s.device?.kcal;
  if (measured != null && measured > 0) return Math.round(measured);
  const kg = bodyMassKg > 0 ? bodyMassKg : 75;
  const est = estimateSessionEnergy(s.blocks, {
    bodyweightKg: kg,
    // Strength blocks carry no minutes of their own, so hand the model the same
    // set-count duration heuristic the rest of this file uses.
    strengthMinutes: s.blocks.reduce((m, b) => (b.kind === "strength" ? m + blockMinutes(b) : m), 0),
  });
  return est?.kcal ?? 0;
}

/** Total estimated training energy (kcal) burned across every session on the
 *  day containing `now` — today's fuel bump for the nutrition target. */
export function trainingEnergyOnDay(sessions: LoggedSession[], bodyMassKg = 75, now = Date.now()): number {
  const key = new Date(now).toDateString();
  return sessions
    .filter((s) => new Date(Date.parse(s.startedAt)).toDateString() === key)
    .reduce((sum, s) => sum + sessionEnergyKcal(s, bodyMassKg), 0);
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
  /**
   * The last 7 days' load, one entry per day, index 0 = today. These are the
   * ITEMS `acute` is the sum of and `monotony` is the spread of — carried out
   * of the engine so an explainer can show the athlete the same seven numbers
   * the ratio was computed from rather than re-deriving them from rounded
   * totals. See load-explain.ts.
   */
  daily: number[];
  /** mean of `daily` — the numerator of monotony, unrounded intent, 2dp. */
  dailyMean: number;
  /** population SD of `daily` — the denominator of monotony, 2dp. */
  dailySd: number;
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
    daily: week.map((v) => Math.round(v)),
    dailyMean: Math.round(mean * 100) / 100,
    dailySd: Math.round(sd * 100) / 100,
    enoughHistory,
  };
}
