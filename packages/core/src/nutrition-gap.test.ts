import { describe, it, expect } from "vitest";
import { KCAL_OVER_TOLERANCE, figureText, gapFigure, nutritionFigures, nutritionGap, wouldOvershoot, type MacroTotals } from "./nutrition-gap";

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

describe("nutritionFigures — the day's figures, target or no target", () => {
  it("is the same object nutritionGap returns when there IS an energy target", () => {
    expect(nutritionFigures(have, want)).toEqual(nutritionGap(have, want));
  });

  it("still states what was eaten when nothing was targeted", () => {
    const f = nutritionFigures(have, null);
    expect(f.kcal.have).toBe(2488);
    expect(f.kcal.want).toBeNull();
    // never 0 % of a target nobody set: no want, no proportion to draw
    expect(f.kcal.pct).toBe(0);
    expect(f.macros.map((m) => m.figure.have)).toEqual([142, 268, 71]);
    expect(f.macros.every((m) => m.figure.want === null)).toBe(true);
  });

  it("keeps a targeted macro measured while an untargeted one only reports", () => {
    const f = nutritionFigures(have, { protein: 190 });
    expect(f.macros[0]!.figure.want).toBe(190);
    expect(f.macros[0]!.figure.pct).toBeCloseTo(74.7, 1);
    expect(f.macros[1]!.figure.want).toBeNull();
  });
});

describe("gapFigure — one figure against one target", () => {
  it("measures, and rounds only what it states", () => {
    const f = gapFigure(118, 150);
    expect(f).toEqual({ have: 118, want: 150, left: 32, pct: (118 / 150) * 100, over: false });
  });

  it("reports an unset target as unset, not as zero", () => {
    for (const w of [null, undefined, 0, Number.NaN]) {
      expect(gapFigure(118, w).want).toBeNull();
      expect(gapFigure(118, w).pct).toBe(0);
    }
  });

  it("clamps the drawn share without clamping the amount", () => {
    const f = gapFigure(300, 150);
    expect(f.pct).toBe(100);
    expect(f.have).toBe(300);
    expect(f.left).toBe(-150);
    expect(f.over).toBe(true);
  });

  it("treats a nonsense amount as none, never as NaN on screen", () => {
    expect(gapFigure(Number.NaN, 150).have).toBe(0);
    expect(gapFigure(-40, 150).have).toBe(0);
  });

  it("holds the tolerance band, so landing on target is not over", () => {
    expect(gapFigure(2000, 2000).over).toBe(false);
    expect(gapFigure(2003, 2000).over).toBe(false);
    expect(gapFigure(2200, 2000).over).toBe(true);
  });
});

describe("figureText — one spelling for every screen that states a figure", () => {
  it("is have/want, no spaces and no unit", () => {
    expect(figureText(118, 150)).toBe("118/150");
    expect(figureText(1675, 2325)).toBe("1675/2325");
  });

  it("rounds BOTH halves, because an overridden target is taken exactly as typed", () => {
    // resolveTargets passes ov.kcal through unrounded, so 2325.5 is reachable;
    // two call sites used to interpolate the target raw.
    expect(figureText(1674.6, 2325.5)).toBe("1675/2326");
  });

  it("states the amount alone when no target is set", () => {
    for (const w of [null, undefined, 0, Number.NaN]) expect(figureText(118, w)).toBe("118");
  });

  it("never puts NaN or a negative amount on the glass", () => {
    expect(figureText(Number.NaN, 150)).toBe("0/150");
    expect(figureText(-12, 150)).toBe("0/150");
  });

  it("spells exactly what gapFigure measured", () => {
    const f = gapFigure(118, 150);
    expect(figureText(f.have, f.want)).toBe("118/150");
  });
});
