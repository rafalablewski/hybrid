import type { Macrocycle } from "./types";
import { currentPhase } from "./periodization";

/**
 * THE SEASON REACHING THE SESSION.
 *
 * `buildMacrocycle()` produces a full periodisation — mesocycle blocks, a
 * per-week intensity and volume for every microcycle, a deload every third or
 * fourth week, and a taper that lands on the event. It is serialised into
 * `Macrocycle.blocks` on every enrolment.
 *
 * And nothing read it. Searching `currentWeek`, `micros` or `Microcycle` across
 * the Today screen, the workout logger, the prescription engine and the
 * progression engine returned nothing at all. Today resolved its work from
 * `planId` alone, so periodisation was a drawing on one screen: an athlete
 * standing in a scheduled recovery week was prescribed exactly what they were
 * prescribed in the loading week before it. The deload existed as a picture.
 *
 * This is the conversion. It answers one question — how does THIS week differ
 * from a typical week of this season — in the currency the prescription engine
 * already speaks: a few percent of e1RM and a set.
 *
 * WHY IT IS RELATIVE TO THE SEASON'S OWN MEAN rather than to an absolute scale.
 * The phase models' intensity numbers are only meaningful against each other:
 * 70 in the general model is a hard week, 70 in the strength model is an easy
 * one. Comparing a week to the mean of its OWN season is the only reading that
 * transfers across all four models without a per-model calibration table that
 * would then need its own coverage test.
 */

/** The intensity a deload week takes off the bar, as a fraction of e1RM. */
export const DELOAD_PCT_ADJ = -0.12;
/** A deload sheds a set as well as load — a real deload, not just lighter bars.
 *  Mirrors what a "wrecked" check-in already does for the same reason. */
export const DELOAD_SET_ADJ = -1;
/** How much of a loading week's distance from the season mean carries into the
 *  bar. Halved deliberately: the ramp should be felt across a block, not inside
 *  one session. */
export const LOAD_RAMP_SCALE = 0.5;
/** The most a loading week may move the bar in either direction. */
export const LOAD_PCT_CAP = 0.05;

export interface SeasonAdjust {
  /** Added to the working percentage of e1RM, before the engine's own clamp. */
  pctAdj: number;
  /** Sets added to (or taken off) the strength block. */
  setAdj: number;
  /** Whether this is a scheduled recovery week. */
  deload: boolean;
  /** The block's name — "Build", "Hypertrophy", "Taper". */
  blockLabel: string;
  /** Where this week sits inside its block, 1-based. */
  weekInBlock: number;
  /** How many weeks the block runs. */
  blockWeeks: number;
  /** The season week, 1-based, and the season's length. */
  week: number;
  totalWeeks: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * What the athlete's current position in their season does to today's session.
 *
 * Returns null when there is no usable season, which prescribes exactly what
 * the engine prescribed before any of this existed.
 */
export function seasonAdjust(
  macro: Macrocycle | null | undefined,
  currentWeek: number,
): SeasonAdjust | null {
  if (!macro?.blocks?.length) return null;
  const week = Math.max(1, Math.floor(currentWeek));
  const { block, micro } = currentPhase(macro, week);
  if (!block || !micro) return null;

  const totalWeeks = macro.blocks[macro.blocks.length - 1]?.endWeek ?? 0;
  const weekInBlock = Math.max(1, micro.week - block.startWeek + 1);
  const base = {
    deload: micro.kind === "recovery",
    blockLabel: block.label,
    weekInBlock,
    blockWeeks: block.micros.length,
    week,
    totalWeeks,
  };

  if (micro.kind === "recovery") {
    return { ...base, pctAdj: DELOAD_PCT_ADJ, setAdj: DELOAD_SET_ADJ };
  }

  // A loading week, read against the mean of this season's OWN loading weeks.
  // Recovery weeks are excluded from the mean: including them would drag it
  // down and report every loading week as harder than typical, which is true
  // only in the trivial sense that a load week is not a deload.
  const loads = macro.blocks.flatMap((b) => b.micros).filter((m) => m.kind === "load");
  if (!loads.length) return { ...base, pctAdj: 0, setAdj: 0 };
  const mean = loads.reduce((a, m) => a + m.intensity, 0) / loads.length;
  const pctAdj = clamp(((micro.intensity - mean) / 100) * LOAD_RAMP_SCALE, -LOAD_PCT_CAP, LOAD_PCT_CAP);
  return { ...base, pctAdj, setAdj: 0 };
}

/** "Build, week 2 of 4" — what Today calls the week the athlete is standing in.
 *  A season that is being followed should be able to say where it is. */
export const seasonBlockLabel = (s: SeasonAdjust): string =>
  `${s.blockLabel}, week ${s.weekInBlock} of ${s.blockWeeks}`;
