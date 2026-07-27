import type { Biometrics, Fatigue, Readiness } from "./types";

/** One wearable metric's contribution to the readiness adjustment — exposed so
 *  the admin Engine Room can show the substituted arithmetic, not just the sum. */
export interface BiometricDeviation {
  metric: "hrv" | "restingHr" | "sleep";
  /** relative deviation from the athlete's baseline (today − baseline) / baseline */
  dev: number;
  /** sensitivity weight (40 / 40 / 25) */
  weight: number;
  /** signed contribution to the raw adjustment (direction applied) */
  contribution: number;
}

/** Per-metric deviations + contributions behind biometricAdjustment. */
export function biometricDeviations(bio: Biometrics): BiometricDeviation[] {
  // Relative deviation from baseline. Guarded against a zero / non-finite
  // baseline (e.g. a brand-new user whose first reading IS the baseline, or a
  // stray 0 value) so the adjustment can never become NaN and poison the score.
  const dev = (m: { today: number; baseline: number }) => {
    if (!Number.isFinite(m.baseline) || m.baseline === 0) return 0;
    const d = (m.today - m.baseline) / m.baseline;
    return Number.isFinite(d) ? d : 0;
  };
  const entry = (
    metric: BiometricDeviation["metric"],
    m: { today: number; baseline: number; better: "high" | "low" },
    weight: number,
  ): BiometricDeviation => {
    const d = dev(m);
    return { metric, dev: d, weight, contribution: d * weight * (m.better === "high" ? 1 : -1) };
  };
  return [entry("hrv", bio.hrv, 40), entry("restingHr", bio.restingHr, 40), entry("sleep", bio.sleep, 25)];
}

/**
 * Returns a -15..+15 readiness adjustment from how today's wearable readings
 * deviate from the athlete's baseline. HRV & sleep up = more recovered;
 * resting HR up = less recovered.
 */
export function biometricAdjustment(bio: Biometrics): number {
  const adj = biometricDeviations(bio).reduce((a, d) => a + d.contribution, 0);
  return Math.max(-15, Math.min(15, Math.round(adj)));
}

/**
 * Readiness = inverse of average current muscle fatigue, nudged by wearable
 * biometrics, clamped to 35..98.
 */
export function computeReadiness(
  fatigue: Fatigue,
  bio?: Biometrics,
): Readiness {
  const vals = Object.values(fatigue.muscles);
  // Guard the empty-muscle-set edge: an empty average is NaN, which survives
  // Math.round/min/max and poisons the score. Mirrors computeHpi's `|| 1` guard.
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const base = 100 - avg * 0.7;
  const bioAdj = bio ? biometricAdjustment(bio) : 0;
  return {
    score: Math.max(35, Math.min(98, Math.round(base + bioAdj))),
    bioAdj,
  };
}
