import { describe, it, expect } from "vitest";
import {
  CONNECTORS,
  connectorSpec,
  recoverySignals,
  parseWhoop,
  parseOura,
  parseHealthKit,
} from "./connectors";

describe("connector registry", () => {
  it("every spec declares what it provides", () => {
    for (const c of CONNECTORS) {
      expect(c.provides.length).toBeGreaterThan(0);
      expect(["oauth", "native", "team"]).toContain(c.auth);
    }
  });

  it("looks specs up by id", () => {
    expect(connectorSpec("whoop")?.label).toBe("WHOOP");
    expect(connectorSpec("apple")?.auth).toBe("native");
  });
});

describe("recoverySignals", () => {
  it("emits a signal per present field with the canonical unit", () => {
    const sigs = recoverySignals("a1", "whoop", { ts: "2026-06-01T00:00:00.000Z", hrv: 62, restingHr: 50, sleepH: 7.5 });
    expect(sigs).toHaveLength(3);
    expect(sigs.find((s) => s.kind === "hrv")!.unit).toBe("ms");
    expect(sigs.every((s) => s.source === "whoop" && s.athleteId === "a1")).toBe(true);
  });

  it("skips missing / non-finite fields", () => {
    const sigs = recoverySignals("a1", "oura", { ts: "2026-06-01", hrv: undefined, restingHr: NaN, sleepH: 8 });
    expect(sigs.map((s) => s.kind)).toEqual(["sleep"]);
  });
});

describe("provider parsers", () => {
  it("parses WHOOP recovery records", () => {
    const sigs = parseWhoop("a1", {
      records: [{ created_at: "2026-06-01T06:00:00.000Z", score: { hrv_rmssd_milli: 0.058, resting_heart_rate: 48, sleep_performance_percentage: 91 } }],
    });
    expect(sigs.find((s) => s.kind === "restingHr")!.value).toBe(48);
    expect(sigs.find((s) => s.kind === "sleepScore")!.value).toBe(91);
  });

  it("converts Oura sleep seconds to hours", () => {
    const sigs = parseOura("a1", { data: [{ day: "2026-06-01", average_hrv: 55, lowest_heart_rate: 47, total_sleep_duration: 27000, score: 84 }] });
    const sleep = sigs.find((s) => s.kind === "sleep")!;
    expect(sleep.value).toBeCloseTo(7.5, 5);
    expect(sleep.ts).toBe("2026-06-01T00:00:00.000Z");
  });

  it("maps HealthKit sample types to signal kinds", () => {
    const sigs = parseHealthKit("a1", {
      samples: [
        { type: "HKQuantityTypeIdentifierRestingHeartRate", value: 52, end: "2026-06-01T07:00:00.000Z" },
        { type: "HKQuantityTypeIdentifierStepCount", value: 9000, end: "2026-06-01T07:00:00.000Z" },
      ],
    });
    expect(sigs).toHaveLength(1);
    expect(sigs[0]!.kind).toBe("restingHr");
    expect(sigs[0]!.source).toBe("apple");
  });
});
