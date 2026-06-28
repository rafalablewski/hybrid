import { describe, it, expect } from "vitest";
import {
  computePerformanceIndex,
  vo2FromPace,
  ageFactor,
  bodyCompScore,
  compositeSd,
  REFERENCE_PI,
  REFERENCE_ATHLETE,
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

describe("performance-index — corrected spec", () => {
  it("produces an index, percentile, band and athletic age", () => {
    const r = computePerformanceIndex(base);
    expect(r.performanceIndex.value).toBeGreaterThanOrEqual(0);
    expect(r.performanceIndex.value).toBeLessThanOrEqual(1000);
    expect(r.fitnessLevel).toBeGreaterThanOrEqual(0);
    expect(r.fitnessLevel).toBeLessThanOrEqual(100);
    expect(r.athleticAge).toBeGreaterThanOrEqual(18);
    expect(r.athleticAge).toBeLessThanOrEqual(80);
  });

  // fix #1/#2 — the composite SD must NOT be the single-metric 15, and the
  // reference athlete must land near the 50th percentile.
  it("uses a calibrated composite SD, not 15", () => {
    expect(compositeSd()).toBeLessThan(15);
    expect(REFERENCE_PI.sd).toBeCloseTo(compositeSd(), 6);
  });

  it("the reference athlete sits near the 50th percentile", () => {
    const r = computePerformanceIndex(REFERENCE_ATHLETE);
    expect(r.fitnessLevel).toBeGreaterThan(45);
    expect(r.fitnessLevel).toBeLessThan(55);
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
    // with the old (÷15) bug this would have been stuck ~70; calibrated it clears 90
    expect(elite.fitnessLevel).toBeGreaterThan(90);
    expect(elite.band).toBe("elite");
  });

  // fix #3 — internally-consistent VO₂ equation (−4.60 intercept)
  it("VO2 from pace uses the consistent intercept", () => {
    // 5:00/km → v=200 m/min → 0.182258·200 + 0.000104·200² − 4.60 ≈ 36.0
    expect(vo2FromPace(5)).toBeCloseTo(36.01, 1);
  });

  // fix #5 — sex-specific norms: same lifts read higher for a female athlete
  it("applies sex-specific norms", () => {
    const male = computePerformanceIndex({ ...base, sex: "M" });
    const female = computePerformanceIndex({ ...base, sex: "F" });
    expect(female.components.strength).toBeGreaterThan(male.components.strength);
  });

  // fix #7 — asymmetric age: youth not penalised like equivalent post-peak age
  it("age factor is flat before the peak, declines after", () => {
    expect(ageFactor(22, 30)).toBe(1); // before peak
    expect(ageFactor(30, 30)).toBe(1); // at peak
    expect(ageFactor(45, 30)).toBeLessThan(1); // after peak
    expect(ageFactor(45, 30)).toBeLessThan(ageFactor(38, 30));
  });

  // fix #8 — asymmetric body composition (over-fat costs more than lean)
  it("body-comp penalises over-fat more than equally-lean", () => {
    const over = bodyCompScore(22, 12); // +10
    const lean = bodyCompScore(2, 12); // −10
    expect(lean).toBeGreaterThan(over);
    expect(bodyCompScore(12, 12)).toBe(100);
  });

  // fix #9 — athletic age tracks performance and inverts the age curve
  it("a stronger athlete has a younger athletic age", () => {
    const strong = computePerformanceIndex({ ...base, squat1RM: 240, deadlift1RM: 290, bench1RM: 165 });
    const weak = computePerformanceIndex({ ...base, squat1RM: 90, deadlift1RM: 110, bench1RM: 60 });
    expect(strong.athleticAge).toBeLessThan(weak.athleticAge);
  });

  // fix #11 — confidence + interval from input completeness
  it("more inputs raise confidence and narrow the interval", () => {
    const sparse = computePerformanceIndex({
      age: 30,
      sex: "M",
      heightCm: 180,
      weightKg: 80,
      experienceYears: 4,
      sessionsPerWeek: 4,
    });
    const full = computePerformanceIndex(base);
    expect(full.confidence).toBeGreaterThan(sparse.confidence);
    const wFull = full.performanceIndex.high - full.performanceIndex.low;
    const wSparse = sparse.performanceIndex.high - sparse.performanceIndex.low;
    expect(wFull).toBeLessThan(wSparse);
  });

  // fix #12 — EWMA ACWR from the 28-day load array
  it("computes EWMA ACWR when a load array is supplied", () => {
    const steady = computePerformanceIndex({ ...base, dailyLoad28: new Array(28).fill(100) });
    expect(steady.acwr).not.toBeNull();
    expect(steady.acwr!.value).toBeCloseTo(1, 1);
    expect(steady.acwr!.zone).toBe("optimal");

    const spike = [...new Array(21).fill(50), ...new Array(7).fill(200)];
    const r = computePerformanceIndex({ ...base, dailyLoad28: spike });
    expect(r.acwr!.value).toBeGreaterThan(1.3);

    const none = computePerformanceIndex(base);
    expect(none.acwr).toBeNull();
  });

  it("normalCdf is sane (0 → 0.5, large → ~1)", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 3);
    expect(normalCdf(3)).toBeGreaterThan(0.99);
    expect(normalCdf(-3)).toBeLessThan(0.01);
  });
});
