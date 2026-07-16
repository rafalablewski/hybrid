import { describe, it, expect } from "vitest";
import {
  HISTORY_VIEWS,
  normalizeHistoryView,
  historyStream,
  upcomingPlanDays,
  historyStats,
  journalMonth,
  latestTrainingDayKey,
  weekChapters,
  blockChapters,
} from "./history-views";
import { planSchedule } from "../plan-schedule";
import type { LoggedSession } from "./session";

// 2026-07-16 (Thu) noon UTC — the fixed "now" for every test.
const NOW = Date.parse("2026-07-16T12:00:00.000Z");

const lift = (id: string, iso: string, title = "Lower", load = "100"): LoggedSession => ({
  id, title, startedAt: iso,
  blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load, reps: "5", rpe: "8" }, { load, reps: "5", rpe: "8" }] }],
});
const run = (id: string, iso: string, title = "Morning run"): LoggedSession => ({
  id, title, startedAt: iso,
  blocks: [{ kind: "cardio", name: "Run", minutes: 30, rpe: 6, distanceKm: 5 }],
});

const FIXTURE: LoggedSession[] = [
  run("t1", "2026-07-16T08:00:00.000Z", "Tennis"), // Thu (today)
  lift("d2", "2026-07-13T18:00:00.000Z", "Soviet 8-Week Peaking – Week 2, Day 2", "120"), // Mon
  lift("d1", "2026-07-13T08:00:00.000Z", "Soviet 8-Week Peaking – Week 2, Day 1", "110"),
  lift("aft", "2026-07-13T20:00:00.000Z", "Afternoon workout", "60"),
  lift("w1", "2026-07-09T08:00:00.000Z", "Soviet 8-Week Peaking – Week 1, Day 5", "100"), // prev Thu
  run("r1", "2026-07-09T18:00:00.000Z"),
];

describe("view registry", () => {
  it("normalizes unknown ids to the classic list", () => {
    expect(normalizeHistoryView("agenda")).toBe("agenda");
    expect(normalizeHistoryView("nope")).toBe("list");
    expect(normalizeHistoryView(undefined)).toBe("list");
    expect(HISTORY_VIEWS[0]!.id).toBe("list");
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

describe("historyStats", () => {
  it("counts sessions/volume in the window and the week streak", () => {
    const s = historyStats(FIXTURE, { weeks: 12, now: NOW });
    expect(s.sessions).toBe(6);
    expect(s.volume).toBe(2 * 120 * 5 + 2 * 110 * 5 + 2 * 60 * 5 + 2 * 100 * 5);
    // Jul 16 week + Jul 9 week + Jul 13 week are 2 distinct Mondays → streak 2
    expect(s.streakWeeks).toBe(2);
  });

  it("doesn't break the streak on a young empty current week", () => {
    const past = [lift("a", "2026-07-08T08:00:00.000Z"), lift("b", "2026-07-01T08:00:00.000Z")];
    // now = Tue Jul 14, nothing logged this week yet → streak counts prior weeks
    const s = historyStats(past, { now: Date.parse("2026-07-14T12:00:00.000Z") });
    expect(s.streakWeeks).toBe(2);
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
    startedAt: "2026-07-06T00:00:00.000Z",
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
    expect(up).toHaveLength(2);
    expect(up[0]!.dateKey > "2026-07-16").toBe(true);
    expect(up[0]!.planName).toBe(sched!.planName);
    expect(up[0]!.label).toMatch(/Week \d+/);
  });

  it("returns [] without a schedule", () => {
    expect(upcomingPlanDays(null)).toEqual([]);
  });
});
