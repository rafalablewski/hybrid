import { describe, it, expect } from "vitest";
import {
  computePerformanceIndex,
  vo2FromPace,
  ageFactor,
  bodyCompScore,
  compositeSd,
  compositeMean,
  normalMoments,
  REFERENCE_PI,
  COMPONENT_MOMENTS,
  type PerformanceInput,
} from "./performance-index";
import { normalCdf } from "../benchmarks";

const base: PerformanceInput = {
  age: 30,
  sex: "M",
  heightCm: 180,
  weightKg: 80,
  bodyFatPct: 15,
  bench1RM: 100,
  squat1RM: 140,
  deadlift1RM: 170,
  avgPaceMinPerKm: 5,
  weeklyDistanceKm: 30,
  experienceYears: 4,
  sessionsPerWeek: 4,
};

describe("performance-index — corrected & calibrated spec", () => {
  it("produces an index, percentile, band and athletic age", () => {
    const r = computePerformanceIndex(base);
    expect(r.performanceIndex.value).toBeGreaterThanOrEqual(0);
    expect(r.performanceIndex.value).toBeLessThanOrEqual(1000);
    expect(r.fitnessLevel).toBeGreaterThanOrEqual(0);
    expect(r.fitnessLevel).toBeLessThanOrEqual(100);
    expect(r.athleticAge).toBeGreaterThanOrEqual(18);
    expect(r.athleticAge).toBeLessThanOrEqual(80);
  });

  // fix #1/#2 — the composite SD is DERIVED (not the single-metric 15) and the
  // reference distribution is internally consistent.
  it("uses a derived composite SD, not 15", () => {
    expect(compositeSd("M")).toBeLessThan(15);
    expect(compositeSd("M")).toBeGreaterThan(0);
    expect(REFERENCE_PI.M.sd).toBeCloseTo(compositeSd("M"), 6);
    expect(REFERENCE_PI.M.mean).toBeCloseTo(compositeMean("M"), 6);
  });

  // the quadrature is correct: identity over a normal returns the mean & sd
  it("normalMoments integrates correctly (identity → input moments)", () => {
    const r = normalMoments((x) => x, { mean: 10, sd: 3 });
    expect(r.mean).toBeCloseTo(10, 2);
    expect(r.sd).toBeCloseTo(3, 2);
    // strength score moments: ~N(50, ~15) before clamping
    expect(COMPONENT_MOMENTS.M.strength.mean).toBeCloseTo(50, 1);
    expect(COMPONENT_MOMENTS.M.strength.sd).toBeGreaterThan(13);
    expect(COMPONENT_MOMENTS.M.strength.sd).toBeLessThanOrEqual(15);
  });

  it("an elite athlete reads far above the median (not compressed toward 50)", () => {
    const elite = computePerformanceIndex({
      ...base,
      bench1RM: 160,
      squat1RM: 230,
      deadlift1RM: 280,
      avgPaceMinPerKm: 3.3,
      bodyFatPct: 8,
      experienceYears: 12,
      sessionsPerWeek: 6,
    });
    expect(elite.fitnessLevel).toBeGreaterThan(90);
    expect(elite.band).toBe("elite");
  });

  it("a clearly sub-par athlete reads below the median", () => {
    const weak = computePerformanceIndex({
      ...base,
      bench1RM: 50,
      squat1RM: 70,
      deadlift1RM: 90,
      avgPaceMinPerKm: 8,
      bodyFatPct: 30,
      experienceYears: 0.5,
      sessionsPerWeek: 1,
    });
    expect(weak.fitnessLevel).toBeLessThan(40);
  });

  // fix #3 — internally-consistent VO₂ equation (−4.60 intercept)
  it("VO2 from pace uses the consistent intercept", () => {
    expect(vo2FromPace(5)).toBeCloseTo(36.01, 1);
  });

  // fix #5 — sex-specific norms: same lifts read higher for a female athlete
  it("applies sex-specific norms", () => {
    const male = computePerformanceIndex({ ...base, sex: "M" });
    const female = computePerformanceIndex({ ...base, sex: "F" });
    expect(female.components.strength).toBeGreaterThan(male.components.strength);
  });

  // fix #7 — asymmetric age
  it("age factor is flat before the peak, declines after", () => {
    expect(ageFactor(22, 30)).toBe(1);
    expect(ageFactor(30, 30)).toBe(1);
    expect(ageFactor(45, 30)).toBeLessThan(1);
    expect(ageFactor(45, 30)).toBeLessThan(ageFactor(38, 30));
  });

  // fix #8 — asymmetric body composition
  it("body-comp penalises over-fat more than equally-lean", () => {
    expect(bodyCompScore(2, 12)).toBeGreaterThan(bodyCompScore(22, 12));
    expect(bodyCompScore(12, 12)).toBe(100);
  });

  // fix #9 — athletic age
  it("a stronger athlete has a younger athletic age", () => {
    const strong = computePerformanceIndex({ ...base, squat1RM: 240, deadlift1RM: 290, bench1RM: 165 });
    const weak = computePerformanceIndex({ ...base, squat1RM: 90, deadlift1RM: 110, bench1RM: 60 });
    expect(strong.athleticAge).toBeLessThan(weak.athleticAge);
  });

  // fix #11 — confidence is the observed weight fraction; the interval is the
  // imputation variance (zero when fully specified, positive when inputs missing)
  it("confidence = observed weight; missing inputs widen the interval", () => {
    const sparse = computePerformanceIndex({
      age: 30,
      sex: "M",
      heightCm: 180,
      weightKg: 80,
      experienceYears: 4,
      sessionsPerWeek: 4,
    });
    const full = computePerformanceIndex(base);
    expect(full.confidence).toBe(1);
    expect(sparse.confidence).toBeCloseTo(0.25, 6); // only consistency+experience+ageFactor
    const wFull = full.performanceIndex.high - full.performanceIndex.low;
    const wSparse = sparse.performanceIndex.high - sparse.performanceIndex.low;
    expect(wFull).toBe(0); // fully specified → no imputation uncertainty
    expect(wSparse).toBeGreaterThan(0);
  });

  // fix #12 — EWMA ACWR
  it("computes EWMA ACWR when a load array is supplied", () => {
    const steady = computePerformanceIndex({ ...base, dailyLoad28: new Array(28).fill(100) });
    expect(steady.acwr).not.toBeNull();
    expect(steady.acwr!.value).toBeCloseTo(1, 1);
    expect(steady.acwr!.zone).toBe("optimal");

    const spike = [...new Array(21).fill(50), ...new Array(7).fill(200)];
    expect(computePerformanceIndex({ ...base, dailyLoad28: spike }).acwr!.value).toBeGreaterThan(1.3);

    expect(computePerformanceIndex(base).acwr).toBeNull();
  });

  it("normalCdf is sane", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 3);
    expect(normalCdf(3)).toBeGreaterThan(0.99);
    expect(normalCdf(-3)).toBeLessThan(0.01);
  });
});
