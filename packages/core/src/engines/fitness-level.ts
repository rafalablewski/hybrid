import type { LoggedSession } from "./session";
import { e1rm, setsForVolume } from "./session";
import { movementFor } from "./movements";
import { developmentFraction, type Sex } from "../benchmarks";
import type { Experience } from "../onboarding";

/**
 * WHAT LEVEL IS THIS ATHLETE, ACTUALLY.
 *
 * Training age is the single strongest input to the volume model — it is the
 * only one that moves MEV as well as MRV — and until now it came from one
 * onboarding tap. Self-assessment is famously unreliable in both directions:
 * the athlete who has trained hard for eight months calls themselves
 * intermediate, and the athlete who has been going to a gym for a decade
 * without progressing calls themselves advanced.
 *
 * The log knows better. Relative strength — what you lift against your own
 * body mass — is the cheapest honest read of training level available, it is
 * already in the data, and its standards are well established.
 *
 * THE SHAPE OF THE ESTIMATE
 *
 *   1. For each benchmark lift, take the athlete's best e1RM and divide by
 *      body mass. That ratio is the measurement.
 *   2. Compare it to the thresholds for that lift, shifted for sex and scaled
 *      by the age-development curve the talent engine already uses — a 16-year
 *      old and a 45-year old hitting the same ratio are not the same athlete.
 *   3. Take the athlete's BEST lift as the headline, because level is set by
 *      what you have built, not dragged down by the lift you neglect.
 *   4. Report it with the evidence and a confidence, and never silently
 *      overrule what the athlete said about themselves.
 *
 * WHAT THIS IS NOT. It is not a talent percentile — `benchmarks.ts` does that
 * job for the coach-facing talent report, against a sport cohort. This answers
 * a different question with a different output: which training-age tier should
 * the volume model use. The two share the development curve and nothing else.
 *
 * It is also strength-only for now, and says so in `basis`. An endurance
 * athlete's level does not show up in a squat ratio, and inventing a number
 * for them from a lift they never do would be worse than declining to guess.
 */

export type FitnessLevel = "untrained" | "novice" | "intermediate" | "advanced" | "elite";

export const FITNESS_LEVELS: FitnessLevel[] = ["untrained", "novice", "intermediate", "advanced", "elite"];

/** The training-age tier the volume model speaks. Elite and advanced both map
 *  to `advanced`: past a point the landmark model stops distinguishing them. */
export const LEVEL_TO_EXPERIENCE: Record<FitnessLevel, Experience> = {
  untrained: "beginner",
  novice: "beginner",
  intermediate: "intermediate",
  advanced: "advanced",
  elite: "advanced",
};

/**
 * Relative-strength thresholds (e1RM ÷ body mass) at which a MALE athlete of
 * peak training age enters each level. Widely published strength-standard
 * territory rather than anything HYBRID invented; treated as a documented
 * prior, exactly like the injury-risk calibration.
 *
 * `key` matches the movement catalog's canonical name.
 */
export interface StrengthStandard {
  key: string;
  /** Entry ratio for novice / intermediate / advanced / elite. */
  ratios: [number, number, number, number];
}

export const STRENGTH_STANDARDS: StrengthStandard[] = [
  { key: "Back Squat", ratios: [0.75, 1.25, 1.75, 2.3] },
  { key: "Deadlift", ratios: [1.0, 1.5, 2.1, 2.75] },
  { key: "Bench Press", ratios: [0.5, 1.0, 1.4, 1.85] },
  { key: "Overhead Press", ratios: [0.35, 0.6, 0.85, 1.1] },
  { key: "Front Squat", ratios: [0.6, 1.0, 1.45, 1.9] },
];

/** Female thresholds sit at this fraction of the male ones for upper body and
 *  a little higher for lower body — the documented pattern in every published
 *  standards table. Applied to the ratio, not to the athlete. */
const SEX_FACTOR: Record<string, number> = {
  "Bench Press": 0.68,
  "Overhead Press": 0.68,
  "Back Squat": 0.76,
  "Front Squat": 0.76,
  Deadlift: 0.78,
};

function thresholdsFor(std: StrengthStandard, sex: Sex, ageYears: number | null): number[] {
  const sexF = sex === "F" ? (SEX_FACTOR[std.key] ?? 0.72) : 1;
  // A 16-year-old at 1.5× bodyweight has done something a 30-year-old at the
  // same ratio has not; scale the bar by expected maturity, not the lifter.
  const devF = ageYears == null ? 1 : developmentFraction(ageYears);
  return std.ratios.map((r) => r * sexF * devF);
}

/** One lift's contribution to the estimate. */
export interface LevelEvidence {
  lift: string;
  /** Best e1RM seen in the window, kg. */
  e1rm: number;
  /** e1RM ÷ body mass. */
  ratio: number;
  level: FitnessLevel;
  /** ISO date of the session it came from. */
  at: string;
}

export interface FitnessLevelEstimate {
  level: FitnessLevel;
  /** The tier the volume model consumes. */
  experience: Experience;
  /** 0…1 — how much the log actually supports this. */
  confidence: number;
  /** The lifts behind it, strongest first. */
  evidence: LevelEvidence[];
  /** What the estimate could see. Strength-only today — named, not implied. */
  basis: "strength" | "none";
}

const levelFromRatio = (ratio: number, thresholds: number[]): FitnessLevel => {
  if (ratio >= thresholds[3]!) return "elite";
  if (ratio >= thresholds[2]!) return "advanced";
  if (ratio >= thresholds[1]!) return "intermediate";
  if (ratio >= thresholds[0]!) return "novice";
  return "untrained";
};

const DAY = 86_400_000;

/**
 * Estimate training level from the log.
 *
 * Only working sets count, and only lifts in the standards table. Returns
 * `basis: "none"` with zero confidence when there is nothing to read — the
 * caller must then fall back to what the athlete said, not to a default tier.
 */
export function estimateFitnessLevel(
  sessions: LoggedSession[],
  opts: { bodyweightKg?: number | null; sex?: Sex; ageYears?: number | null; now?: number; days?: number } = {},
): FitnessLevelEstimate {
  const bw = opts.bodyweightKg;
  const none: FitnessLevelEstimate = { level: "untrained", experience: "beginner", confidence: 0, evidence: [], basis: "none" };
  if (!bw || !Number.isFinite(bw) || bw <= 0) return none;

  const now = opts.now ?? Date.now();
  const since = now - (opts.days ?? 180) * DAY;
  const sex: Sex = opts.sex ?? "M";
  const age = opts.ageYears ?? null;

  // Best e1RM per standard lift, resolved through the movement catalog so a
  // library or alias name ("Barbell Back Squat") still counts.
  const best = new Map<string, { e1rm: number; at: string }>();
  const byKey = new Map(STRENGTH_STANDARDS.map((s) => [s.key, s]));

  for (const s of sessions) {
    const t = Date.parse(s.startedAt);
    if (!Number.isFinite(t) || t < since || t > now) continue;
    for (const b of s.blocks) {
      if (b.kind !== "strength") continue;
      // Canonicalize: the athlete's name for the lift may be an alias.
      const resolved = movementFor(b.name);
      const key = STRENGTH_STANDARDS.find((std) => std.key === b.name)?.key
        ?? (resolved ? STRENGTH_STANDARDS.find((std) => movementFor(std.key) === resolved)?.key : undefined);
      if (!key || !byKey.has(key)) continue;

      for (const set of setsForVolume(b)) {
        const load = parseFloat(set.load ?? "");
        const reps = parseFloat(set.reps ?? "");
        if (!(load > 0) || !(reps > 0) || reps > 12) continue; // >12 reps is not a max test
        const est = e1rm(load, reps);
        const prev = best.get(key);
        if (!prev || est > prev.e1rm) best.set(key, { e1rm: est, at: s.startedAt });
      }
    }
  }

  if (best.size === 0) return none;

  const evidence: LevelEvidence[] = [];
  for (const [key, { e1rm: est, at }] of best) {
    const std = byKey.get(key)!;
    const ratio = Math.round((est / bw) * 100) / 100;
    evidence.push({ lift: key, e1rm: Math.round(est), ratio, level: levelFromRatio(ratio, thresholdsFor(std, sex, age)), at });
  }
  evidence.sort((a, b) => FITNESS_LEVELS.indexOf(b.level) - FITNESS_LEVELS.indexOf(a.level) || b.ratio - a.ratio);

  // The BEST lift sets the level: training age is what you have built, not an
  // average dragged down by the lift you never train.
  const level = evidence[0]!.level;

  // Confidence rises with how many standard lifts are represented — one lift is
  // a data point, three is a picture — and is capped below certainty because a
  // ratio is still a proxy for training age, not a measurement of it.
  const confidence = Math.min(0.85, 0.35 + (evidence.length - 1) * 0.18);

  return {
    level,
    experience: LEVEL_TO_EXPERIENCE[level],
    confidence: Math.round(confidence * 100) / 100,
    evidence,
    basis: "strength",
  };
}

/**
 * The training age the volume model should use.
 *
 * The athlete's own answer WINS — the same rule the landmark resolver follows
 * for every manual value. The estimate fills the gap when they never answered,
 * and is reported separately so the UI can show a disagreement rather than
 * silently overriding one with the other.
 */
export function resolveExperience(
  stated: Experience | undefined,
  estimate: FitnessLevelEstimate | null,
): { experience: Experience | undefined; source: "stated" | "estimated" | "unknown"; disagrees: boolean } {
  const derived = estimate && estimate.basis !== "none" ? estimate.experience : undefined;
  if (stated) return { experience: stated, source: "stated", disagrees: !!derived && derived !== stated };
  if (derived) return { experience: derived, source: "estimated", disagrees: false };
  return { experience: undefined, source: "unknown", disagrees: false };
}

export const LEVEL_KEY: Record<FitnessLevel, string> = {
  untrained: "w.analyze.vol.levelUntrained",
  novice: "w.analyze.vol.levelNovice",
  intermediate: "w.analyze.vol.levelIntermediate",
  advanced: "w.analyze.vol.levelAdvanced",
  elite: "w.analyze.vol.levelElite",
};
