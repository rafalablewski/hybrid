import type { LoggedSession } from "./session";
import { e1rm, setsForVolume } from "./session";
import { movementFor } from "./movements";
import { isRunMove } from "./running";
import { developmentFraction, type Sex } from "../benchmarks";
import type { Experience } from "../onboarding";
import { deviceTrueSessions } from "../device-truth";

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
 * BOTH HALVES OF A HYBRID ATHLETE. Relative strength answers the question for
 * a lifter and says nothing about a runner, so there is a second, independent
 * read: running performance, normalised to a 5 km equivalent so a 10 km and a
 * parkrun are comparable, and scored against published pace standards on the
 * same sex/age-adjusted pattern as the lifts. Whichever half is stronger sets
 * the level, for the same reason the best lift does — training age is what you
 * have built, not an average dragged down by what you neglect — and `basis`
 * always names which halves actually had data.
 *
 * WHAT IS STILL MISSING, AND NAMED RATHER THAN GUESSED. The endurance read is
 * RUNNING only. Cycling and rowing pace depend on gearing, terrain, drag factor
 * and draft; the same watts produce wildly different splits, and a threshold
 * table over raw km/h would be a fiction. A cyclist with no runs and no lifts
 * still gets `basis: "none"` and falls back to what they told us, which is the
 * honest answer rather than a number invented from a discipline the model
 * cannot read.
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

/* ────────────────────────────────────────────────────────────────────────────
 * THE ENDURANCE HALF.
 *
 * Pace at which a MALE athlete of peak training age enters each level over
 * 5 km, in seconds per kilometre. Published road-running standards territory,
 * treated as a documented prior exactly like the lifts:
 *
 *   novice        6:00/km   → 30:00
 *   intermediate  5:00/km   → 25:00
 *   advanced      4:10/km   → 20:50
 *   elite         3:20/km   → 16:40
 * ──────────────────────────────────────────────────────────────────────────── */
export const ENDURANCE_STANDARD_KM = 5;
/** Entry pace (sec/km) for novice / intermediate / advanced / elite. */
export const ENDURANCE_PACE: [number, number, number, number] = [360, 300, 250, 200];

/** Female thresholds are this much SLOWER — the pace equivalent of the strength
 *  table's sex factor, and the same order of magnitude as every published
 *  standards table's male/female gap over 5 km. */
export const ENDURANCE_SEX_FACTOR = 1.11;

/**
 * Riegel's endurance exponent. Any run is normalised to a 5 km-equivalent time
 * with T₅ = T × (5/D)^1.06, so a 10 km at 4:30/km and a 5 km at 4:20/km are
 * scored as the performances they actually are rather than by raw pace. Well
 * established, and the reason a marathoner is not read as a slow 5 km runner.
 */
export const RIEGEL_EXPONENT = 1.06;

/** Runs shorter than this aren't aerobic tests; longer than this the model is
 *  extrapolating past what Riegel is good for. */
export const ENDURANCE_MIN_KM = 3;
export const ENDURANCE_MAX_KM = 45;

/** A run's 5 km-equivalent time in seconds, or null when the effort can't be
 *  read as an aerobic test. */
export function fiveKmEquivalentSec(distanceKm: number, minutes: number): number | null {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(minutes)) return null;
  if (distanceKm < ENDURANCE_MIN_KM || distanceKm > ENDURANCE_MAX_KM || minutes <= 0) return null;
  const sec = minutes * 60;
  return Math.round(sec * Math.pow(ENDURANCE_STANDARD_KM / distanceKm, RIEGEL_EXPONENT));
}

function endurancePaceThresholds(sex: Sex, ageYears: number | null): number[] {
  const sexF = sex === "F" ? ENDURANCE_SEX_FACTOR : 1;
  // Mirror of the strength side: a less-developed athlete meets an easier bar,
  // which for a pace means a SLOWER threshold, so the factor divides.
  const devF = ageYears == null ? 1 : developmentFraction(ageYears);
  return ENDURANCE_PACE.map((p) => (p * sexF) / devF);
}

const levelFromPace = (secPerKm: number, thresholds: number[]): FitnessLevel => {
  // Faster (lower) is better, so the comparisons run the other way.
  if (secPerKm <= thresholds[3]!) return "elite";
  if (secPerKm <= thresholds[2]!) return "advanced";
  if (secPerKm <= thresholds[1]!) return "intermediate";
  if (secPerKm <= thresholds[0]!) return "novice";
  return "untrained";
};

/** One result's contribution to the estimate. */
export interface LevelEvidence {
  /** Which half of the athlete this came from. */
  kind: "strength" | "endurance";
  /** Display name — the lift, or the run's distance ("10.0 km"). */
  lift: string;
  /** STRENGTH ONLY: best e1RM seen in the window, kg. */
  e1rm?: number;
  /** STRENGTH: e1RM ÷ body mass. ENDURANCE: 5 km-equivalent pace, sec/km. */
  ratio: number;
  /** ENDURANCE ONLY: the 5 km-equivalent time, seconds. */
  equivSec?: number;
  level: FitnessLevel;
  /**
   * The tier this result reached, as the entry value in the SAME unit the
   * result is displayed in — kg of e1RM for a lift, sec/km for a run. Null for
   * an untrained runner, whose tier has no floor (there is no slowest pace).
   *
   * Carried on the evidence rather than recomputed by callers because the
   * thresholds are shifted by sex and the age-development curve: a screen that
   * re-derived them would need the athlete's age and sex again and would drift
   * the moment either changed.
   */
  tierFrom: number | null;
  /** Entry value for the NEXT tier, same unit. Null at elite — nothing above. */
  tierTo: number | null;
  /** 0…1 — how far through the current tier this result sits. */
  progress: number;
  /** ISO date of the session it came from. */
  at: string;
}

/**
 * Where a result sits between the tier it reached and the one above it.
 *
 * `thresholds` are the four entry values in display units, ordered novice →
 * elite. Pace runs the other way (lower is better), which is the only thing
 * `higherIsBetter` changes.
 */
function tierSpan(
  value: number,
  thresholds: number[],
  level: FitnessLevel,
  higherIsBetter: boolean,
): { tierFrom: number | null; tierTo: number | null; progress: number } {
  const i = FITNESS_LEVELS.indexOf(level);
  // Untrained has a floor of zero for a lift (you can always lift nothing) and
  // none at all for a pace, since there is no slowest run.
  const tierFrom = i === 0 ? (higherIsBetter ? 0 : null) : (thresholds[i - 1] ?? null);
  const tierTo = i >= thresholds.length ? null : (thresholds[i] ?? null);
  if (tierTo == null) return { tierFrom, tierTo, progress: 1 };
  if (tierFrom == null) return { tierFrom, tierTo, progress: 0 };
  const span = higherIsBetter ? tierTo - tierFrom : tierFrom - tierTo;
  const done = higherIsBetter ? value - tierFrom : tierFrom - value;
  return { tierFrom, tierTo, progress: span <= 0 ? 0 : Math.min(1, Math.max(0, done / span)) };
}

export interface FitnessLevelEstimate {
  /**
   * The HEADLINE level — the best result across both halves. Read it for a
   * badge, a card or any other display of "what level is this athlete".
   *
   * DO NOT read it to prescribe anything: it is `"untrained"` when `basis` is
   * `"none"`, so a surface that renders it without checking `basis` will tell a
   * cyclist with a full training history that they are untrained. Use
   * `displayLevel()`, which returns `null` instead of a libel.
   */
  level: FitnessLevel;
  /**
   * The headline level as a training-age tier.
   *
   * NOT what the lifting volume model should consume — see `strengthLevel` and
   * `resolveExperience`. An elite runner's headline is `advanced`, and their
   * MEV/MRV is not.
   */
  experience: Experience;
  /**
   * The best level the BENCHMARK LIFTS support, or null when the window holds
   * no benchmark lift (or no body mass to divide by).
   *
   * This is the read the lifting volume model wants: MEV/MRV are landmarks for
   * lifting, so the training age behind them has to come from lifting. A 2:57
   * /km half marathon says nothing about how many sets of squats an athlete can
   * recover from.
   */
  strengthLevel: FitnessLevel | null;
  /** The level the best qualifying RUN supports, or null when there was none. */
  enduranceLevel: FitnessLevel | null;
  /** 0…1 — how much the log actually supports this. */
  confidence: number;
  /** The results behind it, strongest first. */
  evidence: LevelEvidence[];
  /** What the estimate could actually see — named, not implied. */
  basis: "strength" | "endurance" | "both" | "none";
}

/**
 * The headline level, or `null` when the log could not measure one.
 *
 * Every display surface should read THIS rather than `estimate.level`: the raw
 * field carries `"untrained"` in the no-data case, which is indistinguishable
 * from a measured untrained athlete and is wrong about everyone who trains a
 * discipline the estimate cannot read (see the header — cycling and rowing).
 */
export const displayLevel = (e: FitnessLevelEstimate | null | undefined): FitnessLevel | null =>
  e && e.basis !== "none" ? e.level : null;

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
  const none: FitnessLevelEstimate = {
    level: "untrained", experience: "beginner",
    strengthLevel: null, enduranceLevel: null,
    confidence: 0, evidence: [], basis: "none",
  };

  const now = opts.now ?? Date.now();
  const since = now - (opts.days ?? 180) * DAY;
  const sex: Sex = opts.sex ?? "M";
  const age = opts.ageYears ?? null;
  // Relative strength needs a body mass; running does not. A runner who never
  // told us their weight still gets a level.
  const haveBw = !!bw && Number.isFinite(bw) && bw > 0;

  // Best e1RM per standard lift, resolved through the movement catalog so a
  // library or alias name ("Barbell Back Squat") still counts.
  const best = new Map<string, { e1rm: number; at: string }>();
  const byKey = new Map(STRENGTH_STANDARDS.map((s) => [s.key, s]));
  // The single best 5 km-equivalent run in the window.
  let bestRun: { equivSec: number; km: number; at: string } | null = null;

  // A 5 km-equivalent is only as good as the distance and time behind it —
  // take the device's when it measured them (see device-truth.ts).
  for (const s of deviceTrueSessions(sessions)) {
    const t = Date.parse(s.startedAt);
    if (!Number.isFinite(t) || t < since || t > now) continue;
    for (const b of s.blocks) {
      if (b.kind === "cardio") {
        // Running only — see the header. Everything else is left unread rather
        // than scored against a table that doesn't describe it.
        if (!isRunMove(b.name) || (b.discipline && b.discipline !== "running")) continue;
        const km = b.distance ?? 0;
        const equivSec = fiveKmEquivalentSec(km, b.minutes ?? 0);
        if (equivSec != null && (!bestRun || equivSec < bestRun.equivSec)) {
          bestRun = { equivSec, km, at: s.startedAt };
        }
        continue;
      }
      if (b.kind !== "strength" || !haveBw) continue;
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

  if (best.size === 0 && !bestRun) return none;

  const evidence: LevelEvidence[] = [];
  for (const [key, { e1rm: est, at }] of best) {
    const std = byKey.get(key)!;
    const ratio = Math.round((est / bw!) * 100) / 100;
    const thresholds = thresholdsFor(std, sex, age);
    const kg = Math.round(est);
    // Tier bounds in KILOS, rounded exactly as the displayed e1RM is, so a card
    // saying "elite begins at 225 kg, 45 kg above your best" is arithmetic the
    // athlete can check rather than two independently-rounded figures that
    // happen to disagree by one.
    const span = tierSpan(kg, thresholds.map((r) => Math.round(r * bw!)), levelFromRatio(ratio, thresholds), true);
    evidence.push({ kind: "strength", lift: key, e1rm: kg, ratio, level: levelFromRatio(ratio, thresholds), ...span, at });
  }
  if (bestRun) {
    const pace = Math.round(bestRun.equivSec / ENDURANCE_STANDARD_KM);
    const paces = endurancePaceThresholds(sex, age);
    const level = levelFromPace(pace, paces);
    evidence.push({
      kind: "endurance",
      lift: `${Math.round(bestRun.km * 10) / 10} km`,
      ratio: pace,
      equivSec: bestRun.equivSec,
      level,
      ...tierSpan(pace, paces.map((p) => Math.round(p)), level, false),
      at: bestRun.at,
    });
  }

  // Strongest first. Within a level, strength sorts by ratio (higher is better)
  // and endurance by pace (LOWER is better), so the two can't be compared on
  // the raw number — they are only ever compared through their level.
  evidence.sort(
    (a, b) =>
      FITNESS_LEVELS.indexOf(b.level) - FITNESS_LEVELS.indexOf(a.level) ||
      (a.kind === b.kind ? (a.kind === "endurance" ? a.ratio - b.ratio : b.ratio - a.ratio) : a.kind === "strength" ? -1 : 1),
  );

  // The BEST result sets the level, across both halves: training age is what you
  // have built, not an average dragged down by the discipline you never train.
  const level = evidence[0]!.level;

  // Confidence rises with how many independent results back it — one is a data
  // point, three is a picture — and is capped below certainty because a ratio or
  // a pace is still a proxy for training age, not a measurement of it.
  const confidence = Math.min(0.85, 0.35 + (evidence.length - 1) * 0.18);

  const hasStrength = best.size > 0;
  // The two halves, kept SEPARATE as well as folded together. The headline is
  // the best of them, but "how strong is this athlete" and "how fast" are
  // different questions with different consumers, and collapsing them before
  // returning was what let an elite runner's pace set their squat volume.
  // `evidence` is sorted strongest-first, so the first of each kind is its best.
  const strengthLevel = evidence.find((e) => e.kind === "strength")?.level ?? null;
  const enduranceLevel = evidence.find((e) => e.kind === "endurance")?.level ?? null;
  return {
    level,
    experience: LEVEL_TO_EXPERIENCE[level],
    strengthLevel,
    enduranceLevel,
    confidence: Math.round(confidence * 100) / 100,
    evidence,
    basis: hasStrength && bestRun ? "both" : hasStrength ? "strength" : "endurance",
  };
}

/**
 * The training age the volume model should use.
 *
 * The athlete's own answer WINS — the same rule the landmark resolver follows
 * for every manual value. The estimate fills the gap when they never answered,
 * and is reported separately so the UI can show a disagreement rather than
 * silently overriding one with the other.
 *
 * IT READS THE STRENGTH HALF ONLY, and that is the whole point of the function.
 * `experience` feeds `athleteLandmarks`, which sets MEV and MRV — how many hard
 * SETS a muscle can be prescribed and recover from. An endurance read cannot
 * answer that question: a 60 kg athlete running 2:57 /km is genuinely elite and
 * still squats 1.06 × bodyweight, and the headline level used to hand the
 * volume model `advanced` on the strength of the run. That is not a cosmetic
 * mismatch — it prescribes an advanced lifter's set counts to someone who has
 * never trained the pattern.
 *
 * With no benchmark lift in the window there is NO derived training age. The
 * fallback is the athlete's own answer, and after that `unknown` — never a
 * tier invented from a discipline that cannot speak to it. Callers already
 * handle `undefined` (it is what an athlete who never answered has always
 * produced), and the landmark resolver's own default is the cautious end.
 */
export function resolveExperience(
  stated: Experience | undefined,
  estimate: FitnessLevelEstimate | null,
): { experience: Experience | undefined; source: "stated" | "estimated" | "unknown"; disagrees: boolean } {
  const derived = estimate?.strengthLevel ? LEVEL_TO_EXPERIENCE[estimate.strengthLevel] : undefined;
  if (stated) return { experience: stated, source: "stated", disagrees: !!derived && derived !== stated };
  if (derived) return { experience: derived, source: "estimated", disagrees: false };
  return { experience: undefined, source: "unknown", disagrees: false };
}

/**
 * THE REACH — what closes the gap to the next tier.
 *
 * A level already reached is a fact about the past; the part that changes what
 * an athlete does on Monday is the distance to the next one. This reads the
 * result that SET the level (the strongest evidence) and reports what its next
 * tier costs, in the unit the athlete trains in: kilos on the bar, or seconds
 * per kilometre.
 *
 * At elite there is nothing above, so `next` is null and the reach becomes the
 * MARGIN clear of the elite floor — the same shape, a different sentence.
 */
export interface LevelReach {
  /** The tier ahead, or null when the athlete is already at the top. */
  next: FitnessLevel | null;
  kind: "strength" | "endurance";
  /** The lift's name, or the run's distance label. */
  lift: string;
  /** The athlete's best: kg of e1RM, or sec/km. */
  current: number;
  /** What `next` costs, same unit. At elite, the elite floor itself. */
  target: number;
  /** Kilos to add, or seconds per km to shave. At elite, how far clear. */
  gap: number;
  /** 0…1 through the current tier — what a partial segment fills to. */
  progress: number;
}

export function nextThreshold(estimate: FitnessLevelEstimate | null | undefined): LevelReach | null {
  if (!estimate || estimate.basis === "none") return null;
  // Evidence is sorted strongest-first, so [0] is the result that set the level.
  const top = estimate.evidence[0];
  if (!top) return null;
  const current = top.kind === "strength" ? (top.e1rm ?? 0) : top.ratio;
  const target = top.tierTo ?? top.tierFrom;
  if (target == null) return null;
  const i = FITNESS_LEVELS.indexOf(top.level);
  return {
    next: top.tierTo == null ? null : (FITNESS_LEVELS[i + 1] ?? null),
    kind: top.kind,
    lift: top.lift,
    current,
    target,
    gap: Math.abs(target - current),
    progress: top.progress,
  };
}

/**
 * THE PUBLIC BADGE — the level as one word, or nothing.
 *
 * Two rules the Performance card does not have to follow, because this one is
 * seen by other people:
 *
 * 1. It is EARNED, never claimed. Only the log-derived estimate can produce it;
 *    the self-assessed onboarding answer never can. That is the whole reason it
 *    is worth showing — everyone's badge means the same thing.
 * 2. It needs a PICTURE, not a data point. One heavy single should not crown a
 *    public "Elite", so the badge waits for a second independent result. The
 *    private card is free to show a one-lift estimate with its low confidence;
 *    a follower-facing surface is not.
 *
 * The ratio never travels with it. PR loads are already public on the profile,
 * so publishing "2.20 × bodyweight" beside them would let anyone divide and
 * recover the athlete's body mass.
 */
export const BADGE_MIN_EVIDENCE = 2;

/** The accent channel a badge paints with — the palette's existing ramp. */
export type BadgeAccent = "ash" | "chalk" | "lime" | "gold";

const BADGE_ACCENT: Record<FitnessLevel, BadgeAccent> = {
  untrained: "ash",
  novice: "ash",
  intermediate: "chalk",
  advanced: "lime",
  elite: "gold",
};

export interface LevelBadge {
  level: FitnessLevel;
  /** i18n key for the word itself. */
  key: string;
  accent: BadgeAccent;
}

export function badgeFor(estimate: FitnessLevelEstimate | null | undefined): LevelBadge | null {
  const level = displayLevel(estimate);
  if (!level || !estimate || estimate.evidence.length < BADGE_MIN_EVIDENCE) return null;
  return { level, key: LEVEL_KEY[level], accent: BADGE_ACCENT[level] };
}

/** i18n key naming what the estimate could see — so the card says "from your
 *  lifts and runs" rather than implying it read everything. */
export const LEVEL_BASIS_KEY: Record<FitnessLevelEstimate["basis"], string> = {
  strength: "w.analyze.vol.levelFromLifts",
  endurance: "w.analyze.vol.levelFromRuns",
  both: "w.analyze.vol.levelFromBoth",
  none: "w.analyze.vol.levelNoData",
};

export const LEVEL_KEY: Record<FitnessLevel, string> = {
  untrained: "w.analyze.vol.levelUntrained",
  novice: "w.analyze.vol.levelNovice",
  intermediate: "w.analyze.vol.levelIntermediate",
  advanced: "w.analyze.vol.levelAdvanced",
  elite: "w.analyze.vol.levelElite",
};
