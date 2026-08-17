import type { MuscleGroup, TrainingLog } from "./types";
import type { LoggedSession } from "./session";
import { ALL_MUSCLES } from "./movements";
import { athleteLandmarks, type AthleteLandmarkOptions, type LandmarkSource } from "./landmark-resolve";
import { replayLandmarks, REPLAY_VERDICT_KEY } from "./landmark-replay";
import { athleteClearance } from "./recovery-pairs";
import type { RecoveryReport } from "./landmark-adapt";
import { personalTrainingLog } from "./effort";
import { readinessDeficit, READINESS_COST_KEY, type ReadinessCostKind } from "./readiness-deficit";
import type { Clearance } from "../feel-timing";
import { MUSCLE_GROUP_KEY } from "../volume-view";
import type { SemanticRole } from "../semantic";

/**
 * WHAT WE LEARNED ABOUT YOU — the month, as claims the app can defend.
 *
 * Everything here already ran. The adaptive landmark stack produces per-muscle
 * ceilings with evidence counts and stated intervals (landmark-adapt.ts), the
 * recovery pairs measure how fast this athlete actually drains a session
 * (recovery-pairs.ts), and the readiness ring already accounts for its own
 * deficit point by point (readiness-deficit.ts). Each of those answers a
 * question on the screen that asked it, and NOTHING anywhere said the one thing
 * an athlete would keep logging for: *here is what your training taught us this
 * month, and here is how sure we are.*
 *
 * That is all this module is — the assembly. It computes no new physiology. It
 * calls the same resolvers the rest of the app calls, with the same options, so
 * a figure on the monthly story and the same figure on the Volume screen cannot
 * disagree; if they ever did, this file would be the bug rather than a second
 * opinion.
 *
 * THREE RULES, and they are the reason the shape is what it is:
 *
 *   EVERY CLAIM CARRIES ITS PROVENANCE. `source` is the SAME four-layer
 *     vocabulary the landmarks already speak (population → profile → observed →
 *     manual), reused rather than reinvented, so the ladder the Volume screen
 *     draws and the chip this story prints resolve from one enum and one set of
 *     i18n keys. A population constant applied to you is never allowed to read
 *     as a measurement of you.
 *
 *   EVERY FIGURE CARRIES ITS INTERVAL. Two kinds, and they are not the same
 *     statement: a BELIEF interval is where the true value probably sits (the
 *     ceiling's ±, the clearance ratio's standard error), a SPREAD is where your
 *     own days actually fell. Labelling a spread as a confidence interval would
 *     be a lie about what was measured, so the kind travels with the numbers.
 *
 *   "NOT ENOUGH EVIDENCE YET" IS A FINDING. A claim with no evidence is not
 *     omitted and it is certainly not softened into a hedge — it is emitted in
 *     `state: "waiting"` with `needKey` naming what would settle it. The empty
 *     state is the retention loop: it says what to do next.
 *
 * COST. One landmark resolve, `weeks + 1` replayed resolves, one clearance pass
 * over the log at a month ago, and one readiness deficit per day across two
 * windows. It is a screen-level computation — memoise it; do not call it per
 * render.
 */

const DAY = 86_400_000;

/** The story's window. Monthly, because a ceiling does not move in a week and
 *  four weekly snapshots is the fewest that can show a direction. */
export const LEARNED_WINDOW_WEEKS = 4;

/**
 * Days of readiness the window needs before the mean is called a pattern.
 * Half a month. Below it the figure is a fortnight's mood, and this screen's
 * whole claim is that it does not overstate what it knows.
 */
export const MIN_READINESS_DAYS = 14;

/** The three things the app can honestly say it learned. */
export type LearnedChapter = "ceiling" | "clearance" | "readiness";

export const LEARNED_CHAPTERS: readonly LearnedChapter[] = ["ceiling", "clearance", "readiness"] as const;

export const LEARNED_CHAPTER_KEY: Record<LearnedChapter, string> = {
  ceiling: "w.learned.chapterCeiling",
  clearance: "w.learned.chapterClearance",
  readiness: "w.learned.chapterReadiness",
};

/** The sentence that says where a chapter's numbers come from. */
export const LEARNED_CHAPTER_WHY_KEY: Record<LearnedChapter, string> = {
  ceiling: "w.learned.whyCeiling",
  clearance: "w.learned.whyClearance",
  readiness: "w.learned.whyReadiness",
};

/**
 * What an interval MEANS, because two different statements share the shape.
 *
 * `belief` — where the true value probably sits. Narrows with evidence.
 * `spread` — where the athlete's own days actually fell. Does NOT narrow with
 *   evidence; a wide spread is a fact about them, not a shortage of data.
 */
export type LearnedIntervalKind = "belief" | "spread";

export const LEARNED_INTERVAL_KEY: Record<LearnedIntervalKind, string> = {
  belief: "w.learned.intervalBelief",
  spread: "w.learned.intervalSpread",
};

/**
 * The clearance state as ONE WORD, for the qualifier beside the figure.
 *
 * `CLEARANCE_KEY` (feel-timing.ts) is not this: its strings are whole sentences
 * — "You clear fatigue slower than average" — written for the session-feel
 * sheet, where the reading needs explaining to someone who just tapped a face.
 * Beside a figure that already prints "× the curve" a sentence is a second
 * explanation of the same number. Same vocabulary, one register shorter.
 */
export const LEARNED_CLEARANCE_KEY: Record<Clearance, string> = {
  fast: "w.learned.clearFast",
  onTrack: "w.learned.clearOnTrack",
  slow: "w.learned.clearSlow",
};

export interface LearnedInterval {
  lo: number;
  hi: number;
  kind: LearnedIntervalKind;
}

/**
 * The readiness cause as ONE WORD, for the same reason `LEARNED_CLEARANCE_KEY`
 * exists: `READINESS_COST_KEY` labels a row in the ring's LEDGER, where the
 * label is the whole claim ("Tissue load, mostly {tissue}", "Wearable readings
 * (HRV, sleep)"). Here the claim is the share beside it and the cause is the
 * qualifier, so it wants a word. A tissue cost skips this entirely — it names
 * the muscle, which is shorter and more useful than any word for "tissue".
 */
export const LEARNED_CAUSE_KEY: Record<ReadinessCostKind, string> = {
  tissue: "w.learned.causeTissue",
  conditioning: "w.learned.causeConditioning",
  wearable: "w.learned.causeWearable",
  ceiling: "w.learned.causeCeiling",
};

export type LearnedState = "learned" | "waiting";

/** One claim. */
export interface LearnedFinding {
  chapter: LearnedChapter;
  /** Stable across months and renders — the list key, and what a test names. */
  id: string;
  /** i18n key naming the subject of the claim. */
  titleKey: string;
  /** The tissue the claim is about, when it is about one. */
  muscle: MuscleGroup | null;
  /** A short qualifier the client may draw as a chip: the ceiling's settled /
   *  converging verdict, the clearance word, the readiness cost's own label. */
  labelKey: string | null;
  /** The figure, in the claim's own unit. Null when there is nothing to state. */
  value: number | null;
  /** Decimals the figure and its delta are stated to — a set count is whole, a
   *  ratio against the curve is not. */
  decimals: number;
  unitKey: string;
  /** Signed movement across the window, in the figure's unit. Null when there
   *  is no comparable reading a month ago — which is not a zero. */
  delta: number | null;
  interval: LearnedInterval | null;
  source: LandmarkSource;
  /** 0…1 in the evidence behind the claim. Zero while waiting. */
  confidence: number;
  /** How much evidence, counted in the units `evidenceKey` names. */
  evidence: number;
  evidenceKey: string;
  state: LearnedState;
  /** What would settle it. Set on every waiting finding, null otherwise. */
  needKey: string | null;
}

export interface LearnedChapterView {
  chapter: LearnedChapter;
  titleKey: string;
  whyKey: string;
  findings: LearnedFinding[];
  learned: number;
  waiting: number;
  /** Mean confidence across the chapter's findings, waiting ones counted at 0. */
  known: number;
}

export interface LearnedMonth {
  /** ISO bounds of the window the story covers. */
  start: string;
  end: string;
  days: number;
  chapters: LearnedChapterView[];
  /** Every finding, in chapter order — for a client that wants one list. */
  findings: LearnedFinding[];
  learned: number;
  waiting: number;
  /**
   * The claim to lead with: the best-evidenced finding that MOVED this month,
   * or failing that the best-evidenced one at all. Null when nothing is known
   * yet, which is the honest headline for a first week and must not be faked.
   */
  headline: LearnedFinding | null;
  /**
   * 0…1 — how much of this athlete the app has actually measured. The mean of
   * the three CHAPTERS' means rather than of the findings, so seven tested
   * muscles cannot drown out a clearance rate nobody has measured.
   */
  known: number;
}

export interface LearnedMonthOptions {
  sessions?: LoggedSession[];
  recovery?: RecoveryReport[];
  /**
   * The SAME options the app resolves its landmarks with — profile, overrides,
   * the adaptive switch, warmup and fractional counting. `sessions`, `recovery`
   * and `now` are supplied from the fields above, so a caller cannot hand the
   * story a different log than it hands the Volume screen.
   */
  landmarks?: Omit<AthleteLandmarkOptions, "sessions" | "recovery" | "now">;
  now?: number;
  /** Window length. Defaults to LEARNED_WINDOW_WEEKS. */
  weeks?: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const round = (v: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** The log as it stood `n` days ago — the same rebase `performanceTrajectory`
 *  and `maxAcwrAt` use, so a replayed day means the same thing everywhere. */
const rebase = (log: TrainingLog, n: number): TrainingLog =>
  log.filter((s) => s.daysAgo >= n).map((s) => ({ ...s, daysAgo: s.daysAgo - n }));

/** A percentile of a sorted-in-place copy — the spread's two ends. */
function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const i = clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[i]!;
}

/** The month's story. */
export function learnedMonth(opts: LearnedMonthOptions = {}): LearnedMonth {
  const now = opts.now ?? Date.now();
  const weeks = clamp(Math.round(opts.weeks ?? LEARNED_WINDOW_WEEKS), 1, 12);
  const days = weeks * 7;
  const then = now - days * DAY;
  const base = opts.landmarks ?? {};
  const sessions = opts.sessions ?? [];
  const recovery = opts.recovery ?? [];
  const adaptive = base.adaptive !== false;

  const resolved = athleteLandmarks({ ...base, sessions, recovery, now });

  const chapters: LearnedChapterView[] = [
    ceilingChapter({ resolved, sessions, recovery, base, now, weeks, adaptive }),
    clearanceChapter({ resolved, sessions, recovery, then }),
    readinessChapter({ sessions, now, days }),
  ];

  const findings = chapters.flatMap((c) => c.findings);
  const learned = findings.filter((f) => f.state === "learned");
  // MOVEMENT LEADS. "Your quads ceiling rose two sets" is the sentence that
  // makes an athlete open the app next month; "your quads ceiling is 17" is a
  // fact they already read on the Volume screen.
  const moved = learned.filter((f) => f.delta != null && f.delta !== 0);
  const rank = (a: LearnedFinding, b: LearnedFinding) => b.confidence - a.confidence || b.evidence - a.evidence;
  const headline = [...moved].sort(rank)[0] ?? [...learned].sort(rank)[0] ?? null;

  return {
    start: new Date(then).toISOString(),
    end: new Date(now).toISOString(),
    days,
    chapters,
    findings,
    learned: learned.length,
    waiting: findings.length - learned.length,
    headline,
    known: round(mean(chapters.map((c) => c.known)), 2),
  };
}

/** Fold a chapter's findings into its own summary. */
function chapterOf(chapter: LearnedChapter, findings: LearnedFinding[]): LearnedChapterView {
  return {
    chapter,
    titleKey: LEARNED_CHAPTER_KEY[chapter],
    whyKey: LEARNED_CHAPTER_WHY_KEY[chapter],
    findings,
    learned: findings.filter((f) => f.state === "learned").length,
    waiting: findings.filter((f) => f.state === "waiting").length,
    known: round(mean(findings.map((f) => f.confidence)), 2),
  };
}

/* ── 1. THE CEILINGS ──────────────────────────────────────────────────────── */

/**
 * One finding per muscle the log has actually tested, and ONE aggregate for
 * everything it hasn't.
 *
 * Seven rows of "not enough evidence yet" would be honest and unreadable, and
 * unreadable is its own dishonesty: the point that gets lost is that the
 * untested muscles are untested for a reason you can act on (no week has yet
 * carried enough volume to find a ceiling). Said once, with the count, it lands.
 */
function ceilingChapter({
  resolved, sessions, recovery, base, now, weeks, adaptive,
}: {
  resolved: ReturnType<typeof athleteLandmarks>;
  sessions: LoggedSession[];
  recovery: RecoveryReport[];
  base: Omit<AthleteLandmarkOptions, "sessions" | "recovery" | "now">;
  now: number;
  weeks: number;
  adaptive: boolean;
}): LearnedChapterView {
  // Learning is switched OFF. Not an absence of evidence — a decision — so it
  // says so rather than reporting the prior as though the log had been read.
  if (!adaptive) {
    return chapterOf("ceiling", [{
      chapter: "ceiling",
      id: "ceiling:off",
      titleKey: "w.learned.fCeilingsOff",
      muscle: null,
      labelKey: null,
      value: null,
      decimals: 0,
      unitKey: "w.learned.unitSets",
      delta: null,
      interval: null,
      source: resolved.source,
      confidence: 0,
      evidence: 0,
      evidenceKey: "w.learned.evWeeks",
      state: "waiting",
      needKey: "w.learned.needAdaptive",
    }]);
  }

  // The ceiling's own history: the same resolver re-run at each week boundary
  // with only the data that existed then (landmark-replay.ts). It is what turns
  // "your ceiling is 17" into "it has been 17 for three weeks".
  const replays = sessions.length
    ? replayLandmarks(sessions, recovery, { ...base, replayWeeks: weeks + 1, now })
    : [];
  const byMuscle = new Map(replays.map((r) => [r.muscle, r]));

  const findings: LearnedFinding[] = [];
  let untested = 0;

  for (const m of ALL_MUSCLES) {
    const est = resolved.estimates[m];
    const overridden = base.overrides?.[m]?.mrv != null;
    const tested = !!est && est.confidence > 0;
    if (!tested && !overridden) {
      untested++;
      continue;
    }
    const replay = byMuscle.get(m);
    const points = replay?.points ?? [];
    const first = points[0];
    const last = points[points.length - 1];
    findings.push({
      chapter: "ceiling",
      id: `ceiling:${m}`,
      // The muscle names itself — the chapter head supplies "ceiling", so the
      // row reuses the vocabulary the Volume screen already taught.
      titleKey: MUSCLE_GROUP_KEY[m],
      muscle: m,
      // The trajectory's verdict, but NEVER its `insufficient` arm: it means
      // "the ceiling has not held still long enough to call it settled", which
      // on a row that also says "learned from your training, 100% confidence"
      // reads as a contradiction. Two different "not enough"s on one screen, one
      // about a claim and one about its stability, is a collision — so the
      // qualifier stays silent until the trajectory has something to add.
      labelKey: replay && replay.verdict !== "insufficient" ? REPLAY_VERDICT_KEY[replay.verdict] : null,
      value: resolved.landmarks[m].mrv,
      decimals: 0,
      unitKey: "w.learned.unitSets",
      // Only where the log had something to say at BOTH ends: a delta measured
      // against a week whose figure was still the untouched prior would report
      // the estimator waking up as the athlete's ceiling rising.
      delta: first && last && first.tested && last.tested ? last.mrv - first.mrv : null,
      interval: est ? { lo: est.lo, hi: est.hi, kind: "belief" } : null,
      source: overridden ? "manual" : "observed",
      // A number the athlete typed is not an estimate to be confident about —
      // it is simply true, which is why the manual layer carries no confidence
      // anywhere in the app (see `provenanceLadder`).
      confidence: overridden ? 1 : est!.confidence,
      evidence: est?.evidence.length ?? 0,
      evidenceKey: "w.learned.evWeeks",
      state: "learned",
      needKey: null,
    });
  }

  findings.sort((a, b) => b.evidence - a.evidence || b.confidence - a.confidence || a.id.localeCompare(b.id));

  if (untested > 0) {
    findings.push({
      chapter: "ceiling",
      id: "ceiling:untested",
      titleKey: "w.learned.fCeilingUntested",
      muscle: null,
      labelKey: null,
      value: null,
      decimals: 0,
      unitKey: "w.learned.unitSets",
      delta: null,
      interval: null,
      // Untested means the numbers on those muscles are still whatever the
      // profile prior said — or the population table under it.
      source: resolved.layers.includes("profile") ? "profile" : "population",
      confidence: 0,
      evidence: untested,
      evidenceKey: "w.learned.evUntested",
      state: "waiting",
      needKey: "w.learned.needWeeks",
    });
  }

  return chapterOf("ceiling", findings);
}

/* ── 2. THE MEASURED CLEARANCE RATE ───────────────────────────────────────── */

/**
 * How fast this athlete drains a session, against the population decay curve.
 *
 * The month-on-month delta re-runs the pair matcher with the clock moved back,
 * over only the sessions and reads that existed then — the same no-lookahead
 * rule the ceiling replay holds itself to. It is reported only when BOTH ends
 * cleared MIN_RECOVERY_PAIRS: a delta against a month that had no measurement
 * would be the arrival of the measurement, presented as a change in the athlete.
 */
function clearanceChapter({
  resolved, sessions, recovery, then,
}: {
  resolved: ReturnType<typeof athleteLandmarks>;
  sessions: LoggedSession[];
  recovery: RecoveryReport[];
  then: number;
}): LearnedChapterView {
  const idx = resolved.clearance;
  const learned = idx.confidence > 0;

  const before = sessions.filter((s) => {
    const t = Date.parse(s.completedAt ?? s.startedAt ?? "");
    return Number.isFinite(t) && t <= then;
  });
  const beforeRecovery = recovery.filter((r) => {
    const t = Date.parse(r.loggedAt ?? r.date);
    return Number.isFinite(t) && t <= then;
  });
  const wasIdx = learned && before.length ? athleteClearance(before, beforeRecovery, { now: then }) : null;
  const delta = learned && wasIdx && wasIdx.confidence > 0 ? round(idx.index - wasIdx.index, 3) : null;

  return chapterOf("clearance", [{
    chapter: "clearance",
    id: "clearance",
    titleKey: "w.learned.fClearance",
    muscle: null,
    labelKey: learned ? LEARNED_CLEARANCE_KEY[idx.clearance] : null,
    value: idx.index,
    decimals: 2,
    unitKey: "w.learned.unitCurve",
    delta,
    interval: { lo: idx.lo, hi: idx.hi, kind: "belief" },
    // Unproven, the ratio on screen is 1.0 — which is the population curve
    // itself, and must be labelled as such rather than as a flattering "you
    // recover exactly as expected".
    source: learned ? "observed" : "population",
    confidence: idx.confidence,
    evidence: idx.pairs,
    evidenceKey: "w.learned.evPairs",
    state: learned ? "learned" : "waiting",
    needKey: learned ? null : "w.learned.needPairs",
  }]);
}

/* ── 3. THE READINESS PATTERN ─────────────────────────────────────────────── */

/**
 * Readiness, replayed day by day across this window and the one before it, and
 * then asked two questions: what did it average, and what took the points.
 *
 * The deficit ledger is what makes the second question answerable at all —
 * `readinessDeficit` already splits every day's score into causes that sum to
 * exactly 100, so summing those causes across a month is arithmetic rather than
 * a new model. The share it reports is a CENSUS of the window (every day
 * counted, nothing estimated), which is why it carries no belief interval: it
 * is not an estimate of anything.
 *
 * NO WEARABLE, DELIBERATELY. `Biometrics` carries today's reading against a
 * baseline, not a series, so past days cannot be replayed with it — and a month
 * of load-driven days with one wearable-adjusted day on the end would be a mean
 * of two different measurements. Same rule, same reason, as
 * `performanceTrajectory`.
 */
function readinessChapter({
  sessions, now, days,
}: {
  sessions: LoggedSession[];
  now: number;
  days: number;
}): LearnedChapterView {
  const log = personalTrainingLog(sessions, now);
  const cur: number[] = [];
  const prev: number[] = [];
  // Points off 100, by cause, in each window. Tissue costs are tallied per
  // tissue as well: "tissue fatigue took 60%" names no limiter, and the limiter
  // is the actionable half of the claim.
  const curCost = new Map<string, number>();
  const prevCost = new Map<string, number>();
  const add = (into: Map<string, number>, key: string, points: number) =>
    into.set(key, (into.get(key) ?? 0) + points);

  for (let n = 0; n < days * 2; n++) {
    // Before the athlete's first session there is no reading to take — the
    // engine would answer 98 for every such day and a month of untrained days
    // would report as a month of perfect freshness.
    if (!log.some((s) => s.daysAgo >= n)) continue;
    const d = readinessDeficit(rebase(log, n));
    const window = n < days ? cur : prev;
    const costs = n < days ? curCost : prevCost;
    window.push(d.kept);
    for (const c of d.costs) add(costs, c.kind === "tissue" ? `tissue:${c.muscle}` : c.kind, c.points);
  }

  const enough = cur.length >= MIN_READINESS_DAYS;
  const comparable = enough && prev.length >= MIN_READINESS_DAYS;
  const avg = Math.round(mean(cur));
  // Coverage, not certainty: the readiness model is not estimating a hidden
  // number, it is reporting a mean, so what limits the claim is how much of the
  // month it saw.
  const coverage = enough ? round(clamp(cur.length / days, 0, 1), 2) : 0;

  const level: LearnedFinding = {
    chapter: "readiness",
    id: "readiness:level",
    titleKey: "w.learned.fReadiness",
    muscle: null,
    labelKey: null,
    value: enough ? avg : null,
    decimals: 0,
    unitKey: "w.learned.unitReadiness",
    delta: comparable ? Math.round(mean(cur) - mean(prev)) : null,
    // The SPREAD, not a confidence interval. Nine days in ten fell in here;
    // more days would not narrow it, because it is describing the athlete
    // rather than the app's uncertainty about them.
    interval: enough ? { lo: percentile(cur, 0.1), hi: percentile(cur, 0.9), kind: "spread" } : null,
    source: "observed",
    confidence: coverage,
    evidence: cur.length,
    evidenceKey: "w.learned.evDays",
    state: enough ? "learned" : "waiting",
    needKey: enough ? null : "w.learned.needDays",
  };

  // THE LIMITER — the cause that took the most off you across the month.
  let topKey: string | null = null;
  let topPoints = 0;
  let total = 0;
  for (const [k, v] of curCost) {
    total += v;
    if (v > topPoints) { topPoints = v; topKey = k; }
  }
  const kind = (topKey?.startsWith("tissue:") ? "tissue" : topKey) as ReadinessCostKind | null;
  const muscle = topKey?.startsWith("tissue:") ? (topKey.slice(7) as MuscleGroup) : null;
  const share = total > 0 ? Math.round((topPoints / total) * 100) : 0;
  // The same cause's share a month ago, so the figure can move. Comparing the
  // TOP cause of this window against the top cause of that one would compare
  // two different subjects and call the difference a trend.
  let prevTotal = 0;
  for (const v of prevCost.values()) prevTotal += v;
  const prevShare = topKey && prevTotal > 0 ? Math.round(((prevCost.get(topKey) ?? 0) / prevTotal) * 100) : null;
  const limiterLearned = enough && !!kind && total > 0;

  const limiter: LearnedFinding = {
    chapter: "readiness",
    id: "readiness:limiter",
    titleKey: "w.learned.fLimiter",
    muscle,
    labelKey: muscle ? MUSCLE_GROUP_KEY[muscle] : kind ? LEARNED_CAUSE_KEY[kind] : null,
    value: limiterLearned ? share : null,
    decimals: 0,
    unitKey: "w.learned.unitShare",
    delta: limiterLearned && comparable && prevShare != null ? share - prevShare : null,
    // A census of the window — every day counted, nothing inferred — so there
    // is no interval to state. Its honesty lives in `evidence`: the days.
    interval: null,
    source: "observed",
    confidence: limiterLearned ? coverage : 0,
    evidence: cur.length,
    evidenceKey: "w.learned.evDays",
    state: limiterLearned ? "learned" : "waiting",
    needKey: limiterLearned ? null : "w.learned.needDays",
  };

  return chapterOf("readiness", [level, limiter]);
}

/* ── FORMATTING, ONCE ─────────────────────────────────────────────────────── */

/** The figure as the story states it, or null when there is nothing to state. */
export function learnedFigure(f: LearnedFinding): string | null {
  return f.value == null ? null : f.value.toFixed(f.decimals);
}

/**
 * The interval as `lo–hi`, at the figure's own precision — or as a SINGLE value
 * when the evidence closed the band to one number, which happens for real: a
 * tolerated week props the bottom and a symptomatic week caps the top, and when
 * they meet the ceiling is pinned rather than estimated. "Probably between 23
 * and 23" is that fact rendered as a shrug.
 */
export function learnedIntervalLabel(f: LearnedFinding): string | null {
  if (!f.interval) return null;
  const { lo, hi } = f.interval;
  return lo === hi ? lo.toFixed(f.decimals) : `${lo.toFixed(f.decimals)}–${hi.toFixed(f.decimals)}`;
}

/** i18n key for the words in front of that figure. Null when there is no
 *  interval to caption. */
export function learnedIntervalKey(f: LearnedFinding): string | null {
  if (!f.interval) return null;
  if (f.interval.lo === f.interval.hi) return "w.learned.intervalPinned";
  return LEARNED_INTERVAL_KEY[f.interval.kind];
}

/** The movement as a signed figure — `+2`, `−0.06`, `—` when it did not move,
 *  null when there is nothing a month ago to compare against. A real minus
 *  sign, never a hyphen. */
export function learnedDeltaLabel(f: LearnedFinding): string | null {
  if (f.delta == null) return null;
  const v = round(f.delta, f.decimals);
  if (v === 0) return "—";
  return v > 0 ? `+${v.toFixed(f.decimals)}` : `−${Math.abs(v).toFixed(f.decimals)}`;
}

/**
 * WHICH WAY IS GOOD, and it is not the same answer per chapter — which is
 * exactly why it is decided here rather than by whichever screen is drawing an
 * arrow. A ceiling that rises is progress. A CLEARANCE RATIO that rises is the
 * opposite: the index is measured against the population decay curve and lower
 * means the session drained faster (CLEARANCE_FAST is 0.85). Readiness up is
 * good; the limiter's SHARE up is not.
 *
 * Returns the sense of the movement, not a colour — the client resolves the
 * role, so a screen cannot paint "improved" in the accent on one row and the
 * caution tone on the next.
 */
export type LearnedSense = "better" | "worse" | "flat" | "unknown";

/**
 * …and the ROLE each sense is painted from, so the two clients resolve one
 * mapping (semantic.ts) rather than each picking a hue per screen. `worse` is
 * CAUTION, not danger: a ceiling that came down or a clearance rate that slowed
 * is information about a month, not an injury flag.
 */
export const LEARNED_SENSE_ROLE: Record<LearnedSense, SemanticRole> = {
  better: "go",
  worse: "caution",
  flat: "neutral",
  unknown: "neutral",
};

export function learnedSense(f: LearnedFinding): LearnedSense {
  if (f.delta == null) return "unknown";
  if (f.delta === 0) return "flat";
  const up = f.delta > 0;
  switch (f.chapter) {
    case "ceiling":
      return up ? "better" : "worse";
    case "clearance":
      return up ? "worse" : "better";
    case "readiness":
      // The level rises and that is good; the limiter's share rises and it is
      // not — one chapter, two senses, and the id is what tells them apart.
      return f.id === "readiness:limiter" ? (up ? "worse" : "better") : up ? "better" : "worse";
  }
}

/** Whether the story has anything at all to say yet. */
export function learnedIsEmpty(m: LearnedMonth): boolean {
  return m.learned === 0;
}
