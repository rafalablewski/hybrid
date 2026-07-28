import { describe, expect, it } from "vitest";
import {
  EXPERIENCE_STIMULUS,
  EXPERIENCE_RECOVERY,
  SLEEP_RECOVERY,
  STRESS_RECOVERY,
  AGE_REF_YEARS,
  RECOVERY_BOUNDS,
  personalizeLandmarks,
} from "./landmark-profile";
import { BODYWEIGHT_REF_KG, REFERENCE_BMI, VOLUME_PROFILE_FIELDS, frameAdjustedMassKg } from "./athlete-profile";
import { STRENGTH_STANDARDS, estimateFitnessLevel } from "./fitness-level";
import { VOLUME_LANDMARKS } from "./landmarks";
import { blockWeeks, targetSetsForWeek } from "./volume-block";
import {
  RESIDUAL_FLOOR,
  RESIDUAL_TAU_H,
  MAX_COST,
  COST_HIGH,
  MIN_STRAIN_FATIGUE,
  RECALL_FROM_H,
  RECALL_TAU_H,
  WEIGHT_FLOOR,
  expectedResidual,
  feelReading,
} from "../feel-timing";
import { sorenessFromCheckin } from "../checkin-scales";
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

  it("landmark multipliers track the live ones (drift guard)", () => {
    const stim = ENGINE_FORMULAS.find((f) => f.id === "landmark-stimulus")!;
    expect(stim.constants.find((c) => c.symbol === "beginner")!.value).toBe(String(EXPERIENCE_STIMULUS.beginner));
    expect(stim.constants.find((c) => c.symbol === "advanced")!.value).toBe(String(EXPERIENCE_STIMULUS.advanced));

    const rec = ENGINE_FORMULAS.find((f) => f.id === "landmark-recovery")!;
    expect(rec.expression).toContain(String(RECOVERY_BOUNDS[0]));
    expect(rec.expression).toContain(String(RECOVERY_BOUNDS[1]));
    expect(rec.constants.find((c) => c.symbol === "age")!.value).toContain(String(AGE_REF_YEARS));
    expect(rec.constants.find((c) => c.symbol === "body mass")!.value).toContain(String(BODYWEIGHT_REF_KG));
    expect(rec.constants.find((c) => c.symbol === "sleep 1–5")!.value).toBe(SLEEP_RECOVERY.slice(1).join(" / "));
    expect(rec.constants.find((c) => c.symbol === "stress 1–5")!.value).toBe(STRESS_RECOVERY.slice(1).join(" / "));
  });

  it("landmark stimulus/recovery formulas reproduce the live engine (drift guard)", () => {
    // The sheet claims mev' = round(mev × stimulus) and mrv' = round(mrv × recovery).
    const p = personalizeLandmarks({ experience: "advanced" });
    expect(p.stimulus).toBe(EXPERIENCE_STIMULUS.advanced);
    expect(p.recovery).toBe(EXPERIENCE_RECOVERY.advanced);
    // Every muscle, not one — Back's 10 × 1.15 = 11.5 is the case that tells
    // round from floor, and a sheet that says "round" must mean it.
    for (const [m, d] of Object.entries(VOLUME_LANDMARKS)) {
      const got = p.landmarks[m as keyof typeof VOLUME_LANDMARKS];
      expect(got.mev).toBe(Math.round(d.mev * p.stimulus));
      expect(got.mrv).toBe(Math.round(d.mrv * p.recovery));
    }
  });

  it("the block-ramp formula reproduces the live engine (drift guard)", () => {
    const l = VOLUME_LANDMARKS.back;
    const weeks = blockWeeks({ week: 1, weeks: 4 });
    // Week 1 = MEV, last load week = top of MAV, deload = MV — as the sheet says.
    expect(targetSetsForWeek(l, weeks[0]!)).toBe(l.mev);
    expect(targetSetsForWeek(l, weeks[2]!)).toBe(l.mavHigh);
    expect(targetSetsForWeek(l, weeks[3]!)).toBe(l.mv);
    // …and the interpolation in between is the documented one.
    const w = weeks[1]!;
    expect(targetSetsForWeek(l, w)).toBe(Math.round(l.mev + (l.mavHigh - l.mev) * w.ramp));
  });

  it("feel-timing constants track the live ones (drift guard)", () => {
    const res = ENGINE_FORMULAS.find((f) => f.id === "feel-residual")!;
    expect(res.expression).toContain(String(RESIDUAL_FLOOR));
    expect(res.expression).toContain(String(RESIDUAL_TAU_H));

    const cost = ENGINE_FORMULAS.find((f) => f.id === "feel-cost")!;
    expect(cost.expression).toContain(String(MAX_COST));
    expect(cost.constants.find((c) => c.symbol === String(COST_HIGH))).toBeTruthy();
    expect(cost.constants.find((c) => c.symbol === String(MIN_STRAIN_FATIGUE))).toBeTruthy();

    const weight = ENGINE_FORMULAS.find((f) => f.id === "feel-weight")!;
    expect(weight.expression).toContain(String(RECALL_FROM_H));
    expect(weight.expression).toContain(String(RECALL_TAU_H));
    expect(weight.expression).toContain(String(WEIGHT_FLOOR));
  });

  it("the feel-timing formulas reproduce the live engine (drift guard)", () => {
    for (const h of [0, 1, 6, 10, 24]) {
      expect(expectedResidual(h)).toBeCloseTo(RESIDUAL_FLOOR + (1 - RESIDUAL_FLOOR) * Math.exp(-h / RESIDUAL_TAU_H), 10);
      const r = feelReading(4, h)!;
      expect(r.cost).toBeCloseTo(Math.min(MAX_COST, ((4 - 1) / 4) / expectedResidual(h)), 2);
    }
  });

  it("the level thresholds track the live standards (drift guard)", () => {
    const f = ENGINE_FORMULAS.find((x) => x.id === "level-ratio")!;
    for (const key of ["Back Squat", "Deadlift", "Bench Press"]) {
      const std = STRENGTH_STANDARDS.find((s) => s.key === key)!;
      expect(f.constants.find((c) => c.symbol === key)!.value).toBe(std.ratios.join(" / "));
    }
  });

  it("the level formula reproduces the live engine (drift guard)", () => {
    // The sheet says ratio = bestE1rm / bodyMass, compared to the entry ratios.
    const squat = STRENGTH_STANDARDS.find((s) => s.key === "Back Squat")!;
    const bw = 100;
    const at = (ratio: number) => estimateFitnessLevel(
      [{ id: "x", title: "S", startedAt: new Date().toISOString(),
         blocks: [{ kind: "strength" as const, name: "Back Squat", sets: [{ load: String(ratio * bw), reps: "1" }] }] }],
      { bodyweightKg: bw, ageYears: 28, sex: "M" },
    );
    // Just under the intermediate entry is novice; just over it is intermediate.
    expect(at(squat.ratios[1]! - 0.05).level).toBe("novice");
    expect(at(squat.ratios[1]! + 0.05).level).toBe("intermediate");
    expect(at(squat.ratios[3]! + 0.05).level).toBe("elite");
  });

  it("the frame-adjustment formula reproduces the live engine (drift guard)", () => {
    const f = ENGINE_FORMULAS.find((x) => x.id === "landmark-frame")!;
    expect(f.expression).toContain(String(REFERENCE_BMI));
    expect(f.expression).toContain(String(BODYWEIGHT_REF_KG));
    // A CONCRETE outcome, not the formula restated: deriving both sides from
    // the same constant would pass no matter what the constant became.
    // 95 kg at 195 cm reads as ~82 kg of frame-adjusted mass at REFERENCE_BMI
    // 24.5; move the reference and this number moves with it.
    expect(frameAdjustedMassKg(95, 195)).toBeCloseTo(81.5, 1);
    expect(frameAdjustedMassKg(95, 170)).toBeCloseTo(107.3, 1);
    // …and the identity case: a body at exactly the reference build reads as
    // exactly the reference mass.
    const refHeight = Math.sqrt(BODYWEIGHT_REF_KG / REFERENCE_BMI) * 100;
    expect(frameAdjustedMassKg(BODYWEIGHT_REF_KG, refHeight)).toBeCloseTo(BODYWEIGHT_REF_KG, 0);
  });

  it("the completeness weights on the sheet are the live ones (drift guard)", () => {
    const f = ENGINE_FORMULAS.find((x) => x.id === "profile-completeness")!;
    for (const c of f.constants) {
      const field = VOLUME_PROFILE_FIELDS.find((x) => x.key === c.symbol)!;
      expect(c.value).toBe(String(field.weight));
    }
    // …and they remain a distribution, not arbitrary numbers.
    expect(VOLUME_PROFILE_FIELDS.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 2);
  });

  it("the soreness-polarity note matches the live conversion (drift guard)", () => {
    const f = ENGINE_FORMULAS.find((f) => f.id === "landmark-freshness")!;
    expect(f.expression).toBe("soreness = 6 − storedValue");
    // The sheet says 5 stored = fresh = least sore. If a writer ever flips, this
    // and checkin-scales.test.ts both fail rather than the model silently
    // inverting again.
    expect(sorenessFromCheckin(5)).toBe(1);
    expect(sorenessFromCheckin(1)).toBe(5);
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
