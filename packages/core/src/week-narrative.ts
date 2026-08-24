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

export type WeekLine =
  /** How much, how often, and how it divided. Always present. */
  | { kind: "shape"; key: string; sessions: number; days: number; gymEfforts: number; endEfforts: number }
  /** What the gym half moved. Absent when nothing was lifted. */
  | { kind: "gym"; key: string; tonnageKg: number; sets: number; lifts: number }
  /**
   * What the other half covered. Three shapes, and each is true of the week it
   * describes rather than a degenerate case of the others: ONE discipline that
   * covered ground (so a pace can be quoted honestly), SEVERAL (so it names the
   * leader instead), or none that covered any (so it reports the clock).
   */
  | { kind: "ground"; key: string; distanceKm: number; minutes: number; paceSecPerKm: number | null; lead: EnduranceSlice | null }
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
 * The one discipline that covered the ground, and the pace it covered it at —
 * or null when more than one did, because a pace averaged over a run and a swim
 * is a number nobody trained at.
 *
 * IT RETURNS THE SLICE AS WELL AS THE PACE, and that is not tidiness: the
 * sentence has to NAME the discipline the pace belongs to. Naming the half's
 * biggest slice instead — which is what this did first — produced "you covered
 * 9 km of tennis at 5:00 /km" for a week of one run and a longer tennis match.
 * The pace and the name have to come out of the same slice or the sentence is
 * about two different things.
 */
const paced = (e: EnduranceWindow): { slice: EnduranceSlice; secPerKm: number } | null => {
  const moved = e.slices.filter((s) => s.distanceKm > 0);
  const only = moved.length === 1 ? moved[0]! : null;
  if (!only || only.kind !== "endurance" || only.minutes <= 0) return null;
  return { slice: only, secPerKm: (only.minutes * 60) / only.distanceKm };
};

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
 * the road did, what came out of it, and which way it went.
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
    key: g > 0 && e > 0 ? "recap.narr.shapeBoth" : e > 0 ? "recap.narr.shapeOut" : "recap.narr.shapeGym",
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

  if (endurance.totals.efforts > 0) {
    const p = paced(endurance);
    // `lead` NAMES THE SUBJECT OF THE SENTENCE, which is not always the half's
    // biggest slice: where a pace is quoted it belongs to the one discipline
    // that covered the ground, and that is the one the sentence is about.
    const lead = p ? p.slice : (endurance.slices[0] ?? null);
    lines.push({
      kind: "ground",
      key:
        endurance.totals.distanceKm <= 0
          ? "recap.narr.groundTime"
          : p
            ? "recap.narr.groundPace"
            : "recap.narr.groundLed",
      distanceKm: endurance.totals.distanceKm,
      minutes: endurance.totals.minutes,
      paceSecPerKm: p ? p.secPerKm : null,
      lead,
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
