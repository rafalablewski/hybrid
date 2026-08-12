/**
 * Cohort benchmark norms — percentile norms by age/sex/sport.
 *
 * Scope note (2026-08 strategy cuts): the TALENT GRAPH built on top of this
 * (the discovery screen, coach talent search, the shareable talent report) was
 * removed — recruiting is a relationship market and the graph is meaningless
 * without a verified record. What is left is the norm math itself, which the
 * shipped product still consumes: the fitness-level engine's maturation
 * adjustment, and datanet's cohort refit. (Wrapped's "where you stand"
 * percentile was a third consumer and went with the graph — the talent profile
 * was its only source of sex and age.)
 *
 * Norms here are documented synthetic priors (v0) — the structure the real
 * population dataset refits into as data accumulates.
 *
 * Pure stats. No I/O.
 */

export type Sex = "M" | "F";
export type BenchmarkMetric = "hpi" | "relStrength" | "vo2" | "durability";

export const BENCHMARK_METRICS: BenchmarkMetric[] = ["hpi", "relStrength", "vo2", "durability"];

export const METRIC_LABEL: Record<BenchmarkMetric, string> = {
  hpi: "HPI",
  relStrength: "Relative strength",
  vo2: "VO₂-proxy",
  durability: "Durability",
};

export const BENCHMARK_MODEL_VERSION = "norms-prior-v0";

export interface Cohort {
  sport: string;
  sex: Sex;
  age: number;
}

export interface Norm {
  mean: number;
  sd: number;
}

export interface MetricBenchmark {
  metric: BenchmarkMetric;
  value: number;
  /** 1..99 percentile vs the cohort */
  percentile: number;
  cohortMean: number;
  /** maturation-adjusted potential percentile (youth physical metrics) */
  potentialPercentile: number;
}

// --- normal distribution helpers ---
function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function percentileFromZ(z: number): number {
  return Math.max(1, Math.min(99, Math.round(normalCdf(z) * 100)));
}

// --- norms model (documented prior) ---
const BASE: Record<BenchmarkMetric, Norm> = {
  hpi: { mean: 70, sd: 12 },
  relStrength: { mean: 1.4, sd: 0.45 }, // e.g. back squat ÷ bodyweight
  vo2: { mean: 42, sd: 9 },
  durability: { mean: 50, sd: 16 },
};

const ENDURANCE = ["Running", "Cycling", "Swimming", "Triathlon", "Hyrox"];
const STRENGTH = ["Powerlifting", "Bodybuilding"];

/** Metrics that mature with physical development (age-scaled). */
function matures(metric: BenchmarkMetric): boolean {
  return metric === "relStrength" || metric === "vo2";
}

/** Sport shift on a metric's mean, in SD units. */
function sportShift(metric: BenchmarkMetric, sport: string): number {
  const endurance = ENDURANCE.includes(sport);
  const strength = STRENGTH.includes(sport);
  if (metric === "vo2") return endurance ? 0.6 : strength ? -0.3 : 0.1;
  if (metric === "relStrength") return strength ? 0.7 : endurance ? -0.2 : 0.2;
  return 0;
}

/** Sex shift on a metric's mean, in SD units (documented prior). */
function sexShift(metric: BenchmarkMetric, sex: Sex): number {
  if (sex === "F") return metric === "relStrength" ? -0.5 : metric === "vo2" ? -0.3 : 0;
  return 0;
}

/**
 * Fraction of mature capacity expected at a given age (peak ≈ 22–32).
 * ~0.78 at 14 rising to 1.0 by 22, gentle decline after 33.
 */
export function developmentFraction(age: number): number {
  if (age < 14) return 0.74;
  if (age < 22) return 0.78 + ((age - 14) / 8) * 0.22;
  if (age <= 33) return 1.0;
  return Math.max(0.82, 1.0 - (age - 33) * 0.012);
}

export function cohortNorm(metric: BenchmarkMetric, cohort: Cohort): Norm {
  const base = BASE[metric];
  let mean = base.mean + base.sd * (sportShift(metric, cohort.sport) + sexShift(metric, cohort.sex));
  if (matures(metric)) mean *= developmentFraction(cohort.age);
  return { mean, sd: base.sd };
}

export function benchmarkMetric(metric: BenchmarkMetric, value: number, cohort: Cohort): MetricBenchmark {
  const norm = cohortNorm(metric, cohort);
  const percentile = percentileFromZ((value - norm.mean) / norm.sd);

  let potentialPercentile = percentile;
  if (matures(metric) && cohort.age < 22) {
    const projected = value / developmentFraction(cohort.age); // value at maturity
    const adult = cohortNorm(metric, { ...cohort, age: 26 });
    potentialPercentile = percentileFromZ((projected - adult.mean) / adult.sd);
  }

  return { metric, value, percentile, cohortMean: Math.round(norm.mean * 100) / 100, potentialPercentile };
}
