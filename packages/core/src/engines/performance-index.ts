/**
 * Performance Index · Fitness Level · Athletic Age — a CORRECTED implementation
 * of the candidate scoring spec (reference/performance-engine-review.md,
 * Appendix A). The mathematical / statistical errors flagged in Appendix B are
 * fixed here, in code:
 *
 *   #1/#2  Fitness-Level percentile uses a DEDICATED composite SD derived from
 *          the component score SDs (REFERENCE_PI.sd), never the single-metric
 *          SD of 15; the mean is the reference-athlete's own PI, not an assumed
 *          50. (The original reused 15 → percentiles compressed toward 50.)
 *   #3     VO₂ uses one internally-consistent running equation (the polynomial
 *          form paired with its own −4.60 intercept, not the ACSM +3.5 constant).
 *   #5     Strength & endurance norms are SEX-SPECIFIC.
 *   #7     Age decline is ASYMMETRIC — flat up to the peak, Gaussian fall after
 *          (so an 18-y/o isn't penalised like a 42-y/o).
 *   #8     Body-composition penalty is ASYMMETRIC (over-fat costs more than lean).
 *   #9     Athletic age is DERIVED by inverting the age-decline curve, not a
 *          hand-set line disconnected from the age model.
 *   #10    Interpretation bands are anchored to the calibrated percentile.
 *   #11    Every headline output carries a confidence + interval from input
 *          completeness (lifts, running, body-fat, the 28-day load array are
 *          optional — missing inputs widen the interval, they don't lie).
 *   #12    ACWR reuses the engine's already-correct EWMA formulation.
 *
 * STILL OPEN (data / methodology, not arithmetic — documented, not silently
 * faked):
 *   #4  average pace under-reads true VO₂max capacity (a max/time-trial input is
 *       better); we accept pace and treat the result as a habitual-intensity
 *       proxy.
 *   #6  strength uses relative strength (lift/BW), which is allometrically
 *       biased across body masses; DOTS/IPF-GL is the recommended upgrade once
 *       DOTS-specific norms are added.
 *
 * Calibration constants (NORMS, REFERENCE_PI, COMPONENT_SCORE_SD) are PROVISIONAL
 * and exported so a real reference cohort can replace them WITHOUT touching the
 * maths. They are honest placeholders, not validated population values.
 *
 * Pure. No I/O.
 */

import { type Sex, normalCdf } from "../benchmarks";

export interface PerformanceInput {
  age: number; // 18..80
  sex: Sex;
  heightCm: number;
  weightKg: number;
  bodyFatPct?: number;
  // strength (kg, 1RM) — any subset; the strength score uses what's present
  bench1RM?: number;
  squat1RM?: number;
  deadlift1RM?: number;
  // endurance
  avgPaceMinPerKm?: number;
  weeklyDistanceKm?: number;
  // history
  experienceYears: number;
  sessionsPerWeek: number;
  // workload for ACWR — daily training load, oldest..newest or newest..oldest
  // (order-independent for EWMA we treat index 0 = oldest).
  dailyLoad28?: number[];
}

export interface MetricNorm {
  mean: number;
  sd: number;
}

export interface SexNorms {
  /** relative-strength (lift / bodyweight) norms */
  bench: MetricNorm;
  squat: MetricNorm;
  deadlift: MetricNorm;
  /** estimated VO₂max (mL·kg⁻¹·min⁻¹) */
  vo2: MetricNorm;
  /** body-fat % at which the body-composition score peaks */
  idealBodyFat: number;
}

/**
 * PROVISIONAL norms. Male strength/VO₂ values follow Appendix A; female values
 * are reasonable placeholders pending a validated dataset. Exported so they can
 * be swapped for real cohort distributions.
 */
export const NORMS: Record<Sex, SexNorms> = {
  M: {
    bench: { mean: 1.1, sd: 0.3 },
    squat: { mean: 1.5, sd: 0.4 },
    deadlift: { mean: 1.8, sd: 0.45 },
    vo2: { mean: 42, sd: 8 },
    idealBodyFat: 12,
  },
  F: {
    bench: { mean: 0.65, sd: 0.2 },
    squat: { mean: 1.0, sd: 0.3 },
    deadlift: { mean: 1.25, sd: 0.35 },
    vo2: { mean: 35, sd: 7 },
    idealBodyFat: 22,
  },
};

/**
 * Population SD of each 0..100 domain score, used to derive the COMPOSITE SD
 * correctly (fix #1). strength/endurance are 50+15·z by construction → SD 15;
 * the rest are declared estimates. Exported for calibration.
 */
export const COMPONENT_SCORE_SD = {
  strength: 15,
  endurance: 15,
  bodycomp: 18,
  consistency: 22,
  experience: 22,
  ageFactor: 8,
} as const;

const WEIGHTS = {
  strength: 0.35,
  endurance: 0.3,
  bodycomp: 0.1,
  consistency: 0.1,
  experience: 0.1,
  ageFactor: 0.05,
} as const;

/**
 * Positive inter-correlation among fitness components inflates the composite SD
 * above the independence lower bound. 1.0 = independent; a real cohort will set
 * the true value. Documented interim factor.
 */
export const CORRELATION_INFLATION = 1.4;

const STRENGTH_PEAK = 30;
const ENDURANCE_PEAK = 35;
const AGE_SIGMA = 15;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const z = (x: number, n: MetricNorm) => (n.sd > 0 ? (x - n.mean) / n.sd : 0);

/** Velocity (m/min) → estimated VO₂max. One consistent equation (fix #3). */
export function vo2FromPace(paceMinPerKm: number): number {
  if (!(paceMinPerKm > 0)) return NaN;
  const v = 1000 / paceMinPerKm; // m/min
  return 0.182258 * v + 0.000104 * v * v - 4.6;
}

/**
 * Asymmetric age factor (fix #7): 1.0 up to the peak, Gaussian decline after.
 */
export function ageFactor(age: number, peak: number, sigma = AGE_SIGMA): number {
  if (age <= peak) return 1;
  return Math.exp(-((age - peak) ** 2) / (2 * sigma * sigma));
}

/** Asymmetric body-composition score (fix #8): over-fat costs more than lean. */
export function bodyCompScore(bodyFatPct: number, ideal: number): number {
  const d = bodyFatPct - ideal;
  const penalty = d > 0 ? 0.8 * d * d : 0.3 * d * d;
  return clamp(100 - penalty, 0, 100);
}

export type PerformanceBand =
  | "elite"
  | "advanced"
  | "intermediate"
  | "recreational"
  | "beginner";

export interface ScoreWithInterval {
  value: number;
  low: number;
  high: number;
}

export interface PerformanceResult {
  /** 0..1000 */
  performanceIndex: ScoreWithInterval;
  /** the underlying 0..100 composite before ×10 */
  piRaw: number;
  band: PerformanceBand;
  /** population percentile 0..100, calibrated (fix #1/#2) */
  fitnessLevel: number;
  /** inferred athletic age, 18..80 (fix #9) */
  athleticAge: number;
  components: {
    strength: number;
    endurance: number;
    bodycomp: number;
    consistency: number;
    experience: number;
    ageFactor: number;
  };
  /** 0..1 — how complete the inputs were */
  confidence: number;
  /** acute:chronic EWMA workload ratio + zone (fix #12); null if no load array */
  acwr: { value: number; zone: AcwrZone } | null;
}

export type AcwrZone = "detraining" | "optimal" | "elevated" | "high-risk" | "insufficient";

// ---- composite calibration (fix #1/#2) ----------------------------------

/** σ of PI_raw, derived from the component SDs + weights (NOT the 15 bug). */
export function compositeSd(): number {
  const indep = Math.sqrt(
    (WEIGHTS.strength * COMPONENT_SCORE_SD.strength) ** 2 +
      (WEIGHTS.endurance * COMPONENT_SCORE_SD.endurance) ** 2 +
      (WEIGHTS.bodycomp * COMPONENT_SCORE_SD.bodycomp) ** 2 +
      (WEIGHTS.consistency * COMPONENT_SCORE_SD.consistency) ** 2 +
      (WEIGHTS.experience * COMPONENT_SCORE_SD.experience) ** 2 +
      (WEIGHTS.ageFactor * COMPONENT_SCORE_SD.ageFactor) ** 2,
  );
  return indep * CORRELATION_INFLATION;
}

/** The reference "median athlete" whose PI defines the 50th percentile. */
export const REFERENCE_ATHLETE: PerformanceInput = {
  age: 30,
  sex: "M",
  heightCm: 178,
  weightKg: 80,
  bodyFatPct: 18,
  bench1RM: 88, // 1.10 × BW
  squat1RM: 120, // 1.50 × BW
  deadlift1RM: 144, // 1.80 × BW
  avgPaceMinPerKm: 5.5,
  weeklyDistanceKm: 25,
  experienceYears: 3,
  sessionsPerWeek: 3,
};

function strengthScore(input: PerformanceInput): number {
  const n = NORMS[input.sex];
  const bw = input.weightKg;
  // weighted z over whatever lifts are present (re-normalised so a missing lift
  // doesn't silently read as zero)
  const parts: { w: number; z: number }[] = [];
  if (input.bench1RM != null) parts.push({ w: 0.25, z: z(input.bench1RM / bw, n.bench) });
  if (input.squat1RM != null) parts.push({ w: 0.4, z: z(input.squat1RM / bw, n.squat) });
  if (input.deadlift1RM != null) parts.push({ w: 0.35, z: z(input.deadlift1RM / bw, n.deadlift) });
  if (parts.length === 0) return 50; // no strength data → population mean
  const wSum = parts.reduce((a, b) => a + b.w, 0);
  const sz = parts.reduce((a, b) => a + b.w * b.z, 0) / wSum;
  return clamp(50 + 15 * sz, 0, 100);
}

function enduranceScore(input: PerformanceInput): number {
  if (input.avgPaceMinPerKm == null) return 50;
  const vo2 = vo2FromPace(input.avgPaceMinPerKm);
  const ez = z(vo2, NORMS[input.sex].vo2);
  return clamp(50 + 15 * ez, 0, 100);
}

/** PI_raw (0..100) — no percentile dependency, so it's safe to seed the mean. */
function piRawCore(input: PerformanceInput): {
  piRaw: number;
  components: PerformanceResult["components"];
} {
  const n = NORMS[input.sex];
  const strength = strengthScore(input);
  const endurance = enduranceScore(input);
  const bodycomp = input.bodyFatPct != null ? bodyCompScore(input.bodyFatPct, n.idealBodyFat) : 50;
  const consistency = clamp((input.sessionsPerWeek / 5) * 100, 0, 100);
  const experience = clamp(20 * Math.log2(input.experienceYears + 1), 0, 100);
  // overall age factor = mean of the two domain peaks (fix: single, defined AF)
  const af =
    (ageFactor(input.age, STRENGTH_PEAK) + ageFactor(input.age, ENDURANCE_PEAK)) / 2;

  const piRaw =
    WEIGHTS.strength * strength +
    WEIGHTS.endurance * endurance +
    WEIGHTS.bodycomp * bodycomp +
    WEIGHTS.consistency * consistency +
    WEIGHTS.experience * experience +
    WEIGHTS.ageFactor * (100 * af);

  return {
    piRaw,
    components: { strength, endurance, bodycomp, consistency, experience, ageFactor: af },
  };
}

/** Reference PI distribution — mean from the reference athlete, SD derived. */
export const REFERENCE_PI: MetricNorm = {
  mean: piRawCore(REFERENCE_ATHLETE).piRaw,
  sd: compositeSd(),
};

function band(percentile: number): PerformanceBand {
  // anchored to the calibrated percentile (fix #10)
  if (percentile >= 97) return "elite";
  if (percentile >= 85) return "advanced";
  if (percentile >= 60) return "intermediate";
  if (percentile >= 35) return "recreational";
  return "beginner";
}

/** Athletic age by inverting the age-decline Gaussian (fix #9). */
function athleticAge(piRaw: number): number {
  const peak = (STRENGTH_PEAK + ENDURANCE_PEAK) / 2; // 32.5
  // performance ratio vs. an elite reference (top ~7%); ≥1 → peak age
  const eliteRef = REFERENCE_PI.mean + 1.5 * REFERENCE_PI.sd;
  const ratio = clamp(piRaw / eliteRef, 0.05, 1);
  if (ratio >= 1) return clamp(Math.round(peak), 18, 80);
  // invert AF = exp(−(age−peak)²/(2σ²))  →  age = peak + σ·√(−2 ln ratio)
  const age = peak + AGE_SIGMA * Math.sqrt(-2 * Math.log(ratio));
  return clamp(Math.round(age), 18, 80);
}

/** EWMA ACWR (fix #12), matching the load engine's formulation. */
function ewma(loads: number[], nWindow: number): number {
  const lambda = 2 / (nWindow + 1);
  let acc = loads.length ? loads[0]! : 0;
  for (let i = 1; i < loads.length; i++) acc = loads[i]! * lambda + acc * (1 - lambda);
  return acc;
}

function acwrFrom(load?: number[]): PerformanceResult["acwr"] {
  if (!load || load.length < 14) {
    return load && load.length ? { value: 0, zone: "insufficient" } : null;
  }
  const acute = ewma(load.slice(-7), 7);
  const chronic = ewma(load, 28);
  const value = chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : 0;
  const zone: AcwrZone =
    value < 0.8 ? "detraining" : value <= 1.3 ? "optimal" : value <= 1.5 ? "elevated" : "high-risk";
  return { value, zone };
}

/**
 * Confidence (fix #11) from input completeness: the optional inputs (lifts,
 * running, body-fat, the 28-day load array) each add information.
 */
function inputConfidence(input: PerformanceInput): number {
  let c = 0.4; // demographics + history are required
  if (input.bench1RM != null || input.squat1RM != null || input.deadlift1RM != null) c += 0.2;
  if (input.avgPaceMinPerKm != null) c += 0.2;
  if (input.bodyFatPct != null) c += 0.1;
  if (input.dailyLoad28 && input.dailyLoad28.length >= 14) c += 0.1;
  return Math.min(1, c);
}

export function computePerformanceIndex(input: PerformanceInput): PerformanceResult {
  const { piRaw, components } = piRawCore(input);

  // fix #1/#2 — calibrated percentile, dedicated composite SD + reference mean
  const overallZ = REFERENCE_PI.sd > 0 ? (piRaw - REFERENCE_PI.mean) / REFERENCE_PI.sd : 0;
  const fitnessLevel = Math.round(100 * normalCdf(overallZ));

  const confidence = inputConfidence(input);
  // interval on the 0..1000 index, widening as inputs thin (fix #11)
  const halfRaw = (1 - confidence) * 12 + 3; // in PI_raw points
  const pi = Math.round(piRaw * 10);
  const performanceIndex: ScoreWithInterval = {
    value: clamp(pi, 0, 1000),
    low: clamp(Math.round((piRaw - halfRaw) * 10), 0, 1000),
    high: clamp(Math.round((piRaw + halfRaw) * 10), 0, 1000),
  };

  return {
    performanceIndex,
    piRaw: Math.round(piRaw * 10) / 10,
    band: band(fitnessLevel),
    fitnessLevel,
    athleticAge: athleticAge(piRaw),
    components: {
      strength: Math.round(components.strength),
      endurance: Math.round(components.endurance),
      bodycomp: Math.round(components.bodycomp),
      consistency: Math.round(components.consistency),
      experience: Math.round(components.experience),
      ageFactor: Math.round(components.ageFactor * 100) / 100,
    },
    confidence: Math.round(confidence * 100) / 100,
    acwr: acwrFrom(input.dailyLoad28),
  };
}
