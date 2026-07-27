/**
 * Engine Room — the admin transparency layer over the intelligence stack.
 *
 * The engines themselves stay pure and scattered across their own modules
 * (fatigue / readiness / hpi / load / injury / datanet). This module gives the
 * admin console ONE tested surface over them:
 *
 *   • ENGINE_FORMULAS — every formula the stack runs, as data (expression +
 *     constants + meaning), so the console renders the real math instead of a
 *     hand-maintained doc that drifts from the code.
 *   • computeEngineTrace — one call that materializes the full computation for
 *     an athlete: Performance State (HPI/readiness/fatigue/drivers), tissue
 *     injury risk with its calibrated p(injury), and the 14-day trajectory.
 *   • logisticCurve — sample points of the score → p(injury) calibration, for
 *     plotting the live curve next to an athlete's score.
 *   • whatIfLog / whatIfBio — the what-if simulator's input transforms (scale
 *     recent training, override today's wearable readings), kept here so the
 *     simulation is unit-tested math, not ad-hoc UI state.
 *
 * Pure data + composition of the existing engines. No UI, no I/O.
 */

import type { Biometrics, BiometricMetric, TrainingLog } from "./types";
import { EFFORT_BIAS_PRIOR_WEIGHT, EFFORT_TREND_MIN_SAMPLES, EFFORT_TREND_MIN_DAYS } from "./effort";
import {
  calibrateRisk,
  computeInjuryRisk,
  PRIOR_COEFFS,
  type CalibrationCoeffs,
  type InjuryRisk,
} from "./injury";
import {
  computePerformanceState,
  performanceTrajectory,
  type PerformanceState,
  type TrajectoryPoint,
} from "./performance-state";
import { enduranceFatigue, HYBRID_WEIGHTS, type HpiWeights } from "./hpi";

export type EngineFormulaGroup =
  | "fatigue"
  | "endurance"
  | "readiness"
  | "hpi"
  | "load"
  | "injury"
  | "calibration"
  | "effort";

/** One live formula, as data — the console's formula sheet renders these. */
export interface EngineFormula {
  id: string;
  engine: EngineFormulaGroup;
  name: string;
  /** the math as it runs, human-readable (× for multiply, σ for logistic) */
  expression: string;
  constants: { symbol: string; value: string; meaning: string }[];
  note: string;
}

/** group → label + the source module that owns the math. */
export const ENGINE_FORMULA_GROUPS: { id: EngineFormulaGroup; label: string; source: string }[] = [
  { id: "fatigue", label: "Tissue fatigue", source: "engines/fatigue.ts" },
  { id: "endurance", label: "Endurance load", source: "engines/hpi.ts" },
  { id: "readiness", label: "Readiness", source: "engines/readiness.ts" },
  { id: "hpi", label: "HPI", source: "engines/hpi.ts" },
  { id: "load", label: "Session load & ACWR", source: "engines/load.ts + injury.ts" },
  { id: "injury", label: "Injury risk", source: "engines/injury.ts" },
  { id: "calibration", label: "p(injury) calibration", source: "engines/injury.ts + datanet.ts" },
  { id: "effort", label: "Reported effort model", source: "engines/effort.ts" },
];

export const ENGINE_FORMULAS: EngineFormula[] = [
  {
    id: "fatigue-decay",
    engine: "fatigue",
    name: "Load decay",
    expression: "decay = 0.5 ^ (daysAgo / 2)",
    constants: [{ symbol: "2", value: "2 days", meaning: "fatigue half-life" }],
    note: "Every session's contribution halves every 2 days, so recent work dominates the fatigue read.",
  },
  {
    id: "fatigue-dose",
    engine: "fatigue",
    name: "Session dose",
    expression: "dose = (hardSets × 4  or  minutes × 0.9) × (RPE / 10) × decay",
    constants: [
      { symbol: "4", value: "4 au/set", meaning: "load units per hard set" },
      { symbol: "0.9", value: "0.9 au/min", meaning: "load units per conditioning minute" },
    ],
    note: "Each logged movement doses every muscle it touches (via the movement catalog), scaled by intensity.",
  },
  {
    id: "fatigue-normalize",
    engine: "fatigue",
    name: "Normalization",
    expression: "muscle = 100 × load / max(40, maxLoad)",
    constants: [{ symbol: "40", value: "40 au", meaning: "normalization floor" }],
    note: "Per-muscle fatigue is 0..100 relative to the most-loaded tissue; the floor keeps a light week from reading fully fatigued.",
  },
  {
    id: "endurance-fatigue",
    engine: "endurance",
    name: "Energy-system saturation",
    expression: "enduranceFatigue = 100 × (1 − e^(−(anaerobic + threshold + aerobic) / 90))",
    constants: [{ symbol: "90", value: "90 au", meaning: "load at which fatigue reaches ~63%" }],
    note: "Smooth saturation: one hard session ≈ 45, a brutal week → 85+. Never quite reaches 100.",
  },
  {
    id: "bio-adjust",
    engine: "readiness",
    name: "Wearable adjustment",
    expression: "bioAdj = clamp(40 × ΔHRV − 40 × ΔrestingHR + 25 × Δsleep, −15, +15)",
    constants: [
      { symbol: "40 / 40 / 25", value: "weights", meaning: "HRV, resting HR, sleep sensitivity" },
      { symbol: "±15", value: "clamp", meaning: "max wearable influence" },
    ],
    note: "Δ = relative deviation from the athlete's own rolling baseline, not a population norm. Resting HR is sign-flipped (up = worse).",
  },
  {
    id: "readiness",
    engine: "readiness",
    name: "Readiness score",
    expression: "readiness = clamp(100 − 0.7 × avgMuscleFatigue + bioAdj, 35, 98)",
    constants: [
      { symbol: "0.7", value: "0.7", meaning: "fatigue → readiness slope" },
      { symbol: "35..98", value: "clamp", meaning: "score bounds" },
    ],
    note: "Inverse of average muscle fatigue, nudged by the wearable signal.",
  },
  {
    id: "hpi",
    engine: "hpi",
    name: "Hybrid Performance Index",
    expression: "HPI = clamp((wₛ × S + wₑ × E) / (wₛ + wₑ) + R, 0, 100)",
    constants: [
      { symbol: "S", value: "100 − avgMuscleFatigue", meaning: "strength freshness" },
      { symbol: "E", value: "100 − enduranceFatigue", meaning: "endurance freshness" },
      { symbol: "R", value: "bioAdj (±15)", meaning: "recovery nudge" },
      { symbol: "wₛ/wₑ", value: "0.55/0.45 hybrid", meaning: "profile weights (0.8/0.2 strength, 0.25/0.75 endurance)" },
    ],
    note: "The limiter is whichever pillar has the largest gap to fully-ready; a recovery drag counts double.",
  },
  {
    id: "effort-objective",
    engine: "effort",
    name: "Objective session effort",
    expression: "objectiveRpe = sessionLoad ÷ sessionMinutes",
    constants: [{ symbol: "1..10", value: "clamped", meaning: "session RPE scale" }],
    note: "The minutes-weighted mean RPE the LOG implies — what the engine would assume if it never asked the athlete.",
  },
  {
    id: "effort-residual",
    engine: "effort",
    name: "Effort residual",
    expression: "residual = reportedRpe − objectiveRpe",
    constants: [],
    note: "The gap between what the log implies and what the athlete says it cost them. Positive = this athlete pays more for the same work.",
  },
  {
    id: "effort-bias",
    engine: "effort",
    name: "Personal effort bias (shrunk)",
    expression: "bias = clamp( (n × mean(residual) + w × 0) ÷ (n + w) , −2.5, +2.5 )",
    constants: [
      { symbol: "w", value: String(EFFORT_BIAS_PRIOR_WEIGHT), meaning: "pseudo-observations the prior is worth" },
      { symbol: "0", value: "0 RPE", meaning: "population prior — an athlete reports what the log implies" },
      { symbol: "±2.5", value: "±2.5 RPE", meaning: "hard bounds on personalization" },
    ],
    note: "Same shrinkage idiom as the personal ACWR onset: one rated session barely moves it, twenty move it a long way, and no history can push it somewhere absurd.",
  },
  {
    id: "effort-trend",
    engine: "effort",
    name: "Is the same work getting easier",
    expression: "trend = 30 × slope( residual vs days )",
    constants: [
      { symbol: "n", value: String(EFFORT_TREND_MIN_SAMPLES), meaning: "rated sessions required" },
      { symbol: "d", value: `${EFFORT_TREND_MIN_DAYS} days`, meaning: "window the samples must span" },
    ],
    note: "Holds the objective work fixed and watches only what the athlete says it cost. A falling residual is the one honest fitness read a self-report can give.",
  },
  {
    id: "srpe-load",
    engine: "load",
    name: "Session load (sRPE)",
    expression: "sessionLoad = Σ blockMinutes × RPE   (strength ≈ sets × 3.5 min)",
    constants: [{ symbol: "3.5", value: "3.5 min/set", meaning: "strength time incl. rest" }],
    note: "Duration × session RPE, the classic coach's load unit. Feeds monotony and strain.",
  },
  {
    id: "acwr",
    engine: "load",
    name: "Acute:chronic workload ratio",
    expression: "ACWR = acute₇ / (chronic₂₈ / 4)",
    constants: [
      { symbol: "7", value: "7 days", meaning: "acute window" },
      { symbol: "28", value: "28 days", meaning: "chronic window (÷4 → weekly average)" },
    ],
    note: "Computed PER TISSUE from undecayed dose, so a squat spike shows on quads, not on a whole-body blur. 1 = balanced; >1.5 = spiking. A contested metric — read with monotony and absolute load, never alone.",
  },
  {
    id: "injury-spike",
    engine: "injury",
    name: "Workload-spike component",
    expression: "spike = ramp(ACWR, onset, onset + 0.9) × 55",
    constants: [
      { symbol: "onset", value: "1.3 default", meaning: "population prior; personalized 1.1..1.6 from the athlete's outcome history" },
      { symbol: "0.9", value: "ramp width", meaning: "risk saturates 0.9 above the onset (default → 2.2)" },
      { symbol: "55", value: "55 pts", meaning: "max contribution" },
    ],
    note: "The classic ACWR danger zone, per tissue. ramp() is a linear 0..1 ramp between the bounds. The onset shrinks toward what THIS athlete has demonstrated: tolerated spikes raise it, injuries lower it (personal.ts).",
  },
  {
    id: "injury-load",
    engine: "injury",
    name: "Absolute-load component",
    expression: "load = (tissueFatigue / 100) × 28",
    constants: [{ symbol: "28", value: "28 pts", meaning: "max contribution" }],
    note: "A hammered tissue carries baseline risk even when acute and chronic load are balanced.",
  },
  {
    id: "injury-detrain",
    engine: "injury",
    name: "Detraining component",
    expression: "detrain = ramp(0.8 − ACWR, 0, 0.6) × 18",
    constants: [
      { symbol: "0.8", value: "onset", meaning: "ACWR below which detraining registers" },
      { symbol: "18", value: "18 pts", meaning: "max contribution" },
    ],
    note: "Very low acute load carries a small spike-on-return risk.",
  },
  {
    id: "injury-recovery",
    engine: "injury",
    name: "Recovery-suppression component",
    expression: "recovery = max(0, −bioAdj) × 1.2",
    constants: [{ symbol: "1.2", value: "1.2×", meaning: "suppression multiplier (max ~18 pts)" }],
    note: "Suppressed HRV/sleep or elevated resting HR raises risk across ALL tissues (systemic).",
  },
  {
    id: "injury-band",
    engine: "injury",
    name: "Risk score & bands",
    expression: "risk = clamp(spike + load + detrain + recovery, 0, 100)",
    constants: [
      { symbol: "30 / 50 / 70", value: "gates", meaning: "moderate / elevated / high" },
    ],
    note: "The athlete's overall risk is the highest tissue; tissues at ≥50 form the coach's flagged worklist.",
  },
  {
    id: "calibration",
    engine: "calibration",
    name: "Score → probability",
    expression: "p(injury) = σ(a + b × score / 100)",
    constants: [
      { symbol: "a", value: String(PRIOR_COEFFS.intercept), meaning: "intercept (prior)" },
      { symbol: "b", value: String(PRIOR_COEFFS.slope), meaning: "slope (prior)" },
    ],
    note: "The prior is documented, not fitted: score 50 → ~10%, score 80 → ~35%. Once ≥30 labeled outcomes exist, refitCalibration re-fits (a, b) by gradient descent and a new ModelFit version goes live everywhere risk is read.",
  },
];

/** Sample the calibration curve for plotting (score 0..100 → p). */
export function logisticCurve(
  coeffs: CalibrationCoeffs = PRIOR_COEFFS,
  steps = 40,
): { score: number; p: number }[] {
  const pts: { score: number; p: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const score = (i / steps) * 100;
    pts.push({ score, p: calibrateRisk(score, coeffs) });
  }
  return pts;
}

/** What-if inputs: scale recent training and/or override today's wearables. */
export interface WhatIf {
  /** % applied to the last `recentDays` of training (100 = as logged). */
  loadPct?: number;
  /** Override TODAY's readings; baselines stay untouched. */
  hrv?: number;
  restingHr?: number;
  sleep?: number;
}

/** Scale the last `recentDays` of training by `loadPct`% (sets and minutes). */
export function whatIfLog(log: TrainingLog, loadPct = 100, recentDays = 7): TrainingLog {
  if (loadPct === 100) return log;
  const f = Math.max(0, loadPct) / 100;
  return log.map((s) =>
    s.daysAgo >= 0 && s.daysAgo < recentDays
      ? {
          ...s,
          items: s.items.map((it) => ({
            ...it,
            ...(it.hardSets != null ? { hardSets: it.hardSets * f } : {}),
            ...(it.minutes != null ? { minutes: it.minutes * f } : {}),
          })),
        }
      : s,
  );
}

/** Override today's wearable readings (what-if) without moving the baselines. */
export function whatIfBio(bio: Biometrics | undefined, w: WhatIf): Biometrics | undefined {
  if (!bio) return undefined;
  const set = (m: BiometricMetric, v?: number): BiometricMetric =>
    v == null ? m : { ...m, today: v };
  return {
    ...bio,
    hrv: set(bio.hrv, w.hrv),
    restingHr: set(bio.restingHr, w.restingHr),
    sleep: set(bio.sleep, w.sleep),
  };
}

/** The full materialized computation for one athlete — what the console renders. */
export interface EngineTrace {
  state: PerformanceState;
  injury: InjuryRisk;
  /** oldest → newest, `days` points */
  trajectory: TrajectoryPoint[];
  /** the 0..100 energy-system figure behind HPI's endurance component */
  enduranceFatigue: number;
}

/**
 * Run the whole stack once. Apply a what-if by transforming the inputs first:
 * `computeEngineTrace(whatIfLog(log, w.loadPct), whatIfBio(bio, w))`.
 */
export function computeEngineTrace(
  log: TrainingLog,
  bio?: Biometrics,
  opts?: { weights?: HpiWeights; coeffs?: CalibrationCoeffs; days?: number; spikeOnset?: number },
): EngineTrace {
  const weights = opts?.weights ?? HYBRID_WEIGHTS;
  const state = computePerformanceState(log, bio, weights);
  return {
    state,
    injury: computeInjuryRisk(log, bio, opts?.coeffs ?? PRIOR_COEFFS, {
      spikeOnset: opts?.spikeOnset,
    }),
    trajectory: performanceTrajectory(log, opts?.days ?? 14),
    enduranceFatigue: enduranceFatigue(state.fatigue),
  };
}
