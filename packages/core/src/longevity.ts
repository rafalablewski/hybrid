/**
 * Performance-medicine / longevity vertical — healthspan from the Twin.
 *
 * The same recovery signals (resting HR, HRV, VO2, sleep) that drive readiness
 * also predict healthspan. This estimates a biological age vs chronological age
 * and a healthspan score, with documented marker priors (v0) the data network
 * refits later. Pure; honest — a heuristic, not a clinical diagnostic.
 */

export interface LongevityInputs {
  age: number;
  /** resting heart rate, bpm */
  restingHr?: number;
  /** HRV (RMSSD-style), ms */
  hrv?: number;
  /** VO2 / aerobic capacity, ml/kg/min */
  vo2?: number;
  /** typical sleep, hours */
  sleepH?: number;
}

export interface MarkerContribution {
  marker: string;
  /** years added (+) or subtracted (−) from chronological age */
  deltaYears: number;
  note: string;
}

export interface LongevityReport {
  age: number;
  /** estimated biological age */
  bioAge: number;
  /** bioAge − age (negative = younger than chronological) */
  delta: number;
  /** 0..100 healthspan score (higher = better) */
  healthspanScore: number;
  contributions: MarkerContribution[];
  flags: string[];
  modelVersion: string;
}

export const LONGEVITY_MODEL_VERSION = "healthspan-prior-v0";

/** Age-expected resting HR / HRV / VO2 (documented priors). */
function expectedRestingHr(): number {
  return 60;
}
function expectedHrv(age: number): number {
  // HRV declines with age; ~65ms at 25 → ~35ms at 65
  return Math.max(25, 70 - (age - 20) * 0.75);
}
function expectedVo2(age: number): number {
  // VO2max declines ~1%/yr after ~25
  return Math.max(25, 48 - Math.max(0, age - 25) * 0.4);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function longevityReport(inp: LongevityInputs): LongevityReport {
  const contributions: MarkerContribution[] = [];
  const flags: string[] = [];

  if (inp.restingHr != null) {
    const dev = inp.restingHr - expectedRestingHr();
    const dy = clamp(dev * 0.2, -6, 8); // +0.2 yr per bpm above ~60
    contributions.push({ marker: "Resting HR", deltaYears: Math.round(dy * 10) / 10, note: `${inp.restingHr} bpm` });
    if (inp.restingHr >= 75) flags.push("elevated resting HR");
  }

  if (inp.hrv != null) {
    const dev = inp.hrv - expectedHrv(inp.age);
    const dy = clamp(-dev * 0.12, -6, 8); // higher HRV → younger
    contributions.push({ marker: "HRV", deltaYears: Math.round(dy * 10) / 10, note: `${inp.hrv} ms` });
    if (inp.hrv < expectedHrv(inp.age) * 0.7) flags.push("suppressed HRV");
  }

  if (inp.vo2 != null) {
    const dev = inp.vo2 - expectedVo2(inp.age);
    const dy = clamp(-dev * 0.35, -8, 10); // VO2 is a strong longevity predictor
    contributions.push({ marker: "VO₂", deltaYears: Math.round(dy * 10) / 10, note: `${inp.vo2} ml/kg/min` });
    if (inp.vo2 < expectedVo2(inp.age) * 0.8) flags.push("low aerobic capacity");
  }

  if (inp.sleepH != null) {
    const dy = inp.sleepH < 7 ? clamp((7 - inp.sleepH) * 0.8, 0, 4) : 0;
    if (dy > 0) {
      contributions.push({ marker: "Sleep", deltaYears: Math.round(dy * 10) / 10, note: `${inp.sleepH} h` });
      flags.push("short sleep");
    }
  }

  const totalDelta = contributions.reduce((a, c) => a + c.deltaYears, 0);
  const bioAge = Math.max(12, Math.round((inp.age + totalDelta) * 10) / 10);
  const delta = Math.round((bioAge - inp.age) * 10) / 10;
  // healthspan score: younger-than-chrono lifts it; ±10yr maps to ±40 points
  const healthspanScore = clamp(Math.round(70 - delta * 4), 1, 100);

  return {
    age: inp.age,
    bioAge,
    delta,
    healthspanScore,
    contributions,
    flags,
    modelVersion: LONGEVITY_MODEL_VERSION,
  };
}
