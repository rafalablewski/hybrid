import type { Biometrics, Fatigue, Readiness } from "./types";

/**
 * Returns a -15..+15 readiness adjustment from how today's wearable readings
 * deviate from the athlete's baseline. HRV & sleep up = more recovered;
 * resting HR up = less recovered.
 */
export function biometricAdjustment(bio: Biometrics): number {
  let adj = 0;
  // Relative deviation from baseline. Guarded against a zero / non-finite
  // baseline (e.g. a brand-new user whose first reading IS the baseline, or a
  // stray 0 value) so the adjustment can never become NaN and poison the score.
  const dev = (m: { today: number; baseline: number }) => {
    if (!Number.isFinite(m.baseline) || m.baseline === 0) return 0;
    const d = (m.today - m.baseline) / m.baseline;
    return Number.isFinite(d) ? d : 0;
  };
  adj += dev(bio.hrv) * 40 * (bio.hrv.better === "high" ? 1 : -1);
  adj += dev(bio.restingHr) * 40 * (bio.restingHr.better === "high" ? 1 : -1);
  adj += dev(bio.sleep) * 25 * (bio.sleep.better === "high" ? 1 : -1);
  // Fold in the wearable's own sleep SCORE when present — an orthogonal recovery
  // signal (sleep quality/efficiency, not just duration) that was previously
  // ignored. Lighter weight than HRV/RHR so it nudges rather than dominates.
  if (bio.sleepScore) {
    adj += dev(bio.sleepScore) * 20 * (bio.sleepScore.better === "high" ? 1 : -1);
  }
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
