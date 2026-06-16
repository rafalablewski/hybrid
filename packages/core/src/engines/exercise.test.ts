import { describe, it, expect } from "vitest";
import { exerciseDashboard, exerciseKind, periodCutoff } from "./exercise";
import { e1rm, type LoggedSession } from "./session";

const NOW = new Date("2026-06-16T12:00:00.000Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const sessions: LoggedSession[] = [
  {
    id: "old",
    title: "Push",
    startedAt: daysAgo(120), // outside 8w/6m? 120d < 182 so inside 6m, outside 8w (56)
    blocks: [
      {
        kind: "strength",
        name: "Bench Press",
        sets: [
          { load: "60", reps: "8", role: "warmup" }, // excluded
          { load: "90", reps: "5" },
        ],
      },
    ],
  },
  {
    id: "recent",
    title: "Push",
    startedAt: daysAgo(5),
    blocks: [
      {
        kind: "strength",
        name: "Bench Press",
        sets: [
          { load: "100", reps: "5" },
          { load: "100", reps: "5" },
        ],
      },
    ],
  },
  {
    id: "run",
    title: "Run",
    startedAt: daysAgo(3),
    blocks: [{ kind: "cardio", name: "Easy Run", distance: 5, minutes: 25 }],
  },
];

describe("per-exercise dashboard", () => {
  it("periodCutoff returns -Infinity for all, a real cutoff otherwise", () => {
    expect(periodCutoff("all", NOW)).toBe(-Infinity);
    expect(periodCutoff("8w", NOW)).toBe(NOW - 56 * 86_400_000);
  });

  it("exerciseKind reads the logged block kind", () => {
    expect(exerciseKind(sessions, "Bench Press")).toBe("strength");
    expect(exerciseKind(sessions, "Easy Run")).toBe("cardio");
    expect(exerciseKind(sessions, "Unknown Move")).toBe("strength");
  });

  it("strength dashboard (all) excludes warm-ups, totals working sets/volume + best e1RM", () => {
    const d = exerciseDashboard(sessions, "Bench Press", "all", NOW);
    if (d.kind !== "strength") throw new Error("expected strength");
    expect(d.sessions).toBe(2);
    expect(d.workingSets).toBe(3); // 1 (old, warm-up excluded) + 2 (recent)
    expect(d.totalReps).toBe(5 + 5 + 5);
    expect(d.volume).toBe(90 * 5 + 100 * 5 + 100 * 5);
    expect(d.bestE1rm).toBe(Math.round(e1rm(100, 5)));
    expect(d.bestSet?.load).toBe(100);
    expect(d.e1rm.length).toBe(2); // one point per session, oldest→newest
  });

  it("8-week window drops the 120-day-old session", () => {
    const d = exerciseDashboard(sessions, "Bench Press", "8w", NOW);
    if (d.kind !== "strength") throw new Error("expected strength");
    expect(d.sessions).toBe(1); // only the recent one
    expect(d.workingSets).toBe(2);
    // window best is still the recent 100×5; all-time also 100×5 here
    expect(d.bestE1rmAllTime).toBe(Math.round(e1rm(100, 5)));
  });

  it("cardio dashboard reports distance/pace/longest + a pace series", () => {
    const d = exerciseDashboard(sessions, "Easy Run", "all", NOW);
    if (d.kind !== "cardio") throw new Error("expected cardio");
    expect(d.efforts).toBe(1);
    expect(d.distanceKm).toBe(5);
    expect(d.longestKm).toBe(5);
    expect(d.bestPaceSecPerKm).toBe(Math.round((25 * 60) / 5));
    expect(d.pace).toHaveLength(1);
  });
});
