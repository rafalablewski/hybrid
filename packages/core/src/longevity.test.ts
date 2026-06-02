import { describe, it, expect } from "vitest";
import { longevityReport, LONGEVITY_MODEL_VERSION } from "./longevity";

describe("longevityReport", () => {
  it("elite markers read younger than chronological age", () => {
    const r = longevityReport({ age: 40, restingHr: 48, hrv: 90, vo2: 55, sleepH: 8 });
    expect(r.bioAge).toBeLessThan(40);
    expect(r.delta).toBeLessThan(0);
    expect(r.healthspanScore).toBeGreaterThan(70);
    expect(r.flags).toHaveLength(0);
  });

  it("poor markers read older and raise flags", () => {
    const r = longevityReport({ age: 40, restingHr: 80, hrv: 25, vo2: 28, sleepH: 5 });
    expect(r.bioAge).toBeGreaterThan(40);
    expect(r.delta).toBeGreaterThan(0);
    expect(r.flags).toContain("elevated resting HR");
    expect(r.flags).toContain("low aerobic capacity");
    expect(r.flags).toContain("short sleep");
  });

  it("VO2 carries the most weight (strong longevity predictor)", () => {
    const base = longevityReport({ age: 35, vo2: 45 });
    const better = longevityReport({ age: 35, vo2: 60 });
    expect(better.bioAge).toBeLessThan(base.bioAge);
    const vo2Contrib = better.contributions.find((c) => c.marker === "VO₂")!;
    expect(vo2Contrib.deltaYears).toBeLessThan(0);
  });

  it("works with partial markers and clamps to sane bounds", () => {
    const r = longevityReport({ age: 30, restingHr: 58 });
    expect(r.contributions).toHaveLength(1);
    expect(r.bioAge).toBeGreaterThan(12);
    expect(r.healthspanScore).toBeGreaterThanOrEqual(1);
    expect(r.healthspanScore).toBeLessThanOrEqual(100);
    expect(r.modelVersion).toBe(LONGEVITY_MODEL_VERSION);
  });
});
