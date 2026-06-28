/**
 * Performance Index · Fitness Level · Athletic Age — a CORRECTED, calibrated
 * implementation of the candidate scoring spec (reference/performance-engine-
 * review.md, Appendix A). The mathematical / statistical errors flagged in
 * Appendix B are fixed here, in code:
 *
 *   #1/#2  Fitness-Level percentile uses the TRUE population mean & SD of PI_raw,
 *          computed by numerically integrating each component score over an
 *          explicit population input model (no `(PI_raw−50)/15`, no fudge
 *          factors). The original reused the single-metric SD (15) → percentiles
 *          compressed toward 50.
 *   #3     VO₂ uses one internally-consistent running equation (the polynomial
 *          form with its own −4.60 intercept, not the ACSM +3.5 constant).
 *   #5     Strength & endurance norms, and the population model, are SEX-SPECIFIC.
 *   #7     Age decline is ASYMMETRIC — flat up to the peak, Gaussian fall after
 *          (so an 18-y/o isn't penalised like a 42-y/o).
 *   #8     Body-composition penalty is ASYMMETRIC (over-fat costs more than lean).
 *   #9     Athletic age is DERIVED by inverting the age-decline curve.
 *   #10    Interpretation bands are anchored to the calibrated percentile.
 *   #11    Every headline output carries a confidence + interval that is the
 *          ACTUAL imputation variance from missing optional inputs (lifts,
 *          running, body-fat) — not a heuristic. Missing inputs are imputed at
 *          the population mean and widen the interval by exactly their
 *          contribution; a fully-specified athlete gets a tight interval.
 *   #12    ACWR reuses the engine's already-correct EWMA formulation.
 *
 * The ONLY modelling assumptions left are explicit and exported, not hidden
 * constants: the population input model (POPULATION), the norm tables (NORMS),
 * and the inter-component correlation (COMPONENT_CORRELATION, default 0 =
 * independence — a stated, conservative choice). Every derived quantity
 * (component moments, μ_PI, σ_PI) is computed from those by exact propagation /
 * quadrature, so swapping in a real cohort changes only the inputs, never the
 * maths.
 *
 * STILL OPEN (methodology / data, not arithmetic — documented, not faked):
 *   #4  average pace under-reads true VO₂max capacity; we accept pace and treat
 *       the result as a habitual-intensity proxy.
 *   #6  strength uses relative strength (lift/BW), which is allometrically
 *       biased across body masses; DOTS/IPF-GL is the upgrade once DOTS norms
 *       exist.
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
  // history (required)
  experienceYears: number;
  sessionsPerWeek: number;
  // workload for ACWR — daily training load, oldest..newest (index 0 = oldest)
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
 * Explicit population input model — the distributions over which the component
 * scores are integrated to get the composite mean/SD. Strength & endurance
 * component z-scores are unit-normal by construction (the NORMS define them), so
 * only the inputs feeding the non-z components need a distribution here.
 * PROVISIONAL but explicit; replace with real cohort statistics.
 */
export interface PopulationModel {
  bodyFat: MetricNorm; // %
  sessionsPerWeek: MetricNorm;
  experienceYears: MetricNorm;
  age: MetricNorm;
}

export const POPULATION: Record<Sex, PopulationModel> = {
  M: {
    bodyFat: { mean: 20, sd: 6 },
    sessionsPerWeek: { mean: 3, sd: 1.5 },
    experienceYears: { mean: 5, sd: 5 },
    age: { mean: 35, sd: 13 },
  },
  F: {
    bodyFat: { mean: 27, sd: 6 },
    sessionsPerWeek: { mean: 3, sd: 1.5 },
    experienceYears: { mean: 4, sd: 4.5 },
    age: { mean: 35, sd: 13 },
  },
};

const WEIGHTS = {
  strength: 0.35,
  endurance: 0.3,
  bodycomp: 0.1,
  consistency: 0.1,
  experience: 0.1,
  ageFactor: 0.05,
} as const;

type CompKey = keyof typeof WEIGHTS;
const COMP_KEYS = Object.keys(WEIGHTS) as CompKey[];

/**
 * Single inter-component correlation used when combining component variances
 * into the composite SD. 0 = independence (the stated, conservative default);
 * real fitness components are positively correlated, which a calibrated cohort
 * would raise. Exported so it can be set without touching the maths.
 */
export const COMPONENT_CORRELATION = 0;

const STRENGTH_PEAK = 30;
const ENDURANCE_PEAK = 35;
const AGE_SIGMA = 15;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const z = (x: number, n: MetricNorm) => (n.sd > 0 ? (x - n.mean) / n.sd : 0);

// ---- pure score-of-input functions (shared by per-athlete + calibration) ----

/** strength/endurance map a unit z to a 0..100 score. */
const scoreFromZ = (zz: number) => clamp(50 + 15 * zz, 0, 100);
const consistencyScore = (s: number) => clamp((Math.max(0, s) / 5) * 100, 0, 100);
const experienceScore = (y: number) => clamp(20 * Math.log2(Math.max(0, y) + 1), 0, 100);

/** Velocity (m/min) → estimated VO₂max. One consistent equation (fix #3). */
export function vo2FromPace(paceMinPerKm: number): number {
  if (!(paceMinPerKm > 0)) return NaN;
  const v = 1000 / paceMinPerKm; // m/min
  return 0.182258 * v + 0.000104 * v * v - 4.6;
}

/** Asymmetric age factor (fix #7): 1.0 up to the peak, Gaussian decline after. */
export function ageFactor(age: number, peak: number, sigma = AGE_SIGMA): number {
  if (age <= peak) return 1;
  return Math.exp(-((age - peak) ** 2) / (2 * sigma * sigma));
}

/** overall age factor = mean of the two domain peaks (single, defined AF). */
const overallAgeFactor = (age: number) =>
  (ageFactor(age, STRENGTH_PEAK) + ageFactor(age, ENDURANCE_PEAK)) / 2;
const ageFactorTerm = (age: number) => 100 * overallAgeFactor(age);

/** Asymmetric body-composition score (fix #8): over-fat costs more than lean. */
export function bodyCompScore(bodyFatPct: number, ideal: number): number {
  const d = bodyFatPct - ideal;
  const penalty = d > 0 ? 0.8 * d * d : 0.3 * d * d;
  return clamp(100 - penalty, 0, 100);
}

// ---- composite calibration (fix #1/#2) -----------------------------------

/**
 * Mean & SD of f(X) for X ~ Normal(n), by deterministic quadrature over ±6σ.
 * Captures the nonlinearities (clamps, the body-comp quadratic, the log) that a
 * closed-form variance would miss — so the composite SD is the TRUE one, not an
 * assumption.
 */
export function normalMoments(
  f: (x: number) => number,
  n: MetricNorm,
  grid = 2000,
): MetricNorm {
  if (!(n.sd > 0)) return { mean: f(n.mean), sd: 0 };
  const lo = n.mean - 6 * n.sd;
  const hi = n.mean + 6 * n.sd;
  const dx = (hi - lo) / grid;
  let w = 0;
  let m1 = 0;
  let m2 = 0;
  for (let i = 0; i <= grid; i++) {
    const x = lo + i * dx;
    const phi = Math.exp(-((x - n.mean) ** 2) / (2 * n.sd * n.sd));
    const g = f(x);
    w += phi;
    m1 += phi * g;
    m2 += phi * g * g;
  }
  const mean = m1 / w;
  const variance = Math.max(0, m2 / w - mean * mean);
  return { mean, sd: Math.sqrt(variance) };
}

export type ComponentMoments = Record<CompKey, MetricNorm>;

function computeMoments(sex: Sex): ComponentMoments {
  const p = POPULATION[sex];
  const unit: MetricNorm = { mean: 0, sd: 1 };
  return {
    strength: normalMoments(scoreFromZ, unit),
    endurance: normalMoments(scoreFromZ, unit),
    bodycomp: normalMoments((bf) => bodyCompScore(bf, NORMS[sex].idealBodyFat), p.bodyFat),
    consistency: normalMoments(consistencyScore, p.sessionsPerWeek),
    experience: normalMoments(experienceScore, p.experienceYears),
    ageFactor: normalMoments(ageFactorTerm, p.age),
  };
}

/** Per-sex population mean/SD of every 0..100 component score (derived). */
export const COMPONENT_MOMENTS: Record<Sex, ComponentMoments> = {
  M: computeMoments("M"),
  F: computeMoments("F"),
};

/** Population mean of PI_raw for a sex (Σ wᵢ·μᵢ). */
export function compositeMean(sex: Sex): number {
  const m = COMPONENT_MOMENTS[sex];
  return COMP_KEYS.reduce((a, k) => a + WEIGHTS[k] * m[k].mean, 0);
}

/** Population SD of PI_raw for a sex — Var = Σ wᵢ²σᵢ² + ρ·Σ_{i≠j} wᵢwⱼσᵢσⱼ. */
export function compositeSd(sex: Sex): number {
  const m = COMPONENT_MOMENTS[sex];
  let variance = 0;
  for (const k of COMP_KEYS) variance += (WEIGHTS[k] * m[k].sd) ** 2;
  if (COMPONENT_CORRELATION !== 0) {
    for (const ki of COMP_KEYS) {
      for (const kj of COMP_KEYS) {
        if (ki === kj) continue;
        variance += COMPONENT_CORRELATION * WEIGHTS[ki] * WEIGHTS[kj] * m[ki].sd * m[kj].sd;
      }
    }
  }
  return Math.sqrt(Math.max(0, variance));
}

/** Reference PI distribution per sex — fully derived from the population model. */
export const REFERENCE_PI: Record<Sex, MetricNorm> = {
  M: { mean: compositeMean("M"), sd: compositeSd("M") },
  F: { mean: compositeMean("F"), sd: compositeSd("F") },
};

// ---- per-athlete scoring --------------------------------------------------

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

export type AcwrZone =
  | "detraining"
  | "optimal"
  | "elevated"
  | "high-risk"
  | "insufficient";

export interface PerformanceResult {
  /** 0..1000, with a 95% interval from imputation uncertainty */
  performanceIndex: ScoreWithInterval;
  /** the underlying 0..100 composite before ×10 */
  piRaw: number;
  band: PerformanceBand;
  /** population percentile 0..100, calibrated (fix #1/#2) */
  fitnessLevel: number;
  /** inferred athletic age, 18..80 (fix #9) */
  athleticAge: number;
  components: Record<CompKey, number>;
  /** 0..1 — fraction of the index backed by observed (not imputed) inputs */
  confidence: number;
  /** acute:chronic EWMA workload ratio + zone (fix #12); null if no load array */
  acwr: { value: number; zone: AcwrZone } | null;
}

function strengthScore(input: PerformanceInput): number {
  const n = NORMS[input.sex];
  const bw = input.weightKg;
  // weighted z over whatever lifts are present (re-normalised so a missing lift
  // doesn't silently read as zero)
  const parts: { w: number; z: number }[] = [];
  if (input.bench1RM != null) parts.push({ w: 0.25, z: z(input.bench1RM / bw, n.bench) });
  if (input.squat1RM != null) parts.push({ w: 0.4, z: z(input.squat1RM / bw, n.squat) });
  if (input.deadlift1RM != null) parts.push({ w: 0.35, z: z(input.deadlift1RM / bw, n.deadlift) });
  if (parts.length === 0) return COMPONENT_MOMENTS[input.sex].strength.mean; // impute at mean
  const wSum = parts.reduce((a, b) => a + b.w, 0);
  const sz = parts.reduce((a, b) => a + b.w * b.z, 0) / wSum;
  return scoreFromZ(sz);
}

function enduranceScore(input: PerformanceInput): number {
  if (input.avgPaceMinPerKm == null) return COMPONENT_MOMENTS[input.sex].endurance.mean;
  const ez = z(vo2FromPace(input.avgPaceMinPerKm), NORMS[input.sex].vo2);
  return scoreFromZ(ez);
}

function components(input: PerformanceInput): Record<CompKey, number> {
  const n = NORMS[input.sex];
  return {
    strength: strengthScore(input),
    endurance: enduranceScore(input),
    bodycomp:
      input.bodyFatPct != null
        ? bodyCompScore(input.bodyFatPct, n.idealBodyFat)
        : COMPONENT_MOMENTS[input.sex].bodycomp.mean, // impute at mean
    consistency: consistencyScore(input.sessionsPerWeek),
    experience: experienceScore(input.experienceYears),
    ageFactor: overallAgeFactor(input.age),
  };
}

function piRawFrom(c: Record<CompKey, number>): number {
  return (
    WEIGHTS.strength * c.strength +
    WEIGHTS.endurance * c.endurance +
    WEIGHTS.bodycomp * c.bodycomp +
    WEIGHTS.consistency * c.consistency +
    WEIGHTS.experience * c.experience +
    WEIGHTS.ageFactor * (100 * c.ageFactor)
  );
}

function band(percentile: number): PerformanceBand {
  if (percentile >= 97) return "elite";
  if (percentile >= 85) return "advanced";
  if (percentile >= 60) return "intermediate";
  if (percentile >= 35) return "recreational";
  return "beginner";
}

/** Athletic age by inverting the age-decline Gaussian (fix #9). */
function athleticAge(piRaw: number, sex: Sex): number {
  const peak = (STRENGTH_PEAK + ENDURANCE_PEAK) / 2; // 32.5
  const ref = REFERENCE_PI[sex];
  const eliteRef = ref.mean + 1.5 * ref.sd; // top ~7%
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

export function computePerformanceIndex(input: PerformanceInput): PerformanceResult {
  const comp = components(input);
  const piRaw = piRawFrom(comp);

  // fix #1/#2 — calibrated percentile against the derived population distribution
  const ref = REFERENCE_PI[input.sex];
  const overallZ = ref.sd > 0 ? (piRaw - ref.mean) / ref.sd : 0;
  const fitnessLevel = Math.round(100 * normalCdf(overallZ));

  // fix #11 — confidence + interval from ACTUAL imputation variance. Optional
  // inputs (strength/endurance/body-comp) that are missing were imputed at the
  // population mean; their population SD is the uncertainty that imputation adds.
  const m = COMPONENT_MOMENTS[input.sex];
  const observed: Record<CompKey, boolean> = {
    strength: input.bench1RM != null || input.squat1RM != null || input.deadlift1RM != null,
    endurance: input.avgPaceMinPerKm != null,
    bodycomp: input.bodyFatPct != null,
    consistency: true,
    experience: true,
    ageFactor: true,
  };
  let observedWeight = 0;
  let imputedVar = 0; // in PI_raw² units
  for (const k of COMP_KEYS) {
    if (observed[k]) observedWeight += WEIGHTS[k];
    else imputedVar += (WEIGHTS[k] * m[k].sd) ** 2;
  }
  const halfRaw = 1.96 * Math.sqrt(imputedVar); // 95% imputation interval
  const pi = Math.round(piRaw * 10);

  return {
    performanceIndex: {
      value: clamp(pi, 0, 1000),
      low: clamp(Math.round((piRaw - halfRaw) * 10), 0, 1000),
      high: clamp(Math.round((piRaw + halfRaw) * 10), 0, 1000),
    },
    piRaw: Math.round(piRaw * 10) / 10,
    band: band(fitnessLevel),
    fitnessLevel,
    athleticAge: athleticAge(piRaw, input.sex),
    components: {
      strength: Math.round(comp.strength),
      endurance: Math.round(comp.endurance),
      bodycomp: Math.round(comp.bodycomp),
      consistency: Math.round(comp.consistency),
      experience: Math.round(comp.experience),
      ageFactor: Math.round(comp.ageFactor * 100) / 100,
    },
    confidence: Math.round(observedWeight * 100) / 100,
    acwr: acwrFrom(input.dailyLoad28),
  };
}
