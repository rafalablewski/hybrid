import { describe, it, expect } from "vitest";
import { liveSessionStats, exerciseLiveStats } from "./live-stats";
import type { SessionBlock, LoggedSession } from "./engines";

describe("liveSessionStats", () => {
  it("counts only sets the athlete has actually filled in", () => {
    const blocks: SessionBlock[] = [
      {
        kind: "strength",
        name: "Back Squat",
        sets: [
          { load: "100", reps: "5" },
          { load: "100", reps: "5" },
          { load: "", reps: "" }, // a blank trailing set (auto-advanced) doesn't count
        ],
      },
    ];
    const s = liveSessionStats(blocks);
    expect(s.exercises).toBe(1);
    expect(s.sets).toBe(2);
    expect(s.volume).toBe(1000);
  });

  it("ignores an exercise with no logged sets, counts cardio/conditioning efforts as one", () => {
    const blocks: SessionBlock[] = [
      { kind: "strength", name: "Bench", sets: [{ load: "", reps: "" }] },
      { kind: "cardio", name: "Run", distance: 5, minutes: 25 },
      { kind: "conditioning", name: "EMOM", minutes: 10 },
    ];
    const s = liveSessionStats(blocks);
    expect(s.exercises).toBe(2); // bench dropped (empty), run + emom kept
    expect(s.sets).toBe(2);
    expect(s.volume).toBe(0);
  });

  it("is all-zero for an empty session", () => {
    expect(liveSessionStats([])).toEqual({ exercises: 0, sets: 0, volume: 0, prs: 0, cardioPrs: 0 });
  });

  it("counts a strength PR against prior history", () => {
    const prior: LoggedSession[] = [
      { id: "1", title: "old", startedAt: "2026-01-01T00:00:00Z", blocks: [{ kind: "strength", name: "Deadlift", sets: [{ load: "100", reps: "5" }] }] },
    ];
    const blocks: SessionBlock[] = [{ kind: "strength", name: "Deadlift", sets: [{ load: "140", reps: "5" }] }];
    const s = liveSessionStats(blocks, prior);
    expect(s.prs).toBe(1);
  });

  it("reports no PRs without prior history (the first-ever session)", () => {
    const blocks: SessionBlock[] = [{ kind: "strength", name: "Deadlift", sets: [{ load: "140", reps: "5" }] }];
    expect(liveSessionStats(blocks).prs).toBe(0);
  });
});

describe("exerciseLiveStats", () => {
  it("summarises banked sets, tonnage and the top set", () => {
    const s = exerciseLiveStats("Back Squat", [
      { load: "100", reps: "5", done: true },
      { load: "110", reps: "3", done: true },
      { load: "110", reps: "3" },
    ]);
    expect(s.setsDone).toBe(2);
    expect(s.setsTotal).toBe(3);
    expect(s.volumeKg).toBe(100 * 5 + 110 * 3 + 110 * 3);
    expect(s.topKg).toBe(110);
    expect(s.topReps).toBe("3");
  });

  it("excludes warm-ups from tonnage/top and averages entered bar speeds", () => {
    const s = exerciseLiveStats("Bench Press", [
      { load: "60", reps: "8", role: "warmup", done: true },
      { load: "100", reps: "5", vel: "0.45", done: true },
      { load: "100", reps: "5", vel: "0.39", done: true },
      { load: "100", reps: "5" },
    ]);
    expect(s.volumeKg).toBe(100 * 5 * 3);
    expect(s.topKg).toBe(100);
    expect(s.meanVel).toBe(0.42);
    expect(s.vels).toEqual([null, 0.45, 0.39, null]);
  });

  it("is empty-safe (no sets, nothing entered)", () => {
    const s = exerciseLiveStats("Deadlift", [{ load: "", reps: "" }]);
    expect(s.setsDone).toBe(0);
    expect(s.volumeKg).toBe(0);
    expect(s.topKg).toBe(0);
    expect(s.topReps).toBe("");
    expect(s.meanVel).toBeNull();
    expect(s.vels).toEqual([null]);
  });
});
