import { describe, it, expect } from "vitest";
import { planSchedule, planAdherence, dateKeyOf } from "./plan-schedule";
import { programCalendarDays } from "./plan-day";
import type { LoggedSession } from "./engines/session";

const PLAN = "oly-soviet-8wk"; // multi-week %-based program with rest days
const start = new Date(2026, 5, 1); // Mon 1 Jun 2026, local
const now = new Date(2026, 5, 21).getTime(); // 20 days in

function sessionOn(ts: number, id: string): LoggedSession {
  // noon on the day so the local date key is unambiguous
  return { id, title: "Session", startedAt: new Date(ts + 12 * 3600_000).toISOString(), blocks: [] };
}

describe("planSchedule", () => {
  it("returns null without a program plan id or without a start date", () => {
    expect(planSchedule({ planId: null, startedAt: start, sessions: [] })).toBeNull();
    expect(planSchedule({ planId: "does-not-exist", startedAt: start, sessions: [] })).toBeNull();
    expect(planSchedule({ planId: "bb-fb4", startedAt: start, sessions: [] })).toBeNull(); // legacy, no program
    expect(planSchedule({ planId: PLAN, startedAt: null, sessions: [] })).toBeNull();
  });

  it("maps every program day onto consecutive calendar dates from the start", () => {
    const cal = programCalendarDays(PLAN)!;
    const r = planSchedule({ planId: PLAN, startedAt: start, sessions: [], now })!;
    expect(r.days.length).toBe(cal.days.length);
    expect(r.totalTrainingDays).toBe(cal.trainingCount);
    // day 0 lands on the start date, day 1 on the next calendar day
    expect(r.days[0]!.dateKey).toBe(dateKeyOf(start.getTime()));
    expect(r.days[1]!.dateKey).toBe(dateKeyOf(new Date(2026, 5, 2).getTime()));
    // training-day numbering is 1-based, in order, rest days carry null
    const nums = r.days.filter((d) => d.trainingDayNumber != null).map((d) => d.trainingDayNumber);
    expect(nums[0]).toBe(1);
    expect(nums[nums.length - 1]).toBe(cal.trainingCount);
    expect(r.days.filter((d) => d.isRest).every((d) => d.trainingDayNumber === null)).toBe(true);
  });

  it("focuses todayIndex on today's date", () => {
    const r = planSchedule({ planId: PLAN, startedAt: start, sessions: [], now })!;
    expect(r.days[r.todayIndex]!.dateKey).toBe(dateKeyOf(now));
    expect(r.days[r.todayIndex]!.isToday).toBe(true);
  });

  it("classifies past training days with nothing logged as missed, rest as rest, future as upcoming", () => {
    const r = planSchedule({ planId: PLAN, startedAt: start, sessions: [], now })!;
    const todayTs = r.days[r.todayIndex]!.ts;
    expect(r.days.filter((d) => !d.isRest && d.ts < todayTs).every((d) => d.status === "missed")).toBe(true);
    expect(r.days.filter((d) => d.isRest).every((d) => d.status === "rest")).toBe(true);
    expect(r.days.filter((d) => !d.isRest && d.ts > todayTs).every((d) => d.status === "upcoming")).toBe(true);
  });

  it("marks a day done when a session is logged on its date, linking the session id", () => {
    const base = planSchedule({ planId: PLAN, startedAt: start, sessions: [], now })!;
    const firstTraining = base.days.find((d) => !d.isRest && d.ts < base.days[base.todayIndex]!.ts)!;
    const r = planSchedule({
      planId: PLAN,
      startedAt: start,
      sessions: [sessionOn(firstTraining.ts, "sess-1")],
      now,
    })!;
    const day = r.days[firstTraining.index]!;
    expect(day.status).toBe("done");
    expect(day.sessionId).toBe("sess-1");
  });

  it("groups each training day's content into sessions (flat rows/blocks preserved)", () => {
    const r = planSchedule({ planId: PLAN, startedAt: start, sessions: [], now })!;
    const training = r.days.filter((d) => !d.isRest);
    // every training day has at least one session; rest days have none
    expect(training.every((d) => d.sessions.length >= 1)).toBe(true);
    expect(r.days.filter((d) => d.isRest).every((d) => d.sessions.length === 0)).toBe(true);
    // ordinals are contiguous 1..n and the grouped rows/blocks re-flatten to the
    // day's flat arrays (order preserved) — the tabs can never drift from the day.
    for (const d of training) {
      expect(d.sessions.map((s) => s.ordinal)).toEqual(d.sessions.map((_, i) => i + 1));
      expect(d.sessions.flatMap((s) => s.rows)).toEqual(d.rows);
      expect(d.sessions.flatMap((s) => s.blocks)).toEqual(d.blocks);
    }
    // the Soviet program authors AM/PM days — at least one day is multi-session,
    // carrying the plan's time-of-day band through to timeOfDay.
    const multi = training.filter((d) => d.sessions.length > 1);
    expect(multi.length).toBeGreaterThan(0);
    expect(multi.some((d) => d.sessions.some((s) => s.timeOfDay === "AM"))).toBe(true);
  });

  it("marks a day skipped from an override without touching adherence penalty", () => {
    const base = planSchedule({ planId: PLAN, startedAt: start, sessions: [], now })!;
    const target = base.days.filter((d) => !d.isRest && d.status === "missed")[1]!;
    const r = planSchedule({
      planId: PLAN,
      startedAt: start,
      sessions: [],
      overrides: { [target.dateKey]: { status: "skipped" } },
      now,
    })!;
    expect(r.days[target.index]!.status).toBe("skipped");
  });

  it("computes adherence from done vs due (skips + rest excluded)", () => {
    const base = planSchedule({ planId: PLAN, startedAt: start, sessions: [], now })!;
    const t1 = base.days.find((d) => !d.isRest && d.status === "missed")!;
    const t2 = base.days.filter((d) => !d.isRest && d.status === "missed")[1]!;
    const r = planSchedule({
      planId: PLAN,
      startedAt: start,
      sessions: [sessionOn(t1.ts, "s1")],
      overrides: { [t2.dateKey]: { status: "skipped" } },
      now,
    })!;
    const a = planAdherence(r);
    expect(a.done).toBe(1);
    expect(a.skipped).toBe(1);
    expect(a.missed).toBeGreaterThan(0);
    // percent = done / (done + missed), skipped excluded
    expect(a.percent).toBe(Math.round((a.done / (a.done + a.missed)) * 100));
  });

  it("postpones a day: marks the source postponed and relocates its session onto the target date", () => {
    const base = planSchedule({ planId: PLAN, startedAt: start, sessions: [], now })!;
    const source = base.days.find((d) => !d.isRest && d.status === "missed")!;
    const target = base.days.find((d) => d.index > source.index && d.dateKey !== source.dateKey)!;
    const r = planSchedule({
      planId: PLAN,
      startedAt: start,
      sessions: [],
      overrides: { [source.dateKey]: { status: "postponed", toDateKey: target.dateKey } },
      now,
    })!;
    // source is postponed (no penalty) and points at the target
    expect(r.days[source.index]!.status).toBe("postponed");
    expect(r.days[source.index]!.postponedTo).toBe(target.dateKey);
    // the moved session surfaces on the target date
    const tgt = r.days[target.index]!;
    expect(tgt.postponedIn.length).toBe(1);
    expect(tgt.postponedIn[0]!.fromDateKey).toBe(source.dateKey);
    expect(tgt.postponedIn[0]!.title).toBe(source.title);
    // postponed is excluded from the adherence penalty
    const a = planAdherence(r);
    expect(a.postponed).toBe(1);
  });

  it("lets actual completion win over a stale skip/postpone override", () => {
    const base = planSchedule({ planId: PLAN, startedAt: start, sessions: [], now })!;
    const day = base.days.find((d) => !d.isRest && d.status === "missed")!;
    const r = planSchedule({
      planId: PLAN,
      startedAt: start,
      sessions: [sessionOn(day.ts, "s1")],
      overrides: { [day.dateKey]: { status: "skipped" } },
      now,
    })!;
    expect(r.days[day.index]!.status).toBe("done");
  });
});
