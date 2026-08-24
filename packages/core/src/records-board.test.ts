import { describe, it, expect } from "vitest";
import { recordsBoard, RECORD_TREND_MIN } from "./records-board";
import { resolveActivityRange } from "./activity-window";
import type { LoggedSession, StrengthSet } from "./engines/session";

const DAY = 86_400_000;
// A fixed local Wednesday noon so bucketing is deterministic in any TZ.
const now = new Date(2026, 5, 17, 12).getTime();

let id = 0;
const lift = (daysAgo: number, load: string, name = "Back Squat", sets: Partial<StrengthSet>[] = [{}]): LoggedSession => ({
  id: `s${id++}`,
  title: "S",
  startedAt: new Date(now - daysAgo * DAY).toISOString(),
  blocks: [{ kind: "strength", name, sets: sets.map((s) => ({ load, reps: "5", ...s })) }],
});
const run = (daysAgo: number, km: number, minutes: number, name = "Easy Run"): LoggedSession => ({
  id: `r${id++}`,
  title: "R",
  startedAt: new Date(now - daysAgo * DAY).toISOString(),
  blocks: [{ kind: "cardio", name, discipline: "running", distance: km, minutes }],
});
const metcon = (daysAgo: number, name = "Assault Bike"): LoggedSession => ({
  id: `c${id++}`,
  title: "C",
  startedAt: new Date(now - daysAgo * DAY).toISOString(),
  blocks: [{ kind: "conditioning", name, minutes: 20 }],
});

describe("recordsBoard", () => {
  it("renders pins only, in pin order, and drops a pin with no history", () => {
    const sessions = [lift(10, "100"), run(5, 8, 40)];
    const rows = recordsBoard(sessions, ["Easy Run", "Back Squat", "Bench Press"], { now });
    expect(rows.map((r) => r.name)).toEqual(["Easy Run", "Back Squat"]);
  });

  it("strength: the record, the day it was SET, and the latest as a drawdown", () => {
    const sessions = [lift(60, "100"), lift(30, "120"), lift(20, "120"), lift(5, "112.5")];
    const [r] = recordsBoard(sessions, ["Back Squat"], { now });
    expect(r!.best).toBe(120);
    // The record was SET 30 days ago; the equal lift 20 days ago doesn't move it.
    expect(r!.bestAt).toBe(new Date(now - 30 * DAY).toISOString());
    expect(r!.latest).toBe(112.5);
    expect(r!.atBest).toBe(false);
    expect(r!.deltaPct).toBe(-6.2); // (112.5 - 120) / 120 = −6.25, pctChange half-rounds up
    expect(r!.proof).toBeNull();
  });

  it("strength at the record carries the climb it set (strengthPrProof)", () => {
    const sessions = [lift(40, "100"), lift(3, "110")];
    const [r] = recordsBoard(sessions, ["Back Squat"], { now });
    expect(r!.atBest).toBe(true);
    expect(r!.deltaPct).toBe(0);
    expect(r!.proof).toEqual({ kind: "climb", from: "100", delta: "+10" });
  });

  it("a first-ever lift is a record with a 'first' proof, not a climb from nothing", () => {
    const [r] = recordsBoard([lift(2, "80")], ["Back Squat"], { now });
    expect(r!.atBest).toBe(true);
    expect(r!.proof).toEqual({ kind: "first", from: null, delta: null });
  });

  it("cardio: fastest pace is the record; a slower latest reads positive", () => {
    // 5:00/km best, latest 5:30/km → +10%
    const sessions = [run(30, 10, 50), run(4, 10, 55)];
    const [r] = recordsBoard(sessions, ["Easy Run"], { now });
    expect(r!.kind).toBe("cardio");
    expect(r!.discipline).toBe("running");
    expect(r!.best).toBe(300);
    expect(r!.latest).toBe(330);
    expect(r!.atBest).toBe(false);
    expect(r!.deltaPct).toBe(10);
  });

  it("a conditioning pin draws no row — a metcon has no record figure", () => {
    expect(recordsBoard([metcon(3)], ["Assault Bike"], { now })).toEqual([]);
  });
});

/* THE FOLD'S READ. The row's figures say where you are; the fold says which
   way you have been going — over the SCREEN's window, against a record that
   window does not govern. Two scopes, one sentence, each named. */
describe("recordsBoard read", () => {
  const d30 = () => resolveActivityRange("d30", now);

  it("is absent unless a range is passed — the model works off a filtered screen", () => {
    const [r] = recordsBoard([lift(10, "100"), lift(3, "110")], ["Back Squat"], { now });
    expect(r!.read).toBeNull();
  });

  it("climbing: the window's second half beats its first, still under the record", () => {
    const sessions = [
      lift(200, "150"), // the record, long before the window
      lift(25, "100"), lift(20, "105"), lift(12, "115"), lift(4, "120"),
    ];
    const [r] = recordsBoard(sessions, ["Back Squat"], { now, range: d30() });
    expect(r!.read).toMatchObject({ kind: "climbing", trend: "up", sessions: 4 });
    // The gap is unsigned — the sentence supplies the direction in words.
    expect(r!.read!.gapPct).toBe(20);
  });

  it("slipping: the same window run backwards", () => {
    const sessions = [
      lift(200, "150"),
      lift(25, "120"), lift(20, "115"), lift(12, "105"), lift(4, "100"),
    ];
    const [r] = recordsBoard(sessions, ["Back Squat"], { now, range: d30() });
    expect(r!.read).toMatchObject({ kind: "slipping", trend: "down" });
  });

  it("holding: a move under the threshold is the bar rounding, not the athlete", () => {
    // 100 → 101.25 across the window is +1.25%, under RECORD_TREND_PCT.
    const sessions = [
      lift(200, "150"),
      lift(25, "100"), lift(20, "100"), lift(12, "101"), lift(4, "101.5"),
    ];
    const [r] = recordsBoard(sessions, ["Back Squat"], { now, range: d30() });
    expect(r!.read).toMatchObject({ kind: "holding", trend: "flat" });
  });

  it("thin: fewer than three efforts claims no direction at all", () => {
    const sessions = [lift(200, "150"), lift(20, "100"), lift(4, "130")];
    const [r] = recordsBoard(sessions, ["Back Squat"], { now, range: d30() });
    expect(r!.read).toMatchObject({ kind: "thin", trend: null });
    expect(r!.read!.sessions).toBeLessThan(RECORD_TREND_MIN);
  });

  it("none: a quiet window still states the record, never a 0% trend", () => {
    const sessions = [lift(200, "150"), lift(120, "140")];
    const [r] = recordsBoard(sessions, ["Back Squat"], { now, range: d30() });
    expect(r!.read).toMatchObject({ kind: "none", sessions: 0, trend: null });
  });

  it("first: one data point in the whole log is a mark, not a shortfall", () => {
    const [r] = recordsBoard([lift(4, "100")], ["Back Squat"], { now, range: d30() });
    expect(r!.read).toMatchObject({ kind: "first", trend: null });
  });

  it("atBest wins over any direction — standing on the record is the larger fact", () => {
    const sessions = [lift(25, "100"), lift(20, "105"), lift(12, "115"), lift(4, "130")];
    const [r] = recordsBoard(sessions, ["Back Squat"], { now, range: d30() });
    expect(r!.atBest).toBe(true);
    expect(r!.read).toMatchObject({ kind: "atBest", gapPct: 0, trend: null });
  });

  it("pace reads its direction in the metric's own favour — faster is climbing", () => {
    // 6:00 → 5:00 per km across the window: the raw change is NEGATIVE and the
    // trend is up, which is the whole point of the `better: "low"` branch.
    const sessions = [
      run(200, 10, 40), // the record: 4:00/km
      run(25, 10, 60), run(20, 10, 58), run(12, 10, 52), run(4, 10, 50),
    ];
    const [r] = recordsBoard(sessions, ["Easy Run"], { now, range: d30() });
    expect(r!.kind).toBe("cardio");
    expect(r!.read).toMatchObject({ kind: "climbing", trend: "up" });
  });
});
