import { describe, it, expect } from "vitest";
import {
  HISTORY_VIEWS,
  normalizeHistoryView,
  historyStream,
  upcomingPlanDays,
  journalMonth,
  latestTrainingDayKey,
  weekChapters,
  blockChapters,
} from "./history-views";
import { planSchedule } from "../plan-schedule";
import type { LoggedSession } from "./session";

// 2026-07-16 (Thu) noon LOCAL — the fixed "now" for every test. All fixture
// timestamps are LOCAL-constructed so the day-grouping expectations hold in
// any timezone the tests run in (day keys are local calendar days).
const NOW = new Date(2026, 6, 16, 12).getTime();
const at = (day: number, hour: number) => new Date(2026, 6, day, hour).toISOString(); // July 2026, local time

const lift = (id: string, iso: string, title = "Lower", load = "100"): LoggedSession => ({
  id, title, startedAt: iso,
  blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load, reps: "5", rpe: "8" }, { load, reps: "5", rpe: "8" }] }],
});
const run = (id: string, iso: string, title = "Morning run"): LoggedSession => ({
  id, title, startedAt: iso,
  blocks: [{ kind: "cardio", name: "Run", minutes: 30, rpe: 6, distance: 5 }],
});

const FIXTURE: LoggedSession[] = [
  run("t1", at(16, 8), "Tennis"), // Thu (today)
  lift("d2", at(13, 18), "Soviet 8-Week Peaking – Week 2, Day 2", "120"), // Mon
  lift("d1", at(13, 8), "Soviet 8-Week Peaking – Week 2, Day 1", "110"),
  lift("aft", at(13, 20), "Afternoon workout", "60"),
  lift("w1", at(9, 8), "Soviet 8-Week Peaking – Week 1, Day 5", "100"), // prev Thu
  run("r1", at(9, 18)),
];

describe("view registry", () => {
  it("normalizes unknown (and retired) ids to the agenda", () => {
    expect(normalizeHistoryView("weeks")).toBe("weeks");
    expect(normalizeHistoryView("nope")).toBe("agenda");
    expect(normalizeHistoryView(undefined)).toBe("agenda");
    // the retired layouts a device may still have persisted
    expect(normalizeHistoryView("list")).toBe("agenda");
    expect(normalizeHistoryView("heatmap")).toBe("agenda");
    expect(HISTORY_VIEWS[0]!.id).toBe("agenda");
  });
});

describe("historyStream", () => {
  const stream = historyStream(FIXTURE, { now: NOW });

  it("groups by day newest-first with rest gaps between", () => {
    const kinds = stream.map((x) => x.kind);
    expect(kinds).toEqual(["day", "gap", "day", "gap", "day"]);
    const days = stream.filter((x) => x.kind === "day");
    expect(days.map((d) => d.kind === "day" && d.dateKey)).toEqual(["2026-07-16", "2026-07-13", "2026-07-09"]);
  });

  it("computes gap lengths (whole rest days between training days)", () => {
    const gaps = stream.filter((x) => x.kind === "gap");
    expect(gaps[0]).toMatchObject({ days: 2 }); // Jul 14 + 15
    expect(gaps[1]).toMatchObject({ days: 3 }); // Jul 10–12
  });

  it("flags today, orders sessions newest-first, sums volume", () => {
    const today = stream[0]!;
    expect(today.kind === "day" && today.isToday).toBe(true);
    const mon = stream[2]!;
    if (mon.kind !== "day") throw new Error("expected day");
    expect(mon.sessions.map((s) => s.id)).toEqual(["aft", "d2", "d1"]);
    expect(mon.volume).toBe(2 * 120 * 5 + 2 * 110 * 5 + 2 * 60 * 5);
    expect(mon.shape).toBe("strength");
    // Jul 9 (lift + 30-min run) carries the highest sRPE load, so Jul 13 sits a level below.
    expect(mon.level).toBe(3);
    const thu9 = stream[4]!;
    expect(thu9.kind === "day" && thu9.level).toBe(4);
  });

  it("marks cardio-only days and mixed days", () => {
    const today = stream[0]!;
    expect(today.kind === "day" && today.shape).toBe("cardio");
    const thu9 = stream[4]!;
    expect(thu9.kind === "day" && thu9.shape).toBe("mixed");
  });
});

describe("journalMonth", () => {
  const j = journalMonth(FIXTURE, 2026, 6); // July 2026

  it("builds ticks per session and load levels", () => {
    expect(j.days["2026-07-13"]!.ticks).toEqual(["strength", "strength", "strength"]);
    expect(j.days["2026-07-13"]!.level).toBe(3);
    expect(j.days["2026-07-09"]!.level).toBe(4);
    expect(j.days["2026-07-16"]!.ticks).toEqual(["cardio"]);
    expect(j.days["2026-07-16"]!.count).toBe(1);
    expect(j.matrix.flat()).toHaveLength(42);
  });

  it("flags PR days", () => {
    // d2 (120) beats d1/w1 loads on Back Squat → Jul 13 is a PR day
    expect(j.days["2026-07-13"]!.pr).toBe(true);
  });

  it("uses the injected prs lookup instead of re-detecting", () => {
    const j2 = journalMonth(FIXTURE, 2026, 6, { prs: () => 0 });
    expect(Object.values(j2.days).every((d) => !d.pr)).toBe(true);
    const w2 = weekChapters(FIXTURE, { now: NOW, prs: () => 1 });
    expect(w2[0]!.totals.prs).toBe(w2[0]!.totals.sessions);
  });

  it("picks the latest training day as default selection", () => {
    expect(latestTrainingDayKey(FIXTURE, NOW)).toBe("2026-07-16");
    expect(latestTrainingDayKey([], NOW)).toBe("2026-07-16");
  });
});

describe("weekChapters", () => {
  const weeks = weekChapters(FIXTURE, { now: NOW });

  it("groups Mon–Sun weeks newest-first and marks the current one", () => {
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ startKey: "2026-07-13", endKey: "2026-07-19", isCurrent: true });
    expect(weeks[1]).toMatchObject({ startKey: "2026-07-06", isCurrent: false });
  });

  it("builds 7 sparkline days with discipline flags + totals", () => {
    const w = weeks[0]!;
    expect(w.days).toHaveLength(7);
    expect(w.days[0]).toMatchObject({ dateKey: "2026-07-13", hasStrength: true, hasCardio: false });
    expect(w.days[0]!.load).toBeGreaterThan(0);
    expect(w.days[1]!.load).toBe(0); // Tue rest
    expect(w.days[3]).toMatchObject({ dateKey: "2026-07-16", hasCardio: true, hasStrength: false });
    expect(w.totals.sessions).toBe(4);
    expect(w.sessions[0]!.id).toBe("t1"); // newest first
  });
});

describe("blockChapters (title-parse fallback)", () => {
  const chapters = blockChapters(FIXTURE);

  it("groups plan-titled sessions into plan-week chapters + freestyle", () => {
    expect(chapters.map((c) => `${c.kind}:${c.planName ?? "free"}#${c.week ?? "-"}`)).toEqual([
      "free:free#-", // Tennis Jul 16 (newest activity)
      "plan:Soviet 8-Week Peaking#2",
      "plan:Soviet 8-Week Peaking#1",
    ]);
    const w2 = chapters[1]!;
    expect(w2.done).toBe(2);
    expect(w2.rows.map((r) => r.title)).toEqual(["Day 2", "Day 1"]);
    expect(w2.rows[0]!.sessionId).toBe("d2");
  });

  it("collects non-plan sessions into the freestyle chapter", () => {
    const free = chapters[0]!;
    expect(free.rows.map((r) => r.title)).toEqual(["Tennis", "Afternoon workout", "Morning run"]);
  });
});

describe("blockChapters + upcomingPlanDays (with a real schedule)", () => {
  // A real 8-week program anchored so that NOW falls inside week 2.
  const PLAN = "oly-soviet-8wk";
  const sched = planSchedule({
    planId: PLAN,
    startedAt: new Date(2026, 6, 6).toISOString(),
    sessions: FIXTURE,
    now: NOW,
  });

  it("resolves a schedule for the fixture plan", () => {
    expect(sched).not.toBeNull();
  });

  it("emits started weeks with done/total and claims fulfilled sessions", () => {
    const chapters = blockChapters(FIXTURE, { schedule: sched });
    const plan = chapters.filter((c) => c.kind === "plan");
    expect(plan.length).toBeGreaterThan(0);
    for (const c of plan) {
      expect(c.total).toBeGreaterThan(0);
      expect(c.done).toBeLessThanOrEqual(c.total);
      expect(c.planName).toBe(sched!.planName);
    }
    // Sessions matched by the schedule land in plan chapters, not freestyle.
    const free = chapters.find((c) => c.kind === "free");
    const claimed = plan.flatMap((c) => c.rows.map((r) => r.sessionId)).filter(Boolean);
    expect(claimed.length).toBeGreaterThan(0);
    for (const id of claimed) expect(free?.rows.some((r) => r.sessionId === id) ?? false).toBe(false);
  });

  it("lists the next upcoming training days as agenda ghosts", () => {
    const up = upcomingPlanDays(sched, 2);
    // Jul 16 carries a logged session (t1) → today is "done", so only future
    // ghosts appear, capped at the limit.
    expect(up.filter((u) => !u.isToday)).toHaveLength(2);
    const future = up.filter((u) => !u.isToday);
    expect(future[0]!.dateKey > "2026-07-16").toBe(true);
    expect(future[0]!.planName).toBe(sched!.planName);
    expect(future[0]!.week).toBeGreaterThan(0); // multi-week plan → week set
    expect(future[0]!.title.length).toBeGreaterThan(0);
  });

  it("includes TODAY's still-open plan session as an isToday ghost", () => {
    // Same schedule but nothing logged today: if today is a training day it
    // must surface as an isToday ghost ahead of the future ones.
    const sched2 = planSchedule({
      planId: PLAN,
      startedAt: new Date(2026, 6, 6).toISOString(),
      sessions: FIXTURE.filter((s) => s.id !== "t1"),
      now: NOW,
    })!;
    const dueToday = sched2.days.find((d) => d.isToday && !d.isRest);
    const up = upcomingPlanDays(sched2, 2);
    if (dueToday) {
      expect(up[0]).toMatchObject({ isToday: true, dateKey: dueToday.dateKey });
      expect(up.filter((u) => !u.isToday)).toHaveLength(2); // limit caps only the future ones
    } else {
      expect(up.every((u) => !u.isToday)).toBe(true);
    }
  });

  it("returns [] without a schedule", () => {
    expect(upcomingPlanDays(null)).toEqual([]);
  });
});
