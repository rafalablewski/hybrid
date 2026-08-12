import { describe, it, expect } from "vitest";
import {
  normalCdf,
  developmentFraction,
  cohortNorm,
  benchmarkMetric,
  BENCHMARK_MODEL_VERSION,
  type Cohort,
} from "./benchmarks";

describe("normalCdf", () => {
  it("is 0.5 at the mean and monotonic", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 2);
    expect(normalCdf(1)).toBeGreaterThan(normalCdf(0));
    expect(normalCdf(-1)).toBeLessThan(normalCdf(0));
    expect(normalCdf(1.645)).toBeCloseTo(0.95, 2);
  });
});

describe("developmentFraction", () => {
  it("rises from youth to a plateau at peak age", () => {
    expect(developmentFraction(14)).toBeLessThan(developmentFraction(18));
    expect(developmentFraction(18)).toBeLessThan(developmentFraction(26));
    expect(developmentFraction(26)).toBe(1);
    expect(developmentFraction(40)).toBeLessThan(1);
  });
});

describe("cohort norms", () => {
  const adultM = (sport: string): Cohort => ({ sport, sex: "M", age: 26 });

  it("strength sports raise the relative-strength norm", () => {
    expect(cohortNorm("relStrength", adultM("Powerlifting")).mean).toBeGreaterThan(
      cohortNorm("relStrength", adultM("Running")).mean,
    );
  });

  it("endurance sports raise the VO2 norm", () => {
    expect(cohortNorm("vo2", adultM("Triathlon")).mean).toBeGreaterThan(
      cohortNorm("vo2", adultM("Powerlifting")).mean,
    );
  });

  it("youth physical norms are lower than adult", () => {
    expect(cohortNorm("relStrength", { sport: "Hybrid", sex: "M", age: 15 }).mean).toBeLessThan(
      cohortNorm("relStrength", { sport: "Hybrid", sex: "M", age: 26 }).mean,
    );
  });
});

describe("benchmarkMetric", () => {
  it("an average value sits near the 50th percentile", () => {
    const cohort: Cohort = { sport: "Hybrid", sex: "M", age: 26 };
    const norm = cohortNorm("vo2", cohort);
    expect(benchmarkMetric("vo2", norm.mean, cohort).percentile).toBeGreaterThanOrEqual(48);
    expect(benchmarkMetric("vo2", norm.mean, cohort).percentile).toBeLessThanOrEqual(52);
  });

  it("a youth at the adult median reads exceptional POTENTIAL", () => {
    const youth: Cohort = { sport: "Hybrid", sex: "M", age: 15 };
    const adultMedian = cohortNorm("relStrength", { ...youth, age: 26 }).mean;
    const b = benchmarkMetric("relStrength", adultMedian, youth);
    // already at adult-median while young → well above their own cohort, and
    // projecting to maturity lifts the potential percentile higher still
    expect(b.percentile).toBeGreaterThan(65);
    expect(b.potentialPercentile).toBeGreaterThan(b.percentile);
    expect(b.potentialPercentile).toBeGreaterThan(75);
  });

  it("non-maturing metrics don't get a potential boost", () => {
    const youth: Cohort = { sport: "Hybrid", sex: "M", age: 15 };
    const b = benchmarkMetric("hpi", 70, youth);
    expect(b.potentialPercentile).toBe(b.percentile);
  });
});
