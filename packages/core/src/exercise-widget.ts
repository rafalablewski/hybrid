import type { CardioBlock, CardioDiscipline, LoggedSession } from "./engines/session";
import { topLoadSeries, paceSeries, paceClock, type PacePoint } from "./engines/session";
import { blockDiscipline } from "./engines/running";
import { activeDisciplines, formatDisciplinePace } from "./endurance";
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
import type { ChartReading } from "./chart-scrub";
import { fmtTonnage, fmtWeight, splitFigure, type WeightUnit } from "./units";
import { mmss } from "./format";
import { MAX_EXERCISE_FAVOURITES } from "./exercise-favourites";
import { deviceTrueSessions } from "./device-truth";

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
  /**
   * The movement's cardio discipline, resolved through the SAME rule the lanes
   * use (`blockDiscipline` — the stamped tag, falling back to the name). Set on
   * every cardio card and undefined otherwise.
   *
   * It exists so a rate can be printed in its discipline's own convention. The
   * card used to hand its `sec/km` value to a hard-coded "/km", which showed a
   * swimmer "38:36 /km" — arithmetically right, conventionally meaningless, and
   * contradicted by the Endurance lane 250dp below printing the same rate as
   * "3:52 /100m" through `formatDisciplinePace`. One function knows what a
   * discipline's pace reads as; every surface must go through it.
   */
  discipline?: CardioDiscipline;
  metric: ExerciseWidgetMetric;
  /** headline value — kg (weight = heaviest lift), sec/km (pace), total kg
   *  (volume) or total minutes (time), 8-week window */
  value: number;
  /** signed % change vs the previous 8-week window, 1 decimal; null = no baseline */
  deltaPct: number | null;
  /**
   * THE FIGURE `deltaPct` IS MEASURED FROM — the previous window's value, in
   * the same unit as `value`. Null exactly when `deltaPct` is null.
   *
   * It exists because the card now PRINTS its baseline, and a percentage whose
   * baseline is not on the card is a number the reader has to trust. The two
   * fields are computed from the same pair in every branch below
   * (`pctChange(value, prevValue)`), so they cannot drift apart — a test pins
   * that they are null together.
   *
   * IT IS THE BEST BASELINE THAT EXISTS, not always the previous window — and
   * that correction is the whole reason this shipped twice.
   *
   * The first cut used the previous 8-week window and nothing else, on the
   * argument that `spark[0]` is a different quantity (the spark falls back to
   * all-time points when the window is thin) and that printing it beside a
   * window-over-window percentage would put TWO baselines on one card. The
   * argument was right. The conclusion was wrong, because it made the card
   * silent for every athlete without sixteen weeks of history on a movement: a
   * three-week-old account climbing 60 → 65 → 70 kg printed "Heaviest —
   * 8 weeks" and no change at all, which is the card it replaced minus a chart.
   *
   * So the baseline is chosen per card — the previous window when there is one,
   * otherwise the window's own first point — and `deltaPct` is ALWAYS computed
   * from whichever was chosen. One comparison, stated with its own baseline;
   * the two can no longer disagree because there is only ever one.
   */
  prevValue: number | null;
  /**
   * The baseline's DATE, when it came from the athlete's own log rather than
   * from the previous window — so the card can say "from 60 kg, 2 Aug" instead
   * of naming a period it did not measure. Null when `prevValue` is the
   * previous window (which is a period, not a day) or when there is no
   * baseline at all.
   */
  prevAt: string | null;
  /** whether that change is an improvement (pace: lower is better); null with no baseline */
  improving: boolean | null;
  /** sparkline series inside the window, oldest → newest (falls back to the
   *  last few all-time points when the window is too thin to draw) */
  spark: number[];
  /**
   * What each `spark` point IS — a SESSION's own reading, or a WEEK's bucket.
   * The series is built one way for a lift with parseable loads (one point per
   * session) and the other for a movement measured by volume or minutes (one
   * point per week), and a held point cannot name itself without knowing
   * which. A readout that says "Week of 12 Jul" over a single session's lift
   * is the same class of lie as dating a trend point by the wrong bucket.
   */
  sparkBy: "session" | "week";
  /** ISO date per `spark` point — the session's date, or the week's start. */
  sparkAt: string[];
  /** sessions that trained this movement inside the window */
  sessions: number;
}

/** Signed % change with a sane null for a missing/zero baseline. 1 decimal. */
export function pctChange(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

const ts = (iso: string): number => new Date(iso).getTime();

/**
 * The discipline a cardio movement belongs to — the most recent stamp wins, so
 * a move re-tagged at log time reads as what it is now. Resolved through the
 * lanes' own `blockDiscipline`, never re-classified here: two definitions of
 * "what sport is this" is how a swim ends up measured in kilometres.
 */
function moveDiscipline(sessions: LoggedSession[], name: string): CardioDiscipline | undefined {
  let out: CardioDiscipline | undefined;
  let at = -Infinity;
  for (const s of sessions) {
    const t = ts(s.startedAt);
    if (!Number.isFinite(t) || t < at) continue;
    for (const b of s.blocks) {
      if (b.kind !== "cardio" || b.name !== name) continue;
      out = blockDiscipline(b as CardioBlock);
      at = t;
    }
  }
  return out;
}

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
  // Minutes measured beat minutes typed wherever a device recorded the session
  // (paceSeries below is device-true for the same reason — see device-truth.ts).
  for (const s of deviceTrueSessions(sessions)) {
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
/**
 * THE BEST BASELINE THAT EXISTS — the previous window if there is one, else the
 * window's own first point, else nothing.
 *
 * A card that can only speak after sixteen weeks says nothing to the athlete
 * who most needs to see a number moving. The previous window is the better
 * comparison and stays first; the spark's own opening point is the honest
 * second, and it comes WITH ITS DATE so the card names a day it actually
 * measured rather than a period it did not.
 *
 * A zero or negative baseline is no baseline: `pctChange` refuses it anyway,
 * and a card must never print "from 0".
 */
function baseline(
  prevWindow: number | null,
  spark: number[],
  sparkAt: string[],
): { value: number; at: string | null } | null {
  if (prevWindow != null && prevWindow > 0) return { value: prevWindow, at: null };
  const first = spark[0];
  if (spark.length < 2 || first == null || !(first > 0)) return null;
  return { value: first, at: sparkAt[0] ?? null };
}

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
      const points = cur.length >= 2 ? cur : all.slice(-8);
      const base = baseline(
        cur.length && prev.length ? best(prev) : null,
        points.map((p) => p.secPerKm),
        points.map((p) => p.date),
      );
      const deltaPct = base == null ? null : pctChange(value, base.value);
      return {
        name, kind, discipline: moveDiscipline(sessions, name), metric: "pace", value, deltaPct,
        prevValue: deltaPct == null ? null : base!.value,
        prevAt: deltaPct == null ? null : base!.at,
        improving: deltaPct == null ? null : deltaPct < 0,
        spark: points.map((p) => p.secPerKm),
        sparkBy: "session", sparkAt: points.map((p) => p.date),
        sessions: count,
      };
    }
    // minutes-only cardio (a match, a swim without distance) → time metric
  }

  if (kind === "strength") {
    const all = topLoadSeries(sessions, name, bw).filter((p) => ts(p.date) <= now);
    if (all.length > 0) {
      const { cur, prev } = splitWindows(all, now);
      const best = (pts: { weightKg: number }[]) => (pts.length ? Math.max(...pts.map((p) => p.weightKg)) : NaN);
      const value = cur.length ? best(cur) : best(all.slice(-1));
      const points = cur.length >= 2 ? cur : all.slice(-8);
      const base = baseline(
        cur.length && prev.length ? best(prev) : null,
        points.map((p) => p.weightKg),
        points.map((p) => p.date),
      );
      const deltaPct = base == null ? null : pctChange(value, base.value);
      return {
        name, kind, metric: "weight", value, deltaPct,
        prevValue: deltaPct == null ? null : base!.value,
        prevAt: deltaPct == null ? null : base!.at,
        improving: deltaPct == null ? null : deltaPct > 0,
        spark: points.map((p) => p.weightKg),
        sparkBy: "session", sparkAt: points.map((p) => p.date),
        sessions: count,
      };
    }
    // strength logged without parseable loads: weekly tonnage as the fallback
    const buckets = weeklyTonnage(sessions, name, 16, now, bw);
    const weeks = buckets.map((w) => w.baseKg + w.hardKg);
    const curW = weeks.slice(8), prevW = weeks.slice(0, 8);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    if (sum(curW) > 0) {
      const base = baseline(sum(prevW) > 0 ? sum(prevW) : null, curW, buckets.slice(8).map((w) => w.weekStart));
      const deltaPct = base == null ? null : pctChange(sum(curW), base.value);
      return {
        name, kind, metric: "volume", value: sum(curW), deltaPct,
        prevValue: deltaPct == null ? null : base!.value,
        prevAt: deltaPct == null ? null : base!.at,
        improving: deltaPct == null ? null : deltaPct > 0,
        spark: curW, sparkBy: "week", sparkAt: buckets.slice(8).map((w) => w.weekStart),
        sessions: count,
      };
    }
    return null;
  }

  // conditioning + minutes-only cardio: 8-week minutes vs the 8 before
  const minuteWeeks = weeklyMinutes(sessions, name, 16, now);
  const weeks = minuteWeeks.map((w) => w.minutes);
  const curW = weeks.slice(8), prevW = weeks.slice(0, 8);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const value = sum(curW);
  if (value <= 0) return null;
  const base = baseline(sum(prevW) > 0 ? sum(prevW) : null, curW, minuteWeeks.slice(8).map((w) => w.weekStart));
  const deltaPct = base == null ? null : pctChange(value, base.value);
  return {
    name, kind, discipline: kind === "cardio" ? moveDiscipline(sessions, name) : undefined,
    metric: "time", value, deltaPct,
    prevValue: deltaPct == null ? null : base!.value,
    prevAt: deltaPct == null ? null : base!.at,
    improving: deltaPct == null ? null : deltaPct > 0,
    spark: curW, sparkBy: "week", sparkAt: minuteWeeks.slice(8).map((w) => w.weekStart),
    sessions: count,
  };
}

/**
 * How many distinct movements the athlete trained inside the rail's own window
 * — the denominator for the Exercises head's coverage meta ("3 of 11
 * movements").
 *
 * It counts over WIDGET_WINDOW_DAYS, not all time, because the fraction has to
 * be a fraction of the same thing the cards are: a numerator drawn from the
 * last eight weeks over an all-time denominator would be two scopes in one
 * sentence, which is the fault the meta was introduced to fix.
 *
 * The head used to quote this week's tonnage — the same figure the This-week
 * card printed 400dp above, through the same formatter. A quote of the whole
 * parent is indistinguishable from a repeat of it; it also spent the rail's one
 * slot on a fact the reader already had, leaving no room for the one they did
 * not: that the rail is a SELECTION (`max`, default 3), not their whole log.
 */
export function movementsTrained(sessions: LoggedSession[], now = Date.now()): number {
  const names = new Set<string>();
  for (const s of sessions) {
    const t = ts(s.startedAt);
    if (!Number.isFinite(t) || t > now || t <= now - WIDGET_WINDOW_DAYS * DAY) continue;
    for (const b of s.blocks) names.add(b.name);
  }
  return names.size;
}

/**
 * Pick the favourites for the Today widget: explicit `favourites` first (kept
 * in order), then auto-fill so DIFFERENT purposes lead — the most-trained
 * strength lift, cardio move and conditioning move of the last 8 weeks (falling
 * back to all-time), then overall frequency up to `max`.
 *
 * ONE DISCIPLINE, ONE HOME (`deferToLanes`). This rail is about MOVEMENTS; the
 * Endurance block beneath it is about DISCIPLINES. When both render, a swim was
 * appearing in each — as a card reading "38:36 /km" (the window's best) and as
 * a lane reading "3:52 /100m" (the latest week's mean), 250dp apart, with
 * nothing on either saying which was which. Where a discipline already has a
 * lane carrying five tiles of its own depth, the rail hands it over and spends
 * the slot on the next real movement.
 *
 * The exclusion applies to AUTO-FILL only: an explicitly favourited movement is
 * a choice the athlete made, and a de-duplication rule does not get to overrule
 * it. The caller decides whether to defer, because it knows whether the lanes
 * are on screen (Today gates them on the athlete persona; the exercises SCREEN
 * has no lanes at all) — but the lane SET is derived here, from the same
 * `activeDisciplines` the lanes themselves are built from, so the two can't
 * disagree about which disciplines have a home.
 *
 * PINS ARE NEVER TRUNCATED. `max` (3) is the size of the GUESS — how far the
 * auto-fill goes when the athlete has said nothing. Pinning a fourth movement
 * that then failed to appear would read as the pin not working, so the ceiling
 * lifts to the number pinned (up to MAX_EXERCISE_FAVOURITES, the cap the pin
 * list itself enforces). A pin for a movement with no history is still dropped:
 * there is no card to draw.
 */
export function exerciseWidgetCards(
  sessions: LoggedSession[],
  opts: { max?: number; favourites?: string[]; now?: number; bw?: BodyweightInput; deferToLanes?: boolean } = {},
): ExerciseWidgetCard[] {
  const { max = 3, favourites = [], now = Date.now(), bw, deferToLanes = false } = opts;
  const history = exerciseHistory(sessions);
  if (history.length === 0) return [];
  const recent = new Map(history.map((e) => [e.name, sessionCount(sessions, e.name, now, WIDGET_WINDOW_DAYS)]));
  // most-trained first: 8-week count, then all-time count
  const ranked = [...history].sort((a, b) => (recent.get(b.name)! - recent.get(a.name)!) || (b.count - a.count));

  const owned = deferToLanes ? new Set(activeDisciplines(sessions).map((d) => d.discipline)) : null;
  const hasLane = (e: { name: string; kind: string }): boolean => {
    if (!owned || e.kind !== "cardio") return false;
    const d = moveDiscipline(sessions, e.name);
    return d != null && owned.has(d);
  };

  const pinned = favourites.filter((f) => history.some((e) => e.name === f)).slice(0, MAX_EXERCISE_FAVOURITES);
  const cap = Math.max(max, pinned.length);
  const picked: string[] = [...pinned];
  for (const kind of ["strength", "cardio", "conditioning"] as const) {
    if (picked.length >= cap) break;
    const top = ranked.find((e) => e.kind === kind && !picked.includes(e.name) && !hasLane(e));
    if (top) picked.push(top.name);
  }
  for (const e of ranked) {
    if (picked.length >= cap) break;
    if (!picked.includes(e.name) && !hasLane(e)) picked.push(e.name);
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

// ────────────────────────────────────────────────────────────────────
// HOLDING A CHART — what one held point on these surfaces says.
// ────────────────────────────────────────────────────────────────────

/**
 * The geometry a slide's chart is hit-tested with, or null when the slide is
 * not a series over an x-axis and holding it would answer nothing.
 *
 * The clients draw these at different widths (recharts on web, a react-native-
 * svg viewBox on mobile) but they must agree on WHICH POINT a press reads, so
 * the count and the mode are decided once, here. A scatter, a surface, a
 * rep-max grid, a consistency heat map and the meter rows are all deliberately
 * absent: their cells already name themselves, and there is no single series
 * under the finger to report.
 *
 * `by` says what one point IS, so a client can pick the right sentence for the
 * date it prints: a SESSION ("12 Jul") or a WEEK ("Week of 12 Jul"). Getting
 * that wrong reads as a rounding error in the data rather than in the copy.
 */
export function exerciseSlideGeometry(
  slide: ExercisePageSlide,
): { count: number; mode: "band" | "point"; by: "session" | "week" } | null {
  switch (slide.kind) {
    case "weightTrend": return slide.points.length >= 2 ? { count: slide.points.length, mode: "point", by: "session" } : null;
    case "paceTrend": return slide.points.length >= 2 ? { count: slide.points.length, mode: "point", by: "session" } : null;
    case "tonnage": return slide.weeks.length >= 2 ? { count: slide.weeks.length, mode: "band", by: "week" } : null;
    case "weeklyMinutes": return slide.weeks.length >= 2 ? { count: slide.weeks.length, mode: "band", by: "week" } : null;
    case "runDeltas": return slide.runs.length >= 2 ? { count: slide.runs.length, mode: "band", by: "session" } : null;
    default: return null;
  }
}

/**
 * The figure under a held finger on one of the exercise page's charts, in the
 * athlete's own weight unit. Null for a slide that has no series to read, or an
 * index off the end of the one it has.
 *
 * `best` marks the point the chart already draws differently — the PR on the
 * weight trend, the fastest run, the biggest week — so a held readout and the
 * dot beside it can never disagree about which point was the best one.
 */
export function exerciseSlideReading(slide: ExercisePageSlide, index: number, units: WeightUnit): ChartReading | null {
  const reading = (at: string, value: string, unit: string, best: boolean): ChartReading =>
    ({ index, weekStart: at, value, unit, efforts: null, best });

  switch (slide.kind) {
    case "weightTrend": {
      const p = slide.points[index];
      if (!p) return null;
      const [v, u] = splitFigure(fmtWeight(p.weightKg, units));
      return reading(p.date, v, u, p.pr);
    }
    case "paceTrend": {
      const p = slide.points[index];
      if (!p) return null;
      return reading(p.date, mmss(p.secPerKm), "/km", slide.bestSec != null && p.secPerKm === slide.bestSec);
    }
    case "tonnage": {
      const w = slide.weeks[index];
      if (!w) return null;
      const total = w.baseKg + w.hardKg;
      const peak = Math.max(...slide.weeks.map((x) => x.baseKg + x.hardKg));
      const [v, u] = splitFigure(fmtTonnage(total, units));
      return reading(w.weekStart, v, u, total > 0 && total === peak);
    }
    case "weeklyMinutes": {
      const w = slide.weeks[index];
      if (!w) return null;
      const peak = Math.max(...slide.weeks.map((x) => x.minutes));
      return reading(w.weekStart, String(w.minutes), "min", w.minutes > 0 && w.minutes === peak);
    }
    case "runDeltas": {
      const r = slide.runs[index];
      if (!r) return null;
      // The bar IS the delta, so the delta is what the readout states — signed,
      // because "12 s" without its sign is the one thing this chart never says.
      const best = Math.min(...slide.runs.map((x) => x.deltaSec));
      return reading(r.date, `${r.deltaSec > 0 ? "+" : r.deltaSec < 0 ? "−" : ""}${Math.abs(r.deltaSec)}`, "s/km", r.deltaSec === best);
    }
    default: return null;
  }
}

/**
 * A RAW FIGURE IN THE CARD'S OWN CONVENTION — `exerciseCardFigure(card, 70,
 * "kg")` → `{ value: "70", unit: "kg" }`.
 *
 * ONE FORMATTER FOR THE HEADLINE AND ITS BASELINE, which is the whole reason it
 * exists as a function rather than as two call sites. The card prints `value`
 * and `prevValue` beside each other; if those two took different code paths
 * they would eventually disagree about the unit, and a card reading
 * "38:36 /km — from 3:52 /100m" is worse than one that prints no baseline at
 * all.
 *
 * THE PACE CASE IS WHY THIS IS NOT A ONE-LINER. A rate reads in ITS
 * DISCIPLINE'S convention — /km on the road, /100m in the pool, /500m on the
 * erg, km/h on the bike — and `formatDisciplinePace` is the one function that
 * knows. The reading this replaced hard-coded "/km" for every discipline, which
 * is the exact defect the headline had already been fixed for: it showed a
 * swimmer "38:36 /km" while the lane below printed the same rate as
 * "3:52 /100m". That was survivable while the string only appeared under a held
 * finger. It is not survivable now the baseline is always on screen.
 *
 * A card with no resolved discipline keeps the /km fallback, which is what its
 * canonical value already is.
 */
export function exerciseCardFigure(
  card: Pick<ExerciseWidgetCard, "metric" | "discipline">,
  raw: number,
  units: WeightUnit,
): { value: string; unit: string } {
  if (card.metric === "pace") {
    if (!card.discipline) return { value: paceClock(raw), unit: "/km" };
    const s = formatDisciplinePace(raw, card.discipline);
    const i = s.lastIndexOf(" ");
    return i < 0 ? { value: s, unit: "" } : { value: s.slice(0, i), unit: s.slice(i + 1) };
  }
  if (card.metric === "time") return { value: String(Math.round(raw)), unit: "min" };
  const [value, unit] = card.metric === "weight"
    ? splitFigure(fmtWeight(raw, units))
    : splitFigure(fmtTonnage(raw, units));
  return { value, unit };
}
