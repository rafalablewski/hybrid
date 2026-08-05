import { describe, it, expect } from "vitest";
import {
  computeFatigue,
  computeHpi,
  enduranceFatigue,
  STRENGTH_WEIGHTS,
  ENDURANCE_WEIGHTS,
  rollingBaseline,
  orientedZ,
  toBiometrics,
  latest,
  computeReadiness,
  SAMPLE_TRAINING_LOG,
} from "./index";
import type { Signal, TrainingLog } from "./index";

const sig = (
  kind: Signal["kind"],
  value: number,
  ts: string,
  source = "manual",
): Signal => ({ athleteId: "a1", kind, value, unit: "", source, ts });

/** The fixtures below are DATED, so they must be read against their own clock.
 *  `toBiometrics` only treats a reading as today's within BIOMETRIC_FRESH_DAYS,
 *  and leaving these on Date.now() would make them pass or fail depending on
 *  when the suite runs — which is exactly the staleness the window exists to
 *  catch. This is the morning after the newest fixture reading. */
const AS_OF = Date.parse("2026-06-04T09:00:00Z");

describe("signal ontology", () => {
  const series: Signal[] = [
    sig("hrv", 60, "2026-06-01"),
    sig("hrv", 64, "2026-06-02"),
    sig("hrv", 50, "2026-06-03"),
    sig("restingHr", 48, "2026-06-03"),
    sig("sleep", 7.5, "2026-06-03"),
  ];

  it("rolls a baseline (mean + sd) over the window", () => {
    const b = rollingBaseline(series, "hrv");
    expect(b.n).toBe(3);
    expect(b.mean).toBeCloseTo(58, 5);
    expect(b.sd).toBeGreaterThan(0);
  });

  it("returns an empty baseline when the kind is absent", () => {
    expect(rollingBaseline(series, "jumpHeight").n).toBe(0);
  });

  it("orients z-scores so positive always means 'better'", () => {
    const hrvBase = rollingBaseline(series, "hrv");
    // an HRV well above baseline is good → positive
    expect(orientedZ(80, hrvBase, "hrv")).toBeGreaterThan(0);
    // a resting HR above baseline is bad → negative, even though value rose
    const hrBase = { mean: 50, sd: 4, n: 10 };
    expect(orientedZ(58, hrBase, "restingHr")).toBeLessThan(0);
  });

  it("latest() picks the newest reading", () => {
    expect(latest(series, "hrv")?.value).toBe(50);
  });

  it("adapts signals into the engines' Biometrics shape", () => {
    const bio = toBiometrics(series, AS_OF);
    expect(bio).toBeDefined();
    expect(bio!.hrv.today).toBe(50);
    expect(bio!.hrv.better).toBe("high");
    expect(bio!.restingHr.better).toBe("low");
    // and that adapter actually drives readiness without engine changes
    const r = computeReadiness(computeFatigue([]), bio);
    expect(r.score).toBeGreaterThanOrEqual(35);
    expect(r.score).toBeLessThanOrEqual(98);
  });

  it("returns undefined when there are no recovery signals", () => {
    expect(toBiometrics([sig("jumpHeight", 40, "2026-06-03")], AS_OF)).toBeUndefined();
  });
});

describe("HPI", () => {
  it("scores 0..100 and reports its three pillars", () => {
    const hpi = computeHpi(computeFatigue(SAMPLE_TRAINING_LOG));
    expect(hpi.score).toBeGreaterThanOrEqual(0);
    expect(hpi.score).toBeLessThanOrEqual(100);
    expect(hpi.components.strength).toBeGreaterThanOrEqual(0);
    expect(hpi.components.endurance).toBeGreaterThanOrEqual(0);
    expect(["peak", "primed", "moderate", "compromised", "depleted"]).toContain(
      hpi.band,
    );
  });

  it("a fresh athlete scores higher than a cooked one", () => {
    const fresh = computeHpi(computeFatigue([]));
    const cooked = computeHpi(
      computeFatigue([
        { daysAgo: 0, items: [{ move: "Back Squat", topRpe: 10, hardSets: 8 }] },
      ]),
    );
    expect(fresh.score).toBeGreaterThan(cooked.score);
  });

  it("endurance fatigue saturates with conditioning load", () => {
    const light = computeFatigue([
      { daysAgo: 0, items: [{ move: "Easy Run", system: "aerobic", minutes: 20, rpe: 4 }] },
    ]);
    const crushing = computeFatigue([
      { daysAgo: 0, items: [{ move: "Row Intervals", system: "threshold", minutes: 90, rpe: 9 }] },
    ]);
    expect(enduranceFatigue(crushing)).toBeGreaterThan(enduranceFatigue(light));
    expect(enduranceFatigue(crushing)).toBeLessThanOrEqual(100);
  });

  it("flags the limiting pillar", () => {
    // hammer conditioning only → endurance should be the limiter
    const log: TrainingLog = [
      { daysAgo: 0, items: [{ move: "Row Intervals", system: "threshold", minutes: 90, rpe: 9 }] },
    ];
    expect(computeHpi(computeFatigue(log)).limiter).toBe("endurance");
  });

  it("respects sport weighting", () => {
    // an athlete fresh in muscle but loaded in conditioning:
    const log: TrainingLog = [
      { daysAgo: 0, items: [{ move: "Row Intervals", system: "threshold", minutes: 90, rpe: 9 }] },
    ];
    const f = computeFatigue(log);
    const strengthBiased = computeHpi(f, undefined, STRENGTH_WEIGHTS);
    const enduranceBiased = computeHpi(f, undefined, ENDURANCE_WEIGHTS);
    // weighting toward strength (which is fresh) reads higher than weighting
    // toward the hammered endurance system
    expect(strengthBiased.score).toBeGreaterThan(enduranceBiased.score);
  });

  it("recovery signal moves the score", () => {
    const f = computeFatigue(SAMPLE_TRAINING_LOG);
    const goodBio = toBiometrics([
      sig("hrv", 50, "2026-06-01"),
      sig("hrv", 50, "2026-06-02"),
      sig("hrv", 80, "2026-06-03"),
      sig("restingHr", 60, "2026-06-01"),
      sig("restingHr", 60, "2026-06-02"),
      sig("restingHr", 48, "2026-06-03"),
      sig("sleep", 7, "2026-06-01"),
      sig("sleep", 7, "2026-06-02"),
      sig("sleep", 9, "2026-06-03"),
    ], AS_OF);
    const without = computeHpi(f);
    const withBio = computeHpi(f, goodBio);
    expect(withBio.components.recovery).toBeGreaterThan(0);
    expect(withBio.score).toBeGreaterThanOrEqual(without.score);
  });
});
