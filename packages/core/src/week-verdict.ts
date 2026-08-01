/**
 * ACTIVITY VERDICT — the engine behind the summary card on Today.
 *
 * Statistics and Analytics used to be two destinations answering overlapping
 * questions. This replaces the pair on Today with ONE read: a sentence naming
 * the metric that moved, its rolling baseline as the working-out, and the
 * figures the sentence is drawn from. The deep screens stay reachable — this is
 * the glance, not the archive.
 *
 * It is also the ONLY totals card on Today. The Endurance block used to open
 * with a cross-sport strip of its own — efforts / km / h for the SAME week —
 * which put two "this week" cards on one screen counting different populations
 * under near-identical labels: "5 sessions, 3.2 h" above "3 efforts, 0.9 h",
 * with nothing on either saying which was which. That strip is gone and its
 * distance moved here, so the week is stated once. Per-sport figures still live
 * inside each lane, where the scope is named by the lane itself.
 *
 * THE WINDOW IS NO LONGER FIXED. The card carries a date filter — the calendar
 * week (Mon–Sun), the last 7 or 30 days, the year to date, or any single month
 * — so this takes an `ActivityRange` and compares it against the equivalent
 * periods before it (see activity-window.ts, which also owns the totals and the
 * per-metric breakdown the figures open into). "Four-week average" is therefore
 * the WEEK's phrasing of a general rule: the mean of the preceding windows of
 * the same length.
 *
 * Pure, so web and mobile say the SAME sentence about the same period. Nothing
 * here formats: the caller renders `value` / `baseline` through its own unit
 * preference (kg vs lb tonnage), which is why the metric values stay canonical.
 *
 * TWO HONESTY RULES, in the done-receipt tradition:
 *   • NO BASELINE, NO VERDICT. Fewer than MIN_BASELINE_PERIODS of the preceding
 *     windows carrying any training → `cold`, and the card shows the figures
 *     with no claim over them. A verdict computed against one week of history
 *     is a coin flip wearing a percentage.
 *   • QUIET IS A REAL ANSWER. Nothing past the threshold → `flat` and no metric
 *     is named. A card that finds something wrong every week is a card people
 *     stop reading, so "tracking with your average" has to be a state it can
 *     actually reach.
 */
import type { LoggedSession } from "./engines/session";
import type { BodyweightInput } from "./bodyweight";
import { deviceTrueSessions } from "./device-truth";
import {
  ACTIVITY_METRICS,
  activityBaselineWindows,
  activityTotalsIn,
  resolveActivityRange,
  type ActivityMetric,
  type ActivityRange,
  type ActivityTotals,
} from "./activity-window";

/** The figures the card can carry, in render order. Distance only appears for
 *  an athlete who actually logs endurance — see `activityVerdict`. */
export const VERDICT_METRICS = ACTIVITY_METRICS;
export type VerdictMetric = ActivityMetric;

export type VerdictDirection = "up" | "down" | "flat";

/** How far from the baseline counts as worth a sentence. */
export const VERDICT_THRESHOLD_PCT = 15;

/** How many of the preceding periods must carry training before we'll compare.
 *  Capped at however many the range actually offers, so a year-to-date read —
 *  which only has last year to look at — isn't permanently cold. */
export const MIN_BASELINE_PERIODS = 2;

export interface VerdictFigure {
  metric: VerdictMetric;
  /** Canonical unit: tonnage = kg, sessions = count, hours = MINUTES,
   *  distance = KM. */
  value: number;
  /** Mean of the preceding periods, same unit (0 when there is no history). */
  baseline: number;
}

export interface ActivityVerdict {
  /** The period the verdict is about. */
  range: ActivityRange;
  /** The card's bottom half, in VERDICT_METRICS order. Tonnage, session count
   *  and training time are always present; DISTANCE joins them only when the
   *  athlete has endurance in the window or in the baseline, so a pure lifter
   *  never carries a column of zeroes and a runner never loses their headline
   *  number. */
  figures: VerdictFigure[];
  /** The metric the sentence is about; null when flat or cold. */
  metric: VerdictMetric | null;
  direction: VerdictDirection;
  /** Signed % change vs baseline for `metric`, rounded. 0 when flat or cold. */
  deltaPct: number;
  /** Too little history to compare — show the figures, make no claim. */
  cold: boolean;
  /** Preceding periods (of those compared) that carried any training. */
  baselinePeriods: number;
  /** How many preceding periods were available to compare against. */
  baselineOf: number;
}

/**
 * The period's verdict. Totals come from activity-window.ts — the same
 * arithmetic the breakdown behind each figure is built from, so a column and
 * the list it opens can never disagree — and the baseline is the mean of the
 * preceding windows of the same length, INCLUDING any that were empty, because
 * a fortnight off genuinely is part of your average and dropping it would make
 * every return look like a personal best.
 */
export function activityVerdict(
  sessions: LoggedSession[],
  range: ActivityRange,
  bw?: BodyweightInput,
): ActivityVerdict {
  const measured = deviceTrueSessions(sessions);
  const current = activityTotalsIn(measured, range.from, range.through, bw);

  const windows = activityBaselineWindows(range);
  const priors: ActivityTotals[] = windows.map((w) => activityTotalsIn(measured, w.from, w.to, bw));
  const baselinePeriods = priors.filter((p) => p.sessions > 0).length;

  const mean = (pick: (t: ActivityTotals) => number) =>
    priors.length ? priors.reduce((n, p) => n + pick(p), 0) / priors.length : 0;

  const figures: VerdictFigure[] = VERDICT_METRICS
    .map((metric) => ({ metric, value: current[metric], baseline: mean((t) => t[metric]) }))
    // A pure lifter shouldn't carry an empty distance column; a runner who took
    // this week off should still see theirs, which is why the baseline counts.
    .filter((f) => f.metric !== "distance" || f.value > 0 || f.baseline > 0);

  // Two of four for a week; HALF the windows when a range offers fewer, so a
  // year-to-date read — which only has two past years to look at — isn't cold
  // forever, while the bar stays proportionally the same.
  const needed = Math.max(1, Math.min(MIN_BASELINE_PERIODS, Math.ceil(priors.length / 2)));
  const cold = baselinePeriods < needed;
  const base = { range, figures, baselinePeriods, baselineOf: priors.length };
  if (cold) return { ...base, metric: null, direction: "flat", deltaPct: 0, cold: true };

  // Largest absolute move wins. VERDICT_METRICS order breaks ties, so the same
  // period never yields two different sentences on two clients.
  let best: { metric: VerdictMetric; deltaPct: number } | null = null;
  for (const f of figures) {
    if (f.baseline <= 0) continue;
    const deltaPct = Math.round(((f.value - f.baseline) / f.baseline) * 100);
    if (Math.abs(deltaPct) < VERDICT_THRESHOLD_PCT) continue;
    if (!best || Math.abs(deltaPct) > Math.abs(best.deltaPct)) best = { metric: f.metric, deltaPct };
  }

  if (!best) return { ...base, metric: null, direction: "flat", deltaPct: 0, cold: false };
  return {
    ...base,
    metric: best.metric,
    direction: best.deltaPct < 0 ? "down" : "up",
    deltaPct: best.deltaPct,
    cold: false,
  };
}

/** The rolling seven-day verdict — the card's original window, kept as the
 *  shorthand for callers that just want "the last week" without a range. */
export const weekVerdict = (sessions: LoggedSession[], now = Date.now(), bw?: BodyweightInput): ActivityVerdict =>
  activityVerdict(sessions, resolveActivityRange("d7", now), bw);

/** i18n key for the metric's name INSIDE the sentence ("your tonnage is …"). */
export const verdictMetricKey = (m: VerdictMetric) =>
  ({
    tonnage: "w.home.week.mTonnage", sessions: "w.home.week.mSessions",
    hours: "w.home.week.mHours", distance: "w.home.week.mDistance",
  })[m];

/** i18n key for the metric's column label under the hairline. */
export const verdictLabelKey = (m: VerdictMetric) =>
  ({
    tonnage: "w.home.week.lTonnage", sessions: "w.home.week.lSessions",
    hours: "w.home.week.lHours", distance: "w.home.week.lDistance",
  })[m];

/**
 * i18n key for the sentence itself, given the verdict's state.
 *
 * A week gets the week's own words ("the highest it's been in four weeks");
 * every other period gets the period-neutral phrasing, because a sentence about
 * a MONTH that quotes four weeks is a sentence about the wrong thing.
 */
export function verdictLeadKey(v: ActivityVerdict): string {
  if (v.cold) return "w.home.week.coldLead";
  const weekly = v.range.kind === "week" || v.range.kind === "d7";
  if (!v.metric) return weekly ? "w.home.week.flatLead" : "w.home.act.flatLeadP";
  if (v.direction === "down") return weekly ? "w.home.week.downLead" : "w.home.act.downLeadP";
  return weekly ? "w.home.week.upLead" : "w.home.act.upLeadP";
}

/** i18n key for the mono line under the sentence (the working-out). The
 *  comparison names the period it was made against, so a month's verdict can't
 *  read as if it were quoting a four-week average. */
export function verdictWhyKey(v: ActivityVerdict): string {
  if (v.cold) return "w.home.week.coldWhy";
  if (!v.metric) return "w.home.week.flatWhy";
  return v.range.kind === "month" ? "w.home.act.vsMonths"
    : v.range.kind === "ytd" ? "w.home.act.vsYears"
      : v.range.kind === "d30" ? "w.home.act.vsD30"
        : "w.home.week.vsAvg";
}
