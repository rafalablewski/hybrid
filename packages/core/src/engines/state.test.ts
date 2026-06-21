import { describe, it, expect } from "vitest";
import {
  computePerformanceState,
  computeInjuryRisk,
  performanceTrajectory,
  SAMPLE_TRAINING_LOG,
  SAMPLE_BIOMETRICS,
} from "./index";
import type { TrainingLog } from "./index";

describe("computePerformanceState", () => {
  it("materializes hpi + readiness + fatigue + ranked drivers + summary", () => {
    const s = computePerformanceState(SAMPLE_TRAINING_LOG, SAMPLE_BIOMETRICS);
    expect(s.hpi.score).toBeGreaterThanOrEqual(0);
    expect(s.readiness.score).toBeGreaterThanOrEqual(35);
    expect(s.drivers.length).toBeGreaterThan(0);
    expect(s.summary).toContain("HPI");
    // drivers are ranked, biggest first
    for (let i = 1; i < s.drivers.length; i++)
      expect(s.drivers[i - 1]!.weight).toBeGreaterThanOrEqual(s.drivers[i]!.weight);
  });

  it("surfaces the most-loaded tissue as a negative driver", () => {
    const log: TrainingLog = [
      { daysAgo: 0, items: [{ move: "Back Squat", topRpe: 9, hardSets: 8 }] },
    ];
    const s = computePerformanceState(log);
    const tissue = s.drivers.find((d) => d.factor.includes("fatigue"));
    expect(tissue).toBeDefined();
    expect(tissue!.impact).toBe("negative");
  });

  it("credits good recovery as a positive driver", () => {
    const s = computePerformanceState(SAMPLE_TRAINING_LOG, SAMPLE_BIOMETRICS);
    // SAMPLE_BIOMETRICS has HRV up / resting HR down → at least one positive
    expect(s.drivers.some((d) => d.impact === "positive")).toBe(true);
  });

  it("works without biometrics (load-only drivers)", () => {
    const s = computePerformanceState(SAMPLE_TRAINING_LOG);
    expect(s.hpi.score).toBeGreaterThanOrEqual(0);
    expect(s.drivers.every((d) => d.factor !== "HRV")).toBe(true);
  });
});

describe("computeInjuryRisk", () => {
  it("scores every tissue 0..100 with a band, sorted by risk", () => {
    const r = computeInjuryRisk(SAMPLE_TRAINING_LOG, SAMPLE_BIOMETRICS);
    expect(r.tissues.length).toBeGreaterThan(0);
    for (const t of r.tissues) {
      expect(t.risk).toBeGreaterThanOrEqual(0);
      expect(t.risk).toBeLessThanOrEqual(100);
      expect(["low", "moderate", "elevated", "high"]).toContain(t.band);
    }
    for (let i = 1; i < r.tissues.length; i++)
      expect(r.tissues[i - 1]!.risk).toBeGreaterThanOrEqual(r.tissues[i]!.risk);
  });

  it("flags a tissue when load spikes acutely against its chronic base", () => {
    // a modest chronic base, then a big acute week on the squat pattern
    const log: TrainingLog = [
      { daysAgo: 1, items: [{ move: "Back Squat", topRpe: 9, hardSets: 10 }] },
      { daysAgo: 2, items: [{ move: "Back Squat", topRpe: 9, hardSets: 9 }] },
      { daysAgo: 20, items: [{ move: "Back Squat", topRpe: 7, hardSets: 2 }] },
      { daysAgo: 25, items: [{ move: "Back Squat", topRpe: 7, hardSets: 2 }] },
    ];
    const r = computeInjuryRisk(log);
    const quad = r.tissues.find((t) => t.tissue === "quads")!;
    expect(quad.acwr).toBeGreaterThan(1.3);
    expect(quad.risk).toBeGreaterThan(0);
    expect(quad.drivers.some((d) => d.label.includes("spike"))).toBe(true);
  });

  it("a balanced, well-recovered athlete carries low overall risk", () => {
    const steady: TrainingLog = Array.from({ length: 8 }, (_, i) => ({
      daysAgo: i * 3 + 1,
      items: [{ move: "Back Squat", topRpe: 7, hardSets: 4 }],
    }));
    const r = computeInjuryRisk(steady, SAMPLE_BIOMETRICS);
    expect(r.overall).toBeLessThan(50);
  });

  it("marks tissues with no chronic history as not-enough-history", () => {
    const log: TrainingLog = [
      { daysAgo: 1, items: [{ move: "Bench Press", topRpe: 8, hardSets: 4 }] },
    ];
    const r = computeInjuryRisk(log);
    const chest = r.tissues.find((t) => t.tissue === "chest")!;
    expect(chest.enoughHistory).toBe(true); // within 28d window it has chronic load
    const back = r.tissues.find((t) => t.tissue === "glutes")!;
    expect(back.enoughHistory).toBe(false); // untouched tissue
  });

  it("(trajectory) returns one point per day, oldest first, ending today", () => {
    const traj = performanceTrajectory(SAMPLE_TRAINING_LOG, 10);
    expect(traj).toHaveLength(10);
    expect(traj[0]!.daysAgo).toBe(9);
    expect(traj[traj.length - 1]!.daysAgo).toBe(0);
    for (const p of traj) {
      expect(p.hpi).toBeGreaterThanOrEqual(0);
      expect(p.hpi).toBeLessThanOrEqual(100);
    }
  });

  it("(trajectory) today's point matches a direct state compute", () => {
    const traj = performanceTrajectory(SAMPLE_TRAINING_LOG, 14);
    const today = traj[traj.length - 1]!;
    const direct = computePerformanceState(SAMPLE_TRAINING_LOG);
    expect(today.hpi).toBe(direct.hpi.score);
  });
});

describe("computeInjuryRisk recovery", () => {
  it("recovery suppression raises risk across tissues", () => {
    const log: TrainingLog = [
      { daysAgo: 1, items: [{ move: "Back Squat", topRpe: 8, hardSets: 5 }] },
      { daysAgo: 15, items: [{ move: "Back Squat", topRpe: 8, hardSets: 5 }] },
    ];
    const suppressed = {
      hrv: { today: 35, baseline: 60, unit: "ms", better: "high" as const },
      restingHr: { today: 68, baseline: 55, unit: "bpm", better: "low" as const },
      sleep: { today: 5, baseline: 7.5, unit: "h", better: "high" as const },
    };
    const withBad = computeInjuryRisk(log, suppressed).overall;
    const without = computeInjuryRisk(log).overall;
    expect(withBad).toBeGreaterThan(without);
  });
});
