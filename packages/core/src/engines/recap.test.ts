import { describe, it, expect } from "vitest";
import { e1rm } from "./session";
import { weeklyRecap, calendarWeekRecap, weekAdherence } from "./recap";
import { localMondayMs, addLocalDays } from "../day-key";
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
      sess("old", daysAgo(20), daysAgo(20), [{ kind: "cardio", name: "Easy Run", distance: 5, minutes: 30 }]),
      sess("now", daysAgo(2), daysAgo(2), [{ kind: "cardio", name: "Easy Run", distance: 8, minutes: 46 }]),
    ];
    const r = weeklyRecap(runs, NOW);
    expect(r.distanceKm).toBe(8); // only this week's run counts
    expect(r.cardioPrs.map((p) => p.kind)).toContain("distance");
  });
});

describe("weekAdherence", () => {
  it("renders a 7-day Mon→Sun strip", () => {
    const a = weekAdherence([], 3, NOW);
    expect(a.days).toHaveLength(7);
    expect(a.days.map((d) => d.label)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
  });

  it("marks today and counts trained days; empty week trains nothing", () => {
    const a = weekAdherence([], 3, NOW);
    expect(a.done).toBe(0);
    const todayCell = a.days.find((d) => d.state === "today");
    expect(todayCell).toBeTruthy();
    // every other day is missed (past) or future — never done with no sessions
    expect(a.days.some((d) => d.state === "done")).toBe(false);
  });

  it("a session logged today counts as done", () => {
    const a = weekAdherence([sess("t", new Date(NOW).toISOString(), null, [squat("100", "5")])], 3, NOW);
    expect(a.done).toBe(1);
    expect(a.days.some((d) => d.state === "done")).toBe(true);
    expect(a.days.some((d) => d.state === "today")).toBe(false); // today is now "done"
  });

  it("target floors at the done count so the ratio never exceeds the goal", () => {
    expect(weekAdherence([], 3, NOW).target).toBe(3);
  });
});

describe("calendarWeekRecap", () => {
  // A Mon–Sun week, built in LOCAL time so the boundaries are the ones an
  // athlete's calendar has (the rolling window can't answer for a past week at
  // all, which is why this exists).
  const MONDAY = localMondayMs(new Date(2026, 5, 10, 12).getTime());
  const on = (dayOffset: number, hour: number) => {
    const d = new Date(addLocalDays(MONDAY, dayOffset));
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  const week: LoggedSession[] = [
    sess("mon", on(0, 9), null, [squat("100", "5")]),
    sess("sun", on(6, 21), null, [squat("100", "5")]),
    // The instant BEFORE the week and the instant the NEXT week starts — the
    // two sessions a sloppy window quietly swallows.
    sess("before", new Date(addLocalDays(MONDAY, 0) - 1).toISOString(), null, [squat("50", "5")]),
    sess("after", new Date(addLocalDays(MONDAY, 7)).toISOString(), null, [squat("50", "5")]),
  ];

  it("counts Monday 00:00 up to (not including) the next Monday", () => {
    const r = calendarWeekRecap(week, MONDAY);
    expect(r.sessions).toBe(2);
    expect(r.volume).toBe(2 * 100 * 5);
    expect(r.activeDays).toBe(2);
    expect(r.start).toBe(new Date(MONDAY).toISOString());
  });

  it("takes any instant inside the week, not only its Monday", () => {
    const midweek = calendarWeekRecap(week, addLocalDays(MONDAY, 3) + 5 * 3_600_000);
    expect(midweek.sessions).toBe(2);
    expect(midweek.start).toBe(new Date(MONDAY).toISOString());
  });

  it("compares against the CALENDAR week before it", () => {
    const prior = [...week, sess("prev", new Date(addLocalDays(MONDAY, -4)).toISOString(), null, [squat("80", "5")])];
    const r = calendarWeekRecap(prior, MONDAY);
    // "prev" AND "before" — the Sunday-night session one millisecond before
    // this Monday belongs to the week that just ended, which is the boundary
    // the rolling window used to blur.
    expect(r.prevSessions).toBe(2);
    expect(r.prevVolume).toBe(80 * 5 + 50 * 5);
    expect(r.sessionsDelta).toBe(0);
    expect(r.volumeDelta).toBe(2 * 100 * 5 - (80 * 5 + 50 * 5));
  });

  it("an untrained week reads as zeros, not as the nearest trained one", () => {
    const r = calendarWeekRecap(week, addLocalDays(MONDAY, 14));
    expect(r.sessions).toBe(0);
    expect(r.volume).toBe(0);
    expect(r.prs).toEqual([]);
  });
});
