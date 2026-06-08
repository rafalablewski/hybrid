import type { LoggedSession, ConditioningBlock } from "./session";

// Running / cardio analytics — pure aggregates over logged conditioning blocks,
// so the web Running screen (and anything else) reads one source of truth. A
// "cardio effort" is any conditioning block; pace stats need distance + minutes.

const isCardio = (b: { kind: string }): b is ConditioningBlock => b.kind === "conditioning";
const WEEK = 7 * 86_400_000;
const ms = (iso: string) => new Date(iso).getTime();

export interface RunTotals {
  efforts: number;
  distanceKm: number;
  minutes: number;
}

/** Whole-history cardio totals (efforts, distance, minutes). */
export function runTotals(sessions: LoggedSession[]): RunTotals {
  let efforts = 0;
  let distanceKm = 0;
  let minutes = 0;
  for (const s of sessions)
    for (const b of s.blocks)
      if (isCardio(b)) {
        efforts += 1;
        if (b.distance && b.distance > 0) distanceKm += b.distance;
        if (b.minutes && b.minutes > 0) minutes += b.minutes;
      }
  return { efforts, distanceKm: Math.round(distanceKm * 10) / 10, minutes: Math.round(minutes) };
}

export interface RunStat {
  move: string;
  efforts: number;
  distanceKm: number;
  minutes: number;
  longestKm: number;
  /** best (lowest) pace in sec/km among paced efforts, or null. */
  bestPaceSecPerKm: number | null;
}

/** Per-move cardio stats, most total distance first. */
export function runStats(sessions: LoggedSession[]): RunStat[] {
  const map = new Map<string, RunStat>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isCardio(b)) {
        const cur =
          map.get(b.name) ??
          { move: b.name, efforts: 0, distanceKm: 0, minutes: 0, longestKm: 0, bestPaceSecPerKm: null };
        cur.efforts += 1;
        if (b.distance && b.distance > 0) {
          cur.distanceKm += b.distance;
          cur.longestKm = Math.max(cur.longestKm, b.distance);
          if (b.minutes && b.minutes > 0) {
            const pace = Math.round((b.minutes * 60) / b.distance);
            cur.bestPaceSecPerKm = cur.bestPaceSecPerKm == null ? pace : Math.min(cur.bestPaceSecPerKm, pace);
          }
        }
        if (b.minutes && b.minutes > 0) cur.minutes += b.minutes;
        map.set(b.name, cur);
      }
  return [...map.values()]
    .map((r) => ({ ...r, distanceKm: Math.round(r.distanceKm * 10) / 10, minutes: Math.round(r.minutes) }))
    .sort((a, b) => b.distanceKm - a.distanceKm || b.efforts - a.efforts);
}

/** Distinct cardio moves that have paced data (distance + minutes), by total km. */
export function pacedRunMoves(sessions: LoggedSession[]): string[] {
  const km = new Map<string, number>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isCardio(b) && b.distance && b.distance > 0 && b.minutes && b.minutes > 0)
        km.set(b.name, (km.get(b.name) ?? 0) + b.distance);
  return [...km.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
}

export interface WeekMileage {
  weekStart: string; // ISO, start of the 7-day bucket
  km: number;
  minutes: number;
  efforts: number;
}

/** Distance/minutes per week for the last `weeks` windows, oldest → newest. */
export function weeklyMileage(sessions: LoggedSession[], weeks = 8, now = Date.now()): WeekMileage[] {
  const out: WeekMileage[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const to = now - w * WEEK;
    const from = to - WEEK;
    let km = 0;
    let minutes = 0;
    let efforts = 0;
    for (const s of sessions) {
      const t = ms(s.startedAt);
      if (t < from || t >= to) continue;
      for (const b of s.blocks)
        if (isCardio(b)) {
          efforts += 1;
          if (b.distance && b.distance > 0) km += b.distance;
          if (b.minutes && b.minutes > 0) minutes += b.minutes;
        }
    }
    out.push({ weekStart: new Date(from).toISOString(), km: Math.round(km * 10) / 10, minutes: Math.round(minutes), efforts });
  }
  return out;
}

export interface EffortSplit {
  /** minutes at an easy effort (RPE ≤ 6) */
  easy: number;
  /** minutes at a moderate effort (RPE 7) */
  moderate: number;
  /** minutes at a hard effort (RPE ≥ 8) */
  hard: number;
}

/**
 * Cardio minutes split by perceived effort (the 80/20 lens): easy (RPE ≤ 6),
 * moderate (7), hard (≥ 8). Only efforts that logged both minutes + RPE count.
 */
export function effortSplit(sessions: LoggedSession[]): EffortSplit {
  const split: EffortSplit = { easy: 0, moderate: 0, hard: 0 };
  for (const s of sessions)
    for (const b of s.blocks)
      if (isCardio(b) && b.minutes && b.minutes > 0 && b.rpe != null) {
        if (b.rpe <= 6) split.easy += b.minutes;
        else if (b.rpe === 7) split.moderate += b.minutes;
        else split.hard += b.minutes;
      }
  return { easy: Math.round(split.easy), moderate: Math.round(split.moderate), hard: Math.round(split.hard) };
}
