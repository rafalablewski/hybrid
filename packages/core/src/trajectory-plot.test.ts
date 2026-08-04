import { describe, expect, it } from "vitest";
import { trajectoryPlot, sessionDaysAgo } from "./trajectory-plot";

const pts = (vals: [number, number][]) =>
  vals.map(([hpi, readiness], i) => ({ daysAgo: vals.length - 1 - i, hpi, readiness }));

describe("trajectoryPlot", () => {
  const box = { width: 300, height: 100, pad: 8 };

  it("draws nothing from nothing, without dividing by zero", () => {
    const p = trajectoryPlot([], [], box);
    expect(p.hpiD).toBe("");
    expect(p.readyD).toBe("");
    expect(p.sessionX).toEqual([]);
  });

  it("zooms the domain to the data and snaps it to tens", () => {
    const p = trajectoryPlot(pts([[54, 58], [61, 63], [68, 66]]), [], box);
    expect(p.lo).toBe(40);
    expect(p.hi).toBe(80);
  });

  it("never draws a band narrower than 20 points", () => {
    const p = trajectoryPlot(pts([[60, 60], [61, 61], [60, 60]]), [], box);
    expect(p.hi - p.lo).toBeGreaterThanOrEqual(20);
  });

  it("keeps the domain inside 0..100", () => {
    const p = trajectoryPlot(pts([[2, 3], [99, 98]]), [], box);
    expect(p.lo).toBeGreaterThanOrEqual(0);
    expect(p.hi).toBeLessThanOrEqual(100);
  });

  it("marks only the days that carried training", () => {
    // Three days: daysAgo 2, 1, 0. Sessions on 2 and 0.
    const p = trajectoryPlot(pts([[60, 60], [61, 61], [62, 62]]), [2, 0], box);
    expect(p.sessionX).toHaveLength(2);
    expect(p.sessionX[0]).toBeCloseTo(p.xs[0]!, 5);
    expect(p.sessionX[1]).toBeCloseTo(p.xs[2]!, 5);
  });

  it("ignores a session day outside the plotted window", () => {
    const p = trajectoryPlot(pts([[60, 60], [61, 61]]), [40], box);
    expect(p.sessionX).toEqual([]);
  });

  it("puts the emphasised endpoint on the newest freshness value", () => {
    const p = trajectoryPlot(pts([[50, 50], [80, 50]]), [], box);
    expect(p.last.x).toBeCloseTo(p.xs[p.xs.length - 1]!, 5);
    // Higher value sits higher on the screen (smaller y).
    expect(p.last.y).toBeLessThan(p.baselineY);
  });

  it("both series share one geometry, so they are comparable", () => {
    const p = trajectoryPlot(pts([[60, 40], [60, 40]]), [], box);
    expect(p.hpiD.split(" ")).toHaveLength(2);
    expect(p.readyD.split(" ")).toHaveLength(2);
    expect(p.hpiD).not.toBe(p.readyD);
  });
});

describe("sessionDaysAgo", () => {
  const now = Date.parse("2026-08-04T12:00:00.000Z");

  it("counts local days, not 24-hour blocks", () => {
    const out = sessionDaysAgo([new Date(now - 2 * 86_400_000).toISOString()], now);
    expect(out).toEqual([2]);
  });

  it("collapses several sessions on one day to a single mark", () => {
    const iso = new Date(now - 86_400_000).toISOString();
    expect(sessionDaysAgo([iso, iso, iso], now)).toEqual([1]);
  });

  it("drops junk and future dates rather than plotting them", () => {
    const out = sessionDaysAgo([null, undefined, "not a date", new Date(now + 5 * 86_400_000).toISOString()], now);
    expect(out).toEqual([]);
  });
});
