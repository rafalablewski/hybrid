/**
 * EFFORT MODEL — per-athlete learning from "how did that feel?".
 *
 * THE PROBLEM, stated as the athlete states it: two people run 10 km in 40
 * minutes. One floats home, the other is destroyed. The log records the same
 * session for both, so every engine downstream — fatigue, ACWR, readiness, the
 * prescription — treats them as the same athlete doing the same work. They are
 * not, and prescribing the same next session for both is how you break the
 * second one.
 *
 * The fix is not a better guess at the objective work; the objective work is
 * already measured. It is to learn the GAP between what the log implies and
 * what the athlete reports:
 *
 *     residual = reported session RPE − objective session RPE
 *
 * A consistently positive residual means this athlete pays more for the same
 * work than the log assumes (less trained, under-recovered, or simply built
 * that way). A consistently negative one means they pay less. That signed gap,
 * learned per athlete, is the thing that separates the two runners — and the
 * same gap watched OVER TIME is a fitness signal in its own right: when the
 * same objective session starts reporting easier, the athlete got fitter.
 *
 * MODELLING RULES, inherited from the rest of the stack:
 *  • Shrinkage toward the population prior (bias = 0), exactly the idiom
 *    personal.ts uses for the ACWR spike onset and datanet.ts for cohort norms.
 *    One rated session barely moves the model; twenty move it a long way.
 *  • Hard bounds, so no history can push the model somewhere absurd.
 *  • The evaluation is LEAVE-ONE-OUT, not in-sample. A fitted constant always
 *    looks good on the data it was fitted to, so an in-sample MAE would claim
 *    an improvement that isn't there.
 *  • Null, never a default, when there is nothing to say.
 *
 * WHAT THE WIRING ACTUALLY MOVES — measured, not assumed, and pinned in
 * effort.test.ts, because "the feeling now feeds the engines" is the kind of
 * claim that is easy to make and easy to be wrong about:
 *  • INJURY RISK / ACWR — yes, strongly. ACWR is an sRPE ratio, so a reported
 *    effort is literally its input. Twenty-eight days of the identical squat
 *    session read ACWR 1.43 (caution) when the athlete reports the last week as
 *    all-out and 0.40 (detraining) when they report it as easy: same log,
 *    injury risk 36 vs 23.
 *  • READINESS — only sometimes, and not for the reason you would guess. Muscle
 *    fatigue is normalised against the athlete's own max, so a UNIFORM change in
 *    reported effort cancels out entirely — except while the athlete's raw load
 *    sits under the engine's 40-unit normalisation floor, where it does move.
 *    Do not build a "your feeling sets your readiness" claim on top of this.
 *
 * Pure math. Feeds toTrainingLog (so a reported effort actually reaches the
 * engines) and the admin Engine Room.
 */

import type { LoggedSession } from "./session";
import { toTrainingLog } from "./session";
import type { TrainingLog } from "./types";
import { sessionLoad, sessionMinutes } from "./load";
import { sessionRpe, sanitizeFeelLevel } from "../session-feel";

/** The population prior: an athlete reports what the log implies. */
export const EFFORT_BIAS_PRIOR = 0;
/** Bounds the learned bias, in RPE points. */
export const EFFORT_BIAS_MAX = 2.5;
/** Pseudo-observations the prior is worth (same convention as shrinkNorm). */
export const EFFORT_BIAS_PRIOR_WEIGHT = 6;
/** Rated sessions needed before a trend is anything but noise. */
export const EFFORT_TREND_MIN_SAMPLES = 6;
/** Days the samples must span before a trend is anything but noise. */
export const EFFORT_TREND_MIN_DAYS = 14;

const clampRpe = (x: number) => Math.max(1, Math.min(10, x));
const clampBias = (x: number) => Math.max(-EFFORT_BIAS_MAX, Math.min(EFFORT_BIAS_MAX, x));

/**
 * The OBJECTIVE session RPE the log implies, 1..10 — the minutes-weighted mean
 * of each block's RPE. Identical by construction to `sessionLoad ÷
 * sessionMinutes`, since load is Σ (minutes × RPE); derived that way rather
 * than recomputed so the two can never disagree.
 *
 * Null for a session with no computable duration — nothing to weight.
 */
export function objectiveSessionRpe(s: LoggedSession): number | null {
  const minutes = sessionMinutes(s);
  if (!(minutes > 0)) return null;
  return clampRpe(sessionLoad(s) / minutes);
}

/** One labelled observation: what the log implied vs what the athlete said. */
export interface EffortSample {
  sessionId: string;
  /** ISO start of the session. */
  at: string;
  /** 1..10 objective session RPE from the log. */
  objective: number;
  /** 1..10 session RPE the athlete reported. */
  reported: number;
  /** reported − objective; the signal the model learns. */
  residual: number;
}

/**
 * Build the labelled set from history: every session the athlete answered "how
 * did that feel?" for AND that has a computable objective effort. A session
 * missing either side carries no signal and is left out — never defaulted.
 */
export function effortSamples(sessions: LoggedSession[]): EffortSample[] {
  const out: EffortSample[] = [];
  for (const s of sessions) {
    const reported = sessionRpe(sanitizeFeelLevel(s.feel));
    if (reported == null) continue;
    const objective = objectiveSessionRpe(s);
    if (objective == null) continue;
    out.push({
      sessionId: s.id,
      at: s.startedAt,
      objective,
      reported,
      residual: reported - objective,
    });
  }
  return out;
}

export interface EffortModel {
  /** learned RPE points to add to the objective effort for this athlete */
  bias: number;
  /** labelled sessions behind it */
  n: number;
  /** true once the bias has actually moved off the prior */
  personalized: boolean;
  /**
   * Leave-one-out mean absolute error of the personalised prediction, in RPE
   * points — null under 3 samples (LOO needs something to leave out).
   */
  mae: number | null;
  /** LOO MAE of the unpersonalised engine (bias = 0), the honest baseline. */
  baselineMae: number | null;
}

/** The shrunk, bounded bias for a set of residuals. */
function shrunkBias(residuals: number[], priorWeight: number): number {
  const n = residuals.length;
  if (n === 0) return EFFORT_BIAS_PRIOR;
  const mean = residuals.reduce((a, b) => a + b, 0) / n;
  return clampBias((n * mean + priorWeight * EFFORT_BIAS_PRIOR) / (n + priorWeight));
}

/**
 * Learn the athlete's effort bias, and score it honestly.
 *
 * The score is LEAVE-ONE-OUT: for each sample, the bias is refitted on every
 * OTHER sample and used to predict the held-out one. That is what makes the
 * comparison against `baselineMae` meaningful — an in-sample fit would beat the
 * baseline by construction whether or not the athlete has a real bias.
 */
export function deriveEffortModel(
  samples: EffortSample[],
  priorWeight = EFFORT_BIAS_PRIOR_WEIGHT,
): EffortModel {
  const residuals = samples.map((s) => s.residual);
  const bias = Math.round(shrunkBias(residuals, priorWeight) * 100) / 100;

  let mae: number | null = null;
  let baselineMae: number | null = null;
  if (samples.length >= 3) {
    let errModel = 0;
    let errBase = 0;
    for (let i = 0; i < samples.length; i++) {
      const held = samples[i]!;
      const rest = residuals.filter((_, j) => j !== i);
      const b = shrunkBias(rest, priorWeight);
      errModel += Math.abs(clampRpe(held.objective + b) - held.reported);
      errBase += Math.abs(clampRpe(held.objective) - held.reported);
    }
    mae = Math.round((errModel / samples.length) * 100) / 100;
    baselineMae = Math.round((errBase / samples.length) * 100) / 100;
  }

  return {
    bias,
    n: samples.length,
    personalized: bias !== EFFORT_BIAS_PRIOR,
    mae,
    baselineMae,
  };
}

/**
 * How hard a session of a given objective effort is predicted to FEEL for this
 * athlete, 1..10. With no model this is the objective effort itself, which is
 * exactly what every engine assumed before.
 */
export function predictReportedRpe(objective: number, model?: EffortModel | null): number {
  return clampRpe(objective + (model?.bias ?? 0));
}

/**
 * The EFFECTIVE session RPE the engines should use: the athlete's own answer
 * when they gave one, else the objective effort corrected by whatever the model
 * has learned about them. This is the single point where a reported feeling
 * becomes training load — see `toTrainingLog`.
 */
export function effectiveSessionRpe(s: LoggedSession, model?: EffortModel | null): number | null {
  const reported = sessionRpe(sanitizeFeelLevel(s.feel));
  if (reported != null) return reported;
  const objective = objectiveSessionRpe(s);
  return objective == null ? null : predictReportedRpe(objective, model);
}

/**
 * The athlete's TrainingLog with their own reported effort folded in — the one
 * call every engine path should use once "how did that feel?" is collecting
 * answers.
 *
 * ONLY REAL ANSWERS GO IN. An earlier cut also back-filled unrated sessions
 * with the model's PREDICTION, on the theory that a personalised guess beats
 * the engine's constant. It doesn't: it is still a guess, and substituting it
 * silently moved the numbers of every athlete who has never rated anything
 * (an unrated lift went from the engine's 7 to a predicted 7-plus-bias) with no
 * new information behind the change. The prediction's honest use is forward —
 * "how hard will THIS look feel" — not rewriting history.
 *
 * So: a session the athlete rated carries their answer; everything else is
 * bit-for-bit the old `toTrainingLog`.
 */
export function personalTrainingLog(sessions: LoggedSession[], now = Date.now()): TrainingLog {
  return toTrainingLog(sessions, now, (s) => sessionRpe(sanitizeFeelLevel(s.feel)));
}

export interface EffortTrend {
  /** change in residual per 30 days; NEGATIVE = the same work feels easier */
  perMonth: number;
  /** samples behind it */
  n: number;
  /** days the samples span */
  days: number;
  /** "fitter" when the same work is reporting easier, "harder" when worse */
  direction: "fitter" | "harder" | "flat";
}

/**
 * Is the same objective work getting EASIER for this athlete? A least-squares
 * slope of the residual against time — the one honest read on fitness that
 * comes out of a self-report, because it holds the objective work fixed and
 * watches only what the athlete says it cost them.
 *
 * Null until there are enough samples across enough days: a slope through four
 * points in one week is a line through noise, and presenting it as progress
 * would be the fabrication this codebase exists to avoid.
 */
export function effortTrend(
  samples: EffortSample[],
  opts: { minSamples?: number; minDays?: number } = {},
): EffortTrend | null {
  const minSamples = opts.minSamples ?? EFFORT_TREND_MIN_SAMPLES;
  const minDays = opts.minDays ?? EFFORT_TREND_MIN_DAYS;
  const pts = samples
    .map((s) => ({ t: Date.parse(s.at), r: s.residual }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
  if (pts.length < minSamples) return null;

  const days = (pts[pts.length - 1]!.t - pts[0]!.t) / 86_400_000;
  if (days < minDays) return null;

  // x in days from the first sample, so the slope is per day before scaling.
  const xs = pts.map((p) => (p.t - pts[0]!.t) / 86_400_000);
  const ys = pts.map((p) => p.r);
  const n = pts.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  if (!(den > 0)) return null;
  const perMonth = Math.round(((num / den) * 30) * 100) / 100;
  // A tenth of an RPE point a month is not a direction, it's rounding.
  const direction = perMonth <= -0.1 ? "fitter" : perMonth >= 0.1 ? "harder" : "flat";
  return { perMonth, n, days: Math.round(days), direction };
}
