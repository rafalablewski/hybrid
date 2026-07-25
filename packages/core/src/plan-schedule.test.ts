import { describe, it, expect } from "vitest";
import { planSchedule, planAdherence, dateKeyOf, sessionMatchesPlanDay, offPlanSessionsOnDay, alsoTodayCopy } from "./plan-schedule";
import { programCalendarDays } from "./plan-day";
import type { LoggedSession } from "./engines/session";

const PLAN = "oly-soviet-8wk"; // multi-week %-based program with rest days
const PLAN_NAME = "Soviet 8-Week Peaking";
const start = new Date(2026, 5, 1); // Mon 1 Jun 2026, local
const now = new Date(2026, 5, 21).getTime(); // 20 days in

function sessionOn(ts: number, id: string, title = `${PLAN_NAME} – Week 1, Day 1`): LoggedSession {
  // noon on the day so the local date key is unambiguous; plan-titled by default
  // (the client-composed "<plan> – …" title) so it fulfils the day it lands on
  return { id, title, startedAt: new Date(ts + 12 * 3600_000).toISOString(), blocks: [] };
}

/** An off-plan quick sport log — a title and blocks the plan never prescribes. */
function sportOn(ts: number, id: string, sport = "Tennis"): LoggedSession {
  return {
    id,
    title: sport,
    startedAt: new Date(ts + 12 * 3600_000).toISOString(),
    blocks: [{ kind: "cardio", name: sport, minutes: 78, rpe: 6 }],
  };
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
    expect(r.fulfilledSessionIds).toContain("sess-1");
  });

  it("does NOT let an unrelated session (quick sport log) complete a plan day", () => {
    const base = planSchedule({ planId: PLAN, startedAt: start, sessions: [], now })!;
    // anchor "now" on a TRAINING day so the day under test can read as open
    const today = base.days.find((d) => !d.isRest && d.ts >= base.days[base.todayIndex]!.ts)!;
    const trainingNow = today.ts + 12 * 3600_000;
    const r = planSchedule({
      planId: PLAN,
      startedAt: start,
      sessions: [sportOn(today.ts, "tennis-1")],
      now: trainingNow,
    })!;
    const day = r.days[today.index]!;
    // the tennis match neither carries the plan title nor shares a block name,
    // so today stays open (Start / Skip / Postpone) instead of reading done
    expect(day.status).toBe("today");
    expect(day.sessionId).toBeNull();
    expect(r.fulfilledSessionIds).not.toContain("tennis-1");
  });

  it("matches an auto-titled session by shared block names (web logger parity)", () => {
    const base = planSchedule({ planId: PLAN, startedAt: start, sessions: [], now })!;
    const day = base.days.find((d) => !d.isRest && d.status === "missed" && d.blocks.length >= 2)!;
    const fromPlan: LoggedSession = {
      id: "auto-1",
      title: "Evening workout", // the web logger's auto-title — no plan prefix
      startedAt: new Date(day.ts + 12 * 3600_000).toISOString(),
      blocks: [
        { kind: "strength", name: day.blocks[0]!.name, sets: [] },
        { kind: "strength", name: day.blocks[1]!.name, sets: [] },
      ],
    };
    const r = planSchedule({ planId: PLAN, startedAt: start, sessions: [fromPlan], now })!;
    expect(r.days[day.index]!.status).toBe("done");
    expect(r.days[day.index]!.sessionId).toBe("auto-1");
  });

  it("does NOT let one shared common lift complete a multi-lift plan day", () => {
    const base = planSchedule({ planId: PLAN, startedAt: start, sessions: [], now })!;
    const day = base.days.find((d) => !d.isRest && d.status === "missed" && d.blocks.length >= 2)!;
    const freestyle: LoggedSession = {
      id: "free-1",
      title: "Evening workout",
      startedAt: new Date(day.ts + 12 * 3600_000).toISOString(),
      // one prescription lift buried in an unrelated freestyle session
      blocks: [
        { kind: "strength", name: day.blocks[0]!.name, sets: [] },
        { kind: "strength", name: "Lat Pulldown", sets: [] },
        { kind: "strength", name: "Biceps Curl", sets: [] },
      ],
    };
    const r = planSchedule({ planId: PLAN, startedAt: start, sessions: [freestyle], now })!;
    expect(r.days[day.index]!.status).toBe("missed");
    expect(r.fulfilledSessionIds).not.toContain("free-1");
  });

  it("lets a quick-logged run complete a run-plan day, but not a racket sport", () => {
    const RUN_PLAN = "run-5k-beginner-9wk"; // discipline: endurance
    const base = planSchedule({ planId: RUN_PLAN, startedAt: start, sessions: [], now })!;
    const day = base.days.find((d) => !d.isRest && d.status === "missed")!;
    const run = sportOn(day.ts, "run-1", "Running");
    const tennis = sportOn(day.ts, "tennis-1", "Tennis");
    const r = planSchedule({ planId: RUN_PLAN, startedAt: start, sessions: [tennis, run], now })!;
    expect(r.days[day.index]!.status).toBe("done");
    expect(r.days[day.index]!.sessionId).toBe("run-1");
    expect(r.fulfilledSessionIds).not.toContain("tennis-1");
  });

  it("credits a postponed day when its catch-up workout is done on the target date", () => {
    const base = planSchedule({ planId: PLAN, startedAt: start, sessions: [], now })!;
    const source = base.days.find((d) => !d.isRest && d.status === "missed" && d.blocks.length >= 2)!;
    const target = base.days[source.index + 1]!;
    // the catch-up "Do it now" seeds the SOURCE day's blocks; the web logger
    // auto-titles it — logged on the TARGET date
    const catchUp: LoggedSession = {
      id: "catch-1",
      title: "Evening workout",
      startedAt: new Date(target.ts + 12 * 3600_000).toISOString(),
      blocks: [
        { kind: "strength", name: source.blocks[0]!.name, sets: [] },
        { kind: "strength", name: source.blocks[1]!.name, sets: [] },
      ],
    };
    const r = planSchedule({
      planId: PLAN,
      startedAt: start,
      sessions: [catchUp],
      overrides: { [source.dateKey]: { status: "postponed", toDateKey: target.dateKey } },
      now,
    })!;
    // the SOURCE day is done (no longer postponed), credited with the session
    expect(r.days[source.index]!.status).toBe("done");
    expect(r.days[source.index]!.sessionId).toBe("catch-1");
    // its catch-up item no longer haunts the target date's card
    expect(r.days[target.index]!.postponedIn.length).toBe(0);
    // and the workout is not mislabeled off-plan
    expect(r.fulfilledSessionIds).toContain("catch-1");
  });

  it("splits today's log into plan-fulfilling vs off-plan extras", () => {
    const base = planSchedule({ planId: PLAN, startedAt: start, sessions: [], now })!;
    // anchor "now" on a TRAINING day so the plan session has a day to fulfil
    const today = base.days.find((d) => !d.isRest && d.ts >= base.days[base.todayIndex]!.ts)!;
    const trainingNow = today.ts + 12 * 3600_000;
    const sessions = [sportOn(today.ts, "tennis-1"), sessionOn(today.ts, "plan-1")];
    const r = planSchedule({ planId: PLAN, startedAt: start, sessions, now: trainingNow })!;
    const extras = offPlanSessionsOnDay(sessions, r, trainingNow);
    expect(extras.map((s) => s.id)).toEqual(["tennis-1"]);
    // without a schedule, everything logged today is off-plan by definition
    expect(offPlanSessionsOnDay(sessions, null, trainingNow).length).toBe(2);
  });

  it("sessionMatchesPlanDay accepts both plan-title forms and rejects lookalikes", () => {
    const blocks = [{ kind: "strength" as const, name: "Front Squat", sets: [] }];
    const s = (title: string, own: typeof blocks = []): LoggedSession => ({ id: "x", title, startedAt: new Date(now).toISOString(), blocks: own });
    expect(sessionMatchesPlanDay(s(PLAN_NAME), PLAN_NAME, blocks)).toBe(true); // rail handoff title
    expect(sessionMatchesPlanDay(s(`${PLAN_NAME} – Week 2, Day 3`), PLAN_NAME, blocks)).toBe(true);
    expect(sessionMatchesPlanDay(s(`${PLAN_NAME} 2`), PLAN_NAME, blocks)).toBe(false); // prefix lookalike
    expect(sessionMatchesPlanDay(s("Morning workout", blocks), PLAN_NAME, blocks)).toBe(true); // block overlap
    expect(sessionMatchesPlanDay(s("Morning workout"), PLAN_NAME, blocks)).toBe(false);
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

describe("alsoTodayCopy", () => {
  it("invites the first sport log only when NOTHING is done today", () => {
    expect(alsoTodayCopy({ doneCount: 0 })).toEqual({
      subKey: "w.home.today.alsoTodaySubEmpty",
      logKey: "w.home.today.alsoTodayLogSport",
    });
  });

  it("anything done: no sub-line (the rows carry it), log label reads 'another sport'", () => {
    expect(alsoTodayCopy({ doneCount: 1 })).toEqual({
      subKey: null,
      logKey: "w.home.today.alsoTodayLogSportMore",
    });
    expect(alsoTodayCopy({ doneCount: 2 }).subKey).toBeNull();
  });

  it("a NON-today empty day gets the past-tense empty line, not the log invitation", () => {
    expect(alsoTodayCopy({ doneCount: 0, isToday: false }).subKey).toBe("w.home.today.alsoDayEmpty");
    // non-empty non-today days show rows, no sub-line — same machine as today
    expect(alsoTodayCopy({ doneCount: 1, isToday: false }).subKey).toBeNull();
    // explicit isToday keeps today's invitation
    expect(alsoTodayCopy({ doneCount: 0, isToday: true }).subKey).toBe("w.home.today.alsoTodaySubEmpty");
  });
});
