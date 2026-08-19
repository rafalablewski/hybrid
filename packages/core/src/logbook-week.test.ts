import { describe, it, expect } from "vitest";
import { logbookWeek, mergeDoneReceipts, LOGBOOK_WINDOW, LOGBOOK_SCROLL_WINDOW } from "./logbook-week";
import type { LoggedSession } from "./engines/session";
import type { DoneReceipt } from "./done-receipt";

// A fixed local "now": Sunday 19 Jul 2026, 16:00 local.
const NOW = new Date(2026, 6, 19, 16, 0, 0).getTime();

const at = (y: number, m: number, d: number, h = 12): string => new Date(y, m, d, h).toISOString();

const sess = (id: string, startedAt: string): LoggedSession => ({
  id,
  title: `Workout ${id}`,
  startedAt,
  blocks: [{ kind: "strength", name: "Back Squat", sets: [{ weightKg: 100, reps: 5 }] }],
} as unknown as LoggedSession);

// A cardio session with an explicit duration, for the load bars.
const cardio = (id: string, startedAt: string, minutes: number): LoggedSession => ({
  id,
  title: `Run ${id}`,
  startedAt,
  blocks: [{ kind: "cardio", name: "Running", discipline: "run", minutes }],
} as unknown as LoggedSession);

describe("logbookWeek — the day's load", () => {
  it("sums a day's trained minutes and normalises against the heaviest day in view", () => {
    const wk = logbookWeek(
      [
        cardio("a", at(2026, 6, 17), 30),
        cardio("b", at(2026, 6, 18), 60),
        cardio("c", at(2026, 6, 18, 18), 30), // same day, second session
      ],
      { now: NOW },
    );
    const byKey = Object.fromEntries(wk.days.map((d) => [d.dateKey, d]));
    expect(byKey["2026-07-18"]!.loadMin).toBe(90); // the day sums
    expect(byKey["2026-07-18"]!.load).toBe(1); // and it is the peak
    expect(byKey["2026-07-17"]!.loadMin).toBe(30);
    expect(byKey["2026-07-17"]!.load).toBeCloseTo(1 / 3, 5);
  });

  it("leaves an untrained day at zero", () => {
    const wk = logbookWeek([cardio("a", at(2026, 6, 18), 45)], { now: NOW });
    expect(wk.days.find((d) => d.dateKey === "2026-07-16")!.load).toBe(0);
    expect(wk.days.find((d) => d.dateKey === "2026-07-16")!.loadMin).toBe(0);
  });

  it("gives a trained day with no trustworthy duration a visible floor, never zero", () => {
    // A strength log with no clock: 'trained' and 'trained for zero minutes'
    // are different facts, and only one of them is true.
    const wk = logbookWeek([sess("s", at(2026, 6, 18))], { now: NOW });
    const day = wk.days.find((d) => d.dateKey === "2026-07-18")!;
    expect(day.logged).toBe(true);
    expect(day.loadMin).toBe(0);
    expect(day.load).toBeGreaterThan(0);
  });

  it("scales to the scroll window without changing the day shape", () => {
    const wk = logbookWeek([], { now: NOW, windowDays: LOGBOOK_SCROLL_WINDOW });
    expect(wk.days).toHaveLength(28);
    expect(wk.days[27]!.isToday).toBe(true);
    expect(wk.todayIndex).toBe(27);
    expect(wk.days.every((d) => d.load === 0)).toBe(true);
  });
});

describe("logbookWeek", () => {
  it("returns a trailing 7-day window ending today, oldest first", () => {
    const wk = logbookWeek([], { now: NOW });
    expect(wk.days).toHaveLength(LOGBOOK_WINDOW);
    expect(wk.todayIndex).toBe(6);
    expect(wk.days[6]!.isToday).toBe(true);
    expect(wk.days[6]!.dateKey).toBe("2026-07-19");
    expect(wk.days[0]!.dateKey).toBe("2026-07-13");
    expect(wk.days.map((d) => d.dayOfMonth)).toEqual([13, 14, 15, 16, 17, 18, 19]);
    expect(wk.days[0]!.weekdayShort).toBe("Mon");
    expect(wk.days[6]!.weekdayShort).toBe("Sun");
    expect(wk.loggedDayCount).toBe(0);
  });

  it("reconciles sessions onto their LOCAL day and counts logged days", () => {
    const sessions = [
      sess("a", at(2026, 6, 13)), // Mon
      sess("b", at(2026, 6, 13, 18)), // Mon again — same day, second session
      sess("c", at(2026, 6, 17)), // Fri
      sess("d", at(2026, 6, 19, 15)), // today
      sess("e", at(2026, 6, 1)), // outside the window — ignored
    ];
    const wk = logbookWeek(sessions, { now: NOW });
    expect(wk.days[0]!.logged).toBe(true);
    expect(wk.days[0]!.sessionIds).toEqual(["a", "b"]);
    expect(wk.days[1]!.logged).toBe(false);
    expect(wk.days[4]!.sessionIds).toEqual(["c"]);
    expect(wk.days[6]!.sessionIds).toEqual(["d"]);
    expect(wk.loggedDayCount).toBe(3);
  });

  it("keys a late-evening session to its local day, not the UTC one", () => {
    const wk = logbookWeek([sess("late", new Date(2026, 6, 18, 23, 30).toISOString())], { now: NOW });
    expect(wk.days[5]!.dateKey).toBe("2026-07-18");
    expect(wk.days[5]!.sessionIds).toEqual(["late"]);
  });

  it("ignores sessions with an unparsable start", () => {
    const wk = logbookWeek([sess("bad", "not-a-date")], { now: NOW });
    expect(wk.loggedDayCount).toBe(0);
  });
});

describe("mergeDoneReceipts", () => {
  // (the `r` factory below builds a receipt; these two cases cover the measured
  // clock, which only adds up while every timed session brought seconds)
  const r = (over: Partial<DoneReceipt>): DoneReceipt => ({
    durationMin: null,
    durationSec: null,
    tonnageKg: 0,
    sets: 0,
    strengthSets: 0,
    distanceKm: 0,
    elevationM: 0,
    kcal: null,
    kcalMeasured: false,
    measured: false,
    cardioLead: null,
    ...over,
  });

  it("returns null for an empty day", () => {
    expect(mergeDoneReceipts([])).toBeNull();
  });

  it("sums the day's figures", () => {
    const merged = mergeDoneReceipts([
      r({ durationMin: 40, tonnageKg: 1200, sets: 10, distanceKm: 0 }),
      r({ durationMin: 30, tonnageKg: 300, sets: 4, distanceKm: 5.2 }),
    ])!;
    expect(merged.durationMin).toBe(70);
    expect(merged.tonnageKg).toBe(1500);
    expect(merged.sets).toBe(14);
    expect(merged.distanceKm).toBe(5.2);
  });

  it("keeps duration null when NO session carried a trusted one", () => {
    const merged = mergeDoneReceipts([r({ sets: 5 }), r({ sets: 3 })])!;
    expect(merged.durationMin).toBeNull();
  });

  it("keeps a partial trusted duration (one session tracked, one typed in)", () => {
    const merged = mergeDoneReceipts([r({ durationMin: 45 }), r({})])!;
    expect(merged.durationMin).toBe(45);
  });

  it("sums the measured clock only while every timed session brought seconds", () => {
    const bothMeasured = mergeDoneReceipts([
      r({ durationMin: 20, durationSec: 1181 }),
      r({ durationMin: 45, durationSec: 2700 }),
    ])!;
    expect(bothMeasured.durationSec).toBe(3881);
    // One typed session in the day has no seconds to give, so the day's second
    // total would be a lie — it drops rather than under-count.
    const mixed = mergeDoneReceipts([r({ durationMin: 20, durationSec: 1181 }), r({ durationMin: 45 })])!;
    expect(mixed.durationSec).toBeNull();
  });

  it("sums the day's calories, and keeps them measured only when every session was", () => {
    const measured = mergeDoneReceipts([
      r({ kcal: 420, kcalMeasured: true }),
      r({ kcal: 180, kcalMeasured: true }),
    ])!;
    expect(measured.kcal).toBe(600);
    expect(measured.kcalMeasured).toBe(true);

    // A watch-counted run plus a typed gym session: the total is part
    // measurement, part model — so it stays an estimate.
    const mixed = mergeDoneReceipts([r({ kcal: 420, kcalMeasured: true }), r({ kcal: 300 })])!;
    expect(mixed.kcal).toBe(720);
    expect(mixed.kcalMeasured).toBe(false);
  });

  it("keeps calories null when no session could estimate any", () => {
    const merged = mergeDoneReceipts([r({ durationMin: 40 }), r({ durationMin: 20 })])!;
    expect(merged.kcal).toBeNull();
    expect(merged.kcalMeasured).toBe(false);
  });
});

describe("logbookWeek — what the day WAS", () => {
  // A gym session that carries a duration, so it can compete on minutes.
  const lift = (id: string, startedAt: string, minutes: number): LoggedSession => ({
    id, title: `Lift ${id}`, startedAt,
    blocks: [
      { kind: "strength", name: "Back Squat", sets: [{ weightKg: 100, reps: 5 }] },
      { kind: "conditioning", name: "Finisher", minutes },
    ],
    durationMin: minutes,
  } as unknown as LoggedSession);

  const dayFor = (sessions: LoggedSession[], y: number, m: number, d: number) =>
    logbookWeek(sessions, { now: NOW }).days.find((x) => x.dateKey === logbookWeek([], { now: new Date(y, m, d, 12).getTime() }).days.at(-1)!.dateKey);

  it("is null on a day with nothing logged", () => {
    const wk = logbookWeek([], { now: NOW });
    for (const d of wk.days) expect(d.kind).toBeNull();
  });

  it("names the day by its LONGEST session, not its first", () => {
    // A 12-minute jog banked before a 70-minute lift is a lifting day: the bar
    // draws minutes, so its colour has to describe the minutes it is drawing.
    const wk = logbookWeek(
      [cardio("jog", at(2026, 6, 17, 7), 12), lift("lift", at(2026, 6, 17, 18), 70)],
      { now: NOW },
    );
    const day = wk.days.find((d) => d.dateKey === "2026-07-17");
    expect(day?.kind).toBe("gym");
  });

  it("keeps the endurance day endurance when the run is the long one", () => {
    const wk = logbookWeek(
      [lift("l", at(2026, 6, 17, 7), 20), cardio("long", at(2026, 6, 17, 18), 95)],
      { now: NOW },
    );
    expect(wk.days.find((d) => d.dateKey === "2026-07-17")?.kind).toBe("running");
  });

  it("does not flip on the order of two equal sessions", () => {
    const a = cardio("a", at(2026, 6, 17, 7), 40);
    const b = lift("b", at(2026, 6, 17, 18), 40);
    const one = logbookWeek([a, b], { now: NOW }).days.find((d) => d.dateKey === "2026-07-17")?.kind;
    const two = logbookWeek([b, a], { now: NOW }).days.find((d) => d.dateKey === "2026-07-17")?.kind;
    // Whichever wins, the SAME one wins both times — a tie may not repaint the
    // strip on a re-sort of the same input.
    expect(one).toBe(two);
  });

  it("still names a day whose sessions carry no duration at all", () => {
    const wk = logbookWeek([sess("s", at(2026, 6, 16))], { now: NOW });
    expect(wk.days.find((d) => d.dateKey === "2026-07-16")?.kind).toBe("gym");
  });
});
