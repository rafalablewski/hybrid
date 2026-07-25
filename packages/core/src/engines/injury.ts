/**
 * Injury risk — tissue-level, per-athlete, explainable.
 *
 * A heuristic v0 (not a trained model — that's the Layer-2 roadmap item) that
 * is already a meaningful step beyond a single-signal ACWR dashboard: it fuses
 * acute:chronic workload, absolute tissue fatigue, and recovery suppression
 * into a per-tissue risk WITH its drivers, plus a gated band a coach can act on.
 *
 * Honest about its inputs: every score reports the factors that produced it.
 * Pure; reads the same MOVEMENTS map the fatigue engine uses.
 */

import type { Biometrics, MuscleGroup, TrainingLog } from "./types";
import { ALL_MUSCLES, movementFor } from "./movements";
import { computeFatigue } from "./fatigue";
import { biometricAdjustment } from "./readiness";

export type RiskBand = "low" | "moderate" | "elevated" | "high";

/**
 * Calibration: map the 0..100 heuristic score to an injury PROBABILITY via a
 * logistic curve, and version it. Coefficients are a documented prior (score 50
 * → ~10%, 80 → ~35%), NOT yet fit on outcomes — when the data network has
 * enough labeled injuries, refit here and bump the version. Probability +
 * versioning is the structure a calibrated model and offline eval plug into.
 */
export const RISK_MODEL_VERSION = "heuristic-cal-v0";

/** Logistic coefficients; the prior is overridden by a refit (see datanet). */
export interface CalibrationCoeffs {
  intercept: number;
  slope: number;
}
export const PRIOR_COEFFS: CalibrationCoeffs = { intercept: -4.83, slope: 5.26 };

export function calibrateRisk(score: number, coeffs: CalibrationCoeffs = PRIOR_COEFFS): number {
  const x = Math.max(0, Math.min(100, score)) / 100;
  const z = coeffs.intercept + coeffs.slope * x;
  return 1 / (1 + Math.exp(-z));
}

/**
 * The FOUR ways a tissue's risk can rise. A machine-readable discriminator so
 * the clients can attach LOCALIZED copy and a plain-language explanation to each
 * driver instead of rendering an opaque English template string. Map a kind to
 * its i18n keys with RISK_DRIVER_LABEL_KEY / RISK_DRIVER_EXPLAIN_KEY.
 */
export type RiskDriverKind = "spike" | "load" | "detrain" | "recovery";

export interface RiskDriver {
  /** which of the four factors this is — drives the UI's label + guidance copy */
  kind: RiskDriverKind;
  /** plain-English fallback (non-i18n consumers, logs, tests) */
  label: string;
  /** points this factor contributed to the tissue's 0..100 risk */
  contribution: number;
  /** the acute:chronic ratio behind a spike/detrain driver (absent for load/recovery) */
  acwr?: number;
}

/** kind → i18n key for the SHORT driver label ("Workload spike"). */
export const RISK_DRIVER_LABEL_KEY: Record<RiskDriverKind, string> = {
  spike: "w.injury.driver.spike",
  load: "w.injury.driver.load",
  detrain: "w.injury.driver.detrain",
  recovery: "w.injury.driver.recovery",
};

/** kind → i18n key for the plain-language "what this means / what to do" copy. */
export const RISK_DRIVER_EXPLAIN_KEY: Record<RiskDriverKind, string> = {
  spike: "w.injury.explain.spike",
  load: "w.injury.explain.load",
  detrain: "w.injury.explain.detrain",
  recovery: "w.injury.explain.recovery",
};

export interface TissueRisk {
  tissue: MuscleGroup;
  /** 0..100 */
  risk: number;
  /** calibrated injury probability 0..1 (see calibrateRisk) */
  prob: number;
  band: RiskBand;
  /** acute:chronic workload ratio (1 = balanced; >1.5 = spiking) */
  acwr: number;
  drivers: RiskDriver[];
  /** false when there isn't enough chronic history to trust the ACWR */
  enoughHistory: boolean;
}

export interface InjuryRisk {
  overall: number;
  /** calibrated probability of the highest-risk tissue */
  prob: number;
  band: RiskBand;
  /** which calibration produced these numbers */
  modelVersion: string;
  /** every tissue, highest risk first */
  tissues: TissueRisk[];
  /** the subset at elevated/high risk — the coach's worklist */
  flagged: TissueRisk[];
}

/** Undecayed per-tissue load summed over sessions within the last `days`. */
function tissueLoadWindow(log: TrainingLog, days: number): Record<MuscleGroup, number> {
  const load = Object.fromEntries(ALL_MUSCLES.map((m) => [m, 0])) as Record<MuscleGroup, number>;
  for (const session of log) {
    if (session.daysAgo < 0 || session.daysAgo >= days) continue;
    for (const it of session.items) {
      const meta = movementFor(it.move);
      if (!meta) continue;
      const intensity = it.topRpe ? it.topRpe / 10 : (it.rpe ?? 6) / 10;
      const dose = (it.hardSets ? it.hardSets * 4 : (it.minutes ?? 0) * 0.9) * intensity;
      for (const m of meta.muscles) load[m] += dose;
    }
  }
  return load;
}

function band(risk: number): RiskBand {
  if (risk >= 70) return "high";
  if (risk >= 50) return "elevated";
  if (risk >= 30) return "moderate";
  return "low";
}

/** Smooth 0..1 ramp between `lo` and `hi`. */
function ramp(x: number, lo: number, hi: number): number {
  if (x <= lo) return 0;
  if (x >= hi) return 1;
  return (x - lo) / (hi - lo);
}

/**
 * Per-tissue injury risk. Components (capped, summed to 0..100):
 *   • workload spike — ACWR above ~1.3 ramps in (the classic, but per-tissue)
 *   • absolute load  — a hammered tissue carries baseline risk even in balance
 *   • detraining     — very low ACWR (<0.8) carries a small spike-on-return risk
 *   • recovery       — suppressed HRV/sleep / elevated resting HR raises all tissues
 */
export function computeInjuryRisk(log: TrainingLog, bio?: Biometrics, coeffs: CalibrationCoeffs = PRIOR_COEFFS): InjuryRisk {
  const fatigue = computeFatigue(log);
  const acute = tissueLoadWindow(log, 7);
  const chronic28 = tissueLoadWindow(log, 28);

  // recovery suppression is systemic — same penalty across tissues (0..18)
  const recoveryPenalty = bio ? Math.max(0, -biometricAdjustment(bio)) * 1.2 : 0;

  const tissues: TissueRisk[] = ALL_MUSCLES.map((tissue) => {
    const acuteLoad = acute[tissue];
    const chronicWeekly = chronic28[tissue] / 4; // weekly average
    const enoughHistory = chronicWeekly > 0;
    const acwr = enoughHistory ? acuteLoad / chronicWeekly : 1;

    const drivers: RiskDriver[] = [];

    const spike = ramp(acwr, 1.3, 2.2) * 55;
    if (spike > 1)
      drivers.push({ kind: "spike", label: `Workload spike (ACWR ${acwr.toFixed(2)})`, contribution: Math.round(spike), acwr });

    const tissueFatigue = fatigue.muscles[tissue];
    const absolute = (tissueFatigue / 100) * 28;
    if (absolute > 1)
      drivers.push({ kind: "load", label: `High tissue load (${tissueFatigue}/100)`, contribution: Math.round(absolute) });

    const detrain = enoughHistory ? ramp(0.8 - acwr, 0, 0.6) * 18 : 0;
    if (detrain > 1)
      drivers.push({ kind: "detrain", label: `Return-from-low (ACWR ${acwr.toFixed(2)})`, contribution: Math.round(detrain), acwr });

    if (recoveryPenalty > 1)
      drivers.push({ kind: "recovery", label: "Suppressed recovery (HRV/sleep)", contribution: Math.round(recoveryPenalty) });

    const risk = Math.max(
      0,
      Math.min(100, Math.round(spike + absolute + detrain + recoveryPenalty)),
    );

    drivers.sort((a, b) => b.contribution - a.contribution);
    return { tissue, risk, prob: calibrateRisk(risk, coeffs), band: band(risk), acwr, drivers, enoughHistory };
  }).sort((a, b) => b.risk - a.risk);

  const overall = tissues.length ? Math.max(...tissues.map((t) => t.risk)) : 0;
  return {
    overall,
    prob: calibrateRisk(overall, coeffs),
    band: band(overall),
    modelVersion: RISK_MODEL_VERSION,
    tissues,
    flagged: tissues.filter((t) => t.risk >= 50),
  };
}
