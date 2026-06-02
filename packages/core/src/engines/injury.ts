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
import { ALL_MUSCLES, MOVEMENTS } from "./movements";
import { computeFatigue } from "./fatigue";
import { biometricAdjustment } from "./readiness";

export type RiskBand = "low" | "moderate" | "elevated" | "high";

export interface RiskDriver {
  label: string;
  /** points this factor contributed to the tissue's 0..100 risk */
  contribution: number;
}

export interface TissueRisk {
  tissue: MuscleGroup;
  /** 0..100 */
  risk: number;
  band: RiskBand;
  /** acute:chronic workload ratio (1 = balanced; >1.5 = spiking) */
  acwr: number;
  drivers: RiskDriver[];
  /** false when there isn't enough chronic history to trust the ACWR */
  enoughHistory: boolean;
}

export interface InjuryRisk {
  overall: number;
  band: RiskBand;
  /** every tissue, highest risk first */
  tissues: TissueRisk[];
  /** the subset at elevated/high risk — the coach's worklist */
  flagged: TissueRisk[];
}

/** Undecayed per-tissue load summed over sessions within the last `days`. */
function tissueLoadWindow(log: TrainingLog, days: number): Record<MuscleGroup, number> {
  const load = Object.fromEntries(ALL_MUSCLES.map((m) => [m, 0])) as Record<MuscleGroup, number>;
  for (const session of log) {
    if (session.daysAgo >= days) continue;
    for (const it of session.items) {
      const meta = MOVEMENTS[it.move];
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
export function computeInjuryRisk(log: TrainingLog, bio?: Biometrics): InjuryRisk {
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
      drivers.push({ label: `Workload spike (ACWR ${acwr.toFixed(2)})`, contribution: Math.round(spike) });

    const tissueFatigue = fatigue.muscles[tissue];
    const absolute = (tissueFatigue / 100) * 28;
    if (absolute > 1)
      drivers.push({ label: `High tissue load (${tissueFatigue}/100)`, contribution: Math.round(absolute) });

    const detrain = enoughHistory ? ramp(0.8 - acwr, 0, 0.6) * 18 : 0;
    if (detrain > 1)
      drivers.push({ label: `Return-from-low (ACWR ${acwr.toFixed(2)})`, contribution: Math.round(detrain) });

    if (recoveryPenalty > 1)
      drivers.push({ label: "Suppressed recovery (HRV/sleep)", contribution: Math.round(recoveryPenalty) });

    const risk = Math.max(
      0,
      Math.min(100, Math.round(spike + absolute + detrain + recoveryPenalty)),
    );

    drivers.sort((a, b) => b.contribution - a.contribution);
    return { tissue, risk, band: band(risk), acwr, drivers, enoughHistory };
  }).sort((a, b) => b.risk - a.risk);

  const overall = tissues.length ? Math.max(...tissues.map((t) => t.risk)) : 0;
  return {
    overall,
    band: band(overall),
    tissues,
    flagged: tissues.filter((t) => t.risk >= 50),
  };
}
