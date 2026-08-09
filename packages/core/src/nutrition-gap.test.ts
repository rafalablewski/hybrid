import { describe, it, expect } from "vitest";
import { KCAL_OVER_TOLERANCE, nutritionGap, wouldOvershoot, type MacroTotals } from "./nutrition-gap";

const have: MacroTotals = { kcal: 2488, protein: 142, carbs: 268, fat: 71 };
const want = { kcal: 3100, protein: 190, carbs: 320, fat: 86 };

describe("nutritionGap", () => {
  it("states what is left", () => {
    const g = nutritionGap(have, want)!;
    expect(g.kcal.left).toBe(612);
    expect(g.kcal.over).toBe(false);
    expect(g.macros.map((m) => m.figure.left)).toEqual([48, 52, 15]);
  });

  it("is NULL without an energy target — a number nobody set is not a gap", () => {
    expect(nutritionGap(have, null)).toBeNull();
    expect(nutritionGap(have, undefined)).toBeNull();
    expect(nutritionGap(have, { kcal: 0 })).toBeNull();
    expect(nutritionGap(have, { kcal: Number.NaN })).toBeNull();
  });

  it("leaves a macro nobody set UNSET rather than drawing it at zero", () => {
    const g = nutritionGap(have, { kcal: 3100, protein: 190 })!;
    const carbs = g.macros.find((m) => m.key === "carbs")!.figure;
    expect(carbs.want).toBeNull();
    expect(carbs.left).toBeNull();
    expect(carbs.pct).toBe(0);
    expect(carbs.over).toBe(false);
  });

  it("reports a negative remainder rather than clamping it to zero", () => {
    const g = nutritionGap({ ...have, kcal: 3400 }, want)!;
    expect(g.kcal.left).toBe(-300);
    expect(g.kcal.over).toBe(true);
  });

  it("treats over as a BAND: landing on 3 003 against 3 000 is arithmetic, not overeating", () => {
    const g = nutritionGap({ ...have, kcal: 3003 }, { ...want, kcal: 3000 })!;
    expect(g.kcal.left).toBe(-3);
    expect(g.kcal.over).toBe(false);
    expect(KCAL_OVER_TOLERANCE).toBe(1.05);
    // …and past the band it does say so
    expect(nutritionGap({ ...have, kcal: 3200 }, { ...want, kcal: 3000 })!.kcal.over).toBe(true);
  });

  it("clamps the drawing percentage without hiding the overshoot", () => {
    const g = nutritionGap({ ...have, kcal: 6200 }, want)!;
    expect(g.kcal.pct).toBe(100);
    expect(g.kcal.left).toBe(-3100);
    expect(g.kcal.over).toBe(true);
  });

  it("keeps the macros in the order the screen draws them", () => {
    expect(nutritionGap(have, want)!.macros.map((m) => m.key)).toEqual(["protein", "carbs", "fat"]);
  });
});

describe("wouldOvershoot — a statement, never a block", () => {
  const gap = nutritionGap(have, want)!;

  it("is false for a food that fits", () => {
    expect(wouldOvershoot(gap, 118)).toBe(false);
  });

  it("is true for one that puts the day past the band", () => {
    expect(wouldOvershoot(gap, 900)).toBe(true);
  });

  it("allows the tolerance band, so a food landing just on target is not flagged", () => {
    // 2 488 + 620 = 3 108, inside 3 100 × 1.05
    expect(wouldOvershoot(gap, 620)).toBe(false);
  });

  it("says nothing when there is no target to be over", () => {
    expect(wouldOvershoot(null, 5000)).toBe(false);
  });

  it("ignores a food with no energy figure rather than guessing", () => {
    expect(wouldOvershoot(gap, 0)).toBe(false);
    expect(wouldOvershoot(gap, Number.NaN)).toBe(false);
  });
});
