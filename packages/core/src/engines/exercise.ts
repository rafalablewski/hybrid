import type { LoggedSession } from "./session";
import { e1rm, blockBestE1rm, setsForVolume, isWorkingSet, e1rmSeries, paceSeries, type E1rmPoint, type PacePoint } from "./session";
import { runStats } from "./running";

// Per-exercise dashboard: everything about ONE movement over a chosen time
// window. Pure aggregation over the existing session helpers (e1rmSeries,
// paceSeries, runStats, workingSets) plus a date filter — so "open Bench Press"
// shows its whole strength history, or a cardio move shows its pace/distance.

export type ExercisePeriod = "8w" | "6m" | "1y" | "all";

const PERIOD_DAYS: Record<ExercisePeriod, number | null> = {
  "8w": 56,
  "6m": 182,
  "1y": 365,
  all: null,
};

/** The epoch-ms cutoff for a period (−Infinity for "all"), relative to `now`. */
export function periodCutoff(period: ExercisePeriod, now = Date.now()): number {
  const days = PERIOD_DAYS[period];
  return days == null ? -Infinity : now - days * 86_400_000;
}

/** The block kind a named movement is logged as (first match), default strength. */
export function exerciseKind(sessions: LoggedSession[], name: string): "strength" | "cardio" | "conditioning" {
  for (const s of sessions) for (const b of s.blocks) if (b.name === name) return b.kind;
  return "strength";
}

export interface BestSet {
  load: number;
  reps: number;
  e1rm: number;
  when: string;
}

export interface StrengthExerciseStats {
  kind: "strength";
  name: string;
  period: ExercisePeriod;
  /** sessions in the window that trained this lift */
  sessions: number;
  /** working sets performed in the window (warm-ups excluded) */
  workingSets: number;
  totalReps: number;
  /** tonnage (load × reps) of working sets in the window */
  volume: number;
  /** best estimated 1RM in the window (0 if none) */
  bestE1rm: number;
  /** best estimated 1RM across ALL history (for context vs the window) */
  bestE1rmAllTime: number;
  /** heaviest working load lifted in the window */
  heaviestLoad: number;
  bestSet?: BestSet;
  /** e1RM trend in the window, oldest → newest */
  e1rm: E1rmPoint[];
  lastPerformed?: string;
}

export interface CardioExerciseStats {
  kind: "cardio";
  name: string;
  period: ExercisePeriod;
  efforts: number;
  distanceKm: number;
  minutes: number;
  longestKm: number;
  bestPaceSecPerKm: number | null;
  pace: PacePoint[];
  lastPerformed?: string;
}

export type ExerciseStats = StrengthExerciseStats | CardioExerciseStats;

const num = (s: string | undefined): number => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};

const inWindow = (sessions: LoggedSession[], cutoff: number, now: number): LoggedSession[] =>
  sessions.filter((s) => {
    const t = new Date(s.startedAt).getTime();
    return t > cutoff && t <= now;
  });

/**
 * The full dashboard for one movement over `period`. Strength returns e1RM
 * trend + volume/sets/PR stats; cardio returns distance/pace/longest + a pace
 * trend. Conditioning falls back to the strength shape's empty stats (no special
 * analytics yet). Reuses the canonical series helpers so it can't drift.
 */
export function exerciseDashboard(
  sessions: LoggedSession[],
  name: string,
  period: ExercisePeriod = "all",
  now = Date.now(),
  includeWarmups = false,
): ExerciseStats {
  const cutoff = periodCutoff(period, now);
  const win = inWindow(sessions, cutoff, now);
  const kind = exerciseKind(sessions, name);

  if (kind === "cardio") {
    const stat = runStats(win).find((r) => r.move === name);
    const efforts = stat?.efforts ?? 0;
    let last: string | undefined;
    for (const s of win) for (const b of s.blocks) if (b.name === name && b.kind === "cardio") last = !last || s.startedAt > last ? s.startedAt : last;
    return {
      kind: "cardio",
      name,
      period,
      efforts,
      distanceKm: stat?.distanceKm ?? 0,
      minutes: stat?.minutes ?? 0,
      longestKm: stat?.longestKm ?? 0,
      bestPaceSecPerKm: stat?.bestPaceSecPerKm ?? null,
      pace: paceSeries(win, name),
      lastPerformed: last,
    };
  }

  let sessionsCount = 0;
  let setCount = 0;
  let totalReps = 0;
  let volume = 0;
  let bestE1rm = 0;
  let heaviestLoad = 0;
  let bestSet: BestSet | undefined;
  let last: string | undefined;
  for (const s of win) {
    let trainedHere = false;
    for (const b of s.blocks) {
      if (b.kind !== "strength" || b.name !== name) continue;
      trainedHere = true;
      for (const set of setsForVolume(b, includeWarmups)) {
        const load = num(set.load);
        const reps = num(set.reps);
        if (Number.isNaN(load) || Number.isNaN(reps) || reps <= 0) continue;
        setCount += 1;
        totalReps += reps;
        volume += load * reps;
        heaviestLoad = Math.max(heaviestLoad, load);
        // e1RM / best-set stay warm-up-excluded regardless of the volume setting
        // (a light ramp can't be your best set).
        if (isWorkingSet(set)) {
          const est = e1rm(load, reps);
          if (est > bestE1rm) {
            bestE1rm = est;
            bestSet = { load, reps, e1rm: Math.round(est), when: s.startedAt };
          }
        }
      }
    }
    if (trainedHere) {
      sessionsCount += 1;
      if (!last || s.startedAt > last) last = s.startedAt;
    }
  }

  // All-time best for context (independent of the window).
  let bestAll = 0;
  for (const s of sessions) for (const b of s.blocks) if (b.kind === "strength" && b.name === name) bestAll = Math.max(bestAll, blockBestE1rm(b));

  return {
    kind: "strength",
    name,
    period,
    sessions: sessionsCount,
    workingSets: setCount,
    totalReps,
    volume: Math.round(volume),
    bestE1rm: Math.round(bestE1rm),
    bestE1rmAllTime: Math.round(bestAll),
    heaviestLoad,
    bestSet,
    e1rm: e1rmSeries(win, name),
    lastPerformed: last,
  };
}
