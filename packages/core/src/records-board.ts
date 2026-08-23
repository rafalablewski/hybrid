import type { CardioDiscipline, LoggedSession } from "./engines/session";
import { paceSeries, strengthPrProof, topLoadSeries, type StrengthPrProof } from "./engines/session";
import { exerciseKind } from "./engines/exercise";
import { moveDiscipline, pctChange } from "./exercise-widget";
import type { BodyweightInput } from "./bodyweight";
import type { WeightUnit } from "./units";

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
}

const ts = (iso: string): number => new Date(iso).getTime();

/** First point at the record's value — the day the record was SET. */
const firstAt = <P extends { date: string }>(pts: P[], pick: (p: P) => number, best: number): string =>
  pts.find((p) => pick(p) === best)?.date ?? pts[0]!.date;

/**
 * One ledger row per pinned movement, in pin order. A pin with no logged
 * figure draws no row (same rule as the rail: there is nothing to show), and a
 * conditioning pin is skipped — a metcon carries no load and no pace, and
 * inventing a record for it would be fabricating a metric it does not have.
 */
export function recordsBoard(
  sessions: LoggedSession[],
  favourites: readonly string[],
  opts: { now?: number; bw?: BodyweightInput; units?: WeightUnit } = {},
): RecordRow[] {
  const { now = Date.now(), bw, units = "kg" } = opts;
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
      });
    }
    // conditioning: no record figure — skipped by design (see above).
  }

  return rows;
}
