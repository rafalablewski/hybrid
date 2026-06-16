import { describe, it, expect } from "vitest";
import { platesPerSide } from "./plates";
import { kgToUnit } from "./units";

describe("plate maths", () => {
  it("loads a 100 kg bar as 40/side from the 20 kg bar", () => {
    const p = platesPerSide(100, "kg");
    expect(p.bar).toBe(20);
    // (100 - 20) / 2 = 40 → 25 + 15
    expect(p.perSide).toEqual([25, 15]);
    expect(p.remainder).toBe(0);
  });

  it("returns no plates at/below the bar", () => {
    expect(platesPerSide(20, "kg").perSide).toEqual([]);
    expect(platesPerSide(10, "kg").perSide).toEqual([]);
  });

  it("works in lb off a 45 lb bar — plates reconstruct the load", () => {
    const p = platesPerSide(100, "lb");
    expect(p.bar).toBe(45);
    const loaded = p.bar + p.perSide.reduce((a, b) => a + b, 0) * 2 + p.remainder * 2;
    expect(loaded).toBeCloseTo(kgToUnit(100, "lb"), 1);
    // an exact 225 lb bar (45 + two 90s) loads as 45+45 per side
    const exact = platesPerSide(kgToUnit(225, "lb") * 0 + 225 * 0.45359237, "lb");
    expect(exact.perSide).toEqual([45, 45]);
  });

  it("flags an unloadable remainder", () => {
    // 21 kg → per side 0.5 kg, smaller than the smallest 1.25 plate
    const p = platesPerSide(21, "kg");
    expect(p.perSide).toEqual([]);
    expect(p.remainder).toBeCloseTo(0.5, 2);
  });
});
