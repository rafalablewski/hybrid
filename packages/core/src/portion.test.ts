import { describe, expect, it } from "vitest";
import {
  formatAmount,
  parsePackSize,
  portionAmount,
  portionEquivalent,
  portionMeasure,
  portionPack,
  portionQty,
  portionStep,
  portionUnit,
  portionUnits,
} from "./portion";

describe("portionMeasure — what this food can be weighed in", () => {
  it("reads grams off a mass label", () => {
    expect(portionMeasure({ serving: "100 g" })).toEqual({ unit: "g", perServing: 100 });
  });

  it("prefers a RECORDED weight over one derived from the label", () => {
    expect(portionMeasure({ serving: "1 scoop", servingGrams: 30 })).toEqual({ unit: "g", perServing: 30 });
  });

  it("measures a volume serving in millilitres, never in guessed grams", () => {
    expect(portionMeasure({ serving: "250 ml" })).toEqual({ unit: "ml", perServing: 250 });
    // Even with a weight on file: the label is a volume, so the control is.
    expect(portionMeasure({ serving: "0.5 l", servingGrams: 500 })).toEqual({ unit: "ml", perServing: 500 });
  });

  it("converts an exact mass unit", () => {
    const m = portionMeasure({ serving: "2 oz" })!;
    expect(m.unit).toBe("g");
    expect(m.perServing).toBeCloseTo(56.7, 1);
  });

  it("gives a bare count no measure at all", () => {
    expect(portionMeasure({ serving: "1 slice" })).toBeNull();
    expect(portionMeasure({ serving: "1 medium" })).toBeNull();
    expect(portionMeasure({ serving: null })).toBeNull();
  });

  it("does not treat a cup as a weight — that conversion is an assumption", () => {
    expect(portionMeasure({ serving: "1 cup" })).toEqual({ unit: "ml", perServing: 236.59 });
  });
});

describe("portionUnits — the units the editor offers", () => {
  it("always offers servings, even for a food it cannot measure", () => {
    const units = portionUnits({ serving: "1 slice" });
    expect(units.map((u) => u.id)).toEqual(["servings"]);
  });

  it("adds the measure when the food states one", () => {
    const units = portionUnits({ serving: "100 g" });
    expect(units.map((u) => u.id)).toEqual(["servings", "measure"]);
    expect(portionUnit(units, "measure")!.symbol).toBe("g");
    // Opens on one serving's worth, so switching unit never changes the amount.
    expect(portionUnit(units, "measure")!.initial).toBe(100);
  });

  it("adds the pack when one was recorded, and names it what the athlete calls it", () => {
    const units = portionUnits({ serving: "100 g", packSize: 400, packLabel: "bottle" });
    expect(units.map((u) => u.id)).toEqual(["servings", "measure", "pack"]);
    const pack = portionUnit(units, "pack")!;
    expect(pack.packLabel).toBe("bottle");
    // One bottle is four servings of 100 g.
    expect(pack.servingsPer).toBe(4);
  });

  it("drops a pack it cannot express — a size with no measure has no unit", () => {
    const units = portionUnits({ serving: "1 slice", packSize: 400 });
    expect(units.map((u) => u.id)).toEqual(["servings"]);
    expect(portionPack({ serving: "1 slice", packSize: 400 })).toBeNull();
  });

  it("ignores a nonsense pack size", () => {
    for (const packSize of [0, -5, Number.NaN]) {
      expect(portionUnits({ serving: "100 g", packSize }).map((u) => u.id)).toEqual(["servings", "measure"]);
    }
  });
});

describe("portionQty — what the diary is asked to store", () => {
  const units = portionUnits({ serving: "100 g", packSize: 400, packLabel: "bottle" });
  const servings = portionUnit(units, "servings")!;
  const measure = portionUnit(units, "measure")!;
  const pack = portionUnit(units, "pack")!;

  it("logs the weight off the scale, not a rounded serving", () => {
    // 35 g of cheese against a 100 g label.
    expect(portionQty(35, measure)).toBe(0.35);
  });

  it("logs the whole bottle in one", () => {
    expect(portionQty(1, pack)).toBe(4);
    expect(portionQty(0.5, pack)).toBe(2);
  });

  it("leaves a servings count exactly as typed", () => {
    expect(portionQty(1.5, servings)).toBe(1.5);
  });

  it("treats a blank or negative amount as nothing", () => {
    expect(portionQty(0, measure)).toBe(0);
    expect(portionQty(-5, measure)).toBe(0);
    expect(portionQty(Number.NaN, measure)).toBe(0);
  });

  it("round-trips through the unit switch", () => {
    // 1 serving shown in grams is 100 g, not 1 g.
    expect(portionAmount(portionQty(1, servings), measure)).toBe(100);
    expect(portionAmount(portionQty(400, measure), pack)).toBe(1);
  });
});

describe("portionStep — pressing −/+", () => {
  const units = portionUnits({ serving: "100 g" });
  const servings = portionUnit(units, "servings")!;
  const measure = portionUnit(units, "measure")!;

  it("steps grams by five", () => {
    expect(portionStep(35, measure, 1)).toBe(40);
    expect(portionStep(35, measure, -1)).toBe(30);
  });

  it("steps servings by a half", () => {
    expect(portionStep(1, servings, 1)).toBe(1.5);
  });

  it("KEEPS an off-grid amount off-grid instead of snapping it away", () => {
    // 37 g is what the scale said. +5 is 42, not 40.
    expect(portionStep(37, measure, 1)).toBe(42);
    expect(portionStep(0.35, servings, 1)).toBe(0.85);
  });

  it("never steps below one step", () => {
    expect(portionStep(5, measure, -1)).toBe(5);
    expect(portionStep(0.5, servings, -1)).toBe(0.5);
  });

  it("clamps at the ceiling", () => {
    expect(portionStep(10_000, measure, 1, 10_000)).toBe(10_000);
  });
});

describe("portionEquivalent — the line under the stepper", () => {
  const units = portionUnits({ serving: "100 g", packSize: 400, packLabel: "bottle" });

  it("says what a servings count weighs", () => {
    expect(portionEquivalent(1.5, portionUnit(units, "servings")!, units)).toEqual({ amount: 150, symbol: "g" });
  });

  it("says what a pack weighs", () => {
    expect(portionEquivalent(1, portionUnit(units, "pack")!, units)).toEqual({ amount: 400, symbol: "g" });
  });

  it("stays quiet when the number is already the measure", () => {
    expect(portionEquivalent(35, portionUnit(units, "measure")!, units)).toBeNull();
  });

  it("stays quiet for a food with no measure", () => {
    const only = portionUnits({ serving: "1 slice" });
    expect(portionEquivalent(1, only[0]!, only)).toBeNull();
  });
});

describe("parsePackSize", () => {
  it("takes a decimal comma, as PL and DE type it", () => {
    expect(parsePackSize("1,5")).toBe(1.5);
  });

  it("refuses nothing, zero and nonsense", () => {
    expect(parsePackSize("")).toBeNull();
    expect(parsePackSize("0")).toBeNull();
    expect(parsePackSize("-3")).toBeNull();
    expect(parsePackSize("bottle")).toBeNull();
    expect(parsePackSize(null)).toBeNull();
  });
});

describe("formatAmount", () => {
  it("prints without trailing zeros", () => {
    expect(formatAmount(35)).toBe("35");
    expect(formatAmount(0.35)).toBe("0.35");
    expect(formatAmount(1.5)).toBe("1.5");
  });
});
