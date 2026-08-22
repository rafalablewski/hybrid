import { describe, it, expect } from "vitest";
import { makeT } from "./i18n";
import {
  BAND_HEAD_MAX, BAND_SAY_MAX, CADENCE_SPREAD_MAX, REST_STREAK_DAYS, ROTATION_STALE_DAYS,
  FIXTURE_LOOKBACK_WEEKS, FIXTURE_MIN_WEEKS, FIXTURE_STALE_DAYS,
  TRAINING_KINDS, bandSay, bandText, blocksKind, dayBand, doneToday, fixtureTomorrow, nextDueKind, rotation,
  sessionKind, trainingStreak, weeklyFixture,
  type DayBand, type DayBandInput, type TrainingKind,
} from "./day-band";
import { EVENT_LABEL_MAX } from "./day-events";
import type { LoggedSession } from "./engines/session";
import type { ReadinessDeficit } from "./engines/readiness-deficit";
import type { Prescription } from "./engines/types";

/**
 * THE BAND'S GUARD. Three things are being held here and they are not the same
 * kind of claim:
 *
 *  1. The LADDER resolves in a fixed order, and the two rungs that tell an
 *     athlete not to train refuse a fill. That is the rule most likely to be
 *     "fixed" by someone who thinks a quiet band looks unfinished.
 *  2. The ROTATION abstains rather than guesses. Every floor has a test that
 *     puts a log just under it and asserts nothing is claimed.
 *  3. Every string the engine can emit resolves in EN/PL/DE and fits its
 *     budget in all three — the budget being set by German, not English.
 */

const DAY = 86_400_000;
// A fixed local noon, so the whole suite is independent of when it runs.
const NOW = new Date(2026, 7, 19, 12, 0, 0).getTime();

function session(daysAgo: number, kind: TrainingKind, id = `${kind}-${daysAgo}`): LoggedSession {
  const blocks =
    kind === "gym"
      ? [{ kind: "strength", name: "Back Squat", sets: [] } as never]
      : [{ kind: "cardio", name: kind === "sport" ? "Football" : kind, sets: [] } as never];
  return {
    id,
    title: kind,
    startedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    blocks,
  } as LoggedSession;
}

/** A log with `kind` trained every `every` days, `n` times, ending `last` days ago. */
function habit(kind: TrainingKind, every: number, n: number, last = 0): LoggedSession[] {
  return Array.from({ length: n }, (_, i) => session(last + i * every, kind, `${kind}-${i}`));
}

function deficit(kept: number, costs: { kind: string; points: number }[] = [], clamped: "floor" | "ceiling" | null = null): ReadinessDeficit {
  return {
    kept,
    deficit: 100 - kept,
    costs: costs.map((c) => ({ ...c, key: "", muscle: null, role: "caution" })) as never,
    bioAdj: 0,
    heatAdj: 0,
    fuelAdj: 0,
    clamped,
  } as ReadinessDeficit;
}

const TISSUE = [{ kind: "tissue", points: 22 }, { kind: "conditioning", points: 14 }];
const ENGINE = [{ kind: "conditioning", points: 24 }, { kind: "tissue", points: 12 }];

const band = (input: Partial<DayBandInput> & { deficit: ReadinessDeficit }): DayBand =>
  dayBand({ now: NOW, ...input });

// ═══════════════════════════════════════════════════════════════════════════
describe("sessionKind", () => {
  it("names a session by its cardio block, and everything else is gym", () => {
    expect(sessionKind(session(0, "swimming"))).toBe("swimming");
    expect(sessionKind(session(0, "gym"))).toBe("gym");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("rotation — the confidence floor", () => {
  it("abstains on an empty log", () => {
    const r = rotation([], NOW);
    expect(r.reason).toBe("no-log");
    expect(r.due).toEqual([]);
  });

  it("abstains when the whole log is thin, however regular it looks", () => {
    // Five sessions, perfectly spaced — and still under the floor. A rhythm
    // read off five points is a coincidence.
    const r = rotation(habit("running", 2, 5), NOW);
    expect(r.reason).toBe("thin-log");
    expect(r.confident).toBe(false);
    expect(r.due).toEqual([]);
  });

  it("abstains after a break, even with a rich history behind it", () => {
    // THE CASE THAT MATTERS: an athlete back off a fortnight away must not be
    // told a swim is "due" because their pre-holiday self swam on Tuesdays.
    const r = rotation(habit("swimming", 2, 8, ROTATION_STALE_DAYS + 1), NOW);
    expect(r.reason).toBe("stale-log");
    expect(r.due).toEqual([]);
  });

  it("abstains when nothing has a steady cadence", () => {
    const chaotic = [0, 1, 9, 10, 22, 23, 24].map((d, i) => session(d, "other", `o${i}`));
    const r = rotation(chaotic, NOW);
    expect(r.confident).toBe(false);
    expect(r.reason).toBe("no-stable-cadence");
    expect(r.due).toEqual([]);
  });

  it("reads a steady habit and calls it due only once it is into its own cycle", () => {
    // Swims every 2 days, last one 2 days ago → ratio 1.0, due.
    const due = rotation(habit("swimming", 2, 8, 2).concat(habit("gym", 3, 6, 1)), NOW);
    expect(due.confident).toBe(true);
    expect(due.due.map((k) => k.kind)).toContain("swimming");
    // Same habit, trained today → ratio 0, not due.
    const fresh = rotation(habit("swimming", 2, 8, 0).concat(habit("gym", 3, 6, 1)), NOW);
    expect(fresh.due.map((k) => k.kind)).not.toContain("swimming");
  });

  it("never offers more than two, and orders them most overdue first", () => {
    const log = [
      ...habit("swimming", 2, 6, 4),
      ...habit("cycling", 3, 5, 6),
      ...habit("running", 2, 6, 2),
    ];
    const r = rotation(log, NOW);
    expect(r.due.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < r.kinds.length; i++) expect(r.kinds[i - 1]!.ratio).toBeGreaterThanOrEqual(r.kinds[i]!.ratio);
  });

  it("keeps the spread ceiling meaningful — a steady habit passes it", () => {
    const r = rotation(habit("running", 2, 8, 2), NOW);
    const run = r.kinds.find((k) => k.kind === "running")!;
    expect(run.spread).toBeLessThanOrEqual(CADENCE_SPREAD_MAX);
    expect(run.confident).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("trainingStreak", () => {
  it("counts back from today, or from yesterday when today is still empty", () => {
    expect(trainingStreak([session(0, "gym"), session(1, "running"), session(2, "gym", "g2")], NOW)).toBe(3);
    // Nothing today yet — the streak behind it still stands rather than being
    // broken by a day that has not happened.
    expect(trainingStreak([session(1, "running"), session(2, "gym")], NOW)).toBe(2);
    expect(trainingStreak([session(3, "gym")], NOW)).toBe(0);
  });

  it("counts a double day once", () => {
    expect(trainingStreak([session(0, "gym", "a"), session(0, "running", "b"), session(1, "gym", "c")], NOW)).toBe(2);
  });
});

describe("blocksKind", () => {
  it("resolves a plan day's blocks by the same rule a logged session takes", () => {
    expect(blocksKind([{ kind: "cardio", name: "Easy Run" }])).toBe("running");
    expect(blocksKind([{ kind: "strength", name: "Back Squat" }])).toBe("gym");
    expect(blocksKind([])).toBe("gym");
  });
});

describe("weekly fixtures", () => {
  it("finds a sport that lands on the same weekday most weeks", () => {
    // Six days ago is the same weekday as tomorrow.
    const log = Array.from({ length: 5 }, (_, i) => session(6 + i * 7, "sport", `s${i}`));
    const f = weeklyFixture(log, NOW);
    expect(f[0]!.kind).toBe("sport");
    expect(f[0]!.weeks).toBeGreaterThanOrEqual(3);
    expect(fixtureTomorrow(log, NOW)).toMatchObject({ kind: "sport", source: "fixture" });
  });

  it("does not protect a day for a gym habit", () => {
    // Missing a routine lift costs nothing, and a band that said "nothing on
    // the legs today" before every ordinary session would be unusable.
    const log = Array.from({ length: 5 }, (_, i) => session(6 + i * 7, "gym", `g${i}`));
    expect(fixtureTomorrow(log, NOW)).toBeNull();
  });

  it("stops protecting a fixture that stopped being played", () => {
    // Three Thursdays inside the six-week window, the most recent one a month
    // ago. The COUNT still clears the floor — which is exactly why the count
    // alone was never enough to keep planning a day around it.
    const tomorrowDow = new Date(NOW + DAY).getDay();
    // Days back from NOW to the most recent occurrence of tomorrow's weekday.
    const firstMatch = (new Date(NOW).getDay() - tomorrowDow + 7) % 7 || 7;
    const stale = [0, 1, 2].map((i) => session(firstMatch + 21 + i * 7, "sport", `old${i}`));
    expect(weeklyFixture(stale, NOW)[0]!.weekday).toBe(tomorrowDow);
    expect(weeklyFixture(stale, NOW)[0]!.weeks).toBeGreaterThanOrEqual(FIXTURE_MIN_WEEKS);
    expect(weeklyFixture(stale, NOW)[0]!.daysSince).toBeGreaterThan(FIXTURE_STALE_DAYS);
    expect(fixtureTomorrow(stale, NOW)).toBeNull();

    // Missing ONE week is allowed — a fixture is weekly, so a single skip is
    // an ordinary week, not the end of the habit.
    const live = [0, 1, 2].map((i) => session(firstMatch + 7 + i * 7, "sport", `live${i}`));
    expect(fixtureTomorrow(live, NOW)).not.toBeNull();
  });

  it("drops a fixture the athlete has said is not happening", () => {
    const log = Array.from({ length: 5 }, (_, i) => session(6 + i * 7, "sport", `s${i}`));
    expect(fixtureTomorrow(log, NOW)).not.toBeNull();
    // The "not today?" tap. Before this the rejection went to the ROTATION and
    // the fixture read consulted nothing, so the band redrew word for word.
    expect(fixtureTomorrow(log, NOW, ["sport"])).toBeNull();
    // And it is per-kind: saying no to a game does not dismiss a swim fixture.
    expect(fixtureTomorrow(log, NOW, ["swimming"])).not.toBeNull();
  });

  it("ignores a sport played at random", () => {
    const log = [0, 3, 9, 17].map((d, i) => session(d, "sport", `s${i}`));
    expect(weeklyFixture(log, NOW).length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("the ladder", () => {
  it("draws nothing without a reading", () => {
    const b = band({ deficit: deficit(0) });
    expect(b.rung).toBe("none");
    expect(b.head).toBeNull();
    expect(b.fill).toBeNull();
  });

  it("puts the floor above anything the calendar says", () => {
    const b = band({
      deficit: deficit(35, TISSUE, "floor"),
      plan: { isRest: false, trainings: [{ kind: "gym", label: "Squat day" }] },
      tomorrow: { kind: "sport", source: "fixture" },
    });
    expect(b.rung).toBe("deload");
    expect(b.fill).toBe("danger");
  });

  it("puts a race today above the floor, and keeps the reading in the sentence", () => {
    // The floor outranks the rest of the calendar because a heavy squat can be
    // moved. A start line cannot, so the race outranks the floor — and the
    // floored reading is not thrown away, it changes the SENTENCE.
    const b = band({
      deficit: deficit(35, TISSUE, "floor"),
      today: { kind: "running", label: "Half marathon", source: "declared" },
    });
    expect(b.rung).toBe("race");
    expect(b.source).toBe("declared");
    expect(b.head).toEqual({ key: "w.home.band.race", values: { event: "Half marathon" } });
    expect(b.say[0]!.key).toBe("w.home.band.sayRaceFloor");
    // A race is a call to ACT, so it keeps the reading's fill — the quiet rungs
    // are only the ones that say don't train.
    expect(b.fill).not.toBeNull();
    expect(b.mark).toBe("running");
  });

  it("names an unlabelled race by its own kind, and states the ordinary sentence", () => {
    const b = band({ deficit: deficit(72), today: { kind: "sport", source: "plan" } });
    expect(b.rung).toBe("race");
    expect(b.source).toBe("plan");
    expect(b.head).toEqual({ key: "w.home.band.raceKind", parts: { noun: "w.home.band.noun.sport" } });
    expect(b.say[0]!.key).toBe("w.home.band.sayRace");
  });

  it("refuses to assert a race off a guess", () => {
    // Rung 2 is the flattest declarative in the app. A fixture reaching it
    // would announce a race off three Thursdays — the exact defect the protect
    // rung was rebuilt to stop — so the ladder drops straight past it.
    const b = band({ deficit: deficit(64), today: { kind: "sport", source: "fixture", seen: { weeks: 3, of: 6, weekday: 4 } } });
    expect(b.rung).not.toBe("race");
  });

  it("stops calling it race day once the race is in the log", () => {
    // The rung is an INSTRUCTION, and once the day is trained there is nothing
    // left to instruct — the band has a report to make instead.
    const b = band({
      deficit: deficit(64),
      today: { kind: "running", label: "Half marathon", source: "declared" },
      done: { count: 1, unrated: 1, feel: null, kind: "running" },
    });
    expect(b.rung).toBe("done");
  });

  it("protects tomorrow, and refuses a fill while doing it", () => {
    // The case the naive colour rule breaks on: a great reading is not
    // permission, and a chartreuse field over "don't train" says two opposite
    // things at once.
    const b = band({ deficit: deficit(81), tomorrow: { kind: "sport", label: "Five-a-side", source: "declared" } });
    expect(b.rung).toBe("protect");
    expect(b.fill).toBeNull();
    expect(b.mark).toBe("sport");
  });

  it("stops prescribing a day that has already been trained", () => {
    // The defect: "Nothing on the legs today. A walk if you want one." over a
    // card reading 10.2 t, 20 sets, 94 min and a trap-bar deadlift, because
    // nothing ever handed the ladder today's own sessions.
    const t = makeT("en");
    const trained = [session(0, "gym", "today")];
    const b = band({ deficit: deficit(55), sessions: trained, tomorrow: { kind: "sport", source: "fixture", seen: { weeks: 3, of: 6, weekday: 4 } } });
    expect(b.rung).toBe("done");
    expect(b.source).toBe("logged");
    expect(b.ask).toBe("rate");
    expect(b.mark).toBe("gym");
    expect(bandText(t, b.head!)).toBe("How did that feel?");

    // A FACT about tomorrow still outranks a report about today.
    const race = band({ deficit: deficit(55), sessions: trained, tomorrow: { kind: "running", label: "Half marathon", source: "declared" } });
    expect(race.rung).toBe("protect");
  });

  it("states the answer back once it has one, and stops asking", () => {
    const t = makeT("en");
    const rated = [{ ...session(0, "running", "today"), feel: 4 } as LoggedSession];
    const b = band({ deficit: deficit(55), sessions: rated });
    expect(b.rung).toBe("done");
    expect(b.ask).toBeNull();
    expect(b.fill).toBeNull(); // a report is not a call to act
    expect(bandText(t, b.head!)).toBe("Today's in.");
    expect(bandSay(t, b)).toBe("Hard — and that's what today's load is built from.");
  });

  it("reads today off the log — count, the latest kind, and what is unanswered", () => {
    const d = doneToday([
      { ...session(0, "gym", "am"), feel: 3 } as LoggedSession,
      session(0, "running", "pm"),
      session(1, "swimming", "yesterday"),
    ], NOW);
    // session() stamps NOW - daysAgo, so "am" and "pm" share an instant; the
    // count and the unanswered half are what this is really holding.
    expect(d.count).toBe(2);
    expect(d.unrated).toBe(1);
    expect(d.feel).toBe(3);
    expect(doneToday([session(1, "gym")], NOW).count).toBe(0);
  });

  it("hedges an INFERRED fixture and asserts a declared one", () => {
    // The defect this rung shipped with: three Thursdays in six weeks read back
    // as "You have a game tomorrow." to an athlete who had no game. A guess now
    // says it is a guess, shows the count behind it, and reports itself as
    // inferred so the correction appears under it.
    const t = makeT("en");
    const guess = band({
      deficit: deficit(55),
      tomorrow: { kind: "sport", source: "fixture", seen: { weeks: 3, of: 6, weekday: 4 } },
    });
    expect(guess.rung).toBe("protect");
    expect(guess.voice).toBe("suggests");
    expect(guess.source).toBe("inferred");
    expect(bandText(t, guess.head!)).toBe("Usually a game tomorrow.");
    expect(bandSay(t, guess)).toContain("3 of the last 6 Thursdays");

    // A race the athlete told us about is a fact, and it keeps the flat voice —
    // and reports `plan`, so nothing offers to correct what nobody guessed.
    const declared = band({ deficit: deficit(55), tomorrow: { kind: "running", label: "Half marathon", source: "declared" } });
    expect(declared.voice).toBe("protects");
    // It used to borrow the plan's source, which cost nothing while nothing
    // branched on it. A declared event is its own kind of fact.
    expect(declared.source).toBe("declared");
    expect(bandText(t, declared.head!)).toBe("Half marathon tomorrow.");

    // A plan's own day keeps it too.
    const planned = band({ deficit: deficit(55), tomorrow: { kind: "sport", source: "plan" } });
    expect(planned.voice).toBe("protects");
    expect(bandText(t, planned.head!)).toBe("You have a game tomorrow.");
  });

  it("hedges a fixture that arrives without its evidence", () => {
    const t = makeT("en");
    const b = band({ deficit: deficit(55), tomorrow: { kind: "sport", source: "fixture" } });
    expect(b.voice).toBe("suggests");
    expect(bandText(t, b.head!)).toBe("Usually a game tomorrow.");
    expect(bandSay(t, b)).not.toMatch(/\d/);
  });

  it("carries the evidence out of the fixture read", () => {
    // Six days ago is the same weekday as tomorrow.
    const log = Array.from({ length: 5 }, (_, i) => session(6 + i * 7, "sport", `s${i}`));
    const ev = fixtureTomorrow(log, NOW)!;
    expect(ev.source).toBe("fixture");
    expect(ev.seen!.of).toBe(FIXTURE_LOOKBACK_WEEKS);
    expect(ev.seen!.weeks).toBeGreaterThanOrEqual(3);
    expect(ev.seen!.weekday).toBe(new Date(NOW + DAY).getDay());
  });

  it("reports a declared tomorrow as declared, not as the plan's", () => {
    // The surface gates "Not today?" on `source === "inferred"`, so a declared
    // event borrowing the plan's source was invisible either way — until
    // something else branches on it. It is a different kind of fact from a
    // plan day and it says so.
    const b = band({
      deficit: deficit(81),
      tomorrow: { kind: "running", label: "Half marathon", source: "declared" },
    });
    expect(b.rung).toBe("protect");
    expect(b.source).toBe("declared");
    expect(b.voice).toBe("protects");
    expect(b.fill).toBeNull();
  });

  it("states rest without a fill, from a plan or from a streak", () => {
    const planned = band({ deficit: deficit(58), plan: { isRest: true, dayNumber: 12, trainings: [] } });
    expect(planned.rung).toBe("rest");
    expect(planned.fill).toBeNull();

    const streak = band({ deficit: deficit(58), streakDays: REST_STREAK_DAYS });
    expect(streak.rung).toBe("rest");
    expect(streak.fill).toBeNull();
  });

  it("falls to the prescription when the log cannot support an inference", () => {
    // Thin log → the last rung. The band claims no session, which is the whole
    // point of the floor: nothing is asserted that does not exist. The log ends
    // YESTERDAY, so the done rung is not in play — this is about the bottom of
    // the ladder, not the top.
    const b = band({ deficit: deficit(64, TISSUE), sessions: habit("running", 2, 4, 1) });
    expect(b.rung).toBe("open");
    expect(b.kinds).toEqual([]);
    expect(b.source).toBe("prescription");
  });
});

describe("the order rule", () => {
  const twoTrainings = (costs: { kind: string; points: number }[]) =>
    band({
      deficit: deficit(64, costs),
      muscle: "quads",
      plan: {
        isRest: false,
        trainings: [{ kind: "running", label: "10 km easy" }, { kind: "gym", label: "Squat day" }],
      },
    });

  it("puts the sport first when a tissue is the limiter — the bar gives up load", () => {
    const b = twoTrainings(TISSUE);
    expect(b.rung).toBe("order");
    expect(b.kinds).toEqual(["running", "gym"]);
    expect(b.head!.parts!.lead).toBe("w.home.band.lead.running");
  });

  it("puts the bar first when the engine is the limiter — the sport stays aerobic", () => {
    const b = twoTrainings(ENGINE);
    expect(b.kinds).toEqual(["gym", "running"]);
    expect(b.head!.parts!.lead).toBe("w.home.band.lead.gym");
  });

  it("leads with the most overdue when both trainings are sports", () => {
    // No bar to ease, so the rule cannot be "which one shed load" — it is
    // which one has waited longer, and the second is the one held back.
    const log = [...habit("swimming", 2, 7, 4), ...habit("cycling", 2, 7, 2)];
    const b = band({ deficit: deficit(64, TISSUE), muscle: "quads", sessions: log });
    expect(b.rung).toBe("order");
    expect(b.kinds[0]).toBe("swimming");
    expect(b.say[0]!.key).toBe("w.home.band.sayOrderPairTissue");
  });
});

describe("voice", () => {
  it("asserts a scheduled day and suggests an inferred one", () => {
    const planned = band({
      deficit: deficit(64, TISSUE),
      plan: { isRest: false, trainings: [{ kind: "running", label: "10 km easy" }] },
    });
    expect(planned.voice).toBe("asserts");
    expect(planned.source).toBe("plan");
    expect(planned.head!.values!.label).toBe("10 km easy");

    const inferred = band({ deficit: deficit(64, TISSUE), sessions: habit("running", 2, 8, 2) });
    expect(inferred.voice).toBe("suggests");
    expect(inferred.source).toBe("inferred");
    // An inferred day names the KIND, never a distance nobody prescribed.
    expect(inferred.head!.key).toBe("w.home.band.singleDue");
  });

  it("only the check-in may claim a load percentage", () => {
    const rx = { primary: { move: "Back Squat" }, pickSys: "aerobic", readinessAdjust: { feeling: "flat", loadPct: 94, setAdj: 0 } } as unknown as Prescription;
    const b = band({ deficit: deficit(64, TISSUE), muscle: "quads", rx, sessions: habit("gym", 2, 8, 2) });
    const dose = b.say.find((l) => l.key.startsWith("w.home.band.sayDose"));
    expect(dose).toBeTruthy();
    expect(dose!.values!.pct).toBe(94);
    // and nothing else in the band mentions a percentage
    expect(b.say.filter((l) => JSON.stringify(l).includes("pct")).length).toBe(1);
  });
});

describe("nextDueKind — the one-tap correction", () => {
  it("offers the next confident kind and then gives up", () => {
    const rot = rotation([...habit("swimming", 2, 7, 4), ...habit("cycling", 2, 7, 2)], NOW);
    const first = nextDueKind(rot, []);
    expect(first).toBeTruthy();
    const second = nextDueKind(rot, [first!]);
    expect(second).not.toBe(first);
    expect(nextDueKind(rot, rot.kinds.map((k) => k.kind))).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Copy: it has to exist, in three languages, and it has to fit.
// ═══════════════════════════════════════════════════════════════════════════

/** A name of exactly the length the store will keep — "x" repeated is enough,
 *  because what is being measured is characters in a template, not words. */
const LONGEST_LABEL = "M".repeat(EVENT_LABEL_MAX);

/** Every band the ladder can produce, across the states that change its copy. */
function everyBand(): DayBand[] {
  const rx = { primary: { move: "Back Squat" }, pickSys: "threshold", readinessAdjust: { feeling: "flat", loadPct: 94, setAdj: 0 } } as unknown as Prescription;
  const rxNoAdj = { primary: { move: "Back Squat" }, pickSys: "aerobic" } as unknown as Prescription;
  const out: DayBand[] = [];
  const costSets = [TISSUE, ENGINE, [{ kind: "fuel", points: 20 }], [{ kind: "wearable", points: 18 }], []];

  for (const costs of costSets) {
    for (const kept of [35, 52, 64, 81, 96]) {
      for (const rxx of [rx, rxNoAdj, null]) {
        out.push(band({ deficit: deficit(kept, costs), muscle: "shoulders", rx: rxx }));
        out.push(band({ deficit: deficit(kept, costs, "floor"), muscle: "quads", rx: rxx }));
        out.push(band({ deficit: deficit(kept, costs), muscle: "quads", rx: rxx, tomorrow: { kind: "sport", source: "fixture" } }));
        // The same rung WITH its evidence — the line an athlete actually sees,
        // and the only place the weekday strings are reachable from.
        for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
          out.push(band({
            deficit: deficit(kept, costs), muscle: "quads", rx: rxx,
            tomorrow: { kind: "sport", source: "fixture", seen: { weeks: 3, of: 6, weekday } },
          }));
        }
        out.push(band({ deficit: deficit(kept, costs), rx: rxx, tomorrow: { kind: "running", label: "Half marathon", source: "declared" } }));
        // A LABEL AT ITS FULL LENGTH, through every head that takes one. The
        // budget for a name is BAND_HEAD_MAX minus the longest wrapper any
        // locale puts around it (see EVENT_LABEL_MAX) — arithmetic that is
        // worth nothing unless something puts the answer through the templates.
        out.push(band({ deficit: deficit(kept, costs), rx: rxx, tomorrow: { kind: "running", label: LONGEST_LABEL, source: "declared" } }));
        out.push(band({ deficit: deficit(kept, costs), rx: rxx, today: { kind: "running", label: LONGEST_LABEL, source: "declared" } }));
        out.push(band({ deficit: deficit(kept, costs, "floor"), rx: rxx, today: { kind: "running", label: "Half marathon", source: "declared" } }));
        // ...and the unlabelled head, which speaks nine disciplines.
        for (const k of TRAINING_KINDS) {
          out.push(band({ deficit: deficit(kept, costs), rx: rxx, today: { kind: k, source: "plan" } }));
        }
        out.push(band({ deficit: deficit(kept, costs), rx: rxx, plan: { isRest: true, dayNumber: 12, trainings: [] } }));
        out.push(band({ deficit: deficit(kept, costs), rx: rxx, streakDays: REST_STREAK_DAYS }));
        // THE DONE RUNG, both halves — the ask and every answer it can state.
        out.push(band({ deficit: deficit(kept, costs), rx: rxx, done: { count: 1, unrated: 1, feel: null, kind: "gym" } }));
        for (const feel of [1, 2, 3, 4, 5]) {
          out.push(band({ deficit: deficit(kept, costs), rx: rxx, done: { count: 2, unrated: 0, feel, kind: "running" } }));
        }
        for (const k of TRAINING_KINDS) {
          out.push(band({ deficit: deficit(kept, costs), muscle: "quads", rx: rxx, sessions: habit(k, 2, 8, 2) }));
          out.push(band({
            deficit: deficit(kept, costs), muscle: "quads", rx: rxx,
            plan: { isRest: false, trainings: [{ kind: k, label: "Session" }, { kind: "gym", label: "Squat day" }] },
          }));
          out.push(band({
            deficit: deficit(kept, costs), muscle: "quads", rx: rxx,
            sessions: [...habit(k, 2, 7, 4), ...habit(k === "cycling" ? "running" : "cycling", 2, 7, 2)],
          }));
        }
      }
    }
  }
  return out;
}

describe("band copy", () => {
  const LANGS = ["en", "pl", "de"] as const;
  const bands = everyBand();

  it("covers every rung the ladder can reach", () => {
    const rungs = new Set(bands.map((b) => b.rung));
    for (const r of ["race", "deload", "done", "protect", "rest", "order", "single", "open"]) expect(rungs).toContain(r);
  });

  it("resolves every key it can emit, in EN/PL/DE", () => {
    for (const lang of LANGS) {
      const t = makeT(lang);
      for (const b of bands) {
        for (const line of [b.head, ...b.say].filter(Boolean)) {
          expect(t(line!.key), `${lang}: ${line!.key}`).not.toBe(line!.key);
          for (const key of Object.values(line!.parts ?? {})) {
            expect(t(key), `${lang}: ${key}`).not.toBe(key);
          }
        }
      }
    }
  });

  it("leaves no slot unfilled in any language", () => {
    for (const lang of LANGS) {
      const t = makeT(lang);
      for (const b of bands) {
        if (b.head) expect(bandText(t, b.head), `${lang}: ${b.head.key}`).not.toMatch(/[{}]/);
        expect(bandSay(t, b), `${lang}: ${b.rung}`).not.toMatch(/[{}]/);
      }
    }
  });

  it("fits the budget in every language — and the budget is set by German", () => {
    for (const lang of LANGS) {
      const t = makeT(lang);
      for (const b of bands) {
        if (b.head) {
          const head = bandText(t, b.head);
          expect(head.length, `${lang} head over budget: "${head}"`).toBeLessThanOrEqual(BAND_HEAD_MAX);
        }
        const say = bandSay(t, b);
        expect(say.length, `${lang} say over budget: "${say}"`).toBeLessThanOrEqual(BAND_SAY_MAX);
      }
    }
  });

  it("never repeats the instruction's own noun in the sentence under it", () => {
    // The defect the redesign exists to kill: a headline, then the same thing
    // restated smaller. A shared word is fine; the whole head is not.
    const t = makeT("en");
    for (const b of bands) {
      if (!b.head) continue;
      const head = bandText(t, b.head).replace(/[.!]/g, "").toLowerCase();
      const say = bandSay(t, b).toLowerCase();
      if (head.length > 8) expect(say.includes(head), `"${head}" restated in "${say}"`).toBe(false);
    }
  });
});
