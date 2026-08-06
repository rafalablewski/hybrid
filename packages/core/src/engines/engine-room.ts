/**
 * Engine Room — the admin transparency layer over the intelligence stack.
 *
 * The engines themselves stay pure and scattered across their own modules
 * (fatigue / readiness / hpi / load / injury / datanet). This module gives the
 * admin console ONE tested surface over them:
 *
 *   • ENGINE_FORMULAS — every formula the stack runs, as data (expression +
 *     constants + meaning), so the console renders the real math instead of a
 *     hand-maintained doc that drifts from the code.
 *   • computeEngineTrace — one call that materializes the full computation for
 *     an athlete: Performance State (HPI/readiness/fatigue/drivers), tissue
 *     injury risk with its calibrated p(injury), and the 14-day trajectory.
 *   • logisticCurve — sample points of the score → p(injury) calibration, for
 *     plotting the live curve next to an athlete's score.
 *   • whatIfLog / whatIfBio — the what-if simulator's input transforms (scale
 *     recent training, override today's wearable readings), kept here so the
 *     simulation is unit-tested math, not ad-hoc UI state.
 *
 * Pure data + composition of the existing engines. No UI, no I/O.
 */

import type { Biometrics, BiometricMetric, TrainingLog } from "./types";
import { EFFORT_BIAS_PRIOR_WEIGHT, EFFORT_TREND_MIN_SAMPLES, EFFORT_TREND_MIN_DAYS } from "./effort";
import {
  calibrateRisk,
  computeInjuryRisk,
  PRIOR_COEFFS,
  type CalibrationCoeffs,
  type InjuryRisk,
} from "./injury";
import {
  computePerformanceState,
  performanceTrajectory,
  type PerformanceState,
  type TrajectoryPoint,
} from "./performance-state";
import { enduranceFatigue, HYBRID_WEIGHTS, type HpiWeights } from "./hpi";
import { MUSCLE_SLOPE, ENDURANCE_SLOPE, READINESS_FLOOR, READINESS_CEILING } from "./readiness";
import { readinessDeficit, type ReadinessDeficit } from "./readiness-deficit";
import { COST_OK } from "./landmark-adapt";
import {
  EXPERIENCE_STIMULUS,
  EXPERIENCE_RECOVERY,
  SLEEP_RECOVERY,
  STRESS_RECOVERY,
  NUTRITION_RECOVERY,
  AGE_REF_YEARS,
  AGE_PENALTY_PER_YEAR,
  AGE_FLOOR,
  MASS_PENALTY_PER_KG,
  MASS_FLOOR,
  RECOVERY_BOUNDS,
} from "./landmark-profile";
import { BODYWEIGHT_REF_KG, REFERENCE_BMI, VOLUME_PROFILE_FIELDS } from "./athlete-profile";
import { STRENGTH_STANDARDS, ENDURANCE_PACE, ENDURANCE_SEX_FACTOR, RIEGEL_EXPONENT, ENDURANCE_STANDARD_KM, ENDURANCE_MIN_KM } from "./fitness-level";
import {
  ENDURANCE_STANDARDS, TIER_POINTS, ELITE_SCORE, AGREEMENT_BAND, HIGH_TRANSFER,
  CONFIRMED_BASE, UNCONFIRMED_BASE, CORROBORATION_WEIGHT, CONTRADICTION_PENALTY, CONFIDENCE_CAP,
  TRIATHLON_CLASSES, TRIATHLON_TOLERANCE, transfer, standardFor,
} from "./endurance-level";
import { SETTLED_DRIFT, CONVERGING_DRIFT, SETTLE_WINDOW } from "./landmark-replay";
import {
  RESIDUAL_FLOOR,
  RESIDUAL_TAU_H,
  MAX_COST,
  COST_HIGH,
  MIN_STRAIN_FATIGUE,
  RECALL_FROM_H,
  RECALL_TAU_H,
  WEIGHT_FLOOR,
  CLEARANCE_FAST,
  CLEARANCE_SLOW,
  CLEARANCE_SLOPE,
  CLEARANCE_FACTOR_BOUNDS,
  MIN_PAIR_GAP_H,
  MIN_PAIR_FATIGUE,
  MIN_RECOVERY_PAIRS,
} from "../feel-timing";
import { IMMEDIATE_WINDOW_H, RECOVERY_DUE_H, RECOVERY_WINDOW_H } from "../feel-schedule";
import {
  MIN_RELOG_GAP_H,
  POST_SESSION_LOCK_H,
  MAX_READS_PER_DAY,
  READINESS_PAIR_WEIGHT,
} from "../readiness-reads";

export type EngineFormulaGroup =
  | "fatigue"
  | "endurance"
  | "readiness"
  | "hpi"
  | "load"
  | "injury"
  | "calibration"
  | "effort"
  | "landmarks"
  | "volumeBlock"
  | "feelTiming"
  | "fitnessLevel";

/** One live formula, as data — the console's formula sheet renders these. */
export interface EngineFormula {
  id: string;
  engine: EngineFormulaGroup;
  name: string;
  /** the math as it runs, human-readable (× for multiply, σ for logistic) */
  expression: string;
  constants: { symbol: string; value: string; meaning: string }[];
  note: string;
}

/** group → label + the source module that owns the math. */
export const ENGINE_FORMULA_GROUPS: { id: EngineFormulaGroup; label: string; source: string }[] = [
  { id: "fatigue", label: "Tissue fatigue", source: "engines/fatigue.ts" },
  { id: "endurance", label: "Endurance load", source: "engines/hpi.ts" },
  { id: "readiness", label: "Readiness", source: "engines/readiness.ts + engines/readiness-deficit.ts" },
  { id: "hpi", label: "HPI", source: "engines/hpi.ts" },
  { id: "load", label: "Session load & ACWR", source: "engines/load.ts + injury.ts" },
  { id: "injury", label: "Injury risk", source: "engines/injury.ts" },
  { id: "calibration", label: "p(injury) calibration", source: "engines/injury.ts + datanet.ts" },
  { id: "effort", label: "Reported effort model", source: "engines/effort.ts" },
  { id: "landmarks", label: "Volume landmarks (MEV/MAV/MRV)", source: "engines/landmark-profile.ts + landmark-adapt.ts + landmark-resolve.ts" },
  { id: "volumeBlock", label: "Block volume ramp", source: "engines/volume-block.ts" },
  { id: "feelTiming", label: "Feel timing", source: "feel-timing.ts + readiness-reads.ts + checkin-scales.ts" },
  { id: "fitnessLevel", label: "Training level & profile", source: "engines/fitness-level.ts + endurance-level.ts + athlete-profile.ts" },
];

export const ENGINE_FORMULAS: EngineFormula[] = [
  {
    id: "fatigue-decay",
    engine: "fatigue",
    name: "Load decay",
    expression: "decay = 0.5 ^ (daysAgo / 2)",
    constants: [{ symbol: "2", value: "2 days", meaning: "fatigue half-life" }],
    note: "Every session's contribution halves every 2 days, so recent work dominates the fatigue read.",
  },
  {
    id: "fatigue-dose",
    engine: "fatigue",
    name: "Session dose",
    expression: "dose = (hardSets × 4  or  minutes × 0.9) × (RPE / 10) × decay",
    constants: [
      { symbol: "4", value: "4 au/set", meaning: "load units per hard set" },
      { symbol: "0.9", value: "0.9 au/min", meaning: "load units per conditioning minute" },
    ],
    note: "Each logged movement doses every muscle it touches (via the movement catalog), scaled by intensity.",
  },
  {
    id: "fatigue-normalize",
    engine: "fatigue",
    name: "Normalization",
    expression: "muscle = 100 × load / max(40, maxLoad)",
    constants: [{ symbol: "40", value: "40 au", meaning: "normalization floor" }],
    note: "Per-muscle fatigue is 0..100 relative to the most-loaded tissue; the floor keeps a light week from reading fully fatigued.",
  },
  {
    id: "endurance-fatigue",
    engine: "endurance",
    name: "Energy-system saturation",
    expression: "enduranceFatigue = 100 × (1 − e^(−(anaerobic + threshold + aerobic) / 90))",
    constants: [{ symbol: "90", value: "90 au", meaning: "load at which fatigue reaches ~63%" }],
    note: "Smooth saturation: one hard session ≈ 45, a brutal week → 85+. Never quite reaches 100.",
  },
  {
    id: "bio-adjust",
    engine: "readiness",
    name: "Wearable adjustment",
    expression: "bioAdj = clamp(40 × ΔHRV − 40 × ΔrestingHR + 25 × Δsleep, −15, +15)",
    constants: [
      { symbol: "40 / 40 / 25", value: "weights", meaning: "HRV, resting HR, sleep sensitivity" },
      { symbol: "±15", value: "clamp", meaning: "max wearable influence" },
    ],
    note: "Δ = relative deviation from the athlete's own rolling baseline, not a population norm. Resting HR is sign-flipped (up = worse).",
  },
  {
    id: "readiness",
    engine: "readiness",
    name: "Readiness score",
    expression: `readiness = clamp(100 − ${MUSCLE_SLOPE} × avgMuscleFatigue − ${ENDURANCE_SLOPE} × enduranceFatigue + bioAdj, ${READINESS_FLOOR}, ${READINESS_CEILING})`,
    constants: [
      { symbol: String(MUSCLE_SLOPE), value: String(MUSCLE_SLOPE), meaning: "tissue fatigue → readiness slope" },
      { symbol: String(ENDURANCE_SLOPE), value: String(ENDURANCE_SLOPE), meaning: "conditioning load → readiness slope (half the tissue slope)" },
      { symbol: `${READINESS_FLOOR}..${READINESS_CEILING}`, value: "clamp", meaning: "score bounds" },
    ],
    note: "Inverse of current training load — local tissue fatigue PLUS the energy-system load conditioning leaves behind — nudged by the wearable signal. The conditioning term was added in Aug 2026: readiness had been muscle fatigue plus the wearable alone, so an athlete could run themselves into the ground and this number would not notice (a run doses fatigue.systems, not fatigue.muscles, so a hard endurance week left the muscle average near zero and readiness near the ceiling). HPI had always counted it; readiness, the number that actually prescribes today's load, did not. Half the tissue slope because conditioning load clears faster and limits the next session less — at saturation it can take 35 points, one hard threshold session about 16.",
  },
  {
    id: "readiness-deficit",
    engine: "readiness",
    name: "Deficit attribution (the ring)",
    expression: "kept = readiness   •   costᵢ = deficit × weightᵢ / Σweight   •   kept + Σcost ≡ 100",
    constants: [
      { symbol: "tissue", value: `${MUSCLE_SLOPE} × avgMuscleFatigue`, meaning: "named by whichever tissue carries most of it" },
      { symbol: "conditioning", value: `${ENDURANCE_SLOPE} × enduranceFatigue`, meaning: "energy-system load" },
      { symbol: "wearable", value: "−bioAdj when negative", meaning: "a positive nudge is not a cost; it shrinks the whole deficit" },
      { symbol: "ceiling", value: `100 − ${READINESS_CEILING}`, meaning: "the scale's own top, when nothing measurable explains the gap" },
    ],
    note: "What the readiness ring draws: one arc per cause, sized by what that cause actually took. Points are apportioned by largest remainder so whole numbers cannot miss their own total, and the sum is a LAW the unit tests gate on — kept plus every cost equals exactly 100, with anything unattributable landing in a named cost rather than falling off the edge. The drawing order is fixed (kept → tissue → conditioning → wearable → ceiling) and never re-sorted by value, because a card whose parts move with the numbers cannot be learned.",
  },
  {
    id: "hpi",
    engine: "hpi",
    name: "Hybrid Performance Index",
    expression: "HPI = clamp((wₛ × S + wₑ × E) / (wₛ + wₑ) + R, 0, 100)",
    constants: [
      { symbol: "S", value: "100 − avgMuscleFatigue", meaning: "strength freshness" },
      { symbol: "E", value: "100 − enduranceFatigue", meaning: "endurance freshness" },
      { symbol: "R", value: "bioAdj (±15)", meaning: "recovery nudge" },
      { symbol: "wₛ/wₑ", value: "0.55/0.45 hybrid", meaning: "profile weights (0.8/0.2 strength, 0.25/0.75 endurance)" },
    ],
    note: "The limiter is whichever pillar has the largest gap to fully-ready; a recovery drag counts double.",
  },
  {
    id: "effort-objective",
    engine: "effort",
    name: "Objective session effort",
    expression: "objectiveRpe = sessionLoad ÷ sessionMinutes",
    constants: [{ symbol: "1..10", value: "clamped", meaning: "session RPE scale" }],
    note: "The minutes-weighted mean RPE the LOG implies — what the engine would assume if it never asked the athlete.",
  },
  {
    id: "effort-residual",
    engine: "effort",
    name: "Effort residual",
    expression: "residual = reportedRpe − objectiveRpe",
    constants: [],
    note: "The gap between what the log implies and what the athlete says it cost them. Positive = this athlete pays more for the same work.",
  },
  {
    id: "effort-bias",
    engine: "effort",
    name: "Personal effort bias (shrunk)",
    expression: "bias = clamp( (n × mean(residual) + w × 0) ÷ (n + w) , −2.5, +2.5 )",
    constants: [
      { symbol: "w", value: String(EFFORT_BIAS_PRIOR_WEIGHT), meaning: "pseudo-observations the prior is worth" },
      { symbol: "0", value: "0 RPE", meaning: "population prior — an athlete reports what the log implies" },
      { symbol: "±2.5", value: "±2.5 RPE", meaning: "hard bounds on personalization" },
    ],
    note: "Same shrinkage idiom as the personal ACWR onset: one rated session barely moves it, twenty move it a long way, and no history can push it somewhere absurd.",
  },
  {
    id: "effort-trend",
    engine: "effort",
    name: "Is the same work getting easier",
    expression: "trend = 30 × slope( residual vs days )",
    constants: [
      { symbol: "n", value: String(EFFORT_TREND_MIN_SAMPLES), meaning: "rated sessions required" },
      { symbol: "d", value: `${EFFORT_TREND_MIN_DAYS} days`, meaning: "window the samples must span" },
    ],
    note: "Holds the objective work fixed and watches only what the athlete says it cost. A falling residual is the one honest fitness read a self-report can give.",
  },
  {
    id: "srpe-load",
    engine: "load",
    name: "Session load (sRPE)",
    expression: "sessionLoad = Σ blockMinutes × RPE   (strength ≈ sets × 3.5 min)",
    constants: [{ symbol: "3.5", value: "3.5 min/set", meaning: "strength time incl. rest" }],
    note: "Duration × session RPE, the classic coach's load unit. Feeds monotony and strain.",
  },
  {
    id: "acwr",
    engine: "load",
    name: "Acute:chronic workload ratio",
    expression: "ACWR = acute₇ / (chronic₂₈ / 4)",
    constants: [
      { symbol: "7", value: "7 days", meaning: "acute window" },
      { symbol: "28", value: "28 days", meaning: "chronic window (÷4 → weekly average)" },
    ],
    note: "Computed PER TISSUE from undecayed dose, so a squat spike shows on quads, not on a whole-body blur. 1 = balanced; >1.5 = spiking. A contested metric — read with monotony and absolute load, never alone.",
  },
  {
    id: "injury-spike",
    engine: "injury",
    name: "Workload-spike component",
    expression: "spike = ramp(ACWR, onset, onset + 0.9) × 55",
    constants: [
      { symbol: "onset", value: "1.3 default", meaning: "population prior; personalized 1.1..1.6 from the athlete's outcome history" },
      { symbol: "0.9", value: "ramp width", meaning: "risk saturates 0.9 above the onset (default → 2.2)" },
      { symbol: "55", value: "55 pts", meaning: "max contribution" },
    ],
    note: "The classic ACWR danger zone, per tissue. ramp() is a linear 0..1 ramp between the bounds. The onset shrinks toward what THIS athlete has demonstrated: tolerated spikes raise it, injuries lower it (personal.ts).",
  },
  {
    id: "injury-load",
    engine: "injury",
    name: "Absolute-load component",
    expression: "load = (tissueFatigue / 100) × 28",
    constants: [{ symbol: "28", value: "28 pts", meaning: "max contribution" }],
    note: "A hammered tissue carries baseline risk even when acute and chronic load are balanced.",
  },
  {
    id: "injury-detrain",
    engine: "injury",
    name: "Detraining component",
    expression: "detrain = ramp(0.8 − ACWR, 0, 0.6) × 18",
    constants: [
      { symbol: "0.8", value: "onset", meaning: "ACWR below which detraining registers" },
      { symbol: "18", value: "18 pts", meaning: "max contribution" },
    ],
    note: "Very low acute load carries a small spike-on-return risk — counted only once training resumes (acute load > 0). A collapsed ratio during the layoff itself is rest, not risk.",
  },
  {
    id: "injury-recovery",
    engine: "injury",
    name: "Recovery-suppression component",
    expression: "recovery = max(0, −bioAdj) × 1.2",
    constants: [{ symbol: "1.2", value: "1.2×", meaning: "suppression multiplier (max ~18 pts)" }],
    note: "Suppressed HRV/sleep or elevated resting HR raises risk across ALL tissues (systemic).",
  },
  {
    id: "injury-band",
    engine: "injury",
    name: "Risk score & bands",
    expression: "risk = clamp(spike + load + detrain + recovery, 0, 100)",
    constants: [
      { symbol: "30 / 50 / 70", value: "gates", meaning: "moderate / elevated / high" },
    ],
    note: "The athlete's overall risk is the highest tissue; tissues at ≥50 form the coach's flagged worklist.",
  },
  {
    id: "calibration",
    engine: "calibration",
    name: "Score → probability",
    expression: "p(injury) = σ(a + b × score / 100)",
    constants: [
      { symbol: "a", value: String(PRIOR_COEFFS.intercept), meaning: "intercept (prior)" },
      { symbol: "b", value: String(PRIOR_COEFFS.slope), meaning: "slope (prior)" },
    ],
    note: "The prior is expert-elicited and documented, not fitted: score 50 → ~10%, score 80 → ~35%, versioned (RISK_MODEL_VERSION) so a fitted model is always distinguishable from the prior it replaced. Once ≥30 labeled outcomes exist, refitCalibration re-fits (a, b) by gradient descent and a new ModelFit version goes live everywhere risk is read — and the fit is graded, not just trusted: brierScore and reliabilityBuckets (datanet.ts) score any coefficients against the outcomes they claim to predict.",
  },

  // ---- Volume landmarks: the four layers that turn a textbook table into
  //      one athlete's MEV/MAV/MRV. See engines/landmark-resolve.ts. ----
  {
    id: "landmark-layers",
    engine: "landmarks",
    name: "Resolution order",
    expression: "landmarks = manual( observed( profile( population ) ) )",
    constants: [
      { symbol: "population", value: "VOLUME_LANDMARKS", meaning: "the Renaissance-Periodization volume-landmark table everyone starts on" },
      { symbol: "profile", value: "stimulus / recovery", meaning: "scaled to who the athlete is" },
      { symbol: "observed", value: "MRV estimate", meaning: "corrected by what the log showed" },
      { symbol: "manual", value: "athlete override", meaning: "always wins" },
    ],
    note: "Each layer is closer to the individual than the last, and the result carries which layer produced it — so no screen can present a population average as a personal measurement. The base table is the RP volume-landmark model mapped onto HYBRID's seven muscle groups (landmarks.ts) — a deliberate starting point, not a hidden dependency: the observed layer exists precisely to correct it against this athlete's own log, bounded ±35% per window so a poor prior can't be amplified without evidence.",
  },
  {
    id: "landmark-stimulus",
    engine: "landmarks",
    name: "Stimulus multiplier (MV, MEV)",
    expression: "mev' = round(mev × stimulus),  stimulus = clamp(experienceStimulus, 0.6, 1.4)",
    constants: [
      { symbol: "beginner", value: String(EXPERIENCE_STIMULUS.beginner), meaning: "a novice grows off ~70% of the table" },
      { symbol: "intermediate", value: String(EXPERIENCE_STIMULUS.intermediate), meaning: "the table as written" },
      { symbol: "advanced", value: String(EXPERIENCE_STIMULUS.advanced), meaning: "closer to the genetic ceiling, needs more" },
    ],
    note: "How much work it takes to GROW. Training age is the only input — sleep and stress do not change the dose required, only what you can absorb.",
  },
  {
    id: "landmark-recovery",
    engine: "landmarks",
    name: "Recovery multiplier (MRV)",
    expression: "mrv' = round(mrv × recovery),  recovery = clamp(∏ factors, " + String(RECOVERY_BOUNDS[0]) + ", " + String(RECOVERY_BOUNDS[1]) + ")",
    constants: [
      { symbol: "training age", value: `${EXPERIENCE_RECOVERY.beginner} / ${EXPERIENCE_RECOVERY.intermediate} / ${EXPERIENCE_RECOVERY.advanced}`, meaning: "work capacity is itself trained" },
      { symbol: "age", value: `−${AGE_PENALTY_PER_YEAR * 100}%/yr past ${AGE_REF_YEARS}, floor ${AGE_FLOOR}`, meaning: "recovery declines with age" },
      { symbol: "body mass", value: `−${MASS_PENALTY_PER_KG * 100}%/kg past ${BODYWEIGHT_REF_KG} kg, floor ${MASS_FLOOR}`, meaning: "more absolute load moved per set" },
      { symbol: "sleep 1–5", value: SLEEP_RECOVERY.slice(1).join(" / "), meaning: "self-reported or measured from check-ins" },
      { symbol: "stress 1–5", value: STRESS_RECOVERY.slice(1).join(" / "), meaning: "5 = very stressed" },
      { symbol: "energy", value: `${NUTRITION_RECOVERY.deficit} / ${NUTRITION_RECOVERY.maintenance} / ${NUTRITION_RECOVERY.surplus}`, meaning: "deficit / maintenance / surplus, read off the scale" },
    ],
    note: "How much work you can ABSORB. The bounds matter: five mildly negative inputs must not multiply into a ceiling nobody could train under.",
  },
  {
    id: "landmark-band",
    engine: "landmarks",
    name: "MAV band re-derivation",
    expression: "mavHigh' = mev' + (mrv' − mev') × pHigh,   pHigh = (mavHigh − mev) / (mrv − mev)",
    constants: [{ symbol: "pLow, pHigh", value: "from the source table", meaning: "each muscle's own band position" }],
    note: "The band is never scaled on its own — it keeps its PROPORTIONAL position between the athlete's own MEV and MRV. That preserves each muscle's shape and makes mv ≤ mev ≤ mavLow ≤ mavHigh ≤ mrv true by construction rather than by clamping.",
  },
  {
    id: "landmark-observed",
    engine: "landmarks",
    name: "Observed ceiling correction",
    expression: "mrv = overreached ? min(prior, min(overreachedSets) − 1) : (maxTolerated ≥ prior − 1 ? maxTolerated + 1 : prior)",
    constants: [
      { symbol: "±35%", value: "bound vs the prior", meaning: "no window can double or halve a ceiling" },
      { symbol: "2", value: "qualifying weeks", meaning: "below this the prior is returned untouched at zero confidence" },
      { symbol: "≥ mavHigh", value: "volume gate", meaning: "a light week proves nothing about a ceiling" },
    ],
    note: "A ceiling is only ever found by running into it. Weeks are classed tolerated or overreached from e1RM drift, post-session fatigue, check-in soreness and energy; symptoms set an upper bound and beat 'I got away with it'.",
  },
  {
    id: "landmark-freshness",
    engine: "feelTiming",
    name: "Check-in soreness polarity",
    expression: "soreness = 6 − storedValue",
    constants: [{ symbol: "stored", value: "1–5, 5 = FRESH", meaning: "the column is named 'soreness' but holds freshness" }],
    note: "The guided flow asks 'how fresh do your muscles feel?', so 5 means fresh. Reading the column by its NAME gives a plausible, exactly backwards answer — which is how the MRV estimator once punished athletes for reporting they felt good. Converted once, in checkin-scales.ts.",
  },

  {
    id: "landmark-frame",
    engine: "landmarks",
    name: "Body mass read against frame",
    expression: `adjusted = (mass / (${REFERENCE_BMI} × height²)) × ${BODYWEIGHT_REF_KG}`,
    constants: [
      { symbol: String(REFERENCE_BMI), value: "reference build", meaning: "the mass a height is expected to carry" },
      { symbol: `${BODYWEIGHT_REF_KG} kg`, value: "reference mass", meaning: "where the recovery penalty starts" },
    ],
    note: "The recovery factor docks mass above the reference, but 95 kg at 195 cm and 95 kg at 170 cm are not the same load and the flat per-kilo rule penalised them identically. With height known, mass is read against what the frame predicts. Height comes from the athlete's own body log (Profile → Body & progress, BodyMetric.heightCm) — it is never inferred, and the volume profile reads it from there rather than asking twice. Deliberately NOT a body-composition model — the app cannot see body fat. Without height the raw-kg rule applies unchanged.",
  },

  {
    id: "level-ratio",
    engine: "fitnessLevel",
    name: "Training level from relative strength",
    expression: "ratio = bestE1rm / bodyMass   vs   threshold × sexFactor × developmentFraction(age)",
    constants: [
      { symbol: "Back Squat", value: STRENGTH_STANDARDS.find((s) => s.key === "Back Squat")!.ratios.join(" / "), meaning: "novice / intermediate / advanced / elite" },
      { symbol: "Deadlift", value: STRENGTH_STANDARDS.find((s) => s.key === "Deadlift")!.ratios.join(" / "), meaning: "entry ratios, ×bodyweight" },
      { symbol: "Bench Press", value: STRENGTH_STANDARDS.find((s) => s.key === "Bench Press")!.ratios.join(" / "), meaning: "male, peak training age" },
      { symbol: "≤12", value: "reps", meaning: "a rep-out is not a max test" },
      { symbol: "180 d", value: "window", meaning: "current form, not a lifetime best" },
    ],
    note: "The BEST lift sets the level, not the average — training age is what you have built, not a number dragged down by the lift you neglect. Confidence rises with how many benchmark LIFTS are represented and caps at 0.85, because a ratio is a proxy for training age rather than a measurement of it; it counts only lifts, since a weak run used to be counted as support for a verdict it contradicted. The athlete's own answer always wins; the estimate fills a gap and any disagreement is shown, never silently applied. THIS is the read `resolveExperience` hands the volume model — strengthLevel, never the headline. MEV/MRV are lifting landmarks, so an endurance read cannot set them: a 60 kg athlete running 2:57 /km is genuinely elite and still squats 1.06 × bodyweight, and handing `advanced` to athleteLandmarks on the strength of the run prescribed an advanced lifter's set counts to someone who had never trained the pattern.",
  },
  {
    id: "profile-completeness",
    engine: "fitnessLevel",
    name: "Profile completeness",
    expression: "score = Σ weight(answered) / Σ weight(all)",
    constants: VOLUME_PROFILE_FIELDS.slice(0, 4).map((f) => ({
      symbol: f.key,
      value: String(f.weight),
      meaning: f.key === "experience" ? "moves MEV as well as MRV" : "adjusts what can be absorbed",
    })),
    note: "Weighted by how much each input actually moves the estimate rather than by counting boxes — a bar that treats training age and stress as equal lies about where the athlete's effort pays off. The weights are a distribution summing to 1.",
  },

  // ---- The block ramp: landmarks are walls, not targets. ----
  {
    id: "block-target",
    engine: "volumeBlock",
    name: "This week's target sets",
    expression: "target = round(mev + (top − mev) × ramp),   ramp = (week − 1) / (loadWeeks − 1)",
    constants: [
      { symbol: "top", value: "mavHigh, or max(mavHigh, mrv − 1) when overreaching", meaning: "where the last load week lands" },
      { symbol: "deload", value: "mv", meaning: "the maintenance floor" },
    ],
    note: "Week 1 sits at MEV so there is somewhere to go; the accumulation weeks climb to the top of MAV; the deload drops to MV. Living at MRV every week leaves no room to progress and buries the athlete by week three.",
  },

  // ---- Feel timing: when you answered changes what the answer means. ----
  {
    id: "feel-residual",
    engine: "feelTiming",
    name: "Acute fatigue still present",
    expression: `expectedResidual(h) = ${RESIDUAL_FLOOR} + ${Math.round((1 - RESIDUAL_FLOOR) * 100) / 100} × e^(−h / ${RESIDUAL_TAU_H})`,
    constants: [
      { symbol: String(RESIDUAL_TAU_H), value: `${RESIDUAL_TAU_H} h`, meaning: "time constant of the fast component" },
      { symbol: String(RESIDUAL_FLOOR), value: `${Math.round(RESIDUAL_FLOOR * 100)}%`, meaning: "slow floor — the muscle damage that outlives the day" },
    ],
    note: "The fraction of a session's acute fatigue still expected h hours after it ended. Whole at h=0, under half by 10 h, flat on the floor past a day.",
  },
  {
    id: "feel-cost",
    engine: "feelTiming",
    name: "Timing-adjusted session cost",
    expression: `cost = clamp( ((fatigue − 1) / 4) / expectedResidual(h), 0, ${MAX_COST} )`,
    constants: [
      { symbol: String(COST_HIGH), value: "strain threshold", meaning: "at/above this the session was not absorbed" },
      { symbol: String(MIN_STRAIN_FATIGUE), value: "raw floor", meaning: "no lag can inflate 'I feel fine' into strain" },
      { symbol: String(MAX_COST), value: "bound", meaning: "one tap can never imply a superhuman disturbance" },
    ],
    note: "The same tap at a different hour is a different measurement: fatigue 4 at 1 h ≈ 0.83 (a hard session), the same 4 at 10 h ≈ 1.50 (a recovery problem). Thresholds run on cost, not the 1–5 scale, because 5 saturates. Since the one-card merge this runs over the DAILY CHECK-IN too — the lag is measured from the last session that ended before the check-in was written.",
  },
  {
    id: "recovery-pooled",
    engine: "feelTiming",
    name: "One recovery reading",
    expression: "spent = mean( soreness, 6 − energy )   →   recoveryCost = Σ(cost × weight) / Σ(weight)",
    constants: [
      { symbol: String(COST_HIGH), value: "strain threshold", meaning: "one threshold for every recovery answer" },
      { symbol: String(COST_OK), value: "absorbed below", meaning: "a week only reads as tolerated under this" },
    ],
    note: "Soreness and energy answer the same question in opposite directions, so they are folded onto ONE spentness scale (5 = wrecked), lag-adjusted, and pooled with any historical post-workout answers into a single number. Before the merge these were two raw thresholds on two code paths, which is how the card could promise a reading was not counted while the estimator counted it. Pooling is now per DAY — see 'One day, one vote'.",
  },
  {
    id: "feel-weight",
    engine: "feelTiming",
    name: "Recall discount",
    expression: `weight(h) = h ≤ ${RECALL_FROM_H} ? 1 : ${WEIGHT_FLOOR} + ${Math.round((1 - WEIGHT_FLOOR) * 100) / 100} × e^(−(h − ${RECALL_FROM_H}) / ${RECALL_TAU_H})`,
    constants: [
      { symbol: String(RECALL_FROM_H), value: `${RECALL_FROM_H} h`, meaning: "beyond this a report is recall, not measurement" },
      { symbol: String(WEIGHT_FLOOR), value: String(WEIGHT_FLOOR), meaning: "floor — a late report still counts for something" },
    ],
    note: "An unknown lag keeps full weight: we have no reason to distrust it, only no reason to adjust it either.",
  },

  // ---- Two reads of one session, and what the gap between them measures. ----
  {
    id: "feel-schedule",
    engine: "feelTiming",
    name: "Which read is due",
    expression: `immediate: [end, end + ${IMMEDIATE_WINDOW_H} h]   recovery: [end + ${RECOVERY_DUE_H} h, end + ${RECOVERY_WINDOW_H} h]`,
    constants: [
      { symbol: `${IMMEDIATE_WINDOW_H} h`, value: "immediate window", meaning: "past this, the answer is a memory of a feeling" },
      { symbol: `${RECOVERY_DUE_H} h`, value: "recovery opens", meaning: `expectedResidual(${RECOVERY_DUE_H}) ≈ 0.59 — the fast component has largely drained` },
      { symbol: `${RECOVERY_WINDOW_H} h`, value: "recovery closes", meaning: "the next-day boundary; beyond it, recall" },
      { symbol: `${MAX_READS_PER_DAY} per day`, value: "readiness reads", meaning: "the recovery read is anchored to the last session to finish — you do not recover one at a time" },
    ],
    note: "The immediate read is per session and cannot be taken later: effort is sRPE, and spentness at the peak is the anchor everything else is measured against. The recovery read is the one that can move a training ceiling. Two moments, one instrument. It is ANSWERED BY A READ, not by the row being touched — editing a day's note in the evening is not a statement about how the session drained.",
  },
  {
    id: "recovery-curve",
    engine: "feelTiming",
    name: "Measured clearance rate",
    expression: "ratio = cost(later) / cost(immediate)   —   both against the same population curve",
    constants: [
      { symbol: String(CLEARANCE_FAST), value: "fast below", meaning: "drained faster than the curve predicts" },
      { symbol: String(CLEARANCE_SLOW), value: "slow above", meaning: "still carrying it long after the model says it should have gone" },
      { symbol: `${MIN_PAIR_GAP_H} h`, value: "minimum gap", meaning: "closer than this and the expected residual barely moves" },
      { symbol: String(MIN_PAIR_FATIGUE), value: "minimum immediate report", meaning: "a session you walked out of fine has nothing to drain" },
      { symbol: String(MIN_RECOVERY_PAIRS), value: "minimum pairs", meaning: "one is an anecdote; below this the index is exactly 1" },
    ],
    note: "Because cost is timing-normalised, two reads of the same session come out EQUAL when the athlete drains at the population rate — so the ratio is a direct read of their own rate. No personal time constant is fitted: R(h₁)/R(h₂) is not monotone in τ, so a single pair admits two values and picking one would dress an assumption as a measurement. A pair is dropped if a second session lands inside its gap.",
  },
  {
    id: "read-gate",
    engine: "feelTiming",
    name: "When a new read may be taken",
    expression: `opensAt = max( lastRead + ${MIN_RELOG_GAP_H} h , sessionEnd + ${POST_SESSION_LOCK_H} h  [while that is still ahead of lastRead] )`,
    constants: [
      { symbol: `${MIN_RELOG_GAP_H} h`, value: "cadence floor = MIN_PAIR_GAP_H", meaning: "closer than the pair model can use, so a second answer is not a second measurement" },
      { symbol: `${POST_SESSION_LOCK_H} h`, value: "post-session lock = RECOVERY_DUE_H", meaning: "the hour the recovery read was already scheduled at" },
      { symbol: "first read", value: "never gated", meaning: "an answer given walking out of the gym is true about that moment" },
      { symbol: String(MAX_READS_PER_DAY), value: "reads per day", meaning: "unreachable behind the cadence floor; it exists so one day cannot flood a week" },
    ],
    note: "Two clocks, and the later one wins. Session ends 09:00 and the athlete taps at 09:30: cadence alone would open at 13:30, but that session's recovery read is not due until 15:00 — so the gate opens at 15:00 and the second answer lands where it is worth something. Inside the gate a readiness write is a CORRECTION of the read on record (same clock, new value), never a rejection: the guided check-in must not fail a whole submission over one field. It borrows both numbers rather than inventing any, because a re-read the maths would discard is not worth asking for.",
  },
  {
    id: "readiness-spent",
    engine: "feelTiming",
    name: "Readiness on the spentness scale",
    expression: `spent = 6 − readiness   →   cost = clamp( ((spent − 1) / 4) / expectedResidual(h), 0, ${MAX_COST} )`,
    constants: [
      { symbol: "6 − v", value: "the reflection", meaning: "5 = primed = nothing to drain; 2 = wrecked = 4/5 spent" },
      { symbol: String(COST_HIGH), value: "strain threshold", meaning: "the SAME threshold the session answer runs against" },
    ],
    note: "The two cards run in opposite directions — 5 means 'primed' on the readiness picker and 'wrecked' on the fatigue question — so one is the other reflected. Inverting means a readiness read is placed by the same residual curve, discounted by the same recall rule and read by the same threshold as a post-workout answer, which is the only way the two surfaces are guaranteed not to disagree. Worked: Flat at 1 h ≈ 0.56 (an ordinary hard morning), the identical tap at 14 h ≈ 1.21 (past the threshold — the session was not absorbed). The picker's four faces write 2…5, so a readiness read tops out at 4/5 spent; the guided check-in's full 1–5 is there for an athlete who means the floor.",
  },
  {
    id: "decisive-read",
    engine: "feelTiming",
    name: "Which read governs the day",
    expression: `decisive = last read with lag ≥ ${IMMEDIATE_WINDOW_H} h  (else the last read)`,
    constants: [
      { symbol: `${IMMEDIATE_WINDOW_H} h`, value: "confound window", meaning: "inside it the session is still the loudest thing in the answer" },
      { symbol: "latest", value: "not the mean", meaning: "averaging 09:30 with 22:00 describes neither moment" },
    ],
    note: "What prescribeSession scales today's load off, and what the day's stored column is set to on every write — so every existing reader of Checkin.energy keeps working unchanged. Latest rather than averaged because the second read SUPERSEDES the first as a statement of current state; the first is not discarded, it is what makes the second measurable. The confounded case matters in one direction in particular: an athlete who logged a real recovery read in the evening, trains again late and taps 'wrecked' walking out must not have the evening's reading replaced by the session talking.",
  },
  {
    id: "readiness-pair",
    engine: "feelTiming",
    name: "Clearance from two reads",
    expression: `ratio = cost(later) / cost(immediate),  weight ×= ${READINESS_PAIR_WEIGHT}`,
    constants: [
      { symbol: String(READINESS_PAIR_WEIGHT), value: "readiness discount", meaning: "same scale and curve, noisier instrument" },
      { symbol: `< ${IMMEDIATE_WINDOW_H} h`, value: "immediate side", meaning: "a read taken while the session was still present, when no post-workout answer exists" },
      { symbol: String(MIN_PAIR_FATIGUE), value: "minimum immediate report", meaning: "a session you walked out of fine has nothing to drain" },
    ],
    note: "The clearance model was built for pairs and, until a day could hold more than one read, was fed one report a day — so for most athletes it sat at exactly 1.0 with zero confidence, which is the population curve wearing a measurement's clothes. An athlete who skips the post-workout card but taps the faces twice now measures their own rate. The session's OWN answer is still preferred wherever it exists, at full weight; every guard in recoveryCurve applies unchanged, including dropping any pair with a second session inside its gap.",
  },
  {
    id: "day-one-vote",
    engine: "landmarks",
    name: "One day, one vote",
    expression: "per day:  energy = decisive read,  weight(read) = reportWeight(lag) ÷ readsThatDay",
    constants: [
      { symbol: "÷ n", value: "shared weight", meaning: "a day's reads split one unit of influence" },
      { symbol: "decisive", value: "not the mean", meaning: "the day's energy is the read that governs it" },
    ],
    note: "The weekly means pooled report by report. Once a day could carry several reads, a training day logged three times would have outvoted a rest day logged once — and training days are exactly the days that read low, so the ceiling would have come down because the athlete checked in more often. Reports are grouped by day before pooling: one soreness value, one energy value, one unit of weight split across the reads inside it. The extra reads sharpen the TIMING without inflating the sample count.",
  },
  {
    id: "clearance-factor",
    engine: "landmarks",
    name: "Clearance → ceiling multiplier",
    expression: `recovery ×= clamp(1 + (1 − index) × ${CLEARANCE_SLOPE} × confidence, ${CLEARANCE_FACTOR_BOUNDS[0]}, ${CLEARANCE_FACTOR_BOUNDS[1]})`,
    constants: [
      { symbol: String(CLEARANCE_SLOPE), value: "slope", meaning: "how hard a measured rate may move the ceiling" },
      { symbol: `${CLEARANCE_FACTOR_BOUNDS[0]}–${CLEARANCE_FACTOR_BOUNDS[1]}`, value: "bounds", meaning: "two taps a day is not a blood panel" },
      { symbol: "×confidence", value: "scaling", meaning: "two pairs nudge, twenty move it" },
    ],
    note: "Applied BEFORE the week classifier, so the adaptive estimator bounds itself around a prior that already reflects measured recovery. Scales MRV only — how fast you clear fatigue says nothing about how much work it takes to grow you.",
  },
  {
    id: "level-pace",
    engine: "fitnessLevel",
    name: "Training level from running",
    expression: `T₅ = T × (${ENDURANCE_STANDARD_KM}/D)^${RIEGEL_EXPONENT}   vs   threshold × sexFactor / developmentFraction(age)`,
    constants: [
      { symbol: "5 km pace", value: ENDURANCE_PACE.map((p) => `${Math.floor(p / 60)}:${String(p % 60).padStart(2, "0")}`).join(" / "), meaning: "novice / intermediate / advanced / elite, per km" },
      { symbol: String(RIEGEL_EXPONENT), value: "Riegel exponent", meaning: "normalises any run to a 5 km equivalent" },
      { symbol: String(ENDURANCE_SEX_FACTOR), value: "female factor", meaning: "thresholds are this much slower" },
      { symbol: `${ENDURANCE_MIN_KM} km`, value: "minimum distance", meaning: "shorter is not an aerobic test" },
    ],
    note: "Running is one of six endurance disciplines now (see below), and the only one whose table predates them. Normalising to a 5 km equivalent is what makes a 10 km and a parkrun comparable, so a marathoner is never read as a slow 5 km runner. Whichever half of the athlete is stronger sets the headline level, and `basis` always names which halves had data.",
  },
  {
    id: "endurance-score",
    engine: "fitnessLevel",
    name: "The shared engine score",
    expression: `score = ${TIER_POINTS} × tier + ${TIER_POINTS} × (v − entry[tier]) / (entry[tier+1] − entry[tier])`,
    constants: [
      { symbol: String(TIER_POINTS), value: "points per tier", meaning: "novice 25, intermediate 50, advanced 75" },
      { symbol: String(ELITE_SCORE), value: "elite entry", meaning: "the scale continues past it, deliberately" },
      { symbol: "1 / v", value: "pace inversion", meaning: "a pace is scored bigger-is-better after inverting" },
      { symbol: "6", value: "disciplines", meaning: "run, swim, ride, row, ski, triathlon" },
    ],
    note: "Paces cannot be compared across water, road and snow, so nothing is compared as a pace. Each discipline owns four entry thresholds in its OWN unit — the same shape the five benchmark lifts use — and a raw performance is interpolated between them onto one unitless scale. The scale runs PAST 100 on purpose: an athlete standing on the elite floor and one well beyond it must not be the same number, or every downstream comparison would flatten the best athletes into one another. Below novice it decays proportionally rather than clamping, so a slow effort still ranks against a slower one.",
  },
  {
    id: "endurance-admission",
    engine: "fitnessLevel",
    name: "Endurance admission, per modality",
    expression: "discipline × modality → standard, else unread",
    constants: ENDURANCE_STANDARDS.map((s): { symbol: string; value: string; meaning: string } => ({
      symbol: s.discipline,
      value: s.thresholds.join(" / "),
      meaning: s.higherIsBetter ? "W/kg entries, novice → elite" : `entries novice → elite, ${s.min}–${s.max} ${s.discipline === "cycling" ? "min" : "km"}`,
    })).concat(TRIATHLON_CLASSES.map((c): { symbol: string; value: string; meaning: string } => ({
      symbol: `tri ${c.key}`,
      value: c.thresholds.join(" / "),
      meaning: `finishing minutes at ${c.km} km, ±${Math.round(TRIATHLON_TOLERANCE * 100)}%`,
    }))),
    note: "Admission is per MODALITY, not per sport. A row on an erg is among the best-standardised efforts in sport; the same athlete on water is nearly unscoreable (boat class, crew, stream, wind), so water rows are declined. Cycling by POWER is the cleanest of the six — watts are watts — while cycling by speed is a fiction, which is why a ride without a meter is still unread. Swimming is pool freestyle only. Skiing carries a solo cap because course profile and snow vary more than skiers do; another discipline agreeing lifts it. Triathlon is a property of the SESSION (swim + bike + run within tolerance of a canonical race), checked before the legs so a race is never also read as three weak standalone efforts.",
  },
  {
    id: "endurance-gates",
    engine: "fitnessLevel",
    name: "The gates — second best, not best",
    expression: "speaks = efforts.length ≥ 2 ? sortByScore(efforts)[1] : efforts[0] (unconfirmed)",
    constants: [
      { symbol: "2", value: "efforts to confirm", meaning: "a fluke happens once, a capacity twice" },
      { symbol: "[1]", value: "the second best", meaning: "the PR is kept, it just does not set the level" },
      { symbol: "solo cap", value: String(standardFor("skiing")?.soloCap ?? "—"), meaning: "skiing alone may not reach elite" },
    ],
    note: "Under a maximum the risk is never that a weak result drags the athlete down — it is that ONE flattering result lifts them, and with six disciplines there are six chances at a lucky reading, so the bias compounds. Every gate therefore acts on the GOOD results, inside a discipline, before it may compete. A single effort is still read (refusing an athlete's only honest race would be worse) but is marked unconfirmed: reduced confidence, and no public badge.",
  },
  {
    id: "endurance-combine",
    engine: "fitnessLevel",
    name: "Maximum across disciplines, never a mean",
    expression: `level = max(scores);  confidence = base ± Σ ${CORROBORATION_WEIGHT} × transfer(top, d)`,
    constants: [
      { symbol: `${CONFIRMED_BASE} / ${UNCONFIRMED_BASE}`, value: "base confidence", meaning: "confirmed / single-effort" },
      { symbol: String(CORROBORATION_WEIGHT), value: "corroboration", meaning: "per agreeing discipline, × transfer" },
      { symbol: String(CONTRADICTION_PENALTY), value: "contradiction", meaning: `when transfer ≥ ${HIGH_TRANSFER} and the gap ≥ ${AGREEMENT_BAND * 2}` },
      { symbol: String(AGREEMENT_BAND), value: "agreement band", meaning: "one tier — inside it, two reads agree" },
      { symbol: String(CONFIDENCE_CAP), value: "cap", meaning: "a performance is a proxy, never a measurement" },
    ],
    note: "performance = engine × economy, and economy ≤ 1, so every discipline hands back a LOWER BOUND on the same capacity. That makes averaging not merely unkind but invalid — the mean of two lower bounds is not a lower bound, and an elite run averaged with a hobby swim is false about both. The maximum is the tightest bound the evidence supports. Weak results are never skipped and never subtract: they change job from setting the level to CERTIFYING it, through confidence. Rejected on purpose: shrinking the max toward the second discipline (max − k × transfer × gap). Any k large enough to catch a real outlier also demotes the honest specialist, which is the athlete the design exists to protect.",
  },
  {
    id: "endurance-transfer",
    engine: "fitnessLevel",
    name: "Transfer — which disagreements are informative",
    expression: "transfer(a, b) ∈ (0, 1], symmetric",
    constants: [
      { symbol: "run ↔ ski", value: String(transfer("running", "skiing")), meaning: "shared engine — a gap here is worth a flag" },
      { symbol: "run ↔ tri", value: String(transfer("running", "triathlon")), meaning: "triathlon contains running" },
      { symbol: "run ↔ bike", value: String(transfer("running", "cycling")), meaning: "shared central, different peripheral" },
      { symbol: "run ↔ swim", value: String(transfer("running", "swimming")), meaning: "the weakest pair — a slow swim says almost nothing" },
      { symbol: String(HIGH_TRANSFER), value: "flag threshold", meaning: "above this, a two-tier gap is worth surfacing" },
    ],
    note: "An elite runner who swims badly is UNREMARKABLE: swimming is the most technique-bound sport on the list and the two barely constrain each other, so the hobby swim adds almost nothing to confidence and takes nothing away. An elite runner who SKIS badly is surprising, because those correlate strongly — and that pattern is far more often a mis-tagged session or a drifting GPS track than a physiological marvel, so it is flagged rather than believed. A documented prior in the same spirit as the strength standards, and the right shape to be shrunk toward the athlete's own data the way personal.ts shrinks the ACWR spike onset.",
  },
  {
    id: "landmark-replay",
    engine: "landmarks",
    name: "Has the ceiling settled?",
    expression: `drift = max |mrv(w) − mrv(w−1)| over the last ${SETTLE_WINDOW} weeks`,
    constants: [
      { symbol: `≤ ${SETTLED_DRIFT}`, value: "settled", meaning: "the estimate stopped changing its mind" },
      { symbol: `≤ ${CONVERGING_DRIFT}`, value: "converging", meaning: "still moving, within a band you can train inside" },
      { symbol: String(SETTLE_WINDOW), value: "window", meaning: "weeks the verdict looks at" },
      { symbol: "≠ profile", value: "tested", meaning: "a week only counts if the log moved the ceiling off the profile answer" },
    ],
    note: "A diagnostic, not a second estimator — it calls the same resolver the app uses, at every week, with only the data that existed then. A single number cannot say whether to believe it; the shape of its own history can. A flat line at the prior is never reported as settled.",
  },
];

/** Sample the calibration curve for plotting (score 0..100 → p). */
export function logisticCurve(
  coeffs: CalibrationCoeffs = PRIOR_COEFFS,
  steps = 40,
): { score: number; p: number }[] {
  const pts: { score: number; p: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const score = (i / steps) * 100;
    pts.push({ score, p: calibrateRisk(score, coeffs) });
  }
  return pts;
}

/** What-if inputs: scale recent training and/or override today's wearables. */
export interface WhatIf {
  /** % applied to the last `recentDays` of training (100 = as logged). */
  loadPct?: number;
  /** Override TODAY's readings; baselines stay untouched. */
  hrv?: number;
  restingHr?: number;
  sleep?: number;
}

/** Scale the last `recentDays` of training by `loadPct`% (sets and minutes). */
export function whatIfLog(log: TrainingLog, loadPct = 100, recentDays = 7): TrainingLog {
  if (loadPct === 100) return log;
  const f = Math.max(0, loadPct) / 100;
  return log.map((s) =>
    s.daysAgo >= 0 && s.daysAgo < recentDays
      ? {
          ...s,
          items: s.items.map((it) => ({
            ...it,
            ...(it.hardSets != null ? { hardSets: it.hardSets * f } : {}),
            ...(it.minutes != null ? { minutes: it.minutes * f } : {}),
          })),
        }
      : s,
  );
}

/** Override today's wearable readings (what-if) without moving the baselines. */
export function whatIfBio(bio: Biometrics | undefined, w: WhatIf): Biometrics | undefined {
  if (!bio) return undefined;
  const set = (m: BiometricMetric, v?: number): BiometricMetric =>
    v == null ? m : { ...m, today: v };
  return {
    ...bio,
    hrv: set(bio.hrv, w.hrv),
    restingHr: set(bio.restingHr, w.restingHr),
    sleep: set(bio.sleep, w.sleep),
  };
}

/** The full materialized computation for one athlete — what the console renders. */
export interface EngineTrace {
  state: PerformanceState;
  injury: InjuryRisk;
  /** oldest → newest, `days` points */
  trajectory: TrajectoryPoint[];
  /** the 0..100 energy-system figure behind HPI's endurance component AND,
   *  since Aug 2026, behind readiness's conditioning term */
  enduranceFatigue: number;
  /** where readiness's missing points went — the same split the athlete's ring
   *  draws, so the console and the card can be checked against each other */
  deficit: ReadinessDeficit;
}

/**
 * Run the whole stack once. Apply a what-if by transforming the inputs first:
 * `computeEngineTrace(whatIfLog(log, w.loadPct), whatIfBio(bio, w))`.
 */
export function computeEngineTrace(
  log: TrainingLog,
  bio?: Biometrics,
  opts?: { weights?: HpiWeights; coeffs?: CalibrationCoeffs; days?: number; spikeOnset?: number },
): EngineTrace {
  const weights = opts?.weights ?? HYBRID_WEIGHTS;
  const state = computePerformanceState(log, bio, weights);
  return {
    state,
    injury: computeInjuryRisk(log, bio, opts?.coeffs ?? PRIOR_COEFFS, {
      spikeOnset: opts?.spikeOnset,
    }),
    trajectory: performanceTrajectory(log, opts?.days ?? 14),
    enduranceFatigue: enduranceFatigue(state.fatigue),
    deficit: readinessDeficit(log, bio),
  };
}
