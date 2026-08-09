import { describe, expect, it } from "vitest";
import {
  copyDayPlan,
  copySources,
  entriesOnDay,
  retimeToDay,
  type CopyableEntry,
} from "./copy-day";
import { localDayKey } from "./day-key";

/** A local ISO string for a given local wall-clock moment — the tests describe
 *  the athlete's calendar, so they must not be written in UTC. */
const at = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0).toISOString();

const entry = (over: Partial<CopyableEntry> & Pick<CopyableEntry, "id" | "name" | "source" | "ts">): CopyableEntry => ({
  kcal: 100, protein: 10, carbs: 10, fat: 2, qty: 1,
  satFat: null, sugar: null, fiber: null, salt: null,
  ...over,
});

// Monday 9 Mar 2026: three meals.
const MON = "2026-03-09";
const TUE = "2026-03-10";
const monday = (): CopyableEntry[] => [
  entry({ id: "a", name: "Oats", source: "breakfast", ts: at(2026, 3, 9, 8, 14), kcal: 350, qty: 1, fiber: 8 }),
  entry({ id: "b", name: "Chicken salad", source: "lunch", ts: at(2026, 3, 9, 13, 2), kcal: 480, qty: 1 }),
  entry({ id: "c", name: "Whey", source: "snack", ts: at(2026, 3, 9, 16, 40), kcal: 120, qty: 2, verifiedId: "v1" }),
];

describe("entriesOnDay", () => {
  it("picks one local day, oldest first", () => {
    const logs = [...monday(), entry({ id: "z", name: "Late", source: "dinner", ts: at(2026, 3, 10, 20, 0) })];
    const got = entriesOnDay(logs, MON);
    expect(got.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps a 23:30 entry on its own evening rather than rolling to UTC tomorrow", () => {
    const late = entry({ id: "n", name: "Snack", source: "snack", ts: at(2026, 3, 9, 23, 30) });
    expect(entriesOnDay([late], MON).map((e) => e.id)).toEqual(["n"]);
  });

  it("returns nothing for an empty day", () => {
    expect(entriesOnDay(monday(), "2026-03-08")).toEqual([]);
  });
});

describe("retimeToDay", () => {
  it("moves the date and keeps the local clock", () => {
    const moved = retimeToDay(at(2026, 3, 9, 8, 14), TUE);
    const d = new Date(moved);
    expect(localDayKey(moved)).toBe(TUE);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(14);
  });

  it("survives a DST boundary without shifting the hour", () => {
    // 29 Mar 2026 is the EU spring-forward. Whatever the runner's zone, the
    // LOCAL clock time must be preserved across the move.
    const moved = retimeToDay(at(2026, 3, 28, 8, 30), "2026-03-30");
    expect(new Date(moved).getHours()).toBe(8);
    expect(new Date(moved).getMinutes()).toBe(30);
  });

  it("leaves a malformed target alone rather than inventing a date", () => {
    const ts = at(2026, 3, 9, 8, 14);
    expect(retimeToDay(ts, "not-a-day")).toBe(ts);
  });
});

describe("copyDayPlan", () => {
  it("copies every entry, preserving name, quantity and part", () => {
    const plan = copyDayPlan(monday(), { from: MON, to: TUE });
    expect(plan.entries).toHaveLength(3);
    expect(plan.entries.map((e) => e.name)).toEqual(["Oats", "Chicken salad", "Whey"]);
    expect(plan.entries.map((e) => e.source)).toEqual(["breakfast", "lunch", "snack"]);
    expect(plan.entries[2]!.qty).toBe(2);
  });

  it("lands every entry on the target day at its own time of day", () => {
    const plan = copyDayPlan(monday(), { from: MON, to: TUE });
    for (const e of plan.entries) expect(localDayKey(e.ts)).toBe(TUE);
    expect(new Date(plan.entries[0]!.ts).getHours()).toBe(8);
    expect(new Date(plan.entries[1]!.ts).getHours()).toBe(13);
  });

  it("totals the energy it will add, scaled by quantity", () => {
    // 350 + 480 + 120×2 = 1 070
    expect(copyDayPlan(monday(), { from: MON, to: TUE }).kcal).toBe(1_070);
  });

  it("reports what the target already holds, because copying appends", () => {
    const logs = [...monday(), entry({ id: "t", name: "Toast", source: "breakfast", ts: at(2026, 3, 10, 7, 0) })];
    const plan = copyDayPlan(logs, { from: MON, to: TUE });
    expect(plan.targetEntries).toBe(1);
    // The existing entry is untouched — the plan only ever describes additions.
    expect(plan.entries.map((e) => e.name)).not.toContain("Toast");
  });

  it("copies just the parts asked for", () => {
    const plan = copyDayPlan(monday(), { from: MON, to: TUE, parts: ["breakfast"] });
    expect(plan.entries.map((e) => e.name)).toEqual(["Oats"]);
  });

  it("can re-file a part onto a different one", () => {
    const plan = copyDayPlan(monday(), { from: MON, to: TUE, parts: ["lunch"], toPart: "dinner" });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]!.source).toBe("dinner");
  });

  it("refuses to duplicate a day onto itself", () => {
    const plan = copyDayPlan(monday(), { from: MON, to: MON });
    expect(plan.entries).toEqual([]);
  });

  it("but allows moving a part within the same day", () => {
    const plan = copyDayPlan(monday(), { from: MON, to: MON, parts: ["snack"], toPart: "dinner" });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]!.source).toBe("dinner");
  });

  it("keeps an unstated panel field unstated — a copy learns nothing", () => {
    const plan = copyDayPlan(monday(), { from: MON, to: TUE });
    expect(plan.entries[0]!.fiber).toBe(8); // stated → carried
    expect(plan.entries[0]!.sugar).toBeNull(); // unstated → still unstated
    expect(plan.entries[1]!.fiber).toBeNull();
  });

  it("carries provenance forward", () => {
    const plan = copyDayPlan(monday(), { from: MON, to: TUE });
    expect(plan.entries[2]!.verifiedId).toBe("v1");
    expect(plan.entries[0]!.verifiedId).toBeNull();
  });

  it("plans nothing from an empty source day", () => {
    const plan = copyDayPlan(monday(), { from: "2026-03-01", to: TUE });
    expect(plan.entries).toEqual([]);
    expect(plan.kcal).toBe(0);
  });
});

describe("copySources", () => {
  const now = new Date(2026, 2, 10, 12, 0, 0).getTime(); // Tue 10 Mar, midday

  it("offers days that have food, newest first, excluding the target", () => {
    const logs = [
      ...monday(),
      entry({ id: "t", name: "Toast", source: "breakfast", ts: at(2026, 3, 10, 7, 0) }),
      entry({ id: "s", name: "Old", source: "dinner", ts: at(2026, 3, 7, 19, 0) }),
    ];
    const got = copySources(logs, { to: TUE, now });
    expect(got.map((s) => s.date)).toEqual([MON, "2026-03-07"]);
  });

  it("counts the day and names the parts it holds", () => {
    const got = copySources(monday(), { to: TUE, now });
    expect(got[0]!.entries).toBe(3);
    expect(got[0]!.kcal).toBe(1_070);
    expect(got[0]!.parts).toEqual(["breakfast", "lunch", "snack"]);
    expect(got[0]!.daysAgo).toBe(1);
  });

  it("skips empty days entirely rather than listing them as options", () => {
    const got = copySources(monday(), { to: TUE, now });
    expect(got.map((s) => s.date)).not.toContain("2026-03-08");
  });

  it("honours the lookback window", () => {
    const old = [entry({ id: "o", name: "Ancient", source: "lunch", ts: at(2026, 1, 2, 12, 0) })];
    expect(copySources(old, { to: TUE, now })).toEqual([]);
  });
});
