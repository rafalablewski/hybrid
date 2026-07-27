import { describe, expect, it } from "vitest";
import {
  computeEngineTrace,
  ENGINE_FORMULA_GROUPS,
  ENGINE_FORMULAS,
  logisticCurve,
  whatIfBio,
  whatIfLog,
} from "./engine-room";
import { calibrateRisk, computeInjuryRisk, PRIOR_COEFFS } from "./injury";
import { EFFORT_BIAS_MAX, EFFORT_BIAS_PRIOR_WEIGHT, EFFORT_TREND_MIN_DAYS, EFFORT_TREND_MIN_SAMPLES } from "./effort";
import { computeFatigue } from "./fatigue";
import { computeReadiness } from "./readiness";
import { enduranceFatigue } from "./hpi";
import { SAMPLE_BIOMETRICS, SAMPLE_TRAINING_LOG } from "./sample-data";
import { ALL_MUSCLES } from "./movements";

describe("ENGINE_FORMULAS", () => {
  it("has unique ids and only known engine groups", () => {
    const ids = ENGINE_FORMULAS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groups = new Set(ENGINE_FORMULA_GROUPS.map((g) => g.id));
    for (const f of ENGINE_FORMULAS) expect(groups.has(f.engine)).toBe(true);
  });

  it("every group has at least one formula", () => {
    for (const g of ENGINE_FORMULA_GROUPS)
      expect(ENGINE_FORMULAS.some((f) => f.engine === g.id)).toBe(true);
  });

  it("effort-model constants track the live ones (drift guard)", () => {
    const bias = ENGINE_FORMULAS.find((f) => f.id === "effort-bias")!;
    expect(bias.constants.find((c) => c.symbol === "w")!.value).toBe(String(EFFORT_BIAS_PRIOR_WEIGHT));
    expect(bias.expression).toContain(String(EFFORT_BIAS_MAX));
    const trend = ENGINE_FORMULAS.find((f) => f.id === "effort-trend")!;
    expect(trend.constants.find((c) => c.symbol === "n")!.value).toBe(String(EFFORT_TREND_MIN_SAMPLES));
    expect(trend.constants.find((c) => c.symbol === "d")!.value).toBe(`${EFFORT_TREND_MIN_DAYS} days`);
  });

  it("calibration constants track the live prior (drift guard)", () => {
    const cal = ENGINE_FORMULAS.find((f) => f.id === "calibration")!;
    expect(cal.constants.find((c) => c.symbol === "a")!.value).toBe(String(PRIOR_COEFFS.intercept));
    expect(cal.constants.find((c) => c.symbol === "b")!.value).toBe(String(PRIOR_COEFFS.slope));
  });

  it("readiness formula reproduces the live engine (drift guard)", () => {
    const fatigue = computeFatigue(SAMPLE_TRAINING_LOG);
    const vals = Object.values(fatigue.muscles);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const formula = Math.max(35, Math.min(98, Math.round(100 - avg * 0.7)));
    expect(computeReadiness(fatigue).score).toBe(formula);
  });

  it("endurance formula reproduces the live engine (drift guard)", () => {
    const fatigue = computeFatigue(SAMPLE_TRAINING_LOG);
    const total = fatigue.systems.anaerobic + fatigue.systems.threshold + fatigue.systems.aerobic;
    expect(enduranceFatigue(fatigue)).toBe(Math.round(100 * (1 - Math.exp(-total / 90))));
  });
});

describe("logisticCurve", () => {
  it("samples the calibration monotonically from 0 to 100", () => {
    const pts = logisticCurve(PRIOR_COEFFS, 20);
    expect(pts).toHaveLength(21);
    expect(pts[0]!.score).toBe(0);
    expect(pts[20]!.score).toBe(100);
    expect(pts[0]!.p).toBeCloseTo(calibrateRisk(0), 10);
    expect(pts[20]!.p).toBeCloseTo(calibrateRisk(100), 10);
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.p).toBeGreaterThan(pts[i - 1]!.p);
  });
});

describe("whatIfLog", () => {
  it("is identity at 100%", () => {
    expect(whatIfLog(SAMPLE_TRAINING_LOG, 100)).toBe(SAMPLE_TRAINING_LOG);
  });

  it("scales sets and minutes of recent sessions only, without mutating", () => {
    const scaled = whatIfLog(SAMPLE_TRAINING_LOG, 50, 7);
    const recent = scaled.find((s) => s.daysAgo === 1)!;
    const original = SAMPLE_TRAINING_LOG.find((s) => s.daysAgo === 1)!;
    expect(recent.items[0]!.hardSets).toBe(original.items[0]!.hardSets! / 2);
    expect(recent.items[1]!.minutes).toBe(original.items[1]!.minutes! / 2);
    // beyond the window: untouched
    const old = scaled.find((s) => s.daysAgo === 9)!;
    expect(old.items[0]!.hardSets).toBe(SAMPLE_TRAINING_LOG.find((s) => s.daysAgo === 9)!.items[0]!.hardSets);
    // source log unchanged
    expect(SAMPLE_TRAINING_LOG.find((s) => s.daysAgo === 1)!.items[0]!.hardSets).toBe(original.items[0]!.hardSets);
  });

  it("halving recent load lowers injury risk (or leaves it equal)", () => {
    const base = computeInjuryRisk(SAMPLE_TRAINING_LOG);
    const eased = computeInjuryRisk(whatIfLog(SAMPLE_TRAINING_LOG, 50));
    expect(eased.overall).toBeLessThanOrEqual(base.overall);
  });
});

describe("whatIfBio", () => {
  it("overrides today only, keeping the baseline", () => {
    const out = whatIfBio(SAMPLE_BIOMETRICS, { hrv: 40 })!;
    expect(out.hrv.today).toBe(40);
    expect(out.hrv.baseline).toBe(SAMPLE_BIOMETRICS.hrv.baseline);
    expect(out.sleep).toEqual(SAMPLE_BIOMETRICS.sleep);
  });

  it("passes undefined through", () => {
    expect(whatIfBio(undefined, { hrv: 40 })).toBeUndefined();
  });
});

describe("computeEngineTrace", () => {
  it("materializes the full stack for the sample athlete", () => {
    const t = computeEngineTrace(SAMPLE_TRAINING_LOG, SAMPLE_BIOMETRICS);
    expect(t.trajectory).toHaveLength(14);
    expect(t.injury.tissues).toHaveLength(ALL_MUSCLES.length);
    for (let i = 1; i < t.injury.tissues.length; i++)
      expect(t.injury.tissues[i]!.risk).toBeLessThanOrEqual(t.injury.tissues[i - 1]!.risk);
    expect(t.enduranceFatigue).toBeGreaterThanOrEqual(0);
    expect(t.enduranceFatigue).toBeLessThanOrEqual(100);
    expect(t.state.hpi.score).toBeGreaterThanOrEqual(0);
    expect(t.state.summary).toContain("HPI");
  });

  it("what-if composition: suppressed HRV raises risk, eased load lowers it", () => {
    const base = computeEngineTrace(SAMPLE_TRAINING_LOG, SAMPLE_BIOMETRICS);
    const crashed = computeEngineTrace(
      SAMPLE_TRAINING_LOG,
      whatIfBio(SAMPLE_BIOMETRICS, { hrv: 40, sleep: 5 }),
    );
    expect(crashed.injury.overall).toBeGreaterThanOrEqual(base.injury.overall);
    expect(crashed.state.readiness.score).toBeLessThanOrEqual(base.state.readiness.score);
    const eased = computeEngineTrace(whatIfLog(SAMPLE_TRAINING_LOG, 40), SAMPLE_BIOMETRICS);
    expect(eased.injury.overall).toBeLessThanOrEqual(base.injury.overall);
  });
});
