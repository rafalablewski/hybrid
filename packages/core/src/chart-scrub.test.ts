import { describe, it, expect } from "vitest";
import { scrubFraction, scrubIndex, scrubPosition } from "./chart-scrub";

const BARS = { count: 8, mode: "band" } as const;
/** The sport page's pace plot: PAD 10 in a 326-wide viewBox. */
const LINE = { count: 8, mode: "point", inset: 10 / 326 } as const;

describe("scrubFraction", () => {
  it("maps a pointer's x onto 0 → 1 and clamps past both edges", () => {
    expect(scrubFraction(0, 200)).toBe(0);
    expect(scrubFraction(100, 200)).toBe(0.5);
    expect(scrubFraction(260, 200)).toBe(1);
    expect(scrubFraction(-40, 200)).toBe(0);
  });

  it("survives the unmeasured first frame instead of dividing by zero", () => {
    expect(scrubFraction(120, 0)).toBe(0);
    expect(scrubFraction(Number.NaN, 200)).toBe(0);
  });
});

describe("scrubIndex — band (bars)", () => {
  it("gives every bar an equal slice of the width", () => {
    expect(scrubIndex(0, BARS)).toBe(0);
    expect(scrubIndex(0.124, BARS)).toBe(0);
    expect(scrubIndex(0.126, BARS)).toBe(1);
    expect(scrubIndex(0.5, BARS)).toBe(4);
    expect(scrubIndex(1, BARS)).toBe(7);
  });

  it("never runs off the end of the series", () => {
    expect(scrubIndex(1.4, BARS)).toBe(7);
    expect(scrubIndex(-2, BARS)).toBe(0);
  });
});

describe("scrubIndex — point (line)", () => {
  it("reads the NEAREST plotted point, not the band it falls in", () => {
    // Points sit at 0.031, 0.169, 0.307, … ; halfway between the first two is
    // 0.100, so either side of that reads a different week.
    expect(scrubIndex(0.09, LINE)).toBe(0);
    expect(scrubIndex(0.11, LINE)).toBe(1);
  });

  it("keeps both ends reachable past their own dot", () => {
    expect(scrubIndex(0, LINE)).toBe(0);
    expect(scrubIndex(1, LINE)).toBe(7);
  });

  it("centres a single point and reads it from anywhere", () => {
    const one = { count: 1, mode: "point", inset: 0.03 } as const;
    expect(scrubIndex(0, one)).toBe(0);
    expect(scrubIndex(1, one)).toBe(0);
    expect(scrubPosition(0, one)).toBe(0.5);
  });

  it("reports NO point for an empty series rather than index zero", () => {
    expect(scrubIndex(0.5, { count: 0, mode: "point" })).toBe(-1);
    expect(scrubIndex(0.5, { count: 0, mode: "band" })).toBe(-1);
  });
});

describe("scrubPosition — where the crosshair lands", () => {
  it("centres a bar in its own band", () => {
    expect(scrubPosition(0, BARS)).toBeCloseTo(1 / 16, 6);
    expect(scrubPosition(7, BARS)).toBeCloseTo(15 / 16, 6);
  });

  it("puts a line's crosshair THROUGH the point, inset and all", () => {
    expect(scrubPosition(0, LINE)).toBeCloseTo(10 / 326, 6);
    expect(scrubPosition(7, LINE)).toBeCloseTo(1 - 10 / 326, 6);
  });

  it("round-trips: the position of a point reads back as that point", () => {
    for (const g of [BARS, LINE]) {
      for (let i = 0; i < g.count; i++) expect(scrubIndex(scrubPosition(i, g), g)).toBe(i);
    }
  });

  it("clamps an index the caller has not clamped", () => {
    expect(scrubPosition(99, BARS)).toBeCloseTo(15 / 16, 6);
    expect(scrubPosition(-4, LINE)).toBeCloseTo(10 / 326, 6);
  });
});
