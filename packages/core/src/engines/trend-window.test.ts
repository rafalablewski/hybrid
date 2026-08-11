import { describe, it, expect } from "vitest";
import { TREND_WINDOWS, TREND_WEEKS_DEFAULT, stepTrendWindow } from "./analytics";

/**
 * THE ZOOM LADDER behind pinching a trend chart.
 *
 * The gesture's sense is inverted against the list's order — pinch out = zoom
 * in = FEWER weeks = earlier in the list — and that inversion is the single
 * easiest thing to get backwards, so it is asserted rather than trusted.
 */
describe("stepTrendWindow", () => {
  it("zooms IN to fewer weeks", () => {
    expect(stepTrendWindow(52, 1)).toBe(26);
    expect(stepTrendWindow(26, 1)).toBe(13);
    expect(stepTrendWindow(13, 1)).toBe(8);
    expect(stepTrendWindow(8, 1)).toBe(4);
  });

  it("zooms OUT to more weeks", () => {
    expect(stepTrendWindow(4, -1)).toBe(8);
    expect(stepTrendWindow(8, -1)).toBe(13);
    expect(stepTrendWindow(13, -1)).toBe(26);
    expect(stepTrendWindow(26, -1)).toBe(52);
  });

  it("clamps at both ends instead of wrapping", () => {
    // Wrapping would turn "zoom in as far as it goes" into "jump to a year",
    // which is the opposite of what the fingers asked for.
    expect(stepTrendWindow(4, 1)).toBe(4);
    expect(stepTrendWindow(52, -1)).toBe(52);
  });

  it("snaps an off-ladder window to the nearest rung", () => {
    // A caller still passing its own literal must not be stuck: the first
    // pinch puts it on the ladder rather than refusing to move.
    expect(stepTrendWindow(10, 1)).toBe(8);
    expect(stepTrendWindow(40, -1)).toBe(52);
  });

  it("keeps the default on the ladder and in ascending order", () => {
    expect(TREND_WINDOWS).toContain(TREND_WEEKS_DEFAULT);
    expect([...TREND_WINDOWS]).toEqual([...TREND_WINDOWS].sort((a, b) => a - b));
  });
});
