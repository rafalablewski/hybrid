import type { MuscleGroup } from "./types";
import type { LoggedSession } from "./session";
import { VOLUME_LANDMARKS, resolveLandmarks, type LandmarkOverrides, type VolumeLandmark } from "./landmarks";
import { personalizeLandmarks, scaleLandmarks, isEmptyVolumeProfile, type AthleteVolumeProfile, type LandmarkFactor } from "./landmark-profile";
import { adaptLandmarks, type MrvEstimate, type RecoveryReport } from "./landmark-adapt";
import { athleteClearance, type RecoveryPair } from "./recovery-pairs";
import { clearanceFactor, CLEARANCE_FAST, CLEARANCE_SLOW, type RecoveryIndex } from "../feel-timing";

/**
 * THE ONE PLACE LANDMARKS COME FROM.
 *
 * Four layers, applied in this order, each one closer to the individual than
 * the last — so both clients ask one question and can never disagree:
 *
 *   1. POPULATION — the textbook table. What everyone starts on.
 *   2. PROFILE    — scaled to the athlete's training age, mass, age and
 *                   recovery context. A prior, not a measurement.
 *   3. OBSERVED   — the ceiling corrected by what the training log actually
 *                   showed. Two independent pieces of evidence, applied in
 *                   order: how fast this athlete CLEARS a session's fatigue
 *                   (measured by asking twice about the same session — see
 *                   recovery-pairs.ts), then whether the volume they carried
 *                   was actually absorbed (landmark-adapt.ts). Clearance goes
 *                   first deliberately: it corrects the prior that the adaptive
 *                   estimator then bounds itself around.
 *   4. MANUAL     — whatever the athlete typed in. Always wins; an athlete who
 *                   knows their own numbers should never be argued with.
 *
 * The result carries its own provenance, so the UI can say which layer produced
 * the numbers rather than presenting a population average as personal truth.
 */

export type LandmarkSource = "population" | "profile" | "observed" | "manual";

export interface ResolvedLandmarks {
  landmarks: Record<MuscleGroup, VolumeLandmark>;
  /** The deepest layer that actually changed something — what to label them. */
  source: LandmarkSource;
  /** Every layer that contributed, in application order. */
  layers: LandmarkSource[];
  /** Why the profile layer moved the numbers (empty when it didn't run). */
  factors: LandmarkFactor[];
  /** 0…1 confidence in the profile prior. */
  profileConfidence: number;
  /** 0…1 confidence in the observed correction. */
  observedConfidence: number;
  /** Per-muscle ceiling estimates from the log, when the observed layer ran. */
  estimates: Partial<Record<MuscleGroup, MrvEstimate>>;
  /** Muscles whose ceiling the log moved. */
  adapted: MuscleGroup[];
  /** How fast the athlete clears a session's fatigue, measured against the
   *  population curve. Neutral (index 1, confidence 0) until two clean pairs of
   *  reads exist. */
  clearance: RecoveryIndex;
  /** The pairs behind it — what to show when the athlete asks why. */
  clearanceSamples: RecoveryPair[];
}

export interface AthleteLandmarkOptions {
  profile?: AthleteVolumeProfile;
  overrides?: LandmarkOverrides;
  /** The log, for the observed layer. Omit (or set `adaptive: false`) to skip it. */
  sessions?: LoggedSession[];
  adaptive?: boolean;
  /** Daily check-ins — soreness, sleep and energy feed the observed layer. */
  recovery?: RecoveryReport[];
  now?: number;
  weeks?: number;
  includeWarmups?: boolean;
  fractional?: boolean;
  /** Override the population base (tests, coach-authored tables). */
  base?: Record<MuscleGroup, VolumeLandmark>;
}

export function athleteLandmarks(opts: AthleteLandmarkOptions = {}): ResolvedLandmarks {
  const base = opts.base ?? VOLUME_LANDMARKS;
  const layers: LandmarkSource[] = ["population"];
  let landmarks = base;

  // 2 — the profile prior.
  const profile = opts.profile;
  const personal = isEmptyVolumeProfile(profile) ? null : personalizeLandmarks(profile, base);
  if (personal?.personalized) {
    landmarks = personal.landmarks;
    layers.push("profile");
  }

  // 3a — measured clearance. How fast THIS athlete drains a session, from the
  // pairs of reads (in the gym, then hours later) the log holds. It scales the
  // recovery end only: clearing slower than the curve means less volume is
  // recoverable, and it says nothing about how much work it takes to grow you.
  const factors: LandmarkFactor[] = [...(personal?.factors ?? [])];
  const clearance = opts.sessions?.length
    ? athleteClearance(opts.sessions, opts.recovery ?? [], { now: opts.now })
    // The same shape `recoveryIndex` returns with nothing to go on: neutral,
    // zero confidence, and the population's own corridor as the interval.
    : { index: 1, confidence: 0, pairs: 0, clearance: "onTrack" as const, lo: CLEARANCE_FAST, hi: CLEARANCE_SLOW, samples: [] };
  const clearanceMul = opts.adaptive === false ? 1 : clearanceFactor(clearance);
  if (clearanceMul !== 1) {
    landmarks = scaleLandmarks(landmarks, 1, clearanceMul);
    factors.push({
      key: "clearance",
      affects: "recovery",
      multiplier: clearanceMul,
      value: `${clearance.pairs}×`,
    });
    if (!layers.includes("observed")) layers.push("observed");
  }

  // 3b — the observed correction.
  let estimates: Partial<Record<MuscleGroup, MrvEstimate>> = {};
  let adapted: MuscleGroup[] = [];
  let observedConfidence = 0;
  if (opts.adaptive !== false && opts.sessions?.length) {
    const a = adaptLandmarks(opts.sessions, {
      landmarks,
      now: opts.now,
      weeks: opts.weeks,
      includeWarmups: opts.includeWarmups,
      fractional: opts.fractional,
      recovery: opts.recovery,
    });
    estimates = a.estimates;
    adapted = a.adapted;
    observedConfidence = a.confidence;
    if (a.adapted.length) {
      landmarks = a.landmarks;
      if (!layers.includes("observed")) layers.push("observed");
    }
  }

  // 4 — the athlete's own numbers, applied last and clamped monotonic.
  const hasOverrides = !!opts.overrides && Object.keys(opts.overrides).length > 0;
  landmarks = resolveLandmarks(opts.overrides, landmarks);
  if (hasOverrides) layers.push("manual");

  factors.sort((a, b) => Math.abs(1 - b.multiplier) - Math.abs(1 - a.multiplier));

  return {
    landmarks,
    source: layers[layers.length - 1]!,
    layers,
    factors,
    profileConfidence: personal?.confidence ?? 0,
    // The observed layer's confidence is the better of its two pieces of
    // evidence: a measured clearance rate is worth something even before any
    // week has run high enough to test a ceiling.
    observedConfidence: Math.max(observedConfidence, clearanceMul === 1 ? 0 : clearance.confidence),
    estimates,
    adapted,
    clearance,
    clearanceSamples: clearance.samples,
  };
}
