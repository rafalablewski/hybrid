/**
 * HPI — the Hybrid Performance Index.
 *
 * The single 0..100 number a coach checks first. Readiness answers "can you
 * train hard TODAY" on one blended scale; HPI reports the three pillars the
 * hybrid athlete lives on SEPARATELY, each with its own figure and a named
 * limiter — which is what makes it the coach's number rather than the
 * athlete's. (Both now count conditioning load: readiness did not until Aug
 * 2026, and that gap is documented on ENDURANCE_SLOPE in readiness.ts.)
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
import { enduranceFatigue } from "./fatigue";

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

/**
 * The band as an i18n KEY.
 *
 * `Hpi.band` is an engine identifier — "compromised" — and both clients were
 * printing it straight onto the card, uppercased by CSS. So the one word that
 * tells an athlete what their score MEANS was English on every locale, sitting
 * inside a line that was otherwise translated. A key, resolved by the clients,
 * is the same fix `ReadinessVerdict` already applies to its faces.
 *
 * The admin Engine Room deliberately keeps the raw identifier: it is an
 * operator console, and every other field on it is the engine's own vocabulary.
 */
export const HPI_BAND_KEY: Record<HpiBand, string> = {
  peak: "w.home.cockpit.band.peak",
  primed: "w.home.cockpit.band.primed",
  moderate: "w.home.cockpit.band.moderate",
  compromised: "w.home.cockpit.band.compromised",
  depleted: "w.home.cockpit.band.depleted",
};

/**
 * The band's key, tolerant of a band that arrives as a plain `string`.
 *
 * Not every caller holds the engine's own union: the coach roster reads an API
 * view type where `band` is just a string. This is the one resolver both
 * clients call, so neither has to cast — and an unrecognised band falls through
 * to its own raw value rather than resolving to nothing.
 */
export const hpiBandKey = (band: string): string => HPI_BAND_KEY[band as HpiBand] ?? band;

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
 * Energy-system saturation. It LIVES in fatigue.ts — readiness needs it too
 * now that conditioning load counts against the score, and readiness.ts cannot
 * import from here without a cycle (this module imports the wearable
 * adjustment from it). Re-exported so every existing caller keeps working.
 */
export { enduranceFatigue };

/**
 * Score → band. EXPORTED because the two pillar figures need banding by the
 * same rule as the headline: the freshness explainer colours "Strength fresh 62"
 * from `hpiRole(hpiBand(62))`, so a component and the headline above it can
 * never sit in two different colour vocabularies for the same reading.
 */
export function hpiBand(score: number): HpiBand {
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
    band: hpiBand(score),
    components: { strength, endurance, recovery },
    limiter,
    weights,
  };
}
