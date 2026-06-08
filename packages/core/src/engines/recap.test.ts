import { describe, it, expect } from "vitest";
import { e1rm } from "./session";
import { weeklyRecap } from "./recap";
import type { LoggedSession } from "./session";

const NOW = new Date("2026-06-10T12:00:00.000Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const squat = (load: string, reps: string): LoggedSession["blocks"][number] => ({
  kind: "strength",
  name: "Back Squat",
  sets: [{ load, reps }],
});

const sess = (id: string, started: string, completed: string | null, blocks: LoggedSession["blocks"]): LoggedSession => ({
  id,
  title: "Lower",
  startedAt: started,
  completedAt: completed,
  blocks,
});

describe("weeklyRecap", () => {
  const sessions: LoggedSession[] = [
    sess("a", daysAgo(2), new Date(NOW - 2 * 86_400_000 + 60 * 60_000).toISOString(), [squat("100", "5")]), // this week, 60 min, 500 kg
    sess("b", daysAgo(5), null, [squat("120", "3")]), // this week, PR, 360 kg
    sess("c", daysAgo(9), null, [squat("110", "3")]), // last week
  ];

  it("counts this-week sessions, volume, sets, active days", () => {
    const r = weeklyRecap(sessions, NOW);
    expect(r.sessions).toBe(2);
    expect(r.volume).toBe(100 * 5 + 120 * 3);
    expect(r.sets).toBe(2);
    expect(r.activeDays).toBe(2);
    expect(r.lifts).toBe(1);
    expect(r.minutes).toBe(60);
  });

  it("compares against the previous week", () => {
    const r = weeklyRecap(sessions, NOW);
    expect(r.prevSessions).toBe(1);
    expect(r.prevVolume).toBe(110 * 3);
    expect(r.sessionsDelta).toBe(1);
    expect(r.volumeDelta).toBe(100 * 5 + 120 * 3 - 110 * 3);
  });

  it("surfaces PRs set during the week", () => {
    const r = weeklyRecap(sessions, NOW);
    // 120×3 (~132) beats the prior 110×3 (~121) from last week.
    expect(r.prs.map((p) => p.lift)).toContain("Back Squat");
    const pr = r.prs.find((p) => p.lift === "Back Squat")!;
    expect(pr.e1rm).toBe(Math.round(e1rm(120, 3)));
  });

  it("reports the top trained muscle", () => {
    const r = weeklyRecap(sessions, NOW);
    expect(r.topMuscle).not.toBeNull();
    expect(["quads", "glutes", "back"]).toContain(r.topMuscle!.muscle);
  });

  it("is all-zero with no recent sessions", () => {
    const r = weeklyRecap([], NOW);
    expect(r.sessions).toBe(0);
    expect(r.volume).toBe(0);
    expect(r.prs).toEqual([]);
    expect(r.topMuscle).toBeNull();
    expect(r.distanceKm).toBe(0);
    expect(r.cardioPrs).toEqual([]);
  });

  it("sums the week's cardio distance and surfaces a cardio PR", () => {
    const runs: LoggedSession[] = [
      sess("old", daysAgo(20), daysAgo(20), [{ kind: "conditioning", name: "Easy Run", distance: 5, minutes: 30 }]),
      sess("now", daysAgo(2), daysAgo(2), [{ kind: "conditioning", name: "Easy Run", distance: 8, minutes: 46 }]),
    ];
    const r = weeklyRecap(runs, NOW);
    expect(r.distanceKm).toBe(8); // only this week's run counts
    expect(r.cardioPrs.map((p) => p.kind)).toContain("distance");
  });
});
