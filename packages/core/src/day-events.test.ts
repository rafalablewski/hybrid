import { describe, it, expect } from "vitest";
import {
  EVENT_LABEL_MAX, dayEventToday, dayEventTomorrow, dayFactOn, declaredOn,
  planDayKind, planEventOn, planRaceKind, planRaceOn, sanitizeDeclaredEvents, type DeclaredEvent,
} from "./day-events";
import { planSchedule, type ScheduledDay } from "./plan-schedule";
import { localDayKey } from "./day-key";
import type { LoggedSession, SessionBlock } from "./engines/session";
import { blocksKind, type TrainingKind } from "./day-band";

/**
 * WHAT IS ON A DAY. Three sources, one order, and the two claims that are worth
 * a test rather than a comment:
 *
 *  1. A FACT BEATS A GUESS, and the fixture — the only guess — is also the only
 *     one a "not today" can withdraw. Rejecting a Thursday game must not cancel
 *     a declared race, and deleting a race must not be the only way to argue
 *     with a Thursday.
 *  2. A COMPETITION DAY IS NOT A REST DAY. The plan's race day prescribes no
 *     session, so it reaches the schedule as `isRest: true`; before the day's
 *     structured `kind` was carried through, the band read that as a Sunday off
 *     and said "Rest day" on the morning of the meet.
 */

const DAY = 86_400_000;
const NOW = new Date(2026, 7, 19, 12, 0, 0).getTime(); // a Wednesday, local noon
const TOMORROW = localDayKey(NOW + DAY);
const TODAY = localDayKey(NOW);

const ev = (date: string, kind: TrainingKind, label: string | null = null): DeclaredEvent =>
  ({ id: `${kind}-${date}`, date, kind, label });

function session(daysAgo: number, kind: TrainingKind, id = `${kind}-${daysAgo}`): LoggedSession {
  const blocks =
    kind === "gym"
      ? [{ kind: "strength", name: "Back Squat", sets: [] } as never]
      : [{ kind: "cardio", name: kind === "sport" ? "Football" : kind, sets: [] } as never];
  return { id, title: kind, startedAt: new Date(NOW - daysAgo * DAY).toISOString(), blocks } as LoggedSession;
}

/** A Thursday five-a-side, played the last four Thursdays — the fixture the
 *  detector was built for, and NOW is a Wednesday, so it lands on tomorrow. */
const THURSDAY_FIXTURE = [0, 1, 2, 3].map((w) => session(6 + w * 7, "sport", `sport-${w}`));

// ═══════════════════════════════════════════════════════════════════════════
describe("sanitizeDeclaredEvents", () => {
  it("keeps a well-formed row and drops everything it cannot trust", () => {
    const out = sanitizeDeclaredEvents([
      { id: "a", date: "2026-09-05", kind: "running", label: "  Half marathon  " },
      { id: "b", date: "2026-9-5", kind: "running" }, // not a day key
      { id: "c", date: "2026-09-05", kind: "curling" }, // not a kind we know
      { id: "", date: "2026-09-05", kind: "running" }, // no id to delete it by
      { date: "2026-09-05", kind: "running" },
      "nonsense",
    ]);
    expect(out).toEqual([{ id: "a", date: "2026-09-05", kind: "running", label: "Half marathon" }]);
  });

  it("trims a long name rather than dropping the event", () => {
    const [e] = sanitizeDeclaredEvents([{ id: "a", date: "2026-09-05", kind: "running", label: "M".repeat(200) }]);
    expect(e!.label).toHaveLength(EVENT_LABEL_MAX);
  });

  it("keeps an unnamed event, as null rather than an empty string", () => {
    const [e] = sanitizeDeclaredEvents([{ id: "a", date: "2026-09-05", kind: "sport", label: "   " }]);
    expect(e!.label).toBeNull();
  });

  it("returns events in date order, and nothing at all for a non-list", () => {
    const out = sanitizeDeclaredEvents([
      { id: "b", date: "2026-09-20", kind: "running" },
      { id: "a", date: "2026-09-05", kind: "running" },
    ]);
    expect(out.map((e) => e.id)).toEqual(["a", "b"]);
    expect(sanitizeDeclaredEvents(null)).toEqual([]);
    expect(sanitizeDeclaredEvents({ id: "a" })).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("the order of the three sources", () => {
  it("gives tomorrow to a declared event over both the plan and the log", () => {
    const e = dayEventTomorrow(
      { declared: [ev(TOMORROW, "running", "Half marathon")], sessions: THURSDAY_FIXTURE },
      NOW,
    );
    expect(e).toEqual({ kind: "running", label: "Half marathon", source: "declared" });
  });

  it("falls to the fixture only when no fact wants the day", () => {
    const e = dayEventTomorrow({ sessions: THURSDAY_FIXTURE }, NOW);
    expect(e?.source).toBe("fixture");
    expect(e?.kind).toBe("sport");
    // ...and it carries the evidence it was drawn from, which is what makes the
    // band hedge rather than assert.
    expect(e?.seen).toMatchObject({ weeks: 4, weekday: new Date(NOW + DAY).getDay() });
  });

  it("rejects the guess and nothing else", () => {
    // "There is no game tomorrow" withdraws the app's inference...
    expect(dayEventTomorrow({ sessions: THURSDAY_FIXTURE, reject: ["sport"] }, NOW)).toBeNull();
    // ...and cannot touch an event the athlete typed in themselves. A declared
    // race is corrected by deleting it, not by dismissing it.
    const e = dayEventTomorrow(
      { declared: [ev(TOMORROW, "sport", "Cup final")], sessions: THURSDAY_FIXTURE, reject: ["sport"] },
      NOW,
    );
    expect(e).toMatchObject({ source: "declared", label: "Cup final" });
  });

  it("says nothing about a day nothing is on", () => {
    expect(dayEventTomorrow({ declared: [ev("2026-12-24", "running")], sessions: [] }, NOW)).toBeNull();
    expect(dayEventToday({}, NOW)).toBeNull();
  });

  it("never offers a fixture about TODAY", () => {
    // A guess about today is what the rotation already answers, in the voice a
    // guess deserves. Rung 2 asserts, so only a fact may reach it.
    const played = [0, 1, 2, 3].map((w) => session(w * 7, "sport", `sport-${w}`));
    expect(dayEventToday({ sessions: played }, NOW)).toBeNull();
    expect(dayEventToday({ declared: [ev(TODAY, "sport", "Cup final")], sessions: played }, NOW))
      .toMatchObject({ source: "declared" });
  });

  it("reads a day by its own key, so today and tomorrow share one rule", () => {
    const src = { declared: [ev(TODAY, "running", "Time trial"), ev(TOMORROW, "sport", "Cup final")] };
    expect(dayFactOn(src, TODAY)).toMatchObject({ label: "Time trial" });
    expect(dayFactOn(src, TOMORROW)).toMatchObject({ label: "Cup final" });
    expect(declaredOn(src.declared, "2026-01-01")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("a plan's competition day", () => {
  /** The 5K program run so its LAST day — the race — lands on `on`. */
  function raceSchedule(planId: string, on: number) {
    const probe = planSchedule({ planId, startedAt: new Date(NOW).toISOString(), sessions: [], now: NOW })!;
    const lastIndex = probe.days.length - 1;
    const started = new Date(on - lastIndex * DAY).toISOString();
    return planSchedule({ planId, startedAt: started, sessions: [], now: NOW })!;
  }

  it("carries the program day's structured kind through the schedule", () => {
    const sched = raceSchedule("run-5k-beginner-9wk", NOW);
    const day = sched.days.at(-1)!;
    expect(day.kind).toBe("competition");
    // The distinction the label alone could never carry: it arrives looking
    // exactly like a rest day, because it prescribes no session.
    expect(day.isRest).toBe(true);
    expect(day.kindLabel).toBe("Race day");
  });

  it("is an event on the day it falls, named by the program's own word for it", () => {
    const sched = raceSchedule("run-5k-beginner-9wk", NOW);
    expect(dayEventToday({ planDays: sched.days, planDiscipline: sched.discipline }, NOW)).toEqual({
      kind: "running",
      label: "Race day",
      // A race is the one day on the calendar that cannot be moved.
      movable: false,
      source: "plan",
    });
  });

  it("protects the day before it, too", () => {
    const sched = raceSchedule("run-5k-beginner-9wk", NOW + DAY);
    expect(dayEventTomorrow({ planDays: sched.days, planDiscipline: sched.discipline }, NOW))
      .toMatchObject({ source: "plan", kind: "running" });
    // ...and today is an ordinary plan day, so the band goes back to prescribing.
    expect(dayEventToday({ planDays: sched.days }, NOW)).toBeNull();
  });

  it("takes its discipline from what the program actually prescribes", () => {
    // Not from a PlanDiscipline → kind table: "endurance" covers running,
    // cycling and swimming alike, and "conditioning" covers a Hyrox race that
    // is neither a gym session nor a run. The days themselves know.
    const run = raceSchedule("run-5k-beginner-9wk", NOW);
    const oly = raceSchedule("oly-soviet-8wk", NOW);
    expect(planRaceKind(run.days, run.discipline)).toBe("running");
    expect(planRaceKind(oly.days, oly.discipline)).toBe("gym");
    // Nothing to read at all, and no plan to ask: `gym` is the app's default.
    expect(planRaceKind([])).toBe("gym");
  });

  it("finds nothing on an ordinary training day", () => {
    const sched = raceSchedule("run-5k-beginner-9wk", NOW + 5 * DAY);
    expect(planRaceOn(sched.days, TODAY)).toBeNull();
    expect(dayEventToday({ planDays: sched.days, planDiscipline: sched.discipline }, NOW)).toBeNull();
  });

  it("yields to something the athlete declared on the same day", () => {
    const sched = raceSchedule("run-5k-beginner-9wk", NOW);
    const e = dayEventToday(
      { planDays: sched.days, planDiscipline: sched.discipline, declared: [ev(TODAY, "sport", "Cup final")] },
      NOW,
    );
    expect(e).toMatchObject({ source: "declared", label: "Cup final" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("a plan's KEY session", () => {
  /** The 5K program, started so that its 1-based weekday `index` falls on
   *  TODAY. Its own progression text names Tue (2) and Thu (4) as the hard
   *  sessions, so `today(1)` stands on the Monday before an interval day. */
  function today(index: number) {
    const started = new Date(NOW - (index - 1) * DAY).toISOString();
    return planSchedule({ planId: "run-5k-beginner-9wk", startedAt: started, sessions: [], now: NOW })!;
  }

  it("marks the days the program says are hard, and only those", () => {
    const week = today(1).days.slice(0, 7);
    expect(week.map((d) => d.kind)).toEqual(["train", "key", "train", "key", "train", "train", "rest"]);
    expect(week[1]!.kindLabel).toBe("Key session");
    // A key day is a TRAINING day — unlike a competition, it prescribes a
    // session, so it must never arrive looking like a rest day.
    expect(week[1]!.isRest).toBe(false);
    expect(week[1]!.blocks.length).toBeGreaterThan(0);
  });

  it("protects the day before it, in the softer voice", () => {
    // Monday is "Rest / cross-train"; Tuesday is the interval session.
    const sched = today(1); // standing on Monday, the key day is tomorrow
    const e = dayEventTomorrow({ planDays: sched.days, planDiscipline: sched.discipline }, NOW);
    expect(e).toMatchObject({ source: "plan", label: "Key session", movable: true });
    // It names itself from its own blocks rather than from the program's modal
    // kind, because unlike a competition it HAS a session.
    expect(e!.kind).toBe("running");
  });

  it("never protects a day that is itself an event", () => {
    // Standing ON Tuesday — itself the key day — the band must not say
    // "nothing on the legs today" over the session it is standing on. This is
    // the other half of "if every day is key, none is".
    const sched = today(2);
    expect(sched.days[1]!.dateKey).toBe(TODAY);
    expect(sched.days[1]!.kind).toBe("key");
    expect(dayEventTomorrow({ planDays: sched.days, planDiscipline: sched.discipline }, NOW)).toBeNull();
  });

  it("is never today's answer — a key session can be moved, and the floor outranks it", () => {
    // Rung 2 exists because a start line cannot be rescheduled. A quality
    // session plainly can, and grinding one on a floored reading is the exact
    // case the floor is there to catch.
    const sched = today(2); // standing on Tuesday, the key day itself
    expect(sched.days[1]!.kind).toBe("key");
    expect(dayEventToday({ planDays: sched.days, planDiscipline: sched.discipline }, NOW)).toBeNull();
  });

  it("still yields the day to a race, which outranks whatever today was", () => {
    const race = today(1);
    // A declared event on the same day beats the plan's key session, as always.
    const e = dayEventTomorrow(
      { planDays: race.days, planDiscipline: race.discipline, declared: [ev(TOMORROW, "sport", "Cup final")] },
      NOW,
    );
    expect(e).toMatchObject({ source: "declared", label: "Cup final" });
    expect(e!.movable).toBeFalsy();
  });

  it("planEventOn narrows to competitions when asked, and finds both when not", () => {
    const sched = today(1);
    const tue = sched.days[1]!.dateKey;
    expect(planEventOn(sched.days, tue)?.kind).toBe("key");
    expect(planEventOn(sched.days, tue, ["competition"])).toBeNull();
    expect(planRaceOn(sched.days, tue)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("planDayKind", () => {
  it("names a plan's endurance day the program's discipline can name", () => {
    // The defect this exists for: a prose run expands to a CONDITIONING block
    // carrying the coach's label, so blocksKind() calls a tempo day gym work.
    const tempo = [{ kind: "conditioning", name: "Tempo" }] as unknown as SessionBlock[];
    expect(blocksKind(tempo as never)).toBe("gym");
    expect(planDayKind(tempo, "endurance")).toBe("running");
    expect(planDayKind(tempo, "hypertrophy")).toBe("gym");
    expect(planDayKind(tempo, "conditioning")).toBe("other");
    // With no plan to ask, it does not invent one.
    expect(planDayKind(tempo, undefined)).toBe("gym");
  });

  it("lets the blocks win whenever they can name themselves", () => {
    const named = [{ kind: "cardio", name: "Easy Run" }] as unknown as SessionBlock[];
    expect(planDayKind(named, "conditioning")).toBe("running");
    // A cardio block the keywords cannot place is still evidence THIS IS CARDIO,
    // so the discipline mapping must not overrule it back to a run.
    const vague = [{ kind: "cardio", name: "Intervals" }] as unknown as SessionBlock[];
    expect(planDayKind(vague, "endurance")).toBe("other");
    // A barbell day inside an endurance plan stays a barbell day — the day is
    // named by what it OPENS with, which is the rule blocksKind itself holds.
    const lift = [{ kind: "strength", name: "Back Squat" }] as unknown as SessionBlock[];
    expect(planDayKind(lift, "endurance")).toBe("gym");
    // ...and the 5K program's own run-then-lift day opens with the run.
    const brick = [
      { kind: "conditioning", name: "Easy" },
      { kind: "strength", name: "Goblet Squat" },
    ] as unknown as SessionBlock[];
    expect(planDayKind(brick, "endurance")).toBe("running");
  });

  it("ignores rest days, which carry no blocks to be named by", () => {
    const days = [
      { isRest: true, blocks: [] },
      { isRest: false, blocks: [{ kind: "cardio", name: "swim" }] },
      { isRest: false, blocks: [{ kind: "cardio", name: "swim" }] },
      { isRest: false, blocks: [{ kind: "strength", name: "Back Squat" }] },
    ] as unknown as ScheduledDay[];
    expect(planRaceKind(days)).toBe("swimming");
  });
});
