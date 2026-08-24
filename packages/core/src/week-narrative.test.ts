import { describe, it, expect } from "vitest";
import { weekNarrative } from "./week-narrative";
import { weekSplit } from "./week-split";
import { calendarWeekRecap } from "./engines/recap";
import { activityVerdict } from "./week-verdict";
import { activityWeekRange } from "./activity-window";
import { localMondayMs, addLocalDays } from "./day-key";
import type { LoggedSession } from "./engines/session";

const NOW = new Date(2026, 6, 29, 12).getTime();
const MONDAY = localMondayMs(addLocalDays(localMondayMs(NOW), -21));
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
const run = (id: string, day: number, mins: number, km: number, name = "Running"): LoggedSession => ({
  id, title: "Run", ...at(day, 7, mins),
  blocks: [{ kind: "cardio", name, minutes: mins, distance: km }],
});
const match = (id: string, day: number, mins: number): LoggedSession => ({
  id, title: "Tennis", ...at(day, 10, mins),
  blocks: [{ kind: "cardio", name: "Tennis", minutes: mins }],
});

/** The paragraph for a week, as the screen would ask for it. */
const narrate = (sessions: LoggedSession[]) => {
  const recap = calendarWeekRecap(sessions, MONDAY);
  const split = weekSplit(sessions, RANGE);
  return weekNarrative(recap, split.gym, split.endurance, activityVerdict(sessions, RANGE));
};
const kinds = (sessions: LoggedSession[]) => narrate(sessions).map((l) => l.kind);
const line = <K extends string>(sessions: LoggedSession[], kind: K) =>
  narrate(sessions).find((l) => l.kind === kind)!;

describe("weekNarrative", () => {
  it("says nothing at all about a week nobody trained", () => {
    expect(narrate([])).toEqual([]);
  });

  it("opens by naming the SPLIT when the week has both halves", () => {
    const l = line([lift("a", 0, 70), run("b", 2, 44, 8.2)], "shape");
    expect(l).toMatchObject({ key: "recap.narr.shapeBoth", sessions: 2, days: 2, gymEfforts: 1, endEfforts: 1 });
  });

  it("does not offer a split a pure lifter does not have", () => {
    expect(line([lift("a", 0, 70)], "shape").key).toBe("recap.narr.shapeGym");
    expect(line([run("b", 2, 44, 8.2)], "shape").key).toBe("recap.narr.shapeOut");
  });

  it("names the discipline the PACE belongs to, not the half's biggest slice", () => {
    // A short run and a longer tennis match: tennis leads the half by time, but
    // the 9 km and the 5:00 are the run's, so the sentence is about the run.
    const l = line([run("b", 2, 45, 9), match("m", 5, 75)], "ground");
    expect(l.key).toBe("recap.narr.groundPace");
    expect(l.kind === "ground" && l.lead?.id).toBe("d:running");
  });

  it("quotes a pace only when ONE discipline covered the ground", () => {
    // One kind of kilometre → a pace can be quoted honestly.
    const one = line([run("b", 2, 45, 9)], "ground");
    expect(one.key).toBe("recap.narr.groundPace");
    expect(one.kind === "ground" && one.paceSecPerKm).toBe(300);

    // Two kinds → the sentence names the leader instead. A pace averaged over
    // a run and a swim is a number nobody trained at.
    const two = line([run("b", 2, 45, 9), run("s", 4, 40, 1.5, "Swimming")], "ground");
    expect(two.key).toBe("recap.narr.groundLed");
    expect(two.kind === "ground" && two.paceSecPerKm).toBeNull();
  });

  it("reports the clock for a week that covered no ground at all", () => {
    const l = line([match("m", 5, 75)], "ground");
    expect(l).toMatchObject({ key: "recap.narr.groundTime", distanceKm: 0, minutes: 75 });
    expect(l.kind === "ground" && l.lead?.kind).toBe("sport");
  });

  it("carries the gym's own grain, and skips the sentence when nothing was lifted", () => {
    const l = line([lift("a", 0, 70)], "gym");
    expect(l).toMatchObject({ key: "recap.narr.gym", tonnageKg: 1000, sets: 2, lifts: 1 });
    expect(kinds([run("b", 2, 44, 8.2)])).not.toContain("gym");
  });

  it("names the single biggest record, and says nothing when there is none", () => {
    // The squat is a record against an empty history; the second week's
    // heavier squat is a record against the first.
    const week = [lift("prev", -5, 60, "90"), lift("a", 0, 70, "120")];
    const l = line(week, "records");
    expect(l.kind === "records" && l.top).toMatchObject({ kind: "strength", name: "Back Squat", loadKg: 120 });
    // A week that repeats last week's load sets none.
    expect(kinds([lift("prev", -5, 60, "100"), lift("a", 0, 70, "100")])).not.toContain("records");
  });

  it("ends on the verdict, in the same words the card above it uses", () => {
    const week = [lift("prev", -5, 60, "90"), lift("a", 0, 70, "120"), lift("c", 2, 70, "120")];
    const l = line(week, "verdict");
    expect(["w.home.week.upLead", "w.home.week.downLead", "w.home.week.flatLead"]).toContain(l.key);
    expect(kinds(week).at(-1)).toBe("verdict");
  });

  it("makes NO claim about direction when there is no week before it", () => {
    const l = line([lift("a", 0, 70)], "verdict");
    expect(l).toMatchObject({ key: "w.home.week.coldLead", metricKey: null });
  });

  it("reads in one order, every time", () => {
    const week = [lift("prev", -5, 60, "90"), lift("a", 0, 70, "120"), run("b", 2, 45, 9), match("m", 5, 75)];
    expect(kinds(week)).toEqual(["shape", "gym", "ground", "records", "verdict"]);
  });
});
