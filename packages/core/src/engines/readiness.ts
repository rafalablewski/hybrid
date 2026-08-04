import type { Biometrics, Fatigue, Readiness } from "./types";
import { enduranceFatigue } from "./fatigue";

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

/** How steeply local tissue fatigue pulls readiness down. */
export const MUSCLE_SLOPE = 0.7;

/**
 * How steeply energy-system (conditioning) load pulls readiness down.
 *
 * HALF the tissue slope, and the ratio is the argument: conditioning load is
 * real but it clears faster than local tissue damage and limits the next
 * session less, so it must count without drowning out the tissue that is
 * actually sore. At the saturation ceiling it can take 35 points; one hard
 * threshold session (≈45) costs about 16.
 *
 * WHY THIS TERM EXISTS AT ALL. Readiness used to be muscle fatigue plus the
 * wearable, full stop — so an athlete could run themselves into the ground and
 * this number would not notice. Conditioning work doses `fatigue.systems`, not
 * `fatigue.muscles`, so a week of hard running left the muscle average near
 * zero and readiness near 98. HPI had always counted it (that is its endurance
 * pillar); readiness, the number that actually prescribes today's load, did
 * not. The gap surfaced while building the deficit ring, where the sum law
 * refuses to draw a cause the score does not have — the arc could not be drawn
 * because the cost was not real. This makes it real.
 */
export const ENDURANCE_SLOPE = 0.35;

/** Readiness never reads outside these bounds. */
export const READINESS_FLOOR = 35;
export const READINESS_CEILING = 98;

/**
 * Readiness = inverse of current training load — local tissue fatigue plus the
 * energy-system load conditioning leaves behind — nudged by wearable
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
  const base = 100 - avg * MUSCLE_SLOPE - enduranceFatigue(fatigue) * ENDURANCE_SLOPE;
  const bioAdj = bio ? biometricAdjustment(bio) : 0;
  return {
    score: Math.max(READINESS_FLOOR, Math.min(READINESS_CEILING, Math.round(base + bioAdj))),
    bioAdj,
  };
}
