import { describe, it, expect } from "vitest";
import { dayStamp, dayStampText } from "./day-stamp";

const TODAY = "2026-07-31";
const stamp = (dateKey: string, over: { done?: boolean; streakDays?: number } = {}) =>
  dayStamp({ dateKey, todayKey: TODAY, ...over });

// A t() that echoes the key, so a test asserts on the KEY plus its substitution.
const t = (k: string) => (k === "w.home.rail.stampDaysAgo" ? "{n} days ago" : k === "w.home.rail.stampStreak" ? "{n}-day streak" : k);

describe("dayStamp", () => {
  it("says how far the day is from now, not its name", () => {
    expect(stamp("2026-07-30")).toEqual({ kind: "label", labelKey: "w.home.rail.stampYesterday", n: 1 });
    expect(stamp("2026-08-01")).toEqual({ kind: "label", labelKey: "w.home.rail.stampTomorrow", n: 1 });
    expect(stamp("2026-07-28")).toEqual({ kind: "label", labelKey: "w.home.rail.stampDaysAgo", n: 3 });
    expect(stamp("2026-08-03")).toEqual({ kind: "label", labelKey: "w.home.rail.stampInDays", n: 3 });
  });

  it("falls back to the absolute date past the near window", () => {
    expect(stamp("2026-07-25")).toEqual({ kind: "label", labelKey: "w.home.rail.stampDaysAgo", n: 6 });
    expect(stamp("2026-07-24")).toEqual({ kind: "date" });
    expect(stamp("2026-08-06")).toEqual({ kind: "label", labelKey: "w.home.rail.stampInDays", n: 6 });
    expect(stamp("2026-08-07")).toEqual({ kind: "date" });
  });

  it("says 'Today' on an open day", () => {
    expect(stamp(TODAY)).toEqual({ kind: "label", labelKey: "w.home.rail.stampToday", n: 0 });
  });

  it("reports the run instead of 'Today' once the day is done", () => {
    expect(stamp(TODAY, { done: true, streakDays: 6 })).toEqual({
      kind: "label",
      labelKey: "w.home.rail.stampStreak",
      n: 6,
    });
  });

  it("stays silent on a done day with no run to report (the headline said it)", () => {
    expect(stamp(TODAY, { done: true, streakDays: 1 })).toEqual({ kind: "silent" });
    expect(stamp(TODAY, { done: true })).toEqual({ kind: "silent" });
  });

  it("does not report today's run on a past done day", () => {
    expect(stamp("2026-07-29", { done: true, streakDays: 6 })).toEqual({
      kind: "label",
      labelKey: "w.home.rail.stampDaysAgo",
      n: 2,
    });
  });

  it("renders the date for an unparseable key rather than nothing", () => {
    expect(dayStamp({ dateKey: "not-a-date", todayKey: TODAY })).toEqual({ kind: "date" });
  });
});

describe("dayStampText", () => {
  it("substitutes {n}, passes the date through, and renders silence as null", () => {
    expect(dayStampText(stamp("2026-07-28"), t, "Tue 28 Jul")).toBe("3 days ago");
    expect(dayStampText(stamp(TODAY, { done: true, streakDays: 6 }), t, "Fri 31 Jul")).toBe("6-day streak");
    expect(dayStampText(stamp("2026-06-01"), t, "Mon 1 Jun")).toBe("Mon 1 Jun");
    expect(dayStampText(stamp(TODAY, { done: true, streakDays: 1 }), t, "Fri 31 Jul")).toBeNull();
  });
});
