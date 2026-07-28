import type { AthleteVolumeProfile } from "./landmark-profile";

/**
 * WHAT THE MODEL STILL DOESN'T KNOW ABOUT YOU.
 *
 * The personalized landmarks are only as individual as the profile behind
 * them. With nothing supplied, `athleteLandmarks` honestly returns the
 * population table; with everything supplied it returns an estimate worth
 * training against. Between those two the athlete has no idea which they are
 * looking at, or what one more answer would buy.
 *
 * So this module names the gap. For each input it says what it is worth, what
 * it unlocks, and whether the app can already answer it from data it holds —
 * and it computes the same confidence the landmark engine does, so the prompt
 * to fill something in and the number it would move are one story.
 *
 * The point is NOT to nag. A profile that will never be filled in still
 * produces a working app; that is the whole design of the layered resolver.
 * The point is that "estimated for you" should be able to say how well.
 */

/** A field the landmark model can use. */
export type VolumeProfileFieldKey =
  | "experience"
  | "ageYears"
  | "bodyweightKg"
  | "heightCm"
  | "sleep"
  | "stress"
  | "nutrition"
  | "daysPerWeek";

export interface VolumeProfileField {
  key: VolumeProfileFieldKey;
  /** Roughly how much of the estimate rests on this one, 0…1. */
  weight: number;
  /** True when the app can fill it from data it already holds. */
  derivable: boolean;
  /** i18n key naming what answering it buys. */
  unlocksKey: string;
}

/**
 * The inputs, ordered by how much they move the numbers.
 *
 * Training age leads by a distance: it is the only input that scales the
 * STIMULUS end (how much work it takes to grow you), so it moves MEV as well
 * as MRV. Everything else only adjusts what you can absorb.
 */
export const VOLUME_PROFILE_FIELDS: VolumeProfileField[] = [
  { key: "experience", weight: 0.30, derivable: true, unlocksKey: "w.analyze.vol.unlocksExperience" },
  { key: "bodyweightKg", weight: 0.18, derivable: true, unlocksKey: "w.analyze.vol.unlocksBodyweight" },
  { key: "ageYears", weight: 0.14, derivable: false, unlocksKey: "w.analyze.vol.unlocksAge" },
  { key: "daysPerWeek", weight: 0.12, derivable: true, unlocksKey: "w.analyze.vol.unlocksDays" },
  { key: "sleep", weight: 0.10, derivable: true, unlocksKey: "w.analyze.vol.unlocksSleep" },
  { key: "nutrition", weight: 0.08, derivable: true, unlocksKey: "w.analyze.vol.unlocksNutrition" },
  // Derivable NOT because the app infers a height — it never would — but
  // because the athlete already gave it once in Profile → Body & progress, and
  // measuredProfile reads it from there rather than asking a second time.
  { key: "heightCm", weight: 0.05, derivable: true, unlocksKey: "w.analyze.vol.unlocksHeight" },
  { key: "stress", weight: 0.03, derivable: false, unlocksKey: "w.analyze.vol.unlocksStress" },
];

/** i18n key naming each field, so both clients label the meter identically
 *  instead of each carrying its own copy of the map. */
export const VOLUME_PROFILE_FIELD_KEY: Record<VolumeProfileFieldKey, string> = {
  experience: "w.analyze.vol.factorExperience",
  ageYears: "w.analyze.vol.fieldAge",
  bodyweightKg: "w.analyze.vol.fieldBodyweight",
  heightCm: "w.analyze.vol.fieldHeight",
  sleep: "w.analyze.vol.fieldSleep",
  stress: "w.analyze.vol.fieldStress",
  nutrition: "w.analyze.vol.factorNutrition",
  daysPerWeek: "w.analyze.vol.fieldDays",
};

/** The profile as the completeness check reads it — the landmark profile plus
 *  height, which the landmark model uses but does not store itself. */
export interface FullAthleteProfile extends AthleteVolumeProfile {
  heightCm?: number;
}

const has = (v: unknown): boolean =>
  v !== undefined && v !== null && v !== "" && !(typeof v === "number" && !Number.isFinite(v));

export interface VolumeProfileGap {
  field: VolumeProfileField;
  /** True when the app filled it from its own data rather than the athlete. */
  measured: boolean;
}

export interface VolumeProfileCompleteness {
  /** 0…1, weighted by how much each input actually moves the estimate. */
  score: number;
  /** Fields with no value at all, most valuable first. */
  missing: VolumeProfileGap[];
  /** Fields answered, whether typed or measured. */
  answered: VolumeProfileFieldKey[];
  /** The single most valuable thing still missing, or null when complete. */
  next: VolumeProfileField | null;
  complete: boolean;
}

/**
 * How complete the profile is, weighted by influence rather than by counting
 * boxes — missing training age matters ten times more than missing stress, and
 * a progress bar that treats them equally is lying about where the athlete's
 * effort pays off.
 *
 * `measured` marks fields the app answered for itself (see landmark-context),
 * so the UI can distinguish "you told us" from "we worked it out" without
 * calling either one missing.
 */
export function volumeProfileCompleteness(
  profile: FullAthleteProfile | null | undefined,
  measuredKeys: Iterable<string> = [],
): VolumeProfileCompleteness {
  const measured = new Set(measuredKeys);
  const answered: VolumeProfileFieldKey[] = [];
  const missing: VolumeProfileGap[] = [];
  let score = 0;
  let total = 0;

  for (const field of VOLUME_PROFILE_FIELDS) {
    total += field.weight;
    if (has(profile?.[field.key as keyof FullAthleteProfile])) {
      answered.push(field.key);
      score += field.weight;
    } else {
      missing.push({ field, measured: measured.has(field.key) });
    }
  }

  missing.sort((a, b) => b.field.weight - a.field.weight);
  return {
    score: total > 0 ? Math.round((score / total) * 100) / 100 : 0,
    missing,
    answered,
    next: missing[0]?.field ?? null,
    complete: missing.length === 0,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * BODY MASS, READ AGAINST FRAME.
 *
 * The recovery multiplier docks an athlete for mass above an 80 kg reference:
 * more mass means more absolute load moved per set and more tissue to repair.
 * As a rule of thumb that holds; as a measurement, raw kilos are crude. A 95 kg
 * athlete at 195 cm and a 95 kg athlete at 170 cm are not carrying the same
 * load, and the flat rule penalises them identically.
 *
 * With height known, mass is compared to what that height PREDICTS instead, so
 * the penalty lands on the athlete who is genuinely heavy for their frame. The
 * reference is a plain BMI-style expectation — deliberately not a body-fat
 * model, because the app cannot see composition and pretending otherwise would
 * be the same class of error as inventing a sleep score.
 *
 * Without height nothing changes: the raw-kg rule applies exactly as before.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The body mass a height predicts, at the model's reference build. */
export const REFERENCE_BMI = 24.5;

/** Body mass above which extra mass starts costing recovery, and the reference
 *  a frame-adjusted mass is expressed against. Lives here with the frame maths
 *  rather than in landmark-profile, so the two can never drift apart. */
export const BODYWEIGHT_REF_KG = 80;

export function expectedMassKg(heightCm: number): number | null {
  if (!Number.isFinite(heightCm) || heightCm < 120 || heightCm > 230) return null;
  const m = heightCm / 100;
  return Math.round(REFERENCE_BMI * m * m * 10) / 10;
}

/**
 * The mass the recovery factor should read: the athlete's mass expressed
 * against an 80 kg-equivalent frame, so a tall athlete is not docked for being
 * tall. Returns the raw mass unchanged when height is unknown.
 */
export function frameAdjustedMassKg(bodyweightKg: number, heightCm?: number | null): number {
  if (!Number.isFinite(bodyweightKg) || bodyweightKg <= 0) return bodyweightKg;
  const expected = heightCm != null ? expectedMassKg(heightCm) : null;
  if (expected == null || expected <= 0) return bodyweightKg;
  // Scale the athlete's mass-for-frame ratio onto the model's reference mass.
  return Math.round((bodyweightKg / expected) * BODYWEIGHT_REF_KG * 10) / 10;
}
