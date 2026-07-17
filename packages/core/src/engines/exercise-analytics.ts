/**
 * Exercise analytics v2 — the advanced per-movement aggregators behind the
 * (free-for-all) Exercises screen. Everything is PURE math over LoggedSession[]
 * so both clients render the same numbers offline: PR-flagged e1RM trend,
 * rep-max matrix, load×reps map with e1RM isolines, weekly tonnage split by
 * effort, intensity-zone distribution, the weeks×rep-range tonnage surface,
 * per-movement consistency, the cardio pace curve / recent-run deltas, and the
 * this-block-vs-last comparison. Designed in
 * reference/exercise-analytics-designs.html (concepts 1–6, 8–10; rankings — 7 —
 * is deliberately not built, see capabilities).
 */

import type { LoggedSession } from "./session";
import { e1rm, effectiveSetLoadKg, isCardio, isWorkingSet } from "./session";
import { gymExercise } from "../exercise-db";
import { bwAt, type BodyweightInput } from "../bodyweight";
import { periodCutoff, exerciseKind, type ExercisePeriod } from "./exercise";
import { trainingHeatmap, type HeatCell } from "./calendar";
import { localMondayMs, addLocalDays, localDayKey } from "../day-key";

const DAY = 86_400_000;
/** "Recent" everywhere below = the last 8 weeks (matches the 8w period). */
const RECENT_MS = 56 * DAY;

const num = (s: string | undefined): number => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};

/** One working set of a rep-measured lift, flattened + effective-load resolved. */
interface LiftSet {
  t: number;
  date: string;
  loadKg: number;
  reps: number;
  rpe: number | null;
}

/** Every WORKING set of `name` (reps-measured lifts only — holds/carries have no
 *  tonnage or e1RM), oldest → newest, with bodyweight-effective loads. */
function liftSets(sessions: LoggedSession[], name: string, bw?: BodyweightInput): LiftSet[] {
  if ((gymExercise(name)?.measure ?? "reps") !== "reps") return [];
  const out: LiftSet[] = [];
  for (const s of sessions) {
    const t = new Date(s.startedAt).getTime();
    const kg = bwAt(bw, s.startedAt);
    for (const b of s.blocks) {
      if (b.kind !== "strength" || b.name !== name) continue;
      for (const set of b.sets) {
        if (!isWorkingSet(set)) continue;
        const loadKg = effectiveSetLoadKg(name, set.load, kg);
        const reps = num(set.reps);
        if (loadKg <= 0 || Number.isNaN(reps) || reps <= 0) continue;
        const rpe = num(set.rpe);
        out.push({ t, date: s.startedAt, loadKg, reps, rpe: Number.isNaN(rpe) ? null : rpe });
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Every cardio effort of `name` with a derivable pace, oldest → newest. */
function cardioEfforts(sessions: LoggedSession[], name: string): { t: number; date: string; km: number; secPerKm: number }[] {
  const out: { t: number; date: string; km: number; secPerKm: number }[] = [];
  for (const s of sessions) {
    const t = new Date(s.startedAt).getTime();
    for (const b of s.blocks)
      if (isCardio(b) && b.name === name && b.distance && b.distance > 0 && b.minutes && b.minutes > 0)
        out.push({ t, date: s.startedAt, km: b.distance, secPerKm: (b.minutes * 60) / b.distance });
  }
  return out.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------- 1. PR trend

export interface PrPoint {
  date: string;
  e1rm: number;
  /** true when this session set a new ALL-TIME e1RM (vs everything before it). */
  pr: boolean;
}

/** Per-session best e1RM in the window, each point flagged as a PR when it beat
 *  every session before it (all history, not just the window). */
export function e1rmTrendWithPRs(
  sessions: LoggedSession[],
  name: string,
  period: ExercisePeriod = "all",
  now = Date.now(),
  bw?: BodyweightInput,
): PrPoint[] {
  const cutoff = periodCutoff(period, now);
  const bySession = new Map<string, { t: number; best: number }>();
  for (const s of liftSets(sessions, name, bw)) {
    const est = e1rm(s.loadKg, s.reps);
    const row = bySession.get(s.date);
    if (!row) bySession.set(s.date, { t: s.t, best: est });
    else row.best = Math.max(row.best, est);
  }
  const rows = [...bySession.entries()].sort((a, b) => a[1].t - b[1].t);
  const pts: PrPoint[] = [];
  let runningBest = 0;
  for (const [date, { t, best }] of rows) {
    const pr = best > runningBest + 1e-9 && runningBest > 0;
    runningBest = Math.max(runningBest, best);
    if (t > cutoff && t <= now) pts.push({ date, e1rm: Math.round(best), pr });
  }
  return pts;
}

// ---------------------------------------------------------- 2. rep-max matrix

export interface RepMax {
  reps: number;
  loadKg: number;
  e1rm: number;
  when: string;
  /** set within the last 8 weeks — a fresh record. */
  recent: boolean;
}

/** Best-ever load at each rep count 1..10 (null = never performed). */
export function repMaxMatrix(
  sessions: LoggedSession[],
  name: string,
  now = Date.now(),
  bw?: BodyweightInput,
): (RepMax | null)[] {
  const cells: (RepMax | null)[] = Array.from({ length: 10 }, () => null);
  for (const s of liftSets(sessions, name, bw)) {
    if (s.t > now) continue;
    const r = Math.floor(s.reps);
    if (r < 1 || r > 10) continue;
    const cur = cells[r - 1];
    if (!cur || s.loadKg > cur.loadKg) cells[r - 1] = { reps: r, loadKg: s.loadKg, e1rm: Math.round(e1rm(s.loadKg, r)), when: s.date, recent: now - s.t <= RECENT_MS };
  }
  return cells;
}

// ------------------------------------------------------ 3. load×reps + isolines

export interface ScatterPoint {
  reps: number;
  loadKg: number;
  recent: boolean;
}

export interface LoadRepsMap {
  /** working sets (capped to the most recent `cap`), oldest → newest. */
  points: ScatterPoint[];
  /** e1RM isoline levels (kg) — nice round equal-strength curves to draw. */
  isolines: number[];
  maxLoadKg: number;
}

/** The whole training history of a lift as a load×reps cloud + isoline levels. */
export function loadRepsScatter(
  sessions: LoggedSession[],
  name: string,
  now = Date.now(),
  bw?: BodyweightInput,
  cap = 400,
): LoadRepsMap {
  const all = liftSets(sessions, name, bw).filter((s) => s.t <= now);
  const kept = all.slice(-cap);
  let best = 0;
  let maxLoad = 0;
  for (const s of all) {
    best = Math.max(best, e1rm(s.loadKg, s.reps));
    maxLoad = Math.max(maxLoad, s.loadKg);
  }
  const nice = (v: number) => Math.max(10, Math.round(v / 10) * 10);
  const isolines = best > 0 ? [...new Set([nice(best * 0.7), nice(best * 0.85), nice(best)])] : [];
  return {
    points: kept.map((s) => ({ reps: Math.min(12, Math.floor(s.reps)), loadKg: s.loadKg, recent: now - s.t <= RECENT_MS })),
    isolines,
    maxLoadKg: maxLoad,
  };
}

// ------------------------------------------------------- 4. weekly tonnage

export interface WeekTonnage {
  /** YYYY-MM-DD of the week's LOCAL Monday. */
  weekStart: string;
  baseKg: number;
  /** tonnage from hard sets (RPE ≥ 8). Sets without an RPE count as base. */
  hardKg: number;
}

/** Weekly tonnage for the last `weeks` calendar weeks, split by effort. */
export function weeklyTonnage(
  sessions: LoggedSession[],
  name: string,
  weeks = 12,
  now = Date.now(),
  bw?: BodyweightInput,
): WeekTonnage[] {
  const startMs = addLocalDays(localMondayMs(now), -(weeks - 1) * 7);
  const rows: WeekTonnage[] = Array.from({ length: weeks }, (_, w) => ({ weekStart: localDayKey(addLocalDays(startMs, w * 7)), baseKg: 0, hardKg: 0 }));
  for (const s of liftSets(sessions, name, bw)) {
    if (s.t > now || s.t < startMs) continue;
    // Index by the set's LOCAL Monday so week boundaries match the heatmap.
    const w = rows.findIndex((r) => r.weekStart === localDayKey(localMondayMs(s.t)));
    if (w < 0) continue;
    const kg = s.loadKg * s.reps;
    if (s.rpe != null && s.rpe >= 8) rows[w]!.hardKg += kg;
    else rows[w]!.baseKg += kg;
  }
  return rows.map((r) => ({ ...r, baseKg: Math.round(r.baseKg), hardKg: Math.round(r.hardKg) }));
}

// --------------------------------------------------- 5. intensity distribution

export interface IntensityZone {
  /** "<60" | "60" | "70" | "80" | "90" — lower bound of the %e1RM band. */
  zone: "<60" | "60" | "70" | "80" | "90";
  count: number;
  /** share of working sets, 0..1. */
  share: number;
}

/**
 * Where the lift's working sets live as a % of e1RM. Each set is measured
 * against the athlete's best e1RM UP TO that session (a rolling all-time best),
 * so a 100 kg set from a weaker January reads as the high-intensity work it was.
 */
export function intensityDistribution(
  sessions: LoggedSession[],
  name: string,
  period: ExercisePeriod = "1y",
  now = Date.now(),
  bw?: BodyweightInput,
): IntensityZone[] {
  const cutoff = periodCutoff(period, now);
  const counts = [0, 0, 0, 0, 0];
  let runningBest = 0;
  for (const s of liftSets(sessions, name, bw)) {
    if (s.t > now) continue;
    runningBest = Math.max(runningBest, e1rm(s.loadKg, s.reps));
    if (s.t <= cutoff || runningBest <= 0) continue;
    const pct = s.loadKg / runningBest;
    const bin = pct < 0.6 ? 0 : pct < 0.7 ? 1 : pct < 0.8 ? 2 : pct < 0.9 ? 3 : 4;
    counts[bin] = (counts[bin] ?? 0) + 1;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  const zones: IntensityZone["zone"][] = ["<60", "60", "70", "80", "90"];
  return zones.map((zone, i) => ({ zone, count: counts[i]!, share: total > 0 ? counts[i]! / total : 0 }));
}

// ------------------------------------------------------ 6. tonnage surface

export interface TonnageSurface {
  /** YYYY-MM-DD Monday labels, oldest → newest. */
  weeks: string[];
  /** rep-range bin labels, low reps first. */
  bins: string[];
  /** grid[bin][week] tonnage, kg. */
  grid: number[][];
  maxKg: number;
}

const SURFACE_BINS = [
  { label: "1–3", min: 1, max: 3 },
  { label: "4–6", min: 4, max: 6 },
  { label: "7–10", min: 7, max: 10 },
  { label: "11+", min: 11, max: Infinity },
] as const;

/** The 3D landscape: weekly tonnage per rep-range bin (weeks × rep range). */
export function tonnageSurface(
  sessions: LoggedSession[],
  name: string,
  weeks = 12,
  now = Date.now(),
  bw?: BodyweightInput,
): TonnageSurface {
  const startMs = addLocalDays(localMondayMs(now), -(weeks - 1) * 7);
  const weekKeys = Array.from({ length: weeks }, (_, w) => localDayKey(addLocalDays(startMs, w * 7)));
  const grid = SURFACE_BINS.map(() => weekKeys.map(() => 0));
  for (const s of liftSets(sessions, name, bw)) {
    if (s.t > now || s.t < startMs) continue;
    const w = weekKeys.indexOf(localDayKey(localMondayMs(s.t)));
    if (w < 0) continue;
    const bin = SURFACE_BINS.findIndex((b) => s.reps >= b.min && s.reps <= b.max);
    if (bin < 0) continue;
    const row = grid[bin]!;
    row[w] = (row[w] ?? 0) + s.loadKg * s.reps;
  }
  const rounded = grid.map((row) => row.map((v) => Math.round(v)));
  return { weeks: weekKeys, bins: SURFACE_BINS.map((b) => b.label), grid: rounded, maxKg: Math.max(0, ...rounded.flat()) };
}

// -------------------------------------------------------- 8. consistency

export interface ExerciseConsistency {
  /** GitHub-style columns (Mon→Sun × weeks) of THIS movement's training days. */
  heat: HeatCell[][];
  /** consecutive calendar weeks (through this or last week) with ≥1 session. */
  weekStreak: number;
  /** sessions of this movement per week over the window, 1 decimal. */
  perWeek: number;
  /** longest gap between two sessions of the movement in the window, days. */
  longestGapDays: number;
  /** days in the window that trained the movement. */
  activeDays: number;
}

/** Adherence for ONE movement: its heat calendar + streak/frequency/gap stats. */
export function exerciseConsistency(
  sessions: LoggedSession[],
  name: string,
  weeks = 26,
  now = Date.now(),
): ExerciseConsistency {
  const mine = sessions.filter((s) => {
    const t = new Date(s.startedAt).getTime();
    return t <= now && s.blocks.some((b) => b.name === name);
  });
  const heat = trainingHeatmap(mine, weeks, now);

  // Week streak — walk back from the current week; the current week may still
  // be empty (it's mid-week) without breaking the streak.
  const weekHas = heat.map((col) => col.some((c) => c.count > 0));
  let weekStreak = 0;
  for (let i = weekHas.length - 1; i >= 0; i--) {
    if (weekHas[i]) weekStreak += 1;
    else if (i === weekHas.length - 1) continue;
    else break;
  }

  const startMs = addLocalDays(localMondayMs(now), -(weeks - 1) * 7);
  const dayTimes = [...new Set(mine.map((s) => localDayKey(s.startedAt)))]
    .sort()
    .map((k) => new Date(`${k}T12:00:00`).getTime())
    .filter((t) => t >= startMs);
  let longestGap = 0;
  for (let i = 1; i < dayTimes.length; i++) longestGap = Math.max(longestGap, Math.round((dayTimes[i]! - dayTimes[i - 1]!) / DAY) - 1);
  const inWindow = mine.filter((s) => new Date(s.startedAt).getTime() >= startMs);
  return {
    heat,
    weekStreak,
    perWeek: Math.round((inWindow.length / weeks) * 10) / 10,
    longestGapDays: longestGap,
    activeDays: dayTimes.length,
  };
}

// --------------------------------------------------------- 9. pace curve

export interface PaceBand {
  /** band label — "≤1K" | "2K" | "5K" | "10K" | "Half+". */
  label: string;
  bestAllSec: number | null;
  /** best in the last 8 weeks. */
  bestRecentSec: number | null;
}

const PACE_BANDS = [
  { label: "≤1K", min: 0, max: 1.5 },
  { label: "2K", min: 1.5, max: 3 },
  { label: "5K", min: 3, max: 7 },
  { label: "10K", min: 7, max: 14 },
  { label: "Half+", min: 14, max: Infinity },
] as const;

/** Best pace per distance band — all-time vs the current block (last 8 weeks).
 *  Bands the athlete has never covered are dropped. */
export function paceCurve(sessions: LoggedSession[], name: string, now = Date.now()): PaceBand[] {
  const bands = PACE_BANDS.map((b) => ({ label: b.label, bestAllSec: null as number | null, bestRecentSec: null as number | null }));
  for (const e of cardioEfforts(sessions, name)) {
    if (e.t > now) continue;
    const i = PACE_BANDS.findIndex((b) => e.km >= b.min && e.km < b.max);
    if (i < 0) continue;
    const sec = Math.round(e.secPerKm);
    const row = bands[i]!;
    if (row.bestAllSec == null || sec < row.bestAllSec) row.bestAllSec = sec;
    if (now - e.t <= RECENT_MS && (row.bestRecentSec == null || sec < row.bestRecentSec)) row.bestRecentSec = sec;
  }
  return bands.filter((b) => b.bestAllSec != null);
}

// ---------------------------------------------------- 9b. recent-run deltas

export interface RunDelta {
  date: string;
  km: number;
  secPerKm: number;
  /** vs the average pace of these runs — negative = faster than your average. */
  deltaSec: number;
}

export interface RunDeltas {
  avgSec: number | null;
  /** the last `count` efforts, oldest → newest. */
  runs: RunDelta[];
}

/** The last runs against their own average pace (the in-app stand-in for km
 *  splits, which aren't logged): teal under the line, terracotta over. */
export function recentRunDeltas(sessions: LoggedSession[], name: string, count = 10, now = Date.now()): RunDeltas {
  const efforts = cardioEfforts(sessions, name).filter((e) => e.t <= now).slice(-count);
  if (efforts.length === 0) return { avgSec: null, runs: [] };
  const avg = efforts.reduce((a, e) => a + e.secPerKm, 0) / efforts.length;
  return {
    avgSec: Math.round(avg),
    runs: efforts.map((e) => ({ date: e.date, km: Math.round(e.km * 10) / 10, secPerKm: Math.round(e.secPerKm), deltaSec: Math.round(e.secPerKm - avg) })),
  };
}

// --------------------------------------------------------- 10. block compare

export interface StrengthBlockMetrics {
  sessions: number;
  volumeKg: number;
  bestE1rm: number;
  hardSets: number;
}

export interface CardioBlockMetrics {
  runs: number;
  distanceKm: number;
  avgPaceSec: number | null;
  bestPaceSec: number | null;
}

export type BlockCompare =
  | { kind: "strength"; weeks: number; weeklyCur: number[]; weeklyPrev: number[]; cur: StrengthBlockMetrics; prev: StrengthBlockMetrics }
  | { kind: "cardio"; weeks: number; weeklyCur: number[]; weeklyPrev: number[]; cur: CardioBlockMetrics; prev: CardioBlockMetrics };

/** This block vs the one before it — the last `weeks` weeks against the
 *  `weeks` before them, plus week-aligned weekly series (tonnage kg / km). */
export function blockCompare(
  sessions: LoggedSession[],
  name: string,
  weeks = 8,
  now = Date.now(),
  bw?: BodyweightInput,
): BlockCompare {
  const span = weeks * 7 * DAY;
  const mid = now - span;
  const lo = now - 2 * span;
  const weekIdx = (t: number, end: number): number => Math.min(weeks - 1, Math.floor((t - (end - span)) / (7 * DAY)));

  if (exerciseKind(sessions, name) === "cardio") {
    const mk = (): { weekly: number[]; m: CardioBlockMetrics; paces: number[] } => ({ weekly: Array(weeks).fill(0), m: { runs: 0, distanceKm: 0, avgPaceSec: null, bestPaceSec: null }, paces: [] });
    const cur = mk();
    const prev = mk();
    for (const e of cardioEfforts(sessions, name)) {
      if (e.t <= lo || e.t > now) continue;
      const side = e.t > mid ? cur : prev;
      const wi = weekIdx(e.t, e.t > mid ? now : mid);
      side.weekly[wi] = (side.weekly[wi] ?? 0) + e.km;
      side.m.runs += 1;
      side.m.distanceKm += e.km;
      side.paces.push(e.secPerKm);
      if (side.m.bestPaceSec == null || e.secPerKm < side.m.bestPaceSec) side.m.bestPaceSec = Math.round(e.secPerKm);
    }
    for (const side of [cur, prev]) {
      side.m.distanceKm = Math.round(side.m.distanceKm * 10) / 10;
      side.m.avgPaceSec = side.paces.length ? Math.round(side.paces.reduce((a, b) => a + b, 0) / side.paces.length) : null;
      side.weekly = side.weekly.map((v) => Math.round(v * 10) / 10);
    }
    return { kind: "cardio", weeks, weeklyCur: cur.weekly, weeklyPrev: prev.weekly, cur: cur.m, prev: prev.m };
  }

  const mk = (): { weekly: number[]; m: StrengthBlockMetrics; days: Set<string> } => ({ weekly: Array(weeks).fill(0), m: { sessions: 0, volumeKg: 0, bestE1rm: 0, hardSets: 0 }, days: new Set() });
  const cur = mk();
  const prev = mk();
  for (const s of liftSets(sessions, name, bw)) {
    if (s.t <= lo || s.t > now) continue;
    const side = s.t > mid ? cur : prev;
    const kg = s.loadKg * s.reps;
    const wi = weekIdx(s.t, s.t > mid ? now : mid);
    side.weekly[wi] = (side.weekly[wi] ?? 0) + kg;
    side.m.volumeKg += kg;
    side.m.bestE1rm = Math.max(side.m.bestE1rm, e1rm(s.loadKg, s.reps));
    if (s.rpe != null && s.rpe >= 8) side.m.hardSets += 1;
    side.days.add(s.date);
  }
  for (const side of [cur, prev]) {
    side.m.sessions = side.days.size;
    side.m.volumeKg = Math.round(side.m.volumeKg);
    side.m.bestE1rm = Math.round(side.m.bestE1rm);
    side.weekly = side.weekly.map((v) => Math.round(v));
  }
  return { kind: "strength", weeks, weeklyCur: cur.weekly, weeklyPrev: prev.weekly, cur: cur.m, prev: prev.m };
}
