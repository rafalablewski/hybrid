import { describe, it, expect } from "vitest";
import { localDayKey, localTodayKey, localMidnightMs, addLocalDays, localMondayMs, dayKeyMs, dayKeyDiff, msUntilNextLocalDay } from "./day-key";

// These tests are TIMEZONE-ROBUST: fixtures are built from LOCAL date
// components (new Date(y, m, d, h)), so the expectations hold whatever TZ the
// test runner uses — including the UTC-offset environments where the old UTC
// keying and the local keying disagree.

describe("localDayKey", () => {
  it("keys a timestamp to its LOCAL calendar day", () => {
    // 23:30 local on Jul 15 — under UTC keying this rolls to Jul 16 for any
    // negative-offset zone; local keying must keep it on the 15th everywhere.
    const lateEvening = new Date(2026, 6, 15, 23, 30);
    expect(localDayKey(lateEvening)).toBe("2026-07-15");
    expect(localDayKey(lateEvening.toISOString())).toBe("2026-07-15");
    expect(localDayKey(lateEvening.getTime())).toBe("2026-07-15");
    // 00:10 local on Jul 16 stays on the 16th.
    expect(localDayKey(new Date(2026, 6, 16, 0, 10))).toBe("2026-07-16");
  });

  it("zero-pads and matches localTodayKey", () => {
    expect(localDayKey(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
    const now = new Date(2026, 6, 16, 9);
    expect(localTodayKey(now)).toBe(localDayKey(now));
  });
});

describe("localMidnightMs + addLocalDays", () => {
  it("round-trips midnight and steps whole calendar days", () => {
    const noon = new Date(2026, 6, 15, 12, 34).getTime();
    const mid = localMidnightMs(noon);
    expect(localDayKey(mid)).toBe("2026-07-15");
    expect(new Date(mid).getHours()).toBe(0);
    expect(localDayKey(addLocalDays(mid, 1))).toBe("2026-07-16");
    expect(localDayKey(addLocalDays(mid, -14))).toBe("2026-07-01");
    // preserves clock time when stepping from a non-midnight instant
    expect(new Date(addLocalDays(noon, 3)).getHours()).toBe(12);
  });

  it("stays on calendar days across the year boundary", () => {
    const dec31 = localMidnightMs(new Date(2026, 11, 31, 8).getTime());
    expect(localDayKey(addLocalDays(dec31, 1))).toBe("2027-01-01");
  });
});

describe("localMondayMs", () => {
  it("lands on the local Monday of the week", () => {
    // 2026-07-16 is a Thursday.
    const thu = new Date(2026, 6, 16, 20).getTime();
    expect(localDayKey(localMondayMs(thu))).toBe("2026-07-13");
    // A Monday maps to itself; a Sunday maps back six days.
    expect(localDayKey(localMondayMs(new Date(2026, 6, 13, 3).getTime()))).toBe("2026-07-13");
    expect(localDayKey(localMondayMs(new Date(2026, 6, 19, 23).getTime()))).toBe("2026-07-13");
  });
});

describe("dayKeyMs", () => {
  it("round-trips a key back to its own LOCAL midnight", () => {
    for (const iso of [new Date(2026, 0, 1, 9).getTime(), new Date(2026, 6, 16, 23, 30).getTime(), new Date(2026, 11, 31, 0, 5).getTime()]) {
      const key = localDayKey(iso);
      expect(dayKeyMs(key)).toBe(localMidnightMs(iso));
      expect(localDayKey(dayKeyMs(key))).toBe(key);
    }
  });

  it("is LOCAL midnight, not Date.parse's UTC midnight", () => {
    // The whole reason it exists: west of Greenwich, Date.parse("2026-08-17")
    // is the 16th at local time.
    expect(new Date(dayKeyMs("2026-08-17")).getDate()).toBe(17);
    expect(new Date(dayKeyMs("2026-08-17")).getHours()).toBe(0);
  });

  it("answers NaN for anything that is not a key, so a bad deep link is detectable", () => {
    for (const bad of ["", "nope", "2026-8-17", "2026-08-17T00:00", "20260817"]) {
      expect(Number.isNaN(dayKeyMs(bad))).toBe(true);
    }
  });
});

describe("dayKeyDiff", () => {
  it("diffs day labels in whole days, timezone-free", () => {
    expect(dayKeyDiff("2026-07-13", "2026-07-16")).toBe(3);
    expect(dayKeyDiff("2026-07-16", "2026-07-13")).toBe(-3);
    expect(dayKeyDiff("2026-12-31", "2027-01-01")).toBe(1);
  });
});

describe("msUntilNextLocalDay", () => {
  it("counts down to the next local midnight", () => {
    // 2026-07-16 22:00 local → two hours left in the day.
    const at22 = new Date(2026, 6, 16, 22, 0, 0, 0).getTime();
    expect(msUntilNextLocalDay(at22)).toBe(2 * 60 * 60 * 1000);
    // One minute before midnight → one minute.
    const at2359 = new Date(2026, 6, 16, 23, 59, 0, 0).getTime();
    expect(msUntilNextLocalDay(at2359)).toBe(60 * 1000);
  });

  it("lands exactly on the next day key, never on the current one", () => {
    for (const h of [0, 1, 9, 12, 18, 23]) {
      const now = new Date(2026, 6, 16, h, 30).getTime();
      const next = now + msUntilNextLocalDay(now);
      expect(localDayKey(next)).toBe("2026-07-17");
      // and the instant just before is still today
      expect(localDayKey(next - 1)).toBe("2026-07-16");
    }
  });

  it("is always positive, so a timer scheduled on it can't spin", () => {
    const midnight = new Date(2026, 6, 16, 0, 0, 0, 0).getTime();
    expect(msUntilNextLocalDay(midnight)).toBeGreaterThan(0);
    expect(msUntilNextLocalDay(midnight)).toBe(86_400_000);
  });

  it("crosses month and year boundaries", () => {
    const dec31 = new Date(2026, 11, 31, 23, 30).getTime();
    expect(localDayKey(dec31 + msUntilNextLocalDay(dec31))).toBe("2027-01-01");
    const jul31 = new Date(2026, 6, 31, 20, 0).getTime();
    expect(localDayKey(jul31 + msUntilNextLocalDay(jul31))).toBe("2026-08-01");
  });
});
