/**
 * Data network — the flywheel made concrete.
 *
 * Aggregates anonymized observations into cohort norms (with k-anonymity), and
 * REFITS the priors toward real data as it accumulates: benchmark norms shrink
 * from synthetic prior → observed, and the injury calibration re-fits on labeled
 * outcomes. This is the compounding moat — every athlete-day sharpens the models
 * for everyone. Pure stats; the API feeds it consented, de-identified data.
 */

import type { BenchmarkMetric, Norm, Sex } from "./benchmarks";

/** Minimum cohort size before an aggregate may be released (privacy). */
export const K_ANON = 5;

export interface Observation {
  sport: string;
  sex: Sex;
  age: number;
  metric: BenchmarkMetric;
  value: number;
}

export interface AggregateNorm {
  cohortKey: string;
  sport: string;
  sex: Sex;
  ageBand: string;
  metric: BenchmarkMetric;
  n: number;
  mean: number;
  sd: number;
  p10: number;
  p50: number;
  p90: number;
}

export function ageBand(age: number): string {
  if (age < 16) return "U16";
  if (age < 20) return "16-19";
  if (age < 30) return "20-29";
  if (age < 40) return "30-39";
  return "40+";
}

function cohortKey(sport: string, sex: Sex, band: string, metric: BenchmarkMetric): string {
  return `${sport}|${sex}|${band}|${metric}`;
}

/** Empirical percentile of `value` within an ascending-sorted sample (1..99). */
export function empiricalPercentile(value: number, sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 50;
  let below = 0;
  for (const v of sortedAsc) {
    if (v < value) below++;
    else break;
  }
  return Math.max(1, Math.min(99, Math.round((below / sortedAsc.length) * 100)));
}

function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(q * (sortedAsc.length - 1))));
  return sortedAsc[i]!;
}

export function fitNorm(values: number[]): { mean: number; sd: number; n: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, sd: 0, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, sd: Math.sqrt(variance), n };
}

/**
 * Shrink an observed norm toward the prior — the refit. With little data the
 * norm stays near the prior; as n grows it moves to the observed distribution.
 * `priorWeight` = pseudo-observations the prior is worth.
 */
export function shrinkNorm(
  observed: { mean: number; sd: number; n: number },
  prior: Norm,
  priorWeight = 20,
): Norm {
  const w = observed.n + priorWeight;
  return {
    mean: (observed.n * observed.mean + priorWeight * prior.mean) / w,
    sd: (observed.n * (observed.sd || prior.sd) + priorWeight * prior.sd) / w,
  };
}

/** Aggregate observations into per-cohort norms, suppressing sub-k cohorts. */
export function aggregate(obs: Observation[], minN = K_ANON): AggregateNorm[] {
  const groups = new Map<string, { sport: string; sex: Sex; band: string; metric: BenchmarkMetric; values: number[] }>();
  for (const o of obs) {
    const band = ageBand(o.age);
    const key = cohortKey(o.sport, o.sex, band, o.metric);
    if (!groups.has(key)) groups.set(key, { sport: o.sport, sex: o.sex, band, metric: o.metric, values: [] });
    groups.get(key)!.values.push(o.value);
  }
  const out: AggregateNorm[] = [];
  for (const [key, g] of groups) {
    if (g.values.length < minN) continue; // k-anonymity
    const sorted = [...g.values].sort((a, b) => a - b);
    const { mean, sd, n } = fitNorm(sorted);
    out.push({
      cohortKey: key,
      sport: g.sport,
      sex: g.sex,
      ageBand: g.band,
      metric: g.metric,
      n,
      mean: Math.round(mean * 100) / 100,
      sd: Math.round(sd * 100) / 100,
      p10: Math.round(quantile(sorted, 0.1) * 100) / 100,
      p50: Math.round(quantile(sorted, 0.5) * 100) / 100,
      p90: Math.round(quantile(sorted, 0.9) * 100) / 100,
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

export interface DatasetStats {
  observations: number;
  athletes: number;
  cohorts: number;
  releasableCohorts: number;
}

export function datasetStats(obs: Observation[], athletes: number, minN = K_ANON): DatasetStats {
  const counts = new Map<string, number>();
  for (const o of obs) {
    const key = cohortKey(o.sport, o.sex, ageBand(o.age), o.metric);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let releasable = 0;
  for (const c of counts.values()) if (c >= minN) releasable++;
  return { observations: obs.length, athletes, cohorts: counts.size, releasableCohorts: releasable };
}

// --- injury calibration refit (logistic regression on labeled outcomes) ---

export interface InjurySample {
  /** the heuristic risk score 0..100 at the time */
  score: number;
  injured: boolean;
}

/** Prior coefficients (must match injury.ts calibrateRisk). */
export const CALIBRATION_PRIOR = { intercept: -4.83, slope: 5.26 };

/**
 * Refit the logistic calibration (P(injury) = σ(a + b·score/100)) on labeled
 * outcomes via gradient descent, starting from the prior. Falls back to the
 * prior when there's too little signal. This is how the heuristic becomes a
 * trained model as the data network accumulates injuries.
 */
/** P(injury) under a given calibration — mirrors injury.ts calibrateRisk. */
function calProb(score: number, coeffs: { intercept: number; slope: number }): number {
  const x = Math.max(0, Math.min(100, score)) / 100;
  return 1 / (1 + Math.exp(-(coeffs.intercept + coeffs.slope * x)));
}

/**
 * Brier score of a calibration on labeled outcomes — mean squared error between
 * the predicted probability and what happened (0 = perfect, 0.25 = coin-flip on
 * a balanced set; LOWER is better). Null with no samples: no data, no verdict.
 */
export function brierScore(
  samples: InjurySample[],
  coeffs: { intercept: number; slope: number } = CALIBRATION_PRIOR,
): number | null {
  if (samples.length === 0) return null;
  let sum = 0;
  for (const s of samples) {
    const err = calProb(s.score, coeffs) - (s.injured ? 1 : 0);
    sum += err * err;
  }
  return sum / samples.length;
}

/**
 * ROC AUC of the risk SCORE on labeled outcomes — probability a random injured
 * sample outscores a random healthy one (0.5 = no signal, 1 = perfect ranking).
 * Coefficient-free: any monotone calibration preserves the ranking, so this
 * evaluates the heuristic itself. Rank-based (Mann–Whitney) with tie handling.
 * Null unless both classes are present.
 */
export function rocAuc(samples: InjurySample[]): number | null {
  const pos = samples.filter((s) => s.injured).length;
  const neg = samples.length - pos;
  if (pos === 0 || neg === 0) return null;
  const sorted = [...samples].sort((a, b) => a.score - b.score);
  // average ranks over ties
  const ranks = new Array<number>(sorted.length);
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]!.score === sorted[i]!.score) j++;
    const avg = (i + j) / 2 + 1; // 1-based average rank of the tie block
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }
  let posRankSum = 0;
  sorted.forEach((s, i) => {
    if (s.injured) posRankSum += ranks[i]!;
  });
  return (posRankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

export interface ReliabilityBucket {
  /** predicted-probability bin bounds */
  lo: number;
  hi: number;
  n: number;
  meanPredicted: number;
  observedRate: number;
}

/**
 * Reliability (calibration) diagram data: bin samples by their PREDICTED
 * p(injury) under `coeffs`, and report the observed injury rate per bin. A
 * well-calibrated model sits on the diagonal (predicted ≈ observed). Empty
 * bins are omitted.
 */
export function reliabilityBuckets(
  samples: InjurySample[],
  coeffs: { intercept: number; slope: number } = CALIBRATION_PRIOR,
  bins = 8,
): ReliabilityBucket[] {
  if (samples.length === 0 || bins < 1) return [];
  const pMin = calProb(0, coeffs);
  const pMax = calProb(100, coeffs);
  const width = (pMax - pMin) / bins || 1;
  const buckets = Array.from({ length: bins }, (_, i) => ({
    lo: pMin + i * width,
    hi: pMin + (i + 1) * width,
    n: 0,
    pSum: 0,
    injured: 0,
  }));
  for (const s of samples) {
    const p = calProb(s.score, coeffs);
    const i = Math.min(bins - 1, Math.max(0, Math.floor((p - pMin) / width)));
    const b = buckets[i]!;
    b.n++;
    b.pSum += p;
    if (s.injured) b.injured++;
  }
  return buckets
    .filter((b) => b.n > 0)
    .map((b) => ({
      lo: b.lo,
      hi: b.hi,
      n: b.n,
      meanPredicted: b.pSum / b.n,
      observedRate: b.injured / b.n,
    }));
}

export function refitCalibration(samples: InjurySample[], iters = 500, lr = 0.1): { intercept: number; slope: number; n: number } {
  if (samples.length < 30) return { ...CALIBRATION_PRIOR, n: samples.length };
  let a = CALIBRATION_PRIOR.intercept;
  let b = CALIBRATION_PRIOR.slope;
  const xs = samples.map((s) => s.score / 100);
  const ys = samples.map((s) => (s.injured ? 1 : 0));
  const n = samples.length;
  for (let it = 0; it < iters; it++) {
    let ga = 0;
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const p = 1 / (1 + Math.exp(-(a + b * xs[i]!)));
      const err = p - ys[i]!;
      ga += err;
      gb += err * xs[i]!;
    }
    a -= (lr * ga) / n;
    b -= (lr * gb) / n;
  }
  return { intercept: a, slope: b, n };
}
