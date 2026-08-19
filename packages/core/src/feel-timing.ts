/**
 * WHEN YOU ANSWERED CHANGES WHAT THE ANSWER MEANS.
 *
 * "How spent are you?" is not one question — it is a different question at
 * every hour after the session. Tick "wrecked" ten minutes after a hard set of
 * squats and you have described a set of squats. Tick "wrecked" ten HOURS
 * later, showered, fed and back at your desk, and you have described a problem.
 * Identical stored values, opposite meanings, and the app treated them as the
 * same number.
 *
 * The model here is deliberately simple and stated in one place:
 *
 *   RESIDUAL — acute fatigue decays. Immediately post-session almost all of the
 *     disturbance is still present; it falls away fast over the first hours and
 *     then flattens onto a slower muscle-damage component that outlives the day.
 *     `expectedResidual(h)` is the fraction still expected to be there at h
 *     hours, an exponential toward a floor.
 *
 *   COST — divide the reported fatigue by the residual expected at that lag,
 *     and you get a timing-independent estimate of what the session actually
 *     cost. Fatigue 4 at 1 h is an ordinary hard session. The same 4 at 10 h is
 *     a much bigger disturbance, because most of the acute component should
 *     already have drained away and it hasn't.
 *
 *   WEIGHT — a report is not equally trustworthy at every lag. Answered days
 *     later it is recall, not measurement, so its influence decays too. A report
 *     with a lag we do not know keeps a neutral weight and is never inflated.
 *
 * This is the "how did that feel?" (post-workout, session-scoped) side of the
 * app. The daily check-in is a different instrument, asked before training about
 * the day rather than after training about the session — see checkin-scales.ts.
 */

const HOUR_MS = 3_600_000;

/** How the report should be interpreted, given how long after the session it
 *  was answered. The names are what the athlete is really telling you. */
export type FeelRead =
  /** Within ~3 h — describes the session itself, acute fatigue still present. */
  | "immediate"
  /** 3–12 h — the session has settled; this is the evening-after read. */
  | "sameDay"
  /** 12–36 h — this is a RECOVERY read, the most informative one for training. */
  | "nextDay"
  /** Beyond 36 h — recall rather than measurement; heavily discounted. */
  | "stale"
  /** No timestamp — legacy rows and anything logged without a clock. */
  | "unknown";

export const FEEL_READ_KEY: Record<FeelRead, string> = {
  immediate: "session.feel.readImmediate",
  sameDay: "session.feel.readSameDay",
  nextDay: "session.feel.readNextDay",
  stale: "session.feel.readStale",
  unknown: "session.feel.readUnknown",
};

/** Boundaries, in hours after the session ended. */
export const READ_BOUNDS = { immediate: 3, sameDay: 12, nextDay: 36 } as const;

export function classifyRead(hoursAfter: number | null): FeelRead {
  if (hoursAfter == null || !Number.isFinite(hoursAfter) || hoursAfter < 0) return "unknown";
  if (hoursAfter < READ_BOUNDS.immediate) return "immediate";
  if (hoursAfter < READ_BOUNDS.sameDay) return "sameDay";
  if (hoursAfter < READ_BOUNDS.nextDay) return "nextDay";
  return "stale";
}

/**
 * The fraction of a session's acute fatigue still expected to be present `h`
 * hours after it ended.
 *
 * Two components: a fast one that drains over the first hours (τ = 6 h) and a
 * slow floor (35%) standing in for the muscle-damage side that is still there
 * the next morning. At h = 0 everything is present; by 10 h under half of the
 * acute spike should remain; past a day it flattens onto the floor.
 */
export const RESIDUAL_FLOOR = 0.35;
export const RESIDUAL_TAU_H = 6;

export function expectedResidual(hoursAfter: number): number {
  const h = Math.max(0, hoursAfter);
  return RESIDUAL_FLOOR + (1 - RESIDUAL_FLOOR) * Math.exp(-h / RESIDUAL_TAU_H);
}

/**
 * How much a report at this lag should count. Full weight up to half a day
 * (measurement), then decaying toward a floor as it becomes recall. An unknown
 * lag keeps full weight — we have no reason to distrust it, only no reason to
 * adjust it either.
 */
export const RECALL_FROM_H = 12;
export const RECALL_TAU_H = 18;
export const WEIGHT_FLOOR = 0.25;

export function reportWeight(hoursAfter: number | null): number {
  if (hoursAfter == null || !Number.isFinite(hoursAfter) || hoursAfter < 0) return 1;
  if (hoursAfter <= RECALL_FROM_H) return 1;
  const over = hoursAfter - RECALL_FROM_H;
  return Math.round((WEIGHT_FLOOR + (1 - WEIGHT_FLOOR) * Math.exp(-over / RECALL_TAU_H)) * 1000) / 1000;
}

/** A fatigue report placed in time. */
export interface FeelReading {
  /** The raw 1–5 the athlete tapped. */
  fatigue: number;
  /** Hours between the session ending and the report, or null if unknown. */
  hoursAfter: number | null;
  read: FeelRead;
  /** 0…1 — the raw report above "fresh", before any timing adjustment. */
  raw: number;
  /** The residual fraction expected at that lag (1 when the lag is unknown). */
  expected: number;
  /**
   * 0…~1.5 — the timing-adjusted session cost. This is the number to compare
   * across sessions, because it no longer depends on when the athlete happened
   * to open the app.
   */
  cost: number;
  /** 0…1 — how much this report should count (recall discount at long lags). */
  weight: number;
  /**
   * The cost expressed back on the familiar 1–5 fatigue scale, FOR DISPLAY. It
   * saturates: a 5 is already the top of the scale, so a 5 logged ten hours out
   * and a 5 logged straight after both show as 5 even though their costs differ
   * a lot. Thresholds must therefore be written against `cost`, not this — see
   * COST_HIGH.
   */
  adjustedFatigue: number;
}

/** Cost is bounded: no lag should let one tap imply a superhuman disturbance. */
export const MAX_COST = 1.5;

/**
 * The cost at which a report reads as "this session was not absorbed".
 *
 * Calibrated against the cases that have to come out right:
 *   fatigue 4 at 1 h   → 0.83  a hard session, logged in the gym. Not a flag.
 *   fatigue 5 at 1 h   → 1.11  a very hard session. Still not a flag on its own.
 *   fatigue 4 at 10 h  → 1.50  still wrecked at bedtime. A flag.
 *   fatigue 4 at 20 h  → 1.50  still wrecked the next morning. A flag.
 *
 * Paired with MIN_STRAIN_FATIGUE so no amount of lag can inflate "I feel fine"
 * into a strain signal — dividing a small number by a small number must not
 * manufacture evidence.
 */
export const COST_HIGH = 1.15;
export const MIN_STRAIN_FATIGUE = 3;

/** Did this report indicate the session was not absorbed? Timing-aware, and
 *  false for any report that wasn't at least "worked" in raw terms. */
export function isStrained(r: FeelReading | null): boolean {
  return !!r && r.fatigue >= MIN_STRAIN_FATIGUE && r.cost >= COST_HIGH;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Place a fatigue report in time. `hoursAfter` null (no timestamp stored, e.g.
 * a row written before the column existed) degrades to the raw report — the
 * adjustment is skipped, never guessed.
 */
export function feelReading(fatigue: number, hoursAfter: number | null): FeelReading | null {
  if (!Number.isFinite(fatigue) || fatigue < 1 || fatigue > 5) return null;
  const lag = hoursAfter != null && Number.isFinite(hoursAfter) && hoursAfter >= 0 ? hoursAfter : null;
  const raw = (fatigue - 1) / 4;
  const expected = lag == null ? 1 : expectedResidual(lag);
  const cost = clamp(raw / expected, 0, MAX_COST);
  return {
    fatigue,
    hoursAfter: lag,
    read: classifyRead(lag),
    raw,
    expected: Math.round(expected * 1000) / 1000,
    cost: Math.round(cost * 1000) / 1000,
    weight: reportWeight(lag),
    // Back onto 1–5, clamped to the scale the rest of the app speaks.
    adjustedFatigue: Math.round(clamp(1 + cost * 4, 1, 5) * 100) / 100,
  };
}

/** Hours between a session ending and the moment its feel was logged. Null when
 *  either timestamp is missing or the maths would be nonsense (a report before
 *  the session ended is a clock problem, not a −2 hour lag). */
export function hoursAfterSession(
  sessionEnd: string | number | null | undefined,
  loggedAt: string | number | null | undefined,
): number | null {
  const end = typeof sessionEnd === "number" ? sessionEnd : sessionEnd ? Date.parse(sessionEnd) : NaN;
  const at = typeof loggedAt === "number" ? loggedAt : loggedAt ? Date.parse(loggedAt) : NaN;
  if (!Number.isFinite(end) || !Number.isFinite(at)) return null;
  const h = (at - end) / HOUR_MS;
  return h >= 0 ? Math.round(h * 100) / 100 : null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE SAME IDEA, ON THE WAY IN.
 *
 * Today's readiness check-in has the mirror-image problem. "Wrecked" ninety
 * minutes after a heavy session is the session talking, and reading it as a
 * recovery failure would have the app deload an athlete for the crime of
 * training hard. "Wrecked" a full day later, with nothing since, is the
 * reading that should actually change the plan. Same tap, same field, opposite
 * implication — so the card says which one it is looking at.
 * ──────────────────────────────────────────────────────────────────────────── */

/** How to read today's readiness answer, given the last session. */
export type ReadinessContext =
  /** No recent session — the answer is about the athlete, not a workout. */
  | "rested"
  /** Within ~3 h of training — a low answer is expected and means little. */
  | "postSession"
  /** 3–12 h — the session has settled; a low answer starts to count. */
  | "settling"
  /** 12–36 h — a low answer here is a recovery signal worth acting on. */
  | "recovered";

export function readinessContext(hoursSinceSession: number | null): ReadinessContext {
  if (hoursSinceSession == null || !Number.isFinite(hoursSinceSession) || hoursSinceSession < 0) return "rested";
  if (hoursSinceSession < READ_BOUNDS.immediate) return "postSession";
  if (hoursSinceSession < READ_BOUNDS.sameDay) return "settling";
  if (hoursSinceSession < READ_BOUNDS.nextDay) return "recovered";
  return "rested";
}

/**
 * The sentence the feeling card shows under the faces: what today's answer is
 * actually measuring, given how long ago the athlete last trained. `low` is
 * true for the two negative feelings (flat, wrecked) — the only ones whose
 * meaning genuinely turns on the clock. A positive answer soon after training
 * is worth saying too: it means the session was absorbed.
 */
export function readinessNoteKey(ctx: ReadinessContext, low: boolean): string | null {
  if (ctx === "rested") return null;
  if (ctx === "postSession") return low ? "w.home.today.ctxPostSessionLow" : "w.home.today.ctxPostSessionOk";
  if (ctx === "settling") return low ? "w.home.today.ctxSettlingLow" : "w.home.today.ctxSettlingOk";
  return low ? "w.home.today.ctxRecoveredLow" : "w.home.today.ctxRecoveredOk";
}

/** Hours since a session ended, for the readiness context. Null when unknown. */
export function hoursSince(sessionEnd: string | number | null | undefined, now: number): number | null {
  const end = typeof sessionEnd === "number" ? sessionEnd : sessionEnd ? Date.parse(sessionEnd) : NaN;
  if (!Number.isFinite(end)) return null;
  const h = (now - end) / HOUR_MS;
  return h >= 0 ? Math.round(h * 100) / 100 : null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * TWO READS ARE WORTH MORE THAN TWICE ONE.
 *
 * `expectedResidual` is a POPULATION curve: how fast fatigue drains for people
 * in general. Divide a single report by it and you get that session's cost,
 * timing removed. Useful, but it silently assumes this athlete drains at the
 * population rate — and the whole point of the volume model is that they don't.
 *
 * Ask twice about the SAME session, once in the gym and once hours later, and
 * that assumption becomes measurable. Both reports are converted to a cost
 * against the same curve, so if the athlete recovers exactly as the model
 * expects the two costs come out equal. They rarely do:
 *
 *   later < immediate   drained FASTER than the curve. Absorbed it.
 *   later ≈ immediate   on the curve.
 *   later > immediate   still carrying it long after the model says it should
 *                       have gone. This is the reading that should lower a
 *                       ceiling, and no single report can produce it — "4 the
 *                       next morning" alone can't tell you whether the session
 *                       was brutal or the recovery was poor. The pair can.
 *
 * WHY A RATIO AND NOT A FITTED TIME CONSTANT. Two points can be fitted to the
 * residual curve for a personal τ, and it is tempting because τ has units and
 * looks like physiology. It is not identifiable: the ratio R(h1)/R(h2) is not
 * monotone in τ, so a single pair admits two time constants, and picking the
 * one nearer the population value would be dressing an assumption up as a
 * measurement. The ratio is what the data actually supports — one number,
 * monotone, and directly interpretable as "against the curve".
 * ──────────────────────────────────────────────────────────────────────────── */

/** How the athlete's drain compared to the population curve. */
export type Clearance = "fast" | "onTrack" | "slow";

/** Ratio boundaries. Deliberately the same ±15% band as COST_HIGH: a session
 *  that reads 15% costlier than expected and an athlete who clears 15% slower
 *  than expected are the same size of departure, and the app should not have
 *  two opinions about what "meaningfully worse" means. */
export const CLEARANCE_FAST = 0.85;
export const CLEARANCE_SLOW = 1.15;

/** The reads must be far enough apart for the curve to have said anything. At
 *  a two-hour gap the expected residual barely moves, so the ratio is noise. */
export const MIN_PAIR_GAP_H = 4;

/**
 * …and the session must have cost something to drain.
 *
 * The IMMEDIATE report has to be at least "worked" — the same MIN_STRAIN_FATIGUE
 * bar the single-report rule uses, so the app has one idea of what counts as a
 * disturbance rather than two. Without it the ratio manufactures verdicts out of
 * nothing: an athlete who taps 2/5 in the gym and 2/5 the next morning divides
 * 0.26 by 0.61 and comes out at 2.4 — read literally, a badly impaired
 * recoverer, when in truth nothing happened to them either time.
 *
 * The cost floor stays as a second guard for the odd case where a raw 3 lands at
 * a lag that flattens it.
 */
export const MIN_PAIR_FATIGUE = MIN_STRAIN_FATIGUE;
export const MIN_PAIR_COST = 0.2;

/**
 * THE BAND CANNOT BE NARROWER THAN THE SCALE IT READS.
 *
 * The athlete answers on a five-point scale, so one step is 0.25 of the raw
 * range — and the reads that matter arrive hours later, where the residual has
 * shrunk. Dividing a fixed 0.25 by a small residual is what makes the reachable
 * RATIOS spread out: at a fourteen-hour gap, adjacent answers land about 0.8
 * apart, against a band CLEARANCE_FAST…CLEARANCE_SLOW only 0.30 wide. The band
 * then sits in a GAP between two buttons, and no answer the athlete is able to
 * give reads as on-track.
 *
 * That is not a rare corner. Across the immediate answers and gaps this app
 * actually collects, most combinations have no on-track answer available at
 * all, and the readiness picker's four levels make it worse than the five-point
 * row on the finish screen. The athlete cannot report normal recovery, because
 * normal recovery is not one of the buttons — so an ordinary recoverer is
 * pushed onto "fast" or "slow" by rounding rather than by physiology.
 *
 * So the band widens to half a step whenever half a step is wider, which is
 * exactly the condition for "the nearest reachable answer to on-curve reads as
 * on-curve". Where the scale is fine enough to resolve the original ±15% — short
 * gaps, a costly session — nothing changes and the floor still governs.
 *
 * WHAT THIS DOES NOT FIX, stated because the number is easy to misread: the
 * band is the LABEL. `recoveryIndex` averages the ratios themselves and
 * `clearanceFactor` reads that mean, so neither moves by a hair here. Rounding
 * a between-buttons answer up still biases the ratio, and that bias reaches
 * prescribed volume. Widening the band is the honest half of the fix — it stops
 * the app calling normal recovery abnormal — not the whole of it.
 */
/** One level on the 1–5 answer scale, in raw (0…1) terms. */
export const SCALE_STEP = 0.25;

/** The narrowest the on-track band may be — the original ±15% corridor. */
export const BAND_HALF_FLOOR = (CLEARANCE_SLOW - CLEARANCE_FAST) / 2;

export function clearanceBandHalf(immediateCost: number, laterHoursAfter: number): number {
  const step = SCALE_STEP / (expectedResidual(laterHoursAfter) * immediateCost);
  return Math.max(BAND_HALF_FLOOR, step / 2);
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE OTHER HALF OF THE QUANTISATION PROBLEM — and what was measured.
 *
 * `clearanceBandHalf` above fixed the LABEL: it stopped the app calling normal
 * recovery abnormal. It could not fix the MEAN, because `recoveryIndex`
 * averages the ratios themselves and `clearanceFactor` reads that mean, never
 * the label. So the question was what the ratio's own error actually is.
 *
 * Monte-Carlo against this module's own model, athletes placed exactly on the
 * population curve and their answers put through the real scales:
 *
 *   THE BIAS IS LAG-DEPENDENT, NOT DIRECTIONAL. An on-curve athlete reads
 *   −0.05 at a six-hour gap and +0.08 at twenty-four. Averaged over the gaps
 *   the app collects it is ~0.00. So the defect is not "the app scores people
 *   slow" — it is that the SAME athlete reads about 13 points apart depending
 *   on what time they happened to tap, which is precisely what this file
 *   exists to eliminate.
 *
 *   THE FOUR-LEVEL PICKER IS NOT THE CULPRIT. It performs identically to a
 *   five-level row, because at these lags true spentness rarely reaches the
 *   level the picker cannot express. Widening the readiness picker buys
 *   nothing; only a much finer scale (nine steps, a slider) helps, and it takes
 *   the worst gap error from 0.08 to about 0.03 — the remaining 0.02 being the
 *   IMMEDIATE read's own five-level quantisation, which no change here reaches.
 *
 * THREE CORRECTIONS WERE TRIED AND ARE ALL WORSE. Written down because each is
 * the obvious next idea, and each looks right until measured:
 *
 *   SHRINK-TO-NULL (take the point in the interval nearest 1) removes the
 *     lag bias perfectly — exactly 1.000 at every gap — and destroys the
 *     feature: a genuinely impaired athlete at a true 1.50 reads 1.06. The
 *     interval is wider than the effect, so shrinking always lands on 1.
 *
 *   INVERSE-VARIANCE WEIGHTING by interval width keeps sensitivity but
 *     introduces a −0.05…−0.14 bias of its own: narrow bins are not a random
 *     subsample, so weighting on width is weighting on the value.
 *
 *   PER-PAIR CALIBRATION (divide by what an on-curve athlete would have been
 *     forced to report at this lag) sounds exact and is the worst of the three:
 *     both numerator and denominator are quantised, so instead of cancelling
 *     they compound. Worst gap error 0.14, and the spread for one athlete
 *     across gaps goes from 0.07 to 0.31.
 *
 * SO THE FIX IS NOT TO CORRECT THE NUMBER — every correction costs more than
 * the error. It is to stop pretending the number is a point measurement. The
 * interval is carried through to the index, where it widens the published band
 * and scales `confidence`, so coarse evidence moves a volume ceiling
 * proportionally less instead of at full strength. The bias remains; what it
 * can no longer do is move training as though it were signal.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * AN ANSWER IS A BIN, NOT A NUMBER.
 *
 * "Good" does not mean spentness is exactly 2. It means the athlete's true
 * spentness was nearer 2 than 1 or 3 — anywhere in ±half a level. Every ratio
 * this file computes divides one such bin by another and prints the result to
 * three decimals, which is the most confident-looking number in the app
 * standing on the least evidence.
 *
 * The bounds are clamped to the scale at both ends: "fresh" cannot mean less
 * than nothing, and "wrecked" cannot mean more than the top.
 */
export function answerBounds(fatigue: number): [number, number] {
  const lo = clamp((fatigue - 1.5) / 4, 0, 1);
  const hi = clamp((fatigue - 0.5) / 4, 0, 1);
  return [lo, hi];
}

/** The same bin expressed as a cost at that lag. */
export function costBounds(fatigue: number, hoursAfter: number | null): [number, number] {
  const [lo, hi] = answerBounds(fatigue);
  const r = hoursAfter == null ? 1 : expectedResidual(hoursAfter);
  return [clamp(lo / r, 0, MAX_COST), clamp(hi / r, 0, MAX_COST)];
}

/**
 * The ratio interval a pair actually supports — both bins, divided.
 *
 * WHAT THIS EXPOSES, and it is the number that should govern how much anything
 * downstream leans on a pair. Measured across every answer combination the app
 * can actually collect, an unclamped interval runs 0.51 to 2.23 wide, median
 * 1.03 — against an on-track band 0.30 wide. No single pair can place itself
 * inside that band; the point estimate is a number drawn from a range three
 * times wider than the classification it feeds, and nothing said so.
 *
 * A width BELOW the band is always a clamp, never precision: `cost` saturates
 * at MAX_COST, so a pair like "wrecked → tired the next day" reports 0.21
 * because both bounds ran into the ceiling, not because it measured anything
 * finely. Read a narrow width as "off the top of the scale", not "certain".
 */
export function ratioBounds(immediate: FeelReading, later: FeelReading): [number, number] {
  const [il, ih] = costBounds(immediate.fatigue, immediate.hoursAfter);
  const [ll, lh] = costBounds(later.fatigue, later.hoursAfter);
  // A zero-cost immediate is already refused by MIN_PAIR_COST; guard anyway so
  // the bound can never be an infinity that propagates into a mean.
  if (ih <= 0 || il <= 0) return [0, MAX_COST / MIN_PAIR_COST];
  const lo = ll / ih;
  const hi = lh / il;
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

export interface RecoveryCurve {
  /** later.cost ÷ immediate.cost. 1 means "exactly as the curve predicts". */
  ratio: number;
  clearance: Clearance;
  /** Hours between the two reads. */
  gapH: number;
  /** 0…1 — the pair's influence, the lesser of the two reports' weights. */
  weight: number;
  /**
   * How far from 1 the ratio had to be for this pair to read fast or slow —
   * `clearanceBandHalf` at this pair's lag and cost. Carried so a surface can
   * say how much resolution the pair actually had, rather than implying the
   * ±15% corridor applied when it didn't.
   */
  bandHalf: number;
  /** The ratio interval both answers' bins actually support — `ratioBounds`. */
  lo: number;
  hi: number;
  /** `hi − lo`. Between about 0.5 and 2.4, against a 0.30 band: this is how
   *  much a single pair can pin down, which is much less than `ratio` looks. */
  width: number;
}

/**
 * Compare an athlete's own two reads of one session. Null when the pair cannot
 * support a verdict — reads too close together, either lag unknown, or nothing
 * there to drain.
 */
export function recoveryCurve(immediate: FeelReading | null, later: FeelReading | null): RecoveryCurve | null {
  if (!immediate || !later) return null;
  if (immediate.hoursAfter == null || later.hoursAfter == null) return null;
  const gapH = Math.round((later.hoursAfter - immediate.hoursAfter) * 100) / 100;
  if (gapH < MIN_PAIR_GAP_H) return null;
  if (immediate.fatigue < MIN_PAIR_FATIGUE || immediate.cost < MIN_PAIR_COST) return null;

  const ratio = Math.round((later.cost / immediate.cost) * 1000) / 1000;
  const bandHalf = Math.round(clearanceBandHalf(immediate.cost, later.hoursAfter) * 1000) / 1000;
  const [lo, hi] = ratioBounds(immediate, later);
  return {
    ratio,
    clearance: ratio < 1 - bandHalf ? "fast" : ratio > 1 + bandHalf ? "slow" : "onTrack",
    gapH,
    weight: Math.min(immediate.weight, later.weight),
    bandHalf,
    lo: Math.round(lo * 1000) / 1000,
    hi: Math.round(hi * 1000) / 1000,
    // From the ROUNDED bounds, not the raw ones: a width that disagrees with
    // hi − lo by a thousandth is the kind of thing a caller eventually asserts
    // on and loses an afternoon to.
    width: Math.round(hi * 1000) / 1000 - Math.round(lo * 1000) / 1000,
  };
}

export interface RecoveryIndex {
  /** Weighted mean ratio across pairs. 1 = on the population curve. */
  index: number;
  /** 0…1 — how much the app should lean on it. Zero below two pairs. */
  confidence: number;
  /** Pairs behind it. */
  pairs: number;
  clearance: Clearance;
  /**
   * 0…1 — how much the pairs behind this index could actually RESOLVE, as
   * distinct from how many there are. See `resolutionOf`. It scales
   * `confidence`, which is what stops coarse evidence moving a volume ceiling
   * at full strength.
   */
  resolution: number;
  /**
   * THE STATED INTERVAL, and it ships with the number for the same reason
   * `MrvEstimate.lo/hi` does: an estimate shown bare reads as a measurement.
   *
   * Unproven (confidence 0) the band is the population's own ON-TRACK corridor,
   * CLEARANCE_FAST…CLEARANCE_SLOW — the honest statement being "somewhere in the
   * band everybody starts in", not a point estimate of 1.
   *
   * With pairs, it is the standard error of the weighted mean, widened to
   * CLEARANCE_INTERVAL_FLOOR: two pairs that happen to agree to the decimal have
   * not measured a ratio to three of them, and a zero-width interval would be
   * the most confident claim on the screen off the least evidence in the app.
   */
  lo: number;
  hi: number;
}

/** Two pairs is the floor: one is an anecdote, and a single bad night would
 *  otherwise move an athlete's recovery model. */
export const MIN_RECOVERY_PAIRS = 2;

/** The narrowest the clearance interval may ever be — see `RecoveryIndex.lo`. */
export const CLEARANCE_INTERVAL_FLOOR = 0.05;

/**
 * The athlete's recovery rate against the population curve, across every pair
 * the log holds. Returns a neutral index with zero confidence when there isn't
 * enough — never a guess dressed as a measurement.
 */
export function recoveryIndex(curves: (RecoveryCurve | null)[]): RecoveryIndex {
  const usable = curves.filter((c): c is RecoveryCurve => !!c && c.weight > 0);
  if (usable.length < MIN_RECOVERY_PAIRS) {
    return { index: 1, confidence: 0, pairs: usable.length, clearance: "onTrack", resolution: 0, lo: CLEARANCE_FAST, hi: CLEARANCE_SLOW };
  }
  let num = 0;
  let den = 0;
  for (const c of usable) {
    num += c.ratio * c.weight;
    den += c.weight;
  }
  const index = Math.round((num / den) * 1000) / 1000;
  // The spread of the pairs around their own mean, weighted the same way the
  // mean is, over the EFFECTIVE sample size — (Σw)²/Σw², which is the pair count
  // when every pair carries equal weight and falls below it as the weights
  // spread, so a handful of half-remembered reports cannot buy the narrow band
  // that a handful of clean ones would.
  let sqDev = 0;
  let sqW = 0;
  for (const c of usable) {
    sqDev += c.weight * (c.ratio - index) ** 2;
    sqW += c.weight ** 2;
  }
  const nEff = sqW > 0 ? (den * den) / sqW : usable.length;
  const spreadHalf = nEff > 0 ? Math.sqrt(sqDev / den) / Math.sqrt(nEff) : CLEARANCE_INTERVAL_FLOOR;

  // THE QUANTISATION HALF-WIDTH, which the standard error above cannot see.
  //
  // Spread measures how much the pairs disagree with EACH OTHER. It says
  // nothing about how much any one of them could be wrong, and every one of
  // them is a bin divided by a bin (`ratioBounds`). Three pairs that agree to
  // the decimal have a spread near zero and an honest uncertainty of about a
  // full ratio unit — which is how the least evidence in the app was producing
  // the narrowest claim on the screen.
  //
  // It averages down like any independent error: different sessions land in
  // different bins, so the mean's share is the typical width over √nEff.
  const meanWidth = usable.reduce((a, c) => a + c.width * c.weight, 0) / den;
  const quantHalf = meanWidth / 2 / Math.sqrt(Math.max(1, nEff));
  const half = Math.max(CLEARANCE_INTERVAL_FLOOR, spreadHalf, quantHalf);

  return {
    index,
    // Confidence is scaled by how much the pairs could actually RESOLVE. Pair
    // count alone was measuring diligence, not evidence: twenty pairs of
    // "worked → good, next morning" are twenty intervals two units wide, and
    // they should not move a volume ceiling as if they were twenty
    // measurements. `clearanceFactor` reads this, so coarse evidence now moves
    // training proportionally less instead of at full strength.
    confidence:
      Math.round(
        Math.min(0.8, 0.25 + (usable.length - MIN_RECOVERY_PAIRS) * 0.15) * resolutionOf(meanWidth, nEff) * 100,
      ) / 100,
    pairs: usable.length,
    clearance: index < CLEARANCE_FAST ? "fast" : index > CLEARANCE_SLOW ? "slow" : "onTrack",
    resolution: Math.round(resolutionOf(meanWidth, nEff) * 100) / 100,
    lo: Math.round(Math.max(0, index - half) * 1000) / 1000,
    hi: Math.round((index + half) * 1000) / 1000,
  };
}

/**
 * How much the evidence behind an index can actually resolve, 0…1.
 *
 * 1 means the mean's interval has narrowed to the on-track band itself — the
 * point at which the estimate can genuinely place an athlete inside or outside
 * the corridor. Below that it is the ratio of what the band needs to what the
 * evidence offers, so it rises with √pairs exactly as the interval narrows.
 *
 * NOTHING reaches 1 off a handful of pairs, and that is the correct reading:
 * the widths measured off real answer combinations run 0.5 to 2.4 against a
 * band of 0.30, so even the tightest single pair is short by a factor of ~1.7.
 */
export function resolutionOf(meanWidth: number, nEff: number): number {
  const band = CLEARANCE_SLOW - CLEARANCE_FAST;
  const meanW = meanWidth / Math.sqrt(Math.max(1, nEff));
  if (!Number.isFinite(meanW) || meanW <= 0) return 1;
  return clamp(band / Math.max(meanW, band), 0, 1);
}

/** How hard a measured clearance rate may move the recovery multiplier. Kept
 *  modest and bounded: this is two taps a day, not a blood panel. */
export const CLEARANCE_SLOPE = 0.35;
export const CLEARANCE_FACTOR_BOUNDS: [number, number] = [0.85, 1.12];

/**
 * The recovery multiplier this clearance rate implies — clearing slower than
 * the curve means less volume is recoverable, and vice versa. Scaled by
 * confidence so two pairs nudge and twenty pairs move it, and returns exactly 1
 * when there is nothing to say.
 */
export function clearanceFactor(idx: RecoveryIndex): number {
  if (idx.confidence <= 0) return 1;
  const raw = 1 + (1 - idx.index) * CLEARANCE_SLOPE * idx.confidence;
  const [lo, hi] = CLEARANCE_FACTOR_BOUNDS;
  return Math.round(clamp(raw, lo, hi) * 1000) / 1000;
}

export const CLEARANCE_KEY: Record<Clearance, string> = {
  fast: "session.feel.clearanceFast",
  onTrack: "session.feel.clearanceOnTrack",
  slow: "session.feel.clearanceSlow",
};

/**
 * The one-line explanation the UI shows next to a logged feel — which i18n key
 * describes what this report is actually measuring. Pairs with FEEL_READ_KEY.
 */
export function readNoteKey(read: FeelRead, fatigue: number): string {
  if (read === "unknown") return "session.feel.noteUnknown";
  const heavy = fatigue >= 4;
  if (read === "immediate") return heavy ? "session.feel.noteImmediateHeavy" : "session.feel.noteImmediate";
  if (read === "sameDay") return heavy ? "session.feel.noteSameDayHeavy" : "session.feel.noteSameDay";
  if (read === "nextDay") return heavy ? "session.feel.noteNextDayHeavy" : "session.feel.noteNextDay";
  return "session.feel.noteStale";
}
