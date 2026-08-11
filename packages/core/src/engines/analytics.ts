import type { LoggedSession, PacePoint } from "./session";
import type { ChartReading } from "../chart-scrub";
import type { MuscleGroup } from "./types";
import { setsForVolume, effectiveSetLoadKg, topLoadSeries } from "./session";
import { gymExercise, loadUnitCount } from "../exercise-db";
import { bwAt, type BodyweightInput } from "../bodyweight";
import { fmtTonnage, kgToUnit, splitFigure, type WeightUnit } from "../units";
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
 * HOW MANY WEEKS A TREND CHART SHOWS, as a ladder rather than a literal.
 *
 * Every volume chart in the app was hard-coded to 8 — a reasonable default and
 * the only window an athlete could ever see. `8` appears verbatim at three call
 * sites on mobile alone, which is how a default becomes a fact.
 *
 * The rungs are the periods a training block is actually discussed in: a month,
 * a mesocycle, a quarter, half a year, a year. Ordered SHORTEST → LONGEST, and
 * `TREND_WEEKS_DEFAULT` stays 8 so nothing changes until the athlete asks.
 */
export const TREND_WINDOWS = [4, 8, 13, 26, 52] as const;
export const TREND_WEEKS_DEFAULT = 8;

/**
 * One rung along that ladder, or the same window at either end.
 *
 * `dir` is the GESTURE's sense, not the list's: +1 is a pinch OUT, which zooms
 * IN, which is FEWER weeks — so it walks toward the start of the list. That
 * inversion is the easiest thing to get backwards in a pinch, so it is named
 * once here instead of at each client's gesture code.
 *
 * It clamps rather than returning null: a pinch that has run out of ladder
 * should feel like the end of the ladder, and the caller ticking a haptic for a
 * step that then does nothing is the "listening but not responding" failure the
 * audit's swipe findings were about.
 */
export function stepTrendWindow(weeks: number, dir: 1 | -1): number {
  const i = TREND_WINDOWS.indexOf(weeks as (typeof TREND_WINDOWS)[number]);
  // An off-ladder window (a caller still passing its own literal) snaps to the
  // nearest rung rather than refusing to move.
  const from = i >= 0 ? i : TREND_WINDOWS.reduce((best, w, k) => (Math.abs(w - weeks) < Math.abs(TREND_WINDOWS[best]! - weeks) ? k : best), 0);
  const next = i >= 0 ? from - dir : from;
  return TREND_WINDOWS[Math.min(TREND_WINDOWS.length - 1, Math.max(0, next))]!;
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
 * The figure under a held finger on a Trends measure band, in the athlete's own
 * unit. `measure` picks which of the week's two numbers is being read, because
 * the two bands draw the SAME series object through two different lines.
 *
 * The band's resting figure is this week's; a held one is another week's, so
 * the two are formatted by the same call and cannot drift apart.
 */
export function volumeTrendReading(
  weeks: WeekVolume[],
  index: number,
  measure: "sets" | "tonnage",
  units: WeightUnit,
): ChartReading | null {
  const w = weeks[index];
  if (!w) return null;
  const value = measure === "sets" ? w.sets : w.tonnage;
  const peak = Math.max(...weeks.map((x) => (measure === "sets" ? x.sets : x.tonnage)));
  const [v, u] = measure === "sets" ? [String(w.sets), ""] : splitFigure(fmtTonnage(w.tonnage, units));
  return { index, weekStart: w.weekStart, value: v, unit: u, efforts: null, best: value > 0 && value === peak };
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
 * HOW MANY ROWS THE TABLE WEARS COLLAPSED — shared so the two clients cannot
 * fold at two different depths. Twelve rows cover a typical split's whole
 * rotation; everything beyond them sits behind the bare ＋ expander, whose ash
 * count names exactly how many are folded (a cap is never silent).
 */
export const EXERCISE_TABLE_FOLD = 12;

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
    // A movement last touched before the cutoff cannot produce a row — the
    // sessions>0 filter below would drop it — so skip its dashboard pass
    // instead of computing one to throw away. This is what makes a bounded
    // period actually bound the COST: the pass runs per movement trained in
    // the window, not per movement ever logged. On "all" the cutoff is
    // -Infinity and nothing is skipped.
    .filter((e) => ms(e.lastUsed) > cutoff)
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
