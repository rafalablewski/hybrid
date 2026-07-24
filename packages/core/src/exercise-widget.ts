import type { LoggedSession } from "./engines/session";
import { topLoadSeries, paceSeries, type PacePoint } from "./engines/session";
import { exerciseHistory } from "./engines/records";
import {
  exerciseDashboard,
  exerciseKind,
  periodCutoff,
  type ExercisePeriod,
  type ExerciseStats,
} from "./engines/exercise";
import {
  topLoadTrendWithPRs,
  weeklyTonnage,
  intensityDistribution,
  paceCurve,
  recentRunDeltas,
  repMaxMatrix,
  loadRepsScatter,
  tonnageSurface,
  exerciseConsistency,
  blockCompare,
  type WeightPrPoint,
  type WeekTonnage,
  type IntensityZone,
  type PaceBand,
  type RunDelta,
  type RepMax,
  type LoadRepsMap,
  type TonnageSurface,
  type ExerciseConsistency,
  type BlockCompare,
} from "./engines/exercise-analytics";
import type { BodyweightInput } from "./bodyweight";

// The Today-tab EXERCISES widget + the individual exercise page ("variant B"):
// favourite movements as swipeable cards (headline value + stock-ticker delta +
// sparkline), and the paged stats screen where one hero number pairs with one
// chart. Pure derivation over the existing engines so web and mobile render the
// SAME numbers. Prototypes: reference/exercises-widget-preview-ive.html.

const DAY = 86_400_000;
/** The widget's comparison window: this 8 weeks vs the previous 8 weeks. */
export const WIDGET_WINDOW_DAYS = 56;

export type ExerciseWidgetMetric = "weight" | "pace" | "volume" | "time";

export interface ExerciseWidgetCard {
  name: string;
  kind: "strength" | "cardio" | "conditioning";
  metric: ExerciseWidgetMetric;
  /** headline value — kg (weight = heaviest lift), sec/km (pace), total kg
   *  (volume) or total minutes (time), 8-week window */
  value: number;
  /** signed % change vs the previous 8-week window, 1 decimal; null = no baseline */
  deltaPct: number | null;
  /** whether that change is an improvement (pace: lower is better); null with no baseline */
  improving: boolean | null;
  /** sparkline series inside the window, oldest → newest (falls back to the
   *  last few all-time points when the window is too thin to draw) */
  spark: number[];
  /** sessions that trained this movement inside the window */
  sessions: number;
}

/** Signed % change with a sane null for a missing/zero baseline. 1 decimal. */
export function pctChange(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

const ts = (iso: string): number => new Date(iso).getTime();

/** sessions that trained `name` in (now-days, now] */
const sessionCount = (sessions: LoggedSession[], name: string, now: number, days: number): number =>
  sessions.filter((s) => {
    const t = ts(s.startedAt);
    return t <= now && t > now - days * DAY && s.blocks.some((b) => b.name === name);
  }).length;

/** A conditioning/cardio block's duration in minutes: logged minutes first,
 *  else derived from the interval format (rounds × (work+rest) seconds). */
const blockMinutes = (b: LoggedSession["blocks"][number]): number => {
  if (b.kind === "strength") return 0;
  if (b.minutes != null && Number.isFinite(b.minutes) && b.minutes > 0) return b.minutes;
  if (b.kind === "conditioning" && b.rounds && b.work) return (b.rounds * (b.work + (b.rest ?? 0))) / 60;
  return 0;
};

export interface WeekMinutes {
  /** YYYY-MM-DD of the trailing 7-day bucket's start. */
  weekStart: string;
  minutes: number;
}

/** Weekly minutes of the movement over trailing 7-day buckets, oldest →
 *  newest — the duration metric for conditioning (which has no per-set loads:
 *  ConditioningBlock is format/work/rest/rounds/minutes) and for minutes-only
 *  cardio (a tennis match, a swim without distance). */
export function weeklyMinutes(
  sessions: LoggedSession[],
  name: string,
  weeks: number,
  now = Date.now(),
): WeekMinutes[] {
  const rows: WeekMinutes[] = Array.from({ length: weeks }, (_, w) => ({
    weekStart: new Date(now - (weeks - w) * 7 * DAY).toISOString().slice(0, 10),
    minutes: 0,
  }));
  for (const s of sessions) {
    const t = ts(s.startedAt);
    if (t > now) continue;
    const weeksAgo = Math.floor((now - t) / (7 * DAY));
    if (weeksAgo >= weeks) continue;
    for (const b of s.blocks) if (b.name === name) rows[weeks - 1 - weeksAgo]!.minutes += blockMinutes(b);
  }
  return rows.map((r) => ({ ...r, minutes: Math.round(r.minutes) }));
}

type Windowed<P> = { cur: P[]; prev: P[] };
function splitWindows<P extends { date: string }>(points: P[], now: number): Windowed<P> {
  const cur: P[] = [], prev: P[] = [];
  for (const p of points) {
    const t = ts(p.date);
    if (t > now) continue;
    if (t > now - WIDGET_WINDOW_DAYS * DAY) cur.push(p);
    else if (t > now - 2 * WIDGET_WINDOW_DAYS * DAY) prev.push(p);
  }
  return { cur, prev };
}

/** One widget card for a movement, or null when it has nothing to show. */
export function exerciseWidgetCard(
  sessions: LoggedSession[],
  name: string,
  now = Date.now(),
  bw?: BodyweightInput,
): ExerciseWidgetCard | null {
  const kind = exerciseKind(sessions, name);
  const count = sessionCount(sessions, name, now, WIDGET_WINDOW_DAYS);

  if (kind === "cardio") {
    const all = paceSeries(sessions, name).filter((p) => ts(p.date) <= now);
    if (all.length > 0) {
      const { cur, prev } = splitWindows(all, now);
      const best = (pts: PacePoint[]) => (pts.length ? Math.min(...pts.map((p) => p.secPerKm)) : NaN);
      const value = cur.length ? best(cur) : best(all.slice(-1));
      // pace: sign of the raw change, improvement = got faster (negative change)
      const deltaPct = cur.length && prev.length ? pctChange(best(cur), best(prev)) : null;
      const spark = (cur.length >= 2 ? cur : all.slice(-8)).map((p) => p.secPerKm);
      return { name, kind, metric: "pace", value, deltaPct, improving: deltaPct == null ? null : deltaPct < 0, spark, sessions: count };
    }
    // minutes-only cardio (a match, a swim without distance) → time metric
  }

  if (kind === "strength") {
    const all = topLoadSeries(sessions, name, bw).filter((p) => ts(p.date) <= now);
    if (all.length > 0) {
      const { cur, prev } = splitWindows(all, now);
      const best = (pts: { weightKg: number }[]) => (pts.length ? Math.max(...pts.map((p) => p.weightKg)) : NaN);
      const value = cur.length ? best(cur) : best(all.slice(-1));
      const deltaPct = cur.length && prev.length ? pctChange(best(cur), best(prev)) : null;
      const spark = (cur.length >= 2 ? cur : all.slice(-8)).map((p) => p.weightKg);
      return { name, kind, metric: "weight", value, deltaPct, improving: deltaPct == null ? null : deltaPct > 0, spark, sessions: count };
    }
    // strength logged without parseable loads: weekly tonnage as the fallback
    const weeks = weeklyTonnage(sessions, name, 16, now, bw).map((w) => w.baseKg + w.hardKg);
    const curW = weeks.slice(8), prevW = weeks.slice(0, 8);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    if (sum(curW) > 0) {
      const deltaPct = pctChange(sum(curW), sum(prevW));
      return { name, kind, metric: "volume", value: sum(curW), deltaPct, improving: deltaPct == null ? null : deltaPct > 0, spark: curW, sessions: count };
    }
    return null;
  }

  // conditioning + minutes-only cardio: 8-week minutes vs the 8 before
  const weeks = weeklyMinutes(sessions, name, 16, now).map((w) => w.minutes);
  const curW = weeks.slice(8), prevW = weeks.slice(0, 8);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const value = sum(curW);
  if (value <= 0) return null;
  const deltaPct = pctChange(value, sum(prevW));
  return { name, kind, metric: "time", value, deltaPct, improving: deltaPct == null ? null : deltaPct > 0, spark: curW, sessions: count };
}

/**
 * Pick the favourites for the Today widget: explicit `favourites` first (kept
 * in order), then auto-fill so DIFFERENT purposes lead — the most-trained
 * strength lift, cardio move and conditioning move of the last 8 weeks (falling
 * back to all-time), then overall frequency up to `max`.
 */
export function exerciseWidgetCards(
  sessions: LoggedSession[],
  opts: { max?: number; favourites?: string[]; now?: number; bw?: BodyweightInput } = {},
): ExerciseWidgetCard[] {
  const { max = 3, favourites = [], now = Date.now(), bw } = opts;
  const history = exerciseHistory(sessions);
  if (history.length === 0) return [];
  const recent = new Map(history.map((e) => [e.name, sessionCount(sessions, e.name, now, WIDGET_WINDOW_DAYS)]));
  // most-trained first: 8-week count, then all-time count
  const ranked = [...history].sort((a, b) => (recent.get(b.name)! - recent.get(a.name)!) || (b.count - a.count));

  const picked: string[] = favourites.filter((f) => history.some((e) => e.name === f)).slice(0, max);
  for (const kind of ["strength", "cardio", "conditioning"] as const) {
    if (picked.length >= max) break;
    const top = ranked.find((e) => e.kind === kind && !picked.includes(e.name));
    if (top) picked.push(top.name);
  }
  for (const e of ranked) {
    if (picked.length >= max) break;
    if (!picked.includes(e.name)) picked.push(e.name);
  }

  const cards: ExerciseWidgetCard[] = [];
  for (const name of picked) {
    const card = exerciseWidgetCard(sessions, name, now, bw);
    if (card) cards.push(card);
  }
  return cards;
}

// ────────────────────────────────────────────────────────────────────
// The individual exercise page: one hero number per chart, swiped together.
// ────────────────────────────────────────────────────────────────────

export type ExercisePageSlide =
  | { kind: "weightTrend"; points: WeightPrPoint[]; bestWeight: number; deltaPct: number | null; improving: boolean | null }
  | { kind: "tonnage"; weeks: WeekTonnage[]; avgWeekKg: number; deltaPct: number | null; improving: boolean | null }
  | { kind: "zones"; zones: IntensityZone[]; topZone: IntensityZone | null }
  | { kind: "repMax"; cells: (RepMax | null)[]; heaviestKg: number }
  | { kind: "loadReps"; map: LoadRepsMap; workingSets: number }
  | { kind: "surface"; surface: TonnageSurface; peakKg: number }
  | { kind: "compare"; compare: BlockCompare; deltaPct: number | null; improving: boolean | null }
  | { kind: "weeklyMinutes"; weeks: WeekMinutes[]; avgWeekMin: number; deltaPct: number | null; improving: boolean | null }
  | { kind: "consistency"; weekly: number[]; weeksTrained: number; weeksTotal: number; detail: ExerciseConsistency }
  | { kind: "paceTrend"; points: PacePoint[]; bestSec: number | null; deltaPct: number | null; improving: boolean | null }
  | { kind: "paceCurve"; bands: PaceBand[]; fastestBandSec: number | null }
  | { kind: "runDeltas"; runs: RunDelta[]; avgSec: number | null; lastDeltaSec: number | null };

export interface ExercisePageModel {
  name: string;
  kind: "strength" | "cardio" | "conditioning";
  period: ExercisePeriod;
  /** the existing per-movement dashboard — feeds the quiet substats row */
  stats: ExerciseStats;
  /** sessions that trained this movement inside the period (any block kind —
   *  the dashboard's own count is strength-blocks-only, so it reads 0 for
   *  conditioning; the substats row uses THIS one for duration movements) */
  sessionsInPeriod: number;
  slides: ExercisePageSlide[];
}

const PERIOD_WEEKS: Record<ExercisePeriod, number> = { "8w": 12, "6m": 26, "1y": 52, all: 52 };
export const CONSISTENCY_WEEKS = 26;

/** sessions-per-week counts for the movement, oldest → newest. */
export function weeklySessionCounts(
  sessions: LoggedSession[],
  name: string,
  weeks = CONSISTENCY_WEEKS,
  now = Date.now(),
): number[] {
  const counts = new Array<number>(weeks).fill(0);
  for (const s of sessions) {
    const t = ts(s.startedAt);
    if (t > now || !s.blocks.some((b) => b.name === name)) continue;
    const weeksAgo = Math.floor((now - t) / (7 * DAY));
    if (weeksAgo < weeks) counts[weeks - 1 - weeksAgo]! += 1;
  }
  return counts;
}

/** The full page model — same slides, same hero numbers, on both clients. */
export function exercisePageModel(
  sessions: LoggedSession[],
  name: string,
  period: ExercisePeriod = "8w",
  opts: { now?: number; bw?: BodyweightInput; countWarmupsInVolume?: boolean } = {},
): ExercisePageModel {
  const { now = Date.now(), bw, countWarmupsInVolume = false } = opts;
  const kind = exerciseKind(sessions, name);
  const stats = exerciseDashboard(sessions, name, period, now, countWarmupsInVolume, bw);
  const cutoff = periodCutoff(period, now);
  const sessionsInPeriod = sessions.filter((s) => {
    const t = ts(s.startedAt);
    return t <= now && t > cutoff && s.blocks.some((b) => b.name === name);
  }).length;
  const slides: ExercisePageSlide[] = [];

  const weekly = weeklySessionCounts(sessions, name, CONSISTENCY_WEEKS, now);
  const consistency: ExercisePageSlide = {
    kind: "consistency",
    weekly,
    weeksTrained: weekly.filter((w) => w > 0).length,
    weeksTotal: CONSISTENCY_WEEKS,
    detail: exerciseConsistency(sessions, name, CONSISTENCY_WEEKS, now),
  };

  // This block vs the previous 8 weeks — only when BOTH halves hold data (a
  // one-sided compare is noise, matching the dashboard card's gate).
  const compareSlide = (): ExercisePageSlide | null => {
    const compare = blockCompare(sessions, name, 8, now, bw);
    if (!compare.weeklyCur.some((v) => v > 0) || !compare.weeklyPrev.some((v) => v > 0)) return null;
    const [curV, prevV] =
      compare.kind === "strength" ? [compare.cur.volumeKg, compare.prev.volumeKg] : [compare.cur.distanceKm, compare.prev.distanceKm];
    const deltaPct = pctChange(curV, prevV);
    return { kind: "compare", compare, deltaPct, improving: deltaPct == null ? null : deltaPct > 0 };
  };

  const minutesSlide = (): ExercisePageSlide | null => {
    const weeks = weeklyMinutes(sessions, name, PERIOD_WEEKS[period], now);
    const totals = weeks.map((w) => w.minutes);
    if (!totals.some((m) => m > 0)) return null;
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const half = Math.floor(totals.length / 2);
    const deltaPct = pctChange(sum(totals.slice(half)), sum(totals.slice(0, half)));
    return { kind: "weeklyMinutes", weeks, avgWeekMin: Math.round(sum(totals) / totals.length), deltaPct, improving: deltaPct == null ? null : deltaPct > 0 };
  };

  if (kind === "cardio") {
    const points = paceSeries(sessions, name).filter((p) => ts(p.date) <= now);
    if (points.length > 0) {
      const { cur, prev } = splitWindows(points, now);
      const best = (pts: PacePoint[]) => (pts.length ? Math.min(...pts.map((p) => p.secPerKm)) : null);
      const bestSec = best(cur) ?? best(points);
      const deltaPct = cur.length && prev.length ? pctChange(best(cur)!, best(prev)!) : null;
      slides.push({ kind: "paceTrend", points, bestSec, deltaPct, improving: deltaPct == null ? null : deltaPct < 0 });
      const bands = paceCurve(sessions, name, now);
      if (bands.length > 0) slides.push({ kind: "paceCurve", bands, fastestBandSec: bands[0]?.bestAllSec ?? null });
      const rd = recentRunDeltas(sessions, name, 8, now);
      if (rd.runs.length > 0) slides.push({ kind: "runDeltas", runs: rd.runs, avgSec: rd.avgSec, lastDeltaSec: rd.runs.at(-1)?.deltaSec ?? null });
      const cmp = compareSlide();
      if (cmp) slides.push(cmp);
    } else {
      // minutes-only cardio (a match, a swim without distance)
      const m = minutesSlide();
      if (m) slides.push(m);
    }
    slides.push(consistency);
    return { name, kind, period, stats, sessionsInPeriod, slides };
  }

  if (kind === "conditioning") {
    // no per-set loads in the conditioning model — duration is the volume
    const m = minutesSlide();
    if (m) slides.push(m);
    slides.push(consistency);
    return { name, kind, period, stats, sessionsInPeriod, slides };
  }

  if (kind === "strength") {
    const points = topLoadTrendWithPRs(sessions, name, period, now, bw);
    if (points.length > 0) {
      const all = topLoadSeries(sessions, name, bw).filter((p) => ts(p.date) <= now);
      const { cur, prev } = splitWindows(all, now);
      const best = (pts: { weightKg: number }[]) => (pts.length ? Math.max(...pts.map((p) => p.weightKg)) : NaN);
      const deltaPct = cur.length && prev.length ? pctChange(best(cur), best(prev)) : null;
      slides.push({
        kind: "weightTrend",
        points,
        bestWeight: Math.max(...points.map((p) => p.weightKg)),
        deltaPct,
        improving: deltaPct == null ? null : deltaPct > 0,
      });
    }
  }

  const weeks = weeklyTonnage(sessions, name, PERIOD_WEEKS[period], now, bw);
  const totals = weeks.map((w) => w.baseKg + w.hardKg);
  if (totals.some((t) => t > 0)) {
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const half = Math.floor(totals.length / 2);
    const deltaPct = pctChange(sum(totals.slice(half)), sum(totals.slice(0, half)));
    slides.push({
      kind: "tonnage",
      weeks,
      avgWeekKg: Math.round(sum(totals) / totals.length),
      deltaPct,
      improving: deltaPct == null ? null : deltaPct > 0,
    });
  }

  const zones = intensityDistribution(sessions, name, period, now, bw);
  if (zones.some((z) => z.count > 0)) {
    const topZone = zones.reduce((a, b) => (b.share > a.share ? b : a));
    slides.push({ kind: "zones", zones, topZone });
  }

  const cells = repMaxMatrix(sessions, name, now, bw);
  if (cells.some(Boolean)) {
    slides.push({ kind: "repMax", cells, heaviestKg: Math.max(...cells.filter((c): c is RepMax => c != null).map((c) => c.loadKg)) });
  }

  const map = loadRepsScatter(sessions, name, now, bw);
  if (map.points.length >= 5) slides.push({ kind: "loadReps", map, workingSets: map.points.length });

  const surface = tonnageSurface(sessions, name, 12, now, bw);
  if (surface.maxKg > 0) slides.push({ kind: "surface", surface, peakKg: surface.maxKg });

  const cmp = compareSlide();
  if (cmp) slides.push(cmp);

  slides.push(consistency);
  return { name, kind, period, stats, sessionsInPeriod, slides };
}
