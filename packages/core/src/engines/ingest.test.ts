import { describe, it, expect } from "vitest";
import { weightTrend } from "./composition";
import { athleteSegment } from "./segment";
import type { Signal } from "./signals";

describe("smoothed weight trend", () => {
  const mk = (v: number, daysAgo: number): Signal => ({
    athleteId: "u", kind: "bodyMass", value: v, unit: "kg", source: "manual",
    ts: new Date(Date.parse("2026-06-03T12:00:00.000Z") - daysAgo * 86_400_000).toISOString(),
  });

  it("returns a negative weekly rate when losing weight", () => {
    const t = weightTrend([mk(86, 0), mk(87, 7), mk(88, 14), mk(90, 28)]);
    expect(t.ratePerWeek).toBeLessThan(0);
    expect(t.latest).toBe(86);
    expect(t.points).toHaveLength(4);
  });

  it("is empty without bodyMass data", () => {
    expect(weightTrend([]).latest).toBeNull();
  });
});

describe("auto-segmentation", () => {
  it("buckets by priority", () => {
    expect(athleteSegment({ daysSinceLast: 20 })).toBe("dormant");
    expect(athleteSegment({ readiness: 40, daysSinceLast: 1 })).toBe("needs-attention");
    expect(athleteSegment({ acwrBand: "danger", daysSinceLast: 1 })).toBe("needs-attention");
    expect(athleteSegment({ flagged: true, daysSinceLast: 1 })).toBe("needs-attention");
    expect(athleteSegment({ readiness: 80, sessions: 2, daysSinceLast: 1 })).toBe("new");
    expect(athleteSegment({ readiness: 80, sessions: 30, daysSinceLast: 1, acwrBand: "sweet-spot" })).toBe("on-track");
  });
});
