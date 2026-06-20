import { describe, it, expect } from "vitest";
import { computeAchievements, longestWeekStreak } from "./achievements";
import type { LoggedSession } from "./session";

const session = (id: string, daysAgo: number, blocks: LoggedSession["blocks"]): LoggedSession => ({
  id,
  title: "S",
  startedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  blocks,
});

const squat = (load: number, reps: number) => ({ kind: "strength" as const, name: "Back Squat", sets: [{ load: String(load), reps: String(reps) }] });
const run = (km: number) => ({ kind: "cardio" as const, name: "Run", distance: km, minutes: km * 5 });

describe("longestWeekStreak", () => {
  it("counts consecutive weeks with sessions", () => {
    const s = [session("a", 0, [squat(100, 5)]), session("b", 7, [squat(100, 5)]), session("c", 14, [squat(100, 5)]), session("d", 40, [squat(100, 5)])];
    expect(longestWeekStreak(s)).toBe(3);
  });
  it("is 0 with no sessions", () => {
    expect(longestWeekStreak([])).toBe(0);
  });
});

describe("computeAchievements", () => {
  it("returns no earned badges for an empty history", () => {
    const a = computeAchievements([]);
    expect(a.every((x) => !x.earned)).toBe(true);
  });

  it("earns a strength club when an e1RM clears a tier, earned-first", () => {
    // 150x3 → e1RM well above 140 but below 180.
    const a = computeAchievements([session("a", 1, [squat(150, 3)])]);
    const strength = a.filter((x) => x.id.startsWith("strength-"));
    const earned = strength.find((x) => x.earned);
    const locked = strength.find((x) => !x.earned);
    expect(earned?.id).toBe("strength-140");
    expect(locked?.id).toBe("strength-180");
    expect(locked?.progress).toBeGreaterThan(0);
    expect(locked?.progress).toBeLessThan(1);
    // earned badges sort ahead of locked ones
    const firstLocked = a.findIndex((x) => !x.earned);
    const lastEarned = a.map((x) => x.earned).lastIndexOf(true);
    expect(lastEarned).toBeLessThan(firstLocked);
  });

  it("tracks the furthest run", () => {
    const a = computeAchievements([session("a", 1, [run(12)])]);
    const earnedRun = a.find((x) => x.id === "run-10");
    expect(earnedRun?.earned).toBe(true);
    expect(earnedRun?.detail).toContain("12");
  });
});
