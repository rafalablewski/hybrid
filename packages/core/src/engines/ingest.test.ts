import { describe, it, expect } from "vitest";
import { parseForcePlateCsv, mapMetric } from "./forceplate";
import { weightTrend } from "./composition";
import { athleteSegment } from "./segment";
import type { Signal } from "./signals";

describe("force-plate CSV ingest", () => {
  it("maps known metric labels to signal kinds", () => {
    expect(mapMetric("Jump Height (cm)")).toBe("jumpHeight");
    expect(mapMetric("Takeoff Asymmetry %")).toBe("asymmetry");
    expect(mapMetric("Body Mass")).toBe("bodyMass");
    expect(mapMetric("Peak Power")).toBeNull();
  });

  it("parses a WIDE csv (date + metric columns)", () => {
    const csv = [
      "Date,Athlete,Jump Height (cm),Asymmetry (%),Peak Power",
      "2026-05-01,Marcel,38.2,4.1,4200",
      "2026-05-08,Marcel,39.0,3.4,4310",
    ].join("\n");
    const r = parseForcePlateCsv(csv, { athleteId: "u" });
    expect(r.rows).toBe(2);
    // 2 rows × (jumpHeight + asymmetry) = 4 signals; Peak Power ignored
    expect(r.imported).toBe(4);
    expect(r.ignored).toContain("Peak Power");
    expect(r.signals.filter((s) => s.kind === "jumpHeight")).toHaveLength(2);
    expect(r.signals[0]!.unit).toBe("cm");
  });

  it("parses a LONG csv (date,metric,value,unit)", () => {
    const csv = ["date,metric,value,unit", "2026-05-01,Jump Height,40,cm", "2026-05-01,RSI,1.8,"].join("\n");
    const r = parseForcePlateCsv(csv, { athleteId: "u" });
    expect(r.imported).toBe(1); // RSI unrecognized
    expect(r.signals[0]!.kind).toBe("jumpHeight");
  });

  it("skips rows with unparseable dates", () => {
    const csv = ["Date,Jump Height", "not-a-date,40", "2026-05-01,41"].join("\n");
    expect(parseForcePlateCsv(csv, { athleteId: "u" }).imported).toBe(1);
  });
});

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
