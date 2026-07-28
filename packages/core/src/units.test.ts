import { describe, it, expect } from "vitest";
import {
  kgToUnit, unitToKg, displayLoad, storeLoad, fmtWeight, fmtTonnage,
  heightUnitFor, displayHeight, storeHeightCm, fmtHeight, isPlausibleHeightCm,
} from "./units";

describe("weight units", () => {
  it("kg mode is a pass-through", () => {
    expect(displayLoad("100", "kg")).toBe("100");
    expect(storeLoad("100", "kg")).toBe("100");
    expect(fmtWeight(100, "kg")).toBe("100 kg");
  });

  it("converts kg ⇄ lb round-trip within rounding", () => {
    expect(Math.round(kgToUnit(100, "lb"))).toBe(220);
    expect(Math.round(unitToKg(225, "lb"))).toBe(102);
    // display a stored 100kg in lb, then store it back → ~100kg
    const shown = displayLoad("100", "lb"); // "220"
    expect(shown).toBe("220");
    expect(Math.round(parseFloat(storeLoad(shown, "lb")))).toBe(100);
  });

  it("fmtWeight + fmtTonnage label the chosen unit", () => {
    expect(fmtWeight(102.5, "lb")).toMatch(/lb$/);
    expect(fmtTonnage(38400, "kg")).toBe("38.4 t");
    expect(fmtTonnage(38400, "lb")).toMatch(/lb$/);
  });

  it("passes blank / non-numeric through", () => {
    expect(displayLoad("", "lb")).toBe("");
    expect(storeLoad("", "lb")).toBe("");
  });
});

describe("height units", () => {
  it("follows the weight preference — kg athletes get cm, lb athletes get inches", () => {
    expect(heightUnitFor("kg")).toBe("cm");
    expect(heightUnitFor("lb")).toBe("in");
  });

  it("metric is a pass-through; imperial round-trips within rounding", () => {
    expect(displayHeight(183, "kg")).toBe("183");
    expect(storeHeightCm("183", "kg")).toBe(183);
    // 183 cm ≈ 72 in — shown in inches, typed back, lands on the same height.
    expect(displayHeight(183, "lb")).toBe("72");
    expect(storeHeightCm(displayHeight(183, "lb"), "lb")).toBeCloseTo(183, 0);
  });

  it("reads back imperial as feet and inches, because nobody says '72 in'", () => {
    expect(fmtHeight(183, "lb")).toBe("6'0\"");
    expect(fmtHeight(160, "lb")).toBe("5'3\"");
    expect(fmtHeight(183, "kg")).toBe("183 cm");
  });

  it("accepts a comma decimal, the way the measurement fields do", () => {
    expect(storeHeightCm("183,5", "kg")).toBe(183.5);
  });

  it("rejects a height nobody has — a unit mix-up must not become a frame", () => {
    // 72 typed into a CM field is the classic inches-in-the-wrong-box slip.
    expect(storeHeightCm("72", "kg")).toBeNull();
    expect(storeHeightCm("300", "kg")).toBeNull();
    expect(storeHeightCm("", "kg")).toBeNull();
    expect(storeHeightCm("abc", "kg")).toBeNull();
    expect(isPlausibleHeightCm(180)).toBe(true);
    expect(isPlausibleHeightCm(null)).toBe(false);
  });
});
