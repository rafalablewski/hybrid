import type { LoggedSession, PacePoint } from "./session";
import type { MuscleGroup } from "./types";
import { setsForVolume, effectiveSetLoadKg, topLoadSeries } from "./session";
import { gymExercise, loadUnitCount } from "../exercise-db";
import { bwAt, type BodyweightInput } from "../bodyweight";
import { kgToUnit, type WeightUnit } from "../units";
import { musclesFor } from "./movements";
import { exerciseHistory } from "./records";
import { exerciseDashboard, periodCutoff, type ExercisePeriod } from "./exercise";

// Training-analytics hub: cross-exercise + over-time rollups that sit ABOVE the
// per-exercise dashboards. Volume TRENDS (weekly working sets + tonnage) and a
// sortable EXERCISE TABLE (each row drilling into its own dashboard). Pure
// aggregation over the existing engines — the muscle breakdown itself comes from
// the landmarks engine (volumeStatus).

const WEEK = 7 * 86_400_000;
const ms = (iso: string) => new Date(iso).getTime();
const num = (s: string | undefined): number => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : NaN;
};

export interface WeekVolume {
  weekStart: string; // ISO
  /** working sets (warm-ups/cool-downs excluded) */
  sets: number;
  /** tonnage (kg) of those working sets */
  tonnage: number;
}

/**
 * Overall weekly WORKING-set count + tonnage over the last `weeks` (rolling
 * 7-day windows ending now), oldest → newest — the volume-trend chart's data.
 */
export function weeklyVolumeTrend(sessions: LoggedSession[], weeks = 8, now = Date.now(), includeWarmups = false, bw?: BodyweightInput): WeekVolume[] {
  const out: WeekVolume[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const to = now - w * WEEK;
    const from = to - WEEK;
    let sets = 0;
    let tonnage = 0;
    for (const s of sessions) {
      const t = ms(s.startedAt);
      if (t < from || t >= to) continue;
      const kg = bwAt(bw, s.startedAt);
      for (const b of s.blocks) {
        if (b.kind !== "strength") continue;
        // Holds/carries (time or distance measures) count sets, never tonnage.
        const countsTonnage = (gymExercise(b.name)?.measure ?? "reps") === "reps";
        const units = loadUnitCount(b.name);
        for (const set of setsForVolume(b, includeWarmups)) {
          const reps = num(set.reps);
          if (!Number.isFinite(reps) || reps <= 0) continue;
          sets += 1;
          if (countsTonnage) tonnage += effectiveSetLoadKg(b.name, set.load, kg) * reps * units;
        }
      }
    }
    out.push({ weekStart: new Date(from).toISOString(), sets, tonnage: Math.round(tonnage) });
  }
  return out;
}

/**
 * Weekly working-set count for ONE muscle over the last `weeks` (rolling 7-day
 * windows), oldest → newest — for a per-muscle volume trend line. Each set of a
 * movement that trains the muscle counts one; honours the warm-up volume flag.
 */
export function weeklyMuscleSets(
  sessions: LoggedSession[],
  muscle: MuscleGroup,
  weeks = 8,
  now = Date.now(),
  includeWarmups = false,
  fractional = false,
): number[] {
  const out: number[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const to = now - w * WEEK;
    const from = to - WEEK;
    let sets = 0;
    for (const s of sessions) {
      const t = ms(s.startedAt);
      if (t < from || t >= to) continue;
      for (const b of s.blocks) {
        if (b.kind !== "strength") continue;
        const muscles = musclesFor(b.name);
        if (!muscles.includes(muscle)) continue;
        const n = setsForVolume(b, includeWarmups).filter((set) => {
          const r = parseFloat(set.reps);
          return Number.isFinite(r) && r > 0;
        }).length;
        sets += n * (fractional && muscles[0] !== muscle ? 0.5 : 1);
      }
    }
    out.push(Math.round(sets * 2) / 2);
  }
  return out;
}

export type TrendDir = "up" | "down" | "flat";

export interface ExerciseTableRow {
  name: string;
  kind: "strength" | "cardio" | "conditioning";
  /** sessions trained in the period (frequency) */
  sessions: number;
  /** strength: heaviest working load lifted in the period (kg); cardio/other: 0.
   *  The actual top weight — e1RM is a secondary, derived stat. */
  topWeight: number;
  /** strength: tonnage (kg); cardio: distance (km) */
  volume: number;
  /** improvement direction over the period (strength = heavier, cardio = faster) */
  trend: TrendDir;
  /**
   * The SIGNED change behind `trend`, in the row's own unit — strength: kg on
   * the top working load (positive = heavier); cardio: seconds per km on pace
   * (negative = faster). `undefined` when the window holds fewer than two
   * sessions, i.e. there is nothing to compare against.
   *
   * The table used to render `trend` as a bare ▲/▼ glyph, which says a lift
   * moved but never by how much — and a glyph can't be ranked. This carries the
   * figure the arrow was standing in for. Read the DIRECTION off `trend`, never
   * off this sign: a faster pace is a SMALLER number, so a negative cardio
   * change is an improvement.
   */
  change?: number;
  lastPerformed?: string;
}

/**
 * The exercise table's CHANGE cell — `row.change` as display text in the
 * athlete's unit, with a true minus sign so the column stays tabular. Shared by
 * both clients so web and mobile can't format the same delta two ways. Returns
 * `dash` when there is nothing to compare (or the lift held exactly).
 */
export function fmtRowChange(row: ExerciseTableRow, unit: WeightUnit, dash = "—"): string {
  const c = row.change;
  if (c === undefined || c === 0) return dash;
  const sign = c > 0 ? "+" : "−";
  if (row.kind === "cardio") return `${sign}${Math.abs(Math.round(c))} s/km`;
  const v = kgToUnit(Math.abs(c), unit);
  const d = unit === "lb" ? 0 : v % 1 === 0 ? 0 : 1;
  return `${sign}${Number(v.toFixed(d)).toLocaleString()} ${unit}`;
}

function paceTrend(pace: PacePoint[]): TrendDir {
  if (pace.length < 2) return "flat";
  const a = pace[0]!.secPerKm;
  const b = pace[pace.length - 1]!.secPerKm;
  return b < a ? "up" : b > a ? "down" : "flat"; // lower pace = faster = improving
}

/**
 * One row per movement trained in the period, each carrying headline stats
 * (frequency, heaviest lift, volume, improvement trend) and drilling into its
 * own per-exercise dashboard. Sorted by volume (then heaviest lift) descending;
 * movements with no activity in the period are dropped.
 */
export function exerciseTable(
  sessions: LoggedSession[],
  period: ExercisePeriod = "all",
  now = Date.now(),
  includeWarmups = false,
  bw?: BodyweightInput,
): ExerciseTableRow[] {
  const cutoff = periodCutoff(period, now);
  return exerciseHistory(sessions)
    .map((e) => {
      const d = exerciseDashboard(sessions, e.name, period, now, includeWarmups, bw);
      if (d.kind === "cardio") {
        return {
          name: e.name,
          kind: "cardio" as const,
          sessions: d.efforts,
          topWeight: 0,
          volume: d.distanceKm,
          trend: paceTrend(d.pace),
          change: d.pace.length < 2 ? undefined : d.pace[d.pace.length - 1]!.secPerKm - d.pace[0]!.secPerKm,
          lastPerformed: d.lastPerformed,
        };
      }
      // Trend off the actual top weight, first vs last session in the window.
      const pts = topLoadSeries(sessions, e.name, bw).filter((p) => {
        const t = ms(p.date);
        return t > cutoff && t <= now;
      });
      const trend: TrendDir =
        pts.length < 2 ? "flat" : pts[pts.length - 1]!.weightKg > pts[0]!.weightKg ? "up" : pts[pts.length - 1]!.weightKg < pts[0]!.weightKg ? "down" : "flat";
      return {
        name: e.name,
        kind: d.kind,
        sessions: d.sessions,
        topWeight: d.heaviestLoad,
        volume: d.volume,
        trend,
        change: pts.length < 2 ? undefined : pts[pts.length - 1]!.weightKg - pts[0]!.weightKg,
        lastPerformed: d.lastPerformed,
      };
    })
    .filter((r) => r.sessions > 0)
    .sort((a, b) => b.volume - a.volume || b.topWeight - a.topWeight);
}
