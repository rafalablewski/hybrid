import { describe, it, expect } from "vitest";
import { weeklyVolumeTrend, exerciseTable, weeklyMuscleSets } from "./analytics";
import type { LoggedSession } from "./session";

const NOW = new Date("2026-06-16T12:00:00.000Z").getTime();
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const sessions: LoggedSession[] = [
  {
    id: "a",
    title: "Push",
    startedAt: daysAgo(2),
    blocks: [
      {
        kind: "strength",
        name: "Bench Press",
        sets: [
          { load: "60", reps: "8", role: "warmup" }, // excluded
          { load: "100", reps: "5" },
          { load: "100", reps: "5" },
        ],
      },
    ],
  },
  {
    id: "b",
    title: "Push",
    startedAt: daysAgo(10), // previous week
    blocks: [{ kind: "strength", name: "Bench Press", sets: [{ load: "95", reps: "5" }] }],
  },
  {
    id: "c",
    title: "Run",
    startedAt: daysAgo(3),
    blocks: [{ kind: "cardio", name: "Easy Run", distance: 5, minutes: 25 }],
  },
];

describe("training analytics hub", () => {
  it("weeklyVolumeTrend counts working sets + tonnage per rolling week", () => {
    const trend = weeklyVolumeTrend(sessions, 2, NOW);
    expect(trend).toHaveLength(2);
    const [prev, current] = trend;
    expect(current!.sets).toBe(2); // this week: 2 working bench sets (warm-up excluded)
    expect(current!.tonnage).toBe(100 * 5 + 100 * 5);
    expect(prev!.sets).toBe(1); // last week: 1 set
    expect(prev!.tonnage).toBe(95 * 5);
  });

  it("exerciseTable returns one row per trained movement, strongest volume first", () => {
    const rows = exerciseTable(sessions, "all", NOW);
    const bench = rows.find((r) => r.name === "Bench Press")!;
    const run = rows.find((r) => r.name === "Easy Run")!;
    expect(bench.kind).toBe("strength");
    expect(bench.sessions).toBe(2);
    expect(bench.volume).toBe(100 * 5 + 100 * 5 + 95 * 5); // tonnage across both
    expect(bench.trend).toBe("up"); // 95 → 100 kg heaviest lift
    expect(run.kind).toBe("cardio");
    expect(run.volume).toBe(5); // distance km
  });

  it("weeklyMuscleSets returns per-week working sets for one muscle, oldest→newest", () => {
    const chest = weeklyMuscleSets(sessions, "chest", 2, NOW);
    expect(chest).toHaveLength(2);
    expect(chest[1]).toBe(2); // this week: 2 working bench sets hit chest
    expect(chest[0]).toBe(1); // last week: 1
    // warm-ups excluded by default, included when asked
    expect(weeklyMuscleSets(sessions, "chest", 2, NOW, true)[1]).toBe(3);
  });

  it("drops movements with no activity in the period", () => {
    const rows = exerciseTable(sessions, "8w", NOW);
    expect(rows.every((r) => r.sessions > 0)).toBe(true);
  });
});
