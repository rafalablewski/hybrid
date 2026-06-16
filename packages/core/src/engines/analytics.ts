import type { LoggedSession, PacePoint } from "./session";
import { workingSets } from "./session";
import { exerciseHistory } from "./records";
import { exerciseDashboard, type ExercisePeriod } from "./exercise";

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
export function weeklyVolumeTrend(sessions: LoggedSession[], weeks = 8, now = Date.now()): WeekVolume[] {
  const out: WeekVolume[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const to = now - w * WEEK;
    const from = to - WEEK;
    let sets = 0;
    let tonnage = 0;
    for (const s of sessions) {
      const t = ms(s.startedAt);
      if (t < from || t >= to) continue;
      for (const b of s.blocks) {
        if (b.kind !== "strength") continue;
        for (const set of workingSets(b)) {
          const reps = num(set.reps);
          if (!Number.isFinite(reps) || reps <= 0) continue;
          sets += 1;
          const load = num(set.load);
          if (Number.isFinite(load)) tonnage += load * reps;
        }
      }
    }
    out.push({ weekStart: new Date(from).toISOString(), sets, tonnage: Math.round(tonnage) });
  }
  return out;
}

export type TrendDir = "up" | "down" | "flat";

export interface ExerciseTableRow {
  name: string;
  kind: "strength" | "cardio" | "conditioning";
  /** sessions trained in the period (frequency) */
  sessions: number;
  /** strength: best e1RM (kg); cardio/other: 0 */
  bestE1rm: number;
  /** strength: tonnage (kg); cardio: distance (km) */
  volume: number;
  /** improvement direction over the period (strength = stronger, cardio = faster) */
  trend: TrendDir;
  lastPerformed?: string;
}

function paceTrend(pace: PacePoint[]): TrendDir {
  if (pace.length < 2) return "flat";
  const a = pace[0]!.secPerKm;
  const b = pace[pace.length - 1]!.secPerKm;
  return b < a ? "up" : b > a ? "down" : "flat"; // lower pace = faster = improving
}

/**
 * One row per movement trained in the period, each carrying headline stats
 * (frequency, best e1RM, volume, improvement trend) and drilling into its own
 * per-exercise dashboard. Sorted by volume (then strength) descending; movements
 * with no activity in the period are dropped.
 */
export function exerciseTable(
  sessions: LoggedSession[],
  period: ExercisePeriod = "all",
  now = Date.now(),
): ExerciseTableRow[] {
  return exerciseHistory(sessions)
    .map((e) => {
      const d = exerciseDashboard(sessions, e.name, period, now);
      if (d.kind === "cardio") {
        return {
          name: e.name,
          kind: "cardio" as const,
          sessions: d.efforts,
          bestE1rm: 0,
          volume: d.distanceKm,
          trend: paceTrend(d.pace),
          lastPerformed: d.lastPerformed,
        };
      }
      const pts = d.e1rm;
      const trend: TrendDir =
        pts.length < 2 ? "flat" : pts[pts.length - 1]!.e1rm > pts[0]!.e1rm ? "up" : pts[pts.length - 1]!.e1rm < pts[0]!.e1rm ? "down" : "flat";
      return {
        name: e.name,
        kind: d.kind,
        sessions: d.sessions,
        bestE1rm: d.bestE1rm,
        volume: d.volume,
        trend,
        lastPerformed: d.lastPerformed,
      };
    })
    .filter((r) => r.sessions > 0)
    .sort((a, b) => b.volume - a.volume || b.bestE1rm - a.bestE1rm);
}
