import { describe, it, expect } from "vitest";
import { kgToUnit, unitToKg, displayLoad, storeLoad, fmtWeight, fmtTonnage } from "./units";

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
