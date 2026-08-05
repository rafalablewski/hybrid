import { describe, it, expect } from "vitest";
import { toBiometrics, BIOMETRIC_FRESH_DAYS, signalAgeDays } from "./signals";
import { buildBiometrics } from "../biometrics";
import { biometricAdjustment } from "./readiness";
import { wearableExplain, wearableSourceLabel, WEARABLE_METRIC_KEY } from "./wearable-explain";
import { computeHpi } from "./hpi";
import { computeFatigue } from "./fatigue";
import type { Signal } from "./signals";

/**
 * THE WEARABLE TERM HAD NO GUARDS AND NO DOOR.
 *
 * Two defects, both of which let the card assert something it could not
 * support: a reading of ANY age was read as today's (there was no recency check
 * anywhere in the path), and the legacy entry point INVENTED a value for any
 * field it was missing. These tests make both unrepeatable, and pin the
 * explanation the athlete now gets.
 */

const NOW = Date.parse("2026-06-10T09:00:00Z");
const day = (n: number) => new Date(NOW - n * 86400000).toISOString();

const sig = (kind: Signal["kind"], value: number, ts: string, source = "apple"): Signal =>
  ({ athleteId: "a1", kind, value, unit: "", source, ts });

/** HRV well under baseline + resting HR over it — a real, recent, negative day. */
const RECENT: Signal[] = [
  sig("hrv", 62, day(4)), sig("hrv", 60, day(3)), sig("hrv", 61, day(2)), sig("hrv", 48, day(0)),
  sig("restingHr", 50, day(3)), sig("restingHr", 51, day(2)), sig("restingHr", 58, day(0)),
];

describe("staleness — a reading is only today's while it is recent", () => {
  it("reads a fresh signal", () => {
    const bio = toBiometrics(RECENT, NOW);
    expect(bio).toBeDefined();
    expect(bio!.hrv.today).toBe(48);
    expect(bio!.hrv.measured).toBe(true);
  });

  it("drops the whole adjustment once every reading is past the window", () => {
    const stale = RECENT.map((s) => ({ ...s, ts: day(BIOMETRIC_FRESH_DAYS + 1) }));
    expect(toBiometrics(stale, NOW)).toBeUndefined();
  });

  it("keeps a reading exactly ON the window and drops it just past", () => {
    const at = [sig("hrv", 48, day(BIOMETRIC_FRESH_DAYS))];
    const past = [sig("hrv", 48, day(BIOMETRIC_FRESH_DAYS + 0.5))];
    expect(toBiometrics(at, NOW)).toBeDefined();
    expect(toBiometrics(past, NOW)).toBeUndefined();
  });

  it("neutralises ONE stale metric without discarding the fresh ones", () => {
    const mixed = [...RECENT, sig("sleep", 5.5, day(30))];
    const bio = toBiometrics(mixed, NOW)!;
    expect(bio.hrv.measured).toBe(true);
    expect(bio.sleep.measured).toBe(false);
    // A neutralised metric cannot move the score.
    expect(bio.sleep.today).toBe(bio.sleep.baseline);
  });

  it("treats an unparseable timestamp as stale rather than as today", () => {
    expect(toBiometrics([sig("hrv", 48, "not-a-date")], NOW)).toBeUndefined();
    expect(signalAgeDays("not-a-date", NOW)).toBeNull();
  });

  it("stops a months-old sync from pinning a permanent adjustment", () => {
    const old = [
      sig("hrv", 70, "2026-01-02"), sig("hrv", 70, "2026-01-03"), sig("hrv", 40, "2026-01-04"),
    ];
    const fat = computeFatigue([]);
    expect(toBiometrics(old, NOW)).toBeUndefined();
    expect(computeHpi(fat, toBiometrics(old, NOW)).components.recovery).toBe(0);
  });
});

describe("the legacy path no longer invents a reading", () => {
  const today = new Date(NOW).toISOString();
  const earlier = day(2);

  it("neutralises a missing field instead of substituting a constant", () => {
    // Real resting-HR history at 50; today's row simply has no resting HR. The
    // old code substituted 55bpm and charged the athlete for the difference.
    const bio = buildBiometrics([
      { date: earlier, restingHr: 50, hrv: 44 },
      { date: today, hrv: 45 },
    ], NOW)!;
    expect(bio.restingHr.measured).toBe(false);
    expect(bio.restingHr.today).toBe(bio.restingHr.baseline);
    expect(bio.hrv.measured).toBe(true);
  });

  it("gives a fabricated-field day an adjustment of zero from that field", () => {
    const withHole = buildBiometrics([
      { date: earlier, restingHr: 50 },
      { date: today, hrv: 44 },
    ], NOW)!;
    // hrv has no prior → baseline = today → 0; restingHr is neutral → 0.
    expect(biometricAdjustment(withHole)).toBe(0);
  });

  it("returns null for a stale latest entry", () => {
    expect(buildBiometrics([{ date: day(BIOMETRIC_FRESH_DAYS + 1), hrv: 44 }], NOW)).toBeNull();
  });

  it("returns null when the latest entry carries no usable field", () => {
    expect(buildBiometrics([{ date: today }], NOW)).toBeNull();
  });

  it("still reads a normal recent entry", () => {
    const bio = buildBiometrics([
      { date: earlier, hrv: 40 },
      { date: today, hrv: 50 },
    ], NOW)!;
    expect(bio.hrv.today).toBe(50);
    expect(bio.hrv.baseline).toBe(40);
    expect(biometricAdjustment(bio)).toBeGreaterThan(0);
  });
});

describe("wearableExplain — the door", () => {
  const bio = toBiometrics(RECENT, NOW)!;

  it("explains the SAME figure the card prints", () => {
    expect(wearableExplain(bio, NOW).total).toBe(biometricAdjustment(bio));
    expect(wearableExplain(bio, NOW).total).toBe(computeHpi(computeFatigue([]), bio).components.recovery);
  });

  it("returns one row per metric, keyed for i18n", () => {
    const e = wearableExplain(bio, NOW);
    expect(e.rows.map((r) => r.metric)).toEqual(["hrv", "restingHr", "sleep"]);
    for (const r of e.rows) expect(r.key).toBe(WEARABLE_METRIC_KEY[r.metric]);
  });

  it("carries the provenance the old copy asserted without checking", () => {
    const e = wearableExplain(bio, NOW);
    const hrv = e.rows.find((r) => r.metric === "hrv")!;
    expect(hrv.source).toBe("apple");
    expect(hrv.sourceLabel).toBe("Apple Watch / Health");
    expect(hrv.ageDays).toBe(0);
    expect(e.sources).toEqual(["apple"]);
  });

  it("reports an unmeasured metric as contributing nothing, with no source", () => {
    const e = wearableExplain(bio, NOW);
    const sleep = e.rows.find((r) => r.metric === "sleep")!;
    expect(sleep.measured).toBe(false);
    expect(sleep.points).toBe(0);
    expect(sleep.deviationPct).toBe(0);
    expect(sleep.source).toBeNull();
    expect(sleep.role).toBe("neutral");
  });

  it("signs each metric by whether it helped or hurt", () => {
    const e = wearableExplain(bio, NOW);
    // HRV below baseline hurts; resting HR above baseline hurts.
    expect(e.rows.find((r) => r.metric === "hrv")!.points).toBeLessThan(0);
    expect(e.rows.find((r) => r.metric === "restingHr")!.points).toBeLessThan(0);
    expect(e.rows.find((r) => r.metric === "hrv")!.role).toBe("caution");
  });

  it("keeps the rounding visible instead of hiding it in the rows", () => {
    const e = wearableExplain(bio, NOW);
    expect(Math.round(e.raw)).toBe(e.total);
    expect(e.clamped).toBe(false);
  });

  it("counts only the measured metrics", () => {
    expect(wearableExplain(bio, NOW).measuredCount).toBe(2);
    expect(wearableExplain(bio, NOW).freshDays).toBe(BIOMETRIC_FRESH_DAYS);
  });

  it("reports the clamp when the raw sum runs past the bound", () => {
    const wild = toBiometrics([
      sig("hrv", 100, day(3)), sig("hrv", 100, day(2)), sig("hrv", 20, day(0)),
      sig("restingHr", 40, day(3)), sig("restingHr", 40, day(2)), sig("restingHr", 75, day(0)),
    ], NOW)!;
    const e = wearableExplain(wild, NOW);
    expect(e.clamped).toBe(true);
    expect(e.total).toBe(-15);
    expect(e.raw).toBeLessThan(-15);
  });

  it("names a manual reading as manual rather than borrowing a device's name", () => {
    const manual = toBiometrics([
      sig("hrv", 60, day(3), "manual"), sig("hrv", 60, day(2), "manual"), sig("hrv", 48, day(0), "manual"),
    ], NOW)!;
    expect(wearableExplain(manual, NOW).rows[0]!.sourceLabel).toBe("manual");
    expect(wearableSourceLabel("whoop")).toBe("WHOOP");
    expect(wearableSourceLabel(null)).toBeNull();
  });

  it("lists BOTH sources when the metrics came from different places", () => {
    const mixed = toBiometrics([
      sig("hrv", 60, day(3), "apple"), sig("hrv", 60, day(2), "apple"), sig("hrv", 48, day(0), "apple"),
      sig("sleep", 8, day(2), "manual"), sig("sleep", 6, day(0), "manual"),
    ], NOW)!;
    expect(wearableExplain(mixed, NOW).sources).toEqual(["apple", "manual"]);
  });
});
