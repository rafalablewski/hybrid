import { describe, it, expect } from "vitest";
import { sparkline } from "./spark";

const BOX = { width: 100, height: 50, pad: 4 }; // baseline y = 46, top y = 4

describe("sparkline", () => {
  it("anchors the scale at TRUE zero — an empty week sits on the baseline", () => {
    const s = sparkline([0, 0, 0, 0, 0, 0, 60, 56], BOX);
    expect(s.baselineY).toBe(46);
    // the six empty weeks are ON the line, not floored above it
    expect(s.points.slice(0, 6).every((p) => p.y === 46)).toBe(true);
    // the peak reaches the top of the box, the current week sits just below it
    expect(s.points[6]!.y).toBe(4);
    expect(s.points[7]!.y).toBeGreaterThan(4);
    expect(s.points[7]!.y).toBeLessThan(10);
  });

  it("draws an all-zero series flat along the baseline (no divide by zero)", () => {
    const s = sparkline([0, 0, 0], BOX);
    expect(s.points.every((p) => p.y === 46)).toBe(true);
    expect(s.d).toBe("M4,46 L50,46 L96,46");
  });

  it("spans the box end to end, oldest → newest, inside the padding", () => {
    const s = sparkline([1, 2, 3], BOX);
    expect(s.points[0]!.x).toBe(4);
    expect(s.last.x).toBe(96);
    expect(s.last.y).toBe(4); // the newest value is the largest here
    expect(s.d.startsWith("M")).toBe(true);
  });

  it("centres a single point and survives an empty series", () => {
    // one value is its own max, so it tops the box; there is no shape to draw
    expect(sparkline([7], BOX).last).toEqual({ x: 50, y: 4 });
    expect(sparkline([0], BOX).last).toEqual({ x: 50, y: 46 });
    const none = sparkline([], BOX);
    expect(none.d).toBe("");
    expect(none.last).toEqual({ x: 50, y: 46 });
  });
});
