import { describe, it, expect } from "vitest";
import { liveSessionStats } from "./live-stats";
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
