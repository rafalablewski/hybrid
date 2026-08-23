import { describe, it, expect } from "vitest";
import {
  pctChange,
  exerciseWidgetCard,
  exerciseWidgetCards,
  movementsTrained,
  exercisePageModel,
  weeklySessionCounts,
  exerciseCardFigure,
  exerciseSlideGeometry,
  exerciseSlideReading,
} from "./exercise-widget";
import type { LoggedSession, StrengthSet } from "./engines/session";
import { formatDisciplinePace } from "./endurance";

const DAY = 86_400_000;
// A fixed local Wednesday noon so week bucketing is deterministic in any TZ.
const now = new Date(2026, 5, 17, 12).getTime();

let id = 0;
const lift = (daysAgo: number, sets: Partial<StrengthSet>[], name = "Deadlift"): LoggedSession => ({
  id: `s${id++}`,
  title: "S",
  startedAt: new Date(now - daysAgo * DAY).toISOString(),
  blocks: [{ kind: "strength", name, sets: sets.map((s) => ({ load: "100", reps: "5", ...s })) }],
});
const run = (daysAgo: number, km: number, minutes: number, name = "Run"): LoggedSession => ({
  id: `r${id++}`,
  title: "R",
  startedAt: new Date(now - daysAgo * DAY).toISOString(),
  blocks: [{ kind: "cardio", name, distance: km, minutes }],
});
const cond = (daysAgo: number, minutes: number, name = "Assault Bike"): LoggedSession => ({
  id: `c${id++}`,
  title: "C",
  startedAt: new Date(now - daysAgo * DAY).toISOString(),
  blocks: [{ kind: "conditioning", name, minutes }],
});

describe("pctChange", () => {
  it("rounds to 1 decimal and nulls a missing baseline", () => {
    expect(pctChange(213, 204)).toBe(4.4);
    expect(pctChange(100, 0)).toBeNull();
    expect(pctChange(NaN, 100)).toBeNull();
  });
});

describe("exerciseWidgetCard", () => {
  it("builds a strength card: heaviest lift this 8 weeks vs the previous 8", () => {
    const sessions = [
      lift(70, [{ load: "180", reps: "5" }]), // previous window
      lift(30, [{ load: "185", reps: "5" }]),
      lift(5, [{ load: "195", reps: "5" }]),
    ];
    const c = exerciseWidgetCard(sessions, "Deadlift", now)!;
    expect(c.kind).toBe("strength");
    expect(c.metric).toBe("weight");
    expect(c.value).toBe(195); // actual heaviest load, not e1RM
    expect(c.improving).toBe(true);
    expect(c.deltaPct).toBeGreaterThan(0);
    expect(c.spark).toHaveLength(2);
    expect(c.sessions).toBe(2);
  });

  it("builds a cardio card where getting FASTER is improving", () => {
    const sessions = [
      run(70, 5, 30), // 360 s/km — previous window
      run(20, 5, 28),
      run(6, 5, 26), // 312 s/km best now
    ];
    const c = exerciseWidgetCard(sessions, "Run", now)!;
    expect(c.metric).toBe("pace");
    expect(c.value).toBe(312);
    expect(c.deltaPct).toBeLessThan(0); // pace dropped…
    expect(c.improving).toBe(true); // …which is an improvement
  });

  it("builds a conditioning card on 8-week minutes (no per-set loads exist)", () => {
    const sessions = [cond(80, 12), cond(20, 15), cond(6, 18)];
    const c = exerciseWidgetCard(sessions, "Assault Bike", now)!;
    expect(c.metric).toBe("time");
    expect(c.value).toBe(33); // this window's total minutes
    expect(c.improving).toBe(true); // 33 vs 12 the 8 weeks before
    expect(c.spark).toHaveLength(8);
  });

  it("derives conditioning minutes from the interval format when unlogged", () => {
    const sessions: LoggedSession[] = [{
      id: "i1", title: "I", startedAt: new Date(now - 5 * DAY).toISOString(),
      blocks: [{ kind: "conditioning", name: "EMOM", rounds: 10, work: 40, rest: 20 }],
    }];
    expect(exerciseWidgetCard(sessions, "EMOM", now)!.value).toBe(10); // 10×60 s
  });

  it("returns null for a movement never logged", () => {
    expect(exerciseWidgetCard([lift(5, [{}])], "Bench Press", now)).toBeNull();
  });
});

describe("exerciseWidgetCards", () => {
  const sessions = [
    lift(10, [{}]), lift(5, [{}]), // Deadlift ×2
    lift(8, [{}], "Bench Press"), // Bench ×1
    run(6, 5, 26), run(3, 5, 27), run(1, 8, 44), // Run ×3
    cond(4, 15), // Assault Bike ×1
  ];

  it("leads with one favourite per purpose, most-trained first", () => {
    const cards = exerciseWidgetCards(sessions, { now });
    expect(cards.map((c) => c.kind)).toEqual(["strength", "cardio", "conditioning"]);
    expect(cards[0]!.name).toBe("Deadlift"); // beats Bench on 8-week count
    expect(cards[1]!.name).toBe("Run");
    expect(cards[2]!.name).toBe("Assault Bike");
  });

  it("honours explicit favourites first, in their order", () => {
    const cards = exerciseWidgetCards(sessions, { now, favourites: ["Run", "Bench Press"] });
    expect(cards.map((c) => c.name).slice(0, 2)).toEqual(["Run", "Bench Press"]);
    expect(cards).toHaveLength(3);
  });

  it("never truncates the pins below the number pinned", () => {
    const cards = exerciseWidgetCards(sessions, { now, favourites: ["Run", "Bench Press", "Assault Bike", "Deadlift"] });
    expect(cards.map((c) => c.name)).toEqual(["Run", "Bench Press", "Assault Bike", "Deadlift"]);
  });

  it("drops a pin with no logged history — there is no card to draw", () => {
    const cards = exerciseWidgetCards(sessions, { now, favourites: ["Never Done This"] });
    expect(cards.map((c) => c.name)).not.toContain("Never Done This");
    expect(cards).toHaveLength(3);
  });

  it("is empty with no history", () => {
    expect(exerciseWidgetCards([], { now })).toEqual([]);
  });
});

describe("weeklySessionCounts", () => {
  it("buckets sessions per week, oldest first", () => {
    const counts = weeklySessionCounts([lift(1, [{}]), lift(3, [{}]), lift(10, [{}])], "Deadlift", 4, now);
    expect(counts).toHaveLength(4);
    expect(counts[3]).toBe(2); // this week
    expect(counts[2]).toBe(1); // last week
  });
});

describe("exercisePageModel", () => {
  it("orders strength slides heaviest → tonnage → zones → deep-dive → consistency with heroes", () => {
    const sessions = [
      lift(70, [{ load: "180", reps: "5", rpe: "8" }]),
      lift(30, [{ load: "185", reps: "5" }]),
      lift(5, [{ load: "195", reps: "5", rpe: "9" }]),
    ];
    const m = exercisePageModel(sessions, "Deadlift", "all", { now });
    expect(m.kind).toBe("strength");
    // loadReps needs ≥5 working sets, so it's absent with only 3
    expect(m.slides.map((s) => s.kind)).toEqual(["weightTrend", "tonnage", "zones", "repMax", "surface", "compare", "consistency"]);
    const e1 = m.slides[0]!;
    if (e1.kind !== "weightTrend") throw new Error("wrong slide");
    expect(e1.bestWeight).toBe(195); // actual heaviest load, not e1RM
    expect(e1.improving).toBe(true);
    const rm = m.slides[3]!;
    if (rm.kind !== "repMax") throw new Error("wrong slide");
    expect(rm.heaviestKg).toBe(195);
    expect(rm.cells[4]?.loadKg).toBe(195); // best-ever 5RM
    const cmp = m.slides[5]!;
    if (cmp.kind !== "compare") throw new Error("wrong slide");
    expect(cmp.compare.kind).toBe("strength");
    expect(cmp.improving).toBe(true); // two sessions this block vs one before
    const cons = m.slides.at(-1)!;
    if (cons.kind !== "consistency") throw new Error("wrong slide");
    expect(cons.weeksTotal).toBe(26);
    expect(cons.weeksTrained).toBe(3);
    expect(cons.detail.activeDays).toBe(3);
  });

  it("orders cardio slides pace → curve → deltas → compare → consistency", () => {
    const sessions = [run(70, 5, 30), run(20, 5, 28), run(6, 5, 26)];
    const m = exercisePageModel(sessions, "Run", "8w", { now });
    expect(m.kind).toBe("cardio");
    expect(m.slides.map((s) => s.kind)).toEqual(["paceTrend", "paceCurve", "runDeltas", "compare", "consistency"]);
    const pace = m.slides[0]!;
    if (pace.kind !== "paceTrend") throw new Error("wrong slide");
    expect(pace.bestSec).toBe(312);
    expect(pace.improving).toBe(true);
    const rd = m.slides[2]!;
    if (rd.kind !== "runDeltas") throw new Error("wrong slide");
    expect(rd.runs).toHaveLength(3);
    expect(rd.lastDeltaSec).toBeLessThan(0); // last run faster than its average
  });

  it("gives conditioning duration-led slides (no per-set loads in the model)", () => {
    const sessions = [cond(60, 12), cond(20, 15), cond(6, 18)];
    const m = exercisePageModel(sessions, "Assault Bike", "8w", { now });
    expect(m.slides.map((s) => s.kind)).toEqual(["weeklyMinutes", "consistency"]);
    const wm = m.slides[0]!;
    if (wm.kind !== "weeklyMinutes") throw new Error("wrong slide");
    expect(wm.weeks.reduce((a, w) => a + w.minutes, 0)).toBe(45);
    expect(wm.improving).toBe(true); // 33 min recent half vs 12 before
  });

  it("falls back to minutes for minutes-only cardio (no distance → no pace)", () => {
    const sessions: LoggedSession[] = [{
      id: "t1", title: "T", startedAt: new Date(now - 4 * DAY).toISOString(),
      blocks: [{ kind: "cardio", name: "Tennis", minutes: 60 }],
    }];
    const m = exercisePageModel(sessions, "Tennis", "8w", { now });
    expect(m.slides.map((s) => s.kind)).toEqual(["weeklyMinutes", "consistency"]);
  });
});

describe("exerciseWidgetCard — discipline (A2: one rate, one unit)", () => {
  const swim = (daysAgo: number, km: number, minutes: number): LoggedSession => ({
    id: `w${id++}`,
    title: "W",
    startedAt: new Date(now - daysAgo * DAY).toISOString(),
    blocks: [{ kind: "cardio", name: "Swimming", discipline: "swimming", distance: km, minutes }],
  });

  it("carries the stamped discipline on a cardio card", () => {
    const card = exerciseWidgetCard([swim(3, 0.5, 19), swim(10, 0.4, 16)], "Swimming", now);
    expect(card?.metric).toBe("pace");
    expect(card?.discipline).toBe("swimming");
  });

  it("falls back to the name when no tag was stamped", () => {
    const card = exerciseWidgetCard([run(3, 5, 25), run(10, 5, 26)], "Run", now);
    expect(card?.discipline).toBe("running");
  });

  it("leaves a strength card without one", () => {
    const card = exerciseWidgetCard([lift(3, [{ load: "100" }])], "Deadlift", now);
    expect(card?.discipline).toBeUndefined();
  });

  it("the value stays canonical sec/km — only the DISPLAY unit is the discipline's", () => {
    // 0.5 km in 19 min = 2280 s/km, which formatDisciplinePace renders as
    // 3:48 /100m. The old hard-coded "/km" printed 38:00 /km for the same swim.
    const card = exerciseWidgetCard([swim(3, 0.5, 19), swim(10, 0.5, 20)], "Swimming", now);
    expect(card?.value).toBe(2280);
    expect(formatDisciplinePace(card!.value, card!.discipline!)).toBe("3:48 /100m");
  });
});

describe("movementsTrained — the Exercises head's coverage denominator (M1)", () => {
  it("counts distinct movements inside the rail's OWN window, not all time", () => {
    const sessions = [
      lift(3, [{ load: "100" }], "Deadlift"),
      lift(10, [{ load: "60" }], "Bench"),
      run(20, 5, 25, "Run"),
      cond(30, 12, "Assault Bike"),
      // Outside the 56-day window: trained, but not by this rail's measure.
      lift(80, [{ load: "80" }], "Front Squat"),
    ];
    expect(movementsTrained(sessions, now)).toBe(4);
  });

  it("counts a movement once however often it was trained", () => {
    expect(movementsTrained([lift(1, [{}]), lift(8, [{}]), lift(15, [{}])], now)).toBe(1);
  });

  it("is zero with nothing in the window, so the head reads 0 of 0 rather than lying", () => {
    expect(movementsTrained([lift(90, [{}])], now)).toBe(0);
  });
});

describe("the card's figure and its baseline", () => {
  it("dates a widget card's strip by what its points ARE — sessions here", () => {
    const sessions = [
      lift(70, [{ load: "180", reps: "5" }]),
      lift(30, [{ load: "185", reps: "5" }]),
      lift(5, [{ load: "195", reps: "5" }]),
    ];
    const c = exerciseWidgetCard(sessions, "Deadlift", now)!;
    expect(c.sparkBy).toBe("session");
    expect(c.sparkAt).toHaveLength(c.spark.length);
    expect(c.sparkAt[1]).toBe(sessions[2]!.startedAt);
  });

  it("dates a WEEKLY strip by its bucket, and says so", () => {
    const c = exerciseWidgetCard([cond(3, 40), cond(10, 25)], "Assault Bike", now)!;
    expect(c.metric).toBe("time");
    expect(c.sparkBy).toBe("week");
    expect(c.sparkAt).toHaveLength(c.spark.length);
  });

  it("formats the headline and its baseline through the SAME unit", () => {
    // The whole point of one formatter: the card prints these two beside each
    // other, so a card that ever showed them in different units would be worse
    // than one printing no baseline at all.
    const c = exerciseWidgetCard([cond(3, 40), cond(10, 25)], "Assault Bike", now)!;
    const head = exerciseCardFigure(c, c.value, "kg");
    const base = exerciseCardFigure(c, c.prevValue ?? 0, "kg");
    expect(head.unit).toBe("min");
    expect(base.unit).toBe(head.unit);
  });

  it("reads a pace at the clock", () => {
    const c = exerciseWidgetCard([run(20, 5, 25), run(6, 5, 24)], "Run", now)!;
    expect(c.metric).toBe("pace");
    expect(exerciseCardFigure(c, 300, "kg").value).toBe("5:00");
    expect(exerciseCardFigure(c, 288, "kg").value).toBe("4:48");
  });

  it("prints a rate in its OWN discipline's unit, never a hard-coded /km", () => {
    // The defect this replaced: the held readout showed a swimmer "38:36 /km"
    // while the lane below printed the same rate as "3:52 /100m". Survivable
    // under a held finger; not survivable now the baseline is always on screen.
    const swim = { metric: "pace", discipline: "swimming" } as const;
    const road = { metric: "pace", discipline: "running" } as const;
    const none = { metric: "pace" } as const;
    expect(exerciseCardFigure(swim, 2316, "kg").unit).toBe("/100m");
    expect(exerciseCardFigure(road, 288, "kg").unit).toBe("/km");
    // No resolved discipline keeps the /km fallback — which is what the
    // canonical value already is, not a guess.
    expect(exerciseCardFigure(none, 288, "kg")).toEqual({ value: "4:48", unit: "/km" });
  });

  it("SPEAKS TO A NEW ATHLETE — a baseline inside the window when there is no window before it", () => {
    // THE BUG THIS PINS, and it shipped: the baseline was the previous 8-week
    // window and nothing else, so a three-week-old account climbing 60 → 65 →
    // 70 kg printed "Heaviest — 8 weeks" and no change at all. The card it
    // replaced, minus a chart. Sixteen weeks of history is not a precondition
    // for having something to say.
    const c = exerciseWidgetCard(
      [
        lift(20, [{ load: "60", reps: "5" }]),
        lift(13, [{ load: "65", reps: "5" }]),
        lift(6, [{ load: "70", reps: "5" }]),
      ],
      "Deadlift",
      now,
    )!;
    expect(c.value).toBe(70);
    expect(c.prevValue).toBe(60);       // the window's own opening point
    expect(c.deltaPct).toBe(16.7);      // ...and the change measured from IT
    expect(c.prevAt).toBeTruthy();      // dated, because it is a real session
  });

  it("prefers the previous WINDOW over the spark, and dates only the spark", () => {
    // The previous window is the better comparison and stays first. It is a
    // PERIOD, not a day, so it carries no date — the card must not name a
    // Tuesday it did not measure.
    const c = exerciseWidgetCard(
      [lift(70, [{ load: "100", reps: "5" }]), lift(5, [{ load: "110", reps: "5" }])],
      "Deadlift",
      now,
    )!;
    expect(c.prevValue).toBe(100);
    expect(c.prevAt).toBeNull();
  });

  it("still says nothing when there is genuinely nothing to compare", () => {
    const c = exerciseWidgetCard([lift(5, [{ load: "110", reps: "5" }])], "Deadlift", now)!;
    expect(c.prevValue).toBeNull();
    expect(c.deltaPct).toBeNull();
    expect(c.prevAt).toBeNull();
  });

  it("THE INVARIANT — a delta and its baseline are null together", () => {
    // The card prints both. If one could exist without the other it would
    // either show a percentage nobody can check, or a baseline measuring
    // nothing. Every branch of the builder is exercised here.
    const cards = [
      exerciseWidgetCard([lift(5, [{ load: "180", reps: "5" }])], "Deadlift", now), // strength, no prior window
      exerciseWidgetCard(
        [lift(70, [{ load: "170", reps: "5" }]), lift(5, [{ load: "195", reps: "5" }])],
        "Deadlift", now,
      ), // strength, with one
      exerciseWidgetCard([cond(3, 40)], "Assault Bike", now),                        // time, no prior window
      exerciseWidgetCard([cond(3, 40), cond(70, 25)], "Assault Bike", now),           // time, with one
      exerciseWidgetCard([run(6, 5, 24)], "Run", now),                                // pace, no prior window
      exerciseWidgetCard([run(70, 5, 25), run(6, 5, 24)], "Run", now),                // pace, with one
    ].filter(Boolean);
    expect(cards.length).toBe(6);
    for (const c of cards) {
      expect(
        (c!.deltaPct == null) === (c!.prevValue == null),
        `${c!.name}/${c!.metric}: deltaPct=${c!.deltaPct} prevValue=${c!.prevValue}`,
      ).toBe(true);
    }
  });

  it("the printed percentage is the printed baseline's own — checkable by hand", () => {
    const c = exerciseWidgetCard(
      [lift(70, [{ load: "100", reps: "5" }]), lift(5, [{ load: "110", reps: "5" }])],
      "Deadlift", now,
    )!;
    expect(c.prevValue).toBe(100);
    expect(c.value).toBe(110);
    // 100 → 110 is +10%, and that is exactly what the card prints beside it.
    expect(c.deltaPct).toBe(10);
  });

  it("offers geometry only for the slides that ARE a series", () => {
    const sessions = [
      lift(40, [{ load: "180", reps: "5" }]),
      lift(20, [{ load: "190", reps: "5" }]),
      lift(4, [{ load: "200", reps: "5" }]),
    ];
    const m = exercisePageModel(sessions, "Deadlift", "8w", { now });
    const kinds = Object.fromEntries(m.slides.map((s) => [s.kind, exerciseSlideGeometry(s)]));
    expect(kinds.weightTrend).toEqual({ count: 3, mode: "point", by: "session" });
    expect(kinds.tonnage?.by).toBe("week");
    expect(kinds.tonnage?.mode).toBe("band");
    // A scatter, a surface, a rep-max grid and the consistency map name their
    // own cells — there is no series under the finger to report.
    expect(kinds.loadReps ?? null).toBeNull();
    expect(kinds.consistency ?? null).toBeNull();
    expect(kinds.zones ?? null).toBeNull();
  });

  it("reads a weight-trend point in the athlete's unit and keeps the PR flag", () => {
    const sessions = [
      lift(40, [{ load: "180", reps: "5" }]),
      lift(20, [{ load: "190", reps: "5" }]),
      lift(4, [{ load: "200", reps: "5" }]),
    ];
    const m = exercisePageModel(sessions, "Deadlift", "8w", { now });
    const slide = m.slides.find((s) => s.kind === "weightTrend")!;
    const held = exerciseSlideReading(slide, 2, "kg")!;
    expect(held.value).toBe("200");
    expect(held.unit).toBe("kg");
    expect(held.best).toBe(true);
    expect(exerciseSlideReading(slide, 0, "kg")!.best).toBe(false);
    expect(exerciseSlideReading(slide, 9, "kg")).toBeNull();
  });

  it("signs a run-delta readout — an unsigned one is the one thing that chart never says", () => {
    const runs = [run(24, 5, 26, "Run"), run(17, 5, 25, "Run"), run(3, 5, 23, "Run")];
    const m = exercisePageModel(runs, "Run", "8w", { now });
    const slide = m.slides.find((s) => s.kind === "runDeltas");
    if (!slide || slide.kind !== "runDeltas") return; // no deltas without enough runs
    const held = exerciseSlideReading(slide, slide.runs.length - 1, "kg")!;
    expect(held.unit).toBe("s/km");
    expect(held.value.startsWith("+") || held.value.startsWith("−") || held.value === "0").toBe(true);
  });
});
