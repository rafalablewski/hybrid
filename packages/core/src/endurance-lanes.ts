import type { CardioBlock, CardioDiscipline, LoggedSession } from "./engines/session";
import { cardioSeconds } from "./engines/session";
import {
  disciplineSessions,
  paceEffortSplit,
  runTotals,
  weeklyMileage,
  type EffortSplit,
  type WeekMileage,
} from "./engines/running";
import type { ChartReading } from "./chart-scrub";
import { activeDisciplines, DISCIPLINE_META, disciplinePaceFigure, disciplinePaceUnit } from "./endurance";

/**
 * SPORT LANES — the Endurance block that lives at the bottom of Today.
 *
 * The hub used to be a destination in More, one discipline at a time behind a
 * picker. On Today there is no room for a destination and no patience for a
 * picker, so the block inverts: EVERY logged discipline gets a lane, and a lane
 * is a horizontal rail of that discipline's own analytics — efforts/distance/
 * time, eight-week volume, the pace trend, the pace zones, the last effort.
 *
 * The shape is what makes it affordable. Adding a metric WIDENS a lane's rail;
 * it never LENGTHENS the block. So five disciplines with five cards each still
 * cost five rows, and Today can carry the whole endurance read under Nutrition
 * without turning into a second Endurance screen.
 *
 * Everything here is derived from the existing running engine — no new
 * aggregate, no second definition of a "week" or an "effort". The lane's pace
 * trend is literally weeklyMileage's own buckets read as minutes-per-distance,
 * which is why a bar and a trend point can never disagree.
 *
 * Pure and client-agnostic: web and mobile both render off `enduranceLanes()`,
 * so the two can't drift on lane order, the cap, or what "most trained" means.
 */

/** How the lanes are stacked. `trained` is the default — it matches the hub's
 *  own discipline order (activeDisciplines), so the sport you do most is the
 *  one you see first without scrolling. */
export type LaneOrder = "trained" | "recent" | "longest";

/** The cycle order of the block's one control. */
export const LANE_ORDERS: readonly LaneOrder[] = ["trained", "recent", "longest"] as const;

/** Lanes rendered before the expander. A fourth lane pushes the block past a
 *  screen of its own, which is the point at which Today stops being Today. */
export const LANE_CAP = 3;

/** Weeks of history a lane's volume + pace trend cover. Matches the hub. */
export const LANE_WEEKS = 8;

/** A lane's most recent effort — the one card that is a session rather than a
 *  statistic, and the tap target back into the logged workout. */
export interface LaneEffort {
  /** the cardio block's move name, e.g. "Long run" */
  name: string;
  /** the session's ISO start, for ordering and the "3 days ago" read */
  startedAt: string;
  /** the session id, so a client can open it */
  sessionId: string;
  distanceKm: number;
  minutes: number;
  /** canonical seconds per km, or null when the effort wasn't paced. */
  secPerKm: number | null;
}

/** One discipline's whole read, sized for a rail. */
export interface EnduranceLane {
  discipline: CardioDiscipline;
  /** DISCIPLINE_META passthrough so a renderer needs one import, not two. */
  emoji: string;
  labelKey: string;
  /** whole-history totals for this discipline */
  efforts: number;
  distanceKm: number;
  minutes: number;
  /** the last LANE_WEEKS buckets, oldest → newest */
  weeks: WeekMileage[];
  /** the newest bucket, lifted out because every client shows it */
  thisWeek: WeekMileage;
  /** cardio minutes by pace zone */
  zones: EffortSplit;
  /**
   * Mean seconds-per-km for each week that has paced data, oldest → newest.
   * Fewer than two points means there is no trend to draw yet — clients hide
   * the card rather than drawing a line through one dot.
   */
  paceTrend: number[];
  /** ISO week starts aligned with `paceTrend`. The trend SKIPS the weeks with
   *  nothing paced in them, so a held point can only name its own week if the
   *  lane says which bucket each point came from — reading `weeks[i]` beside a
   *  trend point dates it by a different series. */
  paceTrendWeeks: string[];
  last: LaneEffort | null;
}

const isCardio = (b: { kind: string }): b is CardioBlock => b.kind === "cardio";

/** A week's mean pace, or null when the bucket has no paced volume. Reading the
 *  trend off the SAME buckets the volume bars use is deliberate: two cards in
 *  one lane must never disagree about what a week was. The DIVISION takes the
 *  bucket's exact `seconds` (device-truth), not the whole minutes the bars
 *  draw — a rate derived from rounded minutes drifts against the zone card and
 *  the pace printed on the effort itself. */
function weekPace(w: WeekMileage): number | null {
  if (w.km <= 0 || w.seconds <= 0) return null;
  return w.seconds / w.km;
}

/** The most recent cardio effort in an already-narrowed discipline slice. */
function lastEffort(sessions: LoggedSession[]): LaneEffort | null {
  let best: LaneEffort | null = null;
  let bestAt = -Infinity;
  for (const s of sessions) {
    const at = new Date(s.startedAt).getTime();
    if (!Number.isFinite(at) || at <= bestAt) continue;
    for (const b of s.blocks) {
      if (!isCardio(b)) continue;
      const distanceKm = b.distance && b.distance > 0 ? b.distance : 0;
      const minutes = b.minutes && b.minutes > 0 ? b.minutes : 0;
      // Second-accurate where a device recorded the effort (see device-truth.ts);
      // the whole minutes stay for display, but a pace derived from them can
      // disagree with the watch's own summary.
      const sec = cardioSeconds(b);
      best = {
        name: b.name,
        startedAt: s.startedAt,
        sessionId: s.id,
        distanceKm: Math.round(distanceKm * 10) / 10,
        minutes: Math.round(minutes),
        secPerKm: distanceKm > 0 && sec != null ? Math.round(sec / distanceKm) : null,
      };
      bestAt = at;
      break; // one effort per session is enough for a "last effort" card
    }
  }
  return best;
}

/**
 * One lane per discipline the athlete actually logs, in `trained` order
 * (most efforts first, distance breaking ties) — the same order the hub's
 * picker uses, so moving between the two never reshuffles the sports.
 *
 * Disciplines with no logged cardio never appear, which is why the block needs
 * no empty state per lane: a lane exists precisely because there is something
 * in it.
 */
export function enduranceLanes(
  sessions: LoggedSession[],
  opts: { weeks?: number; now?: number } = {},
): EnduranceLane[] {
  const weeks = opts.weeks ?? LANE_WEEKS;
  const now = opts.now ?? Date.now();
  return activeDisciplines(sessions).map((summary) => {
    const d = summary.discipline;
    const slice = disciplineSessions(sessions, d);
    const buckets = weeklyMileage(slice, weeks, now);
    const totals = runTotals(slice);
    const meta = DISCIPLINE_META[d];
    const paced = buckets
      .map((w) => ({ weekStart: w.weekStart, secPerKm: weekPace(w) }))
      .filter((p): p is { weekStart: string; secPerKm: number } => p.secPerKm != null);
    return {
      discipline: d,
      emoji: meta.emoji,
      labelKey: meta.labelKey,
      efforts: totals.efforts,
      distanceKm: totals.distanceKm,
      minutes: totals.minutes,
      weeks: buckets,
      thisWeek: buckets[buckets.length - 1]!,
      zones: paceEffortSplit(slice),
      paceTrend: paced.map((p) => p.secPerKm),
      paceTrendWeeks: paced.map((p) => p.weekStart),
      last: lastEffort(slice),
    };
  });
}

/** The lanes re-stacked. Ties fall back to the `trained` order so the sequence
 *  is total — flipping the control twice always lands you back where you were. */
export function orderLanes(lanes: EnduranceLane[], order: LaneOrder): EnduranceLane[] {
  const tie = (a: EnduranceLane, b: EnduranceLane) => b.efforts - a.efforts || b.distanceKm - a.distanceKm;
  const at = (l: EnduranceLane) => (l.last ? new Date(l.last.startedAt).getTime() : -Infinity);
  const sorted = [...lanes];
  if (order === "recent") sorted.sort((a, b) => at(b) - at(a) || tie(a, b));
  else if (order === "longest") sorted.sort((a, b) => b.distanceKm - a.distanceKm || tie(a, b));
  else sorted.sort(tie);
  return sorted;
}

/** The next order in the cycle — the block's one control is a cycling label, so
 *  the sequence lives here rather than in two copies of the same modulo. */
export function nextLaneOrder(order: LaneOrder): LaneOrder {
  const i = LANE_ORDERS.indexOf(order);
  return LANE_ORDERS[(i + 1) % LANE_ORDERS.length]!;
}

// RETIRED: laneWeekTotals() summed this week across every lane, for the totals
// strip the block used to open with. That strip is gone — the "This week" card
// higher up Today states the week for ALL training, and a second cross-sport
// total beside it counted a different population under a near-identical label.
// The week's distance now rides in that card (week-verdict.ts); per-sport
// figures stay on each lane, where the lane names the scope.

export interface ZonePercents {
  easy: number;
  moderate: number;
  hard: number;
  /** false when nothing is paced yet — clients hide the zone card. */
  any: boolean;
}

/**
 * The pace split as whole percentages that ALWAYS sum to 100 (largest
 * remainder), so the legend can't read 33/33/33 beside a bar that fills the
 * row. A single-zone discipline (every walk is easy) correctly reads 100/0/0.
 */
export function zonePercents(zones: EffortSplit): ZonePercents {
  const raw = [zones.easy, zones.moderate, zones.hard];
  const total = raw[0]! + raw[1]! + raw[2]!;
  if (total <= 0) return { easy: 0, moderate: 0, hard: 0, any: false };
  const exact = raw.map((v) => (v / total) * 100);
  const floor = exact.map(Math.floor);
  let left = 100 - floor[0]! - floor[1]! - floor[2]!;
  const byRemainder = [0, 1, 2].sort((a, b) => exact[b]! - floor[b]! - (exact[a]! - floor[a]!));
  for (const i of byRemainder) {
    if (left <= 0) break;
    floor[i] = floor[i]! + 1;
    left -= 1;
  }
  return { easy: floor[0]!, moderate: floor[1]!, hard: floor[2]!, any: true };
}

export interface PaceDelta {
  /** canonical seconds-per-km gained (positive) or lost (negative) over the trend. */
  secPerKm: number;
  /** true when the athlete got faster — a LOWER seconds-per-km, on every
   *  discipline, because storage is always seconds per km. */
  faster: boolean;
  /** the endpoints, kept because a km/h delta can't be derived from the
   *  seconds-per-km difference alone — it needs both rates. */
  fromSecPerKm: number;
  toSecPerKm: number;
}

/** First point vs last. Null when there aren't two points to compare. */
export function paceDelta(trend: number[]): PaceDelta | null {
  if (trend.length < 2) return null;
  const first = trend[0]!;
  const last = trend[trend.length - 1]!;
  return { secPerKm: Math.round(first - last), faster: last <= first, fromSecPerKm: first, toSecPerKm: last };
}

/**
 * The trend delta in the discipline's OWN unit — the size only, with direction
 * left to the caller's arrow. A canonical seconds-per-km difference is the
 * wrong number to show a swimmer: their pace reads /100m, so the delta must be
 * scaled to match ("26s/100m", not "263s/km"), and a cyclist's reads as a
 * change in km/h, which needs both endpoints rather than their difference.
 */
export function formatPaceDelta(delta: PaceDelta, discipline: CardioDiscipline): string {
  const meta = DISCIPLINE_META[discipline];
  // Take the magnitude BEFORE rounding: Math.round(-12.5) is -12 but
  // Math.round(12.5) is 13, so rounding first would make the same pair of weeks
  // report a different size depending on which way it went.
  if (meta.mode === "speed") {
    const kmh = Math.abs(3600 / delta.toSecPerKm - 3600 / delta.fromSecPerKm);
    return `${Math.round(kmh * 10) / 10} km/h`;
  }
  return `${Math.round(Math.abs(delta.secPerKm) * (meta.pacePer / 1000))}s${disciplinePaceUnit(discipline)}`;
}

/**
 * The arrow for a trend delta, pointing the way the DISPLAYED number moved —
 * not the way the stored one did.
 *
 * Getting quicker lowers a pace (5:42 → 5:30, ↓) but RAISES a speed (30 → 31.3
 * km/h, ↑). Both are the same fall in canonical seconds-per-km, so an arrow
 * driven off `faster` alone tells a cyclist their speed dropped when it grew.
 * The colour is a separate signal and stays keyed to `faster`.
 */
export function paceDeltaArrow(delta: PaceDelta, discipline: CardioDiscipline): "↑" | "↓" {
  const rises = DISCIPLINE_META[discipline].mode === "speed" ? delta.faster : !delta.faster;
  return rises ? "↑" : "↓";
}

/**
 * Where a trend point sits vertically, 0 (top) → 1 (bottom), for a sparkline.
 *
 * FASTER IS UP, on every discipline. That works out of one rule because storage
 * is always canonical seconds-per-km: a lower number is a quicker run AND a
 * faster ride, so the smallest value always takes the top of the box. A flat
 * series sits on the midline rather than collapsing onto an edge.
 */
export function paceTrendPoints(trend: number[]): number[] {
  if (trend.length === 0) return [];
  const min = Math.min(...trend);
  const max = Math.max(...trend);
  const range = max - min;
  if (range === 0) return trend.map(() => 0.5);
  return trend.map((v) => (v - min) / range);
}

/* ── HOLDING A LANE'S CHART ──────────────────────────────────────────────── */

/**
 * One week of a lane's volume strip, held.
 *
 * The tile's resting figure is THIS WEEK's km, so the held figure is the same
 * quantity for another week — the label above it swaps from the scope to the
 * week, and the number underneath answers for that week instead. The unit stays
 * km on every discipline, exactly as the resting tile prints it.
 */
export function laneVolumeReading(lane: EnduranceLane, index: number): ChartReading | null {
  const w = lane.weeks[index];
  if (!w) return null;
  const max = Math.max(...lane.weeks.map((x) => x.km), 0);
  return {
    index,
    weekStart: w.weekStart,
    value: String(w.km),
    unit: "km",
    efforts: w.efforts,
    best: w.km > 0 && w.km === max,
  };
}

/** One point of a lane's pace trend, held — in the discipline's own reading
 *  (a pace for a runner, a speed for a cyclist), dated by the trend's OWN
 *  alignment rather than by the volume strip's index. */
export function lanePaceReading(lane: EnduranceLane, index: number): ChartReading | null {
  const sec = lane.paceTrend[index];
  if (sec == null) return null;
  return {
    index,
    weekStart: lane.paceTrendWeeks[index] ?? "",
    value: disciplinePaceFigure(sec, lane.discipline),
    unit: disciplinePaceUnit(lane.discipline),
    efforts: null,
    // Fastest is best on every discipline: storage is canonical seconds-per-km,
    // so the lowest number is the quickest run AND the quickest ride.
    best: sec === Math.min(...lane.paceTrend),
  };
}

/** Bar heights for the volume card, 0 → 1 against the lane's own best week.
 *  Scaled per lane on purpose: a swim week and a bike week share no axis. */
export function volumeBars(weeks: WeekMileage[]): number[] {
  const max = Math.max(...weeks.map((w) => w.km), 0);
  if (max <= 0) return weeks.map(() => 0);
  return weeks.map((w) => w.km / max);
}
