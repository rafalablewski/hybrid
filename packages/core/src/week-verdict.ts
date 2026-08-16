/**
 * ACTIVITY VERDICT — the engine behind the summary card on Today.
 *
 * Statistics and Analytics used to be two destinations answering overlapping
 * questions. This replaces the pair on Today with ONE read: a sentence naming
 * the metric that moved, its rolling baseline as the working-out, and the
 * figures the sentence is drawn from. The deep screens stay reachable — this is
 * the glance, not the archive.
 *
 * It is the WHOLE-SCREEN totals card. The Endurance block used to open with a
 * cross-sport strip of its own — efforts / km / h for the SAME week — which put
 * two "this week" cards on one screen counting different populations under
 * near-identical labels: "5 sessions, 3.2 h" above "3 efforts, 0.9 h", with
 * nothing on either saying which was which. That strip is gone and its distance
 * moved here, so the week is stated once for the screen.
 *
 * Endurance is a SECTION now, with a headline of its own, and that heading is
 * what lets it carry a summary card again (endurance-window.ts): under a
 * headline reading ENDURANCE, "8 efforts / 41.6 km / 3.2 h" is scoped by the
 * section it opens, which the old strip's figures never were. Those figures are
 * a strict SLICE of this card's — same activitySummary, filtered to the
 * endurance and sport groups — so the two can never disagree.
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
 *
 * THE SENTENCE IS ONE SLOT; THE PERIOD HAS TWO ENDS. `metric` can only name the
 * biggest move, so the week that headlines "+50% training time" is silent about
 * the distance that halved underneath it — and the row of figures below, which
 * holds both facts, had no way to say so. `best` and `worst` rank the ends
 * separately (biggest riser, biggest faller, same baseline gates), so the
 * columns can carry the win and the slip at once while the sentence stays a
 * sentence about one thing.
 *
 * THE ENDS RANK ON A LOWER BAR THAN THE SENTENCE — VERDICT_END_THRESHOLD_PCT
 * against VERDICT_THRESHOLD_PCT. A claim in words needs a move worth stating; a
 * mark only says which end of your own row a figure is, and the far end is the
 * far end at 9% as much as at 40%. Sharing one bar is what let a week of +31%
 * hours and −9% distance light the rise and leave the only measure that went
 * backwards looking exactly like the two that held.
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

/** How far from the baseline counts as worth a SENTENCE. */
export const VERDICT_THRESHOLD_PCT = 15;

/**
 * How far from the baseline counts as worth a MARK — the bar the two ends are
 * ranked over, and it is deliberately lower than the sentence's.
 *
 * The two ask different questions. The sentence makes a CLAIM about the period
 * ("your training time is the highest it's been in four weeks"), and a claim
 * needs a move big enough to be worth stating — that is the 15 above, and the
 * reason "tracking with your average" has to be a state the card can reach.
 * The marks make no claim: they say WHICH END of your own row this figure is,
 * and the far end of a row is the far end whether it fell 40% or 9%.
 *
 * On one 15% bar the two questions were answered by the same number, and the
 * row went silent about halves of the week it was built to stop hiding: a week
 * of +31% hours, +18% tonnage, −7% sessions and −9% distance lit the hours and
 * left the ONLY measure that actually went backwards looking exactly like the
 * two that held. The sentence was right to stay off it; the row was not.
 *
 * It is not zero, because a row where something is always the worst is a row
 * that has stopped meaning anything — 0.4% below your average is noise, not a
 * slip. Five points is where a figure stops being round-off and starts being a
 * direction. MUST stay ≤ VERDICT_THRESHOLD_PCT: the ends are ranked over a
 * SUPERSET of the metrics that may claim the sentence, which is what keeps the
 * bold word in the lead sitting on a lit column.
 */
export const VERDICT_END_THRESHOLD_PCT = 5;

/** How many of the preceding periods must carry training before we'll compare.
 *  Capped at however many the range actually offers, so a year-to-date read —
 *  which only has last year to look at — isn't permanently cold. */
export const MIN_BASELINE_PERIODS = 2;

/**
 * The baseline a metric must reach before it may claim the SENTENCE, in that
 * metric's canonical unit (tonnage kg, sessions count, hours MINUTES,
 * distance km).
 *
 * Without this the only guard was `baseline <= 0`, and a four-week distance
 * mean of 0.087 km survived it: dividing by it produced "+7849%". The absurd
 * figure was the visible half of the problem. The other half was worse —
 * ranking by raw ratio hands the headline to whichever metric has the SMALLEST
 * denominator, so a lifter who jogs once a month had their sentence taken by
 * distance every single week while the tonnage they actually moved never got
 * it. A floor makes "did this measure have a real baseline to move from" a
 * precondition for the claim rather than an afterthought.
 */
export const VERDICT_BASELINE_FLOOR: Record<VerdictMetric, number> = {
  tonnage: 250,   // kg — roughly one working set
  hours: 30,      // minutes
  distance: 1,    // km
  // No floor on the session COUNT: it has no negligible quantity to express,
  // and the coverage gate below already says everything a floor would. A count
  // is present in a window exactly when the window carried training, which is
  // the same question `cold` asks of the card — so sessions rank exactly as
  // they always did.
  sessions: 0,
};

/**
 * Above this, a percentage has stopped being a measurement. The card prints the
 * STEP instead ("0.1 → 6.8 km") — the honest rendering of the same fact, and a
 * shorter one. Clients ask through `verdictShowsStep`.
 */
export const VERDICT_PCT_CEILING = 300;

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
  /**
   * THE PERIOD'S TWO ENDS — the figure that rose furthest above its baseline and
   * the one that fell furthest below it. Either is null when nothing moved that
   * way past the threshold, and BOTH are null when the card is cold.
   *
   * These are what the columns are TONED by. `metric` names the one measure the
   * sentence is about, which is a single slot and therefore silent about the
   * other three: a week that headlines "+50% training time" says nothing about
   * the distance that halved underneath it. Ranking the ends separately lets the
   * row carry both halves of the week at once — the win in chartreuse, the slip
   * in terracotta — while the sentence stays a sentence about one thing.
   *
   * `metric` is always ONE of these two when it is set (it is the larger of the
   * same two moves in absolute terms), so the bold word in the lead and the lit
   * column can never point at different figures.
   */
  best: VerdictMetric | null;
  worst: VerdictMetric | null;
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
  if (cold) return { ...base, metric: null, best: null, worst: null, direction: "flat", deltaPct: 0, cold: true };

  // Largest absolute move wins — among the metrics with a real baseline to move
  // FROM. Two gates decide "real": the mean has to clear the metric's floor,
  // and the metric has to have actually appeared in as many prior windows as
  // the card itself needs. `cold` asks that second question of the whole card
  // and never of the metric that ends up winning, which is how a measure
  // trained once in four weeks could claim the sentence.
  //
  // A metric that fails either gate is not discarded: it becomes the FALLBACK,
  // used only when nothing qualified. A 0.1 → 6.8 km week in an otherwise flat
  // period genuinely is the week's story — it just has no business outranking a
  // measure with four weeks of history behind it, and past the ceiling it
  // prints as the step rather than as a four-digit percentage.
  //
  // Ranking stays on the raw percentage so a period that was already decided
  // one way keeps its sentence: the gates change WHICH metrics compete, never
  // how the ones that do are ordered. VERDICT_METRICS order still breaks ties
  // (strict `>`), so the same period never yields two different sentences on
  // two clients.
  //
  // The pools are built at the MARK's threshold, the lower of the two, and the
  // sentence filters them again at its own — so the ends are ranked over a
  // superset of the metrics allowed to claim the lead. The gates are the same
  // for both: which bar a metric has to clear is a question about the size of
  // the move, and the floor is a question about whether the baseline was real.
  type Candidate = { metric: VerdictMetric; deltaPct: number };
  const qualified: Candidate[] = [];
  const fallbacks: Candidate[] = [];
  for (const f of figures) {
    if (f.baseline <= 0) continue;
    const deltaPct = Math.round(((f.value - f.baseline) / f.baseline) * 100);
    if (Math.abs(deltaPct) < VERDICT_END_THRESHOLD_PCT) continue;
    const cand: Candidate = { metric: f.metric, deltaPct };
    const trained = priors.filter((p) => p[f.metric] > 0).length;
    if (f.baseline >= VERDICT_BASELINE_FLOOR[f.metric] && trained >= needed) qualified.push(cand);
    else fallbacks.push(cand);
  }

  // `figures` is in VERDICT_METRICS order and both pools preserve it, so a
  // strict comparison keeps the EARLIER metric on a tie and the same period can
  // never yield two different readings on two clients.
  const top = (pool: Candidate[], better: (c: Candidate, held: Candidate) => boolean) =>
    pool.reduce<Candidate | null>((held, c) => (held === null || better(c, held) ? c : held), null);
  const moved = (pool: Candidate[]) => top(pool, (c, h) => Math.abs(c.deltaPct) > Math.abs(h.deltaPct));
  const rose = (pool: Candidate[]) => top(pool.filter((c) => c.deltaPct > 0), (c, h) => c.deltaPct > h.deltaPct);
  const fell = (pool: Candidate[]) => top(pool.filter((c) => c.deltaPct < 0), (c, h) => c.deltaPct < h.deltaPct);
  /** Only a move past the SENTENCE's threshold may be claimed in words. */
  const claimants = (pool: Candidate[]) => pool.filter((c) => Math.abs(c.deltaPct) >= VERDICT_THRESHOLD_PCT);

  const win = moved(claimants(qualified)) ?? moved(claimants(fallbacks));

  // The two ends rank under the SAME baseline gate the sentence does, each on
  // its own side: a qualified riser beats an ungated one, and only if no
  // qualified metric rose at all does a thin-baseline rise get the chartreuse.
  // Toning a column the sentence deliberately refused to headline would put the
  // card's brightest mark on the figure it least trusts.
  //
  // THE WINNER TAKES ITS OWN END, whatever pool it came from. Within a pool it
  // already does — the biggest absolute mover is the biggest mover on its side
  // — but a sentence can be won out of the FALLBACKS while a small qualified
  // move sits in the same direction, and then the bold word in the lead would
  // point at one column while the tone sat on another. The override can only
  // ever hand a mark to an ungated figure that the sentence has already named,
  // so the "brightest mark on the least-trusted figure" case stays shut.
  const best = win && win.deltaPct > 0 ? win : rose(qualified) ?? rose(fallbacks);
  const worst = win && win.deltaPct < 0 ? win : fell(qualified) ?? fell(fallbacks);

  const ends = { best: best?.metric ?? null, worst: worst?.metric ?? null };
  if (!win) return { ...base, ...ends, metric: null, direction: "flat", deltaPct: 0, cold: false };
  return {
    ...base,
    ...ends,
    metric: win.metric,
    direction: win.deltaPct < 0 ? "down" : "up",
    deltaPct: win.deltaPct,
    cold: false,
  };
}

/**
 * A FIGURE'S OWN MOVE — the signed % it sits above or below its OWN baseline,
 * rounded. Null when there is no baseline to move from, which is a different
 * fact from "it did not move" and must never render as 0%.
 */
export function figureDeltaPct(f: VerdictFigure): number | null {
  if (f.baseline <= 0) return null;
  return Math.round(((f.value - f.baseline) / f.baseline) * 100);
}

/**
 * A FIGURE'S OWN DIRECTION — what the COLUMN says about itself, as against
 * `ActivityVerdict.direction`, which is what the SENTENCE says about the one
 * metric it named.
 *
 * The card tones its columns by `best` / `worst` — the period's two ENDS — and
 * this is what keeps that tone honest wherever a single figure is restated away
 * from the row it was ranked in. The breakdown sheet is the case: it carries the
 * pressed column's total behind a scrim, with the row it came from no longer on
 * screen, so it colours that total by the figure's OWN move rather than by a
 * ranking the athlete can no longer see.
 *
 * It agrees with the ranking by construction — `best` is a rise and `worst` a
 * fall, both past this same threshold — so an end's column and its sheet always
 * read the same hue, and a middle column reads chalk in the sheet exactly as it
 * reads unmarked in the row.
 *
 * Same threshold the MARKS use (VERDICT_END_THRESHOLD_PCT), not the sentence's
 * — this is the column's question, and it has to answer it the way the row
 * does, or a figure lit terracotta in the row would open into a sheet printing
 * it in chalk. The sentence's higher bar governs only what may be claimed in
 * words, which is not what a hue on a single figure is doing.
 */
export function figureDirection(f: VerdictFigure): VerdictDirection {
  const d = figureDeltaPct(f);
  if (d === null || Math.abs(d) < VERDICT_END_THRESHOLD_PCT) return "flat";
  return d < 0 ? "down" : "up";
}

/**
 * Whether the card should print the STEP ("0.1 → 6.8 km") instead of the
 * percentage. True past VERDICT_PCT_CEILING, where a ratio against a thin
 * baseline stops being a measurement and starts reading as a bug — a four-digit
 * percentage beside a 6.8 km week costs every figure around it its credibility.
 * Both clients ask this, so neither can invent its own ceiling.
 */
export const verdictShowsStep = (v: ActivityVerdict): boolean =>
  v.metric !== null && !v.cold && Math.abs(v.deltaPct) > VERDICT_PCT_CEILING;

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
