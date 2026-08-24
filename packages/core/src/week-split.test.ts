import { describe, it, expect } from "vitest";
import { weekSplit, gymWindow } from "./week-split";
import { activityTotals, activityWeekRange } from "./activity-window";
import { localMondayMs, addLocalDays } from "./day-key";
import type { LoggedSession } from "./engines/session";

// A hybrid week, three weeks back so the window is FINISHED and sums whole.
const MONDAY = localMondayMs(addLocalDays(localMondayMs(new Date(2026, 6, 29, 12).getTime()), -21));
const NOW = new Date(2026, 6, 29, 12).getTime();
const RANGE = activityWeekRange(MONDAY, NOW);

const at = (day: number, hour: number, mins: number) => {
  const a = new Date(addLocalDays(MONDAY, day));
  a.setHours(hour, 0, 0, 0);
  return { startedAt: a.toISOString(), completedAt: new Date(a.getTime() + mins * 60_000).toISOString() };
};

const lift = (id: string, day: number, mins: number, load = "100"): LoggedSession => ({
  id, title: "Lower", ...at(day, 9, mins),
  blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load, reps: "5" }, { load, reps: "5" }] }],
});
const run = (id: string, day: number, mins: number, km: number): LoggedSession => ({
  id, title: "Run", ...at(day, 7, mins),
  blocks: [{ kind: "cardio", name: "Running", minutes: mins, distance: km }],
});
const match = (id: string, day: number, mins: number): LoggedSession => ({
  id, title: "Tennis", ...at(day, 10, mins),
  blocks: [{ kind: "cardio", name: "Tennis", minutes: mins }],
});
/** Squats then a run, on ONE entry. */
const brick = (id: string, day: number, liftMin: number, runMin: number, km: number): LoggedSession => ({
  id, title: "Brick", ...at(day, 17, liftMin + runMin),
  blocks: [
    { kind: "strength", name: "Front Squat", sets: [{ load: "80", reps: "5" }] },
    { kind: "cardio", name: "Running", minutes: runMin, distance: km },
  ],
});

const WEEK = [lift("a", 0, 70), run("b", 2, 44, 8.2), lift("c", 4, 65, "120"), match("d", 5, 75)];

describe("weekSplit — the two halves are a partition", () => {
  it("the halves' minutes add back up to the window's own", () => {
    const s = weekSplit(WEEK, RANGE);
    const whole = activityTotals(WEEK, RANGE.from, RANGE.through);
    expect(s.gym.totals.minutes + s.endurance.totals.minutes).toBe(whole.hours);
  });

  it("holds with a BRICK session, where one entry is in both halves", () => {
    const withBrick = [...WEEK, brick("e", 3, 20, 30, 6)];
    const s = weekSplit(withBrick, RANGE);
    const whole = activityTotals(withBrick, RANGE.from, RANGE.through);
    expect(s.gym.totals.minutes + s.endurance.totals.minutes).toBe(whole.hours);
  });

  it("counts a brick as an effort on BOTH sides — it did both, and it went out once", () => {
    const withBrick = [...WEEK, brick("e", 3, 20, 30, 6)];
    const s = weekSplit(withBrick, RANGE);
    // 5 sessions in the window; 3 carry gym work, 3 carry endurance/sport, and
    // the brick is in both — so the effort counts sum PAST the session count,
    // which is the honest answer to two different questions.
    expect(activityTotals(withBrick, RANGE.from, RANGE.through).sessions).toBe(5);
    expect(s.gym.totals.efforts).toBe(3);
    expect(s.endurance.totals.efforts).toBe(3);
  });

  it("each half carries only its own kind of work", () => {
    const s = weekSplit(WEEK, RANGE);
    // The gym half holds the tonnage and none of the ground.
    expect(s.gym.totals.tonnage).toBe(2 * 100 * 5 + 2 * 120 * 5);
    expect(s.gym.totals.efforts).toBe(2);
    // The endurance half holds the ground, AND the timed sport that covered
    // none — a week that was three squash matches must not read as empty.
    expect(s.endurance.totals.distanceKm).toBeCloseTo(8.2, 5);
    expect(s.endurance.totals.efforts).toBe(2);
    expect(s.endurance.totals.minutes).toBe(44 + 75);
  });

  it("names what the endurance half was made of, biggest first", () => {
    const s = weekSplit(WEEK, RANGE);
    expect(s.endurance.slices.map((x) => x.id)).toEqual(["sport:tennis", "d:running"]);
    expect(s.endurance.disciplines).toBe(1);
    expect(s.endurance.sports).toBe(1);
  });

  it("a pure lifter's other half is empty rather than absent", () => {
    const s = weekSplit([lift("a", 0, 70)], RANGE);
    expect(s.endurance.totals).toMatchObject({ efforts: 0, minutes: 0, distanceKm: 0 });
    expect(s.gym.totals.efforts).toBe(1);
  });

  it("a pure runner's gym half is empty rather than absent", () => {
    const s = weekSplit([run("b", 2, 44, 8.2)], RANGE);
    expect(s.gym.totals).toMatchObject({ efforts: 0, minutes: 0, tonnage: 0 });
    expect(s.endurance.totals.efforts).toBe(1);
  });

  it("measures each half against the week before it, not against a mean", () => {
    const prior = [lift("p1", -7, 60, "90"), run("p2", -5, 30, 5)];
    const s = weekSplit([...WEEK, ...prior], RANGE);
    expect(s.gym.previous.tonnage).toBe(2 * 90 * 5);
    expect(s.gym.previous.efforts).toBe(1);
    expect(s.endurance.previous.distanceKm).toBeCloseTo(5, 5);
  });

  it("gymWindow alone answers the same as the split's gym half", () => {
    expect(gymWindow(WEEK, RANGE).totals).toEqual(weekSplit(WEEK, RANGE).gym.totals);
  });
});
