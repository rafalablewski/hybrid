import { describe, it, expect } from "vitest";
import { trainingHeatmap } from "./calendar";
import type { LoggedSession } from "./session";

// LOCAL-constructed fixtures so the expectations hold in any timezone
// (the heatmap keys days by the athlete's local calendar day).
const now = new Date(2026, 5, 17, 12).getTime(); // a fixed Wednesday, local noon

const session = (daysAgo: number): LoggedSession => ({
  id: `s${daysAgo}`,
  title: "S",
  startedAt: new Date(now - daysAgo * 86_400_000).toISOString(),
  blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }] }],
});

describe("trainingHeatmap", () => {
  it("returns `weeks` columns of 7 day cells", () => {
    const grid = trainingHeatmap([], 26, now);
    expect(grid).toHaveLength(26);
    expect(grid.every((c) => c.length === 7)).toBe(true);
  });

  it("marks a trained day with a non-zero level and the last column holds today", () => {
    const grid = trainingHeatmap([session(0)], 26, now);
    const last = grid[grid.length - 1]!;
    const trained = last.find((c) => c.count > 0);
    expect(trained).toBeTruthy();
    expect(trained!.level).toBeGreaterThan(0);
  });

  it("leaves rest days at level 0", () => {
    const grid = trainingHeatmap([], 4, now);
    expect(grid.flat().every((c) => c.level === 0 && c.count === 0)).toBe(true);
  });
});
