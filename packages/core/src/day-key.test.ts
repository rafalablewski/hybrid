import { describe, it, expect } from "vitest";
import { localDayKey, localTodayKey, localMidnightMs, addLocalDays, localMondayMs, dayKeyDiff } from "./day-key";

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

describe("dayKeyDiff", () => {
  it("diffs day labels in whole days, timezone-free", () => {
    expect(dayKeyDiff("2026-07-13", "2026-07-16")).toBe(3);
    expect(dayKeyDiff("2026-07-16", "2026-07-13")).toBe(-3);
    expect(dayKeyDiff("2026-12-31", "2027-01-01")).toBe(1);
  });
});
