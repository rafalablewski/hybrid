import { describe, it, expect } from "vitest";
import {
  computePerformanceState,
  computeInjuryRisk,
  MIN_HISTORY_DAYS,
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
    // A single session gives chest load inside the ACUTE window only — there is
    // nothing before this week to ratio against, so the ACWR isn't trusted.
    const chest = r.tissues.find((t) => t.tissue === "chest")!;
    expect(chest.enoughHistory).toBe(false);
    const back = r.tissues.find((t) => t.tissue === "glutes")!;
    expect(back.enoughHistory).toBe(false); // untouched tissue
  });

  // Regression: acute₇ / (chronic₂₈ / 4) collapses to exactly 4.00 when every
  // logged session sits inside the acute window — the formula's ceiling, not a
  // workload spike. It used to be reported as a real ACWR on every tissue and
  // fed each one a phantom 55-point spike driver.
  it("does not report the degenerate 4.00 ACWR when all training is inside the acute window", () => {
    const log: TrainingLog = [
      { daysAgo: 0, items: [{ move: "Back Squat", topRpe: 8, hardSets: 5 }] },
      { daysAgo: 2, items: [{ move: "Bench Press", topRpe: 8, hardSets: 4 }] },
      { daysAgo: 3, items: [{ move: "Deadlift", topRpe: 9, hardSets: 3 }] },
      { daysAgo: 5, items: [{ move: "Pull-up", topRpe: 8, hardSets: 4 }] },
    ];
    const r = computeInjuryRisk(log);
    for (const t of r.tissues) {
      expect(t.enoughHistory).toBe(false);
      expect(t.acwr).toBe(1);
      expect(t.drivers.some((d) => d.kind === "spike")).toBe(false);
      expect(t.drivers.some((d) => d.kind === "detrain")).toBe(false);
    }
    // Absolute tissue load still scores — a new athlete gets a real number,
    // just not a fabricated spike.
    expect(r.overall).toBeLessThan(50);
    expect(r.flagged).toHaveLength(0);
    // …and the clients are told to explain the dash, since this athlete IS
    // training — every tissue they loaded is waiting on a baseline.
    expect(r.awaitingBaseline.length).toBeGreaterThan(0);
    expect(r.historyDays).toBe(5);
    expect(r.minHistoryDays).toBe(MIN_HISTORY_DAYS);
  });

  it("only asks for the explainer about tissues the athlete actually trained", () => {
    const log: TrainingLog = [
      { daysAgo: 1, items: [{ move: "Bench Press", topRpe: 8, hardSets: 4 }] },
    ];
    const r = computeInjuryRisk(log);
    // Chest was trained this week with no baseline → explain it. Everything
    // else is simply untrained, which needs no explanation.
    expect(r.awaitingBaseline).toContain("chest");
    expect(r.awaitingBaseline).not.toContain("glutes");
  });

  it("stops asking for the explainer once every trained tissue has a baseline", () => {
    const log: TrainingLog = Array.from({ length: 10 }, (_, i) => ({
      daysAgo: i * 3 + 1,
      items: [{ move: "Back Squat", topRpe: 7, hardSets: 4 }],
    }));
    expect(computeInjuryRisk(log).awaitingBaseline).toEqual([]);
  });

  it("an empty log asks for nothing", () => {
    const r = computeInjuryRisk([]);
    expect(r.awaitingBaseline).toEqual([]);
    expect(r.historyDays).toBe(0);
  });

  it("a tissue trained for the first time this week gets no ACWR, even with a long log", () => {
    const log: TrainingLog = [
      // months of squatting…
      ...Array.from({ length: 9 }, (_, i) => ({
        daysAgo: i * 3 + 1,
        items: [{ move: "Back Squat", topRpe: 7, hardSets: 4 }],
      })),
      // …then bench for the very first time, this week
      { daysAgo: 2, items: [{ move: "Bench Press", topRpe: 8, hardSets: 6 }] },
    ];
    const r = computeInjuryRisk(log);
    expect(r.tissues.find((t) => t.tissue === "quads")!.enoughHistory).toBe(true);
    const chest = r.tissues.find((t) => t.tissue === "chest")!;
    expect(chest.enoughHistory).toBe(false);
    expect(chest.acwr).toBe(1);
  });

  it("trusts the ratio once the log reaches back past the acute window", () => {
    const log: TrainingLog = [
      { daysAgo: 1, items: [{ move: "Back Squat", topRpe: 9, hardSets: 10 }] },
      { daysAgo: 16, items: [{ move: "Back Squat", topRpe: 7, hardSets: 2 }] },
      { daysAgo: 22, items: [{ move: "Back Squat", topRpe: 7, hardSets: 2 }] },
    ];
    const quad = computeInjuryRisk(log).tissues.find((t) => t.tissue === "quads")!;
    expect(quad.enoughHistory).toBe(true);
    expect(quad.acwr).toBeGreaterThan(1.3);
    expect(quad.acwr).toBeLessThan(4);
    expect(quad.drivers.some((d) => d.kind === "spike")).toBe(true);
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
