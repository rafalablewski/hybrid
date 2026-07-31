/**
 * WEEK VERDICT — the engine behind the "This week" card on Today.
 *
 * Statistics and Analytics used to be two destinations answering overlapping
 * questions. This replaces the pair on Today with ONE read: a sentence naming
 * the metric that moved, its four-week baseline as the working-out, and the
 * figures the sentence is drawn from. The deep screens stay reachable — this is
 * the glance, not the archive.
 *
 * It is also the ONLY weekly-totals card on Today. The Endurance block used to
 * open with a cross-sport strip of its own — efforts / km / h for the SAME week
 * — which put two "this week" cards on one screen counting different
 * populations under near-identical labels: "5 sessions, 3.2 h" above "3 efforts,
 * 0.9 h", with nothing on either saying which was which. That strip is gone and
 * its distance moved here, so the week is stated once. Per-sport figures still
 * live inside each lane, where the scope is named by the lane itself.
 *
 * Pure, so web and mobile say the SAME sentence about the same week. Nothing
 * here formats: the caller renders `value` / `baseline` through its own unit
 * preference (kg vs lb tonnage), which is why the metric values stay canonical.
 *
 * TWO HONESTY RULES, in the done-receipt tradition:
 *   • NO BASELINE, NO VERDICT. Fewer than MIN_BASELINE_WEEKS of the last four
 *     weeks carrying any training → `cold`, and the card shows the figures with
 *     no claim over them. A verdict computed against one week of history is a
 *     coin flip wearing a percentage.
 *   • QUIET IS A REAL ANSWER. Nothing past the threshold → `flat` and no metric
 *     is named. A card that finds something wrong every week is a card people
 *     stop reading, so "tracking with your average" has to be a state it can
 *     actually reach.
 */
import type { LoggedSession } from "./engines/session";
import { sessionVolume } from "./engines/session";
import { bwAt, type BodyweightInput } from "./bodyweight";
import { deviceTrueSessions } from "./device-truth";

const WEEK = 7 * 86_400_000;

/** The figures the card can carry, in render order. Distance only appears for
 *  an athlete who actually logs endurance — see `weekVerdict`. */
export const VERDICT_METRICS = ["tonnage", "sessions", "hours", "distance"] as const;
export type VerdictMetric = (typeof VERDICT_METRICS)[number];

export type VerdictDirection = "up" | "down" | "flat";

/** How far from the four-week average counts as worth a sentence. */
export const VERDICT_THRESHOLD_PCT = 15;

/** How many of the four prior weeks must carry training before we'll compare. */
export const MIN_BASELINE_WEEKS = 2;

export interface VerdictFigure {
  metric: VerdictMetric;
  /** Canonical unit: tonnage = kg, sessions = count, hours = MINUTES,
   *  distance = KM. */
  value: number;
  /** Four-week average in the same unit (0 when there is no history). */
  baseline: number;
}

export interface WeekVerdict {
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
  /** Prior weeks (of the last four) that carried any training. */
  baselineWeeks: number;
}

interface Totals {
  tonnage: number;
  sessions: number;
  hours: number; // minutes
  distance: number; // km
}

const ms = (iso: string) => new Date(iso).getTime();

/** Sum every metric over [from, to). Device-measured sessions win, the same
 *  rule weeklyRecap follows, so a watch-recorded workout isn't counted twice or
 *  from the weaker source — and cardio distance comes from the same block field
 *  the endurance lanes read, so the two can't disagree about a kilometre. */
function totalsIn(sessions: LoggedSession[], from: number, to: number, bw?: BodyweightInput): Totals {
  let tonnage = 0;
  let count = 0;
  let minutes = 0;
  let distance = 0;
  for (const s of sessions) {
    const t = ms(s.startedAt);
    if (!Number.isFinite(t) || t < from || t >= to) continue;
    count += 1;
    tonnage += sessionVolume(s.blocks, false, bwAt(bw, s.startedAt));
    if (s.completedAt) minutes += Math.max(0, Math.round((ms(s.completedAt) - t) / 60000));
    for (const b of s.blocks) {
      if (b.kind === "cardio" && b.distance && b.distance > 0) distance += b.distance;
    }
  }
  return { tonnage, sessions: count, hours: minutes, distance };
}

/**
 * The week's verdict. `now` is the right edge of the current 7-day window; the
 * baseline is the mean of the FOUR weeks before it — including any week that
 * was empty, because a fortnight off genuinely is part of your average and
 * dropping it would make every return look like a personal best.
 */
export function weekVerdict(sessions: LoggedSession[], now = Date.now(), bw?: BodyweightInput): WeekVerdict {
  const measured = deviceTrueSessions(sessions);
  const current = totalsIn(measured, now - WEEK, now + 1, bw);

  const priors: Totals[] = [];
  for (let i = 1; i <= 4; i++) priors.push(totalsIn(measured, now - (i + 1) * WEEK, now - i * WEEK, bw));
  const baselineWeeks = priors.filter((p) => p.sessions > 0).length;

  const mean = (pick: (t: Totals) => number) => priors.reduce((n, p) => n + pick(p), 0) / priors.length;
  const figures: VerdictFigure[] = VERDICT_METRICS
    .map((metric) => ({ metric, value: current[metric], baseline: mean((t) => t[metric]) }))
    // A pure lifter shouldn't carry an empty distance column; a runner who took
    // this week off should still see theirs, which is why the baseline counts.
    .filter((f) => f.metric !== "distance" || f.value > 0 || f.baseline > 0);

  const cold = baselineWeeks < MIN_BASELINE_WEEKS;
  if (cold) return { figures, metric: null, direction: "flat", deltaPct: 0, cold: true, baselineWeeks };

  // Largest absolute move wins. VERDICT_METRICS order breaks ties, so the same
  // week never yields two different sentences on two clients.
  let best: { metric: VerdictMetric; deltaPct: number } | null = null;
  for (const f of figures) {
    if (f.baseline <= 0) continue;
    const deltaPct = Math.round(((f.value - f.baseline) / f.baseline) * 100);
    if (Math.abs(deltaPct) < VERDICT_THRESHOLD_PCT) continue;
    if (!best || Math.abs(deltaPct) > Math.abs(best.deltaPct)) best = { metric: f.metric, deltaPct };
  }

  if (!best) return { figures, metric: null, direction: "flat", deltaPct: 0, cold: false, baselineWeeks };
  return {
    figures,
    metric: best.metric,
    direction: best.deltaPct < 0 ? "down" : "up",
    deltaPct: best.deltaPct,
    cold: false,
    baselineWeeks,
  };
}

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

/** i18n key for the sentence itself, given the verdict's state. */
export function verdictLeadKey(v: WeekVerdict): string {
  if (v.cold) return "w.home.week.coldLead";
  if (!v.metric) return "w.home.week.flatLead";
  return v.direction === "down" ? "w.home.week.downLead" : "w.home.week.upLead";
}

/** i18n key for the mono line under the sentence (the working-out). */
export function verdictWhyKey(v: WeekVerdict): string {
  if (v.cold) return "w.home.week.coldWhy";
  if (!v.metric) return "w.home.week.flatWhy";
  return "w.home.week.vsAvg";
}
