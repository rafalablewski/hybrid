import { describe, it, expect } from "vitest";
import { activitySummary, resolveActivityRange } from "./activity-window";
import { parentageHours, progressParentage } from "./progress-parentage";
import { addLocalDays } from "./day-key";
import type { LoggedSession, SessionBlock } from "./engines/session";

// Wednesday 29 July 2026, local noon — the same midweek anchor the
// activity-window tests use, so "this week" has days behind it and ahead.
const NOW = new Date(2026, 6, 29, 12, 0, 0).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const at = (daysAgo: number) => addLocalDays(NOW, -daysAgo);

function session(id: string, daysAgo: number, blocks: SessionBlock[], minutes: number | null = 60): LoggedSession {
  const started = at(daysAgo);
  return {
    id,
    title: id,
    startedAt: iso(started),
    completedAt: minutes == null ? null : iso(started + minutes * 60000),
    blocks,
  } as LoggedSession;
}

const lift = (kg: number): SessionBlock =>
  ({ kind: "strength", name: "Deadlift", sets: [{ load: String(kg), reps: "1" }] });
const cardio = (name: string, discipline: string, minutes: number, distance?: number): SessionBlock =>
  ({ kind: "cardio", name, discipline, minutes, distance } as SessionBlock);

const SESSIONS: LoggedSession[] = [
  session("lift", 1, [lift(100), lift(140)]),
  session("run", 2, [cardio("Easy run", "running", 50, 10)]),
  session("tennis", 1, [cardio("Tennis", "sport", 90)], 90),
  // Outside the Mon–Sun week — must not leak into any quoted figure.
  session("old", 10, [lift(500), cardio("Long run", "running", 120, 30)]),
];

describe("progressParentage", () => {
  it("quotes the EXACT verdict columns — same summary, same week range", () => {
    const p = progressParentage(SESSIONS, { now: NOW });
    const sum = activitySummary(SESSIONS, resolveActivityRange("week", NOW));
    expect(p.tonnageKg).toBe(sum.totals.tonnage);
    expect(p.distanceKm).toBe(sum.totals.distance);
    expect(p.totalMinutes).toBe(sum.totals.hours);
  });

  it("splits the sports' share of the hours column, and only that share", () => {
    const p = progressParentage(SESSIONS, { now: NOW });
    expect(p.sportMinutes).toBe(90);
    expect(p.sportMinutes).toBeLessThan(p.totalMinutes);
    // The sport share reconciles with the hours detail's own sport groups.
    const sum = activitySummary(SESSIONS, resolveActivityRange("week", NOW));
    const sportShare = sum.details.hours.groups.filter((g) => g.kind === "sport").reduce((n, g) => n + g.value, 0);
    expect(p.sportMinutes).toBe(sportShare);
  });

  it("keeps last week's training out of this week's quotes", () => {
    const p = progressParentage(SESSIONS, { now: NOW });
    expect(p.tonnageKg).toBe(240); // 100 + 140; the 500 kg session is outside the week
    expect(p.distanceKm).toBe(10); // the 30 km long run is outside the week
  });

  it("parentageHours prints canonical minutes at one decimal", () => {
    expect(parentageHours(90)).toBe(1.5);
    expect(parentageHours(0)).toBe(0);
    expect(parentageHours(125)).toBe(2.1);
  });
});
