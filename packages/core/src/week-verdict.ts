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
 * — so this takes an `ActivityRange` and compares it against THE EQUIVALENT
 * PERIOD BEFORE IT (see activity-window.ts, which also owns the totals and the
 * per-metric breakdown the figures open into): last 7 days against the 7 before
 * them, June against May, this week against last week. The mean of several such
 * windows is still computed and still carried, but as a LANDMARK the comparison
 * page draws beside the mark — never as the thing anything is measured from.
 *
 * Pure, so web and mobile say the SAME sentence about the same period. Nothing
 * here formats: the caller renders `value` / `baseline` through its own unit
 * preference (kg vs lb tonnage), which is why the metric values stay canonical.
 *
 * TWO HONESTY RULES, in the done-receipt tradition:
 *   • NO PREVIOUS PERIOD, NO VERDICT. The window before this one carried no
 *     training → `cold`, and the card shows the figures with no claim over
 *     them. A percentage against a week nobody trained is not a small number,
 *     it is not a number.
 *   • QUIET IS A REAL ANSWER. Nothing past the threshold → `flat` and no metric
 *     is named. A card that finds something wrong every week is a card people
 *     stop reading, so "tracking with the week before" has to be a state it can
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
 * ("your training time is up on the week before"), and a claim needs a move big
 * enough to be worth stating — that is the 15 above, and the reason "tracking
 * with the week before" has to be a state the card can reach.
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

// MIN_BASELINE_PERIODS lived here and is gone. It answered "how many of the
// preceding windows must carry training before we'll compare" — a real question
// when the denominator was a mean of four. Against a single previous window the
// question collapses to "did that window carry training", which `cold` asks
// directly, and a constant nobody reads is a constant that will be re-derived
// wrong. The reasoning lives in capabilities.ts; the code is in git.

/**
 * What the PREVIOUS period must reach before a metric may claim the SENTENCE,
 * in that metric's canonical unit (tonnage kg, sessions count, hours MINUTES,
 * distance km).
 *
 * Without this the only guard was `previous <= 0`, and 0.087 km of distance in
 * the week before survived it: dividing by it produced "+7849%". The absurd
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
  // No floor on the session COUNT: it has no negligible quantity to express. A
  // count is present in a window exactly when the window carried training,
  // which is the same question `cold` already asks of the whole card — so a
  // floor here would say nothing the gate above it has not said.
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
  /**
   * THE AXIS — the immediately PRECEDING window of the same length, and what
   * every percentage on this card is measured from.
   *
   * It used to be `baseline` below, the mean of four windows, and that was
   * wrong in the plainest possible way: an athlete who picks "last 7 days"
   * (the 10th to the 16th) is asking about the 7 days before it (the 3rd to
   * the 9th), and the card answered with a four-week average. A label can say
   * "four-week average" honestly and still be answering a question nobody
   * asked.
   */
  previous: number;
  /**
   * THE LANDMARK — the mean of the preceding periods, same unit (0 when there
   * is no history). It is no longer what anything is measured FROM; it is
   * drawn beside the mark as a second reference, the way MEV and MRV sit on a
   * muscle's rail. "Up on last week" and "still under your normal" are two
   * different facts and the card can now carry both.
   */
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
  /** Signed % change vs the PREVIOUS period for `metric`, rounded. 0 when flat
   *  or cold. */
  deltaPct: number;
  /** No previous period carrying training — no axis, so no claim. The figures
   *  still render; the card never goes blank. */
  cold: boolean;
  /** Preceding periods (of those compared) that carried any training. Reported
   *  for the landmark, which is still a mean of all of them. */
  baselinePeriods: number;
  /** How many preceding periods were available to compare against. */
  baselineOf: number;
}

/**
 * The period's verdict. Totals come from activity-window.ts — the same
 * arithmetic the breakdown behind each figure is built from, so a column and
 * the list it opens can never disagree.
 *
 * EVERY PERCENTAGE IS MEASURED FROM THE PREVIOUS PERIOD — the immediately
 * preceding window of the same length. Pick "last 7 days" and the card answers
 * about the 7 days before it; pick June and it answers about May. It used to
 * measure from the MEAN of four such windows, and the label said so honestly,
 * but honest labelling does not rescue an answer to a question nobody asked.
 *
 * THE MEAN SURVIVES AS A LANDMARK. It is still computed, still carried on every
 * figure, and the comparison page draws it as a second notch on the rail — the
 * way a muscle's rail carries MEV and MRV either side of where you are. "Up on
 * last week" and "still under your normal" are two different facts, and the
 * card can now show both without either one pretending to be the other. Empty
 * windows still count INTO that mean: a fortnight off genuinely is part of your
 * average, and dropping it would make every return look like a personal best.
 */
export function activityVerdict(
  sessions: LoggedSession[],
  range: ActivityRange,
  bw?: BodyweightInput,
): ActivityVerdict {
  const measured = deviceTrueSessions(sessions);
  const current = activityTotalsIn(measured, range.from, range.through, bw);

  // `activityBaselineWindows` hands the preceding windows back NEAREST FIRST,
  // so priors[0] is the period the athlete is actually asking about — the 7
  // days before the 7 they picked.
  const windows = activityBaselineWindows(range);
  const priors: ActivityTotals[] = windows.map((w) => activityTotalsIn(measured, w.from, w.to, bw));
  const baselinePeriods = priors.filter((p) => p.sessions > 0).length;
  const prior = priors[0] ?? null;

  const mean = (pick: (t: ActivityTotals) => number) =>
    priors.length ? priors.reduce((n, p) => n + pick(p), 0) / priors.length : 0;

  const figures: VerdictFigure[] = VERDICT_METRICS
    .map((metric) => ({
      metric,
      value: current[metric],
      previous: prior ? prior[metric] : 0,
      baseline: mean((t) => t[metric]),
    }))
    // A pure lifter shouldn't carry an empty distance column; a runner who took
    // this week off should still see theirs, which is why the history counts.
    .filter((f) => f.metric !== "distance" || f.value > 0 || f.previous > 0 || f.baseline > 0);

  // NO PREVIOUS PERIOD, NO VERDICT. The axis is one window now, so the gate is
  // the plainest form of the old one: did the period we are measuring FROM
  // carry any training at all. A percentage against a week nobody trained is
  // not a small number, it is not a number — and the card shows the figures
  // with no claim over them, exactly as it always did when it had none.
  const cold = !prior || prior.sessions === 0;
  const base = { range, figures, baselinePeriods, baselineOf: priors.length };
  if (cold) return { ...base, metric: null, best: null, worst: null, direction: "flat", deltaPct: 0, cold: true };

  // Largest absolute move wins — among the metrics with a real figure to move
  // FROM. One gate decides "real" now: the PREVIOUS period's figure has to
  // clear the metric's floor. The old pair (a floor on the mean, plus a
  // coverage count across four windows) existed because the denominator was a
  // mean and could be thin without being zero; against a single window the
  // floor says the whole thing.
  //
  // A metric that fails the gate is not discarded: it becomes the FALLBACK,
  // used only when nothing qualified. A 0.4 → 6 km week in an otherwise flat
  // period genuinely is the week's story — it just has no business outranking a
  // measure with a real previous week behind it, and past the ceiling it prints
  // as the step rather than as a four-digit percentage.
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
    if (f.previous <= 0) continue;
    const deltaPct = Math.round(((f.value - f.previous) / f.previous) * 100);
    if (Math.abs(deltaPct) < VERDICT_END_THRESHOLD_PCT) continue;
    const cand: Candidate = { metric: f.metric, deltaPct };
    if (f.previous >= VERDICT_BASELINE_FLOOR[f.metric]) qualified.push(cand);
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
  if (f.previous <= 0) return null;
  return Math.round(((f.value - f.previous) / f.previous) * 100);
}

/**
 * PAST THE CEILING — the one predicate every surface that draws a percentage
 * asks, and the reason it is a primitive on the NUMBER rather than a method on
 * one shape.
 *
 * The ceiling used to be a fact about the HEADLINE alone (`verdictShowsStep`),
 * because the headline was the only place a percentage was drawn large. It was
 * never true that it was the only place one was drawn. Three surfaces print a
 * signed percentage off this same arithmetic — the card's lead, the receipt
 * cell's mark (the end's second, non-hue channel) and the comparison page's row
 * — and two of them were printing it RAW. On the very week the ceiling exists
 * for, one card carried an honest "0.1 km → 6.8 km" in the lead, a "+6700%" in
 * the cell three lines under it, and the same "+6700%" again one drag away.
 *
 * So the rule belongs to a MOVE, not to a slot: `verdictShowsStep` and
 * `figureShowsStep` are both this asked of a particular figure, and the
 * comparison row asks it of its own `deltaPct` directly. One threshold, one
 * comparison, no surface inventing its own.
 */
export const pctPastCeiling = (deltaPct: number | null): boolean =>
  deltaPct !== null && Math.abs(deltaPct) > VERDICT_PCT_CEILING;

/** `pctPastCeiling` asked of ONE figure's own move — what a receipt cell asks
 *  before it prints its mark. */
export const figureShowsStep = (f: VerdictFigure): boolean => pctPastCeiling(figureDeltaPct(f));

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
 * THE COMPARISON ROW — one metric's whole move, for the card's second page.
 *
 * The figure row can mark only TWO of four metrics, because `best` and `worst`
 * are the period's two ENDS and a row of totals has no room to argue about the
 * middle. The other two comparisons are computed and thrown away on every
 * render. This is that model, kept: value, the baseline it moved from, the
 * signed per cent, the difference in the metric's own unit, and which end (if
 * either) it is.
 *
 * PURE, and the same arithmetic the row above it uses — `figureDeltaPct` for the
 * per cent, `best`/`worst` for the mark — so the chart and the figure one swipe
 * away can never disagree about the same week. Nothing here formats: `diff` is
 * canonical (kg, count, MINUTES, km), and the caller renders it through the
 * athlete's own unit preference exactly as it renders `value`.
 */
export interface VerdictComparison {
  metric: VerdictMetric;
  /** Canonical unit, same as VerdictFigure. */
  value: number;
  /** The AXIS — the immediately preceding window, what the bar measures from. */
  previous: number;
  /** The LANDMARK — the mean of the preceding windows, drawn as a second notch
   *  on the same rail. Not what anything is measured from. */
  baseline: number;
  /** Signed % vs baseline, rounded. Null when there is no baseline to move
   *  from — a different fact from "it did not move", and never rendered as 0. */
  deltaPct: number | null;
  /** `value - baseline`, canonical unit. Always defined; it needs no baseline
   *  to be meaningful, which is why it survives where `deltaPct` is null. */
  diff: number;
  /** The end this figure is, if it is one — the mark the row above carries. */
  end: "best" | "worst" | null;
}

/**
 * How far a bar may travel before it pins, as a percentage. Past this the bar
 * stops growing and the figure keeps counting: a chart that rescales to its
 * biggest mover draws the same picture for a +4% week and a +40% one, so the
 * length stops carrying magnitude at a glance and only the number does.
 */
export const COMPARE_SCALE_PCT = 50;

/**
 * The four rows, in VERDICT_METRICS order — the same order as the figure row,
 * because a chart that re-sorted itself would be the sorted-columns mistake the
 * card already made once and fixed.
 */
export const activityComparison = (v: ActivityVerdict): VerdictComparison[] =>
  v.figures.map((f) => ({
    metric: f.metric,
    value: f.value,
    previous: f.previous,
    baseline: f.baseline,
    deltaPct: figureDeltaPct(f),
    diff: f.value - f.previous,
    end: f.metric === v.best ? "best" : f.metric === v.worst ? "worst" : null,
  }));

/**
 * A row's bar, as a signed fraction of the half-track: −1 is pinned hard left,
 * +1 pinned hard right, 0 sitting on the axis. Null when the row has no
 * baseline to draw an axis against — the cold card, where the rows keep their
 * figures and draw no bars rather than measure against a baseline the card has
 * already said it does not trust.
 */
export function comparisonBar(c: VerdictComparison): number | null {
  if (c.deltaPct === null) return null;
  return clampTrack(c.deltaPct);
}

/**
 * WHERE THE AVERAGE SITS on that same signed half-track — the second landmark,
 * drawn as a notch the way MEV and MRV sit on a muscle's rail. Null when there
 * is no axis to place it against, or when the mean IS the previous period and a
 * notch would land exactly under the axis it duplicates.
 *
 * This is the whole point of keeping the mean after the axis moved: "up 31% on
 * last week" and "still under your normal" are two different facts about one
 * week, and a row that can draw both is a row that can be read either way round
 * without swiping anywhere.
 */
export function comparisonAverageMark(c: VerdictComparison): number | null {
  if (c.previous <= 0 || c.baseline <= 0) return null;
  const pct = Math.round(((c.baseline - c.previous) / c.previous) * 100);
  if (Math.abs(pct) < VERDICT_END_THRESHOLD_PCT) return null;
  return clampTrack(pct);
}

/** A percentage onto the signed half-track: pinned at ±1 past the scale, so the
 *  bar stops growing and the figure keeps counting. */
const clampTrack = (pct: number): number =>
  Math.max(-1, Math.min(1, pct / COMPARE_SCALE_PCT));

/**
 * Whether the SENTENCE's metric should print the STEP ("0.1 → 6.8 km") instead
 * of the percentage. True past VERDICT_PCT_CEILING, where a ratio against a
 * thin baseline stops being a measurement and starts reading as a bug — a
 * four-digit percentage beside a 6.8 km week costs every figure around it its
 * credibility. Both clients ask this, so neither can invent its own ceiling.
 *
 * It is `figureShowsStep` asked of the figure the sentence named — the ceiling
 * belongs to a MOVE, and the headline is one move among four. Delegating rather
 * than restating it is what stops the lead and the cell under it printing the
 * same fact two ways.
 */
export const verdictShowsStep = (v: ActivityVerdict): boolean => {
  if (v.metric === null || v.cold) return false;
  const named = v.figures.find((f) => f.metric === v.metric);
  return !!named && figureShowsStep(named);
};

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

/**
 * i18n key for the comparison page's head — the one line that says what the
 * axis IS. It names the period it compares against, exactly as `verdictWhyKey`
 * does, so a month's chart cannot read as if it were drawn against four weeks.
 * The window itself is NOT restated here: the section head above the card
 * already carries it, and printing it twice is the redundancy the Progress
 * cluster's sweep exists to catch.
 */
export const comparisonHeadKey = (v: ActivityVerdict): string =>
  v.range.kind === "month" ? "w.home.cmp.vsMonths"
    : v.range.kind === "ytd" ? "w.home.cmp.vsYears"
      : v.range.kind === "d30" ? "w.home.cmp.vsD30"
        : "w.home.cmp.vsAvg";

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

/** i18n key for the mono line under the sentence (the working-out). It names
 *  the window the percentage was measured FROM — the period immediately before
 *  this one — so a month's verdict reads "May" and a seven-day read says the
 *  seven days before it, rather than either quoting a mean nobody asked for. */
export function verdictWhyKey(v: ActivityVerdict): string {
  if (v.cold) return "w.home.week.coldWhy";
  if (!v.metric) return "w.home.week.flatWhy";
  return v.range.kind === "month" ? "w.home.act.vsMonths"
    : v.range.kind === "ytd" ? "w.home.act.vsYears"
      : v.range.kind === "d30" ? "w.home.act.vsD30"
        : "w.home.week.vsAvg";
}
