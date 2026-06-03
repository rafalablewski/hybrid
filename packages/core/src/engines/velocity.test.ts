import { describe, it, expect } from "vitest";
import {
  summarizeSet,
  velocityZone,
  velocityLossReached,
  fitLoadVelocityProfile,
  bestPointPerLoad,
  velocityAtLoad,
  loadForVelocity,
  percent1rmForVelocity,
  roundToIncrement,
  suggestLoad,
  mvtFor,
  lvPointsFromSessions,
  liftsWithVelocity,
  velocityProfileFor,
} from "./velocity";
import type { VelocitySet, LVPoint } from "./velocity";
import type { LoggedSession } from "./session";

describe("velocity zones", () => {
  it("classifies by mean concentric velocity", () => {
    expect(velocityZone(0.3).id).toBe("absolute-strength");
    expect(velocityZone(0.6).id).toBe("strength-speed");
    expect(velocityZone(0.85).id).toBe("speed-strength");
    expect(velocityZone(1.1).id).toBe("accelerative");
    expect(velocityZone(1.5).id).toBe("starting-speed");
  });

  it("is inclusive of the lower bound, exclusive of the upper", () => {
    expect(velocityZone(0.5).id).toBe("strength-speed"); // 0.5 belongs to the next band up
    expect(velocityZone(0).id).toBe("absolute-strength");
  });
});

describe("summarizeSet", () => {
  const set: VelocitySet = {
    load: 100,
    reps: [
      { meanVelocity: 0.50, peakVelocity: 0.9, rom: 60 },
      { meanVelocity: 0.46, rom: 58 },
      { meanVelocity: 0.40, rom: 56 },
    ],
  };

  it("computes best/mean/final velocity", () => {
    const s = summarizeSet(set);
    expect(s.bestVelocity).toBeCloseTo(0.5);
    expect(s.finalVelocity).toBeCloseTo(0.4);
    expect(s.meanVelocity).toBeCloseTo((0.5 + 0.46 + 0.4) / 3);
    expect(s.reps).toBe(3);
  });

  it("computes velocity loss from best to final rep", () => {
    expect(summarizeSet(set).velocityLossPct).toBeCloseTo(20); // (0.5-0.4)/0.5
  });

  it("averages ROM and surfaces peak when present", () => {
    const s = summarizeSet(set);
    expect(s.meanRom).toBeCloseTo((60 + 58 + 56) / 3);
    expect(s.peakVelocity).toBeCloseTo(0.9);
  });

  it("velocityLossReached fires once loss exceeds the cap", () => {
    // set loses ≈20% from best (0.50) to final (0.40)
    expect(velocityLossReached(set, 19)).toBe(true);
    expect(velocityLossReached(set, 21)).toBe(false);
  });
});

describe("load–velocity profile", () => {
  // Perfect line: v = 1.0 - 0.005·load  →  v0=1.0, and v=0.3 (squat MVT) at 140 kg.
  const points: LVPoint[] = [
    { load: 60, velocity: 0.7 },
    { load: 80, velocity: 0.6 },
    { load: 100, velocity: 0.5 },
    { load: 120, velocity: 0.4 },
  ];

  it("fits slope, intercept and r² on clean data", () => {
    const p = fitLoadVelocityProfile(points, 0.3);
    expect(p.slope).toBeCloseTo(-0.005);
    expect(p.intercept).toBeCloseTo(1.0);
    expect(p.v0).toBeCloseTo(1.0);
    expect(p.r2).toBeCloseTo(1, 5);
    expect(p.n).toBe(4);
  });

  it("estimates 1RM as the load at the minimal velocity threshold", () => {
    const p = fitLoadVelocityProfile(points, 0.3);
    expect(p.estimated1rm).toBeCloseTo(140); // (0.3 - 1.0) / -0.005
  });

  it("needs ≥2 distinct loads", () => {
    expect(fitLoadVelocityProfile([{ load: 100, velocity: 0.5 }]).estimated1rm).toBe(0);
    expect(
      fitLoadVelocityProfile([
        { load: 100, velocity: 0.5 },
        { load: 100, velocity: 0.4 },
      ]).estimated1rm,
    ).toBe(0); // identical loads collapse to one point
  });

  it("bestPointPerLoad keeps the fastest velocity at each load", () => {
    const reduced = bestPointPerLoad([
      { load: 100, velocity: 0.4 },
      { load: 100, velocity: 0.5 },
      { load: 80, velocity: 0.6 },
    ]);
    expect(reduced).toEqual([
      { load: 80, velocity: 0.6 },
      { load: 100, velocity: 0.5 },
    ]);
  });

  it("predicts velocity and inverts to load", () => {
    const p = fitLoadVelocityProfile(points, 0.3);
    expect(velocityAtLoad(p, 100)).toBeCloseTo(0.5);
    expect(loadForVelocity(p, 0.5)).toBeCloseTo(100);
  });

  it("maps velocity to %1RM", () => {
    const p = fitLoadVelocityProfile(points, 0.3); // 1RM = 140
    expect(percent1rmForVelocity(p, 0.5)).toBeCloseTo((100 / 140) * 100);
  });
});

describe("load recommendation", () => {
  const points: LVPoint[] = [
    { load: 60, velocity: 0.7 },
    { load: 100, velocity: 0.5 },
    { load: 120, velocity: 0.4 },
  ];

  it("rounds to the plate increment", () => {
    expect(roundToIncrement(101.2)).toBe(100);
    expect(roundToIncrement(103.9)).toBe(105);
    expect(roundToIncrement(102, 5)).toBe(100);
  });

  it("suggests a load for a target velocity", () => {
    const p = fitLoadVelocityProfile(points, 0.3);
    const s = suggestLoad(p, { targetVelocity: 0.5 });
    expect(s).not.toBeNull();
    expect(s!.load).toBe(100);
  });

  it("suggests a load for a target %1RM", () => {
    const p = fitLoadVelocityProfile(points, 0.3); // 1RM = 140
    const s = suggestLoad(p, { targetPct: 80 });
    expect(s).not.toBeNull();
    expect(s!.load).toBe(112.5); // 80% of 140 = 112, rounded to 2.5
    expect(s!.percent1rm).toBeGreaterThan(75);
  });

  it("returns null without a fitted 1RM", () => {
    const flat = fitLoadVelocityProfile([{ load: 100, velocity: 0.5 }]);
    expect(suggestLoad(flat, { targetVelocity: 0.5 })).toBeNull();
  });
});

describe("MVT lookup", () => {
  it("is movement-specific and case-insensitive, with a default", () => {
    expect(mvtFor("Back Squat")).toBe(0.3);
    expect(mvtFor("bench press")).toBe(0.15);
    expect(mvtFor("Some Accessory")).toBe(0.3);
  });
});

describe("bridge from logged sessions", () => {
  const sessions: LoggedSession[] = [
    {
      id: "1",
      title: "Ramp",
      startedAt: "2026-05-20T10:00:00.000Z",
      blocks: [
        {
          kind: "strength",
          name: "Back Squat",
          sets: [
            { load: "60", reps: "3", vel: "0.7" },
            { load: "100", reps: "3", vel: "0.5" },
            { load: "120", reps: "1", vel: "0.4" },
          ],
        },
        { kind: "strength", name: "Bench Press", sets: [{ load: "80", reps: "5" }] },
      ],
    },
  ];

  it("pulls (load, velocity) points for a lift", () => {
    const pts = lvPointsFromSessions(sessions, "Back Squat");
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ load: 60, velocity: 0.7 });
  });

  it("lists only lifts that have velocity data", () => {
    expect(liftsWithVelocity(sessions)).toEqual(["Back Squat"]);
  });

  it("builds a profile end-to-end with the lift's MVT", () => {
    const p = velocityProfileFor(sessions, "Back Squat");
    expect(p.n).toBe(3);
    expect(p.mvt).toBe(0.3);
    expect(p.estimated1rm).toBeGreaterThan(120);
  });
});
