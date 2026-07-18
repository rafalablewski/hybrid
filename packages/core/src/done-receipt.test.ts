import { describe, it, expect } from "vitest";
import { doneReceipt, doneReceiptStats, stripWeekdayPrefix } from "./done-receipt";
import type { LoggedSession, SessionBlock } from "./engines/session";

const strength = (sets: number, load = "100", reps = "5"): SessionBlock => ({
  kind: "strength",
  name: "Back Squat",
  sets: Array.from({ length: sets }, () => ({ load, reps })),
});

const session = (over: Partial<LoggedSession> = {}): LoggedSession => ({
  id: "s1",
  title: "Upper + Engine",
  startedAt: "2026-07-16T10:30:00.000Z",
  completedAt: "2026-07-16T11:18:00.000Z",
  blocks: [strength(11)],
  ...over,
});

describe("doneReceipt", () => {
  it("trusts a plausible wall-clock span (48 min for 11 sets)", () => {
    const r = doneReceipt(session());
    expect(r.durationMin).toBe(48);
    expect(r.sets).toBe(11);
    expect(r.tonnageKg).toBe(11 * 100 * 5);
  });

  it("drops the duration when the span is the log, not the workout (the '1 MIN' lie)", () => {
    const r = doneReceipt(session({ completedAt: "2026-07-16T10:31:00.000Z" }));
    expect(r.durationMin).toBeNull();
    // the trustworthy figures survive
    expect(r.sets).toBe(11);
    expect(r.tonnageKg).toBeGreaterThan(0);
  });

  it("falls back to athlete-entered minutes when the span is implausible", () => {
    const r = doneReceipt(
      session({
        completedAt: "2026-07-16T10:31:00.000Z",
        blocks: [{ kind: "cardio", name: "Running", distance: 7.2, minutes: 40 }],
      }),
    );
    expect(r.durationMin).toBe(40);
    expect(r.distanceKm).toBe(7.2);
    expect(r.tonnageKg).toBe(0);
  });

  it("counts conditioning minutes as entered time", () => {
    const r = doneReceipt(
      session({
        completedAt: "2026-07-16T10:31:00.000Z",
        blocks: [{ kind: "conditioning", name: "Assault Bike", format: "EMOM", minutes: 12 }],
      }),
    );
    expect(r.durationMin).toBe(12);
  });

  it("has no duration and no finish clock without completedAt", () => {
    const r = doneReceipt(session({ completedAt: null }));
    expect(r.durationMin).toBeNull();
    expect(r.finishedClock).toBeNull();
  });

  it("stamps the local finish clock", () => {
    expect(doneReceipt(session()).finishedClock).toMatch(/\d{1,2}[:.]\d{2}/);
  });
});

describe("doneReceiptStats", () => {
  it("orders duration – volume – distance – sets, unit inside the value", () => {
    const stats = doneReceiptStats(doneReceipt(session()), "kg");
    expect(stats.map((s) => s.labelKey)).toEqual([
      "w.home.rail.duration",
      "w.home.today.volume",
      "w.home.today.sets",
    ]);
    expect(stats[0]!.value).toBe("48 min");
    expect(stats[1]!.value).toBe("5.5 t");
    expect(stats[2]!.value).toBe("11");
  });

  it("omits what it cannot vouch for instead of rendering it", () => {
    const stats = doneReceiptStats(
      doneReceipt(session({ completedAt: "2026-07-16T10:31:00.000Z" })),
      "kg",
    );
    expect(stats.map((s) => s.labelKey)).not.toContain("w.home.rail.duration");
  });
});

describe("stripWeekdayPrefix", () => {
  it("removes a leading weekday from plan-day titles", () => {
    expect(stripWeekdayPrefix("Thu, Upper + Engine")).toBe("Upper + Engine");
    expect(stripWeekdayPrefix("Saturday, Long Run")).toBe("Long Run");
  });
  it("leaves titles without the prefix untouched", () => {
    expect(stripWeekdayPrefix("Upper + Engine")).toBe("Upper + Engine");
    expect(stripWeekdayPrefix("Thruster Day")).toBe("Thruster Day");
  });
});
