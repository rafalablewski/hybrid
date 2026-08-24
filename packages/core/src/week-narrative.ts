/**
 * THE WEEK, IN WORDS — the paragraph that reads a week out loud.
 *
 * The report states the week in figures, and figures are what an athlete checks
 * rather than what they remember. Nobody recounts their training as "9.0 t, 20
 * sets, 8.2 km"; they say "four sessions, two in the gym, and a run at 5:22".
 * A summary that cannot be READ is also a summary that cannot be POSTED — a
 * story card of four numbers says nothing to whoever sees it, and the week's
 * own athlete has to reconstruct the week from them.
 *
 * So this composes the narration: a small ordered set of sentences, each true
 * of the week it describes and each ABSENT when it has nothing to say. A pure
 * lifter gets no ground sentence; a week with no records gets no record
 * sentence; a week with nothing before it makes no claim about direction.
 *
 * ── IT RETURNS KEYS AND CANONICAL NUMBERS, NEVER SENTENCES ──────────────────
 *
 * The same contract `enduranceLead` has, and for the same reason: this file
 * cannot know the reader's language, their weight unit, or how their client
 * spells a duration. It hands back the i18n KEY of each sentence and the
 * canonical values that go in it (kg, km, minutes, seconds per km); the client
 * resolves `t(key)` and substitutes figures formatted through its own
 * preferences. That is what lets web and mobile say the identical paragraph,
 * and what stops a narration from quietly inventing a second way to print a
 * tonnage.
 *
 * The interpolation slots are single letters by convention (`{n}`, `{d}`, `{t}`
 * …) so a translator can move them freely inside the sentence — which they must
 * be able to do, since German and Polish do not put them where English does.
 */
import type { EnduranceSlice, EnduranceWindow } from "./endurance-window";
import type { GymWindow } from "./week-split";
import type { WeeklyRecap } from "./engines/recap";
import type { ActivityVerdict, VerdictMetric } from "./week-verdict";

/** The single biggest thing that came out of the week, for the record line. */
export type WeekTopRecord =
  | { kind: "strength"; name: string; loadKg: number }
  | { kind: "distance"; name: string; km: number }
  | { kind: "pace"; name: string; secPerKm: number };

/**
 * ONE DISCIPLINE OR SPORT, as the paragraph says it.
 *
 * `key` picks the phrase, and the three are different SENTENCES rather than one
 * sentence with holes: ground covered at a pace, ground covered by something
 * with no clock to pace it against, and a sport that covered none (a tennis
 * match is time, and reporting "0 km of tennis" is the failure this replaces).
 */
export interface WeekSportRead {
  slice: EnduranceSlice;
  /** recap.narr.sportPace | sportPaceBest | sportKm | sportTime */
  key: string;
  distanceKm: number;
  minutes: number;
  /** The slice's average over the week — null where it covered no ground. */
  paceSecPerKm: number | null;
  /**
   * The fastest single outing's pace, and ONLY when there were at least two
   * outings and one of them actually beat the average. One run is its own best,
   * and "8.2 km of running at 5:22 /km, best 5:22" is the paragraph padding
   * itself with a fact it already stated.
   */
  bestPaceSecPerKm: number | null;
  /** How many times the athlete went out in this discipline. */
  efforts: number;
}

export type WeekLine =
  /** How much, how often, and how it divided. Always present. */
  | { kind: "shape"; key: string; sessions: number; days: number; gymEfforts: number; endEfforts: number }
  /** What the gym half moved. Absent when nothing was lifted. */
  | { kind: "gym"; key: string; tonnageKg: number; sets: number; lifts: number }
  /**
   * WHAT THE SPORT HALF ACTUALLY WAS — every discipline and sport NAMED, with
   * its own ground, its own clock and its own pace.
   *
   * It used to state the half as one figure and name at most the leader ("you
   * covered 9 km, led by running"), which answers how much and not what. A
   * hybrid week is two runs, a swim and a squash match, and a paragraph that
   * cannot say so is describing somebody's training in the abstract.
   *
   * PER SLICE IS ALSO WHAT MAKES A PACE HONEST. The old line could quote one
   * only when a single discipline had covered any ground at all, because the
   * alternative was averaging a run with a swim; a pace attached to the
   * discipline it belongs to has no such problem, and every one of them can be
   * quoted at once.
   */
  | { kind: "sports"; key: string; sports: WeekSportRead[] }
  /** What came out of it. Absent when the week set none. */
  | { kind: "records"; key: string; count: number; top: WeekTopRecord }
  /**
   * WHICH WAY IT WENT — the verdict card's own sentence, so the paragraph ends
   * on the same conclusion the screen's lead states and Today's card states,
   * in the same words. `metricKey` is null when the week is flat or cold, which
   * are real answers rather than missing ones.
   */
  | { kind: "verdict"; key: string; metricKey: string | null };

/** The verdict's metric → the noun the sentence uses for it. Mirrors the map
 *  the clients already render beside `activityVerdict`. */
const METRIC_KEY: Record<VerdictMetric, string> = {
  tonnage: "w.home.week.mTonnage",
  sessions: "w.home.week.mSessions",
  hours: "w.home.week.mHours",
  distance: "w.home.week.mDistance",
};

/**
 * A SLICE, READ. Which phrase it takes, and the figures that go in it.
 *
 * THE BEST PACE IS WITHHELD unless it is worth stating: two outings at least,
 * and one of them faster than the average by enough to be a different clock
 * reading. Half a second per kilometre is the two runs being the same run.
 */
const PACE_BEST_MIN_GAP_SEC = 2;

function readSlice(s: EnduranceSlice): WeekSportRead {
  const pace = s.kind === "endurance" ? s.paceSecPerKm : null;
  const best =
    pace !== null && s.bestPaceSecPerKm !== null && s.sessions > 1 && pace - s.bestPaceSecPerKm >= PACE_BEST_MIN_GAP_SEC
      ? s.bestPaceSecPerKm
      : null;
  return {
    slice: s,
    key:
      s.distanceKm <= 0
        ? "recap.narr.sportTime"
        : pace === null
          ? "recap.narr.sportKm"
          : best !== null
            ? "recap.narr.sportPaceBest"
            : "recap.narr.sportPace",
    distanceKm: s.distanceKm,
    minutes: s.minutes,
    paceSecPerKm: pace,
    bestPaceSecPerKm: best,
    efforts: s.sessions,
  };
}

/**
 * The biggest thing the week produced. A strength record outranks a cardio one
 * only because the lifts are ordered by load and therefore have a "biggest";
 * where the week set only cardio records the first of those is the subject.
 */
function topRecord(recap: WeeklyRecap): WeekTopRecord | null {
  const lift = recap.prs[0];
  if (lift) return { kind: "strength", name: lift.lift, loadKg: lift.topLoad };
  const c = recap.cardioPrs[0];
  if (!c) return null;
  return c.kind === "pace"
    ? { kind: "pace", name: c.move, secPerKm: c.value }
    : { kind: "distance", name: c.move, km: c.value };
}

/**
 * The week's paragraph, in reading order: what it was, what the gym did, what
 * sports it was made of, what came out of it, and which way it went.
 */
export function weekNarrative(
  recap: WeeklyRecap,
  gym: GymWindow,
  endurance: EnduranceWindow,
  verdict: ActivityVerdict | null,
): WeekLine[] {
  const lines: WeekLine[] = [];
  if (recap.sessions === 0) return lines;

  const g = gym.totals.efforts;
  const e = endurance.totals.efforts;
  lines.push({
    kind: "shape",
    key: g > 0 && e > 0 ? "recap.narr.shapeBoth" : e > 0 ? "recap.narr.shapeSport" : "recap.narr.shapeGym",
    sessions: recap.sessions,
    days: recap.activeDays,
    gymEfforts: g,
    endEfforts: e,
  });

  if (gym.totals.tonnage > 0) {
    lines.push({
      kind: "gym",
      key: "recap.narr.gym",
      tonnageKg: gym.totals.tonnage,
      sets: gym.totals.sets,
      lifts: gym.totals.lifts,
    });
  }

  if (endurance.slices.length > 0) {
    lines.push({
      kind: "sports",
      key: "recap.narr.sports",
      // Biggest first, which is the order the window already sorts in and the
      // order the section below the paragraph lists them in.
      sports: endurance.slices.map(readSlice),
    });
  }

  const top = topRecord(recap);
  if (top) {
    lines.push({
      kind: "records",
      key: "recap.narr.records",
      count: recap.prs.length + recap.cardioPrs.length,
      top,
    });
  }

  if (verdict) {
    lines.push({
      kind: "verdict",
      key: verdict.cold
        ? "w.home.week.coldLead"
        : !verdict.metric || verdict.direction === "flat"
          ? "w.home.week.flatLead"
          : verdict.direction === "up"
            ? "w.home.week.upLead"
            : "w.home.week.downLead",
      metricKey: verdict.metric && verdict.direction !== "flat" && !verdict.cold ? METRIC_KEY[verdict.metric] : null,
    });
  }

  return lines;
}
