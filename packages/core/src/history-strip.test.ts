import { describe, expect, it } from "vitest";
import { HISTORY_STRIP_BARS, HISTORY_STRIP_FLOOR, historyStripBars } from "./history-strip";

describe("historyStripBars", () => {
  it("maps min→max onto the floor..1 band, newest last", () => {
    const bars = historyStripBars([80, 85, 90, 100]);
    expect(bars).toHaveLength(4);
    expect(bars[0]).toBeCloseTo(HISTORY_STRIP_FLOOR);
    expect(bars[bars.length - 1]).toBeCloseTo(1);
    // monotone series stays monotone
    for (let i = 1; i < bars.length; i++) expect(bars[i]!).toBeGreaterThan(bars[i - 1]!);
  });

  it("keeps only the last HISTORY_STRIP_BARS values", () => {
    const bars = historyStripBars(Array.from({ length: 20 }, (_, i) => i));
    expect(bars).toHaveLength(HISTORY_STRIP_BARS);
    expect(bars[bars.length - 1]).toBeCloseTo(1);
  });

  it("reversed flips the band so faster (lower) pace is the tallest bar", () => {
    const bars = historyStripBars([300, 290, 280], { reversed: true });
    expect(bars[0]).toBeCloseTo(HISTORY_STRIP_FLOOR);
    expect(bars[2]).toBeCloseTo(1);
  });

  it("a flat series renders mid-band, not empty and not full", () => {
    const bars = historyStripBars([100, 100, 100]);
    expect(bars).toEqual([0.6, 0.6, 0.6]);
  });

  it("fewer than two finite values is no history", () => {
    expect(historyStripBars([])).toEqual([]);
    expect(historyStripBars([100])).toEqual([]);
    expect(historyStripBars([100, NaN])).toEqual([]);
  });

  it("never emits a bar below the floor or above 1", () => {
    const bars = historyStripBars([3, 9, 1, 7, 2, 8]);
    for (const b of bars) {
      expect(b).toBeGreaterThanOrEqual(HISTORY_STRIP_FLOOR);
      expect(b).toBeLessThanOrEqual(1);
    }
  });
});

describe("zeroBasedBars", () => {
  it("maps v/max so an empty period reads as zero", async () => {
    const { zeroBasedBars } = await import("./history-strip");
    expect(zeroBasedBars([0, 5, 10])).toEqual([0, 0.5, 1]);
  });

  it("no signal at all is no strip", async () => {
    const { zeroBasedBars } = await import("./history-strip");
    expect(zeroBasedBars([0, 0, 0])).toEqual([]);
    expect(zeroBasedBars([7])).toEqual([]);
  });
});

describe("exerciseStripBars", () => {
  it("weight is level-normalized, pace is level-normalized reversed, volume is zero-based", async () => {
    const { exerciseStripBars } = await import("./history-strip");
    const w = exerciseStripBars({ metric: "weight", spark: [80, 100] });
    expect(w[0]).toBeCloseTo(HISTORY_STRIP_FLOOR);
    expect(w[1]).toBeCloseTo(1);
    const p = exerciseStripBars({ metric: "pace", spark: [300, 280] });
    expect(p[0]).toBeCloseTo(HISTORY_STRIP_FLOOR);
    expect(p[1]).toBeCloseTo(1); // faster pace = taller bar
    expect(exerciseStripBars({ metric: "volume", spark: [0, 2000, 4000] })).toEqual([0, 0.5, 1]);
  });
});
