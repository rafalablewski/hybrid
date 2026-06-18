import { describe, it, expect } from "vitest";
import { formatClock, buildIntervalPlan, intervalTotalSeconds, locateInterval } from "./interval";

describe("interval engine", () => {
  it("formats the clock", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(9)).toBe("00:09");
    expect(formatClock(75)).toBe("01:15");
    expect(formatClock(-5)).toBe("00:00");
  });

  it("builds a plan, dropping the trailing rest", () => {
    const plan = buildIntervalPlan({ rounds: 3, workSec: 40, restSec: 20, prepSec: 10 });
    expect(plan.map((p) => p.kind)).toEqual(["prep", "work", "rest", "work", "rest", "work"]);
    expect(intervalTotalSeconds(plan)).toBe(10 + 40 + 20 + 40 + 20 + 40);
  });

  it("omits prep when zero and rest when zero", () => {
    expect(buildIntervalPlan({ rounds: 2, workSec: 30, restSec: 0 }).map((p) => p.kind)).toEqual(["work", "work"]);
  });

  it("locates the active phase from elapsed seconds", () => {
    const plan = buildIntervalPlan({ rounds: 2, workSec: 40, restSec: 20, prepSec: 10 });
    expect(locateInterval(plan, 0)).toMatchObject({ phaseIndex: 0, remaining: 10, done: false });
    expect(locateInterval(plan, 10)).toMatchObject({ phaseIndex: 1, remaining: 40 });
    expect(locateInterval(plan, 55)).toMatchObject({ phaseIndex: 2, remaining: 15 });
    expect(locateInterval(plan, 999)).toMatchObject({ done: true });
  });
});
