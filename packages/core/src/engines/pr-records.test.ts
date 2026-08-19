import { describe, it, expect } from "vitest";
import { prRecordsInSession, type PrRecord } from "./records";
import { prRecordsBetween } from "./recap";
import type { LoggedSession } from "./session";

/**
 * RECORDS AS A PATH — the axis split, the pair each record moved between, and
 * the delta that never estimates. See the RECORDS AS A PATH note in records.ts.
 */

type Set_ = { load: string; reps: string };
const bench = (...sets: Set_[]): LoggedSession["blocks"][number] => ({
  kind: "strength",
  name: "Barbell Bench Press",
  sets,
});
const squat = (...sets: Set_[]): LoggedSession["blocks"][number] => ({
  kind: "strength",
  name: "Barbell Squat",
  sets,
});

const day = (n: number, blocks: LoggedSession["blocks"]): LoggedSession =>
  ({ id: `s${n}`, title: "T", startedAt: `2026-06-${String(n).padStart(2, "0")}T10:00:00.000Z`, blocks }) as unknown as LoggedSession;

const byAxis = (rows: PrRecord[], axis: "load" | "strength") => rows.find((r) => r.axis === axis);

describe("prRecordsInSession — the pair a record moved between", () => {
  it("a rep record holds the load still and moves the reps", () => {
    const prior = day(1, [bench({ load: "70", reps: "9" })]);
    const rows = prRecordsInSession(day(8, [bench({ load: "70", reps: "10" })]), [prior]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({
      axis: "strength",
      now: { load: 70, reps: 10 },
      prev: { load: 70, reps: 9 },
      delta: { kind: "reps", reps: 1 },
    });
  });

  it("a load record moves the bar, and the delta names the weight", () => {
    const prior = day(1, [bench({ load: "65", reps: "8" })]);
    const rows = prRecordsInSession(day(8, [bench({ load: "70", reps: "10" })]), [prior]);
    // heaviest AND best-estimated landed on the same set, so it is ONE record
    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({
      axis: "load",
      now: { load: 70, reps: 10 },
      prev: { load: 65, reps: 8 },
      delta: { kind: "load", kg: 5 },
    });
  });

  it("70 × 10 and 80 × 1 in one session are TWO records, each from one set", () => {
    // The fused PrHit reports topLoad 80 (the single) with e1rm 93 (the ten) —
    // one record assembled from two sets. Split, each row is whole.
    const prior = day(1, [bench({ load: "75", reps: "1" }, { load: "70", reps: "9" })]);
    const rows = prRecordsInSession(
      day(8, [bench({ load: "70", reps: "10" }, { load: "80", reps: "1" })]),
      [prior],
    );
    expect(rows).toHaveLength(2);
    expect(byAxis(rows, "load")).toMatchObject({
      now: { load: 80, reps: 1 },
      prev: { load: 75, reps: 1 },
      delta: { kind: "load", kg: 5 },
    });
    expect(byAxis(rows, "strength")).toMatchObject({
      now: { load: 70, reps: 10 },
      prev: { load: 70, reps: 9 },
      delta: { kind: "reps", reps: 1 },
    });
  });

  it("one set that is both heaviest and best files ONE row, on the load axis", () => {
    const prior = day(1, [squat({ load: "100", reps: "3" })]);
    const rows = prRecordsInSession(day(8, [squat({ load: "105", reps: "3" })]), [prior]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.axis).toBe("load");
  });

  it("a first-ever lift is one row with no origin", () => {
    const rows = prRecordsInSession(day(8, [bench({ load: "80", reps: "4" })]), []);
    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({ prev: null, delta: { kind: "first" }, gainPct: null, now: { load: 80, reps: 4 } });
  });

  it("names the load whenever the bar got heavier, even on the strength axis", () => {
    // The bar can go UP on a strength record while the reps go DOWN: the best
    // set was 80 × 9 (e1RM 104) under a 100 × 1 top load, and today's 85 × 8
    // (e1RM 108) beats the estimate without touching the 100. Naming the reps
    // there would print a negative on a record.
    const prior = day(1, [bench({ load: "100", reps: "1" }, { load: "80", reps: "9" })]);
    const rows = prRecordsInSession(day(8, [bench({ load: "85", reps: "8" })]), [prior]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({
      axis: "strength",
      now: { load: 85, reps: 8 },
      prev: { load: 80, reps: 9 },
      delta: { kind: "load", kg: 5 },
    });
  });

  it("does not fire when neither coordinate improves", () => {
    const prior = day(1, [bench({ load: "100", reps: "5" })]);
    expect(prRecordsInSession(day(8, [bench({ load: "90", reps: "5" })]), [prior])).toEqual([]);
  });

  it("carries the session it was set in, so a row can open it", () => {
    const rows = prRecordsInSession(day(8, [bench({ load: "80", reps: "4" })]), []);
    expect(rows[0]!.sessionId).toBe("s8");
    expect(rows[0]!.at).toBe(Date.parse("2026-06-08T10:00:00.000Z"));
  });

  it("the top load's reps break ties on the better set", () => {
    // 100 × 3 and 100 × 5 are the same top load; the five is the record's set.
    const prior = day(1, [squat({ load: "95", reps: "3" })]);
    const rows = prRecordsInSession(day(8, [squat({ load: "100", reps: "3" }, { load: "100", reps: "5" })]), [prior]);
    expect(rows[0]!.now).toEqual({ load: 100, reps: 5 });
  });
});

describe("ranking — the block sorts by the number it prints", () => {
  it("biggest percent on its own axis takes the quote", () => {
    // squat +5 kg on 100 = +5%; bench +2 reps on 8 = +25%
    const prior = day(1, [squat({ load: "100", reps: "3" }), bench({ load: "70", reps: "8" })]);
    const rows = prRecordsInSession(day(8, [squat({ load: "105", reps: "3" }), bench({ load: "70", reps: "10" })]), [prior]);
    expect(rows.map((r) => r.lift)).toEqual(["Barbell Bench Press", "Barbell Squat"]);
  });

  it("a first-ever lift ranks last — it beat nothing", () => {
    const prior = day(1, [squat({ load: "100", reps: "3" })]);
    const rows = prRecordsInSession(day(8, [squat({ load: "105", reps: "3" }), bench({ load: "200", reps: "1" })]), [prior]);
    expect(rows.map((r) => r.lift)).toEqual(["Barbell Squat", "Barbell Bench Press"]);
  });
});

describe("prRecordsBetween — the window", () => {
  const MS = (n: number) => Date.parse(`2026-06-${String(n).padStart(2, "0")}T10:00:00.000Z`);

  it("keeps a plate on Tuesday and a rep on Friday as two records", () => {
    const a = day(1, [bench({ load: "70", reps: "8" })]);
    const b = day(9, [bench({ load: "75", reps: "5" })]); // load record
    const c = day(12, [bench({ load: "70", reps: "10" })]); // strength record
    const rows = prRecordsBetween([a, b, c], MS(8), MS(20));
    expect(rows.map((r) => r.axis).sort()).toEqual(["load", "strength"]);
  });

  it("excludes records set outside the window", () => {
    const a = day(1, [bench({ load: "70", reps: "8" })]);
    const b = day(9, [bench({ load: "75", reps: "5" })]);
    expect(prRecordsBetween([a, b], MS(20), MS(28))).toEqual([]);
  });

  it("compares against ALL prior history, not just the window", () => {
    const old = day(1, [bench({ load: "100", reps: "5" })]);
    const now = day(20, [bench({ load: "80", reps: "5" })]);
    expect(prRecordsBetween([old, now], MS(19), MS(28))).toEqual([]);
  });
});
