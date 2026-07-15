import { describe, it, expect } from "vitest";
import {
  metricTrends,
  sparkHeights,
  weeklyReport,
  fmtMetricValue,
  fmtMetricDelta,
  BODY_METRIC_DEFS,
  type BodyMetric,
} from "./body-progress";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-14T09:00:00Z");
// Newest-first, as GET /api/body returns.
const at = (daysAgo: number, m: Partial<BodyMetric>): BodyMetric => ({
  id: `m${daysAgo}`,
  measuredAt: new Date(NOW - daysAgo * DAY).toISOString(),
  ...m,
});

const weightDef = BODY_METRIC_DEFS.find((d) => d.key === "weightKg")!;
const waistDef = BODY_METRIC_DEFS.find((d) => d.key === "waistCm")!;

describe("metricTrends", () => {
  it("only returns metrics that have at least one value, in defs order", () => {
    const trends = metricTrends([at(0, { weightKg: 82, waistCm: 81 }), at(2, { weightKg: 83 })]);
    expect(trends.map((t) => t.def.key)).toEqual(["weightKg", "waistCm"]);
  });

  it("computes latest, previous, delta and direction from newest-first input", () => {
    const w = metricTrends([at(0, { weightKg: 82.1 }), at(3, { weightKg: 82.5 }), at(6, { weightKg: 83.0 })])[0]!;
    expect(w.latest).toBe(82.1);
    expect(w.previous).toBe(82.5);
    expect(w.delta).toBeCloseTo(-0.4, 5);
    expect(w.direction).toBe("down");
  });

  it("orders the sparkline series oldest→newest and caps it to the window", () => {
    // weight = 80 + daysAgo, so the newest entry (0 days ago) is the lightest.
    const metrics = Array.from({ length: 10 }, (_, i) => at(i, { weightKg: 80 + i }));
    const series = metricTrends(metrics, 8)[0]!.series;
    expect(series).toHaveLength(8);
    expect(series[series.length - 1]).toBe(80); // newest (0 days ago) is last
    expect(series[0]).toBe(87); // oldest in the 8-point window (7 days ago)
    expect(series[0]!).toBeGreaterThan(series[series.length - 1]!); // chronological, trending down
  });

  it("marks a sub-threshold change as flat and a single entry as null delta", () => {
    expect(metricTrends([at(0, { weightKg: 82.0 }), at(2, { weightKg: 82.02 })])[0]!.direction).toBe("flat");
    const one = metricTrends([at(0, { weightKg: 82 })])[0]!;
    expect(one.previous).toBeNull();
    expect(one.delta).toBeNull();
  });
});

describe("sparkHeights", () => {
  it("maps min→0.18, max→1 and keeps values in range", () => {
    const h = sparkHeights([10, 20, 30]);
    expect(h[0]).toBeCloseTo(0.18, 5);
    expect(h[2]).toBeCloseTo(1, 5);
    expect(h[1]).toBeGreaterThan(0.18);
    expect(h[1]).toBeLessThan(1);
  });
  it("returns a flat 0.5 row for a constant series and [] for empty", () => {
    expect(sparkHeights([5, 5, 5])).toEqual([0.5, 0.5, 0.5]);
    expect(sparkHeights([])).toEqual([]);
  });
});

describe("weeklyReport", () => {
  it("reports no data for an empty history", () => {
    const r = weeklyReport([], NOW);
    expect(r.hasData).toBe(false);
    expect(r.verdict).toBe("baseline");
  });

  it("counts distinct logging days within the last 7", () => {
    const r = weeklyReport([at(0, { weightKg: 82 }), at(2, { weightKg: 82.4 }), at(9, { weightKg: 83 })], NOW);
    expect(r.cadence).toBe(2); // day 9 is outside the window
    expect(r.cadenceOf).toBe(7);
  });

  it("reads weight-down + waist-down as the 'lean' verdict", () => {
    const r = weeklyReport(
      [at(0, { weightKg: 82.1, waistCm: 81.0 }), at(6, { weightKg: 82.6, waistCm: 82.0 })],
      NOW,
    );
    expect(r.weightDeltaKg).toBeCloseTo(-0.5, 5);
    expect(r.verdict).toBe("lean");
  });

  it("reads weight-up + arm-up as the 'build' verdict, and a flat scale as 'steady'", () => {
    expect(
      weeklyReport([at(0, { weightKg: 83.0, armCm: 39 }), at(6, { weightKg: 82.4, armCm: 38.5 })], NOW).verdict,
    ).toBe("build");
    expect(
      weeklyReport([at(0, { weightKg: 82.0 }), at(6, { weightKg: 82.05 })], NOW).verdict,
    ).toBe("steady");
  });
});

describe("formatting", () => {
  it("keeps kg as-is and converts to lb for weight", () => {
    expect(fmtMetricValue(weightDef, 82, "kg")).toEqual({ value: "82", unit: "kg" });
    expect(fmtMetricValue(weightDef, 100, "lb").unit).toBe("lb");
    expect(Number(fmtMetricValue(weightDef, 100, "lb").value)).toBeGreaterThan(200);
  });
  it("renders tape values in cm and a bare absolute delta", () => {
    expect(fmtMetricValue(waistDef, 81, "kg")).toEqual({ value: "81", unit: "cm" });
    expect(fmtMetricDelta(waistDef, -0.3, "kg")).toBe("0.3");
  });
});
