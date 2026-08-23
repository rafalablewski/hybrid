import { describe, it, expect } from "vitest";
import { recordsBoard } from "./records-board";
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
