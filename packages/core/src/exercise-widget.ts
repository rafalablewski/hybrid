import type { LoggedSession } from "./engines/session";
import { e1rmSeries, paceSeries, isWorkingSet, effectiveSetLoadKg, type PacePoint } from "./engines/session";
import { bwAt } from "./bodyweight";
import { exerciseHistory } from "./engines/records";
import {
  exerciseDashboard,
  exerciseKind,
  periodCutoff,
  type ExercisePeriod,
  type ExerciseStats,
} from "./engines/exercise";
import {
  e1rmTrendWithPRs,
  weeklyTonnage,
  intensityDistribution,
  paceCurve,
  recentRunDeltas,
  type PrPoint,
  type WeekTonnage,
  type IntensityZone,
  type PaceBand,
  type RunDelta,
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

export type ExerciseWidgetMetric = "e1rm" | "pace" | "volume";

export interface ExerciseWidgetCard {
  name: string;
  kind: "strength" | "cardio" | "conditioning";
  metric: ExerciseWidgetMetric;
  /** headline value — kg (e1rm), sec/km (pace) or total kg (volume), 8-week window */
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

// Working sets of the movement in ANY set-bearing block (strength AND
// conditioning — the analytics module's liftSets is strength-only, which
// leaves conditioning moves like KB Swing without volume numbers).
interface VolSet {
  t: number;
  loadKg: number;
  reps: number;
  rpe: number | null;
}
function volumeSets(sessions: LoggedSession[], name: string, now: number, bw?: BodyweightInput): VolSet[] {
  const out: VolSet[] = [];
  for (const s of sessions) {
    const t = ts(s.startedAt);
    if (t > now) continue;
    const bwKg = bwAt(bw, s.startedAt);
    for (const b of s.blocks) {
      if (b.kind === "cardio" || b.name !== name || !("sets" in b) || !b.sets) continue;
      for (const set of b.sets) {
        if (!isWorkingSet(set)) continue;
        const loadKg = effectiveSetLoadKg(name, set.load, bwKg);
        const reps = parseFloat(set.reps ?? "");
        if (!Number.isFinite(loadKg) || loadKg <= 0 || !Number.isFinite(reps) || reps <= 0) continue;
        const rpe = parseFloat(set.rpe ?? "");
        out.push({ t, loadKg, reps, rpe: Number.isFinite(rpe) ? rpe : null });
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Weekly base/hard tonnage over trailing 7-day buckets, oldest → newest —
 *  the kind-agnostic counterpart of weeklyTonnage for conditioning moves. */
export function weeklyVolume(
  sessions: LoggedSession[],
  name: string,
  weeks: number,
  now = Date.now(),
  bw?: BodyweightInput,
): WeekTonnage[] {
  const rows: WeekTonnage[] = Array.from({ length: weeks }, (_, w) => ({
    weekStart: new Date(now - (weeks - w) * 7 * DAY).toISOString().slice(0, 10),
    baseKg: 0,
    hardKg: 0,
  }));
  for (const s of volumeSets(sessions, name, now, bw)) {
    const weeksAgo = Math.floor((now - s.t) / (7 * DAY));
    if (weeksAgo >= weeks) continue;
    const row = rows[weeks - 1 - weeksAgo]!;
    const kg = s.loadKg * s.reps;
    if (s.rpe != null && s.rpe >= 8) row.hardKg += kg;
    else row.baseKg += kg;
  }
  return rows.map((r) => ({ ...r, baseKg: Math.round(r.baseKg), hardKg: Math.round(r.hardKg) }));
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
    if (all.length === 0) return null;
    const { cur, prev } = splitWindows(all, now);
    const best = (pts: PacePoint[]) => (pts.length ? Math.min(...pts.map((p) => p.secPerKm)) : NaN);
    const value = cur.length ? best(cur) : best(all.slice(-1));
    // pace: sign of the raw change, improvement = got faster (negative change)
    const deltaPct = cur.length && prev.length ? pctChange(best(cur), best(prev)) : null;
    const spark = (cur.length >= 2 ? cur : all.slice(-8)).map((p) => p.secPerKm);
    return { name, kind, metric: "pace", value, deltaPct, improving: deltaPct == null ? null : deltaPct < 0, spark, sessions: count };
  }

  if (kind === "strength") {
    const all = e1rmSeries(sessions, name, bw).filter((p) => ts(p.date) <= now);
    if (all.length > 0) {
      const { cur, prev } = splitWindows(all, now);
      const best = (pts: { e1rm: number }[]) => (pts.length ? Math.max(...pts.map((p) => p.e1rm)) : NaN);
      const value = cur.length ? best(cur) : best(all.slice(-1));
      const deltaPct = cur.length && prev.length ? pctChange(best(cur), best(prev)) : null;
      const spark = (cur.length >= 2 ? cur : all.slice(-8)).map((p) => p.e1rm);
      return { name, kind, metric: "e1rm", value, deltaPct, improving: deltaPct == null ? null : deltaPct > 0, spark, sessions: count };
    }
    // strength logged without loads (e.g. band work) falls through to volume
  }

  // conditioning (and load-less strength): 8-week tonnage vs the 8 before
  const weeks = weeklyVolume(sessions, name, 16, now, bw).map((w) => w.baseKg + w.hardKg);
  const curW = weeks.slice(8), prevW = weeks.slice(0, 8);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const value = sum(curW);
  if (value <= 0 && count === 0) return null;
  const deltaPct = pctChange(value, sum(prevW));
  return { name, kind, metric: "volume", value, deltaPct, improving: deltaPct == null ? null : deltaPct > 0, spark: curW, sessions: count };
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
  | { kind: "e1rmTrend"; points: PrPoint[]; bestE1rm: number; deltaPct: number | null; improving: boolean | null }
  | { kind: "tonnage"; weeks: WeekTonnage[]; avgWeekKg: number; deltaPct: number | null; improving: boolean | null }
  | { kind: "zones"; zones: IntensityZone[]; topZone: IntensityZone | null }
  | { kind: "loadMix"; loads: { loadKg: number; share: number }[]; topLoadKg: number | null }
  | { kind: "consistency"; weekly: number[]; weeksTrained: number; weeksTotal: number }
  | { kind: "paceTrend"; points: PacePoint[]; bestSec: number | null; deltaPct: number | null; improving: boolean | null }
  | { kind: "paceCurve"; bands: PaceBand[]; fastestBandSec: number | null }
  | { kind: "runDeltas"; runs: RunDelta[]; avgSec: number | null; lastDeltaSec: number | null };

export interface ExercisePageModel {
  name: string;
  kind: "strength" | "cardio" | "conditioning";
  period: ExercisePeriod;
  /** the existing per-movement dashboard — feeds the quiet substats row */
  stats: ExerciseStats;
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
  const slides: ExercisePageSlide[] = [];

  const weekly = weeklySessionCounts(sessions, name, CONSISTENCY_WEEKS, now);
  const consistency: ExercisePageSlide = {
    kind: "consistency",
    weekly,
    weeksTrained: weekly.filter((w) => w > 0).length,
    weeksTotal: CONSISTENCY_WEEKS,
  };

  if (kind === "cardio") {
    const points = paceSeries(sessions, name).filter((p) => ts(p.date) <= now);
    const { cur, prev } = splitWindows(points, now);
    const best = (pts: PacePoint[]) => (pts.length ? Math.min(...pts.map((p) => p.secPerKm)) : null);
    const bestSec = best(cur) ?? best(points);
    const deltaPct = cur.length && prev.length ? pctChange(best(cur)!, best(prev)!) : null;
    slides.push({ kind: "paceTrend", points, bestSec, deltaPct, improving: deltaPct == null ? null : deltaPct < 0 });
    const bands = paceCurve(sessions, name, now);
    slides.push({ kind: "paceCurve", bands, fastestBandSec: bands[0]?.bestAllSec ?? null });
    const rd = recentRunDeltas(sessions, name, 8, now);
    slides.push({ kind: "runDeltas", runs: rd.runs, avgSec: rd.avgSec, lastDeltaSec: rd.runs.at(-1)?.deltaSec ?? null });
    slides.push(consistency);
    return { name, kind, period, stats, slides };
  }

  if (kind === "strength") {
    const points = e1rmTrendWithPRs(sessions, name, period, now, bw);
    if (points.length > 0) {
      const all = e1rmSeries(sessions, name, bw).filter((p) => ts(p.date) <= now);
      const { cur, prev } = splitWindows(all, now);
      const best = (pts: { e1rm: number }[]) => (pts.length ? Math.max(...pts.map((p) => p.e1rm)) : NaN);
      const deltaPct = cur.length && prev.length ? pctChange(best(cur), best(prev)) : null;
      slides.push({
        kind: "e1rmTrend",
        points,
        bestE1rm: Math.max(...points.map((p) => p.e1rm)),
        deltaPct,
        improving: deltaPct == null ? null : deltaPct > 0,
      });
    }
  }

  // tonnage: the strength engine's Monday-aligned weeks when they have data,
  // else the kind-agnostic buckets (conditioning moves live outside liftSets)
  const weeks =
    kind === "strength"
      ? weeklyTonnage(sessions, name, PERIOD_WEEKS[period], now, bw)
      : weeklyVolume(sessions, name, PERIOD_WEEKS[period], now, bw);
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

  if (kind === "strength") {
    const zones = intensityDistribution(sessions, name, period, now, bw);
    if (zones.some((z) => z.count > 0)) {
      const topZone = zones.reduce((a, b) => (b.share > a.share ? b : a));
      slides.push({ kind: "zones", zones, topZone });
    }
  } else {
    // conditioning: which loads the work happened at ("most-used bell")
    const sets = volumeSets(sessions, name, now, bw).filter((s) => s.t > periodCutoff(period, now));
    if (sets.length > 0) {
      const byLoad = new Map<number, number>();
      for (const s of sets) byLoad.set(s.loadKg, (byLoad.get(s.loadKg) ?? 0) + 1);
      const loads = [...byLoad.entries()]
        .map(([loadKg, n]) => ({ loadKg, share: Math.round((n / sets.length) * 100) / 100 }))
        .sort((a, b) => b.share - a.share || a.loadKg - b.loadKg)
        .slice(0, 4);
      slides.push({ kind: "loadMix", loads, topLoadKg: loads[0]?.loadKg ?? null });
    }
  }

  slides.push(consistency);
  return { name, kind, period, stats, slides };
}
