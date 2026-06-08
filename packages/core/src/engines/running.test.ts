import { describe, it, expect } from "vitest";
import { runTotals, runStats, weeklyMileage, effortSplit, pacedRunMoves } from "./running";
import type { LoggedSession } from "./session";

const NOW = new Date("2026-06-10T12:00:00.000Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const run = (id: string, started: string, name: string, distance?: number, minutes?: number, rpe?: number): LoggedSession => ({
  id,
  title: "Run",
  startedAt: started,
  blocks: [{ kind: "cardio", name, ...(distance ? { distance } : {}), ...(minutes ? { minutes } : {}), ...(rpe ? { rpe } : {}) }],
});

const sessions: LoggedSession[] = [
  run("1", daysAgo(2), "Easy Run", 8, 48, 5),
  run("2", daysAgo(5), "Easy Run", 10, 55, 6),
  run("3", daysAgo(9), "Row Intervals", 6, 30, 8),
  run("4", daysAgo(30), "Easy Run", 5, 32, 5),
  { id: "5", title: "Lift", startedAt: daysAgo(3), blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }] }] },
];

describe("running analytics", () => {
  it("runTotals sums efforts, distance and minutes across cardio only", () => {
    const t = runTotals(sessions);
    expect(t.efforts).toBe(4);
    expect(t.distanceKm).toBe(29); // 8 + 10 + 6 + 5
    expect(t.minutes).toBe(165); // 48 + 55 + 30 + 32
  });

  it("runStats aggregates per move with best pace + longest, most distance first", () => {
    const stats = runStats(sessions);
    expect(stats[0]!.move).toBe("Easy Run"); // 23 km total
    const easy = stats.find((s) => s.move === "Easy Run")!;
    expect(easy.efforts).toBe(3);
    expect(easy.longestKm).toBe(10);
    expect(easy.bestPaceSecPerKm).toBe(330); // 55min/10km = 5:30/km is the fastest of 6:00/6:24/5:30
  });

  it("pacedRunMoves lists moves with pace data by total distance", () => {
    expect(pacedRunMoves(sessions)).toEqual(["Easy Run", "Row Intervals"]);
  });

  it("weeklyMileage buckets distance into the last N weeks, oldest first", () => {
    const wk = weeklyMileage(sessions, 2, NOW);
    expect(wk).toHaveLength(2);
    expect(wk[1]!.km).toBe(18); // this week: 8 + 10
    expect(wk[0]!.km).toBe(6); // 7-14 days ago: Row Intervals (9 days ago)
  });

  it("effortSplit divides cardio minutes into easy/moderate/hard by RPE", () => {
    const e = effortSplit(sessions);
    expect(e.easy).toBe(48 + 55 + 32); // RPE ≤ 6
    expect(e.hard).toBe(30); // RPE 8 row intervals
    expect(e.moderate).toBe(0);
  });
});
