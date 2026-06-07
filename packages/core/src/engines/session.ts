import type { TrainingLog, EnergySystem } from "./types";
import { MOVEMENTS } from "./movements";

// The persisted Session.blocks shape (matches what the web logger writes and
// what the API stores as JSON). Shared so the logger, history, dashboards, and
// engines all agree on one structure.

export interface StrengthSet {
  load: string;
  reps: string;
  rpe?: string;
  /** mean concentric velocity for the set, m/s (VBT — sensor or manual entry) */
  vel?: string;
  /** peak concentric velocity, m/s */
  peakVel?: string;
  /** range of motion, cm */
  rom?: string;
  /**
   * Drop set — performed immediately after the previous set with NO rest and a
   * reduced load (strip weight, keep going to extend the set past failure).
   */
  drop?: boolean;
}

export interface StrengthBlock {
  kind: "strength";
  name: string;
  sets: StrengthSet[];
  note?: string;
  /**
   * Superset — performed back-to-back (no rest) with the NEXT block in the
   * session. Lets the logger pair e.g. Bench + Row without inventing a new
   * block shape: a run of blocks each flagged `superset` (the last left off) is
   * one superset group.
   */
  superset?: boolean;
}

export interface ConditioningBlock {
  kind: "conditioning";
  name: string;
  format?: string;
  work?: number;
  rest?: number;
  rounds?: number;
  minutes?: number;
  rpe?: number;
  /** distance covered, km (runs/rows/rides) — pace is derived from minutes. */
  distance?: number;
}

export type SessionBlock = StrengthBlock | ConditioningBlock;

export interface LoggedSession {
  id: string;
  title: string;
  startedAt: string; // ISO
  completedAt?: string | null;
  blocks: SessionBlock[];
  readiness?: number | null;
}

const isStrength = (b: SessionBlock): b is StrengthBlock => b.kind === "strength";
const num = (s: string | undefined): number => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};

/** Estimated 1-rep max (Epley). */
export function e1rm(load: number, reps: number): number {
  return reps <= 0 ? 0 : load * (1 + reps / 30);
}

/** Best estimated 1RM across a strength block's sets. */
export function blockBestE1rm(b: StrengthBlock): number {
  let best = 0;
  for (const s of b.sets) {
    const load = num(s.load);
    const reps = num(s.reps);
    if (!Number.isNaN(load) && !Number.isNaN(reps)) best = Math.max(best, e1rm(load, reps));
  }
  return best;
}

/**
 * Pace per km for a cardio block (e.g. "5:42 /km"), derived from distance +
 * minutes. Null unless both are logged — pace isn't stored, it's computed so it
 * can never disagree with the distance/time it came from.
 */
export function pacePerKm(b: ConditioningBlock): string | null {
  if (!b.distance || b.distance <= 0 || !b.minutes || b.minutes <= 0) return null;
  const secPerKm = (b.minutes * 60) / b.distance;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

/**
 * One-line summary of a conditioning block: format, the interval (rounds ×
 * work/rest seconds) when logged, distance, total minutes, the derived pace,
 * and optionally RPE. Shared so the web + mobile history/detail views read
 * cardio the same way.
 */
export function conditioningSummary(b: ConditioningBlock, opts: { rpe?: boolean } = {}): string {
  const parts: (string | null | undefined)[] = [b.format];
  if (b.work && b.rest) parts.push(`${b.rounds ? `${b.rounds}×` : ""}${b.work}/${b.rest}s`);
  else if (b.rounds) parts.push(`${b.rounds} rounds`);
  if (b.distance) parts.push(`${b.distance} km`);
  if (b.minutes) parts.push(`${b.minutes} min`);
  const pace = pacePerKm(b);
  if (pace) parts.push(pace);
  if (opts.rpe && b.rpe) parts.push(`RPE ${b.rpe}`);
  return parts.filter(Boolean).join(" · ");
}

/** One-line summary of any block (strength sets, or the conditioning summary). */
export function blockSummary(b: SessionBlock): string {
  if (isStrength(b)) return b.sets.map((s) => `${s.load || "–"}×${s.reps || "–"}`).join(" · ");
  return conditioningSummary(b);
}

/** Tonnage (load × reps) summed across all strength sets in a session. */
export function sessionVolume(blocks: SessionBlock[]): number {
  let v = 0;
  for (const b of blocks) {
    if (!isStrength(b)) continue;
    for (const s of b.sets) {
      const load = num(s.load);
      const reps = num(s.reps);
      if (!Number.isNaN(load) && !Number.isNaN(reps)) v += load * reps;
    }
  }
  return Math.round(v);
}

export function totalVolume(sessions: LoggedSession[]): number {
  return sessions.reduce((sum, s) => sum + sessionVolume(s.blocks), 0);
}

/** Distinct strength lift names seen across sessions, most-frequent first. */
export function liftNames(sessions: LoggedSession[]): string[] {
  const counts = new Map<string, number>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isStrength(b)) counts.set(b.name, (counts.get(b.name) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

export interface E1rmPoint {
  date: string;
  e1rm: number;
}

/** e1RM over time for one lift, oldest → newest. */
export function e1rmSeries(sessions: LoggedSession[], lift: string): E1rmPoint[] {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const pts: E1rmPoint[] = [];
  for (const s of sorted)
    for (const b of s.blocks)
      if (isStrength(b) && b.name === lift) {
        const best = blockBestE1rm(b);
        if (best > 0) pts.push({ date: s.startedAt, e1rm: Math.round(best) });
      }
  return pts;
}

export interface PrRow {
  lift: string;
  e1rm: number;
  when: string;
}

/** Best e1RM per lift (all-time PRs), strongest first. */
export function bestE1rmByLift(sessions: LoggedSession[]): PrRow[] {
  const map = new Map<string, { e1rm: number; when: string }>();
  for (const s of sessions)
    for (const b of s.blocks)
      if (isStrength(b)) {
        const best = Math.round(blockBestE1rm(b));
        const cur = map.get(b.name);
        if (best > 0 && (!cur || best > cur.e1rm)) map.set(b.name, { e1rm: best, when: s.startedAt });
      }
  return [...map.entries()]
    .map(([lift, v]) => ({ lift, ...v }))
    .sort((a, b) => b.e1rm - a.e1rm);
}

/**
 * Convert logged sessions into the engine's TrainingLog so fatigue/readiness/
 * prescription run on the athlete's REAL data — the Sprint 4 spine.
 */
export function toTrainingLog(sessions: LoggedSession[], now = Date.now()): TrainingLog {
  return sessions.map((s) => {
    const daysAgo = Math.max(0, Math.round((now - new Date(s.startedAt).getTime()) / 86_400_000));
    const items = s.blocks.map((b) => {
      if (b.kind === "strength") {
        const est = Math.round(blockBestE1rm(b));
        let topRpe = 0;
        for (const st of b.sets) {
          const r = num(st.rpe);
          if (!Number.isNaN(r)) topRpe = Math.max(topRpe, r);
        }
        return {
          move: b.name,
          e1rm: est || undefined,
          topRpe: topRpe || undefined,
          hardSets: b.sets.length,
        };
      }
      const system = (MOVEMENTS[b.name]?.system ?? "anaerobic") as EnergySystem;
      const minutes =
        b.minutes ??
        (b.work && b.rest && b.rounds ? Math.round(((b.work + b.rest) * b.rounds) / 60) : 12);
      return { move: b.name, system, minutes, rpe: b.rpe ?? 8 };
    });
    return { daysAgo, items };
  });
}
