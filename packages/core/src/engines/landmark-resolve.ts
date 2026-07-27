import type { MuscleGroup } from "./types";
import type { LoggedSession } from "./session";
import { VOLUME_LANDMARKS, resolveLandmarks, type LandmarkOverrides, type VolumeLandmark } from "./landmarks";
import { personalizeLandmarks, isEmptyVolumeProfile, type AthleteVolumeProfile, type LandmarkFactor } from "./landmark-profile";
import { adaptLandmarks, type MrvEstimate, type SorenessReport } from "./landmark-adapt";

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
 *                   showed: volume carried, performance held or lost.
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
}

export interface AthleteLandmarkOptions {
  profile?: AthleteVolumeProfile;
  overrides?: LandmarkOverrides;
  /** The log, for the observed layer. Omit (or set `adaptive: false`) to skip it. */
  sessions?: LoggedSession[];
  adaptive?: boolean;
  soreness?: SorenessReport[];
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

  // 3 — the observed correction.
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
      soreness: opts.soreness,
    });
    estimates = a.estimates;
    adapted = a.adapted;
    observedConfidence = a.confidence;
    if (a.adapted.length) {
      landmarks = a.landmarks;
      layers.push("observed");
    }
  }

  // 4 — the athlete's own numbers, applied last and clamped monotonic.
  const hasOverrides = !!opts.overrides && Object.keys(opts.overrides).length > 0;
  landmarks = resolveLandmarks(opts.overrides, landmarks);
  if (hasOverrides) layers.push("manual");

  return {
    landmarks,
    source: layers[layers.length - 1]!,
    layers,
    factors: personal?.factors ?? [],
    profileConfidence: personal?.confidence ?? 0,
    observedConfidence,
    estimates,
    adapted,
  };
}
