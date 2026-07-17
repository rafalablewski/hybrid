import { describe, it, expect } from "vitest";
import {
  pctChange,
  exerciseWidgetCard,
  exerciseWidgetCards,
  exercisePageModel,
  weeklySessionCounts,
} from "./exercise-widget";
import type { LoggedSession, StrengthSet } from "./engines/session";

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
const cond = (daysAgo: number, sets: Partial<StrengthSet>[], name = "KB Swing"): LoggedSession => ({
  id: `c${id++}`,
  title: "C",
  startedAt: new Date(now - daysAgo * DAY).toISOString(),
  blocks: [{ kind: "conditioning", name, sets: sets.map((s) => ({ load: "24", reps: "20", ...s })) }],
});

describe("pctChange", () => {
  it("rounds to 1 decimal and nulls a missing baseline", () => {
    expect(pctChange(213, 204)).toBe(4.4);
    expect(pctChange(100, 0)).toBeNull();
    expect(pctChange(NaN, 100)).toBeNull();
  });
});

describe("exerciseWidgetCard", () => {
  it("builds a strength card: best e1RM this 8 weeks vs the previous 8", () => {
    const sessions = [
      lift(70, [{ load: "180", reps: "5" }]), // previous window
      lift(30, [{ load: "185", reps: "5" }]),
      lift(5, [{ load: "195", reps: "5" }]),
    ];
    const c = exerciseWidgetCard(sessions, "Deadlift", now)!;
    expect(c.kind).toBe("strength");
    expect(c.metric).toBe("e1rm");
    expect(c.value).toBe(Math.round(195 * (1 + 5 / 30)));
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

  it("builds a conditioning card on 8-week tonnage", () => {
    const sessions = [cond(80, [{}, {}]), cond(20, [{}, {}, {}]), cond(6, [{}, {}, {}])];
    const c = exerciseWidgetCard(sessions, "KB Swing", now)!;
    expect(c.metric).toBe("volume");
    expect(c.value).toBe(6 * 24 * 20);
    expect(c.improving).toBe(true);
    expect(c.spark).toHaveLength(8);
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
    cond(4, [{}]), // KB Swing ×1
  ];

  it("leads with one favourite per purpose, most-trained first", () => {
    const cards = exerciseWidgetCards(sessions, { now });
    expect(cards.map((c) => c.kind)).toEqual(["strength", "cardio", "conditioning"]);
    expect(cards[0]!.name).toBe("Deadlift"); // beats Bench on 8-week count
    expect(cards[1]!.name).toBe("Run");
    expect(cards[2]!.name).toBe("KB Swing");
  });

  it("honours explicit favourites first, in their order", () => {
    const cards = exerciseWidgetCards(sessions, { now, favourites: ["Run", "Bench Press"] });
    expect(cards.map((c) => c.name).slice(0, 2)).toEqual(["Run", "Bench Press"]);
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
  it("orders strength slides e1RM → tonnage → zones → consistency with heroes", () => {
    const sessions = [
      lift(70, [{ load: "180", reps: "5", rpe: "8" }]),
      lift(30, [{ load: "185", reps: "5" }]),
      lift(5, [{ load: "195", reps: "5", rpe: "9" }]),
    ];
    const m = exercisePageModel(sessions, "Deadlift", "all", { now });
    expect(m.kind).toBe("strength");
    expect(m.slides.map((s) => s.kind)).toEqual(["e1rmTrend", "tonnage", "zones", "consistency"]);
    const e1 = m.slides[0]!;
    if (e1.kind !== "e1rmTrend") throw new Error("wrong slide");
    expect(e1.bestE1rm).toBe(Math.round(195 * (1 + 5 / 30)));
    expect(e1.improving).toBe(true);
    const cons = m.slides.at(-1)!;
    if (cons.kind !== "consistency") throw new Error("wrong slide");
    expect(cons.weeksTotal).toBe(26);
    expect(cons.weeksTrained).toBe(3);
  });

  it("orders cardio slides pace → curve → deltas → consistency", () => {
    const sessions = [run(70, 5, 30), run(20, 5, 28), run(6, 5, 26)];
    const m = exercisePageModel(sessions, "Run", "8w", { now });
    expect(m.kind).toBe("cardio");
    expect(m.slides.map((s) => s.kind)).toEqual(["paceTrend", "paceCurve", "runDeltas", "consistency"]);
    const pace = m.slides[0]!;
    if (pace.kind !== "paceTrend") throw new Error("wrong slide");
    expect(pace.bestSec).toBe(312);
    expect(pace.improving).toBe(true);
    const rd = m.slides[2]!;
    if (rd.kind !== "runDeltas") throw new Error("wrong slide");
    expect(rd.runs).toHaveLength(3);
    expect(rd.lastDeltaSec).toBeLessThan(0); // last run faster than its average
  });

  it("gives conditioning tonnage + load-mix slides (no e1RM/zones)", () => {
    const sessions = [cond(20, [{}, {}]), cond(6, [{ load: "32" }, {}, {}])];
    const m = exercisePageModel(sessions, "KB Swing", "8w", { now });
    expect(m.slides.map((s) => s.kind)).toEqual(["tonnage", "loadMix", "consistency"]);
    const mix = m.slides[1]!;
    if (mix.kind !== "loadMix") throw new Error("wrong slide");
    expect(mix.topLoadKg).toBe(24); // 4 of 5 sets at the 24 kg bell
    expect(mix.loads[0]!.share).toBe(0.8);
  });
});
