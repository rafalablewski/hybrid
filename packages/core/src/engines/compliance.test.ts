import { describe, it, expect } from "vitest";
import { computeCompliance } from "./compliance";
import { dailyChecklist } from "./habits";
import type { LoggedSession } from "./session";
import type { Signal } from "./signals";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-03T12:00:00.000Z");
const ago = (n: number) => new Date(NOW - n * DAY).toISOString();
const s = (id: string, daysAgo: number): LoggedSession => ({
  id, title: "S", startedAt: ago(daysAgo),
  blocks: [{ kind: "strength", name: "Back Squat", sets: [{ load: "100", reps: "5" }] }],
});

describe("compliance (planned vs actual)", () => {
  it("is on-plan when the weekly target is met", () => {
    const c = computeCompliance([s("a", 0), s("b", 2), s("c", 4)], { targetPerWeek: 3, now: NOW });
    expect(c.completedThisWeek).toBe(3);
    expect(c.pct).toBe(100);
    expect(c.status).toBe("on-plan");
  });

  it("is under when below target", () => {
    const c = computeCompliance([s("a", 1)], { targetPerWeek: 3, now: NOW });
    expect(c.status).toBe("under");
    expect(c.pct).toBe(Math.round((1 / 3) * 100));
  });

  it("counts a streak of compliant weeks (≥80% of target)", () => {
    const sess: LoggedSession[] = [];
    let i = 0;
    // 3 sessions in each of the last 3 weeks
    for (let w = 0; w < 3; w++) for (let k = 0; k < 3; k++) sess.push(s(`x${i++}`, w * 7 + k));
    const c = computeCompliance(sess, { targetPerWeek: 3, weeks: 4, now: NOW });
    expect(c.compliantWeeks).toBeGreaterThanOrEqual(3);
    expect(c.weekly).toHaveLength(4);
  });

  it("reports no-plan when target is zero", () => {
    expect(computeCompliance([], { targetPerWeek: 0, now: NOW }).status).toBe("no-plan");
  });
});

describe("daily checklist (rings)", () => {
  it("reflects what was done today", () => {
    const sessions = [s("a", 0)];
    const signals: Signal[] = [
      { athleteId: "u", kind: "energyIntake", value: 2000, unit: "kcal", source: "manual", ts: ago(0) },
      { athleteId: "u", kind: "hrv", value: 60, unit: "ms", source: "manual", ts: ago(0) },
    ];
    const c = dailyChecklist(sessions, signals, NOW);
    expect(c).toMatchObject({ trained: true, nutritionLogged: true, checkedIn: true, done: 3, total: 3 });
  });

  it("is empty when nothing logged today", () => {
    const c = dailyChecklist([s("a", 2)], [], NOW);
    expect(c.done).toBe(0);
  });
});
