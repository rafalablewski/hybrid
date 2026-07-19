import { describe, expect, it } from "vitest";
import { masthead } from "./masthead";
import { addLocalDays } from "./day-key";

// A fixed local "now" — mid-afternoon so day-boundary math is unambiguous.
const NOW = new Date(2026, 6, 19, 13, 18).getTime(); // Sun 19 Jul 2026, 13:18 local

describe("masthead", () => {
  it("no viewed day (un-scrubbed screen) is today", () => {
    expect(masthead(undefined, NOW)).toEqual({ kind: "today", diffDays: 0 });
    expect(masthead(null, NOW)).toEqual({ kind: "today", diffDays: 0 });
  });

  it("any timestamp on the same local day is today", () => {
    expect(masthead(new Date(2026, 6, 19, 0, 0).getTime(), NOW).kind).toBe("today");
    expect(masthead(new Date(2026, 6, 19, 23, 59).getTime(), NOW).kind).toBe("today");
  });

  it("±1 day are yesterday / tomorrow", () => {
    expect(masthead(addLocalDays(NOW, -1), NOW)).toEqual({ kind: "yesterday", diffDays: -1 });
    expect(masthead(addLocalDays(NOW, 1), NOW)).toEqual({ kind: "tomorrow", diffDays: 1 });
  });

  it("beyond ±1 the headline is the weekday name, with the distance kept for the caption tag", () => {
    expect(masthead(addLocalDays(NOW, -2), NOW)).toEqual({ kind: "weekday", diffDays: -2 });
    expect(masthead(addLocalDays(NOW, 2), NOW)).toEqual({ kind: "weekday", diffDays: 2 });
    expect(masthead(addLocalDays(NOW, 6), NOW)).toEqual({ kind: "weekday", diffDays: 6 });
  });

  it("day math follows LOCAL calendar days, not 24h windows", () => {
    // 23:30 tonight vs 00:30 tomorrow is 1 calendar day apart though only 1h of clock.
    const lateTonight = new Date(2026, 6, 19, 23, 30).getTime();
    const earlyTomorrow = new Date(2026, 6, 20, 0, 30).getTime();
    expect(masthead(earlyTomorrow, lateTonight)).toEqual({ kind: "tomorrow", diffDays: 1 });
  });
});
