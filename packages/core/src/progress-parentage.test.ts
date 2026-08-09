import { describe, it, expect } from "vitest";
import { activitySummary, resolveActivityRange } from "./activity-window";
import { parentageDuration, progressParentage } from "./progress-parentage";
import { enduranceLanes } from "./endurance-lanes";
import { exerciseWidgetCards, movementsTrained } from "./exercise-widget";
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

  it("the sports' denominator is the ENDURANCE section's time, not the whole week's", () => {
    // The tiles sit under the endurance summary card now, so quoting a
    // lifting-inclusive total beside a card printing endurance time alone
    // would contradict the card directly above them.
    const p = progressParentage(SESSIONS, { now: NOW });
    // 60 running (the 50-minute block plus the run session's 10 minutes of
    // leftover wall-clock, which lands on its only activity) + 90 tennis.
    expect(p.enduranceMinutes).toBe(150);
    expect(p.enduranceMinutes).toBeLessThan(p.totalMinutes);
    expect(p.sportMinutes).toBeLessThanOrEqual(p.enduranceMinutes);
  });

  it("keeps last week's training out of this week's quotes", () => {
    const p = progressParentage(SESSIONS, { now: NOW });
    expect(p.tonnageKg).toBe(240); // 100 + 140; the 500 kg session is outside the week
    expect(p.distanceKm).toBe(10); // the 30 km long run is outside the week
  });

  it("parentageDuration prints canonical minutes as hours and minutes", () => {
    expect(parentageDuration(90)).toBe("1h 30min");
    expect(parentageDuration(0)).toBe("0min");
    expect(parentageDuration(125)).toBe("2h 5min");
  });
});

/**
 * THE RECONCILIATION, AS AN ASSERTION.
 *
 * Wave 3 proved the rails and the This-week card agreed by PRINTING the card's
 * figure in each rail's head. That is a guarantee the athlete is asked to audit
 * — and, quoted whole, it was indistinguishable from a restatement, which is
 * what the exercises and endurance heads were retired for. The guarantee itself
 * is worth keeping; it just belongs in CI rather than in a label.
 *
 * So these tests assert directly what the labels used to claim: the lanes' own
 * weekly distance sums to the card's KM column, and the movements the rail
 * draws from are the ones behind its tonnage column. If a future change makes
 * a rail and the card disagree, this fails instead of a user noticing.
 */
describe("the rails reconcile with the card — the parentage, asserted (R2)", () => {
  it("the lanes' this-week distance sums to the verdict's KM column", () => {
    const lanes = enduranceLanes(SESSIONS, { now: NOW });
    const laneKm = lanes.reduce((n, l) => n + l.thisWeek.km, 0);
    const p = progressParentage(SESSIONS, { now: NOW });
    expect(laneKm).toBeCloseTo(p.distanceKm, 5);
  });

  it("a sport is never counted by BOTH the lanes and the sports' hours share", () => {
    // ENDURANCE_DISCIPLINES excludes "sport", so the tennis match feeds the
    // sports share and no lane. The two decompositions must not overlap.
    const lanes = enduranceLanes(SESSIONS, { now: NOW });
    expect(lanes.some((l) => l.discipline === "sport")).toBe(false);
    const p = progressParentage(SESSIONS, { now: NOW });
    expect(p.sportMinutes).toBe(90);
  });

  it("every movement the rail can draw was trained inside the rail's own window", () => {
    const cards = exerciseWidgetCards(SESSIONS, { now: NOW });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(movementsTrained(SESSIONS, NOW));
  });

  it("with the lanes on screen, no auto-filled card shares a discipline with one (A2)", () => {
    const lanes = enduranceLanes(SESSIONS, { now: NOW });
    const owned = new Set(lanes.map((l) => l.discipline));
    expect(owned.size).toBeGreaterThan(0);
    const cards = exerciseWidgetCards(SESSIONS, { now: NOW, deferToLanes: true });
    for (const c of cards) expect(c.discipline == null || !owned.has(c.discipline)).toBe(true);
    // Without deferring, the same log DOES surface the running card — which is
    // the duplication, and why Today passes deferToLanes.
    const undeferred = exerciseWidgetCards(SESSIONS, { now: NOW });
    expect(undeferred.some((c) => c.discipline === "running")).toBe(true);
  });

  it("an explicit favourite outranks the de-duplication rule", () => {
    const cards = exerciseWidgetCards(SESSIONS, { now: NOW, deferToLanes: true, favourites: ["Easy run"] });
    expect(cards.some((c) => c.name === "Easy run")).toBe(true);
  });
});
