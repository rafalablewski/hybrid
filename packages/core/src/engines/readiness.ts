import type { Biometrics, Fatigue, Readiness } from "./types";

/**
 * Returns a -15..+15 readiness adjustment from how today's wearable readings
 * deviate from the athlete's baseline. HRV & sleep up = more recovered;
 * resting HR up = less recovered.
 */
export function biometricAdjustment(bio: Biometrics): number {
  let adj = 0;
  const dev = (m: { today: number; baseline: number }) =>
    (m.today - m.baseline) / m.baseline;
  adj += dev(bio.hrv) * 40 * (bio.hrv.better === "high" ? 1 : -1);
  adj += dev(bio.restingHr) * 40 * (bio.restingHr.better === "high" ? 1 : -1);
  adj += dev(bio.sleep) * 25 * (bio.sleep.better === "high" ? 1 : -1);
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
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const base = 100 - avg * 0.7;
  const bioAdj = bio ? biometricAdjustment(bio) : 0;
  return {
    score: Math.max(35, Math.min(98, Math.round(base + bioAdj))),
    bioAdj,
  };
}
