import type { CardioDiscipline, LoggedSession } from "./engines/session";
import { paceSeries, strengthPrProof, topLoadSeries, type StrengthPrProof } from "./engines/session";
import { exerciseKind } from "./engines/exercise";
import { moveDiscipline, pctChange } from "./exercise-widget";
import type { BodyweightInput } from "./bodyweight";
import type { WeightUnit } from "./units";
import type { ActivityRange } from "./activity-window";

/**
 * RECORDS — the Progress cluster's ledger of the movements the athlete PINNED.
 *
 * Today carried a records block once and it was deliberately deleted (see
 * capabilities: activity-records-figures, today-retrospective-reduced). The
 * retirement named the terms of a revisit, and this model is built to those
 * terms rather than around them:
 *
 * - IT IS A CHOICE, NOT A GUESS. The board renders the pinned movements
 *   (exercise-favourites — the same pins that lead the Exercises rail) and
 *   nothing else. No auto-fill, no frequency ranking: an athlete who pinned
 *   nothing sees an invitation, not a retrospective. That is what keeps the
 *   block from regrowing into the four-screen scroll the retirement removed.
 * - A VERTICAL LEDGER, NOT A SIXTH RAIL. The retirement's own words: the rail
 *   treatment would need "a reason for a horizontal scroll that a vertical
 *   ledger cannot serve". There is none; the client renders rows.
 * - THE FIGURE ANSWERS THE QUESTION IT RAISES. A lone load cannot tell
 *   `70 × 9 → 70 × 10` from `65 × 8 → 70 × 10`, so a row standing AT its
 *   record carries `strengthPrProof` — the structured climb ("from 82.5",
 *   "+7.5") that was built for exactly this caption and left in core waiting
 *   for a caller.
 *
 * THE BASELINE IS THE STANDING RECORD — a third baseline choice beside the
 * widget's window-over-window one (exercise-widget.ts documents that one), and
 * deliberately different: this block is about RECORDS, so the only honest axis
 * is the record itself. The ticker reads like a stock quote against its
 * all-time high: at the high it prints the climb that set it (accent); off the
 * high it prints the drawdown, signed, with both figures on the row so the
 * percentage is checkable.
 *
 * Scope is the fetched history, the same population every other block on Today
 * reads — the API serves the recent window of sessions, and a "best" computed
 * here is the best of exactly that, matching the analytics table and the
 * exercise page rather than inventing a second answer.
 *
 * Pace records ride the device's exact seconds (`paceSeries` is device-true);
 * loads are bodyweight-aware when `bw` is passed. Pure, so the mobile client
 * and any test render identical rows.
 */
/**
 * THE FOLD'S SENTENCE — which read the expanded row states.
 *
 * The collapsed row is figures (`132.5 / 140 kg  ▼5.4%`). Opening it must not
 * reprint them in words, so the fold answers the question the figures raise
 * and cannot settle: WHICH WAY HAVE I BEEN GOING, and is the gap a working
 * weight or a drift. Core picks the shape, the client owns the wording —
 * `enduranceLead`'s contract, for the same reason: two clients must never
 * disagree about which sentence a week deserves.
 *
 * TWO SCOPES, DELIBERATELY, and this is the one place they meet. The RECORD is
 * all-time (that is what a record is; the head carries a count, not a period).
 * The TREND is the screen's chosen window, because "how have I been going
 * lately" is a question about lately. Each sentence therefore names its own
 * scope — the window as an apposition, the record by its date — so the reader
 * is never left guessing which half of the sentence the filter governs.
 */
export type RecordReadKind =
  /** nothing logged inside the window */
  | "none"
  /** logged, but too few sessions to claim a direction */
  | "thin"
  /** one data point in the whole log — there is no "under" yet */
  | "first"
  /** the latest effort IS the record */
  | "atBest"
  | "climbing"
  | "holding"
  | "slipping";

export interface RecordRead {
  kind: RecordReadKind;
  /** efforts inside the window — the evidence the trend claim rests on. */
  sessions: number;
  /** How far under the record the latest sits, unsigned, 1 decimal. 0 at it.
   *  Unsigned because the sentence supplies the direction in words; a signed
   *  figure inside "still 5.4% under" would print the minus twice. */
  gapPct: number;
  /** The window's direction before the other conditions fold in — null when
   *  no direction was claimed (`none`, `thin`, `first`, `atBest`). */
  trend: "up" | "flat" | "down" | null;
}

/**
 * How far the window's two halves must differ before the fold calls it a
 * direction. Under this the row reads "holding steady", which is the honest
 * answer for a lift moving in plate increments: 2% of a 140 kg squat is 2.8 kg,
 * less than the smallest jump most racks allow, so anything below it is the
 * bar rounding rather than the athlete moving.
 */
export const RECORD_TREND_PCT = 2;

/** Efforts needed before a direction is claimed at all. Two points are a line
 *  through any noise; three is the fewest that can disagree with itself. */
export const RECORD_TREND_MIN = 3;

export interface RecordRow {
  name: string;
  kind: "strength" | "cardio";
  /** Cardio only — so the client formats pace in the discipline's own
   *  convention (/km, /100m, /500m, km/h) through formatDisciplinePace. */
  discipline: CardioDiscipline | null;
  /** The record: heaviest working load (kg) or fastest pace (sec/km). */
  best: number;
  /** ISO of the session that SET the record — the first time `best` was hit;
   *  a later equal effort matches the record, it does not move the date. */
  bestAt: string;
  /** The latest effort's figure, same unit as `best`. */
  latest: number;
  latestAt: string;
  /**
   * The latest effort measured against the standing record, signed, 1 decimal.
   * Strength: ≤ 0 (0 = at the record). Pace: ≥ 0 (0 = at it; positive =
   * slower). Null only when the record itself is not a valid baseline.
   */
  deltaPct: number | null;
  /** The latest effort sits AT the record. */
  atBest: boolean;
  /** Strength rows standing at the record: what it climbed from. Null off the
   *  record, for pace rows, and for a first-ever data point kind stays "first". */
  proof: StrengthPrProof | null;
  /** The fold's read of the row against the screen's window. Null when the
   *  caller passed no range — the model stays usable off a filtered screen. */
  read: RecordRead | null;
}

const ts = (iso: string): number => new Date(iso).getTime();

/** First point at the record's value — the day the record was SET. */
const firstAt = <P extends { date: string }>(pts: P[], pick: (p: P) => number, best: number): string =>
  pts.find((p) => pick(p) === best)?.date ?? pts[0]!.date;

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * The fold's read: how the window went, and how that sits against a record the
 * window does not govern.
 *
 * The direction compares the window's two HALVES, not its ends — the same
 * split `blockCompare` and the exercise page's tonnage slide already use, and
 * for the same reason: a single heavy Tuesday at either end would otherwise
 * decide the sentence. An odd count drops its middle point rather than letting
 * one session sit on both sides of its own comparison.
 */
function windowRead(
  pts: { date: string; value: number }[],
  range: ActivityRange,
  better: "high" | "low",
  atBest: boolean,
  gapPct: number,
): RecordRead {
  if (pts.length <= 1) return { kind: "first", sessions: pts.length, gapPct, trend: null };

  const inWin = pts.filter((p) => {
    const t = ts(p.date);
    return t >= range.from && t < range.through;
  });
  const sessions = inWin.length;

  if (sessions === 0) return { kind: "none", sessions, gapPct, trend: null };
  // AT THE RECORD BEATS ANY DIRECTION. Standing on your best is the larger
  // fact, and "building, and also at your best" would spend the sentence on
  // the smaller half of it.
  if (atBest) return { kind: "atBest", sessions, gapPct, trend: null };
  if (sessions < RECORD_TREND_MIN) return { kind: "thin", sessions, gapPct, trend: null };

  const half = Math.floor(sessions / 2);
  const older = mean(inWin.slice(0, half).map((p) => p.value));
  const newer = mean(inWin.slice(sessions - half).map((p) => p.value));
  if (!(older > 0)) return { kind: "thin", sessions, gapPct, trend: null };
  const change = ((newer - older) / older) * 100;
  // A pace improves DOWNWARD, so the direction is read in the metric's own
  // favour rather than by the sign of the raw change.
  const gain = better === "high" ? change : -change;
  const trend = gain > RECORD_TREND_PCT ? "up" : gain < -RECORD_TREND_PCT ? "down" : "flat";
  return {
    kind: trend === "up" ? "climbing" : trend === "down" ? "slipping" : "holding",
    sessions,
    gapPct,
    trend,
  };
}

/**
 * One ledger row per pinned movement, in pin order. A pin with no logged
 * figure draws no row (same rule as the rail: there is nothing to show), and a
 * conditioning pin is skipped — a metcon carries no load and no pace, and
 * inventing a record for it would be fabricating a metric it does not have.
 */
export function recordsBoard(
  sessions: LoggedSession[],
  favourites: readonly string[],
  opts: { now?: number; bw?: BodyweightInput; units?: WeightUnit; range?: ActivityRange } = {},
): RecordRow[] {
  const { now = Date.now(), bw, units = "kg", range } = opts;
  const rows: RecordRow[] = [];

  for (const name of favourites) {
    const kind = exerciseKind(sessions, name);

    if (kind === "strength") {
      const pts = topLoadSeries(sessions, name, bw).filter((p) => ts(p.date) <= now);
      if (pts.length === 0) continue;
      const best = Math.max(...pts.map((p) => p.weightKg));
      const last = pts[pts.length - 1]!;
      const atBest = last.weightKg >= best;
      const below = pts.map((p) => p.weightKg).filter((w) => w < best);
      rows.push({
        name,
        kind,
        discipline: null,
        best,
        bestAt: firstAt(pts, (p) => p.weightKg, best),
        latest: last.weightKg,
        latestAt: last.date,
        deltaPct: pctChange(last.weightKg, best),
        atBest,
        proof: atBest
          ? strengthPrProof({ topLoad: best, previousTopLoad: below.length ? Math.max(...below) : null }, units)
          : null,
        read: range
          ? windowRead(
              pts.map((p) => ({ date: p.date, value: p.weightKg })),
              range,
              "high",
              atBest,
              Math.abs(pctChange(last.weightKg, best) ?? 0),
            )
          : null,
      });
      continue;
    }

    if (kind === "cardio") {
      const pts = paceSeries(sessions, name).filter((p) => ts(p.date) <= now);
      if (pts.length === 0) continue;
      const best = Math.min(...pts.map((p) => p.secPerKm));
      const last = pts[pts.length - 1]!;
      rows.push({
        name,
        kind,
        discipline: moveDiscipline(sessions, name) ?? null,
        best,
        bestAt: firstAt(pts, (p) => p.secPerKm, best),
        latest: last.secPerKm,
        latestAt: last.date,
        deltaPct: pctChange(last.secPerKm, best),
        atBest: last.secPerKm <= best,
        proof: null,
        read: range
          ? windowRead(
              pts.map((p) => ({ date: p.date, value: p.secPerKm })),
              range,
              "low",
              last.secPerKm <= best,
              Math.abs(pctChange(last.secPerKm, best) ?? 0),
            )
          : null,
      });
    }
    // conditioning: no record figure — skipped by design (see above).
  }

  return rows;
}
