import { describe, it, expect } from "vitest";
import {
  ACTIVITY_RANGE_PRESETS, activityBaselineWindows, activityMonthId, activityMonths,
  activitySummary, activityTotals, activityWeekRange, groupDistanceDisplay, resolveActivityRange,
} from "./activity-window";
import { addLocalDays, localMondayMs } from "./day-key";
import type { LoggedSession, SessionBlock } from "./engines/session";

// Wednesday 29 July 2026, local noon. A midweek anchor is the point: a rolling
// seven days and a Mon–Sun week disagree here, which is the whole reason the
// range model exists.
const NOW = new Date(2026, 6, 29, 12, 0, 0).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const at = (daysAgo: number) => addLocalDays(NOW, -daysAgo);

function session(id: string, daysAgo: number, blocks: SessionBlock[], minutes: number | null = 60): LoggedSession {
  const started = at(daysAgo);
  return {
    id,
    title: id,
    startedAt: iso(started),
    completedAt: minutes == null ? null : iso(started + minutes * 60000),
    blocks,
  } as LoggedSession;
}

// Loads and reps are STRINGS on the wire — that's what the loggers write.
const lift = (kg: number): SessionBlock =>
  ({ kind: "strength", name: "Deadlift", sets: [{ load: String(kg), reps: "1" }] });
const cardio = (name: string, discipline: string, minutes: number, distance?: number): SessionBlock =>
  ({ kind: "cardio", name, discipline, minutes, distance } as SessionBlock);

describe("resolveActivityRange", () => {
  it("makes THIS WEEK Monday → Sunday, not a rolling seven days", () => {
    const week = resolveActivityRange("week", NOW);
    expect(week.from).toBe(localMondayMs(NOW));
    expect(new Date(week.from).getDay()).toBe(1); // Monday
    expect(week.to).toBe(addLocalDays(week.from, 7));
    // Wednesday: three days in, and still running.
    expect(week.days).toBe(3);
    expect(week.inProgress).toBe(true);

    // The rolling window is a DIFFERENT period, and says so.
    const rolling = resolveActivityRange("d7", NOW);
    expect(rolling.from).toBeLessThan(week.from);
    expect(rolling.days).toBe(7);
  });

  it("resolves the day windows, the year to date and a single month", () => {
    expect(resolveActivityRange("d30", NOW).days).toBe(30);
    const ytd = resolveActivityRange("ytd", NOW);
    expect(new Date(ytd.from).getMonth()).toBe(0);
    expect(new Date(ytd.from).getDate()).toBe(1);

    const june = resolveActivityRange("m:2026-06", NOW);
    expect(june.kind).toBe("month");
    expect(june.month).toBe("2026-06");
    expect(june.days).toBe(30);
    expect(june.inProgress).toBe(false);

    // The month in progress stops at today, so it can't claim days it hasn't had.
    const july = resolveActivityRange("m:2026-07", NOW);
    expect(july.days).toBe(29);
    expect(july.inProgress).toBe(true);
  });

  it("falls back to the week for anything it doesn't recognise", () => {
    for (const id of ["", "nonsense", "m:2026-13", "m:2099-01", null, undefined]) {
      expect(resolveActivityRange(id, NOW).kind).toBe("week");
    }
  });

  it("offers every preset the filter shows", () => {
    for (const p of ACTIVITY_RANGE_PRESETS) expect(resolveActivityRange(p.id, NOW).id).toBe(p.id);
  });
});

describe("activityWeekRange", () => {
  it("resolves the week containing ANY instant, not the week `now` is in", () => {
    const threeWeeksBack = addLocalDays(NOW, -21);
    const r = activityWeekRange(threeWeeksBack, NOW);
    expect(r.from).toBe(localMondayMs(threeWeeksBack));
    expect(r.to).toBe(addLocalDays(r.from, 7));
    expect(r.kind).toBe("week");
  });

  it("sums a FINISHED week whole — the shortcut of passing a date inside it as `now` would not", () => {
    const past = activityWeekRange(addLocalDays(NOW, -21), NOW);
    expect(past.through).toBe(past.to);
    expect(past.days).toBe(7);
    expect(past.inProgress).toBe(false);
    // and the week in progress is still truncated to today, exactly like the preset
    const here = activityWeekRange(NOW, NOW);
    expect(here.from).toBe(resolveActivityRange("week", NOW).from);
    expect(here.days).toBe(3);
    expect(here.inProgress).toBe(true);
  });
});

describe("activityBaselineWindows", () => {
  it("truncates the comparison windows to the elapsed length of a live period", () => {
    // Three days into the week → the four prior weeks are compared over their
    // first three days each, not over seven.
    const week = resolveActivityRange("week", NOW);
    const windows = activityBaselineWindows(week);
    expect(windows).toHaveLength(4);
    for (const w of windows) expect(Math.round((w.to - w.from) / 86_400_000)).toBe(3);
    expect(windows[0]!.from).toBe(addLocalDays(week.from, -7));
  });

  it("compares a month against the three months before it, and a YTD against past years", () => {
    expect(activityBaselineWindows(resolveActivityRange("m:2026-06", NOW))).toHaveLength(3);
    const years = activityBaselineWindows(resolveActivityRange("ytd", NOW));
    expect(years).toHaveLength(2);
    expect(new Date(years[0]!.from).getFullYear()).toBe(2025);
  });
});

describe("activityMonths", () => {
  it("runs from this month back to the oldest session, empty months included", () => {
    const months = activityMonths([session("a", 120, [lift(100)])], NOW);
    expect(months[0]).toBe("m:2026-07");
    expect(months).toContain("m:2026-06"); // nothing logged, still listed
    expect(months[months.length - 1]).toBe(activityMonthId(at(120)));
  });

  it("is just this month for an athlete with nothing logged", () => {
    expect(activityMonths([], NOW)).toEqual(["m:2026-07"]);
  });
});

describe("activitySummary — the totals are TOTAL", () => {
  it("counts a timed sport's own minutes even with no stopwatch on the session", () => {
    // The bug this closes: hours used to come from completedAt alone, so a
    // tennis match logged as 90 minutes contributed nothing to the week.
    const tennis = session("t", 1, [cardio("Tennis", "sport", 90)], null);
    const totals = activityTotals([tennis], NOW - 7 * 86_400_000, NOW + 1);
    expect(totals.hours).toBe(90);
    expect(totals.sessions).toBe(1);
  });

  it("splits 41.6 km across every sport that made it", () => {
    // The headline case: 39 km of running, 600 m in the pool, 2 km of walking.
    const sessions = [
      session("run-a", 1, [cardio("Long run", "running", 120, 21)]),
      session("run-b", 2, [cardio("Easy run", "running", 100, 18)]),
      session("swim", 3, [cardio("Swim", "swimming", 30, 0.6)]),
      session("walk", 4, [cardio("Walk", "walking", 25, 2)]),
      session("squash", 5, [cardio("Squash", "sport", 60)]),
    ];
    const summary = activitySummary(sessions, resolveActivityRange("d7", NOW));
    expect(Math.round(summary.totals.distance * 10) / 10).toBe(41.6);

    const km = summary.details.distance;
    // Every group sums back to the figure the card shows.
    expect(Math.round(km.groups.reduce((n, g) => n + g.value, 0) * 10) / 10).toBe(41.6);
    expect(km.groups.map((g) => g.id)).toEqual(["d:running", "d:walking", "d:swimming"]);

    const running = km.groups[0]!;
    expect(running.value).toBe(39);
    expect(running.sessions).toBe(2);
    expect(running.items.map((i) => i.name)).toEqual(["Long run", "Easy run"]);

    // …and the pool reads in metres, which is why 600 m never has to be "0.6 km".
    const swim = km.groups.find((g) => g.id === "d:swimming")!;
    expect(swim.unit).toBe("m");
    expect(groupDistanceDisplay(swim.value, swim.unit)).toBe("600");

    // Squash has no distance, so it isn't in the distance breakdown at all —
    // but it is in the hours one, under its own name rather than "Sport".
    expect(km.groups.some((g) => g.id === "sport:squash")).toBe(false);
    expect(summary.details.hours.groups.some((g) => g.label === "Squash")).toBe(true);
  });

  it("keeps tennis and squash apart instead of collapsing them into 'Sport'", () => {
    const sessions = [
      session("t1", 1, [cardio("Tennis", "sport", 90)], null),
      session("t2", 2, [cardio("Tennis", "sport", 60)], null),
      session("sq", 3, [cardio("Squash", "sport", 45)], null),
    ];
    const hours = activitySummary(sessions, resolveActivityRange("d7", NOW)).details.hours;
    expect(hours.total).toBe(195);
    expect(hours.groups.map((g) => [g.label, g.value])).toEqual([["Tennis", 150], ["Squash", 45]]);
    expect(hours.groups[0]!.sessions).toBe(2);
  });

  it("attributes a mixed session's leftover wall-clock to the lifting", () => {
    // 90 minutes on the clock, 30 of them a logged run → 60 minutes of lifting.
    const mixed = session("mix", 1, [lift(200), cardio("Run", "running", 30, 5)], 90);
    const summary = activitySummary([mixed], resolveActivityRange("d7", NOW));
    expect(summary.totals.hours).toBe(90);
    const hours = summary.details.hours;
    expect(hours.groups.reduce((n, g) => n + g.value, 0)).toBe(90);
    expect(hours.groups.find((g) => g.id === "strength")!.value).toBe(60);
    expect(hours.groups.find((g) => g.id === "d:running")!.value).toBe(30);

    // One session, filed under the lifting; the run doesn't double-count it.
    expect(summary.details.sessions.total).toBe(1);
    expect(summary.details.sessions.groups[0]!.id).toBe("strength");
  });

  it("takes the device's own duration when it exceeds the stopwatch", () => {
    // A watch-imported 44-minute run on a session someone stopped at 20.
    const s = session("import", 1, [cardio("Run", "running", 44, 8)], 20);
    expect(activitySummary([s], resolveActivityRange("d7", NOW)).totals.hours).toBe(44);
  });

  it("lists the sessions behind the tonnage, newest first", () => {
    const sessions = [session("a", 1, [lift(1000)]), session("b", 3, [lift(3000)]), session("c", 2, [lift(2000)])];
    const detail = activitySummary(sessions, resolveActivityRange("d7", NOW)).details.tonnage;
    expect(detail.total).toBe(6000);
    expect(detail.items.map((i) => i.sessionId)).toEqual(["a", "c", "b"]);
    expect(detail.sessions).toBe(3);
  });

  it("holds the period's edges — a Monday session is this week, Sunday's is not", () => {
    const week = resolveActivityRange("week", NOW);
    const monday = { ...session("mon", 0, [lift(100)]), startedAt: iso(week.from + 3600_000) };
    const sunday = { ...session("sun", 0, [lift(100)]), startedAt: iso(week.from - 3600_000) };
    const summary = activitySummary([monday, sunday], week);
    expect(summary.sessions).toBe(1);
    expect(summary.details.sessions.items[0]!.sessionId).toBe("mon");
  });

  it("is empty, not broken, for a period with nothing in it", () => {
    const summary = activitySummary([session("old", 200, [lift(100)])], resolveActivityRange("week", NOW));
    expect(summary.totals).toEqual({ tonnage: 0, sessions: 0, hours: 0, distance: 0 });
    for (const m of ["tonnage", "sessions", "hours", "distance"] as const) {
      expect(summary.details[m].groups).toEqual([]);
      expect(summary.details[m].items).toEqual([]);
    }
  });
});
