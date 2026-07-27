import { describe, it, expect } from "vitest";
import {
  estimateSessionEnergy,
  sessionEnergy,
  runningMet,
  walkingMet,
  cyclingMet,
  swimmingMet,
  rowingMet,
  sportMet,
  rpeFactor,
} from "./energy";
import type { LoggedSession, SessionBlock } from "./engines/session";

describe("MET models", () => {
  it("scales running METs with speed and with incline", () => {
    const easy = runningMet(10);
    const fast = runningMet(16);
    expect(fast).toBeGreaterThan(easy);
    // 10 km/h is the textbook ~10 MET run.
    expect(easy).toBeGreaterThan(9);
    expect(easy).toBeLessThan(11);
    expect(runningMet(10, 5)).toBeGreaterThan(easy);
  });

  it("keeps walking well below running at the same speed", () => {
    expect(walkingMet(6)).toBeLessThan(runningMet(6));
  });

  it("bands cycling, swimming and rowing by pace", () => {
    expect(cyclingMet(14)).toBeLessThan(cyclingMet(28));
    // slower per-100m swim pace = lower intensity
    expect(swimmingMet(160)).toBeLessThan(swimmingMet(80));
    expect(rowingMet(160)).toBeLessThan(rowingMet(100));
  });

  it("reads METs from the sport catalog, by name then by category", () => {
    expect(sportMet("Judo")).toBe(10.3);
    // no explicit entry → the Team category fallback, not a guess of zero
    expect(sportMet("Ice Hockey")).toBeGreaterThan(0);
    expect(sportMet("Not A Sport")).toBeNull();
  });

  it("moves the estimate ±30% at most on RPE alone", () => {
    expect(rpeFactor(6)).toBe(1);
    expect(rpeFactor(10)).toBeLessThanOrEqual(1.3);
    expect(rpeFactor(1)).toBeGreaterThanOrEqual(0.7);
    expect(rpeFactor(undefined)).toBe(1);
  });
});

describe("estimateSessionEnergy", () => {
  const run: SessionBlock[] = [
    { kind: "cardio", name: "Running", discipline: "running", distance: 10, minutes: 50 },
  ];

  it("returns null without a bodyweight — the formula is linear in mass", () => {
    expect(estimateSessionEnergy(run, { bodyweightKg: null })).toBeNull();
    expect(estimateSessionEnergy(run, { bodyweightKg: 0 })).toBeNull();
  });

  it("estimates a 10 km run in the right ballpark and flags the basis as pace", () => {
    const e = estimateSessionEnergy(run, { bodyweightKg: 75 })!;
    // ~1 kcal per kg per km is the well-known rule of thumb → ~750 kcal.
    expect(e.kcal).toBeGreaterThan(550);
    expect(e.kcal).toBeLessThan(950);
    expect(e.basis).toBe("pace");
    expect(e.minutes).toBe(50);
  });

  it("scales linearly with bodyweight", () => {
    const light = estimateSessionEnergy(run, { bodyweightKg: 60 })!;
    const heavy = estimateSessionEnergy(run, { bodyweightKg: 120 })!;
    expect(heavy.kcal / light.kcal).toBeGreaterThan(1.9);
    expect(heavy.kcal / light.kcal).toBeLessThan(2.1);
  });

  it("falls back to the sport table when there is no distance", () => {
    const e = estimateSessionEnergy([{ kind: "cardio", name: "Judo", discipline: "sport", minutes: 60 }], {
      bodyweightKg: 80,
    })!;
    expect(e.basis).toBe("sport");
    expect(e.kcal).toBeGreaterThan(600);
  });

  it("counts gym time only when the caller attributes minutes to it", () => {
    const lift: SessionBlock[] = [{ kind: "strength", name: "Bench Press", sets: [{ load: "80", reps: "5" }] }];
    expect(estimateSessionEnergy(lift, { bodyweightKg: 80 })).toBeNull();
    const e = estimateSessionEnergy(lift, { bodyweightKg: 80, strengthMinutes: 60 })!;
    expect(e.minutes).toBe(60);
    expect(e.kcal).toBeGreaterThan(300);
  });

  it("prefers the strongest basis across a mixed session", () => {
    const mixed: SessionBlock[] = [
      { kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5", rpe: "8" }] },
      ...run,
    ];
    expect(estimateSessionEnergy(mixed, { bodyweightKg: 80, strengthMinutes: 30 })!.basis).toBe("pace");
  });
});

describe("sessionEnergy", () => {
  it("gives the strength blocks only the time the cardio blocks did not claim", () => {
    const session: LoggedSession = {
      id: "s1",
      title: "Upper + engine",
      startedAt: "2026-01-10T10:00:00.000Z",
      blocks: [
        { kind: "strength", name: "Bench Press", sets: [{ load: "80", reps: "5" }] },
        { kind: "cardio", name: "Running", discipline: "running", distance: 5, minutes: 25 },
      ],
    };
    const e = sessionEnergy(session, { bodyweightKg: 80, durationMin: 75 })!;
    // 25 min of running + the 50 min left over for the lift
    expect(e.minutes).toBe(75);
  });

  it("never double-counts when the cardio already fills the duration", () => {
    const session: LoggedSession = {
      id: "s2",
      title: "Easy run",
      startedAt: "2026-01-10T10:00:00.000Z",
      blocks: [{ kind: "cardio", name: "Running", discipline: "running", distance: 8, minutes: 45 }],
    };
    expect(sessionEnergy(session, { bodyweightKg: 80, durationMin: 45 })!.minutes).toBe(45);
  });
});
