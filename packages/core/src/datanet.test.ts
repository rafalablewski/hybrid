import { describe, it, expect } from "vitest";
import {
  ageBand,
  empiricalPercentile,
  fitNorm,
  shrinkNorm,
  aggregate,
  datasetStats,
  refitCalibration,
  CALIBRATION_PRIOR,
  K_ANON,
  type Observation,
  type InjurySample,
} from "./datanet";

describe("ageBand", () => {
  it("buckets ages", () => {
    expect(ageBand(14)).toBe("U16");
    expect(ageBand(18)).toBe("16-19");
    expect(ageBand(25)).toBe("20-29");
    expect(ageBand(45)).toBe("40+");
  });
});

describe("empiricalPercentile", () => {
  it("ranks within a sample", () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(empiricalPercentile(5.5, s)).toBeCloseTo(50, 0);
    expect(empiricalPercentile(0, s)).toBe(1);
    expect(empiricalPercentile(100, s)).toBe(99);
  });
});

describe("fitNorm + shrinkNorm", () => {
  it("fits mean/sd", () => {
    const f = fitNorm([2, 4, 6]);
    expect(f.mean).toBeCloseTo(4, 5);
    expect(f.sd).toBeGreaterThan(0);
    expect(f.n).toBe(3);
  });

  it("shrinks toward the prior when data is thin, toward data when thick", () => {
    const prior = { mean: 1.4, sd: 0.45 };
    const thin = shrinkNorm({ mean: 2.0, sd: 0.3, n: 2 }, prior);
    const thick = shrinkNorm({ mean: 2.0, sd: 0.3, n: 400 }, prior);
    expect(thin.mean).toBeLessThan(thick.mean); // thin stays nearer prior (1.4)
    expect(thick.mean).toBeGreaterThan(1.9); // thick ≈ observed (2.0)
    expect(thin.mean).toBeGreaterThan(prior.mean);
  });
});

describe("aggregate (k-anonymity)", () => {
  const make = (sport: string, n: number, base: number): Observation[] =>
    Array.from({ length: n }, (_, i) => ({ sport, sex: "M" as const, age: 25, metric: "vo2" as const, value: base + i }));

  it("suppresses cohorts smaller than K_ANON", () => {
    const obs = [...make("Running", K_ANON, 40), ...make("Cycling", K_ANON - 1, 40)];
    const agg = aggregate(obs);
    expect(agg.find((a) => a.sport === "Running")).toBeDefined();
    expect(agg.find((a) => a.sport === "Cycling")).toBeUndefined();
  });

  it("computes mean + percentile breakpoints for releasable cohorts", () => {
    const agg = aggregate(make("Running", 11, 40));
    const r = agg[0]!;
    expect(r.n).toBe(11);
    expect(r.p10).toBeLessThan(r.p50);
    expect(r.p50).toBeLessThan(r.p90);
    expect(r.ageBand).toBe("20-29");
  });
});

describe("datasetStats", () => {
  it("counts observations, cohorts, and releasable cohorts", () => {
    const obs: Observation[] = [
      ...Array.from({ length: 6 }, () => ({ sport: "Hyrox", sex: "M" as const, age: 25, metric: "hpi" as const, value: 70 })),
      { sport: "Hyrox", sex: "F", age: 25, metric: "hpi", value: 72 },
    ];
    const s = datasetStats(obs, 7);
    expect(s.observations).toBe(7);
    expect(s.cohorts).toBe(2);
    expect(s.releasableCohorts).toBe(1); // only the n=6 cohort clears K_ANON
  });
});

describe("refitCalibration", () => {
  it("returns the prior when there's too little data", () => {
    const out = refitCalibration([{ score: 80, injured: true }]);
    expect(out.intercept).toBe(CALIBRATION_PRIOR.intercept);
    expect(out.slope).toBe(CALIBRATION_PRIOR.slope);
  });

  it("fits a positive slope on separable outcomes", () => {
    // high scores injured, low scores not
    const samples: InjurySample[] = [];
    for (let i = 0; i < 200; i++) {
      const score = i % 2 === 0 ? 20 : 85;
      samples.push({ score, injured: score > 50 });
    }
    const out = refitCalibration(samples);
    expect(out.n).toBe(200);
    expect(out.slope).toBeGreaterThan(0);
    // a high score should now map to a high probability
    const p = 1 / (1 + Math.exp(-(out.intercept + out.slope * 0.85)));
    expect(p).toBeGreaterThan(0.7);
  });
});
