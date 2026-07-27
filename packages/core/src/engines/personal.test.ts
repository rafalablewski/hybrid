import { describe, expect, it } from "vitest";
import {
  acwrEventsFromHistory,
  derivePersonalization,
  maxAcwrAt,
  SPIKE_ONSET_MAX,
  SPIKE_ONSET_MIN,
  SPIKE_ONSET_PRIOR,
  type AcwrEvent,
} from "./personal";
import { computeInjuryRisk } from "./injury";
import { SAMPLE_TRAINING_LOG } from "./sample-data";
import type { TrainingLog } from "./types";

describe("derivePersonalization", () => {
  it("stays on the prior with no evidence", () => {
    const p = derivePersonalization([]);
    expect(p.spikeOnset).toBe(SPIKE_ONSET_PRIOR);
    expect(p.personalized).toBe(false);
    expect(p.n).toBe(0);
  });

  it("ignores uninformative events (no spike, no injury)", () => {
    const p = derivePersonalization([
      { acwr: 1.0, injured: false },
      { acwr: 1.2, injured: false },
    ]);
    expect(p.n).toBe(0);
    expect(p.spikeOnset).toBe(SPIKE_ONSET_PRIOR);
  });

  it("tolerated spikes raise the onset, bounded by the max", () => {
    const tolerated: AcwrEvent[] = Array.from({ length: 20 }, () => ({ acwr: 1.7, injured: false }));
    const p = derivePersonalization(tolerated);
    expect(p.spikeOnset).toBeGreaterThan(SPIKE_ONSET_PRIOR);
    expect(p.spikeOnset).toBeLessThanOrEqual(SPIKE_ONSET_MAX);
    expect(p.toleratedSpikes).toBe(20);
    expect(p.personalized).toBe(true);
  });

  it("injuries at low ACWR lower the onset, bounded by the min", () => {
    const injuries: AcwrEvent[] = Array.from({ length: 20 }, () => ({ acwr: 1.15, injured: true }));
    const p = derivePersonalization(injuries);
    expect(p.spikeOnset).toBeLessThan(SPIKE_ONSET_PRIOR);
    expect(p.spikeOnset).toBeGreaterThanOrEqual(SPIKE_ONSET_MIN);
    expect(p.injuries).toBe(20);
  });

  it("shrinks: a single event barely moves the onset, many events move it more", () => {
    const one = derivePersonalization([{ acwr: 1.7, injured: false }]);
    const many = derivePersonalization(Array.from({ length: 30 }, () => ({ acwr: 1.7, injured: false })));
    expect(one.spikeOnset).toBeGreaterThan(SPIKE_ONSET_PRIOR);
    expect(many.spikeOnset).toBeGreaterThan(one.spikeOnset);
  });

  it("mixed evidence lands between the pulls", () => {
    const p = derivePersonalization([
      ...Array.from({ length: 10 }, () => ({ acwr: 1.6, injured: false })),
      ...Array.from({ length: 10 }, () => ({ acwr: 1.2, injured: true })),
    ]);
    expect(p.spikeOnset).toBeGreaterThan(SPIKE_ONSET_MIN);
    expect(p.spikeOnset).toBeLessThan(SPIKE_ONSET_MAX);
  });
});

describe("computeInjuryRisk with a personal spike onset", () => {
  // a spiky log: heavy recent week vs light chronic history
  const spiky: TrainingLog = [
    { daysAgo: 1, items: [{ move: "Back Squat", topRpe: 9, hardSets: 8 }] },
    { daysAgo: 3, items: [{ move: "Back Squat", topRpe: 9, hardSets: 8 }] },
    { daysAgo: 20, items: [{ move: "Back Squat", topRpe: 7, hardSets: 2 }] },
  ];

  it("defaults exactly to the population behavior", () => {
    const a = computeInjuryRisk(spiky);
    const b = computeInjuryRisk(spiky, undefined, undefined, { spikeOnset: 1.3 });
    expect(b.overall).toBe(a.overall);
    expect(b.tissues.map((t) => t.risk)).toEqual(a.tissues.map((t) => t.risk));
  });

  it("a robust athlete (higher onset) scores lower or equal risk", () => {
    const base = computeInjuryRisk(spiky);
    const robust = computeInjuryRisk(spiky, undefined, undefined, { spikeOnset: 1.6 });
    expect(robust.overall).toBeLessThanOrEqual(base.overall);
  });

  it("a fragile athlete (lower onset) scores higher or equal risk", () => {
    const base = computeInjuryRisk(spiky);
    const fragile = computeInjuryRisk(spiky, undefined, undefined, { spikeOnset: 1.1 });
    expect(fragile.overall).toBeGreaterThanOrEqual(base.overall);
  });
});

describe("acwrEventsFromHistory", () => {
  it("replays the peak ACWR at each outcome date and drops no-history outcomes", () => {
    const events = acwrEventsFromHistory(SAMPLE_TRAINING_LOG, [
      { daysAgo: 0, injured: false },
      { daysAgo: 500, injured: true }, // long before any session — no history
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]!.acwr).toBeCloseTo(maxAcwrAt(SAMPLE_TRAINING_LOG, 0), 10);
    expect(events[0]!.injured).toBe(false);
  });

  it("maxAcwrAt rebases the log to the target day", () => {
    const today = maxAcwrAt(SAMPLE_TRAINING_LOG, 0);
    expect(today).toBeGreaterThan(0);
    // rebased far into the past there is nothing to compute
    expect(maxAcwrAt(SAMPLE_TRAINING_LOG, 500)).toBe(0);
  });
});
