/**
 * HPI — the Hybrid Performance Index.
 *
 * The single 0..100 number a coach checks first. Unlike readiness (which is
 * muscle freshness + wearable nudge), HPI fuses the three pillars the hybrid
 * athlete actually lives on:
 *
 *   • strength readiness   — inverse of muscular fatigue
 *   • endurance readiness  — inverse of energy-system (conditioning) load
 *   • recovery             — wearable signal vs. the athlete's own baseline
 *
 * Weights are configurable so the number means the right thing for the athlete:
 * a powerlifter is strength-weighted, a triathlete endurance-weighted, a hybrid
 * athlete balanced. HPI reports its components and its limiter, so the headline
 * always comes with the "why" — the terminal, not the toy.
 *
 * Pure math over the existing fatigue / readiness engines. No I/O.
 */

import type { Biometrics, Fatigue } from "./types";
import { biometricAdjustment } from "./readiness";

export interface HpiWeights {
  /** strength vs. endurance split; should sum to 1. */
  strength: number;
  endurance: number;
}

/** Balanced hybrid default. */
export const HYBRID_WEIGHTS: HpiWeights = { strength: 0.55, endurance: 0.45 };
export const STRENGTH_WEIGHTS: HpiWeights = { strength: 0.8, endurance: 0.2 };
export const ENDURANCE_WEIGHTS: HpiWeights = { strength: 0.25, endurance: 0.75 };

export type HpiBand =
  | "peak"
  | "primed"
  | "moderate"
  | "compromised"
  | "depleted";

export interface Hpi {
  /** the headline, 0..100 */
  score: number;
  band: HpiBand;
  components: {
    /** 0..100, freshness of the muscular system */
    strength: number;
    /** 0..100, freshness of the conditioning energy systems */
    endurance: number;
    /** -15..+15, wearable contribution vs. baseline */
    recovery: number;
  };
  /** which pillar is dragging the score down today — the actionable insight */
  limiter: "strength" | "endurance" | "recovery";
  weights: HpiWeights;
}

/**
 * Map raw, unbounded energy-system load to a 0..100 endurance-fatigue figure
 * with smooth saturation (a single hard session ≈ 45; a brutal week → ~85+).
 * `scale` is the load at which fatigue reaches ~63%.
 */
export function enduranceFatigue(fatigue: Fatigue, scale = 90): number {
  const total =
    fatigue.systems.anaerobic +
    fatigue.systems.threshold +
    fatigue.systems.aerobic;
  return Math.round(100 * (1 - Math.exp(-total / scale)));
}

function band(score: number): HpiBand {
  if (score >= 85) return "peak";
  if (score >= 70) return "primed";
  if (score >= 55) return "moderate";
  if (score >= 40) return "compromised";
  return "depleted";
}

/**
 * Compute HPI from the athlete's current fatigue state and optional wearable
 * biometrics. Strength and endurance freshness are blended by `weights`, then
 * the recovery signal is applied as an additive ±15 nudge — the same convention
 * the readiness engine uses — and the whole thing is clamped to 0..100.
 */
export function computeHpi(
  fatigue: Fatigue,
  bio?: Biometrics,
  weights: HpiWeights = HYBRID_WEIGHTS,
): Hpi {
  const muscleVals = Object.values(fatigue.muscles);
  const muscleAvg =
    muscleVals.reduce((a, b) => a + b, 0) / (muscleVals.length || 1);

  const strength = Math.round(100 - muscleAvg);
  const endurance = 100 - enduranceFatigue(fatigue);
  const recovery = bio ? biometricAdjustment(bio) : 0;

  const wSum = weights.strength + weights.endurance || 1;
  const base =
    (weights.strength * strength + weights.endurance * endurance) / wSum;
  const score = Math.max(0, Math.min(100, Math.round(base + recovery)));

  // limiter = whichever pillar is furthest below "fully ready" (recovery only
  // counts as a limiter when it's an actual drag).
  const gaps: Record<Hpi["limiter"], number> = {
    strength: 100 - strength,
    endurance: 100 - endurance,
    recovery: recovery < 0 ? -recovery * 2 : 0,
  };
  const limiter = (Object.keys(gaps) as Hpi["limiter"][]).reduce((a, b) =>
    gaps[b] > gaps[a] ? b : a,
  );

  return {
    score,
    band: band(score),
    components: { strength, endurance, recovery },
    limiter,
    weights,
  };
}
