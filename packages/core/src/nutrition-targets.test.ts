import { describe, expect, it } from "vitest";
import {
  TARGET_LIMITS,
  cleanTargetField,
  cleanTargetOverride,
  hasOverride,
  resolveTargets,
  targetMismatch,
} from "./nutrition-targets";
import type { MacroTargets } from "./engines/nutrition";

// A coherent adaptive base: 180×4 + 260×4 + 78×9 = 2 462 ≈ 2 460.
const base: MacroTargets = {
  kcal: 2_460, protein: 180, carbs: 260, fat: 78,
  maintenance: 2_460, goal: "maintain", basis: "test", trainingKcal: 0,
};

describe("hasOverride", () => {
  it("is false for nothing, null, or a fuel flag alone", () => {
    expect(hasOverride(null)).toBe(false);
    expect(hasOverride({})).toBe(false);
    expect(hasOverride({ trainingFuel: false })).toBe(false);
  });

  it("is true once any field is set", () => {
    expect(hasOverride({ protein: 200 })).toBe(true);
  });
});

describe("cleanTargetField", () => {
  it("rounds and accepts a decimal comma", () => {
    expect(cleanTargetField("protein", "180,4")).toBe(180);
    expect(cleanTargetField("kcal", 2460.7)).toBe(2461);
  });

  it("nulls anything that is not a usable number", () => {
    expect(cleanTargetField("protein", "")).toBeNull();
    expect(cleanTargetField("protein", "abc")).toBeNull();
    expect(cleanTargetField("protein", 0)).toBeNull();
    expect(cleanTargetField("protein", -20)).toBeNull();
  });

  it("clamps a typo rather than rendering nonsense", () => {
    expect(cleanTargetField("carbs", 2_500)).toBe(TARGET_LIMITS.carbs.max);
    expect(cleanTargetField("kcal", 100)).toBe(TARGET_LIMITS.kcal.min);
  });
});

describe("cleanTargetOverride", () => {
  it("keeps only the fields that carry a usable number", () => {
    const ov = cleanTargetOverride({ kcal: "2000", protein: "", carbs: null, fat: "70" });
    expect(ov.kcal).toBe(2_000);
    expect(ov.fat).toBe(70);
    expect(ov.protein).toBeUndefined();
    expect(ov.carbs).toBeUndefined();
  });

  it("defaults the training-fuel bump ON", () => {
    expect(cleanTargetOverride({ kcal: 2_000 }).trainingFuel).toBe(true);
    expect(cleanTargetOverride({ kcal: 2_000, trainingFuel: false }).trainingFuel).toBe(false);
  });

  it("survives junk", () => {
    expect(cleanTargetOverride(null)).toEqual({ trainingFuel: true });
    expect(cleanTargetOverride("nope")).toEqual({ trainingFuel: true });
  });
});

describe("resolveTargets — no override", () => {
  it("returns the engine's own numbers", () => {
    const r = resolveTargets(base, null);
    expect(r.kcal).toBe(2_460);
    expect(r.overridden).toEqual([]);
  });

  it("adds the training bump to energy and to the carbs that carry it", () => {
    const r = resolveTargets(base, null, 400);
    expect(r.kcal).toBe(2_860);
    expect(r.carbs).toBe(360); // 260 + 400/4
    expect(r.trainingKcal).toBe(400);
  });

  it("ignores a negative or absent bump", () => {
    expect(resolveTargets(base, null, -100).kcal).toBe(2_460);
    expect(resolveTargets(base, null).trainingKcal).toBe(0);
  });
});

describe("resolveTargets — the override is per field", () => {
  it("takes an overridden field exactly as typed", () => {
    const r = resolveTargets(base, { protein: 200 });
    expect(r.protein).toBe(200);
    expect(r.overridden).toEqual(["protein"]);
  });

  it("leaves an untouched field EXACTLY as the engine computed it", () => {
    // The whole design: overriding protein does not rescale calories to fit.
    const r = resolveTargets(base, { protein: 200 });
    expect(r.kcal).toBe(2_460);
    expect(r.carbs).toBe(260);
    expect(r.fat).toBe(78);
  });

  it("reports every field the athlete set", () => {
    const r = resolveTargets(base, { kcal: 2_000, fat: 60 });
    expect(r.overridden).toEqual(["kcal", "fat"]);
  });
});

describe("resolveTargets — training fuel", () => {
  it("keeps adding the bump on top of a manual figure by default", () => {
    const r = resolveTargets(base, { kcal: 2_000 }, 400);
    expect(r.kcal).toBe(2_400);
    expect(r.trainingKcal).toBe(400);
  });

  it("honours the opt-out — a flat protocol stays flat", () => {
    const r = resolveTargets(base, { kcal: 2_800, trainingFuel: false }, 500);
    expect(r.kcal).toBe(2_800);
    expect(r.carbs).toBe(260); // untouched: no bump means no carb carrier
    expect(r.trainingKcal).toBe(0);
  });

  it("adds nothing on a rest day either way", () => {
    expect(resolveTargets(base, { kcal: 2_000 }, 0).kcal).toBe(2_000);
  });
});

describe("targetMismatch", () => {
  it("finds no contradiction in a coherent set", () => {
    expect(targetMismatch(base).material).toBe(false);
  });

  it("measures the gap an override can open", () => {
    // Calories forced to 2 000 while the macros still describe ~2 460.
    const r = resolveTargets(base, { kcal: 2_000 });
    const m = targetMismatch(r);
    expect(m.material).toBe(true);
    expect(m.macroKcal).toBe(2_462);
    expect(m.deltaKcal).toBe(462);
    expect(m.pct).toBe(23);
  });

  it("signs the delta so the copy can say which way it goes", () => {
    const under = targetMismatch({ ...base, kcal: 3_000, protein: 100, carbs: 100, fat: 40 });
    expect(under.deltaKcal).toBeLessThan(0);
  });

  it("tolerates rounding rather than crying contradiction", () => {
    const m = targetMismatch({ ...base, kcal: 2_500 });
    expect(m.material).toBe(false);
  });

  it("never divides by a zero target", () => {
    const m = targetMismatch({ ...base, kcal: 0, protein: 0, carbs: 0, fat: 0 });
    expect(m.pct).toBe(0);
    expect(m.material).toBe(false);
  });

  it("does not let fibre inflate the macro figure — a TARGET has no fibre field", () => {
    // atwaterKcal adds fibre at 2 kcal/g when stated; a macro target states
    // none, so the reconciliation must be the plain 4·4·9.
    expect(targetMismatch(base).macroKcal).toBe(180 * 4 + 260 * 4 + 78 * 9);
  });
});
