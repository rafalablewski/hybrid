import { describe, expect, it } from "vitest";
import { sessionFactCount, sessionSetFacts, workingFacts } from "./session-facts";
import { bodyweightLookup } from "./bodyweight";
import type { DeviceWorkout, LoggedSession } from "./index";

const session = (over: Partial<LoggedSession> = {}): LoggedSession => ({
  id: "s1",
  title: "Session",
  startedAt: "2026-08-01T09:00:00.000Z",
  blocks: [],
  ...over,
});

describe("sessionSetFacts — strength", () => {
  it("emits one row per set, in block-then-set order", () => {
    const facts = sessionSetFacts(
      session({
        blocks: [
          {
            kind: "strength",
            name: "Back Squat",
            sets: [
              { load: "60", reps: "5", role: "warmup" },
              { load: "100", reps: "5", rpe: "8", rest: 180 },
              { load: "100", reps: "4", rpe: "9" },
            ],
          },
          { kind: "strength", name: "Bench Press", sets: [{ load: "80", reps: "5" }] },
        ],
      }),
    );
    expect(facts).toHaveLength(4);
    expect(facts.map((f) => [f.blockIndex, f.setIndex])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ]);
    expect(facts[0]!.role).toBe("warmup");
    expect(facts[1]!.role).toBe("working");
    expect(facts[1]!.rpe).toBe(8);
    expect(facts[1]!.restSec).toBe(180);
    expect(facts[3]!.exercise).toBe("Bench Press");
  });

  it("computes volume, e1RM and the movement pattern", () => {
    const [set] = sessionSetFacts(
      session({ blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }] }] }),
    );
    expect(set!.effectiveLoadKg).toBe(100);
    expect(set!.volumeKg).toBe(500);
    // Epley: 100 × (1 + 5/30)
    expect(set!.e1rmKg).toBeCloseTo(116.67, 1);
    expect(set!.movement).toBe("squat");
    expect(set!.muscles.length).toBeGreaterThan(0);
  });

  it("counts BOTH bells for a dumbbell lift", () => {
    const [set] = sessionSetFacts(
      session({ blocks: [{ kind: "strength", name: "Dumbbell Bench Press", sets: [{ load: "30", reps: "10" }] }] }),
    );
    expect(set!.effectiveLoadKg).toBe(30);
    expect(set!.volumeKg).toBe(600); // 30 × 10 × 2 bells
  });

  it("resolves a bodyweight lift at the session's OWN date and records what it used", () => {
    const bw = bodyweightLookup([
      { date: "2026-01-01T00:00:00.000Z", weightKg: 70 },
      { date: "2026-08-10T00:00:00.000Z", weightKg: 78 },
    ]);
    const [set] = sessionSetFacts(
      session({ blocks: [{ kind: "strength", name: "Weighted Pull-Up", sets: [{ load: "10", reps: "8" }] }] }),
      bw,
    );
    // The session is 1 Aug — the 78 kg weigh-in is later and must not be used.
    expect(set!.bodyweightKg).toBe(70);
    expect(set!.effectiveLoadKg).toBe(80); // 70 BW + 10 added
    expect(set!.volumeKg).toBe(640);
    expect(set!.loadKg).toBe(10); // what was typed, kept as typed
  });

  it("leaves an external lift's bodyweight column null", () => {
    const [set] = sessionSetFacts(
      session({ blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }] }] }),
      80,
    );
    expect(set!.bodyweightKg).toBeNull();
    expect(set!.effectiveLoadKg).toBe(100);
  });

  it("degrades to the entered load when no bodyweight is known", () => {
    const [set] = sessionSetFacts(
      session({ blocks: [{ kind: "strength", name: "Weighted Pull-Up", sets: [{ load: "10", reps: "8" }] }] }),
    );
    expect(set!.bodyweightKg).toBeNull();
    expect(set!.effectiveLoadKg).toBe(10);
  });

  it("keeps a half-logged set rather than dropping it", () => {
    const [set] = sessionSetFacts(
      session({ blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load: "", reps: "5" }] }] }),
    );
    expect(set).toBeDefined();
    expect(set!.reps).toBe(5);
    expect(set!.loadKg).toBeNull();
    // Null, not 0 — a set with no load must not average in as a light set.
    expect(set!.volumeKg).toBeNull();
  });

  it("marks a drop set and keeps it a working set", () => {
    const facts = sessionSetFacts(
      session({
        blocks: [
          { kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }, { load: "70", reps: "8", drop: true }] },
        ],
      }),
    );
    expect(facts[1]!.drop).toBe(true);
    expect(facts[1]!.role).toBe("working");
    expect(workingFacts(facts)).toHaveLength(2);
  });

  it("excludes warm-ups from the working rows", () => {
    const facts = sessionSetFacts(
      session({
        blocks: [
          {
            kind: "strength",
            name: "Back Squat",
            sets: [{ load: "60", reps: "5", role: "warmup" }, { load: "100", reps: "5" }, { load: "60", reps: "10", role: "cooldown" }],
          },
        ],
      }),
    );
    expect(workingFacts(facts).map((f) => f.setIndex)).toEqual([1]);
  });
});

describe("sessionSetFacts — timed efforts", () => {
  it("emits ONE row per cardio block, with a derived pace", () => {
    const facts = sessionSetFacts(
      session({
        blocks: [
          { kind: "cardio", name: "Running", discipline: "running", distance: 10, minutes: 50, elevation: 120 },
        ],
      }),
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]!.setIndex).toBe(0);
    expect(facts[0]!.kind).toBe("cardio");
    expect(facts[0]!.discipline).toBe("running");
    expect(facts[0]!.distanceKm).toBe(10);
    expect(facts[0]!.durationSec).toBe(3000);
    expect(facts[0]!.paceSecPerKm).toBe(300);
    expect(facts[0]!.elevationM).toBe(120);
    expect(facts[0]!.measured).toBe(false);
  });

  it("emits a conditioning row with its rounds", () => {
    const facts = sessionSetFacts(
      session({ blocks: [{ kind: "conditioning", name: "AMRAP", minutes: 12, rounds: 9, rpe: 8 }] }),
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]!.kind).toBe("conditioning");
    expect(facts[0]!.rounds).toBe(9);
    expect(facts[0]!.rpe).toBe(8);
    expect(facts[0]!.durationSec).toBe(720);
  });
});

describe("sessionSetFacts — the device wins", () => {
  const watch: DeviceWorkout = {
    provider: "apple",
    uuid: "hk-1",
    activityLabel: "Running",
    start: "2026-08-01T09:00:00.000Z",
    end: "2026-08-01T09:47:41.000Z",
    durationMin: 48,
    durationSec: 2861,
    distanceKm: 10.42,
    elevationM: 137,
  };

  it("projects the MEASURED figures onto the row and marks it", () => {
    const facts = sessionSetFacts(
      session({
        blocks: [{ kind: "cardio", name: "Running", discipline: "running", distance: 10, minutes: 50 }],
        device: watch,
      }),
    );
    expect(facts[0]!.distanceKm).toBe(10.42);
    expect(facts[0]!.durationSec).toBe(2861);
    expect(facts[0]!.elevationM).toBe(137);
    expect(facts[0]!.measured).toBe(true);
    // The pace derives from the EXACT figures, not the display-rounded ones:
    // 2861 s over 10.42 km, never 48 min over 10 km.
    expect(facts[0]!.paceSecPerKm).toBeCloseTo(2861 / 10.42, 1);
  });

  it("marks NOTHING measured when the recording can't be attributed", () => {
    const facts = sessionSetFacts(
      session({
        blocks: [
          { kind: "cardio", name: "Running", distance: 5, minutes: 25 },
          { kind: "cardio", name: "Rowing", distance: 2, minutes: 8 },
        ],
        device: watch,
      }),
    );
    // Two timed blocks — device-truth refuses to guess, so no row may claim to
    // be measured.
    expect(facts.every((f) => !f.measured)).toBe(true);
    expect(facts[0]!.distanceKm).toBe(5);
  });

  it("leaves the strength rows of a matched session alone", () => {
    const facts = sessionSetFacts(
      session({
        blocks: [
          { kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }] },
          { kind: "cardio", name: "Running", distance: 10, minutes: 50 },
        ],
        device: watch,
      }),
    );
    expect(facts[0]!.measured).toBe(false);
    expect(facts[0]!.effectiveLoadKg).toBe(100);
    expect(facts[1]!.measured).toBe(true);
  });
});

describe("the columns are INTEGERS, and a fractional value throws in Postgres", () => {
  it("rounds reps and measured rest", () => {
    // Nothing stops "8.5" reaching a rep field, and a decimal in an Int column
    // does not degrade — it throws, the projection swallows it, and the session
    // is silently absent from every aggregate with nothing to say why.
    const [set] = sessionSetFacts(
      session({ blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "8.5", rest: 90.4 }] }] }),
    );
    expect(Number.isInteger(set!.reps)).toBe(true);
    expect(Number.isInteger(set!.restSec)).toBe(true);
  });

  it("rounds a zone and a round count", () => {
    const [cardio] = sessionSetFacts(
      session({ blocks: [{ kind: "cardio", name: "Running", distance: 5, minutes: 25, zone: 3.4 }] }),
    );
    expect(Number.isInteger(cardio!.zone)).toBe(true);
    const [cond] = sessionSetFacts(
      session({ blocks: [{ kind: "conditioning", name: "AMRAP", minutes: 12, rounds: 9.6 }] }),
    );
    expect(Number.isInteger(cond!.rounds)).toBe(true);
  });
});

describe("sessionFactCount", () => {
  it("predicts exactly what the projection emits", () => {
    const s = session({
      blocks: [
        { kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }, { load: "100", reps: "5" }] },
        { kind: "cardio", name: "Running", distance: 5, minutes: 25 },
        { kind: "conditioning", name: "Finisher", minutes: 6 },
      ],
    });
    expect(sessionFactCount(s)).toBe(sessionSetFacts(s).length);
    expect(sessionFactCount(s)).toBe(4);
  });

  it("is zero for a session with an empty block", () => {
    const s = session({ blocks: [{ kind: "strength", name: "Back Squat", sets: [] }] });
    expect(sessionSetFacts(s)).toEqual([]);
    expect(sessionFactCount(s)).toBe(0);
  });
});
