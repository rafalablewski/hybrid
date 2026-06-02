import { describe, it, expect } from "vitest";
import { weeksUntil, optimizeForEvent } from "./index";

const iso = (daysFromBase: number, base = "2026-01-01T00:00:00.000Z") =>
  new Date(new Date(base).getTime() + daysFromBase * 86400000).toISOString();

describe("weeksUntil", () => {
  it("counts whole weeks to the event", () => {
    expect(weeksUntil(iso(70), iso(0))).toBe(10);
    expect(weeksUntil(iso(3), iso(0))).toBe(1); // rounds up, min 1
  });
  it("never returns less than 1", () => {
    expect(weeksUntil(iso(-30), iso(0))).toBe(1);
  });
});

describe("optimizeForEvent", () => {
  it("fits the macrocycle to the weeks available and projects a form curve", () => {
    const plan = optimizeForEvent("Hyrox", iso(70), iso(0));
    expect(plan.weeksToEvent).toBe(10);
    expect(plan.macro.eventInWeeks).toBe(10);
    expect(plan.series.length).toBe(plan.macro.totalWeeks);
    for (const p of plan.series) {
      expect(typeof p.form).toBe("number");
      expect(p.load).toBeGreaterThanOrEqual(0);
    }
  });

  it("lands the form peak on (or near) the event after the taper", () => {
    const plan = optimizeForEvent("Triathlon", iso(84), iso(0));
    const lastWeek = plan.series[plan.series.length - 1]!.week;
    expect(plan.peakWeek).toBeGreaterThanOrEqual(lastWeek - 1);
    expect(plan.landsPeak).toBe(true);
    // form at the event should beat the mid-plan grind
    const mid = plan.series[Math.floor(plan.series.length / 2)]!.form;
    expect(plan.formAtEvent).toBeGreaterThan(mid);
  });

  it("works for strength-model goals too", () => {
    const plan = optimizeForEvent("Powerlifting", iso(112), iso(0));
    expect(plan.series.length).toBeGreaterThan(0);
    expect(plan.macro.model).toBe("Strength model");
  });
});
