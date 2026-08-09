import { describe, it, expect } from "vitest";
import { HOUR_LOG_CAP, clockDistance, recordLog, usualAtHour, type HourLogged } from "./hour-recents";

/** A local timestamp, built the way the clients see the clock. */
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 7, day, hour, minute, 0, 0).getTime();

const food = (name: string, logs: number[]): HourLogged & { name: string } => ({ name, logs });

describe("recordLog", () => {
  it("appends", () => {
    expect(recordLog([1, 2], 3)).toEqual([1, 2, 3]);
  });

  it("starts a list when there is none", () => {
    expect(recordLog(undefined, 7)).toEqual([7]);
    expect(recordLog(null, 7)).toEqual([7]);
  });

  it("caps from the FRONT — a habit is what you have been doing lately", () => {
    const full = Array.from({ length: HOUR_LOG_CAP }, (_, i) => i);
    const next = recordLog(full, 999);
    expect(next).toHaveLength(HOUR_LOG_CAP);
    expect(next[next.length - 1]).toBe(999);
    expect(next[0]).toBe(1); // the oldest fell off, not the newest
  });

  it("drops corrupt stamps rather than ranking on NaN", () => {
    expect(recordLog([NaN, 5], 6)).toEqual([5, 6]);
  });
});

describe("clockDistance — the window is circular", () => {
  it("measures the short way round midnight", () => {
    expect(clockDistance(23 * 60 + 45, 15)).toBe(30);
    expect(clockDistance(15, 23 * 60 + 45)).toBe(30);
  });

  it("is zero at the same time and 720 at the opposite one", () => {
    expect(clockDistance(600, 600)).toBe(0);
    expect(clockDistance(0, 720)).toBe(720);
  });
});

describe("usualAtHour", () => {
  const evening = at(20, 21, 12);

  it("surfaces what was eaten around this hour on several days", () => {
    const twarog = food("Twaróg", [at(17, 21, 5), at(18, 21, 30), at(19, 20, 50)]);
    const banan = food("Banan", [at(17, 8, 0), at(18, 8, 15), at(19, 8, 5)]);
    const out = usualAtHour([twarog, banan], evening);
    expect(out.map((h) => h.item.name)).toEqual(["Twaróg"]);
    expect(out[0]!.days).toBe(3);
  });

  it("says nothing when there is nothing to say — a cold start is not a habit", () => {
    expect(usualAtHour([food("Banan", [])], evening)).toEqual([]);
    expect(usualAtHour([{ name: "Kefir" } as HourLogged & { name: string }], evening)).toEqual([]);
  });

  it("needs more than one day: once is a coincidence", () => {
    const once = food("Kabanos", [at(19, 21, 0)]);
    expect(usualAtHour([once], evening)).toEqual([]);
    const twice = food("Kabanos", [at(18, 21, 0), at(19, 21, 0)]);
    expect(usualAtHour([twice], evening)).toHaveLength(1);
  });

  it("does not count one evening's second helping as two days", () => {
    const sameNight = food("Kefir", [at(19, 21, 0), at(19, 21, 40)]);
    expect(usualAtHour([sameNight], evening)).toEqual([]);
    expect(usualAtHour([sameNight], evening, { minDays: 1 })[0]).toMatchObject({ days: 1, hits: 2 });
  });

  it("ranks by distinct DAYS before total logs", () => {
    const spread = food("Spread", [at(15, 21, 0), at(16, 21, 0), at(17, 21, 0)]);
    const bunched = food("Bunched", [at(18, 21, 0), at(18, 21, 5), at(18, 21, 10), at(19, 21, 0)]);
    const out = usualAtHour([bunched, spread], evening);
    expect(out.map((h) => h.item.name)).toEqual(["Spread", "Bunched"]);
  });

  it("counts a 23:45 habit at 00:15 — the clock rolling over is not a change of habit", () => {
    const midnight = new Date(2026, 7, 21, 0, 15).getTime();
    const lateSnack = food("Skyr", [at(18, 23, 45), at(19, 23, 50)]);
    expect(usualAtHour([lateSnack], midnight)).toHaveLength(1);
  });

  it("excludes a food eaten at the opposite end of the day", () => {
    const breakfast = food("Owsianka", [at(17, 7, 30), at(18, 7, 45), at(19, 7, 40)]);
    expect(usualAtHour([breakfast], evening)).toEqual([]);
  });

  it("honours the window width", () => {
    const twoHoursOff = food("Ryż", [at(18, 19, 0), at(19, 19, 0)]);
    expect(usualAtHour([twoHoursOff], evening)).toEqual([]);
    expect(usualAtHour([twoHoursOff], evening, { windowMinutes: 180 })).toHaveLength(1);
  });

  it("is a greeting, not a search result — it stays short", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      food(`Food ${i}`, [at(17, 21, 0), at(18, 21, 0)]));
    expect(usualAtHour(many, evening)).toHaveLength(4);
    expect(usualAtHour(many, evening, { limit: 2 })).toHaveLength(2);
  });

  it("breaks a dead tie on the caller's own order, which is the MRU", () => {
    const a = food("A", [at(18, 21, 0), at(19, 21, 0)]);
    const b = food("B", [at(18, 21, 0), at(19, 21, 0)]);
    expect(usualAtHour([b, a], evening).map((h) => h.item.name)).toEqual(["B", "A"]);
  });
});
