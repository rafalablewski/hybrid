import type { Sex } from "../benchmarks";
import type { MuscleGroup } from "./types";
import type { Experience } from "../onboarding";
import { VOLUME_LANDMARKS, type VolumeLandmark } from "./landmarks";
import { ALL_MUSCLES } from "./movements";
import { frameAdjustedMassKg, BODYWEIGHT_REF_KG } from "./athlete-profile";

/**
 * PERSONALIZED VOLUME LANDMARKS.
 *
 * `VOLUME_LANDMARKS` is a POPULATION table — the same MEV/MAV/MRV for every
 * athlete. That is the honest starting point and the wrong finishing point:
 * the landmarks are individual, and the same seven numbers cannot be right for
 * an 18-year-old 40 kg novice and a 40-year-old 120 kg veteran.
 *
 * This module turns the table into an ESTIMATE for one athlete. It splits the
 * question in two, because the two ends of the band move for different reasons:
 *
 *   STIMULUS (MV, MEV) — how much work it takes to make you grow. Rises with
 *     training age: a novice grows off a fraction of what a veteran needs,
 *     because a veteran is far closer to their genetic ceiling and their tissue
 *     is already used to the work.
 *
 *   RECOVERY (MRV) — how much work you can absorb. Rises with training age
 *     (work capacity is itself trained) and falls with chronological age, body
 *     mass (more absolute load moved per set = more to repair), poor sleep,
 *     high life stress, and an energy deficit. Higher training frequency raises
 *     it, because the same weekly sets spread over more sessions are recovered
 *     from more easily.
 *
 * The MAV band is not scaled independently — it is re-derived so it keeps its
 * position BETWEEN the athlete's own MEV and MRV. That preserves each muscle's
 * shape from the population table (Back's band sits proportionally higher than
 * Triceps') while both ends move to the athlete, and it makes the monotonic
 * invariant mv ≤ mev ≤ mavLow ≤ mavHigh ≤ mrv true by construction.
 *
 * Every factor is returned alongside the numbers with a reason string, so the
 * UI can answer "why is my ceiling 16 and not 20" instead of asking the athlete
 * to trust a black box. Nothing here is a measurement — see
 * `landmark-adapt.ts` for the estimator that corrects these priors from the
 * athlete's OBSERVED response.
 */

/** What the athlete tells us (or what we can read from their logs). Every field
 *  is optional — with none of them you get the population table back. */
export interface AthleteVolumeProfile {
  /** Training age tier, from onboarding. The single strongest input. */
  experience?: Experience;
  /** Years of consistent resistance training, if known — refines `experience`. */
  trainingYears?: number;
  /** Chronological age in years. */
  ageYears?: number;
  /**
   * Biological sex, for the STANDARDS the fitness-level estimate is scored
   * against — never for the landmarks themselves.
   *
   * Every strength and endurance threshold in the app is published for a male
   * athlete at peak training age and shifted from there (relative-strength
   * factors ~0.68–0.78, pace factors 1.06–1.12). With no value the engine
   * defaults to "M", which quietly held every female athlete to the men's bar
   * and cost most of them a tier. It lives HERE, beside age and body mass,
   * because those are the estimate's other two inputs and the athlete should
   * not have to give it in three places.
   */
  sex?: Sex;
  /** Body mass in kg. */
  bodyweightKg?: number;
  /** Standing height. Not a factor of its own — it makes the BODY MASS factor
   *  fairer, by reading mass against the frame carrying it rather than as raw
   *  kilos. See engines/athlete-profile.ts. */
  heightCm?: number;
  /** Typical sleep, 1–5 (5 = consistently great). Matches the check-in scale. */
  sleep?: number;
  /** Life stress, 1–5 (5 = very stressed). Matches the check-in scale. */
  stress?: number;
  /** Energy availability — a deficit is the biggest single recovery tax. */
  nutrition?: "deficit" | "maintenance" | "surplus";
  /** Training sessions per week — frequency spreads the same weekly sets. */
  daysPerWeek?: number;
  /**
   * Sauna sittings per week, averaged over four weeks. DERIVED from the logged
   * heat signals (`heatWeeklyFrequency`), never asked — the athlete has already
   * told us by logging, and a profile question would be a worse copy of an
   * answer we hold.
   */
  heat?: number;
}

/** One multiplier and why it applies — the audit trail behind the numbers. */
export interface LandmarkFactor {
  key: "experience" | "age" | "bodyweight" | "sleep" | "stress" | "nutrition" | "frequency" | "clearance" | "heat";
  /** Which end of the band it moves. */
  affects: "stimulus" | "recovery" | "both";
  /** The multiplier applied, e.g. 0.88. */
  multiplier: number;
  /** The athlete-facing value that produced it, e.g. "120 kg" or "advanced". */
  value: string;
}

export interface PersonalizedLandmarks {
  landmarks: Record<MuscleGroup, VolumeLandmark>;
  /** Multiplier applied to MV/MEV — how much work it takes to grow. */
  stimulus: number;
  /** Multiplier applied to MRV — how much work can be absorbed. */
  recovery: number;
  /** The factors that produced those two multipliers, biggest effect first. */
  factors: LandmarkFactor[];
  /** 0…1 — how much of the profile was supplied. Low confidence means these are
   *  barely more than the population table and should be presented as such. */
  confidence: number;
  /** True when at least one field was supplied (i.e. these differ from default). */
  personalized: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Training-age multipliers. Beginners need LESS work to grow and tolerate LESS
 *  of it; advanced lifters need more and tolerate more. Exported so the admin
 *  Engine Room renders the LIVE numbers rather than a hand-copied duplicate. */
export const EXPERIENCE_STIMULUS: Record<Experience, number> = { beginner: 0.7, intermediate: 1, advanced: 1.15 };
export const EXPERIENCE_RECOVERY: Record<Experience, number> = { beginner: 0.75, intermediate: 1, advanced: 1.15 };

/** Sleep 1–5 → recovery multiplier (index 0 unused). */
export const SLEEP_RECOVERY = [1, 0.78, 0.86, 0.94, 1, 1.05];
/** Stress 1–5 (5 = worst) → recovery multiplier (index 0 unused). */
export const STRESS_RECOVERY = [1, 1.04, 1, 0.95, 0.88, 0.8];
export const NUTRITION_RECOVERY = { deficit: 0.85, maintenance: 1, surplus: 1.05 } as const;

/**
 * Sauna sittings per week → recovery multiplier.
 *
 * The BEST-evidenced of heat's two channels, and still the most timid number in
 * this file. Repeated heat exposure drives acclimation — plasma volume
 * expansion of roughly 3–5% over 7–10 days, raised HSP70, better
 * thermoregulation — and the Finnish cohort's dose-response strengthens at four
 * or more sittings a week. What is DOCUMENTED is the adaptation; what is
 * INFERRED is its transfer to how many hard sets a week you can absorb. So the
 * ceiling is 4%, not 15%: the direction is defensible, the magnitude is a
 * prior. It compounds with sleep, stress, nutrition, age and mass, and
 * RECOVERY_BOUNDS clamps the product, so it cannot combine into anything absurd.
 *
 * Unlike the acute credit this does NOT stand down for a wearable — it operates
 * on a four-week timescale, where there is no single night for the two terms to
 * disagree about.
 */
export const HEAT_RECOVERY_TIERS: readonly { minPerWeek: number; multiplier: number }[] = [
  { minPerWeek: 4, multiplier: 1.04 },
  { minPerWeek: 2, multiplier: 1.02 },
  { minPerWeek: 0, multiplier: 1 },
];

/** The multiplier a given weekly sitting frequency earns. */
export function heatRecovery(perWeek: number): number {
  if (!Number.isFinite(perWeek) || perWeek <= 0) return 1;
  return HEAT_RECOVERY_TIERS.find((t) => perWeek >= t.minPerWeek)?.multiplier ?? 1;
}

/** Age below which there is no recovery penalty. */
export const AGE_REF_YEARS = 30;
/** Recovery lost per year past AGE_REF_YEARS, and the floor it stops at. */
export const AGE_PENALTY_PER_YEAR = 0.012;
export const AGE_FLOOR = 0.75;
/** Recovery lost per kg above / gained per kg below BODYWEIGHT_REF_KG. */
export const MASS_PENALTY_PER_KG = 0.004;
export const MASS_CREDIT_PER_KG = 0.003;
export const MASS_FLOOR = 0.85;
export const MASS_CEILING = 1.08;
/** Bounds on the COMPOUNDED multipliers — five mildly negative inputs must not
 *  multiply into a ceiling nobody could train under. */
export const STIMULUS_BOUNDS: readonly [number, number] = [0.6, 1.4];
export const RECOVERY_BOUNDS: readonly [number, number] = [0.55, 1.6];

/** Frequency → recovery multiplier: the same weekly sets are easier to absorb
 *  across five sessions than across two. */
function frequencyRecovery(days: number): number {
  if (days <= 2) return 0.85;
  if (days === 3) return 0.95;
  if (days === 4) return 1;
  if (days === 5) return 1.05;
  return 1.1;
}

/** `experience` refined by `trainingYears` when both are known — <1 year reads
 *  as beginner however the athlete self-describes, 5+ years as advanced. */
function effectiveExperience(p: AthleteVolumeProfile): Experience | undefined {
  const y = p.trainingYears;
  if (typeof y === "number" && Number.isFinite(y) && y >= 0) {
    if (y < 1) return "beginner";
    if (y >= 5) return "advanced";
    if (y >= 2) return p.experience === "advanced" ? "advanced" : "intermediate";
  }
  return p.experience;
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/**
 * Scale the population landmarks onto one athlete. Returns the numbers, the two
 * multipliers, and the factor breakdown behind them. With an empty profile this
 * is the identity: the population table, `personalized: false`.
 */
export function personalizeLandmarks(
  profile: AthleteVolumeProfile = {},
  base: Record<MuscleGroup, VolumeLandmark> = VOLUME_LANDMARKS,
): PersonalizedLandmarks {
  const factors: LandmarkFactor[] = [];
  let stimulus = 1;
  let recovery = 1;

  const exp = effectiveExperience(profile);
  if (exp) {
    stimulus *= EXPERIENCE_STIMULUS[exp];
    recovery *= EXPERIENCE_RECOVERY[exp];
    factors.push({ key: "experience", affects: "both", multiplier: EXPERIENCE_RECOVERY[exp], value: exp });
  }

  const age = num(profile.ageYears);
  if (age !== undefined && age > 0) {
    // Recovery declines gently past ~30: −1.2%/yr, floored so no age erases the
    // athlete's ceiling. Nothing below 30 gets a bonus — youth is the baseline.
    const m = age <= AGE_REF_YEARS ? 1 : clamp(1 - (age - AGE_REF_YEARS) * AGE_PENALTY_PER_YEAR, AGE_FLOOR, 1);
    recovery *= m;
    if (m !== 1) factors.push({ key: "age", affects: "recovery", multiplier: m, value: `${Math.round(age)} yr` });
  }

  const rawBw = num(profile.bodyweightKg);
  // Read mass against frame where height is known — a 95 kg athlete at 195 cm
  // is not carrying what a 95 kg athlete at 170 cm is. Without height this
  // returns the raw mass and the rule is exactly as it was.
  const bw = rawBw === undefined ? undefined : frameAdjustedMassKg(rawBw, num(profile.heightCm) ?? null);
  if (bw !== undefined && bw > 0) {
    // More body mass = more absolute load moved per set and more tissue to
    // repair, so the SET ceiling comes down even as the loads go up. A lighter
    // athlete gets a smaller credit in the other direction.
    const m = bw >= BODYWEIGHT_REF_KG
      ? clamp(1 - (bw - BODYWEIGHT_REF_KG) * MASS_PENALTY_PER_KG, MASS_FLOOR, 1)
      : clamp(1 + (BODYWEIGHT_REF_KG - bw) * MASS_CREDIT_PER_KG, 1, MASS_CEILING);
    recovery *= m;
    if (m !== 1) factors.push({ key: "bodyweight", affects: "recovery", multiplier: m, value: `${Math.round(rawBw!)} kg` });
  }

  const sleep = num(profile.sleep);
  if (sleep !== undefined && sleep >= 1 && sleep <= 5) {
    const m = SLEEP_RECOVERY[Math.round(sleep)]!;
    recovery *= m;
    if (m !== 1) factors.push({ key: "sleep", affects: "recovery", multiplier: m, value: `${Math.round(sleep)}/5` });
  }

  const stress = num(profile.stress);
  if (stress !== undefined && stress >= 1 && stress <= 5) {
    const m = STRESS_RECOVERY[Math.round(stress)]!;
    recovery *= m;
    if (m !== 1) factors.push({ key: "stress", affects: "recovery", multiplier: m, value: `${Math.round(stress)}/5` });
  }

  if (profile.nutrition) {
    const m = NUTRITION_RECOVERY[profile.nutrition];
    recovery *= m;
    if (m !== 1) factors.push({ key: "nutrition", affects: "recovery", multiplier: m, value: profile.nutrition });
  }

  const days = num(profile.daysPerWeek);
  if (days !== undefined && days > 0) {
    const m = frequencyRecovery(Math.round(days));
    recovery *= m;
    if (m !== 1) factors.push({ key: "frequency", affects: "recovery", multiplier: m, value: `${Math.round(days)}×/wk` });
  }

  const heat = num(profile.heat);
  if (heat !== undefined && heat > 0) {
    const m = heatRecovery(heat);
    recovery *= m;
    if (m !== 1) {
      const rounded = Math.round(heat * 10) / 10;
      factors.push({ key: "heat", affects: "recovery", multiplier: m, value: `${rounded}×/wk sauna` });
    }
  }

  // Bound the compounded multipliers. Five mildly negative inputs must not
  // multiply into a ceiling nobody could train under, and the estimate should
  // never wander so far from the population table that it stops being sane.
  stimulus = clamp(stimulus, STIMULUS_BOUNDS[0], STIMULUS_BOUNDS[1]);
  recovery = clamp(recovery, RECOVERY_BOUNDS[0], RECOVERY_BOUNDS[1]);

  // HEAT IS DELIBERATELY NOT IN THIS LIST. Confidence asks how much of the
  // profile we actually know, and every other field here is one EVERY athlete
  // has — a bodyweight, a sleep score, a training frequency. A sauna habit is
  // not: an athlete who has never sat in one has nothing to supply, so counting
  // it would cap them below full confidence forever for declining an optional
  // practice, and would have quietly dropped every existing athlete from 1.0 to
  // 0.9 the day this shipped. It moves the multiplier; it does not judge how
  // well we know them.
  const supplied = [exp, age, bw, sleep, stress, profile.nutrition, days].filter((v) => v !== undefined && v !== null).length;
  const personalized = supplied > 0 || heat !== undefined;
  // Experience is worth more than any other single input, so a profile with
  // only experience already clears half-confidence.
  const weight = (exp ? 3 : 0) + supplied - (exp ? 1 : 0);
  const confidence = personalized ? clamp(weight / 9, 0.15, 1) : 0;

  factors.sort((a, b) => Math.abs(1 - b.multiplier) - Math.abs(1 - a.multiplier));

  return {
    landmarks: scaleLandmarks(base, stimulus, recovery),
    stimulus,
    recovery,
    factors,
    confidence: Math.round(confidence * 100) / 100,
    personalized,
  };
}

/**
 * Apply the two multipliers to every muscle. MEV scales by `stimulus`, MRV by
 * `recovery`, MV keeps its ratio to MEV, and the MAV band is re-derived at the
 * same PROPORTIONAL position between MEV and MRV that it held in the source
 * table — so each muscle keeps its own shape and the ordering can't invert.
 */
export function scaleLandmarks(
  base: Record<MuscleGroup, VolumeLandmark>,
  stimulus: number,
  recovery: number,
): Record<MuscleGroup, VolumeLandmark> {
  const out = {} as Record<MuscleGroup, VolumeLandmark>;
  for (const m of ALL_MUSCLES) {
    const d = base[m];
    const span = d.mrv - d.mev;
    const pLow = span > 0 ? (d.mavLow - d.mev) / span : 0.33;
    const pHigh = span > 0 ? (d.mavHigh - d.mev) / span : 0.75;
    const mevRatio = d.mev > 0 ? d.mv / d.mev : 0;

    const mev = Math.max(1, Math.round(d.mev * stimulus));
    // The ceiling must stay above the floor even when a low-recovery profile
    // meets a high-stimulus one (an advanced lifter in a deep deficit).
    const mrv = Math.max(mev + 2, Math.round(d.mrv * recovery));
    const mv = Math.min(mev, Math.round(mev * mevRatio));
    const newSpan = mrv - mev;
    const mavLow = Math.max(mev, Math.round(mev + newSpan * pLow));
    const mavHigh = Math.max(mavLow, Math.min(mrv, Math.round(mev + newSpan * pHigh)));
    out[m] = { mv, mev, mavLow, mavHigh, mrv };
  }
  return out;
}

/** Validate an untrusted profile (it round-trips through client storage). */
export function sanitizeVolumeProfile(raw: unknown): AthleteVolumeProfile {
  const out: AthleteVolumeProfile = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  if (r.experience === "beginner" || r.experience === "intermediate" || r.experience === "advanced") out.experience = r.experience;
  const range = (v: unknown, lo: number, hi: number): number | undefined => {
    const n = num(v);
    return n !== undefined && n >= lo && n <= hi ? n : undefined;
  };
  const years = range(r.trainingYears, 0, 60);
  if (years !== undefined) out.trainingYears = years;
  const age = range(r.ageYears, 10, 100);
  if (age !== undefined) out.ageYears = Math.round(age);
  const bw = range(r.bodyweightKg, 25, 300);
  if (bw !== undefined) out.bodyweightKg = Math.round(bw * 10) / 10;
  const ht = range(r.heightCm, 120, 230);
  if (ht !== undefined) out.heightCm = Math.round(ht);
  const sleep = range(r.sleep, 1, 5);
  if (sleep !== undefined) out.sleep = Math.round(sleep);
  const stress = range(r.stress, 1, 5);
  if (stress !== undefined) out.stress = Math.round(stress);
  if (r.nutrition === "deficit" || r.nutrition === "maintenance" || r.nutrition === "surplus") out.nutrition = r.nutrition;
  const days = range(r.daysPerWeek, 1, 14);
  if (days !== undefined) out.daysPerWeek = Math.round(days);
  return out;
}

/** True when the profile carries nothing — the caller should show the
 *  population table as a population table, not as "yours". */
export function isEmptyVolumeProfile(p: AthleteVolumeProfile | undefined | null): boolean {
  return !p || Object.values(p).every((v) => v === undefined || v === null || v === "");
}
